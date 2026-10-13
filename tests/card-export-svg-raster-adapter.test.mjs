import assert from 'node:assert/strict';
import test from 'node:test';

const {
  addPngDpiMetadata,
  rasterizeForeignObjectSvg,
  serializeSvgToDataUrl,
} = await import('../src/lib/card-export/svg-raster-adapter.ts');

function errors() {
  return {
    cancelledError: () => Object.assign(new Error('cancelled'), { code: 'cancelled' }),
    timeoutError: () => Object.assign(new Error('timeout'), { code: 'timeout' }),
  };
}

function fakeDocument() {
  return {
    defaultView: null,
    createElement() { return {}; },
  };
}

function fakeFileReaderFactory({ delayMs = 0, neverResolve = false } = {}) {
  const state = { created: 0, aborts: 0, lastReader: null };
  return {
    state,
    createFileReader() {
      state.created += 1;
      const reader = {
        result: null,
        error: null,
        onload: null,
        onerror: null,
        onabort: null,
        readAsDataURL(blob) {
          if (neverResolve) return;
          setTimeout(async () => {
            if (reader.onabort === null) return;
            reader.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
            reader.onload?.(new Event('load'));
          }, delayMs);
        },
        abort() {
          state.aborts += 1;
          reader.onabort?.(new Event('abort'));
        },
      };
      state.lastReader = reader;
      return reader;
    },
  };
}

function minimalPngBlob(width = 1, height = 1) {
  const header = new Uint8Array(33);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  writeUint32(header, 16, width);
  writeUint32(header, 20, height);
  return new Blob([header, new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
}

function writeUint32(target, offset, value) {
  target[offset] = value >>> 24;
  target[offset + 1] = value >>> 16;
  target[offset + 2] = value >>> 8;
  target[offset + 3] = value;
}

function readUint32(target, offset) {
  return ((target[offset] << 24) | (target[offset + 1] << 16) | (target[offset + 2] << 8) | target[offset + 3]) >>> 0;
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ -1) >>> 0;
}

function makeRasterDocument({ rasterBytes = new Blob(['raster'], { type: 'image/webp' }) } = {}) {
  const state = {
    image: null,
    canvas: null,
    drawCount: 0,
    clearCount: 0,
    toBlobArguments: null,
    blobCallback: null,
  };
  const document = {
    defaultView: null,
    createElement(tag) {
      if (tag === 'img') {
        const image = {
          decoding: '',
          loading: '',
          src: '',
          complete: true,
          naturalWidth: 10,
          removeAttribute(name) { if (name === 'src') this.src = ''; },
        };
        state.image = image;
        return image;
      }
      if (tag === 'canvas') {
        const context = {
          fillStyle: '',
          fillRect() {},
          drawImage() { state.drawCount += 1; },
          clearRect() { state.clearCount += 1; },
        };
        const canvas = {
          width: 0,
          height: 0,
          style: {},
          getContext() { return context; },
          toBlob(callback, type, quality) {
            state.toBlobArguments = { type, quality, width: this.width, height: this.height };
            state.blobCallback = callback;
            if (rasterBytes) setTimeout(() => callback(rasterBytes), 0);
          },
        };
        state.canvas = canvas;
        return canvas;
      }
      return {};
    },
  };
  return { document, state };
}

function rasterContext(overrides = {}) {
  return {
    width: 4,
    height: 3,
    scale: 2,
    quality: 0.94,
    type: 'image/webp',
    backgroundColor: null,
    maximumCanvasSize: 100,
    timeout: 30_000,
    dpi: null,
    drawImageCount: 0,
    drawImageInterval: 100,
    isEnable: () => false,
    ...overrides,
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('The expected async stage did not start');
}

test('SVG serialization removes invalid XML code units, keeps valid UTF-8, and preserves surrogate pairs across chunks', async () => {
  const reader = fakeFileReaderFactory();
  const source = `abcd😀\u0001\u000b\u000c\u001f\ufffe\uffff\ud800x\udc00\t\n\r`;
  let yields = 0;
  const dataUrl = await serializeSvgToDataUrl({}, {
    document: fakeDocument(),
    timeoutMs: 1000,
    ...errors(),
    serialize: () => source,
    createFileReader: reader.createFileReader,
    chunkSize: 5,
    now: () => 0,
    yieldToTask: async () => { yields += 1; },
  });
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const sanitized = Buffer.from(base64, 'base64').toString('utf8');
  assert.equal(sanitized, 'abcd😀x\t\n\r');
  assert.equal(yields, 0, 'small chunks do not schedule a browser task per chunk');
  assert.equal(reader.state.created, 1);
});

test('SVG sanitization yields at the eight millisecond work budget rather than after every chunk', async () => {
  const reader = fakeFileReaderFactory();
  let current = 0;
  let yields = 0;
  await serializeSvgToDataUrl({}, {
    document: fakeDocument(),
    timeoutMs: 1000,
    ...errors(),
    serialize: () => 'a'.repeat(40),
    createFileReader: reader.createFileReader,
    chunkSize: 8,
    now: () => { current += 2; return current; },
    yieldToTask: async () => { yields += 1; },
  });
  assert.equal(yields, 1);
  assert.equal(reader.state.created, 1);
});

test('SVG sanitization checks cancellation at each chunk and stops before FileReader', async () => {
  const controller = new AbortController();
  const reader = fakeFileReaderFactory();
  let yields = 0;
  let current = 0;
  await assert.rejects(serializeSvgToDataUrl({}, {
    document: fakeDocument(),
    signal: controller.signal,
    timeoutMs: 1000,
    ...errors(),
    serialize: () => `<svg>${'a'.repeat(64)}</svg>`,
    createFileReader: reader.createFileReader,
    chunkSize: 8,
    now: () => { current += 2; return current; },
    yieldToTask: async () => {
      yields += 1;
      controller.abort();
    },
  }), error => error.code === 'cancelled');
  assert.equal(yields, 1);
  assert.equal(reader.state.created, 0);
});

test('FileReader cancellation aborts the native read and clears its handlers', async () => {
  const controller = new AbortController();
  const reader = fakeFileReaderFactory({ neverResolve: true });
  const pending = serializeSvgToDataUrl({}, {
    document: fakeDocument(),
    signal: controller.signal,
    timeoutMs: 1000,
    ...errors(),
    serialize: () => '<svg/>',
    createFileReader: reader.createFileReader,
  });
  await waitFor(() => reader.state.created === 1);
  controller.abort();
  await assert.rejects(pending, error => error.code === 'cancelled');
  assert.equal(reader.state.aborts, 1);
  assert.equal(reader.state.lastReader.onload, null);
  assert.equal(reader.state.lastReader.onerror, null);
  assert.equal(reader.state.lastReader.onabort, null);
});

test('PNG DPI metadata inserts a valid pHYs chunk at the requested density', async () => {
  const original = minimalPngBlob(8, 9);
  const result = await addPngDpiMetadata(original, 480);
  const bytes = new Uint8Array(await result.arrayBuffer());
  assert.equal(result.type, 'image/png');
  assert.equal(bytes.length, original.size + 21);
  assert.equal(readUint32(bytes, 33), 9);
  assert.equal(Buffer.from(bytes.slice(37, 41)).toString('ascii'), 'pHYs');
  assert.equal(readUint32(bytes, 41), 18_897);
  assert.equal(readUint32(bytes, 45), 18_897);
  assert.equal(bytes[49], 1);
  assert.equal(readUint32(bytes, 50), crc32(bytes.slice(37, 50)));
  assert.deepEqual([...bytes.slice(54)], [...new Uint8Array(await original.slice(33).arrayBuffer())]);
  assert.equal(original.size, 37, 'DPI insertion does not mutate the source Blob');
});

test('staged SVG rasterization preserves dimensions, canvas cleanup, and PNG density', async () => {
  const output = minimalPngBlob(8, 9);
  const { document, state } = makeRasterDocument({ rasterBytes: output });
  let dataUrl = '';
  let svgCleared = false;
  const result = await rasterizeForeignObjectSvg({ replaceChildren() { svgCleared = true; } }, rasterContext({
    type: 'image/png',
    quality: undefined,
    dpi: 192,
  }), {
    document,
    timeoutMs: 1000,
    ...errors(),
    serialize: () => '<svg>東京</svg>',
    createFileReader: fakeFileReaderFactory().createFileReader,
    loadMedia: async image => {
      dataUrl = image.src;
      return image;
    },
  });
  const bytes = new Uint8Array(await result.arrayBuffer());
  assert.match(dataUrl, /^data:image\/svg\+xml;charset=utf-8;base64,/);
  assert.deepEqual(state.toBlobArguments, { type: 'image/png', quality: undefined, width: 8, height: 6 });
  assert.equal(state.drawCount, 1);
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
  assert.equal(state.image.src, '');
  assert.equal(svgCleared, true, 'the serialized clone is released before PNG encoding');
  assert.equal(Buffer.from(bytes.slice(37, 41)).toString('ascii'), 'pHYs');
  assert.equal(readUint32(bytes, 41), 7559);
});

test('abort during canvas.toBlob waits for the non-cancellable browser callback before cleanup', async () => {
  const controller = new AbortController();
  const { document, state } = makeRasterDocument({ rasterBytes: null });
  const pending = rasterizeForeignObjectSvg({}, rasterContext(), {
    document,
    signal: controller.signal,
    timeoutMs: 1000,
    ...errors(),
    serialize: () => '<svg/>',
    createFileReader: fakeFileReaderFactory().createFileReader,
    loadMedia: async image => image,
  });
  await waitFor(() => typeof state.blobCallback === 'function');

  let settled = false;
  void pending.finally(() => { settled = true; }).catch(() => undefined);
  controller.abort();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(settled, false);
  assert.equal(state.canvas.width, 8, 'the canvas remains alive while browser encoding is in flight');

  state.blobCallback(minimalPngBlob());
  await assert.rejects(pending, error => error.code === 'cancelled');
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
});

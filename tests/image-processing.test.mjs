import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const {
  IMAGE_PROCESSING_LIMITS,
  ImageProcessingError,
  assertSafeImageDimensions,
  inspectImageHeader,
  isImageProcessingCancelled,
  prepareImageFile,
} = await import('../src/lib/image-processing.ts');
const { getUploadErrorMessage } = await import('../src/components/editor/editor-errors.ts');

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

function jpegHeader(width, height) {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
}

function jpegWithExifOrientation(width, height, orientation) {
  const base = jpegHeader(width, height);
  const exif = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // Exif\0\0
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian TIFF, IFD0 at byte 8
    0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, // one orientation SHORT entry
    orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // value and next-IFD offset
  ]);
  const result = new Uint8Array(base.length + exif.length + 4);
  result.set(base.subarray(0, 2), 0);
  result.set([0xff, 0xe1, 0x00, exif.length + 2], 2);
  result.set(exif, 6);
  result.set(base.subarray(2), 6 + exif.length);
  return result;
}

function webpExtendedHeader(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0);
  bytes.set([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0], 12);
  bytes[20 + 4] = (width - 1) & 0xff;
  bytes[20 + 5] = ((width - 1) >> 8) & 0xff;
  bytes[20 + 6] = ((width - 1) >> 16) & 0xff;
  bytes[20 + 7] = (height - 1) & 0xff;
  bytes[20 + 8] = ((height - 1) >> 8) & 0xff;
  bytes[20 + 9] = ((height - 1) >> 16) & 0xff;
  return bytes;
}

function webpLosslessHeader(width, height) {
  const widthBits = width - 1;
  const heightBits = height - 1;
  const bytes = new Uint8Array(25);
  bytes.set([0x52, 0x49, 0x46, 0x46, 17, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0);
  bytes.set([0x56, 0x50, 0x38, 0x4c, 5, 0, 0, 0, 0x2f], 12);
  bytes[21] = widthBits & 0xff;
  bytes[22] = ((widthBits >> 8) & 0x3f) | ((heightBits & 0x03) << 6);
  bytes[23] = (heightBits >> 2) & 0xff;
  bytes[24] = (heightBits >> 10) & 0x0f;
  return bytes;
}

function isoBmffHeader(majorBrand, compatibleBrands = []) {
  const bytes = new Uint8Array(16 + compatibleBrands.length * 4);
  new DataView(bytes.buffer).setUint32(0, bytes.length, false);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  bytes.set([...majorBrand].map((character) => character.charCodeAt(0)), 8);
  compatibleBrands.forEach((brand, index) => {
    bytes.set([...brand].map((character) => character.charCodeAt(0)), 16 + index * 4);
  });
  return bytes;
}

function fakeFile(blob, name = 'Screenshot.png', type = 'image/png') {
  return {
    size: blob.size,
    name,
    type,
    slice: (...args) => blob.slice(...args),
  };
}

function replaceGlobal(name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  };
}

function installCanvasImageEnvironment(encode, dimensions = { width: 320, height: 320 }) {
  const canvases = [];
  let encodingCanvas = null;
  let bitmapCloseCount = 0;
  const context = {
    clearRect() {},
    drawImage() {},
    getImageData(_x, _y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let index = 3; index < data.length; index += 4) data[index] = 255;
      return { data, width, height };
    },
  };
  const documentRestore = replaceGlobal('document', {
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob(callback, mimeType, quality) {
          encodingCanvas = canvas;
          encode({ callback, mimeType, quality, canvas, canvasIndex: canvases.length - 1 });
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  const bitmapRestore = replaceGlobal('createImageBitmap', async () => ({
    width: dimensions.width,
    height: dimensions.height,
    close() { bitmapCloseCount++; },
  }));
  return {
    canvases,
    get encodingCanvas() { return encodingCanvas; },
    get bitmapCloseCount() { return bitmapCloseCount; },
    restore() { bitmapRestore(); documentRestore(); },
  };
}

function makeFileReaderMock(counts = { arrayBuffer: 0, dataUrl: 0 }) {
  return class MockFileReader {
    static EMPTY = 0;
    static LOADING = 1;
    static DONE = 2;

    readyState = MockFileReader.EMPTY;
    result = null;
    listeners = new Map();

    addEventListener(type, listener) {
      const items = this.listeners.get(type) ?? new Set();
      items.add(listener);
      this.listeners.set(type, items);
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }

    emit(type) {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ target: this });
    }

    readAsArrayBuffer(blob) {
      counts.arrayBuffer++;
      this.readyState = MockFileReader.LOADING;
      void blob.arrayBuffer().then((buffer) => {
        if (this.readyState !== MockFileReader.LOADING) return;
        this.result = buffer;
        this.readyState = MockFileReader.DONE;
        this.emit('load');
      });
    }

    readAsDataURL(blob) {
      counts.dataUrl++;
      this.readyState = MockFileReader.LOADING;
      void blob.arrayBuffer().then((buffer) => {
        if (this.readyState !== MockFileReader.LOADING) return;
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.readyState = MockFileReader.DONE;
        this.emit('load');
      });
    }

    abort() {
      if (this.readyState !== MockFileReader.LOADING) return;
      this.readyState = MockFileReader.DONE;
      this.emit('abort');
    }
  };
}

function makeControlledFileReaderMock() {
  const state = { arrayBufferReads: 0, dataUrlReads: 0, abortCalls: 0, dataReader: null };
  class ControlledFileReader {
    static EMPTY = 0;
    static LOADING = 1;
    static DONE = 2;

    readyState = ControlledFileReader.EMPTY;
    result = null;
    listeners = new Map();
    blob = null;

    addEventListener(type, listener) {
      const items = this.listeners.get(type) ?? new Set();
      items.add(listener);
      this.listeners.set(type, items);
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }

    emit(type) {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ target: this });
    }

    readAsArrayBuffer(blob) {
      state.arrayBufferReads++;
      this.readyState = ControlledFileReader.LOADING;
      void blob.arrayBuffer().then((buffer) => {
        if (this.readyState !== ControlledFileReader.LOADING) return;
        this.result = buffer;
        this.readyState = ControlledFileReader.DONE;
        this.emit('load');
      });
    }

    readAsDataURL(blob) {
      state.dataUrlReads++;
      this.blob = blob;
      this.readyState = ControlledFileReader.LOADING;
      state.dataReader = this;
    }

    completeDataUrlLate() {
      this.result = `data:${this.blob.type};base64,${Buffer.from(new Uint8Array([1, 2, 3])).toString('base64')}`;
      this.readyState = ControlledFileReader.DONE;
      this.emit('load');
    }

    abort() {
      state.abortCalls++;
      this.readyState = ControlledFileReader.DONE;
      this.emit('abort');
    }
  }
  return { Reader: ControlledFileReader, state };
}

test('recognizes supported images from binary signatures and dimensions', () => {
  assert.deepEqual(inspectImageHeader(pngHeader(3840, 2160)), {
    mimeType: 'image/png', width: 3840, height: 2160,
  });
  assert.deepEqual(inspectImageHeader(jpegHeader(1920, 1080)), {
    mimeType: 'image/jpeg', width: 1920, height: 1080,
  });
  assert.deepEqual(inspectImageHeader(jpegWithExifOrientation(3000, 2000, 6)), {
    mimeType: 'image/jpeg', width: 3000, height: 2000,
  });
  assert.deepEqual(inspectImageHeader(webpExtendedHeader(1280, 720)), {
    mimeType: 'image/webp', width: 1280, height: 720,
  });
  assert.deepEqual(inspectImageHeader(webpLosslessHeader(320, 240)), {
    mimeType: 'image/webp', width: 320, height: 240,
  });
});

test('reads VP8 dimensions from a bounded prefix of the supplied Coner WebP', async () => {
  const source = new Uint8Array(await readFile(new URL('../public/assets/samples/coner/optimized/landscape.webp', import.meta.url)));
  const prefix = source.subarray(0, IMAGE_PROCESSING_LIMITS.maxHeaderBytes);
  const chunkLength = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint32(16, true);

  assert.equal(new TextDecoder().decode(prefix.subarray(12, 16)), 'VP8 ');
  assert.ok(chunkLength > prefix.length - 20, 'the compressed VP8 payload extends beyond the bounded header read');
  assert.deepEqual(inspectImageHeader(prefix, source.length), {
    mimeType: 'image/webp', width: 3840, height: 2160,
  });
  assert.throws(
    () => inspectImageHeader(prefix, prefix.length),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
    'a RIFF container truncated before its declared end must still be rejected',
  );
  assert.throws(
    () => inspectImageHeader(prefix.subarray(0, 29), source.length),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
    'a prefix missing required VP8 frame-header bytes must be rejected',
  );
});

test('accepts large declared VP8L chunks from their dimension prefix and bounds unknown-chunk skips', () => {
  const declaredChunkLength = 1_000_000;
  const largeLossless = webpLosslessHeader(320, 240);
  const losslessView = new DataView(largeLossless.buffer, largeLossless.byteOffset, largeLossless.byteLength);
  losslessView.setUint32(4, 12 + declaredChunkLength, true);
  losslessView.setUint32(16, declaredChunkLength, true);

  assert.deepEqual(inspectImageHeader(largeLossless, 20 + declaredChunkLength), {
    mimeType: 'image/webp', width: 320, height: 240,
  });
  assert.throws(
    () => inspectImageHeader(largeLossless.subarray(0, 24), 20 + declaredChunkLength),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
    'a VP8L header without all five dimension bytes must be rejected',
  );

  const truncatedExtended = webpExtendedHeader(1280, 720).subarray(0, 29);
  assert.throws(
    () => inspectImageHeader(truncatedExtended, 30),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
    'a VP8X header without all ten dimension bytes must be rejected',
  );

  const unknown = new Uint8Array(largeLossless);
  unknown.set([0x4a, 0x55, 0x4e, 0x4b], 12);
  assert.throws(
    () => inspectImageHeader(unknown, 20 + declaredChunkLength),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
    'an unknown large chunk cannot be skipped beyond the bounded prefix',
  );
});

test('rejects empty, damaged, and truncated supported image headers', () => {
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode('not a screenshot'),
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11]),
    new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  ]) {
    assert.throws(() => inspectImageHeader(bytes), (error) => (
      error instanceof ImageProcessingError && error.code === 'invalid-image'
    ));
  }
});

test('identifies known unsupported formats instead of trusting a filename extension', () => {
  for (const bytes of [
    new TextEncoder().encode('GIF89a'),
    new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]),
    isoBmffHeader('avif'),
    isoBmffHeader('heic'),
    isoBmffHeader('mif1', ['heic']),
    isoBmffHeader('msf1', ['mif1']),
  ]) {
    assert.throws(() => inspectImageHeader(bytes), (error) => (
      error instanceof ImageProcessingError && error.code === 'unsupported'
    ));
  }
});

test('bounds decoded dimensions before image decoding and canvas allocation', () => {
  assert.doesNotThrow(() => assertSafeImageDimensions(3840, 2160));
  assert.throws(
    () => assertSafeImageDimensions(IMAGE_PROCESSING_LIMITS.maxSourceEdge + 1, 1),
    (error) => error instanceof ImageProcessingError && error.code === 'input-too-large',
  );
  assert.throws(
    () => assertSafeImageDimensions(10_000, 10_000),
    (error) => error instanceof ImageProcessingError && error.code === 'input-too-large',
  );
  assert.throws(
    () => assertSafeImageDimensions(0, 100),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
  );
  assert.ok(IMAGE_PROCESSING_LIMITS.maxHeaderBytes <= 512 * 1024);
  assert.ok(IMAGE_PROCESSING_LIMITS.maxOutputEdge <= 4096);
});

test('distinguishes upload cancellation from recoverable user input errors', () => {
  assert.equal(isImageProcessingCancelled(new ImageProcessingError('cancelled', 'cancelled')), true);
  assert.equal(isImageProcessingCancelled(new ImageProcessingError('invalid-image', 'invalid')), false);
  assert.equal(isImageProcessingCancelled(new Error('cancelled')), false);
});

test('rejects empty, spoofed, and oversized files before starting image decoding', async () => {
  await assert.rejects(
    prepareImageFile(fakeFile(new Blob([]))),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
  );
  await assert.rejects(
    prepareImageFile(fakeFile(new Blob([new TextEncoder().encode('not an image')]))),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
  );
  await assert.rejects(
    prepareImageFile(fakeFile(new Blob([new TextEncoder().encode('GIF89a')]))),
    (error) => error instanceof ImageProcessingError && error.code === 'unsupported',
  );
  await assert.rejects(
    prepareImageFile(fakeFile(new Blob([new TextEncoder().encode('truncated image')]), 'photo.heic', 'image/heic')),
    (error) => error instanceof ImageProcessingError && error.code === 'unsupported',
  );
  await assert.rejects(
    prepareImageFile(fakeFile(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), 'broken.jpg', 'image/jpeg')),
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-image',
  );

  let readAttempted = false;
  const oversizedFile = {
    size: IMAGE_PROCESSING_LIMITS.maxInputBytes + 1,
    name: 'large.png',
    type: 'image/png',
    slice() {
      readAttempted = true;
      throw new Error('Oversized files must be rejected before reading.');
    },
  };
  await assert.rejects(
    prepareImageFile(oversizedFile),
    (error) => error instanceof ImageProcessingError && error.code === 'input-too-large',
  );
  assert.equal(readAttempted, false);
});

test('cancellation interrupts a pending bounded header read', async () => {
  const controller = new AbortController();
  const file = {
    size: 8,
    name: 'pending.png',
    type: 'image/png',
    slice: () => ({ arrayBuffer: () => new Promise(() => {}) }),
  };
  const pending = prepareImageFile(file, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => isImageProcessingCancelled(error));
});

test('closes an ImageBitmap that finishes after its upload was cancelled', async () => {
  const controller = new AbortController();
  let finishDecode;
  let wasClosed = false;
  let decodeStarted = false;
  const decoderRestore = replaceGlobal('createImageBitmap', () => {
    decodeStarted = true;
    return new Promise((resolve) => { finishDecode = resolve; });
  });
  const documentRestore = replaceGlobal('document', {});
  try {
    const file = fakeFile(new Blob([pngHeader(16, 16)]));
    const pending = prepareImageFile(file, { signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(decodeStarted, true);
    controller.abort();
    await assert.rejects(pending, (error) => isImageProcessingCancelled(error));

    finishDecode({ width: 16, height: 16, close() { wasClosed = true; } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(wasClosed, true);
  } finally {
    documentRestore();
    decoderRestore();
  }
});

test('temporary object URLs are revoked after image decode success and failure', async () => {
  const createdUrls = [];
  const revokedUrls = [];
  const canvases = [];
  const context = {
    clearRect() {},
    drawImage() {},
    getImageData(_x, _y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let index = 3; index < data.length; index += 4) data[index] = 255;
      return { data, width, height };
    },
  };
  const documentRestore = replaceGlobal('document', {
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (callback, mimeType) => callback(new Blob([Uint8Array.of(1, 2, 3)], { type: mimeType })),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  const bitmapRestore = replaceGlobal('createImageBitmap', undefined);
  const urlRestore = replaceGlobal('URL', {
    createObjectURL() {
      const url = `blob:upload-test/${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectURL(url) { revokedUrls.push(url); },
  });

  try {
    const imageRestore = replaceGlobal('Image', class FakeImage {
      naturalWidth = 1600;
      naturalHeight = 900;
      width = 1600;
      height = 900;
      onload = null;
      onerror = null;
      decoding = '';
      set src(value) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    });
    try {
      // The mock Image exposes dimensions after the EXIF 90-degree rotation;
      // this verifies output sizing follows the decoder rather than raw SOF dimensions.
      const jpegFile = fakeFile(new Blob([jpegWithExifOrientation(900, 1600, 6)]), 'spoofed.png', 'image/png');
      const timings = [];
      const prepared = await prepareImageFile(jpegFile, { onTiming: (stage, durationMs) => timings.push({ stage, durationMs }) });
      assert.equal(prepared.sourceMimeType, 'image/jpeg');
      assert.equal(prepared.mimeType, 'image/jpeg');
      assert.equal(prepared.width, 1600);
      assert.equal(prepared.height, 900);
      assert.equal(prepared.imageUrl.startsWith('data:image/jpeg;'), true);
      assert.deepEqual(timings.map((item) => item.stage), ['header', 'decode', 'palette', 'draw', 'encode-jpeg', 'data-url-convert']);
      assert.equal(timings.every((item) => item.durationMs >= 0), true);
      assert.deepEqual(createdUrls, ['blob:upload-test/1']);
      assert.deepEqual(revokedUrls, ['blob:upload-test/1']);
      assert.equal(canvases[0].width, 0);
      assert.equal(canvases[0].height, 0);
    } finally {
      imageRestore();
    }

    const failedImageRestore = replaceGlobal('Image', class FakeFailedImage {
      onload = null;
      onerror = null;
      decoding = '';
      set src(value) {
        if (value) queueMicrotask(() => this.onerror?.());
      }
    });
    try {
      await assert.rejects(
        prepareImageFile(fakeFile(new Blob([jpegHeader(1600, 900)]))),
        (error) => error instanceof ImageProcessingError && error.code === 'decode-failed',
      );
      assert.deepEqual(createdUrls, ['blob:upload-test/1', 'blob:upload-test/2']);
      assert.deepEqual(revokedUrls, ['blob:upload-test/1', 'blob:upload-test/2']);
    } finally {
      failedImageRestore();
    }
  } finally {
    urlRestore();
    bitmapRestore();
    documentRestore();
  }
});

test('async canvas encode abort and timeout ignore late toBlob callbacks and release resources', async () => {
  const originalEncodeTimeout = IMAGE_PROCESSING_LIMITS.maxEncodeMs;
  for (const mode of ['abort', 'timeout']) {
    const controller = new AbortController();
    let lateCallback;
    let markEncodeStarted;
    const encodeStarted = new Promise((resolve) => { markEncodeStarted = resolve; });
    const readerCounts = { arrayBuffer: 0, dataUrl: 0 };
    const readerRestore = replaceGlobal('FileReader', makeFileReaderMock(readerCounts));
    const browser = installCanvasImageEnvironment(({ callback }) => {
      lateCallback = callback;
      markEncodeStarted();
    });
    if (mode === 'timeout') IMAGE_PROCESSING_LIMITS.maxEncodeMs = 5;

    try {
      const pending = prepareImageFile(fakeFile(new Blob([pngHeader(320, 320)])), { signal: controller.signal });
      await encodeStarted;
      if (mode === 'abort') controller.abort();
      await assert.rejects(pending, (error) => mode === 'abort'
        ? isImageProcessingCancelled(error)
        : error instanceof ImageProcessingError && error.code === 'processing-timeout');

      lateCallback(new Blob([pngHeader(1, 1)], { type: 'image/png' }));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(readerCounts.dataUrl, 0, 'late encoder callback must not start data URL conversion');
      assert.equal(browser.bitmapCloseCount, 1);
      assert.equal(browser.encodingCanvas.width, 0);
      assert.equal(browser.encodingCanvas.height, 0);
    } finally {
      IMAGE_PROCESSING_LIMITS.maxEncodeMs = originalEncodeTimeout;
      browser.restore();
      readerRestore();
    }
  }
});

test('async canvas encoder rejects a null blob and frees the processing canvas', async () => {
  const browser = installCanvasImageEnvironment(({ callback }) => callback(null));
  try {
    await assert.rejects(
      prepareImageFile(fakeFile(new Blob([pngHeader(320, 320)]))),
      (error) => error instanceof ImageProcessingError && error.code === 'canvas-unavailable',
    );
    assert.equal(browser.bitmapCloseCount, 1);
    assert.equal(browser.encodingCanvas.width, 0);
    assert.equal(browser.encodingCanvas.height, 0);
  } finally {
    browser.restore();
  }
});

test('canvas encoder converts a synchronous toBlob throw to a recoverable processing error', async () => {
  const browser = installCanvasImageEnvironment(() => {
    throw new Error('Canvas encoder unavailable.');
  });
  try {
    await assert.rejects(
      prepareImageFile(fakeFile(new Blob([pngHeader(320, 320)]))),
      (error) => error instanceof ImageProcessingError && error.code === 'canvas-unavailable',
    );
    assert.equal(browser.bitmapCloseCount, 1);
    assert.equal(browser.encodingCanvas.width, 0);
    assert.equal(browser.encodingCanvas.height, 0);
  } finally {
    browser.restore();
  }
});

test('missing canvas.toBlob reports a processing failure and releases the image and canvas', async () => {
  let bitmapCloseCount = 0;
  const canvases = [];
  const context = {
    clearRect() {},
    drawImage() {},
    getImageData(_x, _y, width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
  };
  const documentRestore = replaceGlobal('document', {
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      const canvas = { width: 0, height: 0, getContext: () => context };
      canvases.push(canvas);
      return canvas;
    },
  });
  const bitmapRestore = replaceGlobal('createImageBitmap', async () => ({
    width: 320,
    height: 320,
    close() { bitmapCloseCount++; },
  }));

  try {
    await assert.rejects(
      prepareImageFile(fakeFile(new Blob([pngHeader(320, 320)]))),
      (error) => error instanceof ImageProcessingError && error.code === 'canvas-unavailable',
    );
    assert.equal(bitmapCloseCount, 1);
    assert.equal(canvases[0].width, 0);
    assert.equal(canvases[0].height, 0);
  } finally {
    bitmapRestore();
    documentRestore();
  }
});

test('FileReader converts async encoded blobs and preserves the browser MIME fallback', async () => {
  const counts = { arrayBuffer: 0, dataUrl: 0 };
  const readerRestore = replaceGlobal('FileReader', makeFileReaderMock(counts));
  const requestedTypes = [];
  const browser = installCanvasImageEnvironment(({ callback, mimeType }) => {
    requestedTypes.push(mimeType);
    // Simulate a browser that does not support WebP encoding and returns PNG.
    callback(new Blob([pngHeader(1, 1)], { type: 'image/png' }));
  });
  try {
    const file = fakeFile(new Blob([webpExtendedHeader(320, 320)]), 'source.webp', 'image/webp');
    const prepared = await prepareImageFile(file);
    assert.deepEqual(requestedTypes, ['image/webp']);
    assert.equal(counts.arrayBuffer, 1);
    assert.equal(counts.dataUrl, 1);
    assert.equal(prepared.sourceMimeType, 'image/webp');
    assert.equal(prepared.mimeType, 'image/png');
    assert.equal(prepared.imageUrl.startsWith('data:image/png;base64,'), true);
  } finally {
    browser.restore();
    readerRestore();
  }
});

test('PNG storage budget compares the actual WebP data URL and only chooses it when shorter', async () => {
  const file = fakeFile(new Blob([pngHeader(320, 320)]));
  const options = { maxDimension: 320, minDimension: 320, maxDataUrlCharacters: 100_000 };
  const requestedTypes = [];
  const browser = installCanvasImageEnvironment(({ callback, mimeType, quality }) => {
    requestedTypes.push({ mimeType, quality });
    const size = mimeType === 'image/png' ? 90_000 : 1_000;
    callback(new Blob([new Uint8Array(size)], { type: mimeType }));
  });
  try {
    const prepared = await prepareImageFile(file, options);
    assert.deepEqual(requestedTypes, [
      { mimeType: 'image/png', quality: 0.9 },
      { mimeType: 'image/webp', quality: 0.9 },
    ]);
    assert.equal(prepared.mimeType, 'image/webp');
    assert.equal(prepared.imageUrl.startsWith('data:image/webp;base64,'), true);
    assert.ok(prepared.imageUrl.length <= options.maxDataUrlCharacters);
  } finally {
    browser.restore();
  }

  const unsupportedTypes = [];
  const fallbackBrowser = installCanvasImageEnvironment(({ callback, mimeType }) => {
    unsupportedTypes.push(mimeType);
    // Unsupported WebP falls back to an equal-size PNG. It must not win a tie.
    callback(new Blob([new Uint8Array(90_000)], { type: 'image/png' }));
  });
  try {
    await assert.rejects(
      prepareImageFile(file, options),
      (error) => error instanceof ImageProcessingError && error.code === 'storage-budget',
    );
    assert.deepEqual(unsupportedTypes, ['image/png', 'image/webp']);
  } finally {
    fallbackBrowser.restore();
  }
});

test('FileReader abort and timeout abort the reader and ignore late load events', async () => {
  const originalReadTimeout = IMAGE_PROCESSING_LIMITS.maxDataUrlReadMs;
  for (const mode of ['abort', 'timeout']) {
    const controller = new AbortController();
    const readerMock = makeControlledFileReaderMock();
    const readerRestore = replaceGlobal('FileReader', readerMock.Reader);
    const browser = installCanvasImageEnvironment(({ callback, mimeType }) => callback(new Blob([pngHeader(1, 1)], { type: mimeType })));
    if (mode === 'timeout') IMAGE_PROCESSING_LIMITS.maxDataUrlReadMs = 5;
    let returnedImage;
    let finalError;

    try {
      const pending = prepareImageFile(fakeFile(new Blob([pngHeader(320, 320)])), {
        ...(mode === 'abort' ? { signal: controller.signal } : {}),
      }).then((image) => { returnedImage = image; return image; }, (error) => { finalError = error; throw error; });
      while (!readerMock.state.dataReader) await new Promise((resolve) => setImmediate(resolve));
      const dataReader = readerMock.state.dataReader;
      if (mode === 'abort') controller.abort();
      await assert.rejects(pending, (error) => error instanceof ImageProcessingError && error.code === (mode === 'abort' ? 'cancelled' : 'processing-timeout'));
      assert.equal(readerMock.state.arrayBufferReads, 1);
      assert.equal(readerMock.state.dataUrlReads, 1);
      assert.equal(readerMock.state.abortCalls, 1);

      dataReader.completeDataUrlLate();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(finalError.code, mode === 'abort' ? 'cancelled' : 'processing-timeout');
      assert.equal(returnedImage, undefined, 'late FileReader load must not return an image for store replacement');
      assert.equal(browser.bitmapCloseCount, 1);
      assert.equal(browser.encodingCanvas.width, 0);
      assert.equal(browser.encodingCanvas.height, 0);
    } finally {
      IMAGE_PROCESSING_LIMITS.maxDataUrlReadMs = originalReadTimeout;
      browser.restore();
      readerRestore();
    }
  }
});

test('Node data URL fallback base64 pads one-byte and two-byte blobs correctly', async () => {
  const readerRestore = replaceGlobal('FileReader', undefined);
  const blobs = [Uint8Array.of(0), Uint8Array.of(0, 0)];
  let encodeIndex = 0;
  const browser = installCanvasImageEnvironment(({ callback, mimeType }) => {
    callback(new Blob([blobs[encodeIndex++]], { type: mimeType }));
  });
  try {
    const file = fakeFile(new Blob([pngHeader(320, 320)]));
    const oneByte = await prepareImageFile(file);
    const twoBytes = await prepareImageFile(file);
    assert.equal(oneByte.imageUrl, 'data:image/png;base64,AA==');
    assert.equal(twoBytes.imageUrl, 'data:image/png;base64,AAA=');
  } finally {
    browser.restore();
    readerRestore();
  }
});

test('processing timeout uses localized retry copy while size, budget and invalid copy stay mapped', () => {
  assert.match(getUploadErrorMessage('processing-timeout', 'ko'), /현재 카드는 유지됩니다\. 다시 시도/);
  assert.match(getUploadErrorMessage('processing-timeout', 'en'), /current card is kept\. Please try again/);
  assert.match(getUploadErrorMessage('processing-timeout', 'ja'), /現在のカードは保持されます。もう一度お試しください/);
  assert.match(getUploadErrorMessage('input-too-large', 'en'), /24MB/);
  assert.match(getUploadErrorMessage('storage-budget', 'en'), /Choose a smaller image/);
  assert.equal(getUploadErrorMessage('invalid-image', 'en'), 'The image could not be read. Choose a valid PNG, JPG, or WebP file and try again.');
  assert.equal(getUploadErrorMessage('decode-failed', 'ko'), getUploadErrorMessage('invalid-image', 'ko'));
  assert.match(getUploadErrorMessage('unsupported', 'ko'), /HEIC\/HEIF.*JPG/);
  assert.match(getUploadErrorMessage('unsupported', 'en'), /HEIC\/HEIF.*JPG/);
  assert.match(getUploadErrorMessage('unsupported', 'ja'), /HEIC\/HEIF.*JPG/);
  assert.match(getUploadErrorMessage('canvas-unavailable', 'ko'), /다른 최신 브라우저/);
  assert.match(getUploadErrorMessage('canvas-unavailable', 'en'), /current browser/);
  assert.match(getUploadErrorMessage('canvas-unavailable', 'ja'), /別ブラウザー/);
});

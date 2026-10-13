import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);
register('./modern-screenshot-filter-loader.mjs', import.meta.url);

const { renderCardBlob } = await import('../src/lib/card-export/index.ts');

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return new Blob([bytes], { type: 'image/png' });
}

function webpHeader(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes[24] = encodedWidth & 0xff;
  bytes[25] = (encodedWidth >> 8) & 0xff;
  bytes[26] = (encodedWidth >> 16) & 0xff;
  bytes[27] = encodedHeight & 0xff;
  bytes[28] = (encodedHeight >> 8) & 0xff;
  bytes[29] = (encodedHeight >> 16) & 0xff;
  return new Blob([bytes], { type: 'image/webp' });
}

function rasterPng(width, height) {
  const bytes = Buffer.alloc(37);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return new Blob([bytes], { type: 'image/png' });
}

function createRendererDocument() {
  return {
    defaultView: null,
    body: {
      appendChild(iframe) {
        iframe.contentDocument = {
          URL: 'about:blank',
          body: {},
          readyState: 'complete',
        };
      },
    },
    createElement(tag) {
      if (tag !== 'iframe') return { getContext: () => ({}) };
      const listeners = new Map();
      return {
        width: '',
        height: '',
        get srcdoc() { return this._srcdoc ?? ''; },
        set srcdoc(value) {
          this._srcdoc = value;
          this.contentDocument = { URL: 'about:srcdoc', body: null, readyState: 'loading' };
          setTimeout(() => {
            this.contentDocument = {
              URL: 'about:srcdoc',
              body: { appendChild() {}, removeChild() {} },
              readyState: 'complete',
            };
            for (const listener of listeners.get('load') ?? []) listener();
          }, 2);
        },
        contentDocument: null,
        style: {},
        addEventListener(type, listener) {
          const entries = listeners.get(type) ?? new Set();
          entries.add(listener);
          listeners.set(type, entries);
        },
        removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
        remove() { this.contentDocument = null; },
      };
    },
  };
}

function createStagedRendererDocument() {
  const document = createRendererDocument();
  const originalCreateElement = document.createElement.bind(document);
  const state = { canvas: null, image: null, rasterBlob: null };
  document.defaultView = {
    XMLSerializer: class {
      serializeToString() { return '<svg xmlns="http://www.w3.org/2000/svg" />'; }
    },
    FileReader: class {
      result = null;
      error = null;
      onload = null;
      onerror = null;
      onabort = null;
      async readAsDataURL(blob) {
        this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
        this.onload?.(new Event('load'));
      }
      abort() { this.onabort?.(new Event('abort')); }
    },
  };
  document.createElement = (tag) => {
    if (tag === 'canvas') {
      const context = { fillStyle: '', fillRect() {}, drawImage() {}, clearRect() {} };
      const canvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: () => context,
        toBlob: (callback) => setTimeout(() => callback(state.rasterBlob), 0),
      };
      state.canvas = canvas;
      return canvas;
    }
    if (tag === 'img') {
      const image = {
        decoding: '',
        loading: '',
        src: '',
        removeAttribute(name) { if (name === 'src') this.src = ''; },
      };
      state.image = image;
      return image;
    }
    return originalCreateElement(tag);
  };
  return { document, state };
}

test('export waits for material preloads but filters only their holder from the rasterized clone', async () => {
  const cardSource = readFileSync(new URL('../src/components/cards/AdventurerCards.tsx', import.meta.url), 'utf8');
  assert.match(cardSource, /className=\{styles\.masterMaterial\} aria-hidden="true" data-material-preload="true"/);

  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    materialPreloadHolder: globalThis.__cardExportMaterialPreloadHolder,
    criticalPhoto: globalThis.__cardExportCriticalPhoto,
    readyPhotoFallback: globalThis.__cardExportReadyPhotoFallback,
    errorPhotoFallback: globalThis.__cardExportErrorPhotoFallback,
    decodedImageCount: globalThis.__cardExportDecodedImageCount,
    screenshotBlob: globalThis.__cardExportScreenshotBlob,
    filterObservation: globalThis.__cardExportFilterObservation,
    rendererOptions: globalThis.__cardExportRendererOptions,
    contextAutoDestruct: globalThis.__cardExportContextAutoDestruct,
    contextDestroyed: globalThis.__cardExportContextDestroyed,
    contextSandboxReady: globalThis.__cardExportContextSandboxReady,
    rendererImported: globalThis.__cardExportRendererImported,
  };
  const events = [];
  let releaseFonts;
  const fontsReady = new Promise(resolve => { releaseFonts = resolve; });
  const preloadHolder = {
    nodeType: 1,
    getAttribute(name) { return name === 'data-material-preload' ? 'true' : null; },
  };
  const criticalPhoto = {
    nodeType: 1,
    hasAttribute() { return false; },
    getAttribute() { return null; },
  };
  const photoFallback = (state) => ({
    nodeType: 1,
    hasAttribute(name) { return name === 'data-photo-print-fallback'; },
    getAttribute() { return null; },
    parentElement: {
      getAttribute(name) { return name === 'data-photo-print-state' ? state : null; },
    },
  });
  globalThis.__cardExportMaterialPreloadHolder = preloadHolder;
  globalThis.__cardExportCriticalPhoto = criticalPhoto;
  globalThis.__cardExportReadyPhotoFallback = photoFallback('ready');
  globalThis.__cardExportErrorPhotoFallback = photoFallback('error');
  globalThis.__cardExportDecodedImageCount = 0;
  globalThis.__cardExportScreenshotBlob = pngHeader(2160, 2700);
  globalThis.__cardExportFilterObservation = null;
  globalThis.__cardExportContextAutoDestruct = null;
  globalThis.__cardExportContextDestroyed = false;
  globalThis.__cardExportContextSandboxReady = false;
  globalThis.__cardExportRendererImported = false;
  globalThis.document = {
    fonts: { ready: fontsReady, status: 'loaded', forEach() {} },
  };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };

  const image = label => ({
    complete: true,
    naturalWidth: 1280,
    decode() {
      events.push(`decoded:${label}`);
      globalThis.__cardExportDecodedImageCount++;
      return Promise.resolve();
    },
  });
  const node = {
    ownerDocument: createRendererDocument(),
    querySelectorAll(selector) {
      if (selector === 'img') return [image('preload'), image('photo')];
      if (selector === '[data-optical-name]') return [];
      return [];
    },
  };

  let rendering;
  try {
    rendering = renderCardBlob(node, { design: { ratio: '4:5' } }, 'png', 2, () => {});
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events.sort(), ['decoded:photo', 'decoded:preload'], 'image decoding overlaps font readiness');
    assert.equal(globalThis.__cardExportRendererImported, true, 'the renderer chunk loads while assets settle');
    releaseFonts();

    const result = await rendering;
    assert.deepEqual(events.sort(), ['decoded:photo', 'decoded:preload']);
    assert.deepEqual([result.size.width, result.size.height], [2160, 2700]);
    assert.deepEqual(globalThis.__cardExportFilterObservation, {
      holderIncluded: false,
      photoIncluded: true,
      readyFallbackIncluded: false,
      errorFallbackIncluded: true,
      textNodeIncluded: true,
      decodedImages: 2,
    });
    assert.equal(globalThis.__cardExportContextAutoDestruct, true);
    assert.equal(globalThis.__cardExportContextDestroyed, true);
    assert.equal(globalThis.__cardExportContextSandboxReady, true);
  } finally {
    releaseFonts();
    await rendering?.catch(() => undefined);
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.materialPreloadHolder === undefined) delete globalThis.__cardExportMaterialPreloadHolder; else globalThis.__cardExportMaterialPreloadHolder = previous.materialPreloadHolder;
    if (previous.criticalPhoto === undefined) delete globalThis.__cardExportCriticalPhoto; else globalThis.__cardExportCriticalPhoto = previous.criticalPhoto;
    if (previous.readyPhotoFallback === undefined) delete globalThis.__cardExportReadyPhotoFallback; else globalThis.__cardExportReadyPhotoFallback = previous.readyPhotoFallback;
    if (previous.errorPhotoFallback === undefined) delete globalThis.__cardExportErrorPhotoFallback; else globalThis.__cardExportErrorPhotoFallback = previous.errorPhotoFallback;
    if (previous.decodedImageCount === undefined) delete globalThis.__cardExportDecodedImageCount; else globalThis.__cardExportDecodedImageCount = previous.decodedImageCount;
    if (previous.screenshotBlob === undefined) delete globalThis.__cardExportScreenshotBlob; else globalThis.__cardExportScreenshotBlob = previous.screenshotBlob;
    if (previous.filterObservation === undefined) delete globalThis.__cardExportFilterObservation; else globalThis.__cardExportFilterObservation = previous.filterObservation;
    if (previous.rendererOptions === undefined) delete globalThis.__cardExportRendererOptions; else globalThis.__cardExportRendererOptions = previous.rendererOptions;
    if (previous.contextAutoDestruct === undefined) delete globalThis.__cardExportContextAutoDestruct; else globalThis.__cardExportContextAutoDestruct = previous.contextAutoDestruct;
    if (previous.contextDestroyed === undefined) delete globalThis.__cardExportContextDestroyed; else globalThis.__cardExportContextDestroyed = previous.contextDestroyed;
    if (previous.contextSandboxReady === undefined) delete globalThis.__cardExportContextSandboxReady; else globalThis.__cardExportContextSandboxReady = previous.contextSandboxReady;
    if (previous.rendererImported === undefined) delete globalThis.__cardExportRendererImported; else globalThis.__cardExportRendererImported = previous.rendererImported;
  }
});

test('WebP export keeps the requested encoding and dimensions through the shared renderer path', async () => {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    materialPreloadHolder: globalThis.__cardExportMaterialPreloadHolder,
    criticalPhoto: globalThis.__cardExportCriticalPhoto,
    decodedImageCount: globalThis.__cardExportDecodedImageCount,
    screenshotBlob: globalThis.__cardExportScreenshotBlob,
    filterObservation: globalThis.__cardExportFilterObservation,
    rendererOptions: globalThis.__cardExportRendererOptions,
    contextAutoDestruct: globalThis.__cardExportContextAutoDestruct,
    contextDestroyed: globalThis.__cardExportContextDestroyed,
    contextSandboxReady: globalThis.__cardExportContextSandboxReady,
  };
  globalThis.__cardExportMaterialPreloadHolder = { nodeType: 1, hasAttribute: () => false, getAttribute: () => null };
  globalThis.__cardExportCriticalPhoto = { nodeType: 1, hasAttribute: () => false, getAttribute: () => null };
  globalThis.__cardExportDecodedImageCount = 0;
  globalThis.__cardExportScreenshotBlob = webpHeader(1080, 1080);
  globalThis.__cardExportContextAutoDestruct = null;
  globalThis.__cardExportContextDestroyed = false;
  globalThis.__cardExportContextSandboxReady = false;
  globalThis.document = { fonts: { ready: Promise.resolve(), forEach() {} } };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  const node = {
    ownerDocument: createRendererDocument(),
    querySelectorAll: () => [],
  };

  try {
    const result = await renderCardBlob(node, { design: { ratio: '1:1' } }, 'webp', 1, () => {});
    assert.equal(result.blob.type, 'image/webp');
    assert.deepEqual([result.size.width, result.size.height], [1080, 1080]);
    assert.deepEqual(globalThis.__cardExportRendererOptions, {
      type: 'image/webp',
      quality: 0.94,
      width: 432,
      height: 432,
      scale: 2.5,
      maximumCanvasSize: 8192,
    });
    assert.equal(globalThis.__cardExportContextAutoDestruct, true);
    assert.equal(globalThis.__cardExportContextDestroyed, true);
    assert.equal(globalThis.__cardExportContextSandboxReady, true);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.materialPreloadHolder === undefined) delete globalThis.__cardExportMaterialPreloadHolder; else globalThis.__cardExportMaterialPreloadHolder = previous.materialPreloadHolder;
    if (previous.criticalPhoto === undefined) delete globalThis.__cardExportCriticalPhoto; else globalThis.__cardExportCriticalPhoto = previous.criticalPhoto;
    if (previous.decodedImageCount === undefined) delete globalThis.__cardExportDecodedImageCount; else globalThis.__cardExportDecodedImageCount = previous.decodedImageCount;
    if (previous.screenshotBlob === undefined) delete globalThis.__cardExportScreenshotBlob; else globalThis.__cardExportScreenshotBlob = previous.screenshotBlob;
    if (previous.filterObservation === undefined) delete globalThis.__cardExportFilterObservation; else globalThis.__cardExportFilterObservation = previous.filterObservation;
    if (previous.rendererOptions === undefined) delete globalThis.__cardExportRendererOptions; else globalThis.__cardExportRendererOptions = previous.rendererOptions;
    if (previous.contextAutoDestruct === undefined) delete globalThis.__cardExportContextAutoDestruct; else globalThis.__cardExportContextAutoDestruct = previous.contextAutoDestruct;
    if (previous.contextDestroyed === undefined) delete globalThis.__cardExportContextDestroyed; else globalThis.__cardExportContextDestroyed = previous.contextDestroyed;
    if (previous.contextSandboxReady === undefined) delete globalThis.__cardExportContextSandboxReady; else globalThis.__cardExportContextSandboxReady = previous.contextSandboxReady;
  }
});

test('failed renderer work still disposes its created context after the promise settles', async () => {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    rendererError: globalThis.__cardExportRendererError,
    contextAutoDestruct: globalThis.__cardExportContextAutoDestruct,
    contextDestroyed: globalThis.__cardExportContextDestroyed,
    contextSandboxReady: globalThis.__cardExportContextSandboxReady,
  };
  globalThis.document = { fonts: { ready: Promise.resolve(), forEach() {} } };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  globalThis.__cardExportRendererError = new Error('simulated renderer failure');
  globalThis.__cardExportContextAutoDestruct = null;
  globalThis.__cardExportContextDestroyed = false;
  globalThis.__cardExportContextSandboxReady = false;
  const node = {
    ownerDocument: createRendererDocument(),
    querySelectorAll: () => [],
  };

  try {
    await assert.rejects(
      renderCardBlob(node, { design: { ratio: '1:1' } }, 'png', 1, () => {}),
      error => error.code === 'render-failed',
    );
    assert.equal(globalThis.__cardExportContextDestroyed, true);
    assert.equal(globalThis.__cardExportContextSandboxReady, true);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.rendererError === undefined) delete globalThis.__cardExportRendererError; else globalThis.__cardExportRendererError = previous.rendererError;
    if (previous.contextAutoDestruct === undefined) delete globalThis.__cardExportContextAutoDestruct; else globalThis.__cardExportContextAutoDestruct = previous.contextAutoDestruct;
    if (previous.contextDestroyed === undefined) delete globalThis.__cardExportContextDestroyed; else globalThis.__cardExportContextDestroyed = previous.contextDestroyed;
    if (previous.contextSandboxReady === undefined) delete globalThis.__cardExportContextSandboxReady; else globalThis.__cardExportContextSandboxReady = previous.contextSandboxReady;
  }
});

test('a cancelled capture holds the renderer slot and context until its real promise settles', async () => {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    rendererCall: globalThis.__cardExportRendererCall,
    contextAutoDestruct: globalThis.__cardExportContextAutoDestruct,
    contextDestroyed: globalThis.__cardExportContextDestroyed,
    contextDestroyCount: globalThis.__cardExportContextDestroyCount,
    contextSandboxReady: globalThis.__cardExportContextSandboxReady,
  };
  let resolveFirstWork;
  let markFirstStarted;
  const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });
  const firstWork = new Promise(resolve => { resolveFirstWork = resolve; });
  let rendererCalls = 0;
  globalThis.document = { fonts: { ready: Promise.resolve(), forEach() {} } };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  globalThis.__cardExportContextAutoDestruct = null;
  globalThis.__cardExportContextDestroyed = false;
  globalThis.__cardExportContextDestroyCount = 0;
  globalThis.__cardExportContextSandboxReady = false;
  globalThis.__cardExportRendererCall = () => {
    rendererCalls += 1;
    if (rendererCalls === 1) {
      markFirstStarted();
      return firstWork;
    }
    return pngHeader(1080, 1080);
  };

  const node = {
    ownerDocument: createRendererDocument(),
    querySelectorAll: () => [],
  };
  const controller = new AbortController();
  const first = renderCardBlob(node, { design: { ratio: '1:1' } }, 'png', 1, () => {}, { signal: controller.signal });
  let retry;

  try {
    await firstStarted;
    controller.abort();
    await assert.rejects(first, error => error.code === 'cancelled');
    assert.equal(globalThis.__cardExportContextDestroyCount, 0, 'the context stays alive while the renderer promise is pending');

    const retryStages = [];
    retry = renderCardBlob(node, { design: { ratio: '1:1' } }, 'png', 1, progress => retryStages.push(progress.stage));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(rendererCalls, 1, 'retry waits instead of starting an overlapping capture');
    assert.ok(retryStages.includes('waiting'));
    assert.equal(globalThis.__cardExportContextSandboxReady, true);

    resolveFirstWork(pngHeader(1080, 1080));
    const result = await retry;
    assert.deepEqual([result.size.width, result.size.height], [1080, 1080]);
    assert.equal(rendererCalls, 2);
    assert.equal(globalThis.__cardExportContextDestroyCount, 2, 'both settled contexts are disposed');
  } finally {
    resolveFirstWork(pngHeader(1080, 1080));
    await first.catch(() => undefined);
    await retry?.catch(() => undefined);
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.rendererCall === undefined) delete globalThis.__cardExportRendererCall; else globalThis.__cardExportRendererCall = previous.rendererCall;
    if (previous.contextAutoDestruct === undefined) delete globalThis.__cardExportContextAutoDestruct; else globalThis.__cardExportContextAutoDestruct = previous.contextAutoDestruct;
    if (previous.contextDestroyed === undefined) delete globalThis.__cardExportContextDestroyed; else globalThis.__cardExportContextDestroyed = previous.contextDestroyed;
    if (previous.contextDestroyCount === undefined) delete globalThis.__cardExportContextDestroyCount; else globalThis.__cardExportContextDestroyCount = previous.contextDestroyCount;
    if (previous.contextSandboxReady === undefined) delete globalThis.__cardExportContextSandboxReady; else globalThis.__cardExportContextSandboxReady = previous.contextSandboxReady;
  }
});

test('supported browsers use the staged foreignObject raster adapter and dispose its retained context', async () => {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    screenshotBlob: globalThis.__cardExportScreenshotBlob,
    foreignObjectCalls: globalThis.__cardExportForeignObjectSvgCalls,
    domToBlobCalls: globalThis.__cardExportDomToBlobCalls,
    loadedMediaCount: globalThis.__cardExportLoadedMediaCount,
    contextAutoDestruct: globalThis.__cardExportContextAutoDestruct,
    contextDestroyed: globalThis.__cardExportContextDestroyed,
    contextSandboxReady: globalThis.__cardExportContextSandboxReady,
  };
  const { document, state } = createStagedRendererDocument();
  state.rasterBlob = rasterPng(1080, 1080);
  globalThis.document = { fonts: { ready: Promise.resolve(), forEach() {} } };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  globalThis.__cardExportScreenshotBlob = state.rasterBlob;
  globalThis.__cardExportForeignObjectSvgCalls = 0;
  globalThis.__cardExportDomToBlobCalls = 0;
  globalThis.__cardExportLoadedMediaCount = 0;
  globalThis.__cardExportContextAutoDestruct = null;
  globalThis.__cardExportContextDestroyed = false;
  globalThis.__cardExportContextSandboxReady = false;
  const node = { ownerDocument: document, querySelectorAll: () => [] };

  try {
    const rendered = await renderCardBlob(node, { design: { ratio: '1:1' } }, 'png', 1, () => {});
    assert.deepEqual([rendered.size.width, rendered.size.height], [1080, 1080]);
    assert.equal(globalThis.__cardExportForeignObjectSvgCalls, 1);
    assert.equal(globalThis.__cardExportDomToBlobCalls, 0);
    assert.equal(globalThis.__cardExportLoadedMediaCount, 1);
    assert.equal(globalThis.__cardExportContextAutoDestruct, false);
    assert.equal(globalThis.__cardExportContextDestroyed, true);
    assert.equal(globalThis.__cardExportContextSandboxReady, true);
    assert.equal(state.canvas.width, 0);
    assert.equal(state.canvas.height, 0);
    assert.equal(state.image.src, '');
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.screenshotBlob === undefined) delete globalThis.__cardExportScreenshotBlob; else globalThis.__cardExportScreenshotBlob = previous.screenshotBlob;
    if (previous.foreignObjectCalls === undefined) delete globalThis.__cardExportForeignObjectSvgCalls; else globalThis.__cardExportForeignObjectSvgCalls = previous.foreignObjectCalls;
    if (previous.domToBlobCalls === undefined) delete globalThis.__cardExportDomToBlobCalls; else globalThis.__cardExportDomToBlobCalls = previous.domToBlobCalls;
    if (previous.loadedMediaCount === undefined) delete globalThis.__cardExportLoadedMediaCount; else globalThis.__cardExportLoadedMediaCount = previous.loadedMediaCount;
    if (previous.contextAutoDestruct === undefined) delete globalThis.__cardExportContextAutoDestruct; else globalThis.__cardExportContextAutoDestruct = previous.contextAutoDestruct;
    if (previous.contextDestroyed === undefined) delete globalThis.__cardExportContextDestroyed; else globalThis.__cardExportContextDestroyed = previous.contextDestroyed;
    if (previous.contextSandboxReady === undefined) delete globalThis.__cardExportContextSandboxReady; else globalThis.__cardExportContextSandboxReady = previous.contextSandboxReady;
  }
});

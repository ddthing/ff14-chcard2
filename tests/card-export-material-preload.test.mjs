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

test('export waits for material preloads but filters only their holder from the rasterized clone', async () => {
  const cardSource = readFileSync(new URL('../src/components/cards/AdventurerCards.tsx', import.meta.url), 'utf8');
  assert.match(cardSource, /className=\{styles\.masterMaterial\} aria-hidden="true" data-material-preload="true"/);

  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    materialPreloadHolder: globalThis.__cardExportMaterialPreloadHolder,
    criticalPhoto: globalThis.__cardExportCriticalPhoto,
    decodedImageCount: globalThis.__cardExportDecodedImageCount,
    screenshotBlob: globalThis.__cardExportScreenshotBlob,
    filterObservation: globalThis.__cardExportFilterObservation,
    rendererOptions: globalThis.__cardExportRendererOptions,
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
    getAttribute() { return null; },
  };
  globalThis.__cardExportMaterialPreloadHolder = preloadHolder;
  globalThis.__cardExportCriticalPhoto = criticalPhoto;
  globalThis.__cardExportDecodedImageCount = 0;
  globalThis.__cardExportScreenshotBlob = pngHeader(2160, 2700);
  globalThis.__cardExportFilterObservation = null;
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
    ownerDocument: {
      defaultView: null,
      createElement: () => ({ getContext: () => ({}) }),
    },
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
      textNodeIncluded: true,
      decodedImages: 2,
    });
  } finally {
    releaseFonts();
    await rendering?.catch(() => undefined);
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.materialPreloadHolder === undefined) delete globalThis.__cardExportMaterialPreloadHolder; else globalThis.__cardExportMaterialPreloadHolder = previous.materialPreloadHolder;
    if (previous.criticalPhoto === undefined) delete globalThis.__cardExportCriticalPhoto; else globalThis.__cardExportCriticalPhoto = previous.criticalPhoto;
    if (previous.decodedImageCount === undefined) delete globalThis.__cardExportDecodedImageCount; else globalThis.__cardExportDecodedImageCount = previous.decodedImageCount;
    if (previous.screenshotBlob === undefined) delete globalThis.__cardExportScreenshotBlob; else globalThis.__cardExportScreenshotBlob = previous.screenshotBlob;
    if (previous.filterObservation === undefined) delete globalThis.__cardExportFilterObservation; else globalThis.__cardExportFilterObservation = previous.filterObservation;
    if (previous.rendererOptions === undefined) delete globalThis.__cardExportRendererOptions; else globalThis.__cardExportRendererOptions = previous.rendererOptions;
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
  };
  globalThis.__cardExportMaterialPreloadHolder = { nodeType: 1, getAttribute: () => null };
  globalThis.__cardExportCriticalPhoto = { nodeType: 1, getAttribute: () => null };
  globalThis.__cardExportDecodedImageCount = 0;
  globalThis.__cardExportScreenshotBlob = webpHeader(1080, 1080);
  globalThis.document = { fonts: { ready: Promise.resolve(), forEach() {} } };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  const node = {
    ownerDocument: { defaultView: null, createElement: () => ({ getContext: () => ({}) }) },
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
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.materialPreloadHolder === undefined) delete globalThis.__cardExportMaterialPreloadHolder; else globalThis.__cardExportMaterialPreloadHolder = previous.materialPreloadHolder;
    if (previous.criticalPhoto === undefined) delete globalThis.__cardExportCriticalPhoto; else globalThis.__cardExportCriticalPhoto = previous.criticalPhoto;
    if (previous.decodedImageCount === undefined) delete globalThis.__cardExportDecodedImageCount; else globalThis.__cardExportDecodedImageCount = previous.decodedImageCount;
    if (previous.screenshotBlob === undefined) delete globalThis.__cardExportScreenshotBlob; else globalThis.__cardExportScreenshotBlob = previous.screenshotBlob;
    if (previous.filterObservation === undefined) delete globalThis.__cardExportFilterObservation; else globalThis.__cardExportFilterObservation = previous.filterObservation;
    if (previous.rendererOptions === undefined) delete globalThis.__cardExportRendererOptions; else globalThis.__cardExportRendererOptions = previous.rendererOptions;
  }
});

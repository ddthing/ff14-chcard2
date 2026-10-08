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
  };
  const events = [];
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
  globalThis.document = {
    fonts: { ready: Promise.resolve(), status: 'loaded', forEach() {} },
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

  try {
    const result = await renderCardBlob(node, { design: { ratio: '4:5' } }, 'png', 2, () => {});
    assert.deepEqual(events.sort(), ['decoded:photo', 'decoded:preload']);
    assert.deepEqual([result.size.width, result.size.height], [2160, 2700]);
    assert.deepEqual(globalThis.__cardExportFilterObservation, {
      holderIncluded: false,
      photoIncluded: true,
      textNodeIncluded: true,
      decodedImages: 2,
    });
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.materialPreloadHolder === undefined) delete globalThis.__cardExportMaterialPreloadHolder; else globalThis.__cardExportMaterialPreloadHolder = previous.materialPreloadHolder;
    if (previous.criticalPhoto === undefined) delete globalThis.__cardExportCriticalPhoto; else globalThis.__cardExportCriticalPhoto = previous.criticalPhoto;
    if (previous.decodedImageCount === undefined) delete globalThis.__cardExportDecodedImageCount; else globalThis.__cardExportDecodedImageCount = previous.decodedImageCount;
    if (previous.screenshotBlob === undefined) delete globalThis.__cardExportScreenshotBlob; else globalThis.__cardExportScreenshotBlob = previous.screenshotBlob;
    if (previous.filterObservation === undefined) delete globalThis.__cardExportFilterObservation; else globalThis.__cardExportFilterObservation = previous.filterObservation;
  }
});

import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const {
  CardExportError,
  withCardExportTimeout,
  waitForCardAssets,
  renderCardBlob,
  getCardExportSize,
  getCardExportBaseDimensions,
  getCardExportLogicalDimensions,
  createCardExportSnapshot,
  getCardExportFilename,
  sanitizeCardExportName,
  downloadCardBlob,
  CARD_EXPORT_MAX_PIXELS,
  CARD_EXPORT_MAX_EDGE,
} = await import('../src/lib/card-export/index.ts');
const { waitForTypographyStylesheetLoader } = await import('../src/data/fonts/load-fonts.ts');

function createFontSet(ready = Promise.resolve(), faces = []) {
  const fontSet = {
    ready,
    forEach(callback) {
      for (const face of faces) callback(face, face, fontSet);
    },
  };
  return fontSet;
}

test('capped 4x output matches rasterizer integer dimensions', () => {
  const size = getCardExportSize('4:5', 4);
  assert.deepEqual([size.width, size.height], [4195, 5243]);
  assert.equal(size.capped, true);
  assert.ok(size.width * size.height <= CARD_EXPORT_MAX_PIXELS);
  for (const ratio of ['1:1', '4:5', '3:4', '9:16', '16:9']) {
    const result = getCardExportSize(ratio, 4);
    const logical = getCardExportLogicalDimensions(ratio);
    assert.equal(result.height, Math.floor(logical.height * (result.width / logical.width)));
  }
});

test('pixel and edge caps hold immediately below, at, and above the 22MP boundary', () => {
  for (const ratio of ['1:1', '4:5', '3:4', '9:16', '16:9']) {
    const base = getCardExportBaseDimensions(ratio);
    const maxByPixels = Math.sqrt(CARD_EXPORT_MAX_PIXELS / (base.width * base.height));
    const maxByEdge = CARD_EXPORT_MAX_EDGE / Math.max(base.width, base.height);
    const boundary = Math.min(maxByPixels, maxByEdge);

    for (const requestedScale of [boundary - 0.05, boundary, boundary + 0.05]) {
      const result = getCardExportSize(ratio, requestedScale);
      assert.ok(result.width * result.height <= CARD_EXPORT_MAX_PIXELS, `${ratio}/${requestedScale}`);
      assert.ok(result.width <= CARD_EXPORT_MAX_EDGE && result.height <= CARD_EXPORT_MAX_EDGE, `${ratio}/${requestedScale}`);
    }
  }
  assert.equal(getCardExportSize('16:9', 2).capped, false);
  assert.equal(getCardExportSize('16:9', 4).capped, true);
});

test('export job snapshot pins locale, ratio, format, scale, data and nested metadata', () => {
  const source = {
    character: {
      name: 'Coner', world: 'Tonberry', dataCenter: 'Elemental', freeCompany: 'Astral',
      job: 'Red Mage', level: 100, race: 'Hyur', clan: 'Midlander', grandCompany: 'Maelstrom',
      languages: ['en'], playStyles: ['casual'], bio: 'A calm journey.', jobId: 'red-mage',
    },
    design: {
      template: 'cinematic', ratio: '4:5', layoutVariant: 'a', colorMode: 'auto', jobMotifVisible: true,
      palette: { primary: '#112233', accent: '#aabbcc', light: '#ffffff', dark: '#000000' },
      accentColor: '#aabbcc', typographyPreset: 'editorial', imagePosition: '50% 50%', imageScale: 1, effects: ['grain'],
    },
    imageUrl: 'blob:export-snapshot',
    imageAdjustments: { x: 50, y: 50, scale: 1, rotation: 0, brightness: 1, contrast: 1, saturation: 1, exposure: 0 },
  };
  const snapshot = createCardExportSnapshot(source, 'ko', 'webp', 4);

  source.character.name = 'Changed';
  source.character.languages[0] = 'ja';
  source.design.ratio = '16:9';
  source.design.effects.push('blur');
  source.design.palette.primary = '#ffffff';
  source.imageAdjustments.x = 12;

  assert.deepEqual([snapshot.locale, snapshot.format, snapshot.scale], ['ko', 'webp', 4]);
  assert.deepEqual([
    snapshot.data.character.name,
    snapshot.data.character.languages[0],
    snapshot.data.design.ratio,
    snapshot.data.design.effects.length,
    snapshot.data.design.palette.primary,
    snapshot.data.imageAdjustments.x,
  ], ['Coner', 'en', '4:5', 1, '#112233', 50]);
});

test('export waits for fonts and decoded mask images before its two paint frames', async () => {
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  let releaseFonts;
  let releaseMask;
  const events = [];
  const fontsReady = new Promise(resolve => { releaseFonts = resolve; });
  const maskReady = new Promise(resolve => { releaseMask = resolve; });
  const image = {
    complete: true,
    naturalWidth: 76,
    decode() { events.push('mask-decode'); return maskReady; },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = { fonts: createFontSet(fontsReady) };
  globalThis.requestAnimationFrame = callback => { events.push('paint'); queueMicrotask(callback); return 1; };
  try {
    let completed = false;
    const ready = waitForCardAssets({ querySelectorAll: selector => selector === 'img' ? [image] : [] }).then(() => { completed = true; });
    assert.deepEqual(events, []);
    releaseFonts();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['mask-decode']);
    assert.equal(completed, false);
    releaseMask();
    await ready;
    assert.deepEqual(events, ['mask-decode', 'paint', 'paint']);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.raf;
  }
});

test('images are decoded after their load event before export proceeds', async () => {
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  const listeners = new Map();
  let releaseDecode;
  const events = [];
  const image = {
    complete: false,
    naturalWidth: 36,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
    decode() { events.push('decode'); return new Promise(resolve => { releaseDecode = resolve; }); },
  };
  globalThis.document = { fonts: createFontSet() };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  try {
    const ready = waitForCardAssets({ querySelectorAll: selector => selector === 'img' ? [image] : [] });
    await new Promise(resolve => setImmediate(resolve));
    image.complete = true;
    listeners.get('load')();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['decode']);
    releaseDecode();
    await ready;
    assert.equal(listeners.size, 0);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.raf;
  }
});

test('export readiness follows an SVG failure to its replacement raster and decodes the replacement', async () => {
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  const listeners = new Map();
  const events = [];
  let activeImage;
  const svgImage = {
    src: '/assets/ffxiv/jobs/xivapi/svg/red-mage.svg',
    currentSrc: '/assets/ffxiv/jobs/xivapi/svg/red-mage.svg',
    complete: false,
    naturalWidth: 0,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const rasterImage = {
    src: '/assets/ffxiv/jobs/xivapi/raster/red-mage-512.png',
    currentSrc: '/assets/ffxiv/jobs/xivapi/raster/red-mage-512.png',
    complete: true,
    naturalWidth: 512,
    decode() { events.push('raster-decode'); return Promise.resolve(); },
    addEventListener() {},
    removeEventListener() {},
  };
  activeImage = svgImage;
  const node = {
    querySelectorAll(selector) {
      if (selector === 'img') return [activeImage];
      return [];
    },
  };
  globalThis.document = { fonts: createFontSet() };
  globalThis.requestAnimationFrame = callback => {
    if (activeImage === svgImage) activeImage = rasterImage;
    events.push('paint');
    queueMicrotask(callback);
    return events.length;
  };

  try {
    const ready = waitForCardAssets(node, { imageTimeoutMs: 100 });
    await new Promise(resolve => setImmediate(resolve));
    listeners.get('error')();
    await ready;
    assert.ok(events.includes('raster-decode'));
    assert.ok(events.indexOf('raster-decode') > events.indexOf('paint'));
    assert.equal(listeners.size, 0);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.raf;
  }
});

test('an SVG decode rejection waits for the raster replacement decode before export continues', async () => {
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  const events = [];
  let activeImage;
  let releaseRasterDecode;
  let rasterDecodePromise;
  let completed = false;
  const svgImage = {
    src: '/assets/ffxiv/jobs/xivapi/svg/dark-knight.svg',
    currentSrc: '/assets/ffxiv/jobs/xivapi/svg/dark-knight.svg',
    complete: true,
    naturalWidth: 1000,
    decode() {
      events.push('svg-decode-rejected');
      return Promise.reject(new Error('SVG decode failed'));
    },
  };
  const rasterImage = {
    src: '/assets/ffxiv/jobs/xivapi/raster/dark-knight-512.png',
    currentSrc: '/assets/ffxiv/jobs/xivapi/raster/dark-knight-512.png',
    complete: true,
    naturalWidth: 512,
    decode() {
      if (!rasterDecodePromise) {
        events.push('raster-decode-started');
        rasterDecodePromise = new Promise(resolve => { releaseRasterDecode = () => { events.push('raster-decode-finished'); resolve(); }; });
      }
      return rasterDecodePromise;
    },
  };
  activeImage = svgImage;
  globalThis.document = { fonts: createFontSet() };
  globalThis.requestAnimationFrame = callback => {
    if (activeImage === svgImage) activeImage = rasterImage;
    queueMicrotask(callback);
    return 1;
  };
  const node = {
    querySelectorAll(selector) {
      if (selector === 'img') return [activeImage];
      return [];
    },
  };

  try {
    const ready = waitForCardAssets(node, { imageTimeoutMs: 100 }).then(() => { completed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['svg-decode-rejected', 'raster-decode-started']);
    assert.equal(completed, false);
    releaseRasterDecode();
    await ready;
    assert.deepEqual(events, ['svg-decode-rejected', 'raster-decode-started', 'raster-decode-finished']);
    assert.equal(completed, true);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.raf;
  }
});

test('export readiness rechecks and decodes a source replacement during the final paint frames', async () => {
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  const events = [];
  let activeImage;
  let frameCount = 0;
  const svgImage = {
    src: '/assets/ffxiv/jobs/xivapi/svg/white-mage.svg',
    currentSrc: '/assets/ffxiv/jobs/xivapi/svg/white-mage.svg',
    complete: true,
    naturalWidth: 1000,
    decode() { events.push('svg-decode'); return Promise.resolve(); },
  };
  const rasterImage = {
    src: '/assets/ffxiv/jobs/xivapi/raster/white-mage-512.png',
    currentSrc: '/assets/ffxiv/jobs/xivapi/raster/white-mage-512.png',
    complete: true,
    naturalWidth: 512,
    decode() { events.push('raster-decode'); return Promise.resolve(); },
  };
  activeImage = svgImage;
  globalThis.document = { fonts: createFontSet() };
  globalThis.requestAnimationFrame = callback => {
    frameCount += 1;
    events.push(`paint-${frameCount}`);
    if (frameCount === 2) activeImage = rasterImage;
    queueMicrotask(callback);
    return frameCount;
  };
  const node = {
    querySelectorAll(selector) {
      if (selector === 'img') return [activeImage];
      return [];
    },
  };

  try {
    await waitForCardAssets(node);
    assert.ok(events.indexOf('raster-decode') > events.indexOf('paint-2'));
    assert.ok(events.indexOf('raster-decode') < events.indexOf('paint-3'));
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.raf;
  }
});

test('font readiness that never settles fails within a bounded time', async () => {
  const previous = globalThis.document;
  globalThis.document = { fonts: createFontSet(new Promise(() => {})) };
  try {
    await assert.rejects(
      waitForCardAssets({ querySelectorAll: () => [] }, { fontTimeoutMs: 8 }),
      error => error instanceof CardExportError && error.code === 'font-timeout',
    );
  } finally {
    if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
  }
});

test('missing FontFaceSet support and required font readiness failures stop export', async () => {
  const previous = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  try {
    globalThis.document = {};
    await assert.rejects(
      waitForCardAssets({ querySelectorAll: () => [] }),
      error => error instanceof CardExportError && error.code === 'font-load-failed',
    );

    globalThis.document = { fonts: {} };
    await assert.rejects(
      waitForCardAssets({ querySelectorAll: () => [] }),
      error => error instanceof CardExportError && error.code === 'font-load-failed',
    );

    globalThis.document = { fonts: { ready: Promise.reject(new Error('required font request failed')) } };
    await assert.rejects(
      waitForCardAssets({ querySelectorAll: () => [] }),
      error => error instanceof CardExportError && error.code === 'font-load-failed',
    );

    globalThis.document = {
      fonts: {
        ready: Promise.resolve(),
        forEach(callback) { callback({ family: 'Optional UI Font', status: 'error' }); },
      },
    };
    globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
    await waitForCardAssets({ querySelectorAll: () => [] });
  } finally {
    if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
  }
});

test('missing 2D canvas context fails before invoking the screenshot renderer', async () => {
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.document = { fonts: createFontSet() };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  const node = {
    ownerDocument: { createElement: () => ({ getContext: () => null }) },
    querySelectorAll: () => [],
  };
  try {
    await assert.rejects(
      renderCardBlob(node, { design: { ratio: '4:5' } }, 'png', 2, () => {}),
      error => error instanceof CardExportError && error.code === 'render-failed',
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
  }
});

test('a hanging image decode fails within a bounded time', async () => {
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.document = { fonts: createFontSet() };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  const image = { complete: true, naturalWidth: 1, decode: () => new Promise(() => {}) };
  try {
    await assert.rejects(
      waitForCardAssets({ querySelectorAll: selector => selector === 'img' ? [image] : [] }, { imageTimeoutMs: 8 }),
      error => error instanceof CardExportError && error.code === 'image-timeout',
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
  }
});

test('a rejected image decode becomes a typed recoverable image error', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { fonts: createFontSet() };
  const image = {
    complete: true,
    naturalWidth: 1,
    decode: () => Promise.reject(new Error('browser decoder details stay private')),
  };
  try {
    await assert.rejects(
      waitForCardAssets({ querySelectorAll: selector => selector === 'img' ? [image] : [] }),
      error => error instanceof CardExportError && error.code === 'image-failed' && !error.message.includes('decoder details'),
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test('export waits for optical name measurement and times out if it never completes', async () => {
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.document = { fonts: createFontSet() };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  const name = { dataset: { opticalReady: 'false' } };
  try {
    await assert.rejects(
      waitForCardAssets({ querySelectorAll: selector => selector === '[data-optical-name]' ? [name] : [] }, { opticalTimeoutMs: 8 }),
      error => error instanceof CardExportError && error.code === 'optical-timeout',
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
  }
});

test('bounded operations reject on abort and timeout with stable export error codes', async () => {
  const controller = new AbortController();
  const pending = withCardExportTimeout(new Promise(() => {}), 1_000, 'render-timeout', controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error instanceof CardExportError && error.code === 'cancelled');
  await assert.rejects(
    withCardExportTimeout(new Promise(() => {}), 8, 'renderer-timeout'),
    error => error instanceof CardExportError && error.code === 'renderer-timeout',
  );
});

test('a hanging dynamic font stylesheet import fails with a stable timeout', async () => {
  await assert.rejects(
    waitForTypographyStylesheetLoader(() => new Promise(() => {}), 8),
    error => error instanceof CardExportError && error.code === 'font-timeout',
  );
});

test('filenames preserve bounded Unicode names and remove path-breaking characters', () => {
  assert.equal(getCardExportFilename('Coner 光月', '4:5', 2, 'png'), 'Coner-光月-4x5-2x.png');
  assert.equal(getCardExportFilename('コナー・XIV!?', '16:9', 4, 'webp'), 'コナー・XIV!-16x9-4x.webp');
  assert.equal(sanitizeCardExportName(''), 'adventurer-card');
  assert.equal(sanitizeCardExportName('../../<Coner>|?:'), 'Coner');
  assert.ok(Array.from(sanitizeCardExportName('모서리'.repeat(100))).length <= 64);
  assert.ok(new TextEncoder().encode(getCardExportFilename('😀'.repeat(100), '4:5', 4, 'png')).length < 255);
});

test('download object URLs are revoked after the browser receives the anchor click', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const createObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const revokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const events = [];
  let revokeLater;
  const anchor = {
    href: '',
    download: '',
    click() { events.push('click'); },
    remove() { events.push('remove'); },
  };
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:card-test' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: value => events.push(`revoke:${value}`) });
  globalThis.document = {
    createElement: () => anchor,
    body: { appendChild() { events.push('append'); } },
  };
  globalThis.window = {
    setTimeout(callback, delay) { assert.equal(delay, 60_000); revokeLater = callback; return 1; },
  };

  try {
    downloadCardBlob(new Blob(['test']), { character: { name: 'モード' }, design: { ratio: '4:5' } }, 'png', 2);
    assert.equal(anchor.download, 'モード-4x5-2x.png');
    assert.deepEqual(events, ['append', 'click', 'remove']);
    revokeLater();
    assert.deepEqual(events, ['append', 'click', 'remove', 'revoke:blob:card-test']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (createObjectUrl) Object.defineProperty(URL, 'createObjectURL', createObjectUrl); else delete URL.createObjectURL;
    if (revokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrl); else delete URL.revokeObjectURL;
  }
});

test('object URL setup failures use the typed download error', () => {
  const previousDocument = globalThis.document;
  const createObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const anchor = { remove() {} };
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value() { throw new Error('browser details are not exposed'); },
  });
  globalThis.document = { createElement: () => anchor };

  try {
    assert.throws(
      () => downloadCardBlob(new Blob(['test']), { character: { name: 'Coner' }, design: { ratio: '4:5' } }, 'png', 2),
      error => error instanceof CardExportError && error.code === 'download-failed',
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (createObjectUrl) Object.defineProperty(URL, 'createObjectURL', createObjectUrl); else delete URL.createObjectURL;
  }
});

test('failed download clicks revoke the object URL immediately and return a typed error', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const createObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const revokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const events = [];
  const anchor = {
    href: '',
    download: '',
    click() { throw new Error('browser details are not exposed'); },
    remove() { events.push('remove'); },
  };
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:failed-test' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: value => events.push(`revoke:${value}`) });
  globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
  globalThis.window = { setTimeout() { throw new Error('revoke should be immediate on click failure'); } };

  try {
    assert.throws(
      () => downloadCardBlob(new Blob(['test']), { character: { name: 'Coner' }, design: { ratio: '4:5' } }, 'png', 2),
      error => error instanceof CardExportError && error.code === 'download-failed',
    );
    assert.deepEqual(events, ['revoke:blob:failed-test', 'remove']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (createObjectUrl) Object.defineProperty(URL, 'createObjectURL', createObjectUrl); else delete URL.createObjectURL;
    if (revokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrl); else delete URL.revokeObjectURL;
  }
});

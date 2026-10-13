import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

register('./ts-alias-loader.mjs', import.meta.url);

const {
  decodeCssContentText,
  faceUnicodeRangeMatches,
  parseCssFontSourceList,
  parseUnicodeRangeDescriptor,
  prepareCardFontCss,
  unicodeCodePointsForText,
} = await import('../src/lib/card-export/font-css.ts');
const { FONT_REGISTRY } = await import('../src/data/fonts/registry.ts');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class TestStyleDeclaration {
  constructor(entries) {
    this.values = new Map(entries);
    this.names = entries.map(([name]) => name);
    this.length = this.names.length;
  }
  item(index) { return this.names[index] ?? ''; }
  getPropertyValue(name) { return this.values.get(name) ?? ''; }
  getPropertyPriority() { return ''; }
}

class CSSFontFaceRule {
  constructor(entries, parentStyleSheet) {
    this.style = new TestStyleDeclaration(entries);
    this.parentStyleSheet = parentStyleSheet;
  }
}

function createFontExportNode(family, src) {
  const parentStyleSheet = { href: 'https://app.test/assets/cards.css' };
  const face = new CSSFontFaceRule([
    ['font-family', JSON.stringify(family)],
    ['font-style', 'normal'],
    ['font-weight', '400'],
    ['src', src],
  ], parentStyleSheet);
  const sheet = { href: parentStyleSheet.href, cssRules: [face] };
  const textElement = { tagName: 'SPAN', fontFamily: JSON.stringify(family) };
  const textNode = { nodeValue: 'A', parentElement: textElement };
  const document = {
    styleSheets: [sheet],
    location: { href: 'https://app.test/export' },
    baseURI: 'https://app.test/export',
    defaultView: {
      getComputedStyle(element, pseudo) {
        if (pseudo) return { content: 'none', fontFamily: JSON.stringify(family), textTransform: 'none' };
        return { fontFamily: element.fontFamily ?? JSON.stringify(family), textTransform: 'none' };
      },
    },
    createTreeWalker() {
      let read = false;
      return { nextNode: () => read ? null : (read = true, textNode) };
    },
  };
  return {
    ownerDocument: document,
    tagName: 'ARTICLE',
    querySelectorAll: () => [textElement],
  };
}

test('font unicode ranges support singletons, spans, and trailing wildcards', () => {
  const ranges = parseUnicodeRangeDescriptor('U+0041, U+4E00-4E02, U+304?');
  assert.deepEqual(ranges, [[0x41, 0x41], [0x4e00, 0x4e02], [0x3040, 0x304f]]);

  const glyphs = new Set([0x4e02]);
  assert.equal(faceUnicodeRangeMatches('U+4E00-4E02', glyphs), true);
  assert.equal(faceUnicodeRangeMatches('U+4E03-4E04', glyphs), false);
  assert.equal(faceUnicodeRangeMatches('U+4E0?', new Set([0x4e0f])), true);
  assert.equal(faceUnicodeRangeMatches('', glyphs), true);
});

test('unknown or malformed unicode descriptors request the safe full-font fallback', () => {
  assert.equal(parseUnicodeRangeDescriptor('U+4?E'), null);
  assert.equal(parseUnicodeRangeDescriptor('U+110000'), null);
  assert.equal(faceUnicodeRangeMatches('U+4?E', new Set([0x4e00])), null);
});

test('rendered text code points keep astral characters and replace isolated surrogates safely', () => {
  const codePoints = unicodeCodePointsForText('Coner 中 あ 한 😀 \ud800');
  assert.ok(codePoints.has('😀'.codePointAt(0)));
  assert.ok(codePoints.has(0xfffd));
  assert.ok(!codePoints.has(0xd800));
});

test('quoted pseudo content decodes CSS escapes and rejects dynamic content safely', () => {
  assert.equal(decodeCssContentText(String.raw`"Coner\0020\1F600 "`), 'Coner 😀');
  assert.equal(decodeCssContentText(String.raw`'A\'B' " / "`), "A'B / ");
  assert.equal(decodeCssContentText('normal'), '');
  assert.equal(decodeCssContentText('attr(data-label)'), null);
  assert.equal(decodeCssContentText('counter(step)'), null);
});

test('font src parsing keeps local sources and identifies WOFF2 while excluding other formats', () => {
  const sources = parseCssFontSourceList(
    'local("Noto Serif KR Variable"), url("../files/noto-serif-kr-0.woff2") format("woff2-variations"), url(./font.woff) format("woff")',
  );

  assert.deepEqual(sources?.map(({ kind }) => kind), ['local', 'woff2', 'other-url']);
  assert.equal(sources?.[1]?.kind === 'woff2' ? sources[1].format : null, 'woff2-variations');
  assert.equal(parseCssFontSourceList('url("font.woff2") format("woff2"), url("font.woff2"'), null);
});

test('font src parsing recognizes original TrueType and OpenType URLs', () => {
  const sources = parseCssFontSourceList(
    'url("../fonts/source.ttf") format("truetype"), url("../fonts/source.otf") format("opentype"), url("../fonts/source.woff2") format("woff2-variations"), url("../fonts/source.woff") format("woff")',
  );
  assert.deepEqual(sources?.map(({ kind }) => kind), ['truetype', 'opentype', 'woff2', 'other-url']);
});

test('export inlines original TrueType bytes unchanged with a TrueType data URL', async () => {
  const registeredFontAsset = Object.values(FONT_REGISTRY)
    .flatMap((entry) => (entry.localAssets ?? []).map((asset) => ({ entry, asset })))
    .find(({ asset }) => asset.format === 'truetype' && asset.bytes <= 24 * 1024 * 1024);
  // Keep the byte-preserving export test runnable while the registry has no TTF yet.
  const fontAsset = registeredFontAsset ?? {
    entry: { family: 'Geist Export Fixture' },
    asset: {
      filePath: 'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf',
      publicPath: '/fonts/geist-export-fixture.ttf',
    },
  };

  const originalBytes = await readFile(path.resolve(projectRoot, fontAsset.asset.filePath));
  const node = createFontExportNode(
    fontAsset.entry.family,
    `url(${JSON.stringify(fontAsset.asset.publicPath)}) format("truetype")`,
  );
  const originalFetch = globalThis.fetch;
  let fetchedUrl;
  globalThis.fetch = async (url, options) => {
    fetchedUrl = url;
    assert.equal(options.credentials, 'same-origin');
    return {
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => Uint8Array.from(originalBytes).buffer,
    };
  };
  try {
    const prepared = await prepareCardFontCss(node);
    assert.ok(prepared);
    assert.equal(fetchedUrl, `https://app.test${fontAsset.asset.publicPath}`);
    assert.equal(prepared.uniqueFontResourceCount, 1);
    assert.equal(prepared.inlinedBytes, originalBytes.byteLength);

    const encodedFont = prepared.cssText.match(/data:font\/ttf;base64,([^"]+)/u)?.[1];
    assert.ok(encodedFont, 'the prepared CSS must use the TrueType MIME type');
    assert.deepEqual(Buffer.from(encodedFont, 'base64'), originalBytes, 'export must preserve the original font bytes');
    assert.match(prepared.cssText, /format\("truetype"\)/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unsupported font URL formats preserve the full renderer stylesheet fallback', async () => {
  const node = createFontExportNode('Unsupported Font', 'url("./font.woff") format("woff")');
  assert.equal(await prepareCardFontCss(node), null);
});

test('font bytes that do not match their declared TrueType format fall back safely', async () => {
  const node = createFontExportNode('Mismatched Font', 'url("./font.ttf") format("truetype")');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => null },
    arrayBuffer: async () => Uint8Array.of(0x77, 0x4f, 0x46, 0x32, 1, 2, 3).buffer,
  });
  try {
    assert.equal(await prepareCardFontCss(node), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenType source bytes serialize with the OpenType MIME type', async () => {
  const node = createFontExportNode('OpenType Font', 'url("./font.otf") format("opentype")');
  const originalBytes = Uint8Array.of(0x4f, 0x54, 0x54, 0x4f, 1, 2, 3, 4);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => null },
    arrayBuffer: async () => originalBytes.slice().buffer,
  });
  try {
    const prepared = await prepareCardFontCss(node);
    assert.ok(prepared);
    const encodedFont = prepared.cssText.match(/data:font\/otf;base64,([^"]+)/u)?.[1];
    assert.ok(encodedFont);
    assert.deepEqual(Buffer.from(encodedFont, 'base64'), Buffer.from(originalBytes));
    assert.match(prepared.cssText, /format\("opentype"\)/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('font CSS preparation includes whitespace and quoted pseudo families without reordering src candidates', async () => {
  class FakeStyleDeclaration {
    constructor(entries) {
      this.values = new Map(entries);
      this.names = entries.map(([name]) => name);
      this.length = this.names.length;
    }
    item(index) { return this.names[index] ?? ''; }
    getPropertyValue(name) { return this.values.get(name) ?? ''; }
    getPropertyPriority() { return ''; }
  }
  class CSSFontFaceRule {
    constructor(entries, parentStyleSheet) {
      this.style = new FakeStyleDeclaration(entries);
      this.parentStyleSheet = parentStyleSheet;
    }
  }
  class CSSImportRule {
    constructor(styleSheet, { mediaText = '', layerName = null, supportsText = null } = {}) {
      this.styleSheet = styleSheet;
      this.media = { mediaText };
      this.layerName = layerName;
      this.supportsText = supportsText;
    }
  }

  const parentStyleSheet = { href: 'https://app.test/assets/cards.css' };
  const faceA = new CSSFontFaceRule([
    ['font-family', '"Font A"'],
    ['font-style', 'normal'],
    ['font-weight', '400'],
    ['unicode-range', 'U+0041'],
    ['src', 'url("./font-a.woff2") format("woff2"), local("Font A")'],
  ], parentStyleSheet);
  const faceB = new CSSFontFaceRule([
    ['font-family', '"Font B"'],
    ['font-style', 'normal'],
    ['font-weight', '400'],
    ['unicode-range', 'U+0020'],
    ['src', 'local("Font B"), url("./font-b.woff2") format("woff2")'],
  ], parentStyleSheet);
  const harmlessGroup = { cssRules: [{ constructor: { name: 'CSSStyleRule' } }] };
  const sheet = { href: parentStyleSheet.href, cssRules: [harmlessGroup, faceA, faceB] };
  const normalText = { tagName: 'SPAN', fontFamily: '"Font A", serif' };
  const whitespaceText = { tagName: 'SPAN', fontFamily: '"Font B", serif' };
  const textNodes = [
    { nodeValue: 'A', parentElement: normalText },
    { nodeValue: ' ', parentElement: whitespaceText },
  ];
  const document = {
    styleSheets: [sheet],
    location: { href: 'https://app.test/export' },
    baseURI: 'https://app.test/export',
    defaultView: {
      getComputedStyle(element, pseudo) {
        if (pseudo) {
          return {
            content: element === normalText && pseudo === '::before' ? '" "' : 'none',
            fontFamily: element === normalText ? '"Font B", serif' : element.fontFamily,
            textTransform: 'none',
          };
        }
        return { fontFamily: element.fontFamily ?? '"Font A", serif', textTransform: 'none' };
      },
    },
    createTreeWalker() {
      let index = 0;
      return { nextNode: () => textNodes[index++] ?? null };
    },
  };
  const node = {
    ownerDocument: document,
    tagName: 'ARTICLE',
    querySelectorAll: () => [normalText, whitespaceText],
  };

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let cacheControl = 'public, max-age=31536000, immutable';
  globalThis.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      headers: { get: name => name.toLowerCase() === 'cache-control' ? cacheControl : null },
      arrayBuffer: async () => Uint8Array.of(0x77, 0x4f, 0x46, 0x32, 1, 2, 3).buffer,
    };
  };
  try {
    const prepared = await prepareCardFontCss(node);
    assert.ok(prepared);
    assert.equal(prepared.selectedFaceCount, 2);
    assert.equal(prepared.glyphCount, 2);
    assert.match(prepared.cssText, /src: url\("data:font\/woff2;base64,[^"]+"\) format\("woff2"\), local\("Font A"\)/);
    assert.match(prepared.cssText, /src: local\("Font B"\), url\("data:font\/woff2;base64,[^"]+"\) format\("woff2"\)/);
    assert.equal(fetchCount, prepared.uniqueFontResourceCount);

    const repeated = await prepareCardFontCss(node);
    assert.equal(repeated?.cssText, prepared.cssText);
    assert.equal(fetchCount, prepared.uniqueFontResourceCount, 'immutable font bytes are reused across exports');

    faceA.style.values.set('src', 'url("./font-c.woff2") format("woff2")');
    sheet.cssRules = [faceA, faceB];
    cacheControl = '';
    const beforeUncacheableFetches = fetchCount;
    await prepareCardFontCss(node);
    await prepareCardFontCss(node);
    assert.equal(fetchCount, beforeUncacheableFetches + 2, 'mutable resources are not retained between exports');

    sheet.cssRules = [{ cssRules: [faceB] }, faceA];
    assert.equal(await prepareCardFontCss(node), null, 'conditional font faces must fall back to the original renderer scan');

    const importedStyleSheet = { href: 'https://app.test/assets/imported.css' };
    const importedFace = new CSSFontFaceRule(Array.from(faceB.style.values), importedStyleSheet);
    importedStyleSheet.cssRules = [importedFace];
    sheet.cssRules = [new CSSImportRule(importedStyleSheet, { layerName: '' })];
    assert.equal(await prepareCardFontCss(node), null, 'anonymous imported layers must preserve conditional font-face behavior');
    sheet.cssRules = [new CSSImportRule(importedStyleSheet, { supportsText: '(display: grid)' })];
    assert.equal(await prepareCardFontCss(node), null, '@import supports conditions must preserve conditional font-face behavior');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

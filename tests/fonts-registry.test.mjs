import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const [{ FONT_FAMILIES, FONT_REGISTRY }, typography, fontLoader] = await Promise.all([
  import('../src/data/fonts/registry.ts'),
  import('../src/lib/typography-presets.ts'),
  import('../src/data/fonts/load-fonts.ts'),
]);

function packageRoot(entry) {
  return resolve(projectRoot, 'node_modules', entry.package.name);
}

function getFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, body]) => {
    const source = body.match(/src:\s*url\(([^)]+)\)/)?.[1]?.replace(/["']/g, '');
    const unicodeRange = body.match(/unicode-range:\s*([^;]+);/)?.[1];
    return { source, unicodeRange };
  }).filter(({ source, unicodeRange }) => source && unicodeRange);
}

function rangeIncludes(range, codePoint) {
  return range.split(',').some((value) => {
    const match = value.trim().match(/^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i);
    if (!match) return false;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    return codePoint >= start && codePoint <= end;
  });
}

function matchingSubsetAssets(entry, text) {
  const cssPath = resolve(projectRoot, entry.package.stylesheetPath);
  const faces = getFaces(readFileSync(cssPath, 'utf8'));
  const matchedFiles = new Set();

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const matchingFace = faces.find((face) => rangeIncludes(face.unicodeRange, codePoint));
    if (!matchingFace) continue;
    matchedFiles.add(resolve(dirname(cssPath), matchingFace.source));
  }

  const files = [...matchedFiles].map((file) => ({ name: file.slice(dirname(cssPath).length + 1), bytes: statSync(file).size }));
  return {
    files,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  };
}

function keepScriptGlyphs(text, script) {
  const isKorean = (point) =>
    (point >= 0xac00 && point <= 0xd7af) ||
    (point >= 0x1100 && point <= 0x11ff) ||
    (point >= 0x3130 && point <= 0x318f);
  const isJapanese = (point) =>
    (point >= 0x3040 && point <= 0x30ff) ||
    (point >= 0x31f0 && point <= 0x31ff) ||
    (point >= 0xff66 && point <= 0xff9f);
  const isHan = (point) => point >= 0x3400 && point <= 0x9fff;

  return [...text].filter((character) => {
    const point = character.codePointAt(0) ?? 0;
    return script === 'korean' ? isKorean(point) || isHan(point) : isJapanese(point) || isHan(point);
  }).join('');
}

test('Latin font registry files and OFL notices match the stylesheet', () => {
  const css = readFileSync(resolve(projectRoot, 'src/app/fonts.css'), 'utf8');
  let latinBytes = 0;

  for (const familyKey of ['cormorantGaramond', 'dmSans']) {
    const entry = FONT_REGISTRY[familyKey];
    const license = readFileSync(resolve(projectRoot, entry.licenseFile), 'utf8');
    assert.match(license, /SIL Open Font License, Version 1\.1/);
    assert.match(license, /Copyright/);

    for (const asset of entry.localAssets) {
      const file = resolve(projectRoot, asset.filePath);
      assert.equal(statSync(file).size, asset.bytes, `${asset.filePath} byte count`);
      assert.ok(css.includes(`url("${asset.publicPath}")`), `${asset.publicPath} must be loaded`);
      latinBytes += asset.bytes;
    }
  }

  assert.equal(latinBytes, 137_756);
  assert.doesNotMatch(css, /@fontsource-variable\/noto-(?:sans|serif)-(?:kr|jp)/);
});

test('CJK font registry metadata matches dynamic subset CSS, assets, and licenses', () => {
  const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
  const loader = readFileSync(resolve(projectRoot, 'src/data/fonts/load-fonts.ts'), 'utf8');
  const allCjkEntries = ['notoSansKr', 'notoSansJp', 'notoSerifKr', 'notoSerifJp'];
  let allCjkBytes = 0;

  for (const familyKey of allCjkEntries) {
    const entry = FONT_REGISTRY[familyKey];
    const root = packageRoot(entry);
    const cssPath = resolve(projectRoot, entry.package.stylesheetPath);
    const css = readFileSync(cssPath, 'utf8');
    const faceFiles = getFaces(css).map(({ source }) => resolve(dirname(cssPath), source));
    const uniqueFaceFiles = [...new Set(faceFiles)];
    const fontBytes = uniqueFaceFiles.reduce((bytes, file) => bytes + statSync(file).size, 0);
    const packageFiles = readdirSync(resolve(root, 'files')).filter((name) => name.endsWith('.woff2'));
    const license = readFileSync(resolve(projectRoot, entry.licenseFile), 'utf8');
    const packageLicense = readFileSync(resolve(root, 'LICENSE'), 'utf8');

    assert.equal(packageJson.dependencies[entry.package.name], '^5.3.0');
    assert.equal(uniqueFaceFiles.length, entry.package.fileCount);
    assert.equal(packageFiles.length, entry.package.fileCount);
    assert.equal(fontBytes, entry.package.fontBytes);
    assert.match(css, new RegExp(`font-family: '${entry.family}'`));
    assert.equal(license, packageLicense, `${entry.licenseFile} must retain the source notice verbatim`);
    assert.match(license, /Google Inc\./);
    assert.match(license, /SIL Open Font License, Version 1\.1/);
    assert.match(loader, new RegExp(`import\\('@fontsource-variable\\/${entry.id}\\/wght\\.css'\\)`));

    allCjkBytes += fontBytes;
  }

  assert.equal(allCjkBytes, 22_066_540);
  assert.match(loader, /preset\.id === 'editorial' \|\| preset\.id === 'classic'/);
});

test('CJK specimen transfer uses only the WOFF2 shards for visible glyphs', () => {
  const koreanText = keepScriptGlyphs(typography.TYPOGRAPHY_SPECIMENS.korean, 'korean');
  const japaneseText = keepScriptGlyphs(typography.TYPOGRAPHY_SPECIMENS.japanese, 'japanese');
  const koreanSans = matchingSubsetAssets(FONT_REGISTRY.notoSansKr, koreanText);
  const koreanSerif = matchingSubsetAssets(FONT_REGISTRY.notoSerifKr, koreanText);
  const japaneseSans = matchingSubsetAssets(FONT_REGISTRY.notoSansJp, japaneseText);
  const japaneseSerif = matchingSubsetAssets(FONT_REGISTRY.notoSerifJp, japaneseText);
  const koreanBytes = koreanSans.bytes + koreanSerif.bytes;
  const japaneseBytes = japaneseSans.bytes + japaneseSerif.bytes;

  assert.ok(koreanText.length > 0);
  assert.ok(japaneseText.length > 0);
  assert.ok(koreanBytes < FONT_REGISTRY.notoSansKr.package.fontBytes + FONT_REGISTRY.notoSerifKr.package.fontBytes);
  assert.ok(japaneseBytes < FONT_REGISTRY.notoSansJp.package.fontBytes + FONT_REGISTRY.notoSerifJp.package.fontBytes);
  console.log(`CJK specimen transfer: KO Sans ${koreanSans.bytes} bytes/${koreanSans.files.length} shards + Serif ${koreanSerif.bytes} bytes/${koreanSerif.files.length} shards = ${koreanBytes}; JA Sans ${japaneseSans.bytes} bytes/${japaneseSans.files.length} shards + Serif ${japaneseSerif.bytes} bytes/${japaneseSerif.files.length} shards = ${japaneseBytes}.`);
});

test('preset font pairings resolve to the loaded family for each script', () => {
  const { getTypographyFontFamily, detectTypographyScript, TYPOGRAPHY_SPECIMENS } = typography;

  assert.equal(typography.getTypographyPreset('bad-id').id, 'editorial');
  assert.equal(getTypographyFontFamily('editorial', 'display', 'korean').includes(FONT_FAMILIES.koreanSerif), true);
  assert.equal(getTypographyFontFamily('classic', 'display', 'japanese').includes(FONT_FAMILIES.japaneseSerif), true);
  assert.equal(getTypographyFontFamily('modern', 'display', 'korean').includes(FONT_FAMILIES.korean), true);
  assert.equal(getTypographyFontFamily('clean', 'display', 'japanese').includes(FONT_FAMILIES.japanese), true);
  assert.equal(getTypographyFontFamily('editorial', 'display', 'latin').includes(FONT_FAMILIES.display), true);
  assert.equal(detectTypographyScript('루나 녹스'), 'korean');
  assert.equal(detectTypographyScript('ルナ・ニュクス'), 'japanese');
  assert.equal(detectTypographyScript('星', 'japanese'), 'japanese');
  assert.equal(detectTypographyScript('Luna Nyx'), 'latin');
  assert.match(TYPOGRAPHY_SPECIMENS.korean, /[\uAC00-\uD7AF]/);
  assert.match(TYPOGRAPHY_SPECIMENS.japanese, /[\u3040-\u30FF]/);
});

test('master typography maps all seven roles across three families and scripts', () => {
  const { MASTER_TYPOGRAPHY_MAP, getMasterTypographyTreatment } = typography;
  const families = ['cinematic', 'editorial', 'identity'];
  const scripts = ['latin', 'korean', 'japanese'];
  const roles = ['display', 'secondaryDisplay', 'job', 'information', 'label', 'caption', 'micro'];

  for (const family of families) {
    for (const script of scripts) {
      assert.deepEqual(Object.keys(MASTER_TYPOGRAPHY_MAP[family][script]).sort(), [...roles].sort());
      for (const role of roles) {
        const entry = getMasterTypographyTreatment(family, role, script);
        assert.ok(entry.fontFamily.length > 0, `${family}/${script}/${role} family`);
        assert.ok(entry.weight >= 200 && entry.weight <= 900, `${family}/${script}/${role} weight`);
        assert.ok(Number.isFinite(entry.lineHeight) && entry.lineHeight > 0, `${family}/${script}/${role} leading`);
        assert.match(entry.tracking, /^(?:0|-?\d+(?:\.\d+)?em)$/u, `${family}/${script}/${role} tracking`);
      }
    }
  }

  for (const family of families) {
    for (const script of scripts) {
      const display = getMasterTypographyTreatment(family, 'display', script).fontFamily;
      const cormorantIndex = display.indexOf(FONT_FAMILIES.display);
      const koreanSerifIndex = display.indexOf(FONT_FAMILIES.koreanSerif);
      const japaneseSerifIndex = display.indexOf(FONT_FAMILIES.japaneseSerif);
      assert.ok(cormorantIndex >= 0 && koreanSerifIndex > cormorantIndex && japaneseSerifIndex > cormorantIndex);
    }
  }

  assert.match(getMasterTypographyTreatment('identity', 'display', 'korean').fontFamily, /Noto Serif KR Variable/u);
  assert.match(getMasterTypographyTreatment('identity', 'display', 'japanese').fontFamily, /Noto Serif JP Variable/u);
});

test('master Latin Display stays Cormorant across editor typography presets', () => {
  const { TYPOGRAPHY_PRESETS, getMasterTypographyTreatment, getTypographyFontFamily } = typography;

  for (const family of ['cinematic', 'editorial', 'identity']) {
    const masterDisplay = getMasterTypographyTreatment(family, 'display', 'latin').fontFamily;
    assert.ok(masterDisplay.startsWith(FONT_FAMILIES.display));

    for (const preset of Object.keys(TYPOGRAPHY_PRESETS)) {
      assert.equal(getMasterTypographyTreatment(family, 'display', 'latin').fontFamily, masterDisplay);
      assert.equal(getTypographyFontFamily(preset, 'display', 'latin'), TYPOGRAPHY_PRESETS[preset].fonts.display.latin);
    }
  }

  assert.match(getTypographyFontFamily('modern', 'display', 'latin'), /DM Sans Variable/u);
  assert.match(getTypographyFontFamily('condensed', 'display', 'latin'), /DM Sans Variable/u);
});

test('mixed-script detection returns every used glyph script and locale Han fallback', () => {
  const { getTypographyScriptsForText } = typography;

  assert.deepEqual(getTypographyScriptsForText('Coner 光月', 'latin'), ['latin', 'japanese']);
  assert.deepEqual(getTypographyScriptsForText('Coner 모서리', 'korean'), ['latin', 'korean']);
  assert.deepEqual(getTypographyScriptsForText('コナー XIV', 'japanese'), ['latin', 'japanese']);
  assert.deepEqual(getTypographyScriptsForText('한字カ', 'latin'), ['korean', 'japanese']);
  assert.deepEqual(getTypographyScriptsForText(`Coner \u{a960}`, 'latin'), ['latin', 'korean']);
  assert.deepEqual(getTypographyScriptsForText(`Coner \u{1b001}`, 'latin'), ['latin', 'japanese']);
  assert.deepEqual(getTypographyScriptsForText(`Coner \u{20000}`, 'latin'), ['latin', 'japanese']);
  assert.deepEqual(getTypographyScriptsForText('光月', 'korean'), ['korean']);
  assert.deepEqual(getTypographyScriptsForText('光月', 'japanese'), ['japanese']);
});

test('stylesheet plan is limited to active scripts and CJK serif presets', () => {
  const { getTypographyStylesheetIds } = fontLoader;

  assert.deepEqual(getTypographyStylesheetIds('editorial', 'latin'), []);
  assert.deepEqual(getTypographyStylesheetIds('modern', 'korean'), ['notoSansKr']);
  assert.deepEqual(getTypographyStylesheetIds('clean', 'japanese'), ['notoSansJp']);
  assert.deepEqual(getTypographyStylesheetIds('editorial', 'korean'), ['notoSansKr', 'notoSerifKr']);
  assert.deepEqual(getTypographyStylesheetIds('classic', 'japanese'), ['notoSansJp', 'notoSerifJp']);
  assert.deepEqual(getTypographyStylesheetIds('condensed', ['korean', 'japanese', 'japanese']), ['notoSansKr', 'notoSansJp']);
  assert.deepEqual(getTypographyStylesheetIds('condensed', ['korean', 'japanese'], { masterFamily: 'identity' }), [
    'notoSansKr', 'notoSerifKr', 'notoSansJp', 'notoSerifJp',
  ]);
});

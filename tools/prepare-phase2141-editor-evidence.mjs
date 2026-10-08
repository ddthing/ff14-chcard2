import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs/qa/phase2141');
const families = ['cinematic', 'editorial', 'id-card'];
const themes = ['dark', 'light'];
const repeats = [1, 2, 3];
const inset = 16;
const expectedViewport = { width: 1280, height: 720 };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function svgLabel(width, height, text, fill = '#f6f4ef') {
  const safe = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/><text x="12" y="${Math.round(height * 0.7)}" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#25282a">${safe}</text></svg>`);
}

function fileName(family, theme, repeat) {
  return `editor-${family}-${theme}-${repeat}.jpg`;
}

async function readCrop(family, theme, repeat, geometry) {
  const name = fileName(family, theme, repeat);
  const fullPath = path.join(qaRoot, name);
  const bytes = await readFile(fullPath);
  const metadata = await sharp(bytes).metadata();
  assert(metadata.format === 'jpeg', `${name} is ${metadata.format}, expected the captured IAB JPEG.`);
  assert(metadata.width === expectedViewport.width && metadata.height === expectedViewport.height, `${name} has ${metadata.width}×${metadata.height}, expected 1280×720.`);
  const left = Math.floor(geometry.x + inset);
  const top = Math.floor(geometry.y + inset);
  const right = Math.ceil(geometry.x + geometry.width - inset);
  const bottom = Math.ceil(geometry.y + geometry.height - inset);
  const crop = { left, top, width: right - left, height: bottom - top };
  const png = await sharp(bytes).extract(crop).png().toBuffer();
  const raw = await sharp(png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return {
    name,
    bytes,
    raw: raw.data,
    png,
    sourceSha256: sha256(bytes),
    cropSha256: sha256(png),
    crop,
    metadata,
    geometry,
  };
}

function compareRgb(left, right) {
  assert(left.info.width === right.info.width && left.info.height === right.info.height, 'Card crop dimensions differ.');
  assert(left.data.length === right.data.length, 'Card crop RGB buffers differ in length.');
  let changedPixels = 0;
  let changedChannels = 0;
  let sumAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  let leftBound = left.info.width;
  let topBound = left.info.height;
  let rightBound = -1;
  let bottomBound = -1;
  const channels = 3;
  for (let offset = 0; offset < left.data.length; offset += channels) {
    let pixelChanged = false;
    for (let channel = 0; channel < channels; channel += 1) {
      const delta = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      if (!delta) continue;
      pixelChanged = true;
      changedChannels += 1;
      sumAbsoluteDelta += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (!pixelChanged) continue;
    changedPixels += 1;
    const pixelIndex = offset / channels;
    const x = pixelIndex % left.info.width;
    const y = Math.floor(pixelIndex / left.info.width);
    leftBound = Math.min(leftBound, x);
    topBound = Math.min(topBound, y);
    rightBound = Math.max(rightBound, x);
    bottomBound = Math.max(bottomBound, y);
  }
  return {
    width: left.info.width,
    height: left.info.height,
    channels,
    exactDecodedJpegPixels: changedPixels === 0,
    changedPixels,
    changedPixelPercent: round((changedPixels / (left.info.width * left.info.height)) * 100, 6),
    changedChannels,
    totalChannels: left.data.length,
    meanAbsoluteChannelDelta: round(sumAbsoluteDelta / left.data.length, 9),
    maxChannelDelta,
    changedBounds: changedPixels ? { left: leftBound, top: topBound, right: rightBound, bottom: bottomBound } : null,
  };
}

function createHeatmap(left, right, boost = 8) {
  const output = Buffer.alloc((left.info.width * left.info.height) * 4, 0);
  for (let pixel = 0; pixel < left.info.width * left.info.height; pixel += 1) {
    const source = pixel * 3;
    const target = pixel * 4;
    const delta = Math.max(
      Math.abs(left.data[source] - right.data[source]),
      Math.abs(left.data[source + 1] - right.data[source + 1]),
      Math.abs(left.data[source + 2] - right.data[source + 2]),
    );
    if (!delta) continue;
    const value = Math.min(255, delta * boost);
    output[target] = 255;
    output[target + 1] = Math.round(30 + value * 0.55);
    output[target + 2] = 8;
    output[target + 3] = 255;
  }
  return output;
}

async function makeEditorBoard(records) {
  const margin = 24;
  const columnGap = 18;
  const rowGap = 20;
  const titleHeight = 44;
  const familyHeight = 32;
  const frameWidth = expectedViewport.width;
  const frameHeight = expectedViewport.height;
  const boardWidth = margin * 2 + frameWidth * 2 + columnGap;
  const rowHeight = familyHeight + titleHeight + frameHeight;
  const boardHeight = margin * 2 + rowHeight * 3 + rowGap * 2;
  const board = sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: '#e9e7e1' } });
  const composites = [];
  let y = margin;
  for (const family of families) {
    composites.push({ input: svgLabel(boardWidth - margin * 2, familyHeight, `${family} · matched article 405.78125×507.21875 CSS px · render scope=true · article color-scheme=dark`), left: margin, top: y });
    y += familyHeight;
    composites.push({ input: svgLabel(frameWidth, titleHeight, 'Dark appearance · original native IAB screenshot'), left: margin, top: y });
    composites.push({ input: svgLabel(frameWidth, titleHeight, 'Light appearance · original native IAB screenshot'), left: margin + frameWidth + columnGap, top: y });
    y += titleHeight;
    for (const theme of themes) {
      const source = records.get(`${family}/${theme}/1`);
      assert(source, `Missing repeat-one Editor frame ${family}/${theme}.`);
      composites.push({ input: source.bytes, left: theme === 'dark' ? margin : margin + frameWidth + columnGap, top: y });
    }
    y += frameHeight + rowGap;
  }
  return { buffer: await board.composite(composites).png().toBuffer(), dimensions: { width: boardWidth, height: boardHeight } };
}

async function makeCropComparisonBoard(crops, comparisons) {
  const margin = 24;
  const rowLabelWidth = 116;
  const columnGap = 14;
  const rowGap = 18;
  const headingHeight = 36;
  const first = crops.get('cinematic/dark/1');
  assert(first, 'Missing crop sample for board dimensions.');
  const cropWidth = first.crop.width;
  const cropHeight = first.crop.height;
  const boardWidth = margin * 2 + rowLabelWidth + 16 + cropWidth * 3 + columnGap * 2;
  const rowHeight = headingHeight + cropHeight;
  const boardHeight = margin * 2 + rowHeight * 3 + rowGap * 2;
  const board = sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: '#eeece6' } });
  const composites = [];
  let y = margin;
  for (const family of families) {
    const dark = crops.get(`${family}/dark/1`);
    const light = crops.get(`${family}/light/1`);
    assert(dark && light, `Missing ${family} native screenshot crop.`);
    const metrics = comparisons.find((row) => row.kind === 'cross-theme' && row.family === family && row.darkRepeat === 1 && row.lightRepeat === 1);
    assert(metrics, `Missing ${family} crop pixel metrics.`);
    composites.push({ input: svgLabel(rowLabelWidth, headingHeight, family), left: margin, top: y });
    const firstColumn = margin + rowLabelWidth + 16;
    composites.push({ input: svgLabel(cropWidth, headingHeight, 'Dark · repeat 1'), left: firstColumn, top: y });
    composites.push({ input: svgLabel(cropWidth, headingHeight, 'Light · repeat 1'), left: firstColumn + cropWidth + columnGap, top: y });
    composites.push({ input: svgLabel(cropWidth, headingHeight, `Decoded JPEG delta · max ${metrics.delta.maxChannelDelta}, ×8`), left: firstColumn + (cropWidth + columnGap) * 2, top: y });
    y += headingHeight;
    composites.push({ input: dark.png, left: firstColumn, top: y });
    composites.push({ input: light.png, left: firstColumn + cropWidth + columnGap, top: y });
    const decodedDark = await sharp(dark.png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const decodedLight = await sharp(light.png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const diff = createHeatmap(decodedDark, decodedLight);
    composites.push({ input: await sharp(diff, { raw: { width: cropWidth, height: cropHeight, channels: 4 } }).png().toBuffer(), left: firstColumn + (cropWidth + columnGap) * 2, top: y });
    y += cropHeight + rowGap;
  }
  const result = await board.composite(composites).png().toBuffer();
  return { buffer: result, dimensions: { width: boardWidth, height: boardHeight }, cropSize: { width: cropWidth, height: cropHeight } };
}

const geometryReport = JSON.parse(await readFile(path.join(qaRoot, 'editor-capture-geometry.json'), 'utf8'));
assert(Array.isArray(geometryReport.records) && geometryReport.records.length === 6, 'Expected six measured Editor/theme geometry records.');
const geometryByKey = new Map();
for (const record of geometryReport.records) {
  assert(record.expectedTheme === record.theme, `${record.family}/${record.theme} DOM did not report the expected appearance.`);
  assert(record.template === record.family && record.ratio === '4:5', `${record.family}/${record.theme} DOM card family/ratio mismatch.`);
  assert(record.scope === 'true' && record.scheme === 'dark' && record.ambientBg === '', `${record.family}/${record.theme} scope/color-scheme/App token isolation differs.`);
  assert(record.rect.x === 327.109375 && record.rect.y === 127.59375 && record.rect.width === 405.78125 && record.rect.height === 507.21875, `${record.family}/${record.theme} card bounds do not match the six-capture baseline.`);
  geometryByKey.set(`${record.family}/${record.theme}`, record.rect);
}
for (const family of families) assert(JSON.stringify(geometryByKey.get(`${family}/dark`)) === JSON.stringify(geometryByKey.get(`${family}/light`)), `${family} Dark/Light DOM card bounds differ.`);

const fullFrames = new Map();
const cardCrops = new Map();
const sourceRows = [];
for (const family of families) for (const theme of themes) for (const repeat of repeats) {
  const geometry = geometryByKey.get(`${family}/${theme}`);
  const record = await readCrop(family, theme, repeat, geometry);
  const metadataRow = geometryReport.records.find((row) => row.family === family && row.theme === theme);
  const fileEntry = {
    family, theme, repeat,
    sourceFile: record.name,
    sourceSha256: record.sourceSha256,
    sourceBytes: record.bytes.byteLength,
    codec: record.metadata.format,
    sourceSize: { width: record.metadata.width, height: record.metadata.height },
    dpr: 1,
    viewport: expectedViewport,
    dom: { ratio: metadataRow.ratio, rect: geometry, cardRenderScope: metadataRow.scope === 'true', articleColorScheme: metadataRow.scheme, ambientAppBackground: metadataRow.ambientBg },
    cropInsetCssPixels: inset,
    cropRectPixels: record.crop,
    cropSize: { width: record.crop.width, height: record.crop.height },
    cropSha256: record.cropSha256,
  };
  sourceRows.push(fileEntry);
  if (repeat === 1) fullFrames.set(`${family}/${theme}/1`, record);
  cardCrops.set(`${family}/${theme}/${repeat}`, record);
}

const comparisons = [];
for (const family of families) {
  const darkRepeats = repeats.map((repeat) => cardCrops.get(`${family}/dark/${repeat}`));
  const lightRepeats = repeats.map((repeat) => cardCrops.get(`${family}/light/${repeat}`));
  for (const [theme, rows] of [['dark', darkRepeats], ['light', lightRepeats]]) {
    for (let left = 0; left < rows.length; left += 1) for (let right = left + 1; right < rows.length; right += 1) {
      const a = rows[left];
      const b = rows[right];
      const delta = compareRgb(
        await sharp(a.png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }),
        await sharp(b.png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }),
      );
      comparisons.push({ family, kind: 'within-theme-repeat', theme, leftFile: a.name, rightFile: b.name, leftRepeat: repeats[left], rightRepeat: repeats[right], leftSha256: a.sourceSha256, rightSha256: b.sourceSha256, delta });
    }
  }
  for (let darkIndex = 0; darkIndex < darkRepeats.length; darkIndex += 1) for (let lightIndex = 0; lightIndex < lightRepeats.length; lightIndex += 1) {
    const dark = darkRepeats[darkIndex];
    const light = lightRepeats[lightIndex];
    const delta = compareRgb(
      await sharp(dark.png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }),
      await sharp(light.png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }),
    );
    comparisons.push({ family, kind: 'cross-theme', darkFile: dark.name, lightFile: light.name, darkRepeat: repeats[darkIndex], lightRepeat: repeats[lightIndex], darkSha256: dark.sourceSha256, lightSha256: light.sourceSha256, delta });
  }
}

const editorBoard = await makeEditorBoard(fullFrames);
await writeFile(path.join(qaRoot, '06-dark-light-editor.png'), editorBoard.buffer);
const cropBoard = await makeCropComparisonBoard(cardCrops, comparisons);
await writeFile(path.join(qaRoot, '07-card-crop-comparison.png'), cropBoard.buffer);

const report = {
  schema: 'phase2141-editor-card-crop-comparison-v1',
  generatedAt: new Date().toISOString(),
  evidenceLimits: {
    sourceFormat: 'The in-app browser produced JPEG screenshots. Crops were decoded from those original JPEGs, then saved losslessly inside the comparison boards. JPEG quantization has already changed their pixels.',
    verdict: 'These native UI crops document matched Editor geometry and provide diagnostic decoded-JPEG deltas only. They are not export PNG/WebP bit-parity evidence and do not prove that the rendered artifact is pixel exact.',
    cropping: 'Each crop removes a measured 16 CSS pixel inset on all sides to exclude the article edge/shadow. The remaining source crop is kept at native 1× pixels; no resize, interpolation, or image enhancement is applied.',
    differenceMap: 'Dark/Light crop difference uses sRGB RGB channel absolute delta; unchanged pixels transparent; changed pixels red/orange at ×8 gain, clamped to 255. Board labels sit outside source crop pixels.',
  },
  screenshotSet: {
    count: sourceRows.length,
    repeatsPerFamilyTheme: 3,
    sourceFiles: sourceRows,
    geometrySource: 'editor-capture-geometry.json, collected from the matching browser DOM immediately before screenshots.',
    matchedRectAcrossAllSix: sourceRows.every((row) => row.dom.rect.x === sourceRows[0].dom.rect.x && row.dom.rect.y === sourceRows[0].dom.rect.y && row.dom.rect.width === sourceRows[0].dom.rect.width && row.dom.rect.height === sourceRows[0].dom.rect.height),
    allCardRootsInRenderScope: sourceRows.every((row) => row.dom.cardRenderScope),
    allCardRootsUseDarkColorScheme: sourceRows.every((row) => row.dom.articleColorScheme === 'dark'),
    allCardRootsHaveNeutralAppBackground: sourceRows.every((row) => row.dom.ambientAppBackground === ''),
  },
  decodedJpegPixelComparisons: comparisons,
  outputBoards: [
    { file: '06-dark-light-editor.png', dimensions: editorBoard.dimensions, composition: '3 family rows × Dark/Light full native screenshots; labels above each screenshot; frames are not resized.' },
    { file: '07-card-crop-comparison.png', dimensions: cropBoard.dimensions, cardCropDimensions: cropBoard.cropSize, composition: '3 family rows × Dark crop, Light crop, decoded JPEG difference map at native 1× resolution.' },
  ],
};
await writeFile(path.join(qaRoot, 'preview-crop-comparison.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputBoards: report.outputBoards,
  sourceCaptureCount: sourceRows.length,
  withinThemePairs: comparisons.filter((row) => row.kind === 'within-theme-repeat').length,
  crossThemePairs: comparisons.filter((row) => row.kind === 'cross-theme').length,
  allCardRootsInRenderScope: report.screenshotSet.allCardRootsInRenderScope,
  allCardRootsUseDarkColorScheme: report.screenshotSet.allCardRootsUseDarkColorScheme,
  artifactParityClaim: false,
}, null, 2));

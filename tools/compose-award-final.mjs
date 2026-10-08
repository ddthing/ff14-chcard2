import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const finalDir = path.join(root, 'docs/qa/award-final');
const finalExports = path.join(finalDir, 'exports');
const priorExports = path.join(root, 'docs/qa/award-pass/exports');
const background = '#171a1e';
const paper = '#f4f0e8';
const ink = '#24262a';
const families = ['cinematic', 'editorial', 'id-card'];
const familyNames = {
  cinematic: 'C2 · EDITORIAL CINEMA',
  editorial: 'E2 · IMAGE COLLISION',
  'id-card': 'I3 · PREMIUM RECORD',
};
const ratios = ['1:1', '4:5', '3:4', '9:16', '16:9'];
const locales = ['ko', 'en', 'ja'];
const photoSources = {
  cinematic: 'public/images/hero-adventurer.webp',
  editorial: 'public/images/kael-adventurer.webp',
  'id-card': 'public/images/seraphine-adventurer.webp',
};
const iconComparisonCrop = { left: 0, top: 680, width: 1120, height: 800 };
const materialCrops = {
  cinematic: { left: 140, top: 1540, width: 760, height: 550 },
  editorial: { left: 0, top: 130, width: 760, height: 500 },
  'id-card': { left: 60, top: 1620, width: 760, height: 550 },
};

const relative = file => path.relative(root, file).replaceAll('\\', '/');
const ratioName = ratio => ratio.replace(':', 'x');
const exportStem = ({ family, locale = 'en', ratio = '4:5', scale = 2 }) =>
  `${family}-${locale}-${ratioName(ratio)}-${scale}x`;

function escapeXml(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function caption(text, width, height = 48, fill = paper) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/><text x="20" y="${Math.round(height * .68)}" fill="${ink}" font-family="Arial,sans-serif" font-size="20" font-weight="600" letter-spacing="1">${escapeXml(text)}</text></svg>`;
  return Buffer.from(svg);
}

async function board(file, width, height, layers, fill = background) {
  await sharp({ create: { width, height, channels: 3, background: fill } })
    .composite(layers)
    .png()
    .toFile(path.join(finalDir, file));
}

async function loadCapture(fixture, directory = finalExports) {
  const stem = exportStem(fixture);
  const pngPath = path.join(directory, `${stem}.png`);
  const jsonPath = path.join(directory, `${stem}.json`);
  const capture = JSON.parse(await readFile(jsonPath, 'utf8'));
  const image = await sharp(pngPath).metadata();
  assert.equal(capture.family, fixture.family, `${stem}: family metadata`);
  assert.equal(capture.locale, fixture.locale ?? 'en', `${stem}: locale metadata`);
  assert.equal(capture.ratio, fixture.ratio ?? '4:5', `${stem}: ratio metadata`);
  assert.equal(capture.scale, fixture.scale ?? 2, `${stem}: scale metadata`);
  assert.equal(capture.format, 'png', `${stem}: capture is not PNG`);
  assert.equal(image.format, 'png', `${stem}: source file is not PNG`);
  assert.deepEqual(
    { width: image.width, height: image.height },
    { width: capture.size.width, height: capture.size.height },
    `${stem}: PNG dimensions disagree with its capture metadata`,
  );
  assert.equal(capture.fonts, 'loaded', `${stem}: fonts were not ready at capture time`);
  assert.ok(capture.images?.length, `${stem}: no image readiness records`);
  assert.ok(capture.images.every(item => item.loaded === true), `${stem}: an image was not ready`);
  return { pngPath, jsonPath, capture, image };
}

function clampCrop(crop, metadata, sourceName) {
  const { width: maxWidth, height: maxHeight } = metadata;
  const left = Math.max(0, Math.floor(crop.left));
  const top = Math.max(0, Math.floor(crop.top));
  const right = Math.min(maxWidth, Math.ceil(crop.left + crop.width));
  const bottom = Math.min(maxHeight, Math.ceil(crop.top + crop.height));
  assert.ok(right > left && bottom > top, `${sourceName}: empty crop`);
  return { left, top, width: right - left, height: bottom - top };
}

function fieldCrop(capture, fieldNames, padding = 24) {
  const factor = capture.size.width / capture.logical.width;
  const fields = fieldNames.map(name => {
    const field = capture.fields.find(item => item.field === name);
    assert.ok(field, `${capture.family}: missing field bounds for ${name}`);
    return field;
  });
  const left = Math.min(...fields.map(field => field.x)) * factor - padding;
  const top = Math.min(...fields.map(field => field.y)) * factor - padding;
  const right = Math.max(...fields.map(field => field.x + field.width)) * factor + padding;
  const bottom = Math.max(...fields.map(field => field.y + field.height)) * factor + padding;
  return clampCrop({ left, top, width: right - left, height: bottom - top }, capture.size, capture.family);
}

function textRunCrop(capture, needles, padX = 18, padY = 8) {
  const runs = capture.textRuns.filter(run => needles.some(needle => run.text.includes(needle)));
  assert.ok(runs.length, `${capture.family}: legal text runs not found`);
  const left = Math.min(...runs.map(run => run.x)) - padX;
  const top = Math.min(...runs.map(run => run.y)) - padY;
  const right = Math.max(...runs.map(run => run.x + run.width)) + padX;
  const bottom = Math.max(...runs.map(run => run.y + run.height)) + padY;
  return clampCrop({ left, top, width: right - left, height: bottom - top }, capture.size, capture.family);
}

async function cropBuffer(pngPath, crop) {
  return sharp(pngPath).extract(crop).png().toBuffer();
}

function imageLayer(input, left, top) {
  return { input, left: Math.round(left), top: Math.round(top) };
}

async function downscaledCard(pngPath, width, height) {
  const source = await sharp(pngPath).metadata();
  assert.ok(width <= source.width && height <= source.height, 'card overview must not be enlarged');
  return sharp(pngPath).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
}

await mkdir(finalDir, { recursive: true });

// Validate the complete 21-file 2x set before composing any evidence board.
const allCaptures = [];
for (const family of families) {
  for (const ratio of ratios) allCaptures.push(await loadCapture({ family, locale: 'en', ratio }));
  for (const locale of ['ko', 'ja']) allCaptures.push(await loadCapture({ family, locale, ratio: '4:5' }));
}

const masters = new Map();
const priorMasters = new Map();
for (const family of families) {
  masters.set(family, await loadCapture({ family, locale: 'en', ratio: '4:5' }));
  priorMasters.set(family, await loadCapture({ family, locale: 'en', ratio: '4:5' }, priorExports));
  await copyFile(masters.get(family).pngPath, path.join(finalDir, {
    cinematic: '01-cinematic-4x5-2x.png',
    editorial: '02-editorial-4x5-2x.png',
    'id-card': '03-identity-4x5-2x.png',
  }[family]));
}

// 04 — scaled overview only; source 2x exports remain byte-identical in 01–03.
{
  const cardWidth = 600, cardHeight = 750, gutter = 28, margin = 36, top = 126;
  const width = margin * 2 + cardWidth * 3 + gutter * 2;
  const height = top + cardHeight + 42;
  const layers = [imageLayer(caption('AWARD FINAL / THREE MASTERS / 4:5 / ACTUAL PNG 2x', width, 76), 0, 0)];
  for (const [index, family] of families.entries()) {
    const x = margin + index * (cardWidth + gutter);
    layers.push(imageLayer(caption(familyNames[family], cardWidth, 44), x, 78));
    layers.push(imageLayer(await downscaledCard(masters.get(family).pngPath, cardWidth, cardHeight), x, top));
  }
  await board('04-master-triptych.png', width, height, layers);
}

const oldEditorial = await loadCapture({ family: 'editorial', locale: 'en', ratio: '4:5' }, priorExports);
const newEditorial = masters.get('editorial');
const oldIconCrop = clampCrop(iconComparisonCrop, oldEditorial.image, 'Phase 2.7.2 E2');
const newIconCrop = clampCrop(iconComparisonCrop, newEditorial.image, 'Phase 2.7.3 E2');
const oldIconDetail = await cropBuffer(oldEditorial.pngPath, oldIconCrop);
const newIconDetail = await cropBuffer(newEditorial.pngPath, newIconCrop);

// 05 — matching native-pixel crops isolate the old raster emblem and final GNB motif.
{
  const pad = 32, labelHeight = 56, width = iconComparisonCrop.width * 2 + pad * 3;
  const height = labelHeight + iconComparisonCrop.height + pad * 2;
  await board('05-icon-detail-before-after.png', width, height, [
    imageLayer(caption('PHASE 2.7.2 / RETIRED SDF DERIVATIVE / 100% EXPORT PIXELS', iconComparisonCrop.width, labelHeight), pad, pad),
    imageLayer(oldIconDetail, pad, pad + labelHeight),
    imageLayer(caption('PHASE 2.7.3 / TYPOGRAPHIC GNB MOTIF / 100% EXPORT PIXELS', iconComparisonCrop.width, labelHeight), pad * 2 + iconComparisonCrop.width, pad),
    imageLayer(newIconDetail, pad * 2 + iconComparisonCrop.width, pad + labelHeight),
  ]);
}

const microSpecs = [
  { family: 'cinematic', fields: ['job', 'level', 'jobAbbreviation'], label: 'C2 / JOB + LEVEL', pad: 28 },
  { family: 'editorial', fields: ['origin'], label: 'E2 / VERTICAL SERVICE MICROTYPE', pad: 20 },
  { family: 'id-card', fields: ['jobAbbreviation', 'level'], label: 'I3 / WHM + LEVEL FOOTER', pad: 24 },
];
const microDetails = [];
for (const spec of microSpecs) {
  const capture = masters.get(spec.family);
  const crop = fieldCrop(capture.capture, spec.fields, spec.pad);
  microDetails.push({ ...spec, source: capture.pngPath, crop, buffer: await cropBuffer(capture.pngPath, crop) });
}
const legalDetails = [];
for (const family of families) {
  const capture = masters.get(family);
  const crop = textRunCrop(capture.capture, ['© SQUARE ENIX', 'Unofficial fan project']);
  legalDetails.push({ family, source: capture.pngPath, crop, buffer: await cropBuffer(capture.pngPath, crop) });
}

// 06 — every detail remains at its extracted pixel size; no crop is enlarged.
{
  const columns = 3, slotWidth = 1050, gutter = 28, margin = 28, labelHeight = 46;
  const topHeight = Math.max(...microDetails.map(item => item.crop.height));
  const legalHeight = Math.max(...legalDetails.map(item => item.crop.height));
  const rowGap = 28;
  const width = margin * 2 + columns * slotWidth + (columns - 1) * gutter;
  const height = 72 + labelHeight + topHeight + rowGap + labelHeight + legalHeight + margin;
  const layers = [imageLayer(caption('MICROTYPE / EXPORT PIXELS AT 100%', width, 72), 0, 0)];
  for (let index = 0; index < columns; index += 1) {
    const x = margin + index * (slotWidth + gutter);
    const detail = microDetails[index];
    layers.push(imageLayer(caption(detail.label, slotWidth, labelHeight), x, 78));
    layers.push(imageLayer(detail.buffer, x, 78 + labelHeight));
    const legal = legalDetails[index];
    const legalTop = 78 + labelHeight + topHeight + rowGap;
    layers.push(imageLayer(caption(`${familyNames[legal.family]} / LEGAL TEXT`, slotWidth, labelHeight), x, legalTop));
    layers.push(imageLayer(legal.buffer, x, legalTop + labelHeight));
  }
  await board('06-microtype-detail.png', width, height, layers);
}

const materialDetails = [];
for (const family of families) {
  const capture = masters.get(family);
  const crop = clampCrop(materialCrops[family], capture.image, family);
  materialDetails.push({ family, source: capture.pngPath, crop, buffer: await cropBuffer(capture.pngPath, crop) });
}

// 07 — fixed, documented 100% crops show film/photo, paper/image, and matte stock.
{
  const cropWidth = 760, cropHeight = 550, gutter = 30, margin = 36, labelHeight = 52;
  const width = margin * 2 + cropWidth * 3 + gutter * 2;
  const height = 72 + labelHeight + cropHeight + margin;
  const layers = [imageLayer(caption('MATERIAL / INK / SURFACE / 100% SOURCE PIXELS', width, 72), 0, 0)];
  for (const [index, item] of materialDetails.entries()) {
    const x = margin + index * (cropWidth + gutter);
    layers.push(imageLayer(caption(familyNames[item.family], cropWidth, labelHeight), x, 78));
    layers.push(imageLayer(item.buffer, x, 78 + labelHeight));
  }
  await board('07-material-detail.png', width, height, layers);
}

// 08 — all nine final localized exports are downscaled only for the overview board.
{
  const cardWidth = 400, cardHeight = 500, gutter = 24, margin = 28, titleHeight = 70, labelHeight = 46;
  const rowHeight = labelHeight + cardHeight + 24;
  const width = margin * 2 + cardWidth * 3 + gutter * 2;
  const height = titleHeight + rowHeight * 3 + margin;
  const layers = [imageLayer(caption('KO / EN / JA / THREE FAMILIES / 4:5 ACTUAL EXPORTS', width, titleHeight), 0, 0)];
  for (const [row, family] of families.entries()) {
    for (const [column, locale] of locales.entries()) {
      const capture = await loadCapture({ family, locale, ratio: '4:5' });
      const x = margin + column * (cardWidth + gutter);
      const y = titleHeight + row * rowHeight;
      layers.push(imageLayer(caption(`${familyNames[family]} / ${locale.toUpperCase()}`, cardWidth, labelHeight), x, y));
      layers.push(imageLayer(await downscaledCard(capture.pngPath, cardWidth, cardHeight), x, y + labelHeight));
    }
  }
  await board('08-ko-en-ja.png', width, height, layers);
}

// 09 — scaled master overview plus native-pixel evidence crops.
{
  const width = 3200, margin = 36, gutter = 28, tileWidth = 1000;
  const cardWidth = 980, cardHeight = 1225, titleHeight = 76, familyHeight = 48;
  const top = titleHeight + familyHeight;
  const masterHeight = cardHeight;
  const sectionGap = 28, detailCaption = 44;
  const iconHeight = iconComparisonCrop.height;
  const microHeight = Math.max(...microDetails.map(item => item.crop.height));
  const legalHeight = Math.max(...legalDetails.map(item => item.crop.height));
  const materialHeight = materialCrops.cinematic.height;
  const height = top + masterHeight + sectionGap + detailCaption + iconHeight + sectionGap + detailCaption + microHeight + legalHeight + sectionGap + detailCaption + materialHeight + margin;
  const layers = [imageLayer(caption('AWARD FINAL REVIEW / MASTER ART + NATIVE DETAIL CROPS', width, titleHeight), 0, 0)];
  for (const [index, family] of families.entries()) {
    const x = margin + index * (cardWidth + gutter);
    layers.push(imageLayer(caption(familyNames[family], cardWidth, familyHeight), x, titleHeight));
    layers.push(imageLayer(await downscaledCard(masters.get(family).pngPath, cardWidth, cardHeight), x, top));
  }
  let y = top + masterHeight + sectionGap;
  layers.push(imageLayer(caption('E2 GLYPH / BEFORE AND AFTER / 100%', width, detailCaption), margin, y));
  y += detailCaption;
  layers.push(imageLayer(oldIconDetail, margin, y));
  layers.push(imageLayer(newIconDetail, margin + iconComparisonCrop.width + 28, y));
  y += iconHeight + sectionGap;
  layers.push(imageLayer(caption('MICROTYPE AND LEGAL / 100%', width, detailCaption), margin, y));
  y += detailCaption;
  for (let index = 0; index < columnsCount(); index += 1) {
    const x = margin + index * (tileWidth + gutter);
    layers.push(imageLayer(microDetails[index].buffer, x, y));
    layers.push(imageLayer(legalDetails[index].buffer, x, y + microHeight));
  }
  y += microHeight + legalHeight + sectionGap;
  layers.push(imageLayer(caption('FILM / PAPER / MATTE STOCK / 100%', width, detailCaption), margin, y));
  y += detailCaption;
  for (const [index, item] of materialDetails.entries()) {
    layers.push(imageLayer(item.buffer, margin + index * (materialCrops.cinematic.width + gutter), y));
  }
  await board('09-award-final-review.png', width, height, layers);
}

// 10 — whole-card before/after overview. Both columns are scaled down for comparison.
{
  const cardWidth = 560, cardHeight = 700, gutter = 30, margin = 32, labelHeight = 48, rowGap = 34, titleHeight = 76;
  const width = margin * 2 + cardWidth * 2 + gutter;
  const rowHeight = labelHeight + cardHeight;
  const height = titleHeight + rowHeight * 3 + rowGap * 2 + margin;
  const layers = [imageLayer(caption('PHASE 2.7.2 → PHASE 2.7.3 / WHOLE-CARD COMPARISON', width, titleHeight), 0, 0)];
  for (const [row, family] of families.entries()) {
    const y = titleHeight + row * (rowHeight + rowGap);
    layers.push(imageLayer(caption(`${familyNames[family]} / PHASE 2.7.2`, cardWidth, labelHeight), margin, y));
    layers.push(imageLayer(caption(`${familyNames[family]} / PHASE 2.7.3`, cardWidth, labelHeight), margin + cardWidth + gutter, y));
    layers.push(imageLayer(await downscaledCard(priorMasters.get(family).pngPath, cardWidth, cardHeight), margin, y + labelHeight));
    layers.push(imageLayer(await downscaledCard(masters.get(family).pngPath, cardWidth, cardHeight), margin + cardWidth + gutter, y + labelHeight));
  }
  await board('10-before-after.png', width, height, layers);
}

function columnsCount() { return 3; }

// Sharp supplies the real source-image dimensions and the actual capped export dimensions.
const photoRecords = [];
const renderRecords = [];
for (const family of families) {
  const photoPath = path.join(root, photoSources[family]);
  const photo = await sharp(photoPath).metadata();
  const twoX = masters.get(family);
  const fourX = await loadCapture({ family, locale: 'en', ratio: '4:5', scale: 4 });
  photoRecords.push({
    family,
    path: relative(photoPath),
    format: photo.format,
    widthPx: photo.width,
    heightPx: photo.height,
    aspectRatio: Number((photo.width / photo.height).toFixed(4)),
    sourcePixels: photo.width * photo.height,
  });
  renderRecords.push({
    family,
    twoX: { path: relative(twoX.pngPath), widthPx: twoX.image.width, heightPx: twoX.image.height },
    fourX: { path: relative(fourX.pngPath), widthPx: fourX.image.width, heightPx: fourX.image.height, capped: fourX.capture.size.capped, effectiveScale: fourX.capture.size.scale },
  });
}

const nativePixelCrops = [
  { board: '05-icon-detail-before-after.png', family: 'editorial', before: { path: relative(oldEditorial.pngPath), pixels: oldIconCrop }, after: { path: relative(newEditorial.pngPath), pixels: newIconCrop }, enlargement: 1 },
  ...microDetails.map(item => ({ board: '06-microtype-detail.png', family: item.family, source: relative(item.source), pixels: item.crop, enlargement: 1 })),
  ...legalDetails.map(item => ({ board: '06-microtype-detail.png', family: item.family, source: relative(item.source), pixels: item.crop, enlargement: 1 })),
  ...materialDetails.map(item => ({ board: '07-material-detail.png', family: item.family, source: relative(item.source), pixels: item.crop, enlargement: 1 })),
];
const boardSources = [
  ...families.map(family => ({ output: ({ cinematic: '01-cinematic-4x5-2x.png', editorial: '02-editorial-4x5-2x.png', 'id-card': '03-identity-4x5-2x.png' })[family], source: relative(masters.get(family).pngPath), operation: 'byte-for-byte copy of actual EN 4:5 renderCardBlob PNG' })),
  { output: '04-master-triptych.png', sources: families.map(family => relative(masters.get(family).pngPath)), operation: 'downscaled overview panels' },
  { output: '05-icon-detail-before-after.png', sources: [relative(oldEditorial.pngPath), relative(newEditorial.pngPath)], operation: 'matching 1120x650 source-pixel crops, no scaling' },
  { output: '06-microtype-detail.png', sources: [...microDetails, ...legalDetails].map(item => relative(item.source)), operation: 'metadata-based text crops, native pixels, no scaling' },
  { output: '07-material-detail.png', sources: materialDetails.map(item => relative(item.source)), operation: 'fixed native-pixel material crops, no scaling' },
  { output: '08-ko-en-ja.png', sources: allCaptures.filter(item => ['ko', 'ja'].includes(item.capture.locale) || item.capture.ratio === '4:5').map(item => relative(item.pngPath)), operation: 'downscaled locale overview panels' },
  { output: '09-award-final-review.png', sources: families.map(family => relative(masters.get(family).pngPath)).concat(relative(oldEditorial.pngPath)), operation: 'scaled master previews plus native-pixel detail crops' },
  { output: '10-before-after.png', sources: families.flatMap(family => [relative(priorMasters.get(family).pngPath), relative(masters.get(family).pngPath)]), operation: 'downscaled whole-card comparison panels' },
];

const resolution = {
  phase: '2.7.3',
  measuredAt: new Date().toISOString(),
  measurement: 'Source photographs and exported PNG dimensions measured with sharp.metadata().',
  sourcePhotographs: photoRecords,
  cardRenders: renderRecords,
  resolutionLimit: {
    enhancement: 'None. No AI upscale, sharpening, or invented photographic detail is applied.',
    twoX: 'The 2x review PNGs are actual renderer outputs. Their visible photo detail remains limited by each listed source image and the card crop.',
    fourX: 'The 4x PNGs are capped raster stress tests. Larger output dimensions do not add source-photo pixels or recover detail.',
  },
  nativePixelCrops,
  boards: boardSources,
};
await writeFile(path.join(finalDir, 'source-resolution.json'), `${JSON.stringify(resolution, null, 2)}\n`);

console.log(`Created 10 award-final boards in ${relative(finalDir)} and measured all three source photographs with Sharp.`);

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/qa/expressive-precision');
const EXPORTS = path.join(OUT, 'exports');
const BEFORE_EXPORTS = path.join(ROOT, 'docs/qa/precision-craft/exports');
const BACKGROUND = '#171a1d';
const PAPER = '#ede6d8';
const GOLD = '#cfad72';
const MUTED = '#aaa69d';
const MAX_DIMENSION = 3000;
const IMAGE_SCALE = 2;

const FAMILIES = [
  { id: 'cinematic', label: 'CINEMATIC · C2', language: 'OPEN FRAME · PHOTO FIRST · INTERRUPTED LINES' },
  { id: 'editorial', label: 'EDITORIAL · E2', language: 'SCULPTED PAPER · PHOTO COLLISION · ASYMMETRIC SILHOUETTE' },
  { id: 'id-card', label: 'IDENTITY · I3', language: 'STRUCTURED GRID · PARTIAL RULE · CONTROLLED OFFSET' },
];

const RATIOS = [
  { id: '1x1', label: '1:1' },
  { id: '4x5', label: '4:5' },
  { id: '3x4', label: '3:4' },
  { id: '9x16', label: '9:16' },
  { id: '16x9', label: '16:9' },
];

const MATRIX_CASES = [
  { id: 'latin', locale: 'en', name: 'Coner', label: 'LATIN' },
  { id: 'ko', locale: 'ko', name: '모서리', label: 'KO' },
  { id: 'ja', locale: 'ja', name: 'コナー', label: 'JA' },
];

const NAME_CASES = [
  ...MATRIX_CASES,
  { id: 'ko-long', locale: 'ko', name: '모험가코너', label: 'KOREAN · LONG' },
  { id: 'kanji', locale: 'ja', name: '光月', label: 'JAPANESE · KANJI' },
];

const STRESS_CASES = [
  { id: 'stress-ko', locale: 'ko', name: '모서리의붉은빛모험기록' },
  { id: 'stress-ja', locale: 'ja', name: 'コナー・クリムゾンホライズン' },
  { id: 'stress-latin', locale: 'en', name: 'Seraphine of the Ember Bloom' },
];

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function labelSvg(width, height, lines, background = BACKGROUND) {
  const text = lines.map((line) => {
    const x = line.x ?? 32;
    const y = line.y;
    const color = line.color ?? PAPER;
    const size = line.size ?? 18;
    const weight = line.weight ?? 400;
    const spacing = line.spacing ?? 0;
    return '<text x="' + x + '" y="' + y + '" fill="' + color
      + '" font-family="Arial, sans-serif" font-size="' + size
      + '" font-weight="' + weight + '" letter-spacing="' + spacing
      + '">' + xml(line.text) + '</text>';
  }).join('');
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width
      + '" height="' + height + '"><rect width="100%" height="100%" fill="'
      + background + '"/>' + text + '</svg>',
  );
}

async function requireFile(file, description) {
  try {
    await fs.access(file);
  } catch {
    throw new Error(description + ' is missing: ' + path.relative(ROOT, file));
  }
  return file;
}

function exportFile(family, caseId, ratio) {
  return path.join(EXPORTS, family + '-' + caseId + '-' + ratio + '-2x.png');
}

async function loadExportFile(imagePath, description, expected = {}) {
  await requireFile(imagePath, description + ' PNG');
  const recordPath = imagePath.replace(/\.png$/u, '.json');
  await requireFile(recordPath, description + ' JSON record');
  const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height || !record.logical?.width || !record.logical?.height) {
    throw new Error(description + ' record lacks PNG or logical dimensions');
  }
  const pixelScaleX = metadata.width / record.logical.width;
  const pixelScaleY = metadata.height / record.logical.height;
  if (record.size?.width !== metadata.width || record.size?.height !== metadata.height
    || record.size?.scale !== IMAGE_SCALE || Math.abs(pixelScaleX - pixelScaleY) > 0.01) {
    throw new Error(description + ' record does not match its 2× PNG geometry');
  }
  if (expected.family && record.family !== expected.family) {
    throw new Error(description + ' record family is ' + record.family + ', expected ' + expected.family);
  }
  if (expected.ratio && record.ratio !== expected.ratio) {
    throw new Error(description + ' record ratio is ' + record.ratio + ', expected ' + expected.ratio);
  }
  if (expected.locale && record.locale !== expected.locale) {
    throw new Error(description + ' record locale is ' + record.locale + ', expected ' + expected.locale);
  }
  if (expected.name && record.character?.name !== expected.name) {
    throw new Error(description + ' character name is ' + record.character?.name + ', expected ' + expected.name);
  }
  return { imagePath, record, metadata, pixelScaleX, pixelScaleY };
}

async function loadCase(family, caseInfo, ratio) {
  const ratioInfo = RATIOS.find((item) => item.id === ratio);
  const expectedRatio = ratioInfo?.label;
  return loadExportFile(
    exportFile(family.id, caseInfo.id, ratio),
    family.label + ' ' + caseInfo.label + ' ' + ratio,
    { family: family.id, ratio: expectedRatio, locale: caseInfo.locale, name: caseInfo.name },
  );
}

async function crop(fileOrBuffer, rect) {
  const meta = await sharp(fileOrBuffer).metadata();
  const left = Math.max(0, Math.min(meta.width - 1, Math.floor(rect.left)));
  const top = Math.max(0, Math.min(meta.height - 1, Math.floor(rect.top)));
  const width = Math.max(1, Math.min(meta.width - left, Math.ceil(rect.width)));
  const height = Math.max(1, Math.min(meta.height - top, Math.ceil(rect.height)));
  return sharp(fileOrBuffer).extract({ left, top, width, height }).png().toBuffer();
}

async function fitPanel(source, width, height) {
  return sharp(source)
    .resize(width, height, { fit: 'contain', background: BACKGROUND, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function writeBoard(name, width, height, layers) {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(name + ' exceeds ' + MAX_DIMENSION + 'px (' + width + '×' + height + ')');
  }
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
}

function rectFrom(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x ?? value.left);
  const y = Number(value.y ?? value.top);
  const width = Number(value.width ?? (Number(value.right) - x));
  const height = Number(value.height ?? (Number(value.bottom) - y));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function namedRect(collection, key) {
  if (Array.isArray(collection)) {
    const matches = collection
      .filter((item) => item && (item.field === key || item.name === key || item.key === key || item.id === key))
      .map(rectFrom)
      .filter(Boolean);
    return matches.length > 1 ? unionRects(matches) : (matches[0] ?? null);
  }
  if (!collection || typeof collection !== 'object') return null;
  const namedValue = collection[key];
  const direct = Array.isArray(namedValue)
    ? (() => {
      const matches = namedValue.map(rectFrom).filter(Boolean);
      return matches.length > 1 ? unionRects(matches) : (matches[0] ?? null);
    })()
    : rectFrom(namedValue);
  if (direct) return direct;
  return rectFrom(collection);
}

function fieldRect(item, fieldName, preferInk = true) {
  const record = item.record;
  if (preferInk && fieldName === 'name') {
    const inkSources = [
      record.nameInkBounds,
      record.inkBounds,
      record.inkBoundsByField,
      record.nameBoxes,
      record.nameBox,
    ];
    for (const source of inkSources) {
      const result = namedRect(source, 'name');
      if (result) return result;
    }
  }
  const savedField = record.fields?.find((entry) => entry.field === fieldName);
  const result = rectFrom(savedField);
  if (!result) throw new Error('Missing saved field bounds for ' + fieldName + ' in ' + path.basename(item.imagePath));
  if (fieldName === 'name') {
    const optical = record.opticalMetrics ?? record.optical;
    const inkHeightCqi = Number.parseFloat(optical?.opticalHeight ?? optical?.height ?? optical?.fit?.height);
    const logicalWidth = Number.parseFloat(record.logical?.width);
    if (Number.isFinite(inkHeightCqi) && inkHeightCqi > 0 && Number.isFinite(logicalWidth) && logicalWidth > 0) {
      const inkHeight = inkHeightCqi * logicalWidth / 100;
      result.height = Math.min(result.height, inkHeight + 2);
      return result;
    }
    const leading = Number.parseFloat(optical?.leading);
    const lineCount = Number.parseFloat(optical?.nameLines ?? optical?.lines ?? 1);
    if (Number.isFinite(leading) && leading > 0 && Number.isFinite(lineCount) && lineCount > 0) {
      result.height = Math.min(result.height, leading * lineCount);
    }
  }
  return result;
}

function savedFieldBox(item, fieldName) {
  const value = item.record.fields?.find((entry) => entry.field === fieldName);
  const result = rectFrom(value);
  if (!result) throw new Error('Missing saved field box for ' + fieldName + ' in ' + path.basename(item.imagePath));
  return result;
}

async function cropSharedField(items, fieldName, marginPixels = 24) {
  const fields = items.map((item) => savedFieldBox(item, fieldName));
  const first = items[0];
  for (const item of items.slice(1)) {
    if (Math.abs(item.pixelScaleX - first.pixelScaleX) > 0.01
      || Math.abs(item.pixelScaleY - first.pixelScaleY) > 0.01) {
      throw new Error('Shared ' + fieldName + ' crop needs matching export pixel scales');
    }
  }
  const sourceWidth = Math.ceil(Math.max(...fields.map((field) => field.width)) * first.pixelScaleX);
  const sourceHeight = Math.ceil(Math.max(...fields.map((field) => field.height)) * first.pixelScaleY);
  const cropWidth = sourceWidth + marginPixels * 2;
  const cropHeight = sourceHeight + marginPixels * 2;
  const crops = await Promise.all(items.map((item, index) => {
    const field = fields[index];
    return crop(item.imagePath, {
      left: field.x * item.pixelScaleX - marginPixels,
      top: field.y * item.pixelScaleY - marginPixels,
      width: cropWidth,
      height: cropHeight,
    });
  }));
  const sizes = await Promise.all(crops.map((buffer) => sharp(buffer).metadata()));
  if (sizes.some((size) => size.width !== cropWidth || size.height !== cropHeight)) {
    throw new Error('Shared ' + fieldName + ' crop was clipped at the export edge');
  }
  return crops;
}

function savedNameFontSize(item) {
  const name = item.record.character?.name;
  const beforeStyle = item.record.textStyles?.find((style) => style.text === name);
  return beforeStyle?.fontSize ?? item.record.optical?.fontSize ?? 'not recorded';
}

function opticalMetricLabel(item) {
  const metrics = item.record.opticalMetrics ?? item.record.optical;
  if (!metrics || typeof metrics !== 'object') {
    throw new Error('Missing saved optical name metrics in ' + path.basename(item.imagePath));
  }
  const fit = metrics.fit ?? metrics;
  const pick = (...keys) => {
    for (const key of keys) {
      if (fit[key] !== undefined && fit[key] !== null) return fit[key];
      if (metrics[key] !== undefined && metrics[key] !== null) return metrics[key];
    }
    return undefined;
  };
  const format = (value) => {
    if (value === undefined) return null;
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number.toFixed(1) : String(value);
  };
  const size = format(pick('size', 'displaySize', 'fitSize', 'opticalSize', 'dataOpticalSize', 'data-optical-size'));
  const width = format(pick('width', 'visualWidth', 'fitWidth', 'opticalWidth', 'dataOpticalWidth', 'data-optical-width'));
  const height = format(pick('height', 'visualHeight', 'fitHeight', 'opticalHeight', 'dataOpticalHeight', 'data-optical-height'));
  const fontSize = format(pick('fontSize'));
  const ink = Number.parseFloat(pick('ink', 'visualInk', 'opticalInk', 'dataOpticalInk', 'data-optical-ink'));
  const referenceInk = Number.parseFloat(pick('referenceInk', 'opticalReferenceInk', 'dataOpticalReferenceInk', 'data-optical-reference-ink'));
  const directRatio = format(pick('inkRatio', 'referenceInkRatio', 'visualInkRatio'));
  const ratio = directRatio
    ?? (Number.isFinite(ink) && Number.isFinite(referenceInk) && referenceInk > 0
      ? (ink / referenceInk).toFixed(2)
      : null);
  const parts = [];
  if (size) parts.push('SIZE ' + size + ' CQI');
  if (fontSize) parts.push('FONT ' + fontSize + ' PX');
  if (width && height) parts.push('BOX ' + width + '×' + height + ' CQI');
  if (ratio) parts.push('INK / REF ' + ratio + '×');
  return parts.length ? parts.join(' · ') : 'OPTICAL METRICS SAVED IN EXPORT JSON';
}

function unionRects(rects, paddingX = 0, paddingY = paddingX) {
  const left = Math.min(...rects.map((rect) => rect.x)) - paddingX;
  const top = Math.min(...rects.map((rect) => rect.y)) - paddingY;
  const right = Math.max(...rects.map((rect) => rect.x + rect.width)) + paddingX;
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height)) + paddingY;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function physicalRect(item, logicalRect, paddingPixels = 0) {
  const left = Math.floor(logicalRect.x * item.pixelScaleX - paddingPixels);
  const top = Math.floor(logicalRect.y * item.pixelScaleY - paddingPixels);
  const right = Math.ceil((logicalRect.x + logicalRect.width) * item.pixelScaleX + paddingPixels);
  const bottom = Math.ceil((logicalRect.y + logicalRect.height) * item.pixelScaleY + paddingPixels);
  const clippedLeft = Math.max(0, Math.min(item.metadata.width - 1, left));
  const clippedTop = Math.max(0, Math.min(item.metadata.height - 1, top));
  return {
    left: clippedLeft,
    top: clippedTop,
    width: Math.max(1, Math.min(item.metadata.width - clippedLeft, right - clippedLeft)),
    height: Math.max(1, Math.min(item.metadata.height - clippedTop, bottom - clippedTop)),
  };
}

async function cropField(item, fieldName, paddingPixels = 16) {
  return crop(item.imagePath, physicalRect(item, fieldRect(item, fieldName), paddingPixels));
}

async function cropFields(item, fieldNames, paddingPixels = 28) {
  const rects = fieldNames.map((name) => fieldRect(item, name));
  return crop(item.imagePath, physicalRect(item, unionRects(rects), paddingPixels));
}

function fractionRect(item, fraction) {
  const left = fraction.x * item.metadata.width;
  const top = fraction.y * item.metadata.height;
  return {
    left,
    top,
    width: fraction.width * item.metadata.width,
    height: fraction.height * item.metadata.height,
  };
}

function ruleRect(item, rule) {
  const marginX = Math.max(8, Math.min(30, rule.width * item.pixelScaleX * 0.025));
  const lineHeight = Math.max(1, rule.height * item.pixelScaleY);
  return {
    left: rule.x * item.pixelScaleX - marginX,
    top: rule.y * item.pixelScaleY - 12,
    width: rule.width * item.pixelScaleX + marginX * 2,
    height: lineHeight + 24,
  };
}

function boardHeader(width, height, title, subtitle) {
  return labelSvg(width, height, [
    { x: 34, y: 48, text: title, size: 27, weight: 700, color: GOLD, spacing: 1 },
    { x: 34, y: 88, text: subtitle, size: 16, color: MUTED },
  ]);
}

async function addLabeledPanel(layers, label, source, left, top, width, height, options = {}) {
  const labelHeight = options.labelHeight ?? 36;
  const fontSize = options.fontSize ?? 15;
  layers.push({
    input: labelSvg(width, labelHeight, [
      { x: 10, y: labelHeight - 10, text: label, size: fontSize, weight: 700, color: options.color ?? PAPER },
    ]),
    left,
    top,
  });
  layers.push({
    input: await fitPanel(source, width - 12, height),
    left: left + 6,
    top: top + labelHeight,
  });
}

async function composeNameSizeComparison(nameCases) {
  const width = 2940;
  const headerHeight = 132;
  const padding = 24;
  const gapX = 18;
  const columnWidth = Math.floor((width - padding * 2 - gapX * 2) / 3);
  const rowHeight = 220;
  const height = headerHeight + NAME_CASES.length * rowHeight + 80;
  const layers = [{ input: boardHeader(width, headerHeight, '01 · SCRIPT SIZE COMPARISON', 'Five actual 4:5 name crops · same family row · source bounds from each export JSON'), left: 0, top: 0 }];
  for (let familyIndex = 0; familyIndex < FAMILIES.length; familyIndex += 1) {
    const family = FAMILIES[familyIndex];
    const left = padding + familyIndex * (columnWidth + gapX);
    layers.push({
      input: labelSvg(columnWidth, 42, [
        { x: 8, y: 28, text: family.label, size: 15, weight: 700, color: GOLD },
      ]),
      left,
      top: headerHeight,
    });
  }
  for (let row = 0; row < NAME_CASES.length; row += 1) {
    const caseInfo = NAME_CASES[row];
    const top = headerHeight + 42 + row * rowHeight;
    for (let familyIndex = 0; familyIndex < FAMILIES.length; familyIndex += 1) {
      const family = FAMILIES[familyIndex];
      const item = nameCases.get(family.id + ':' + caseInfo.id);
      const left = padding + familyIndex * (columnWidth + gapX);
      layers.push({
        input: labelSvg(columnWidth, 48, [
          { x: 8, y: 20, text: caseInfo.label + ' · ' + item.record.character.name, size: 15, weight: 700 },
          { x: 8, y: 40, text: opticalMetricLabel(item), size: 13, color: MUTED },
        ]),
        left,
        top,
      });
      const name = await cropField(item, 'name', 24);
      layers.push({ input: await fitPanel(name, columnWidth - 18, 146), left: left + 9, top: top + 50 });
    }
  }
  await writeBoard('01-script-size-comparison.png', width, height, layers);
}

async function composeKoreanBeforeAfter(oldKo, newKo) {
  const width = 2800;
  const headerHeight = 132;
  const padding = 28;
  const gapX = 24;
  const panelWidth = Math.floor((width - padding * 2 - gapX) / 2);
  const rowHeight = 570;
  const height = headerHeight + FAMILIES.length * rowHeight + 34;
  const layers = [{ input: boardHeader(width, headerHeight, '02 · KOREAN NAME · BEFORE / AFTER', 'Frozen phase 2.7.6 stress exports vs final phase 2.7.7 · identical short KO name in all three families'), left: 0, top: 0 }];
  for (let familyIndex = 0; familyIndex < FAMILIES.length; familyIndex += 1) {
    const family = FAMILIES[familyIndex];
    const top = headerHeight + familyIndex * rowHeight;
    const before = oldKo.get(family.id);
    const after = newKo.get(family.id);
    const [beforeCrop, afterCrop] = await cropSharedField([before, after], 'name', 24);
    for (const entry of [
      { item: before, title: '2.7.6 · BEFORE', crop: beforeCrop, left: padding },
      { item: after, title: '2.7.7 · AFTER', crop: afterCrop, left: padding + panelWidth + gapX },
    ]) {
      const left = entry.left;
      layers.push({
        input: labelSvg(panelWidth, 42, [
          { x: 12, y: 29, text: family.label + ' · ' + entry.title, size: 16, weight: 700, color: GOLD },
        ]),
        left,
        top,
      });
      layers.push({ input: await fitPanel(entry.item.imagePath, 352, 440), left: left + 12, top: top + 52 });
      layers.push({
        input: labelSvg(panelWidth - 388, 30, [
          { x: 8, y: 21, text: 'SHARED NAME ROI · SAME SOURCE PIXEL SCALE', size: 13, weight: 700, color: MUTED },
        ]),
        left: left + 380,
        top: top + 84,
      });
      layers.push({ input: await fitPanel(entry.crop, panelWidth - 398, 205), left: left + 386, top: top + 118 });
      layers.push({
        input: labelSvg(panelWidth - 388, 26, [
          { x: 8, y: 19, text: 'CSS FONT SIZE · ' + savedNameFontSize(entry.item), size: 13, weight: 600 },
        ]),
        left: left + 380,
        top: top + 332,
      });
    }
  }
  await writeBoard('02-korean-name-before-after.png', width, height, layers);
}

async function composeEditorialShape(before, after) {
  const width = 2800;
  const headerHeight = 132;
  const padding = 26;
  const gap = 24;
  const panelWidth = Math.floor((width - padding * 2 - gap) / 2);
  const cardWidth = 610;
  const cardHeight = 762;
  const height = headerHeight + 42 + cardHeight + 58;
  const layers = [{ input: boardHeader(width, headerHeight, '03 · EDITORIAL SHAPE · BEFORE / AFTER', 'Phase 2.7.6 straight boundary vs phase 2.7.7 controlled irregularity · real Coner + RDM export pixels'), left: 0, top: 0 }];
  for (const entry of [
    { item: before, title: '2.7.6 · CLEAN BUT RIGID', left: padding },
    { item: after, title: '2.7.7 · CLEAN AND EXPRESSIVE', left: padding + panelWidth + gap },
  ]) {
    layers.push({
      input: labelSvg(panelWidth, 36, [
        { x: 12, y: 25, text: 'EDITORIAL · E2 · ' + entry.title, size: 14, weight: 700, color: GOLD },
      ]),
      left: entry.left,
      top: headerHeight,
    });
    layers.push({ input: await fitPanel(entry.item.imagePath, cardWidth, cardHeight), left: entry.left + 18, top: headerHeight + 42 });
    const edgeCrop = await crop(entry.item.imagePath, fractionRect(entry.item, { x: 0.30, y: 0.14, width: 0.50, height: 0.57 }));
    const rdmCrop = await crop(entry.item.imagePath, fractionRect(entry.item, { x: 0.30, y: 0.70, width: 0.70, height: 0.28 }));
    layers.push({
      input: labelSvg(panelWidth - 650, 30, [
        { x: 8, y: 21, text: 'PAPER / PHOTO BOUNDARY · ACTUAL PNG CROP', size: 12, weight: 700, color: MUTED },
      ]),
      left: entry.left + 640,
      top: headerHeight + 126,
    });
    layers.push({
      input: await fitPanel(edgeCrop, panelWidth - 668, 220),
      left: entry.left + 648,
      top: headerHeight + 160,
    });
    layers.push({
      input: labelSvg(panelWidth - 650, 30, [
        { x: 8, y: 21, text: 'RDM / PAPER COLLISION · ACTUAL PNG CROP', size: 12, weight: 700, color: MUTED },
      ]),
      left: entry.left + 640,
      top: headerHeight + 414,
    });
    layers.push({
      input: await fitPanel(rdmCrop, panelWidth - 668, 220),
      left: entry.left + 648,
      top: headerHeight + 448,
    });
  }
  await writeBoard('03-editorial-shape-before-after.png', width, height, layers);
}

async function ensureMonochromeOutline(item) {
  const raw = await sharp(item.imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = raw.info.channels;
  if (channels < 3) return;
  for (let index = 0; index < raw.data.length; index += channels) {
    const first = raw.data[index];
    const second = raw.data[index + 1];
    const third = raw.data[index + 2];
    if (Math.max(first, second, third) - Math.min(first, second, third) > 1) {
      throw new Error('Editorial outline export contains color pixels; expected a black-and-white source export');
    }
  }
}

async function composeEditorialOutline(outline) {
  await ensureMonochromeOutline(outline);
  const width = 2200;
  const headerHeight = 142;
  const imageWidth = 1120;
  const imageHeight = 1400;
  const height = headerHeight + imageHeight + 50;
  const layers = [
    { input: boardHeader(width, headerHeight, '04 · EDITORIAL SHAPE OUTLINE', 'Actual monochrome 2× outline export · paper silhouette, RDM and Coner only · no photo or texture'), left: 0, top: 0 },
    { input: await fitPanel(outline.imagePath, imageWidth, imageHeight), left: Math.floor((width - imageWidth) / 2), top: headerHeight },
  ];
  await writeBoard('04-editorial-shape-outline.png', width, height, layers);
}

async function composeCinematicFrameDetail(item) {
  const headerHeight = 132;
  const padding = 28;
  const fullWidth = 500;
  const fullHeight = 625;
  const detailWidth = 990;
  const detailHeight = 340;
  const gapX = 20;
  const gapY = 16;
  const details = [
    { label: 'TOP LEFT · OPEN FRAME', rect: { x: 0, y: 0, width: 0.40, height: 0.24 } },
    { label: 'TOP EDGE · INTERRUPTED', rect: { x: 0.33, y: 0, width: 0.40, height: 0.19 } },
    { label: 'TOP RIGHT · FRAME END', rect: { x: 0.65, y: 0, width: 0.34, height: 0.24 } },
    { label: 'LOWER EDGE · METADATA BREAK', rect: { x: 0.02, y: 0.78, width: 0.96, height: 0.22 } },
  ];
  const gridWidth = detailWidth * 2 + gapX;
  const boardWidth = padding * 2 + fullWidth + 24 + gridWidth;
  const boardHeight = headerHeight + 34 + 2 * (detailHeight + 34) + gapY + 20;
  const layers = [
    { input: boardHeader(boardWidth, headerHeight, '05 · CINEMATIC FRAME DETAIL', 'C2 open-frame language · full card and detail windows cropped from the actual 4:5 2× export'), left: 0, top: 0 },
    { input: await fitPanel(item.imagePath, fullWidth, fullHeight), left: padding + 6, top: headerHeight + 38 },
  ];
  const right = padding + fullWidth + 24;
  for (let index = 0; index < details.length; index += 1) {
    const entry = details[index];
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = right + column * (detailWidth + gapX);
    const top = headerHeight + 34 + row * (detailHeight + gapY);
    const sourceCrop = await crop(item.imagePath, fractionRect(item, entry.rect));
    await addLabeledPanel(layers, entry.label, sourceCrop, left, top, detailWidth, detailHeight, { labelHeight: 34, fontSize: 13 });
  }
  await writeBoard('05-cinematic-frame-detail.png', boardWidth, boardHeight, layers);
}

async function composeIdentityRuleDetail(item) {
  const savedRules = Array.isArray(item.record.rules) ? item.record.rules : [];
  const savedHeaders = item.record.headers ?? item.record.recordHeaders ?? [];
  const sections = [
    ...savedHeaders.map((rect) => ({
      rect,
      label: String(rect.text ?? 'SECTION').toUpperCase() + ' · PARTIAL RAIL',
      rule: false,
    })),
    ...savedRules.map((rect, index) => ({
      rect,
      label: 'RULE ' + String(index + 1).padStart(2, '0') + ' · ' + Number(rect.width).toFixed(1) + ' LOGICAL PX',
      rule: true,
    })),
  ].sort((left, right) => left.rect.y - right.rect.y);
  if (sections.length === 0) {
    throw new Error('Identity rule detail requires saved rule or heading bounds');
  }
  const width = 2780;
  const headerHeight = 132;
  const padding = 24;
  const fullWidth = 505;
  const fullHeight = 631;
  const gapX = 22;
  const ruleWidth = 1040;
  const ruleHeight = 286;
  const cols = 2;
  const rows = Math.ceil(sections.length / cols);
  const ruleGridHeight = rows * (ruleHeight + 14);
  const height = headerHeight + Math.max(fullHeight + 52, ruleGridHeight) + 50;
  const layers = [
    { input: boardHeader(width, headerHeight, '06 · IDENTITY RULE DETAIL', 'I3 structured grid · actual final rules and saved logical bounds mapped to their source PNG pixels'), left: 0, top: 0 },
    { input: await fitPanel(item.imagePath, fullWidth, fullHeight), left: padding + 4, top: headerHeight + 42 },
  ];
  const gridLeft = padding + fullWidth + 32;
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const column = index % cols;
    const row = Math.floor(index / cols);
    const left = gridLeft + column * (ruleWidth + gapX);
    const top = headerHeight + 24 + row * (ruleHeight + 14);
    const ruleCrop = await crop(
      item.imagePath,
      section.rule ? ruleRect(item, section.rect) : physicalRect(item, rectFrom(section.rect), 8),
    );
    await addLabeledPanel(
      layers,
      section.label,
      ruleCrop,
      left,
      top,
      ruleWidth,
      ruleHeight,
      { labelHeight: 34, fontSize: 13 },
    );
  }
  await writeBoard('06-identity-rule-detail.png', width, height, layers);
}

async function shapeDetail(family, item) {
  if (family.id === 'cinematic') {
    return crop(item.imagePath, fractionRect(item, { x: 0, y: 0, width: 0.56, height: 0.22 }));
  }
  if (family.id === 'editorial') {
    return cropFields(item, ['name', 'jobAbbreviation'], 36);
  }
  const firstRule = item.record.rules?.[0];
  if (firstRule) return crop(item.imagePath, ruleRect(item, firstRule));
  const firstHeader = (item.record.headers ?? item.record.recordHeaders)?.[0];
  if (firstHeader) return crop(item.imagePath, physicalRect(item, rectFrom(firstHeader), 24));
  return cropField(item, 'name', 24);
}

async function composeFamilyShapeLanguage(familyCards) {
  const width = 2940;
  const headerHeight = 132;
  const padding = 24;
  const gap = 18;
  const columnWidth = Math.floor((width - padding * 2 - gap * 2) / 3);
  const cardWidth = 710;
  const cardHeight = 888;
  const detailHeight = 170;
  const height = headerHeight + 44 + cardHeight + detailHeight + 55;
  const layers = [{ input: boardHeader(width, headerHeight, '07 · FAMILY SHAPE LANGUAGE', 'Each crop comes from its actual final 4:5 export · shape and line behavior stay distinct by master'), left: 0, top: 0 }];
  for (let index = 0; index < FAMILIES.length; index += 1) {
    const family = FAMILIES[index];
    const item = familyCards.get(family.id);
    const left = padding + index * (columnWidth + gap);
    layers.push({
      input: labelSvg(columnWidth, 42, [
        { x: 8, y: 28, text: family.label, size: 15, weight: 700, color: GOLD },
      ]),
      left,
      top: headerHeight,
    });
    layers.push({ input: await fitPanel(item.imagePath, cardWidth, cardHeight), left: left + 10, top: headerHeight + 48 });
    const detail = await shapeDetail(family, item);
    layers.push({
      input: labelSvg(columnWidth, 31, [
        { x: 8, y: 22, text: family.language, size: 11, weight: 700, color: MUTED },
      ]),
      left,
      top: headerHeight + 48 + cardHeight,
    });
    layers.push({ input: await fitPanel(detail, columnWidth - 18, detailHeight), left: left + 9, top: headerHeight + 82 + cardHeight });
  }
  await writeBoard('07-family-shape-language.png', width, height, layers);
}

async function composeRatioScriptMatrix(matrix) {
  const width = 2940;
  const headerHeight = 138;
  const padding = 22;
  const familyColumn = 155;
  const gapX = 8;
  const cellWidth = Math.floor((width - padding * 2 - familyColumn - gapX * 4) / RATIOS.length);
  const rowHeight = 232;
  const imageWidth = 142;
  const imageHeight = 146;
  const height = headerHeight + FAMILIES.length * rowHeight + 28;
  const layers = [{ input: boardHeader(width, headerHeight, '08 · RATIO × SCRIPT MATRIX · 45 EXPORTS', '3 masters × 5 ratios × Latin / Korean / Japanese · every panel is an actual final 2× export'), left: 0, top: 0 }];
  for (let familyIndex = 0; familyIndex < FAMILIES.length; familyIndex += 1) {
    const family = FAMILIES[familyIndex];
    const top = headerHeight + familyIndex * rowHeight;
    layers.push({
      input: labelSvg(familyColumn, 52, [
        { x: 4, y: 24, text: family.label, size: 12, weight: 700, color: GOLD },
        { x: 4, y: 43, text: 'EN · KO · JA', size: 11, color: MUTED },
      ]),
      left: padding,
      top: top + 82,
    });
    for (let ratioIndex = 0; ratioIndex < RATIOS.length; ratioIndex += 1) {
      const ratio = RATIOS[ratioIndex];
      const left = padding + familyColumn + ratioIndex * (cellWidth + gapX);
      layers.push({
        input: labelSvg(cellWidth, 27, [
          { x: 7, y: 19, text: ratio.label + ' · ' + ratio.id, size: 12, weight: 700, color: GOLD },
        ]),
        left,
        top: top + 4,
      });
      for (let scriptIndex = 0; scriptIndex < MATRIX_CASES.length; scriptIndex += 1) {
        const caseInfo = MATRIX_CASES[scriptIndex];
        const item = matrix.get(family.id + ':' + caseInfo.id + ':' + ratio.id);
        const x = left + 8 + scriptIndex * (imageWidth + 6);
        layers.push({
          input: labelSvg(imageWidth, 24, [
            { x: 4, y: 17, text: caseInfo.label, size: 11, weight: 700, color: scriptIndex === 0 ? PAPER : MUTED },
          ]),
          left: x,
          top: top + 33,
        });
        layers.push({ input: await fitPanel(item.imagePath, imageWidth - 4, imageHeight), left: x + 2, top: top + 59 });
      }
    }
  }
  await writeBoard('08-ratio-script-matrix.png', width, height, layers);
}

async function composeMasterTriptych(familyCards) {
  const width = 2940;
  const headerHeight = 130;
  const padding = 26;
  const gap = 26;
  const panelWidth = Math.floor((width - padding * 2 - gap * 2) / 3);
  const imageHeight = 1140;
  const height = headerHeight + 48 + imageHeight + 44;
  const layers = [{ input: boardHeader(width, headerHeight, '09 · MASTER TRIPTYCH', 'Cinematic / Editorial / Identity · 4:5 Latin Coner · actual phase 2.7.7 master exports'), left: 0, top: 0 }];
  for (let index = 0; index < FAMILIES.length; index += 1) {
    const family = FAMILIES[index];
    const item = familyCards.get(family.id);
    const left = padding + index * (panelWidth + gap);
    layers.push({
      input: labelSvg(panelWidth, 42, [
        { x: 8, y: 28, text: family.label, size: 15, weight: 700, color: GOLD },
      ]),
      left,
      top: headerHeight,
    });
    layers.push({ input: await fitPanel(item.imagePath, panelWidth - 8, imageHeight), left: left + 4, top: headerHeight + 48 });
  }
  await writeBoard('09-master-triptych.png', width, height, layers);
}

async function main() {
  const matrix = new Map();
  const nameCases = new Map();
  const stressCases = new Map();
  const familyCards = new Map();
  const oldKo = new Map();

  for (const family of FAMILIES) {
    for (const ratio of RATIOS) {
      for (const caseInfo of MATRIX_CASES) {
        const item = await loadCase(family, caseInfo, ratio.id);
        matrix.set(family.id + ':' + caseInfo.id + ':' + ratio.id, item);
        if (ratio.id === '4x5' && caseInfo.id === 'latin') familyCards.set(family.id, item);
        if (ratio.id === '4x5') nameCases.set(family.id + ':' + caseInfo.id, item);
      }
    }
    for (const caseInfo of NAME_CASES.filter((item) => !MATRIX_CASES.some((base) => base.id === item.id))) {
      nameCases.set(family.id + ':' + caseInfo.id, await loadCase(family, caseInfo, '4x5'));
    }
    for (const caseInfo of STRESS_CASES) {
      const item = await loadCase(family, caseInfo, '4x5');
      stressCases.set(family.id + ':' + caseInfo.id, item);
    }
    const beforeFile = path.join(BEFORE_EXPORTS, 'stress-' + family.id + '-ko-4x5-2x.png');
    const before = await loadExportFile(beforeFile, 'Frozen phase 2.7.6 ' + family.label + ' Korean stress baseline', {
      family: family.id,
      ratio: '4:5',
      locale: 'ko',
      name: '모서리',
    });
    oldKo.set(family.id, before);
  }

  const beforeEditorial = await loadExportFile(
    path.join(BEFORE_EXPORTS, 'editorial-en-4x5-2x.png'),
    'Frozen phase 2.7.6 Editorial Coner baseline',
    { family: 'editorial', ratio: '4:5', locale: 'en', name: 'Coner' },
  );
  const afterEditorial = matrix.get('editorial:latin:4x5');
  const outline = await loadExportFile(
    path.join(EXPORTS, 'editorial-outline-4x5-2x.png'),
    'Final Editorial monochrome outline export',
    { family: 'editorial', ratio: '4:5' },
  );

  await fs.mkdir(OUT, { recursive: true });
  await composeNameSizeComparison(nameCases);
  await composeKoreanBeforeAfter(oldKo, new Map(FAMILIES.map((family) => [family.id, matrix.get(family.id + ':ko:4x5')])));
  await composeEditorialShape(beforeEditorial, afterEditorial);
  await composeEditorialOutline(outline);
  await composeCinematicFrameDetail(familyCards.get('cinematic'));
  await composeIdentityRuleDetail(familyCards.get('id-card'));
  await composeFamilyShapeLanguage(familyCards);
  await composeRatioScriptMatrix(matrix);
  await composeMasterTriptych(familyCards);

  const outputs = [
    '01-script-size-comparison.png',
    '02-korean-name-before-after.png',
    '03-editorial-shape-before-after.png',
    '04-editorial-shape-outline.png',
    '05-cinematic-frame-detail.png',
    '06-identity-rule-detail.png',
    '07-family-shape-language.png',
    '08-ratio-script-matrix.png',
    '09-master-triptych.png',
  ];
  for (const name of outputs) {
    const file = path.join(OUT, name);
    const metadata = await sharp(file).metadata();
    const stats = await fs.stat(file);
    console.log(path.relative(ROOT, file) + '\t' + metadata.width + '×' + metadata.height + '\t' + stats.size + ' bytes');
  }
  console.log('Validated 45 ratio/script exports and ' + stressCases.size + ' additional long-name stress exports.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const base = path.join(root, 'docs/qa/phase213-material');
const out = path.join(base, 'comparison');
const families = ['cinematic', 'editorial', 'id-card'];
let previewFiles = {};
const cropTargets = [
  { id: 'cinematic-photo-field', family: 'cinematic', left: 1390, top: 650 },
  { id: 'cinematic-display-name', family: 'cinematic', left: 970, top: 1900 },
  { id: 'editorial-open-paper', family: 'editorial', left: 1740, top: 1730 },
  { id: 'editorial-display-ink', family: 'editorial', left: 1220, top: 2260 },
  { id: 'identity-stock', family: 'id-card', left: 180, top: 2180 },
  { id: 'identity-microtype', family: 'id-card', left: 1290, top: 2380 },
];
const file = (stage, family, variant, suffix) => path.join(base, stage, `qa213-${family}-${variant}-${suffix}`);

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? Number(found.slice(prefix.length)) : fallback;
}

async function waitForFiles(paths, seconds) {
  const deadline = Date.now() + Math.max(0, seconds) * 1000;
  while (true) {
    const missing = [];
    for (const target of paths) {
      try { await fs.access(target); } catch { missing.push(path.relative(root, target).replaceAll('\\', '/')); }
    }
    if (!missing.length) return;
    if (Date.now() >= deadline) throw new Error(`Missing required capture files:\n${missing.join('\n')}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function waitForPreviewFiles(seconds) {
  const candidates = Object.fromEntries(families.map((family) => [family, [
    path.join(base, 'after', `preview-${family}.png`),
    path.join(base, 'after', `preview-${family}.jpg`),
    path.join(base, 'after', `preview-${family}.jpeg`),
  ]]));
  const deadline = Date.now() + Math.max(0, seconds) * 1000;
  while (true) {
    const missing = [];
    for (const [family, options] of Object.entries(candidates)) {
      let match = null;
      for (const candidate of options) {
        try { await fs.access(candidate); match = candidate; break; } catch { /* try next native screenshot extension */ }
      }
      if (match) previewFiles[family] = match;
      else missing.push(`docs/qa/phase213-material/after/preview-${family}.{jpg,jpeg,png}`);
    }
    if (!missing.length) return;
    if (Date.now() >= deadline) throw new Error(`Missing browser preview captures:\n${missing.join('\n')}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function svgLabel(text, width, height, fontSize = 15) {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#172027"/><text x="10" y="${Math.round(height * .66)}" fill="#f3eee5" font-family="Arial,sans-serif" font-size="${fontSize}">${escaped}</text></svg>`);
}

async function dimensions(target) {
  const info = await sharp(target).metadata();
  return { width: info.width, height: info.height, format: info.format, bytes: (await fs.stat(target)).size };
}

function pixelStats(left, right) {
  const dimensionsMatch = left.info.width === right.info.width && left.info.height === right.info.height && left.data.length === right.data.length;
  if (!dimensionsMatch) return {
    dimensionsMatch,
    left: { width: left.info.width, height: left.info.height },
    right: { width: right.info.width, height: right.info.height },
    changedPixels: null,
    meanAbsoluteChannelDifference: null,
    maxChannelDifference: null,
  };
  let changedPixels = 0;
  let totalDifference = 0;
  let maxChannelDifference = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      totalDifference += delta;
      if (delta) changed = true;
      if (delta > maxChannelDifference) maxChannelDifference = delta;
    }
    if (changed) changedPixels++;
  }
  return {
    dimensionsMatch,
    width: left.info.width,
    height: left.info.height,
    totalPixels: left.info.width * left.info.height,
    changedPixels,
    meanAbsoluteChannelDifference: totalDifference / left.data.length,
    maxChannelDifference,
  };
}

async function decodePixels(input) {
  return sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function comparePixels(leftPath, rightPath) {
  const [left, right] = await Promise.all([decodePixels(leftPath), decodePixels(rightPath)]);
  return pixelStats(left, right);
}

async function comparePreviewToExport(previewPath, exportPath) {
  const previewMetadata = await sharp(previewPath).metadata();
  const resizedExport = await sharp(exportPath)
    .resize(432, 540, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const [preview, exported] = await Promise.all([decodePixels(previewPath), decodePixels(resizedExport)]);
  return {
    previewActualFormat: previewMetadata.format ?? null,
    previewDimensions: { width: preview.info.width, height: preview.info.height },
    expectedPreviewDimensions: { width: 432, height: 540 },
    downsample: 'export PNG 2× to 432×540 using Lanczos3',
    interpretation: previewMetadata.format === 'jpeg'
      ? 'Informational decoded-pixel delta; the native JPEG screenshot is lossy and is not expected to match the export bit-for-bit.'
      : 'Informational decoded-pixel delta; this is not a bit-for-bit parity assertion, and a PNG may have been converted from a lossy screenshot.',
    ...pixelStats(preview, exported),
  };
}

async function compareCropPixels(leftPath, rightPath, crop) {
  const size = 200;
  const [left, right] = await Promise.all([
    sharp(leftPath).extract({ left: crop.left, top: crop.top, width: size, height: size }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(rightPath).extract({ left: crop.left, top: crop.top, width: size, height: size }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  return pixelStats(left, right);
}

function normalizedImagePath(source) {
  if (!source) return null;
  try {
    const parsed = new URL(source, 'http://phase213.local');
    const nested = parsed.searchParams.get('url');
    if (nested) return normalizedImagePath(nested);
    return parsed.pathname;
  } catch {
    return source.split(/[?#]/, 1)[0];
  }
}

function normalizedImageSource(source) {
  if (!source) return null;
  try {
    const parsed = new URL(source, 'http://phase213.local');
    const nested = parsed.searchParams.get('url');
    if (nested) parsed.searchParams.set('url', normalizedImageSource(nested));
    parsed.searchParams.sort();
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    return source.split('#', 1)[0];
  }
}

function isMaterialImage(source) {
  return normalizedImagePath(source)?.includes('/images/materials/') ?? false;
}

function readTag(element) {
  return element.tag ?? element.label?.match(/^\d+:([a-z0-9]+)/)?.[1] ?? '';
}

function readText(element, tag) {
  if (typeof element.text === 'string') return element.text;
  if (!['article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'dt', 'dd', 'small'].includes(tag)) return null;
  return element.label?.replace(/^\d+:[a-z0-9-]+(?:\[[^\]]*\])?\s*/i, '').trim() || null;
}

function relativeRect(element, cardRect) {
  if (element.relativeRect) return element.relativeRect;
  if (!element.rect || !cardRect) return null;
  return {
    x: element.rect.x - cardRect.x,
    y: element.rect.y - cardRect.y,
    width: element.rect.width,
    height: element.rect.height,
  };
}

function cleanFont(font) {
  if (!font) return null;
  return {
    family: font.family ?? null,
    size: font.size ?? null,
    weight: font.weight ?? null,
    lineHeight: font.lineHeight ?? null,
    letterSpacing: font.letterSpacing ?? null,
  };
}

function layoutSignature(capture, includeSvg) {
  const geometry = capture?.context?.geometry;
  const cardRect = geometry?.card?.rect;
  const elements = (geometry?.elements ?? []).flatMap((element) => {
    const tag = readTag(element);
    if (!['article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'dt', 'dd', 'small', 'img', 'svg'].includes(tag)) return [];
    if (tag === 'img' && isMaterialImage(element.image?.src)) return [];
    if (tag === 'svg' && !includeSvg) return [];
    const image = element.image ? {
      source: normalizedImageSource(element.image.src),
      naturalWidth: element.image.naturalWidth,
      naturalHeight: element.image.naturalHeight,
    } : null;
    return [{
      tag,
      text: readText(element, tag),
      relativeRect: relativeRect(element, cardRect),
      font: cleanFont(element.font),
      image,
      ...(tag === 'svg' ? { shape: element.svgShape ?? null } : {}),
    }];
  });
  const dataAttributes = geometry?.card?.dataAttributes;
  const attributeRows = dataAttributes && typeof dataAttributes === 'object' ? Object.entries(dataAttributes) : null;
  const attrs = (predicate) => attributeRows
    ? Object.fromEntries(attributeRows.filter(([name]) => predicate(name)).sort(([left], [right]) => left.localeCompare(right)))
    : null;
  const materialImages = (geometry?.elements ?? []).flatMap((element) => element.image && isMaterialImage(element.image.src)
    ? [{
      source: normalizedImageSource(element.image.src),
      naturalWidth: element.image.naturalWidth,
      naturalHeight: element.image.naturalHeight,
      relativeRect: relativeRect(element, cardRect),
    }]
    : []);
  const colors = (geometry?.elements ?? []).flatMap((element) => {
    const tag = readTag(element);
    const text = readText(element, tag);
    const values = element.colors ?? (element.font ? { color: element.font.color } : null);
    if (!values) return [];
    return [{ tag, text, values }];
  });
  const accessibilityMetadata = (geometry?.elements ?? []).flatMap((element) => element.accessibleName
    ? [{ tag: readTag(element), text: readText(element, readTag(element)), accessibleName: element.accessibleName }]
    : []);
  const pictograms = (geometry?.elements ?? []).filter((element) => readTag(element) === 'svg')
    .map((element) => ({
      accessibleName: element.accessibleName ?? null,
      relativeRect: relativeRect(element, cardRect),
      shape: element.svgShape ?? null,
    }));
  return {
    snapshotVersion: geometry?.snapshotVersion ?? null,
    logicalCss: capture?.context?.logicalCss ?? null,
    cardSize: cardRect ? { width: cardRect.width, height: cardRect.height } : null,
    elements,
    cardDataAttributes: attrs((name) => !name.startsWith('data-material-')),
    masterFields: attrs((name) => name.startsWith('data-master-') || name === 'data-design-version'),
    materialDataAttributes: attrs((name) => name.startsWith('data-material-')),
    materialImages,
    colors,
    accessibilityMetadata,
    pictograms,
  };
}

function differences(before, after, path = 'root', result = []) {
  if (Object.is(before, after)) return result;
  if (typeof before === 'number' && typeof after === 'number') {
    const tolerance = /(?:^|\.)(?:x|y|width|height)$/.test(path) ? 0.01 : 0;
    const delta = after - before;
    if (Math.abs(delta) > tolerance) result.push({ field: path, before, after, delta });
    return result;
  }
  const beforeArray = Array.isArray(before);
  const afterArray = Array.isArray(after);
  if (beforeArray && afterArray) {
    if (before.length !== after.length) result.push({ field: `${path}.length`, before: before.length, after: after.length });
    for (let index = 0; index < Math.min(before.length, after.length); index++) differences(before[index], after[index], `${path}[${index}]`, result);
    return result;
  }
  const beforeObject = before !== null && typeof before === 'object';
  const afterObject = after !== null && typeof after === 'object';
  if (beforeObject && afterObject && !beforeArray && !afterArray) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) differences(before[key], after[key], `${path}.${key}`, result);
    return result;
  }
  result.push({ field: path, before, after });
  return result;
}

function checkStatus(before, after, diffs) {
  if (before === null || after === null) return 'unavailable';
  return diffs.length ? 'changed' : 'match';
}

async function imageTile(target, width, height) {
  return sharp(target).resize(width, height, { fit: 'contain', background: '#11171b' }).png().toBuffer();
}

function captureFrom(report, family, variant, format, scale) {
  return report.captures?.find((capture) => capture.family === family
    && capture.variant === variant
    && capture.format === format
    && capture.requestedScale === scale);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function makeOverview() {
  const variants = [
    { stage: 'before', variant: 'default', suffix: 'png-2x.png', label: 'BEFORE · EXPORT' },
    { stage: 'after', preview: true, label: 'AFTER · PREVIEW' },
    { stage: 'after', variant: 'default', suffix: 'png-2x.png', label: 'AFTER · EXPORT' },
    { stage: 'after', variant: 'strong-1_85', suffix: 'png-2x.png', label: 'AFTER · 1.85×' },
    { stage: 'after', variant: 'texture-off', suffix: 'png-2x.png', label: 'AFTER · TEXTURE OFF' },
  ];
  const tileW = 300;
  const tileH = 375;
  const labelH = 38;
  const width = tileW * variants.length;
  const height = (tileH + labelH) * families.length;
  const layers = [];
  for (let row = 0; row < families.length; row++) {
    for (let column = 0; column < variants.length; column++) {
      const item = variants[column];
      const target = item.preview
        ? previewFiles[families[row]]
        : file(item.stage, families[row], item.variant, item.suffix);
      const x = column * tileW;
      const y = row * (tileH + labelH);
      layers.push({ input: svgLabel(`${families[row]} · ${item.label}`, tileW, labelH, 12), left: x, top: y });
      layers.push({ input: await imageTile(target, tileW, tileH), left: x, top: y + labelH });
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#11171b' } }).composite(layers).png({ compressionLevel: 9 }).toFile(path.join(base, 'board-01-overview.png'));
}

async function makeCropBoard(target) {
  const cropSize = 200;
  const zooms = [1, 2, 4];
  const zoomLabels = ['100%', '200%', '400%'];
  const variants = [
    ['before', 'default', 'png-2x', 'BEFORE'],
    ['after', 'default', 'png-2x', 'AFTER · DEFAULT'],
    ['after', 'strong-1_85', 'png-2x', 'AFTER · 1.85×'],
    ['after', 'texture-off', 'png-2x', 'AFTER · TEXTURE OFF'],
  ];
  const labelH = 30;
  const rowLabelW = 190;
  const rowHeight = 800 + labelH;
  const xOrigins = [rowLabelW, rowLabelW + cropSize + 12, rowLabelW + cropSize + 12 + cropSize * 2 + 12];
  const width = rowLabelW + cropSize + cropSize * 2 + cropSize * 4 + 48;
  const height = labelH + variants.length * rowHeight;
  const layers = [{ input: svgLabel(`${target.id} · nearest-neighbor crop zoom`, width, labelH), left: 0, top: 0 }];
  for (let index = 0; index < zooms.length; index++) {
    layers.push({ input: svgLabel(zoomLabels[index], cropSize * zooms[index], labelH, 14), left: xOrigins[index], top: 0 });
  }
  for (let row = 0; row < variants.length; row++) {
    const [stage, variant, suffix, label] = variants[row];
    const source = file(stage, target.family, variant, `${suffix}.png`);
    const metadata = await sharp(source).metadata();
    const left = Math.max(0, Math.min(target.left, (metadata.width ?? 0) - cropSize));
    const top = Math.max(0, Math.min(target.top, (metadata.height ?? 0) - cropSize));
    layers.push({ input: svgLabel(label, rowLabelW, rowHeight, 12), left: 0, top: labelH + row * rowHeight });
    for (let index = 0; index < zooms.length; index++) {
      const zoom = zooms[index];
      const tile = await sharp(source)
        .extract({ left, top, width: cropSize, height: cropSize })
        .resize(cropSize * zoom, cropSize * zoom, { fit: 'fill', kernel: sharp.kernel.nearest })
        .png({ compressionLevel: 9 })
        .toBuffer();
      layers.push({ input: tile, left: xOrigins[index], top: labelH + row * rowHeight + labelH });
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#11171b' } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(base, `board-${target.id}.png`));
}

async function makeFamilyOptionBoard(family) {
  const options = [
    { stage: 'before', variant: 'default', label: 'BEFORE REFERENCE' },
    { stage: 'after', variant: 'default', label: 'A · SUBTLE' },
    { stage: 'after', variant: 'strong-1_85', label: 'B · STRONGER 1.85×' },
    { stage: 'after', variant: 'texture-off', label: 'C · TEXTURE OFF' },
  ];
  const tileWidth = 432;
  const tileHeight = 540;
  const labelHeight = 34;
  const layers = [];
  for (let column = 0; column < options.length; column++) {
    const option = options[column];
    const source = file(option.stage, family, option.variant, 'png-2x.png');
    const left = column * tileWidth;
    layers.push({ input: svgLabel(option.label, tileWidth, labelHeight, 13), left, top: 0 });
    layers.push({ input: await imageTile(source, tileWidth, tileHeight), left, top: labelHeight });
  }
  await sharp({ create: { width: tileWidth * options.length, height: labelHeight + tileHeight, channels: 4, background: '#11171b' } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(base, `0${families.indexOf(family) + 1}-${family === 'id-card' ? 'identity' : family}-material-options.png`));
}

async function make100PercentDetailBoard() {
  const targets = [
    { id: 'E2 · open paper', family: 'editorial', left: 1740, top: 1730 },
    { id: 'E2 · RDM ink', family: 'editorial', left: 1220, top: 2260 },
    { id: 'E2 · photo edge', family: 'editorial', left: 1160, top: 1200 },
    { id: 'C2 · Coner', family: 'cinematic', left: 970, top: 1900 },
    { id: 'C2 · photo field', family: 'cinematic', left: 1390, top: 650 },
    { id: 'I3 · pictograms', family: 'id-card', left: 800, top: 2020 },
  ];
  const options = [
    { stage: 'before', variant: 'default', label: 'BEFORE' },
    { stage: 'after', variant: 'default', label: 'A · SUBTLE' },
    { stage: 'after', variant: 'strong-1_85', label: 'B · STRONGER' },
    { stage: 'after', variant: 'texture-off', label: 'C · OFF' },
  ];
  const cropSize = 200;
  const labelHeight = 28;
  const rowLabelWidth = 190;
  const gap = 10;
  const width = rowLabelWidth + cropSize * options.length + gap * (options.length - 1);
  const rowHeight = cropSize + labelHeight;
  const height = labelHeight + targets.length * rowHeight;
  const layers = [{ input: svgLabel('100% · native pixels from the 2× exports · no enlargement', width, labelHeight), left: 0, top: 0 }];
  for (let row = 0; row < targets.length; row++) {
    const target = targets[row];
    const y = labelHeight + row * rowHeight;
    layers.push({ input: svgLabel(target.id, rowLabelWidth, rowHeight, 12), left: 0, top: y });
    for (let column = 0; column < options.length; column++) {
      const option = options[column];
      const source = file(option.stage, target.family, option.variant, 'png-2x.png');
      const metadata = await sharp(source).metadata();
      const left = Math.max(0, Math.min(target.left, (metadata.width ?? 0) - cropSize));
      const top = Math.max(0, Math.min(target.top, (metadata.height ?? 0) - cropSize));
      const tile = await sharp(source).extract({ left, top, width: cropSize, height: cropSize }).png({ compressionLevel: 9 }).toBuffer();
      const x = rowLabelWidth + column * (cropSize + gap);
      layers.push({ input: svgLabel(option.label, cropSize, labelHeight, 10), left: x, top: y });
      layers.push({ input: tile, left: x, top: y + labelHeight });
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#11171b' } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(base, '04-100-percent-detail.png'));
}

async function make400PercentDetailBoard() {
  const targets = [
    { id: 'E2 · open paper', family: 'editorial', left: 1740, top: 1730 },
    { id: 'E2 · RDM ink', family: 'editorial', left: 1220, top: 2260 },
    { id: 'E2 · photo edge', family: 'editorial', left: 1160, top: 1200 },
  ];
  const options = [
    { stage: 'before', variant: 'default', label: 'BEFORE' },
    { stage: 'after', variant: 'default', label: 'A · SUBTLE' },
    { stage: 'after', variant: 'strong-1_85', label: 'B · STRONGER' },
    { stage: 'after', variant: 'texture-off', label: 'C · OFF' },
  ];
  const cropSize = 160;
  const zooms = [1, 2, 4];
  const labelHeight = 28;
  const rowLabelWidth = 150;
  const columnGap = 10;
  const panelWidth = rowLabelWidth + zooms.reduce((sum, zoom) => sum + cropSize * zoom, 0) + columnGap * (zooms.length - 1);
  const panelGap = 16;
  const rowHeight = cropSize * 4 + labelHeight;
  const width = targets.length * panelWidth + (targets.length - 1) * panelGap;
  const height = labelHeight + options.length * rowHeight;
  const layers = [{ input: svgLabel('E2 MATERIAL DETAILS · 100%, 200%, 400% NEAREST-NEIGHBOR', width, labelHeight), left: 0, top: 0 }];
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
    const target = targets[targetIndex];
    const panelX = targetIndex * (panelWidth + panelGap);
    let zoomX = panelX + rowLabelWidth;
    for (const zoom of zooms) {
      const tileSize = cropSize * zoom;
      layers.push({ input: svgLabel(`${zoom * 100}%`, tileSize, labelHeight, 12), left: zoomX, top: 0 });
      zoomX += tileSize + columnGap;
    }
    for (let row = 0; row < options.length; row++) {
      const option = options[row];
      const source = file(option.stage, target.family, option.variant, 'png-2x.png');
      const metadata = await sharp(source).metadata();
      const left = Math.max(0, Math.min(target.left, (metadata.width ?? 0) - cropSize));
      const top = Math.max(0, Math.min(target.top, (metadata.height ?? 0) - cropSize));
      const y = labelHeight + row * rowHeight;
      layers.push({ input: svgLabel(`${target.id} · ${option.label}`, rowLabelWidth, rowHeight, 10), left: panelX, top: y });
      zoomX = panelX + rowLabelWidth;
      for (const zoom of zooms) {
        const tileSize = cropSize * zoom;
        const tile = await sharp(source)
          .extract({ left, top, width: cropSize, height: cropSize })
          .resize(tileSize, tileSize, { fit: 'fill', kernel: sharp.kernel.nearest })
          .png({ compressionLevel: 9 })
          .toBuffer();
        layers.push({ input: tile, left: zoomX, top: y + labelHeight });
        zoomX += tileSize + columnGap;
      }
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#11171b' } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(base, '05-400-percent-detail.png'));
}

async function makeBeforeAfterTriptych() {
  const tileWidth = 432;
  const tileHeight = 540;
  const labelHeight = 30;
  const rowHeaderWidth = 120;
  const headerHeight = 34;
  const width = rowHeaderWidth + tileWidth * families.length;
  const height = headerHeight + labelHeight + (tileHeight + labelHeight) * 2;
  const layers = [{ input: svgLabel('BEFORE / AFTER · SAME FAMILY · PNG 2× DOWNSAMPLED TO CSS SIZE', width, headerHeight), left: 0, top: 0 }];
  for (let column = 0; column < families.length; column++) {
    const family = families[column];
    const x = rowHeaderWidth + column * tileWidth;
    layers.push({ input: svgLabel(family, tileWidth, labelHeight, 13), left: x, top: headerHeight });
    for (let row = 0; row < 2; row++) {
      const stage = row === 0 ? 'before' : 'after';
      const y = headerHeight + labelHeight + row * (tileHeight + labelHeight);
      const source = file(stage, family, 'default', 'png-2x.png');
      layers.push({ input: svgLabel(stage.toUpperCase(), rowHeaderWidth, tileHeight + labelHeight, 13), left: 0, top: y });
      layers.push({ input: await imageTile(source, tileWidth, tileHeight), left: x, top: y + labelHeight });
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#11171b' } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(base, '06-before-after-triptych.png'));
}

async function previewDifferenceTile(previewPath, exportPath) {
  const preview = await decodePixels(previewPath);
  const resizedExport = await sharp(exportPath).resize(432, 540, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const exported = await decodePixels(resizedExport);
  if (preview.info.width !== 432 || preview.info.height !== 540 || !pixelStats(preview, exported).dimensionsMatch) {
    return Buffer.from(await sharp({ create: { width: 432, height: 540, channels: 4, background: '#473d33' } })
      .composite([{ input: svgLabel('SIZE MISMATCH', 432, 540, 22), left: 0, top: 0 }]).png().toBuffer());
  }
  const pixels = Buffer.alloc(preview.data.length);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.min(255, Math.abs(preview.data[offset + channel] - exported.data[offset + channel]) * 6);
    pixels[offset + 3] = 255;
  }
  return sharp(pixels, { raw: { width: 432, height: 540, channels: 4 } }).png().toBuffer();
}

async function makePreviewExportParityBoard() {
  const tileWidth = 432;
  const tileHeight = 540;
  const labelHeight = 34;
  const columns = [
    { label: 'BROWSER PREVIEW', getPath: (family) => previewFiles[family] },
    { label: 'EXPORT · DOWNSAMPLED', getPath: (family) => file('after', family, 'default', 'png-2x.png') },
    { label: 'ABSOLUTE DIFFERENCE ×6 · JPEG NOISE POSSIBLE', diff: true },
  ];
  const width = tileWidth * columns.length;
  const height = (tileHeight + labelHeight) * families.length;
  const layers = [];
  for (let row = 0; row < families.length; row++) {
    const family = families[row];
    const y = row * (tileHeight + labelHeight);
    for (let column = 0; column < columns.length; column++) {
      const item = columns[column];
      const x = column * tileWidth;
      layers.push({ input: svgLabel(`${family} · ${item.label}`, tileWidth, labelHeight, 11), left: x, top: y });
      const source = item.diff
        ? await previewDifferenceTile(previewFiles[family], file('after', family, 'default', 'png-2x.png'))
        : await imageTile(item.getPath(family), tileWidth, tileHeight);
      layers.push({ input: source, left: x, top: y + labelHeight });
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#11171b' } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(base, '07-preview-export-parity.png'));
}

const required = [];
for (const family of families) {
  required.push(
    file('before', family, 'default', 'png-2x.png'),
    file('after', family, 'default', 'png-2x.png'),
    file('after', family, 'default', 'webp-2x.webp'),
    file('after', family, 'strong-1_85', 'png-2x.png'),
    file('after', family, 'texture-off', 'png-2x.png'),
    file('after', family, 'default', 'png-4x.png'),
  );
}
required.push(
  path.join(base, 'before/qa213-before-results.json'),
  path.join(base, 'after/qa213-after-results.json'),
  path.join(base, 'before/qa213-export-timings.json'),
  path.join(base, 'after/qa213-export-timings.json'),
);
await waitForFiles(required, arg('wait-seconds', 0));
await waitForPreviewFiles(arg('wait-seconds', 0));
await fs.mkdir(out, { recursive: true });

const beforeReport = JSON.parse(await fs.readFile(path.join(base, 'before/qa213-before-results.json'), 'utf8'));
const afterReport = JSON.parse(await fs.readFile(path.join(base, 'after/qa213-after-results.json'), 'utf8'));
const beforeTimings = JSON.parse(await fs.readFile(path.join(base, 'before/qa213-export-timings.json'), 'utf8'));
const afterTimings = JSON.parse(await fs.readFile(path.join(base, 'after/qa213-export-timings.json'), 'utf8'));
let optionalLocaleTypeChecks = { available: false, expectedCaptures: 6, captureCount: 0, failures: [] };
try {
  const localeReport = JSON.parse(await fs.readFile(path.join(base, 'after/qa213-after-ko-ja-results.json'), 'utf8'));
  optionalLocaleTypeChecks = {
    available: true,
    expectedCaptures: 6,
    captureCount: localeReport.captures?.length ?? 0,
    captures: localeReport.captures ?? [],
    failures: localeReport.failures ?? [],
  };
} catch {
  // Korean/Japanese captures are an optional extension of the English core set.
}

const comparisons = [];
const stress = [];
const geometryComparisons = [];
const exportTimingComparisons = [];
const previewExportComparisons = [];
const materialCropComparisons = [];
const captureCoverage = {
  beforeMaterial: { expected: 3, captured: beforeReport.captures?.length ?? 0, failures: beforeReport.failures ?? [] },
  afterMaterial: { expected: 15, captured: afterReport.captures?.length ?? 0, failures: afterReport.failures ?? [] },
  beforeExportTimings: { expected: 36, captured: beforeTimings.runs?.length ?? 0, failures: beforeTimings.failures ?? [] },
  afterExportTimings: { expected: 18, captured: afterTimings.runs?.length ?? 0, failures: afterTimings.failures ?? [] },
  optionalKoJa: { expected: 6, captured: optionalLocaleTypeChecks.captureCount, failures: optionalLocaleTypeChecks.failures },
};
for (const family of families) {
  const beforeCapture = captureFrom(beforeReport, family, 'default', 'png', 2);
  const afterCapture = captureFrom(afterReport, family, 'default', 'png', 2);
  if (!beforeCapture || !afterCapture) throw new Error(`Missing default PNG 2× metadata for ${family} in the before/after report.`);
  const beforeVersion = beforeCapture.context?.geometry?.snapshotVersion ?? 0;
  const afterVersion = afterCapture.context?.geometry?.snapshotVersion ?? 0;
  const hasSvgBaseline = beforeVersion >= 2 && afterVersion >= 2;
  const beforeLayout = layoutSignature(beforeCapture, hasSvgBaseline);
  const afterLayout = layoutSignature(afterCapture, hasSvgBaseline);
  const beforeFrozenLayout = { logicalCss: beforeLayout.logicalCss, cardSize: beforeLayout.cardSize, elements: beforeLayout.elements };
  const afterFrozenLayout = { logicalCss: afterLayout.logicalCss, cardSize: afterLayout.cardSize, elements: afterLayout.elements };
  const geometryDifferences = differences(beforeFrozenLayout, afterFrozenLayout);
  const masterFieldDifferences = differences(beforeLayout.masterFields, afterLayout.masterFields);
  const cardAttributeDifferences = differences(beforeLayout.cardDataAttributes, afterLayout.cardDataAttributes);
  const pictogramDifferences = differences(beforeLayout.pictograms, afterLayout.pictograms);
  const accessibilityDifferences = differences(beforeLayout.accessibilityMetadata, afterLayout.accessibilityMetadata);
  const nonMaterialImagesBefore = beforeLayout.elements.filter((element) => element.image).map((element) => ({ ...element.image, relativeRect: element.relativeRect }));
  const nonMaterialImagesAfter = afterLayout.elements.filter((element) => element.image).map((element) => ({ ...element.image, relativeRect: element.relativeRect }));
  const nonMaterialImageDifferences = differences(nonMaterialImagesBefore, nonMaterialImagesAfter);
  const colorDifferences = differences(beforeLayout.colors, afterLayout.colors);
  const geometryStatus = geometryDifferences.length ? 'changed' : 'match';
  const unvalidatedFields = [];
  if (beforeVersion < 2) {
    unvalidatedFields.push(
      'card.dataAttributes (baseline snapshot schema v1 did not capture article data attributes)',
      'element.accessibleName (baseline snapshot schema v1 did not capture accessible names)',
      'SVG pictogram path geometry (baseline snapshot schema v1 did not capture SVG shape data)',
    );
  }
  geometryComparisons.push({
    family,
    snapshotVersionBefore: beforeVersion,
    snapshotVersionAfter: afterVersion,
    sameCardRectAndTextGeometry: geometryStatus === 'match',
    frozenLayoutStatus: geometryStatus,
    geometryTolerancePx: 0.01,
    geometryDifferences,
    logicalCssBefore: beforeLayout.logicalCss,
    logicalCssAfter: afterLayout.logicalCss,
    cardSizeBefore: beforeLayout.cardSize,
    cardSizeAfter: afterLayout.cardSize,
    actualScaleBefore: beforeCapture.outputSize?.actualScale ?? null,
    actualScaleAfter: afterCapture.outputSize?.actualScale ?? null,
    cappedBefore: beforeCapture.outputSize?.capped ?? null,
    cappedAfter: afterCapture.outputSize?.capped ?? null,
    comparedElements: beforeLayout.elements.length,
    beforeElements: beforeLayout.elements,
    afterElements: afterLayout.elements,
    masterFieldsStatus: checkStatus(beforeLayout.masterFields, afterLayout.masterFields, masterFieldDifferences),
    masterFieldsBefore: beforeLayout.masterFields,
    masterFieldsAfter: afterLayout.masterFields,
    masterFieldDifferences,
    otherCardDataAttributesStatus: checkStatus(beforeLayout.cardDataAttributes, afterLayout.cardDataAttributes, cardAttributeDifferences),
    otherCardDataAttributeDifferences: cardAttributeDifferences,
    accessibilityMetadataStatus: beforeVersion >= 2 && afterVersion >= 2
      ? checkStatus(beforeLayout.accessibilityMetadata, afterLayout.accessibilityMetadata, accessibilityDifferences)
      : 'unavailable-baseline-lacks-accessible-name-snapshot',
    accessibilityMetadataDifferences: beforeVersion >= 2 && afterVersion >= 2 ? accessibilityDifferences : [],
    pictogramShapeStatus: hasSvgBaseline ? checkStatus(beforeLayout.pictograms, afterLayout.pictograms, pictogramDifferences) : 'unavailable-baseline-lacks-svg-snapshot',
    pictogramsBefore: beforeLayout.pictograms,
    pictogramsAfter: afterLayout.pictograms,
    pictogramShapeDifferences: hasSvgBaseline ? pictogramDifferences : [],
    nonMaterialImageStatus: checkStatus(nonMaterialImagesBefore, nonMaterialImagesAfter, nonMaterialImageDifferences),
    nonMaterialImageDifferences,
    colorCoverage: beforeVersion >= 2 && afterVersion >= 2 ? 'computed-text-and-svg-colors' : 'legacy-font-colors-only',
    colorDifferences,
    materialImagesBefore: beforeLayout.materialImages,
    materialImagesAfter: afterLayout.materialImages,
    materialDataAttributesBefore: beforeLayout.materialDataAttributes,
    materialDataAttributesAfter: afterLayout.materialDataAttributes,
    unvalidatedFields,
  });
  for (const scale of [2, 4]) {
    const beforeRuns = beforeTimings.runs?.filter((run) => run.family === family && run.requestedScale === scale).map((run) => run.renderDurationMs) ?? [];
    const afterRuns = afterTimings.runs?.filter((run) => run.family === family && run.requestedScale === scale).map((run) => run.renderDurationMs) ?? [];
    const beforeMedianMs = median(beforeRuns);
    const afterMedianMs = median(afterRuns);
    const regressionPercent = beforeMedianMs !== null && beforeMedianMs > 0 && afterMedianMs !== null
      ? ((afterMedianMs - beforeMedianMs) / beforeMedianMs) * 100
      : null;
    exportTimingComparisons.push({
      family,
      scale,
      beforeRepeatCount: beforeRuns.length,
      afterRepeatCount: afterRuns.length,
      beforeTimingReportStage: beforeTimings.stage ?? null,
      afterTimingReportStage: afterTimings.stage ?? null,
      beforeSamplesMs: beforeRuns,
      afterSamplesMs: afterRuns,
      beforeMedianMs,
      afterMedianMs,
      regressionPercent,
      regressionInterpretation: regressionPercent === null
        ? 'insufficient timing data'
        : regressionPercent < 0 ? 'after is faster' : 'after is slower',
      hasSustainedRegressionOfAtLeast15Percent: regressionPercent === null ? null : regressionPercent >= 15,
      within15PercentRegressionLimit: regressionPercent === null ? null : regressionPercent < 15,
    });
  }
  const before = file('before', family, 'default', 'png-2x.png');
  const afterDefault = file('after', family, 'default', 'png-2x.png');
  const afterStrong = file('after', family, 'strong-1_85', 'png-2x.png');
  const afterOff = file('after', family, 'texture-off', 'png-2x.png');
  const afterWebp = file('after', family, 'default', 'webp-2x.webp');
  const entries = [
    ['before-default-vs-after-default', before, afterDefault],
    ['before-default-vs-after-strong', before, afterStrong],
    ['before-default-vs-after-texture-off', before, afterOff],
    ['after-default-png-vs-webp', afterDefault, afterWebp],
  ];
  for (const [comparison, left, right] of entries) {
    comparisons.push({ family, comparison, left: path.relative(root, left).replaceAll('\\', '/'), right: path.relative(root, right).replaceAll('\\', '/'), ...(await comparePixels(left, right)) });
  }
  const previewPath = previewFiles[family];
  previewExportComparisons.push({
    family,
    preview: path.relative(root, previewPath).replaceAll('\\', '/'),
    export: path.relative(root, afterDefault).replaceAll('\\', '/'),
    ...(await comparePreviewToExport(previewPath, afterDefault)),
  });
  for (const crop of cropTargets.filter((target) => target.family === family)) {
    for (const [comparison, right] of [
      ['before-vs-after-default', afterDefault],
      ['before-vs-after-strong', afterStrong],
      ['before-vs-after-texture-off', afterOff],
    ]) {
      materialCropComparisons.push({
        family,
        crop: crop.id,
        sourceRegion: { left: crop.left, top: crop.top, width: 200, height: 200, sourceScale: 'PNG 2× pixels' },
        comparison,
        ...(await compareCropPixels(before, right, crop)),
      });
    }
  }
  const stressPath = file('after', family, 'default', 'png-4x.png');
  stress.push({ family, file: path.relative(root, stressPath).replaceAll('\\', '/'), ...(await dimensions(stressPath)) });
}

await makeOverview();
for (const target of cropTargets) await makeCropBoard(target);
for (const family of families) await makeFamilyOptionBoard(family);
await make100PercentDetailBoard();
await make400PercentDetailBoard();
await makeBeforeAfterTriptych();
await makePreviewExportParityBoard();

const requestedBoards = [
  '01-cinematic-material-options.png',
  '02-editorial-material-options.png',
  '03-identity-material-options.png',
  '04-100-percent-detail.png',
  '05-400-percent-detail.png',
  '06-before-after-triptych.png',
  '07-preview-export-parity.png',
];
const additionalBoards = ['board-01-overview.png', ...cropTargets.map((target) => `board-${target.id}.png`)];

const report = {
  schema: 'phase213-material-comparison-v2',
  generatedAt: new Date().toISOString(),
  method: 'Decoded sRGB RGBA bytes; exact pixel counts and mean absolute channel differences. Geometry is relative to the card article (root page offsets ignored); card width/height, text, font family/size/weight/line-height/letter-spacing, and non-material image path/natural dimensions are compared with a 0.01 CSS-pixel tolerance. Only image sources under /images/materials/ are omitted from the invariant image list and are reported separately. Crop boards enlarge native 2× pixels with nearest-neighbor at 100%, 200%, and 400%. Preview screenshots are compared with production exports downsampled to 432×540. Timing regression is (after median − before median) / before median across three sequential runs; positive values are slower, and 15% or greater is flagged for review. This does not set an improvement target.',
  comparisons,
  geometryComparisons,
  nativePreviewExportComparisons: previewExportComparisons,
  materialCropComparisons,
  captureCoverage,
  captureFailures: {
    beforeMaterial: beforeReport.failures ?? [],
    afterMaterial: afterReport.failures ?? [],
    beforeExportTimings: beforeTimings.failures ?? [],
    afterExportTimings: afterTimings.failures ?? [],
    optionalKoJa: optionalLocaleTypeChecks.failures,
  },
  exportTimingComparisons,
  optionalLocaleTypeChecks,
  fourXStress: stress,
  requestedBoards,
  additionalBoards,
  boards: [...requestedBoards, ...additionalBoards],
};
report.method = report.method.replace('across three sequential runs', 'using each stage’s recorded sequential-run median');
report.previewPixelComparisonPolicy = 'Preview/export pixel deltas are diagnostic only. The screenshot format is recorded from the image header, dimensions must be 432×540 for a valid comparison, and lossy JPEG capture or JPEG-to-PNG conversion never receives an exact-parity claim.';
await fs.writeFile(path.join(out, 'comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, boards: report.boards.map((name) => `docs/qa/phase213-material/${name}`) }, null, 2));

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/qa/precision-craft');
const BEFORE_CROPS = OUT;
const BEFORE_EXPORTS = path.join(ROOT, 'docs/qa/coner-art-direction/exports');
const AFTER_EXPORTS = path.join(OUT, 'exports');
const BACKGROUND = '#171a1d';
const PAPER = '#ede6d8';
const GOLD = '#cfad72';
const MUTED = '#aaa69d';
const MAX_DIMENSION = 3000;
const AFTER_EDGE_RECT = { left: 1220, top: 700, width: 150, height: 200 };

const FAMILIES = [
  { id: 'cinematic', slug: 'cinematic', label: 'Cinematic · C2' },
  { id: 'editorial', slug: 'editorial', label: 'Editorial · E2' },
  { id: 'identity', slug: 'id-card', label: 'Identity · I3' },
];

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function labelSvg(width, height, lines, background = BACKGROUND, defaultColor = PAPER) {
  const text = lines.map((line) => `<text x="${line.x ?? 36}" y="${line.y}" fill="${line.color ?? defaultColor}" font-family="Arial, sans-serif" font-size="${line.size ?? 20}" font-weight="${line.weight ?? 400}" letter-spacing="${line.spacing ?? 0}">${xml(line.text)}</text>`).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/>${text}</svg>`);
}

async function requireFile(file, label) {
  try {
    await fs.access(file);
  } catch {
    throw new Error(`${label} is missing: ${path.relative(ROOT, file)}`);
  }
  return file;
}

function exportPath(root, family, locale = 'en') {
  return path.join(root, `${family.slug}-${locale}-4x5-2x.png`);
}

async function loadExport(root, family, locale = 'en') {
  const imagePath = await requireFile(exportPath(root, family, locale), `${family.label} ${locale.toUpperCase()} 2× PNG`);
  const recordPath = await requireFile(imagePath.replace(/\.png$/u, '.json'), `${family.label} ${locale.toUpperCase()} export record`);
  const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height || !record.size?.scale || !record.logical?.width || !record.logical?.height) {
    throw new Error(`${family.label} ${locale.toUpperCase()} record lacks output/logical dimensions`);
  }
  const pixelScaleX = metadata.width / record.logical.width;
  const pixelScaleY = metadata.height / record.logical.height;
  if (record.size.width !== metadata.width || record.size.height !== metadata.height
    || Math.abs(pixelScaleX - pixelScaleY) > 0.01) {
    throw new Error(`${family.label} ${locale.toUpperCase()} record does not match PNG geometry`);
  }
  return { imagePath, record, metadata, pixelScaleX, pixelScaleY };
}

async function crop(file, rect) {
  return sharp(file).extract(rect).png().toBuffer();
}

async function nearest(buffer, factor) {
  const metadata = await sharp(buffer).metadata();
  return sharp(buffer)
    .resize(metadata.width * factor, metadata.height * factor, { fit: 'fill', kernel: 'nearest' })
    .png()
    .toBuffer();
}

async function fitPanel(bufferOrPath, width, height) {
  return sharp(bufferOrPath)
    .resize(width, height, { fit: 'contain', background: BACKGROUND, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function writeBoard(name, width, height, layers) {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`${name} exceeds ${MAX_DIMENSION}px (${width}×${height})`);
  }
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
}

function field(record, name) {
  const value = record.fields?.find((item) => item.field === name);
  if (!value) throw new Error(`Missing saved field bound: ${name}`);
  return value;
}

function boundsRect(item, names, marginX = 0, marginY = 0) {
  const fields = names.map((name) => field(item.record, name));
  const left = Math.max(0, Math.floor(Math.min(...fields.map((value) => value.x * item.pixelScaleX)) - marginX));
  const top = Math.max(0, Math.floor(Math.min(...fields.map((value) => value.y * item.pixelScaleY)) - marginY));
  const maxRight = Math.max(...fields.map((value) => (value.x + value.width) * item.pixelScaleX)) + marginX;
  const maxBottom = Math.max(...fields.map((value) => (value.y + value.height) * item.pixelScaleY)) + marginY;
  const right = Math.min(item.metadata.width, Math.ceil(maxRight));
  const bottom = Math.min(item.metadata.height, Math.ceil(maxBottom));
  return { left, top, width: right - left, height: bottom - top };
}

function fieldCropRect(item, name, width, height, origin = 'start') {
  const value = field(item.record, name);
  const fieldLeft = value.x * item.pixelScaleX;
  const fieldTop = value.y * item.pixelScaleY;
  const centerX = fieldLeft + (value.width * item.pixelScaleX) / 2;
  const centerY = fieldTop + (value.height * item.pixelScaleY) / 2;
  const left = origin === 'center' ? centerX - width / 2 : fieldLeft;
  const top = origin === 'center' ? centerY - height / 2 : fieldTop;
  return clampRect({ left: Math.floor(left), top: Math.floor(top), width, height }, item.metadata);
}

function clampRect(rect, metadata) {
  const left = Math.max(0, Math.min(metadata.width - rect.width, rect.left));
  const top = Math.max(0, Math.min(metadata.height - rect.height, rect.top));
  return { ...rect, left, top };
}

async function composeEdgeBoard(afterE2) {
  const beforeBase = path.join(BEFORE_CROPS, 'before-editorial-edge-100.png');
  const beforeScales = [
    { scale: 1, label: '100% · native', path: path.join(BEFORE_CROPS, 'before-editorial-edge-100.png') },
    { scale: 2, label: '200% · nearest', path: path.join(BEFORE_CROPS, 'before-editorial-edge-200.png') },
    { scale: 4, label: '400% · nearest', path: path.join(BEFORE_CROPS, 'before-editorial-edge-400.png') },
  ];
  await requireFile(beforeBase, 'Editorial edge before crop');
  const nativeAfter = await crop(afterE2.imagePath, AFTER_EDGE_RECT);
  const width = 1320;
  const headerHeight = 132;
  const rowHeights = [265, 465, 865];
  const height = headerHeight + rowHeights.reduce((sum, value) => sum + value, 0) + 30;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 34, y: 54, text: 'EDITORIAL EDGE · BEFORE / AFTER', size: 28, weight: 700, color: GOLD, spacing: 1 },
    { x: 34, y: 100, text: 'Same boundary detail at native 100% and nearest-neighbour 200% / 400%; cards are unaltered', size: 18, color: MUTED },
    { x: 40, y: 127, text: 'PHASE 2.7.5 BEFORE', size: 16, weight: 700 },
    { x: 690, y: 127, text: 'PHASE 2.7.6 AFTER', size: 16, weight: 700 },
  ]), left: 0, top: 0 }];
  let top = headerHeight;
  for (let index = 0; index < beforeScales.length; index += 1) {
    const entry = beforeScales[index];
    await requireFile(entry.path, `Editorial edge ${entry.label} baseline`);
    const old = await sharp(entry.path).png().toBuffer();
    const next = index === 0 ? nativeAfter : await nearest(nativeAfter, entry.scale);
    const metadata = await sharp(next).metadata();
    const rowHeight = rowHeights[index];
    const rowLabel = labelSvg(width, 42, [{ x: 34, y: 29, text: entry.label, size: 16, weight: 700, color: GOLD }]);
    layers.push({ input: rowLabel, left: 0, top });
    layers.push({ input: old, left: 34, top: top + 48 });
    layers.push({ input: next, left: 690, top: top + 48 });
    top += rowHeight;
    if (metadata.width > 600 || metadata.height > rowHeight - 50) throw new Error(`Editorial after ${entry.label} crop exceeds its review row`);
  }
  await writeBoard('01-editorial-edge-before-after.png', width, height, layers);
}

async function composeDisplayType(before, after) {
  const width = 2820;
  const titleHeight = 128;
  const columnWidth = 1360;
  const imageWidth = 1320;
  const imageHeight = 390;
  const rowHeight = 440;
  const height = titleHeight + rowHeight * FAMILIES.length;
  const layers = [{ input: labelSvg(width, titleHeight, [
    { x: 36, y: 54, text: 'DISPLAY TYPE · BEFORE / AFTER', size: 29, weight: 700, color: GOLD, spacing: 1 },
    { x: 36, y: 101, text: 'Field crops use saved name bounds; panels are overview-fitted from actual 2× exports', size: 19, color: MUTED },
  ]), left: 0, top: 0 }];

  for (let index = 0; index < FAMILIES.length; index += 1) {
    const family = FAMILIES[index];
    const top = titleHeight + index * rowHeight;
    const beforeCard = before.get(family.id);
    const afterCard = after.get(family.id);
    const nameMarginY = family.id === 'identity' ? 0 : 28;
    const oldCrop = await crop(beforeCard.imagePath, boundsRect(beforeCard, ['name'], 30, nameMarginY));
    const newCrop = await crop(afterCard.imagePath, boundsRect(afterCard, ['name'], 30, nameMarginY));
    const oldPanel = await fitPanel(oldCrop, imageWidth, imageHeight);
    const newPanel = await fitPanel(newCrop, imageWidth, imageHeight);
    layers.push(
      { input: labelSvg(columnWidth, 42, [{ x: 10, y: 29, text: `${family.id.toUpperCase()} · PHASE 2.7.5`, size: 16, weight: 700 }]), left: 24, top },
      { input: labelSvg(columnWidth, 42, [{ x: 10, y: 29, text: `${family.id.toUpperCase()} · PHASE 2.7.6`, size: 16, weight: 700 }]), left: 24 + columnWidth + 36, top },
      { input: oldPanel, left: 24, top: top + 44 },
      { input: newPanel, left: 24 + columnWidth + 36, top: top + 44 },
    );
  }
  await writeBoard('02-display-type-before-after.png', width, height, layers);
}

async function composeRdmDetail(beforeEditorial, afterEditorial) {
  const oldCrop = await crop(beforeEditorial.imagePath, boundsRect(beforeEditorial, ['jobAbbreviation'], 34, 24));
  const newCrop = await crop(afterEditorial.imagePath, boundsRect(afterEditorial, ['jobAbbreviation'], 34, 24));
  const width = 2060;
  const height = 820;
  const panelWidth = 980;
  const panelHeight = 620;
  const oldPanel = await fitPanel(oldCrop, panelWidth, panelHeight);
  const newPanel = await fitPanel(newCrop, panelWidth, panelHeight);
  await writeBoard('03-rdm-type-detail.png', width, height, [
    { input: labelSvg(width, 130, [
      { x: 36, y: 56, text: 'RDM TYPOGRAPHIC MOTIF · EDITORIAL E2', size: 28, weight: 700, color: GOLD, spacing: 1 },
      { x: 36, y: 102, text: 'Saved jobAbbreviation field bounds · panels overview-fitted from actual export PNGs', size: 18, color: MUTED },
      { x: 42, y: 126, text: 'PHASE 2.7.5', size: 16, weight: 700 },
      { x: 1058, y: 126, text: 'PHASE 2.7.6', size: 16, weight: 700 },
    ]), left: 0, top: 0 },
    { input: oldPanel, left: 32, top: 150 },
    { input: newPanel, left: 1050, top: 150 },
  ]);
}

async function composeBorderDetail(before, after) {
  const entries = [
    {
      id: 'cinematic', label: 'CINEMATIC C2 · CORNER',
      old: await fs.readFile(path.join(BEFORE_CROPS, 'before-cinematic-corner-100.png')),
      next: await crop(after.get('cinematic').imagePath, { left: 0, top: 0, width: 180, height: 180 }),
    },
    {
      id: 'editorial', label: 'EDITORIAL E2 · PAPER EDGE',
      old: await fs.readFile(path.join(BEFORE_CROPS, 'before-editorial-edge-100.png')),
      next: await crop(after.get('editorial').imagePath, AFTER_EDGE_RECT),
    },
    {
      id: 'identity', label: 'IDENTITY I3 · DOCUMENT CORNER',
      old: await crop(before.get('identity').imagePath, { left: 0, top: 0, width: 180, height: 180 }),
      next: await crop(after.get('identity').imagePath, { left: 0, top: 0, width: 180, height: 180 }),
    },
  ];
  const width = 1320;
  const rowHeight = 250;
  const headerHeight = 118;
  const height = headerHeight + entries.length * rowHeight;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 34, y: 54, text: 'BORDER DETAIL · BEFORE / AFTER', size: 27, weight: 700, color: GOLD, spacing: 1 },
    { x: 34, y: 99, text: 'Native 2× export clips · no scaling, filtering, repainting or replacement artwork', size: 17, color: MUTED },
    { x: 38, y: 117, text: 'BEFORE', size: 15, weight: 700 },
    { x: 688, y: 117, text: 'AFTER', size: 15, weight: 700 },
  ]), left: 0, top: 0 }];
  let top = headerHeight;
  for (const entry of entries) {
    layers.push({ input: labelSvg(width, 35, [{ x: 34, y: 25, text: entry.label, size: 15, weight: 700, color: GOLD }]), left: 0, top });
    layers.push({ input: entry.old, left: 38, top: top + 42 });
    layers.push({ input: entry.next, left: 688, top: top + 42 });
    top += rowHeight;
  }
  await writeBoard('04-border-detail.png', width, height, layers);
}

function glyphFieldName(name) {
  return name === 'service' ? 'origin' : name;
}

function glyphRect(item, name, width = 260, height = 130) {
  const pictogram = item.record.pictogramBounds?.find((entry) => entry.kind === name);
  if (pictogram) {
    const left = pictogram.x * item.pixelScaleX + pictogram.width * item.pixelScaleX / 2 - width / 2;
    const top = pictogram.y * item.pixelScaleY + pictogram.height * item.pixelScaleY / 2 - height / 2;
    return clampRect({ left: Math.floor(left), top: Math.floor(top), width, height }, item.metadata);
  }
  const target = field(item.record, glyphFieldName(name));
  const left = Math.max(0, Math.floor(target.x * item.pixelScaleX - 100));
  const top = Math.max(0, Math.floor(target.y * item.pixelScaleY - 38));
  return clampRect({ left, top, width, height }, item.metadata);
}

async function composePictogramDetail(beforeIdentity, afterIdentity) {
  const glyphs = afterIdentity.record.glyphs;
  if (!Array.isArray(glyphs) || !glyphs.length || glyphs.some((name) => typeof name !== 'string')) {
    throw new Error('Identity export glyph inventory must be an array of field names');
  }
  const beforeWorld = await requireFile(path.join(BEFORE_CROPS, 'before-identity-glyph-100.png'), 'Before World pictogram crop');
  const afterWorld = await crop(afterIdentity.imagePath, glyphRect(afterIdentity, 'world', 200, 140));
  const columns = 3;
  const cellWidth = 340;
  const cellHeight = 190;
  const gap = 18;
  const padding = 28;
  const compareHeight = 190;
  const headerHeight = 122;
  const rows = Math.ceil(glyphs.length / columns);
  const width = padding * 2 + cellWidth * columns + gap * (columns - 1);
  const height = headerHeight + compareHeight + rows * cellHeight + 24;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 32, y: 54, text: 'PICTOGRAM DETAIL · IDENTITY I3', size: 27, weight: 700, color: GOLD, spacing: 1 },
    { x: 32, y: 98, text: 'After crop centered on captured SVG bounds; before World and remaining glyph crops retain audited source bounds', size: 17, color: MUTED },
  ]), left: 0, top: 0 }];
  const worldLeft = padding;
  const afterWorldLeft = padding + 250;
  layers.push(
    { input: labelSvg(240, 38, [{ x: 8, y: 27, text: 'WORLD · BEFORE', size: 14, weight: 700 }]), left: worldLeft, top: headerHeight },
    { input: labelSvg(240, 38, [{ x: 8, y: 27, text: 'WORLD · AFTER', size: 14, weight: 700 }]), left: afterWorldLeft, top: headerHeight },
    { input: await crop(beforeWorld, { left: 0, top: 0, width: 200, height: 140 }), left: worldLeft + 8, top: headerHeight + 44 },
    { input: afterWorld, left: afterWorldLeft + 8, top: headerHeight + 44 },
  );
  const gridTop = headerHeight + compareHeight;
  for (let index = 0; index < glyphs.length; index += 1) {
    const name = glyphs[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (cellWidth + gap);
    const top = gridTop + row * cellHeight;
    const cropImage = await crop(afterIdentity.imagePath, glyphRect(afterIdentity, name));
    layers.push({ input: labelSvg(cellWidth, 36, [{ x: 8, y: 25, text: name.toUpperCase(), size: 14, weight: 700 }]), left, top });
    layers.push({ input: cropImage, left: left + 8, top: top + 42 });
  }
  await writeBoard('05-pictogram-detail.png', width, height, layers);
}

function hairlineRect(item, kind) {
  const scale = item.pixelScaleY;
  let left = 120;
  let top;
  let width = 360;
  let height = 64;
  if (kind === 'cinematic') {
    const row = field(item.record, 'job');
    top = Math.floor(row.y * scale - 60);
    left = Math.max(0, Math.floor(row.x * item.pixelScaleX - 20));
  } else if (kind === 'editorial') {
    const masthead = field(item.record, 'masthead');
    top = Math.floor((masthead.y + masthead.height) * scale - 8);
    left = Math.floor(masthead.x * item.pixelScaleX);
  } else {
    const heroFields = ['name', 'job', 'level', 'bio'].map((name) => field(item.record, name));
    const bottom = Math.max(...heroFields.map((value) => (value.y + value.height) * scale));
    top = Math.floor(bottom - 8);
    left = 1100;
    width = 480;
  }
  return clampRect({ left, top, width, height }, item.metadata);
}

function capturedHairlineRect(item, kind) {
  const expected = hairlineRect(item, kind);
  let targetY = expected.top;
  if (kind === 'editorial') {
    // Editorial's captured top rule sits beside the job anchor in the facts block.
    targetY = field(item.record, 'job').y * item.pixelScaleY;
  } else if (kind === 'identity') {
    // The I3 rule follows the hero fields; keep the search anchored to their recorded bounds.
    const bio = field(item.record, 'bio');
    targetY = (bio.y + bio.height) * item.pixelScaleY + 200;
  }
  const rules = item.record.rules;
  if (!Array.isArray(rules) || !rules.length) {
    throw new Error(`${kind} export record is missing captured hairline rules`);
  }
  const candidates = rules
    .filter((rule) => Number.isFinite(rule.x) && Number.isFinite(rule.y)
      && Number.isFinite(rule.width) && Number.isFinite(rule.height)
      && rule.width > 100 && rule.height > 0)
    .map((rule) => ({
      rule,
      rect: {
        left: Math.round(rule.x * item.pixelScaleX),
        top: Math.round(rule.y * item.pixelScaleY),
        width: Math.max(1, Math.round(rule.width * item.pixelScaleX)),
        height: Math.max(1, Math.round(rule.height * item.pixelScaleY)),
      },
    }))
    .filter(({ rect }) => Math.abs(rect.top - targetY) <= (kind === 'identity' ? 300 : 120))
    .sort((a, b) => Math.abs(a.rect.top - targetY) - Math.abs(b.rect.top - targetY));
  const selected = candidates[0];
  if (!selected) throw new Error(`${kind} export has no captured rule near its expected hairline region`);
  return clampRect({
    left: Math.round(selected.rect.left + selected.rect.width / 2 - 50),
    top: Math.round(selected.rect.top + selected.rect.height / 2 - 50),
    width: 100,
    height: 100,
  }, item.metadata);
}

function hairlineBeforeRect(item, kind) {
  if (kind === 'cinematic') {
    const name = field(item.record, 'name');
    return clampRect({
      left: Math.round((name.x + name.width * 0.2) * item.pixelScaleX - 50),
      top: Math.round((name.y + name.height) * item.pixelScaleY - 50),
      width: 100,
      height: 100,
    }, item.metadata);
  }
  return { ...hairlineRect(item, kind), width: 100, height: 100 };
}

async function composeHairlineDetail(before, after) {
  const width = 2320;
  const titleHeight = 116;
  const rowHeight = 170;
  const height = titleHeight + rowHeight * FAMILIES.length;
  const layers = [{ input: labelSvg(width, titleHeight, [
    { x: 34, y: 52, text: 'HAIRLINE DETAIL · BEFORE / AFTER', size: 27, weight: 700, color: GOLD, spacing: 1 },
    { x: 34, y: 96, text: 'Native output pixels around each family’s information rule', size: 18, color: MUTED },
    { x: 38, y: 114, text: 'PHASE 2.7.5', size: 15, weight: 700 },
    { x: 1190, y: 114, text: 'PHASE 2.7.6', size: 15, weight: 700 },
  ]), left: 0, top: 0 }];
  for (let index = 0; index < FAMILIES.length; index += 1) {
    const family = FAMILIES[index];
    const old = before.get(family.id);
    const next = after.get(family.id);
    const oldRect = hairlineRect(old, family.id);
    const newRect = hairlineRect(next, family.id);
    const oldCrop = await crop(old.imagePath, oldRect);
    const newCrop = await crop(next.imagePath, newRect);
    const top = titleHeight + index * rowHeight;
    layers.push({ input: labelSvg(width, 38, [{ x: 34, y: 27, text: `${family.label.toUpperCase()} · 100% NATIVE`, size: 15, weight: 700, color: GOLD }]), left: 0, top });
    layers.push({ input: oldCrop, left: 38, top: top + 44 });
    layers.push({ input: newCrop, left: 1190, top: top + 44 });
  }
  await writeBoard('06-hairline-detail.png', width, height, layers);
}

async function composeKoJaDetail(before, after) {
  const locales = [
    { locale: 'ko', label: 'KO' },
    { locale: 'ja', label: 'JA' },
  ];
  const width = 2520;
  const titleHeight = 126;
  const rowHeight = 210;
  const rowSpecs = locales.flatMap((locale) => FAMILIES.map((family) => ({ ...locale, family })));
  const height = titleHeight + rowHeight * rowSpecs.length;
  const layers = [{ input: labelSvg(width, titleHeight, [
    { x: 34, y: 55, text: 'KO / JA TYPOGRAPHY · BEFORE / AFTER', size: 28, weight: 700, color: GOLD, spacing: 1 },
    { x: 34, y: 102, text: 'Localized job + level field crops for all three Masters · actual PNG pixels', size: 18, color: MUTED },
    { x: 38, y: 124, text: 'PHASE 2.7.5 BEFORE', size: 14, weight: 700 },
    { x: 1298, y: 124, text: 'PHASE 2.7.6 AFTER', size: 14, weight: 700 },
  ]), left: 0, top: 0 }];
  for (let index = 0; index < rowSpecs.length; index += 1) {
    const { locale, label: localeLabel, family } = rowSpecs[index];
    const old = before.get(`${family.id}:${locale}`);
    const next = after.get(`${family.id}:${locale}`);
    const oldCrop = await crop(old.imagePath, boundsRect(old, ['job', 'level'], 32, 28));
    const newCrop = await crop(next.imagePath, boundsRect(next, ['job', 'level'], 32, 28));
    const top = titleHeight + index * rowHeight;
    layers.push({ input: labelSvg(width, 34, [
      { x: 34, y: 24, text: `${localeLabel} · ${family.label.toUpperCase()}`, size: 15, weight: 700, color: GOLD },
    ]), left: 0, top });
    layers.push({ input: oldCrop, left: 38, top: top + 42 });
    layers.push({ input: newCrop, left: 1298, top: top + 42 });
  }
  await writeBoard('07-ko-ja-type-detail.png', width, height, layers);
}

async function composeTriptych(after) {
  const width = 2820;
  const headerHeight = 128;
  const panelWidth = 850;
  const panelHeight = 1062;
  const gap = 40;
  const padding = 20;
  const height = headerHeight + panelHeight + 32;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 38, y: 54, text: 'PRECISION CRAFT · MASTER TRIPTYCH', size: 28, weight: 700, color: GOLD, spacing: 1 },
    { x: 38, y: 100, text: 'Actual 4:5 2× PNG exports · resized overview; source exports remain unchanged', size: 18, color: MUTED },
  ]), left: 0, top: 0 }];
  for (let index = 0; index < FAMILIES.length; index += 1) {
    const family = FAMILIES[index];
    const panel = await fitPanel(after.get(family.id).imagePath, panelWidth, panelHeight);
    const left = padding + index * (panelWidth + gap);
    layers.push({ input: labelSvg(panelWidth, 44, [{ x: 8, y: 29, text: family.label.toUpperCase(), size: 16, weight: 700 }]), left, top: headerHeight });
    layers.push({ input: panel, left, top: headerHeight + 44 });
  }
  await writeBoard('08-master-triptych.png', width, height, layers);
}

async function compose400Board(before, after) {
  const edgeBefore = await crop(path.join(BEFORE_CROPS, 'before-editorial-edge-100.png'), { left: 25, top: 50, width: 100, height: 100 });
  const nameBefore = await crop(path.join(BEFORE_CROPS, 'before-editorial-name-100.png'), { left: 100, top: 20, width: 100, height: 100 });
  const rdmBefore = await crop(path.join(BEFORE_CROPS, 'before-editorial-rdm-100.png'), { left: 80, top: 35, width: 100, height: 100 });
  const cornerBefore = await crop(path.join(BEFORE_CROPS, 'before-cinematic-corner-100.png'), { left: 0, top: 0, width: 100, height: 100 });
  const glyphBefore = await crop(path.join(BEFORE_CROPS, 'before-identity-glyph-100.png'), { left: 0, top: 0, width: 100, height: 100 });
  const oldCinematic = before.get('cinematic');
  const newCinematic = after.get('cinematic');
  const oldEditorial = before.get('editorial');
  const newEditorial = after.get('editorial');
  const oldIdentity = before.get('identity');
  const newIdentity = after.get('identity');
  const hairlines = [
    {
      label: 'CINEMATIC HAIRLINE',
      before: await crop(oldCinematic.imagePath, hairlineBeforeRect(oldCinematic, 'cinematic')),
      after: await crop(newCinematic.imagePath, capturedHairlineRect(newCinematic, 'cinematic')),
    },
    {
      label: 'EDITORIAL HAIRLINE',
      before: await crop(oldEditorial.imagePath, hairlineBeforeRect(oldEditorial, 'editorial')),
      after: await crop(newEditorial.imagePath, capturedHairlineRect(newEditorial, 'editorial')),
    },
    {
      label: 'IDENTITY HAIRLINE',
      before: await crop(oldIdentity.imagePath, hairlineBeforeRect(oldIdentity, 'identity')),
      after: await crop(newIdentity.imagePath, capturedHairlineRect(newIdentity, 'identity')),
    },
  ];

  const editorial = newEditorial;
  const nameRect = fieldCropRect(editorial, 'name', 300, 140);
  const rdmRect = fieldCropRect(editorial, 'jobAbbreviation', 260, 170, 'center');
  const identityWorldRect = glyphRect(newIdentity, 'world', 100, 100);
  const afterBase = [
    ['EDITORIAL EDGE', await crop(editorial.imagePath, AFTER_EDGE_RECT), { left: 25, top: 50 }],
    ['DISPLAY TYPE', await crop(editorial.imagePath, nameRect), { left: 100, top: 20 }],
    ['RDM MOTIF', await crop(editorial.imagePath, rdmRect), { left: 80, top: 35 }],
    ['CINEMATIC CORNER', await crop(after.get('cinematic').imagePath, { left: 0, top: 0, width: 180, height: 180 }), { left: 0, top: 0 }],
    ['WORLD PICTOGRAM', await crop(newIdentity.imagePath, identityWorldRect), { left: 0, top: 0 }],
  ];
  const beforeBase = [
    ['EDITORIAL EDGE', edgeBefore],
    ['DISPLAY TYPE', nameBefore],
    ['RDM MOTIF', rdmBefore],
    ['CINEMATIC CORNER', cornerBefore],
    ['WORLD PICTOGRAM', glyphBefore],
  ];
  const comparisons = [
    ...beforeBase.map(([label, beforeImage], index) => ({ label, before: beforeImage, after: afterBase[index][1], offset: afterBase[index][2] })),
    ...hairlines,
  ];
  const width = 2640;
  const headerHeight = 132;
  const cellWidth = 850;
  const cellHeight = 470;
  const columns = 3;
  const gapX = 25;
  const gapY = 22;
  const padding = 24;
  const rows = Math.ceil(comparisons.length / columns);
  const height = headerHeight + rows * cellHeight + (rows - 1) * gapY + padding;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 28, y: 50, text: '400% DETAIL · NEAREST-NEIGHBOUR', size: 26, weight: 700, color: GOLD, spacing: 1 },
    { x: 28, y: 91, text: '100×100 native PNG crops enlarged 4× · after hairlines center on captured rule bounds', size: 16, color: MUTED },
    { x: 28, y: 120, text: 'Before master exports · after master exports', size: 14, weight: 700 },
  ]), left: 0, top: 0 }];
  for (let index = 0; index < comparisons.length; index += 1) {
    const entry = comparisons[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (cellWidth + gapX);
    const top = headerHeight + row * (cellHeight + gapY);
    const afterImage = entry.after;
    const beforeImage = entry.before;
    const afterCrop = entry.offset
      ? await crop(afterImage, { ...entry.offset, width: 100, height: 100 })
      : afterImage;
    const beforeZoom = await nearest(beforeImage, 4);
    const afterZoom = await nearest(afterCrop, 4);
    layers.push(
      { input: labelSvg(cellWidth, 38, [{ x: 10, y: 26, text: `${entry.label} · 400% NEAREST`, size: 15, weight: 700, color: GOLD }]), left, top },
      { input: labelSvg(390, 30, [{ x: 10, y: 22, text: 'BEFORE', size: 13, weight: 700 }]), left: left + 10, top: top + 44 },
      { input: labelSvg(390, 30, [{ x: 10, y: 22, text: 'AFTER', size: 13, weight: 700 }]), left: left + 430, top: top + 44 },
      { input: beforeZoom, left: left + 10, top: top + 80 },
      { input: afterZoom, left: left + 430, top: top + 80 },
    );
  }
  await writeBoard('09-400-percent-crops.png', width, height, layers);
}

async function main() {
  const auditInputs = [
    'before-cinematic-corner-100.png', 'before-cinematic-corner-200.png', 'before-cinematic-corner-400.png',
    'before-editorial-edge-100.png', 'before-editorial-edge-200.png', 'before-editorial-edge-400.png',
    'before-editorial-name-100.png', 'before-editorial-name-200.png', 'before-editorial-name-400.png',
    'before-editorial-rdm-100.png', 'before-editorial-rdm-200.png', 'before-editorial-rdm-400.png',
    'before-identity-glyph-100.png', 'before-identity-glyph-200.png', 'before-identity-glyph-400.png',
  ];
  for (const file of auditInputs) await requireFile(path.join(BEFORE_CROPS, file), `Before audit crop ${file}`);
  const oldExports = new Map();
  const newExports = new Map();
  for (const family of FAMILIES) {
    oldExports.set(family.id, await loadExport(BEFORE_EXPORTS, family));
    newExports.set(family.id, await loadExport(AFTER_EXPORTS, family));
  }
  const oldLocales = new Map();
  const newLocales = new Map();
  for (const family of FAMILIES) {
    for (const locale of ['ko', 'ja']) {
      oldLocales.set(`${family.id}:${locale}`, await loadExport(BEFORE_EXPORTS, family, locale));
      newLocales.set(`${family.id}:${locale}`, await loadExport(AFTER_EXPORTS, family, locale));
    }
  }
  const before = new Map(oldExports);
  const after = new Map(newExports);
  await fs.mkdir(OUT, { recursive: true });

  await composeEdgeBoard(after.get('editorial'));
  await composeDisplayType(before, after);
  await composeRdmDetail(oldExports.get('editorial'), newExports.get('editorial'));
  await composeBorderDetail(oldExports, newExports);
  await composePictogramDetail(oldExports.get('identity'), newExports.get('identity'));
  await composeHairlineDetail(oldExports, newExports);
  await composeKoJaDetail(oldLocales, newLocales);
  await composeTriptych(after);
  await compose400Board(before, after);

  const outputs = [
    '01-editorial-edge-before-after.png',
    '02-display-type-before-after.png',
    '03-rdm-type-detail.png',
    '04-border-detail.png',
    '05-pictogram-detail.png',
    '06-hairline-detail.png',
    '07-ko-ja-type-detail.png',
    '08-master-triptych.png',
    '09-400-percent-crops.png',
  ];
  for (const name of outputs) {
    const file = path.join(OUT, name);
    const metadata = await sharp(file).metadata();
    const stats = await fs.stat(file);
    console.log(`${path.relative(ROOT, file)}\t${metadata.width}×${metadata.height}\t${stats.size} bytes`);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});

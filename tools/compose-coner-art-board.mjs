import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/qa/coner-art-direction');
const EXPORTS = path.join(OUT, 'exports');
const PRIOR = path.join(ROOT, 'docs/qa/real-samples');
const PUBLIC = path.join(ROOT, 'public');
const BACKGROUND = '#171a1d';
const PAPER = '#ede6d8';
const GOLD = '#cfad72';
const MUTED = '#aaa69d';
const MAX_DIMENSION = 3000;

const FAMILIES = [
  {
    id: 'cinematic', label: 'Cinematic · C2', slug: 'cinematic',
    prior: '02-cinematic-coner.png',
    concept: 'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_49-1.png',
  },
  {
    id: 'editorial', label: 'Editorial · E2', slug: 'editorial',
    prior: '03-editorial-coner.png',
    concept: 'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_50-2.png',
  },
  {
    id: 'identity', label: 'Identity · I3', slug: 'id-card',
    prior: '04-identity-coner.png',
    concept: 'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_51-3.png',
  },
];

const EXPORT_FILES = new Map(FAMILIES.map((family) => [
  family.id,
  path.join(EXPORTS, `${family.slug}-en-4x5-2x.png`),
]));
const EXPORT_RECORDS = new Map(FAMILIES.map((family) => [
  family.id,
  path.join(EXPORTS, `${family.slug}-en-4x5-2x.json`),
]));
const MATERIALS = [
  { id: 'cinematic', label: 'Cinematic material', file: path.join(PUBLIC, 'images/materials/cinematic.webp') },
  { id: 'editorial', label: 'Editorial material', file: path.join(PUBLIC, 'images/materials/editorial.webp') },
  { id: 'id-card', label: 'Identity material', file: path.join(PUBLIC, 'images/materials/id-card.webp') },
];
const GLYPH_FIELD_MAP = { service: 'origin' };

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function labelSvg(width, height, lines, background = BACKGROUND, defaultColor = PAPER) {
  const text = lines.map((line) => `<text x="${line.x ?? 36}" y="${line.y}" fill="${line.color ?? defaultColor}" font-family="Arial, sans-serif" font-size="${line.size ?? 22}" font-weight="${line.weight ?? 400}" letter-spacing="${line.spacing ?? 0}">${xml(line.text)}</text>`).join('');
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

async function fitPanel(file, width, height) {
  return sharp(file)
    .resize(width, height, { fit: 'contain', background: BACKGROUND, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function writeBoard(name, width, height, layers, background = BACKGROUND) {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`${name} exceeds ${MAX_DIMENSION}px (${width}×${height})`);
  }
  await sharp({ create: { width, height, channels: 3, background } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
}

async function loadExport(family) {
  const imagePath = await requireFile(EXPORT_FILES.get(family.id), `${family.label} current 2× export`);
  const recordPath = await requireFile(EXPORT_RECORDS.get(family.id), `${family.label} saved export record`);
  const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height || !record.size?.scale || !record.logical?.width || !record.logical?.height) {
    throw new Error(`${family.label} export record lacks size/logical dimensions`);
  }
  if (record.size.width !== metadata.width || record.size.height !== metadata.height
    || Math.abs((metadata.width / record.logical.width) - (metadata.height / record.logical.height)) > 0.01) {
    throw new Error(`${family.label} export record does not match its PNG dimensions`);
  }
  return {
    imagePath,
    record,
    metadata,
    pixelScaleX: metadata.width / record.logical.width,
    pixelScaleY: metadata.height / record.logical.height,
  };
}

async function composeBeforeAfter(family, currentExport) {
  const prior = await requireFile(path.join(PRIOR, family.prior), `${family.label} Phase 2.7.4 card`);
  const width = 2820;
  const headerHeight = 138;
  const panelWidth = 1360;
  const panelHeight = 1700;
  const height = headerHeight + panelHeight + 28;
  const left = await fitPanel(prior, panelWidth, panelHeight);
  const right = await fitPanel(currentExport, panelWidth, panelHeight);
  await writeBoard(`0${FAMILIES.indexOf(family) + 1}-before-after-${family.id}.png`, width, height, [
    { input: labelSvg(width, headerHeight, [
      { x: 38, y: 54, text: `${family.label.toUpperCase()} · BEFORE / AFTER`, size: 29, weight: 700, color: GOLD, spacing: 1 },
      { x: 38, y: 102, text: 'Overview resized for comparison · source PNGs remain unchanged at full 2× resolution', size: 20, color: MUTED },
      { x: 48, y: 134, text: 'PHASE 2.7.4', size: 17, weight: 700 },
      { x: 1460, y: 134, text: 'PHASE 2.7.5 · ACTUAL RENDERER EXPORT', size: 17, weight: 700 },
    ]), left: 0, top: 0 },
    { input: left, left: 32, top: headerHeight },
    { input: right, left: 1428, top: headerHeight },
  ]);
}

async function composeConceptComparison(exports) {
  const width = 2820;
  const titleHeight = 128;
  const rowHeight = 650;
  const columnWidth = 1356;
  const imageWidth = 1324;
  const imageHeight = 566;
  const gap = 36;
  const padding = 24;
  const height = titleHeight + rowHeight * FAMILIES.length;
  const layers = [{ input: labelSvg(width, titleHeight, [
    { x: 38, y: 55, text: 'SUPPLIED CONCEPTS / CURRENT 2× RENDERER EXPORTS', size: 28, weight: 700, color: GOLD, spacing: 1 },
    { x: 38, y: 101, text: 'Concepts are references only; the right column is the current saved 4:5 PNG export', size: 19, color: MUTED },
  ]), left: 0, top: 0 }];

  for (let row = 0; row < FAMILIES.length; row += 1) {
    const family = FAMILIES[row];
    const top = titleHeight + row * rowHeight;
    const concept = await requireFile(family.concept, `${family.label} supplied concept`);
    const before = await fitPanel(concept, imageWidth, imageHeight);
    const after = await fitPanel(exports.get(family.id).imagePath, imageWidth, imageHeight);
    layers.push(
      { input: labelSvg(columnWidth, 52, [{ x: 10, y: 35, text: `${family.label.toUpperCase()} · SUPPLIED CONCEPT`, size: 18, weight: 700 }]), left: padding, top },
      { input: labelSvg(columnWidth, 52, [{ x: 10, y: 35, text: `${family.label.toUpperCase()} · CURRENT RENDERER`, size: 18, weight: 700 }]), left: padding + columnWidth + gap, top },
      { input: before, left: padding, top: top + 52 },
      { input: after, left: padding + columnWidth + gap, top: top + 52 },
    );
  }

  await writeBoard('04-concept-vs-renderer.png', width, height, layers);
}

function pixelBounds(record, names, imageMetadata, pixelScaleX, pixelScaleY, marginX, marginY) {
  const fields = names.map((name) => {
    const field = record.fields?.find((item) => item.field === name);
    if (!field) throw new Error(`Missing saved export field bound: ${name}`);
    return {
      left: field.x * pixelScaleX,
      top: field.y * pixelScaleY,
      right: (field.x + field.width) * pixelScaleX,
      bottom: (field.y + field.height) * pixelScaleY,
    };
  });
  const left = Math.max(0, Math.floor(Math.min(...fields.map((field) => field.left)) - marginX));
  const top = Math.max(0, Math.floor(Math.min(...fields.map((field) => field.top)) - marginY));
  const right = Math.min(imageMetadata.width, Math.ceil(Math.max(...fields.map((field) => field.right)) + marginX));
  const bottom = Math.min(imageMetadata.height, Math.ceil(Math.max(...fields.map((field) => field.bottom)) + marginY));
  return { left, top, width: right - left, height: bottom - top };
}

async function nativeCrop(file, rect) {
  return sharp(file).extract(rect).png().toBuffer();
}

async function composeTypographyDetail(exports) {
  const specs = [
    { id: 'cinematic', fields: ['name'], note: 'name bound' },
    { id: 'editorial', fields: ['masthead', 'name'], note: 'masthead + name bounds' },
    { id: 'identity', fields: ['name', 'job', 'jobAbbreviation', 'level'], note: 'name / job / abbreviation / level bounds', marginY: 8 },
  ];
  const rows = [];
  for (const spec of specs) {
    const item = exports.get(spec.id);
    const rect = pixelBounds(item.record, spec.fields, item.metadata, item.pixelScaleX, item.pixelScaleY, 28, spec.marginY ?? 24);
    rows.push({ ...spec, rect, crop: await nativeCrop(item.imagePath, rect) });
  }
  const width = Math.max(1040, ...rows.map((row) => row.rect.width + 80));
  const height = 132 + rows.reduce((sum, row) => sum + 54 + row.rect.height + 22, 0);
  const layers = [{ input: labelSvg(width, 132, [
    { x: 38, y: 56, text: 'TYPOGRAPHY DETAIL · SAVED FIELD BOUNDS', size: 28, weight: 700, color: GOLD, spacing: 1 },
    { x: 38, y: 102, text: 'Crops use same-export JSON logical bounds mapped to PNG pixels; crops are not resized', size: 19, color: MUTED },
  ]), left: 0, top: 0 }];
  let top = 132;
  for (const row of rows) {
    layers.push({ input: labelSvg(width, 54, [
      { x: 38, y: 36, text: `${row.id.toUpperCase()} · ${row.note.toUpperCase()} · ${row.rect.left},${row.rect.top} · ${row.rect.width}×${row.rect.height} NATIVE PIXELS`, size: 16, weight: 700 },
    ]), left: 0, top });
    layers.push({ input: row.crop, left: 38, top: top + 54 });
    top += 54 + row.rect.height + 22;
  }
  await writeBoard('05-typography-detail.png', width, height, layers);
}

async function composeBorderDetail(exports) {
  const cinematic = await nativeCrop(exports.get('cinematic').imagePath, { left: 1660, top: 0, width: 500, height: 500 });
  const editorial = await nativeCrop(exports.get('editorial').imagePath, { left: 800, top: 760, width: 1000, height: 500 });
  const identity = await nativeCrop(exports.get('identity').imagePath, { left: 1660, top: 0, width: 500, height: 500 });
  const width = 1200;
  const headerHeight = 116;
  const rows = [
    { label: 'CINEMATIC C2 · TOP-RIGHT BRASS CORNER · 500×500 NATIVE', crop: cinematic },
    { label: 'EDITORIAL E2 · TORN PHOTO / PAPER SEAM · 1000×500 NATIVE CLIP (X800 Y760)', crop: editorial },
    { label: 'IDENTITY I3 · TOP-RIGHT BRASS CORNER · 500×500 NATIVE', crop: identity },
  ];
  const height = headerHeight + rows.reduce((sum, row) => sum + 52 + (row.label.startsWith('EDITORIAL') ? 500 : 500) + 18, 0);
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 36, y: 52, text: 'BORDER DETAIL · NATIVE 2× EXPORT CROPS', size: 27, weight: 700, color: GOLD, spacing: 1 },
    { x: 36, y: 93, text: 'No scaling, masking, repainting or simulated borders', size: 18, color: MUTED },
  ]), left: 0, top: 0 }];
  let top = headerHeight;
  for (const row of rows) {
    layers.push({ input: labelSvg(width, 52, [{ x: 36, y: 35, text: row.label, size: 16, weight: 700 }]), left: 0, top });
    layers.push({ input: row.crop, left: 36, top: top + 52 });
    top += 52 + 500 + 18;
  }
  await writeBoard('06-border-detail.png', width, height, layers);
}

function glyphCropBounds(identity, glyphName) {
  const { record, metadata: imageMetadata, pixelScaleX, pixelScaleY } = identity;
  const fieldName = GLYPH_FIELD_MAP[glyphName] ?? glyphName;
  const field = record.fields?.find((item) => item.field === fieldName);
  if (!field) throw new Error(`Glyph ${glyphName} has no saved I3 field bound`);
  const left = Math.max(0, Math.floor(field.x * pixelScaleX - 100));
  const top = Math.max(0, Math.floor(field.y * pixelScaleY - 44));
  const width = Math.min(imageMetadata.width - left, Math.min(520, Math.max(280, Math.ceil(field.width * pixelScaleX + 64))));
  const height = Math.min(imageMetadata.height - top, Math.max(126, Math.ceil(field.height * pixelScaleY + 88)));
  return { left, top, width, height };
}

async function composePictogramDetail(identity) {
  const glyphs = identity.record.glyphs;
  if (!Array.isArray(glyphs) || glyphs.length === 0 || glyphs.some((glyph) => typeof glyph !== 'string')) {
    throw new Error('The identity export glyph inventory must be an array of field-name strings');
  }
  const columns = 3;
  const cellWidth = 560;
  const cellHeight = 205;
  const gap = 20;
  const padding = 30;
  const headerHeight = 132;
  const rows = Math.ceil(glyphs.length / columns);
  const width = padding * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = headerHeight + rows * cellHeight + padding;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 36, y: 56, text: 'PICTOGRAM DETAIL · IDENTITY I3', size: 28, weight: 700, color: GOLD, spacing: 1 },
    { x: 36, y: 102, text: 'Crop left = saved field x mapped to PNG pixels − 100px · no resize', size: 18, color: MUTED },
  ]), left: 0, top: 0 }];

  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index];
    const rect = glyphCropBounds(identity, glyph);
    const crop = await nativeCrop(identity.imagePath, rect);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (cellWidth + gap);
    const top = headerHeight + row * cellHeight;
    layers.push({ input: labelSvg(cellWidth, 42, [{ x: 8, y: 29, text: `${glyph} · X${rect.left} Y${rect.top} · ${rect.width}×${rect.height}`, size: 14, weight: 700 }]), left, top });
    layers.push({ input: crop, left: left + 8, top: top + 50 });
  }
  await writeBoard('07-pictogram-detail.png', width, height, layers);
}

async function composeMaterialDetail() {
  const paperBackground = '#eee6d7';
  const paperInk = '#302921';
  const cropSize = 500;
  const panelWidth = 540;
  const gap = 24;
  const padding = 32;
  const headerHeight = 132;
  const width = padding * 2 + MATERIALS.length * panelWidth + (MATERIALS.length - 1) * gap;
  const height = headerHeight + 62 + cropSize + padding;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 36, y: 56, text: 'MATERIAL DETAIL · SOURCE TEXTURE PIXELS', size: 27, weight: 700, color: '#85683d', spacing: 1 },
    { x: 36, y: 102, text: 'Native 500×500 crops with source alpha over a neutral paper swatch · no synthetic screenshots', size: 18, color: '#756d61' },
  ], paperBackground, paperInk), left: 0, top: 0 }];

  for (let index = 0; index < MATERIALS.length; index += 1) {
    const material = MATERIALS[index];
    const metadata = await sharp(material.file).metadata();
    if (!metadata.width || !metadata.height || metadata.width < cropSize || metadata.height < cropSize) {
      throw new Error(`Material asset is smaller than ${cropSize}px: ${material.file}`);
    }
    const rect = {
      left: Math.floor((metadata.width - cropSize) / 2),
      top: Math.floor((metadata.height - cropSize) / 2),
      width: cropSize,
      height: cropSize,
    };
    const crop = await nativeCrop(material.file, rect);
    const left = padding + index * (panelWidth + gap);
    layers.push({ input: labelSvg(panelWidth, 62, [
      { x: 8, y: 28, text: material.label.toUpperCase(), size: 15, weight: 700 },
      { x: 8, y: 51, text: `${path.basename(material.file)} · ${metadata.width}×${metadata.height} source`, size: 13, color: '#756d61' },
    ], paperBackground, paperInk), left, top: headerHeight });
    layers.push({ input: crop, left: left + 8, top: headerHeight + 62 });
  }
  await writeBoard('08-material-detail.png', width, height, layers, paperBackground);
}

async function composeTriptych(exports) {
  const width = 2820;
  const headerHeight = 130;
  const panelWidth = 850;
  const panelHeight = 1062;
  const gap = 40;
  const padding = 20;
  const height = headerHeight + panelHeight + 28;
  const layers = [{ input: labelSvg(width, headerHeight, [
    { x: 38, y: 56, text: 'CONER · MASTER CARD TRIPTYCH', size: 29, weight: 700, color: GOLD, spacing: 1 },
    { x: 38, y: 102, text: 'Actual 4:5 2× renderer exports · overview resized for one-page comparison', size: 19, color: MUTED },
  ]), left: 0, top: 0 }];

  for (let index = 0; index < FAMILIES.length; index += 1) {
    const family = FAMILIES[index];
    const panel = await fitPanel(exports.get(family.id).imagePath, panelWidth, panelHeight);
    const left = padding + index * (panelWidth + gap);
    layers.push({ input: labelSvg(panelWidth, 48, [{ x: 8, y: 32, text: family.label.toUpperCase(), size: 17, weight: 700 }]), left, top: headerHeight });
    layers.push({ input: panel, left, top: headerHeight + 48 });
  }
  await writeBoard('09-coner-master-triptych.png', width, height, layers);
}

async function main() {
  for (const family of FAMILIES) {
    await requireFile(path.join(PRIOR, family.prior), `${family.label} Phase 2.7.4 card`);
    await requireFile(family.concept, `${family.label} concept reference`);
  }
  for (const material of MATERIALS) await requireFile(material.file, material.label);

  const exports = new Map();
  for (const family of FAMILIES) exports.set(family.id, await loadExport(family));
  const identity = exports.get('identity');
  if (!identity.record.glyphs?.length) throw new Error('Identity export has no glyph inventory');
  await fs.mkdir(OUT, { recursive: true });

  for (const family of FAMILIES) await composeBeforeAfter(family, exports.get(family.id).imagePath);
  await composeConceptComparison(exports);
  await composeTypographyDetail(exports);
  await composeBorderDetail(exports);
  await composePictogramDetail(identity);
  await composeMaterialDetail();
  await composeTriptych(exports);

  const outputs = [
    '01-before-after-cinematic.png',
    '02-before-after-editorial.png',
    '03-before-after-identity.png',
    '04-concept-vs-renderer.png',
    '05-typography-detail.png',
    '06-border-detail.png',
    '07-pictogram-detail.png',
    '08-material-detail.png',
    '09-coner-master-triptych.png',
  ];
  for (const name of outputs) {
    const file = path.join(OUT, name);
    const metadata = await sharp(file).metadata();
    const stat = await fs.stat(file);
    console.log(`${path.relative(ROOT, file)}\t${metadata.width}×${metadata.height}\t${stat.size} bytes`);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});

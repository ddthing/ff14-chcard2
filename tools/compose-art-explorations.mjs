#!/usr/bin/env node

import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'docs', 'qa', 'phase263');
const DRAFT_CODES = ['c1', 'c2', 'c3', 'e1', 'e2', 'e3', 'i1', 'i2', 'i3'];
const FAMILIES = ['cinematic', 'editorial', 'id-card'];
const BACKGROUND = '#11120f';
const REFERENCE_DEFAULT = 'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 9월 29일 오후 07_57_59.png';
const MASTER_EXPORTS = [
  { family: 'cinematic', filename: 'cinematic-ko-basic-4x5-2x.png' },
  { family: 'editorial', filename: 'editorial-ko-basic-4x5-2x.png' },
  { family: 'id-card', filename: 'id-card-ko-basic-4x5-2x.png' },
];

const DIRECTIONS = {
  c1: { family: 'cinematic', title: 'C1 · PURE KEY VISUAL', note: '90%+ screenshot · large name · restrained job and world' },
  c2: { family: 'cinematic', title: 'C2 · EDITORIAL CINEMA', note: 'Full bleed · asymmetric information cluster · thin rule' },
  c3: { family: 'cinematic', title: 'C3 · CINEMATIC RECORD', note: 'Image first · top index · compact field-record base' },
  e1: { family: 'editorial', title: 'E1 · TYPE DOMINANT', note: 'Name leads · photo enters the type field · large job mark' },
  e2: { family: 'editorial', title: 'E2 · IMAGE COLLISION', note: 'Image crosses the type area while the face stays clear' },
  e3: { family: 'editorial', title: 'E3 · MAGAZINE SPREAD', note: 'Masthead · independent grids · deliberate white space' },
  i1: { family: 'id-card', title: 'I1 · ARCHIVAL ID', note: 'Portrait · numbered identity grid · fine rules' },
  i2: { family: 'id-card', title: 'I2 · FIELD DOSSIER', note: 'Portrait · dense profile middle · meaningful sections' },
  i3: { family: 'id-card', title: 'I3 · PREMIUM CARD', note: 'Larger portrait · strong identity · quiet fine type' },
};

const options = parseArgs(process.argv.slice(2));
if (options.help || !options.mode) {
  printHelp();
  process.exit(options.help ? 0 : 2);
}

if (!['drafts', 'masters', 'all'].includes(options.mode)) {
  throw new Error(`Unknown mode: ${options.mode}. Choose drafts, masters, or all.`);
}

const draftInputs = options.mode === 'drafts' || options.mode === 'all' ? await resolveDraftInputs() : [];
const masterInputs = options.mode === 'masters' || options.mode === 'all' ? await resolveMasterInputs() : [];
const referencePath = path.resolve(options.reference ?? REFERENCE_DEFAULT);
if (options.mode === 'drafts' || options.mode === 'all') await assertReadable(referencePath);

await mkdir(OUTPUT_DIR, { recursive: true });
const fontCacheDirectory = await mkdtemp(path.join(OUTPUT_DIR, '.fontcache-'));
process.env.XDG_CACHE_HOME = fontCacheDirectory;
process.env.FC_CACHEDIR = fontCacheDirectory;

try {
  const { default: sharp } = await import('sharp');
  for (const source of draftInputs) await validateImage(sharp, source.path, 1080, 1350, 'webp');
  for (const source of masterInputs) await validateImage(sharp, source.path, 2160, 2700, 'png');
  if (draftInputs.length) {
    await createExplorationSheets(sharp, draftInputs, referencePath, options.crop ?? '840,50,680,298');
  }
  if (masterInputs.length) {
    await createMasterSheets(sharp, masterInputs, referencePath, options.crop ?? '840,50,680,298');
  }
} finally {
  const cachePath = path.resolve(fontCacheDirectory);
  const relativeCachePath = path.relative(path.resolve(OUTPUT_DIR), cachePath);
  if (!relativeCachePath.startsWith('.fontcache-') || path.isAbsolute(relativeCachePath) || relativeCachePath.startsWith('..')) {
    throw new Error(`Refusing to remove an unexpected font-cache path: ${cachePath}`);
  }
  await rm(cachePath, { recursive: true, force: true });
}

function parseArgs(args) {
  const [mode, ...rest] = args;
  const parsed = { mode, crop: '840,50,680,298' };
  if (mode === '--help' || mode === '-h') return { mode: null, help: true };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Expected a value after ${token}`);
    parsed[name] = value;
    index += 1;
  }
  return parsed;
}

function printHelp() {
  console.log(`Phase 2.6.3 art exploration sheet compositor (run from project root)

Build all five exploration review sheets after all nine collector exports exist:
  node tools/compose-art-explorations.mjs drafts

Build the optional final-master comparison sheets:
  node tools/compose-art-explorations.mjs masters

Build both groups:
  node tools/compose-art-explorations.mjs all

Options:
  --reference PATH    Original reference image (default: supplied attachment)
  --crop x,y,w,h      Crop in the reference's 1536 × 1024 coordinate space

Draft inputs are docs/qa/phase263/{c1,c2,c3,e1,e2,e3,i1,i2,i3}-ko-draft.webp.
All nine must exist and be 1080 × 1350; no placeholders are generated.
Master inputs are the three *-ko-basic-4x5-2x.png collector exports.`);
}

function inputPath(filename) {
  return path.join(ROOT, 'docs', 'qa', 'phase263', filename);
}

async function assertReadable(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Required source file is missing: ${filePath}`);
  }
}

async function validateImage(sharp, filePath, expectedWidth, expectedHeight, expectedFormat) {
  await assertReadable(filePath);
  const metadata = await sharp(filePath).metadata();
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight || metadata.format !== expectedFormat) {
    throw new Error(`${path.basename(filePath)} is ${metadata.width} × ${metadata.height}px ${metadata.format}; expected ${expectedWidth} × ${expectedHeight}px ${expectedFormat}.`);
  }
}

async function resolveDraftInputs() {
  const sources = DRAFT_CODES.map((code) => ({
    code,
    ...DIRECTIONS[code],
    path: inputPath(`${code}-ko-draft.webp`),
  }));
  const missing = [];
  for (const source of sources) {
    try {
      await access(source.path);
    } catch {
      missing.push(path.basename(source.path));
    }
  }
  if (missing.length) {
    throw new Error(`Waiting for all nine real review exports; missing: ${missing.join(', ')}`);
  }

  return sources;
}

async function resolveMasterInputs() {
  const sources = MASTER_EXPORTS.map((item) => ({ ...item, path: inputPath(item.filename) }));
  const missing = [];
  for (const source of sources) {
    try {
      await access(source.path);
    } catch {
      missing.push(source.filename);
    }
  }
  if (missing.length) throw new Error(`Waiting for all three real Master exports; missing: ${missing.join(', ')}`);

  return sources;
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function textSvg(text, width, height, { size = 20, color = '#eee7dc', weight = 500, spacing = 0.65 } = {}) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="${size}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}">${escapeXml(text)}</text></svg>`);
}

async function textLayer(text, width, height, x, y, options) {
  return { input: textSvg(text, width, height, options), left: x, top: y };
}

async function imageBuffer(sharp, filePath, width, height) {
  return sharp(filePath)
    .rotate()
    .resize(width, height, { fit: 'contain', background: BACKGROUND })
    .png()
    .toBuffer();
}

async function cropReference(sharp, filePath, cropCoordinates) {
  const metadata = await sharp(filePath).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (!sourceWidth || !sourceHeight) throw new Error(`Reference image has no dimensions: ${filePath}`);

  const [baseLeft, baseTop, baseWidth, baseHeight] = cropCoordinates.split(',').map(Number);
  if ([baseLeft, baseTop, baseWidth, baseHeight].some((value) => !Number.isFinite(value)) || baseWidth <= 0 || baseHeight <= 0) {
    throw new Error('Crop must be x,y,width,height in 1536 × 1024 reference coordinates.');
  }

  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(baseLeft * sourceWidth / 1536)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(baseTop * sourceHeight / 1024)));
  const width = Math.max(1, Math.min(sourceWidth - left, Math.round(baseWidth * sourceWidth / 1536)));
  const height = Math.max(1, Math.min(sourceHeight - top, Math.round(baseHeight * sourceHeight / 1024)));
  return sharp(filePath).rotate().extract({ left, top, width, height }).png().toBuffer();
}

async function createExplorationSheets(sharp, inputs, referencePath, cropCoordinates) {
  for (const family of FAMILIES) {
    const familyInputs = inputs.filter((item) => item.family === family);
    await createFamilySheet(sharp, family, familyInputs, path.join(OUTPUT_DIR, `${family}-exploration.png`));
  }
  await createAllSheet(sharp, inputs, path.join(OUTPUT_DIR, 'all-explorations.png'));
  await createReferenceExplorations(sharp, inputs, referencePath, cropCoordinates, path.join(OUTPUT_DIR, 'reference-explorations.png'));
}

async function createFamilySheet(sharp, family, inputs, outputPath) {
  const width = 1560;
  const height = 744;
  const cardWidth = 470;
  const cardHeight = 588;
  const horizontalGap = 18;
  const composite = [];
  const familyLabel = family === 'id-card' ? 'ADVENTURER ID' : family.toUpperCase();
  composite.push(await textLayer(`${familyLabel} · THREE COMPOSITION EXPLORATIONS`, width - 64, 32, 32, 22, { size: 23, color: '#c5a474', weight: 600, spacing: 1.1 }));

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    const x = 32 + index * (cardWidth + horizontalGap);
    composite.push(await textLayer(item.title, cardWidth, 26, x, 70, { size: 16, weight: 600, spacing: 0.3 }));
    composite.push(await textLayer(item.note, cardWidth, 26, x, 96, { size: 10, color: '#a9a197', weight: 400, spacing: 0.1 }));
    composite.push({ input: await imageBuffer(sharp, item.path, cardWidth, cardHeight), left: x, top: 132 });
  }
  await saveCanvas(sharp, outputPath, width, height, composite);
}

async function createAllSheet(sharp, inputs, outputPath) {
  const width = 1560;
  const cardWidth = 470;
  const cardHeight = 588;
  const gapX = 18;
  const rowPitch = 652;
  const height = 2055;
  const composite = [];
  composite.push(await textLayer('NINE ART DIRECTION DRAFTS · KO · 4:5', width - 64, 34, 32, 22, { size: 24, color: '#c5a474', weight: 600, spacing: 1.1 }));

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = 32 + column * (cardWidth + gapX);
    const y = 78 + row * rowPitch;
    composite.push(await textLayer(item.title, cardWidth, 26, x, y, { size: 15, weight: 600, spacing: 0.25 }));
    composite.push(await textLayer(item.note, cardWidth, 26, x, y + 24, { size: 9, color: '#a9a197', weight: 400, spacing: 0.05 }));
    composite.push({ input: await imageBuffer(sharp, item.path, cardWidth, cardHeight), left: x, top: y + 52 });
  }

  await saveCanvas(sharp, outputPath, width, height, composite);
}

async function createReferenceExplorations(sharp, inputs, referencePath, cropCoordinates, outputPath) {
  const width = 2048;
  const height = 1640;
  const crop = await cropReference(sharp, referencePath, cropCoordinates);
  const referenceTile = await sharp(crop).resize(680, 298, { fit: 'contain', background: BACKGROUND }).png().toBuffer();
  const cardWidth = 370;
  const cardHeight = 463;
  const xStart = 750;
  const xGap = 20;
  const rowPitch = 493;
  const composite = [];

  composite.push(await textLayer('REFERENCE + NINE EXPLORATIONS · SAME SAMPLE PER FAMILY', width - 64, 34, 32, 22, { size: 24, color: '#c5a474', weight: 600, spacing: 0.9 }));
  composite.push(await textLayer('REFERENCE · TOP-RIGHT CARD REGION', 680, 26, 32, 84, { size: 15, color: '#eee7dc', weight: 600, spacing: 0.4 }));
  composite.push({ input: referenceTile, left: 32, top: 122 });
  composite.push(await textLayer('CINEMATIC · EDITORIAL · ID', 680, 22, 32, 432, { size: 12, color: '#a9a197', weight: 400, spacing: 1.0 }));

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = xStart + column * (cardWidth + xGap);
    const y = 86 + row * rowPitch;
    composite.push(await textLayer(item.title, cardWidth, 26, x, y, { size: 13, weight: 600, spacing: 0.15 }));
    composite.push({ input: await imageBuffer(sharp, item.path, cardWidth, cardHeight), left: x, top: y + 28 });
  }

  await saveCanvas(sharp, outputPath, width, height, composite);
}

async function createMasterSheets(sharp, inputs, referencePath, cropCoordinates) {
  const comparisonPath = path.join(OUTPUT_DIR, 'master-comparison.png');
  const referencePathOut = path.join(OUTPUT_DIR, 'reference-review.png');
  await createMasterComparison(sharp, inputs, comparisonPath);
  await createMasterReferenceReview(sharp, inputs, referencePath, cropCoordinates, referencePathOut);
}

async function createMasterComparison(sharp, inputs, outputPath) {
  const width = 1800;
  const height = 790;
  const cardWidth = 520;
  const cardHeight = 650;
  const gap = 45;
  const composite = [
    await textLayer('MASTER A EXPORTS · KO · 4:5 · PNG 2×', width - 80, 38, 40, 26, { size: 25, color: '#c5a474', weight: 600, spacing: 1.0 }),
  ];

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    const x = 40 + index * (cardWidth + gap);
    const label = item.family === 'id-card' ? 'ADVENTURER ID' : item.family.toUpperCase();
    composite.push(await textLayer(label, cardWidth, 28, x, 82, { size: 18, weight: 600, spacing: 0.8 }));
    composite.push({ input: await imageBuffer(sharp, item.path, cardWidth, cardHeight), left: x, top: 120 });
  }
  await saveCanvas(sharp, outputPath, width, height, composite);
}

async function createMasterReferenceReview(sharp, inputs, referencePath, cropCoordinates, outputPath) {
  const width = 1920;
  const height = 650;
  const crop = await cropReference(sharp, referencePath, cropCoordinates);
  const referenceTile = await sharp(crop).resize(680, 298, { fit: 'contain', background: BACKGROUND }).png().toBuffer();
  const cardWidth = 340;
  const cardHeight = 425;
  const gap = 16;
  const composite = [
    await textLayer('REFERENCE vs MASTER A · SAME TOP-RIGHT CARD CROP', width - 64, 34, 32, 22, { size: 24, color: '#c5a474', weight: 600, spacing: 0.9 }),
    await textLayer('USER REFERENCE', 680, 26, 32, 78, { size: 15, weight: 600, spacing: 0.5 }),
    { input: referenceTile, left: 32, top: 116 },
  ];

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    const x = 750 + index * (cardWidth + gap);
    const label = item.family === 'id-card' ? 'ADVENTURER ID' : item.family.toUpperCase();
    composite.push(await textLayer(label, cardWidth, 26, x, 78, { size: 14, weight: 600, spacing: 0.5 }));
    composite.push({ input: await imageBuffer(sharp, item.path, cardWidth, cardHeight), left: x, top: 116 });
  }
  await saveCanvas(sharp, outputPath, width, height, composite);
}

async function saveCanvas(sharp, outputPath, width, height, composite) {
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite(composite)
    .png()
    .toFile(outputPath);
  console.log(`Wrote ${path.relative(ROOT, outputPath)}`);
}

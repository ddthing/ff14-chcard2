#!/usr/bin/env node

import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'docs', 'qa', 'phase262');
const REFERENCE_DEFAULT = 'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 9월 29일 오후 07_57_59.png';
const TEMPLATE_SCREENSHOT_DEFAULT = 'docs/qa/phase261/templates-final.png';
const RATIOS = ['1:1', '4:5', '3:4', '9:16', '16:9'];
const FORMATS = ['png', 'webp'];
const LOCALES = ['ko', 'en', 'ja'];
const CASES = ['basic', 'short', 'latin', 'korean', 'japanese', 'han', 'sparse', 'dense'];
const FAMILIES = ['cinematic', 'editorial', 'id-card'];
const BACKGROUND = '#10110f';

const options = parseArgs(process.argv.slice(2));

if (options.help || !options.mode) {
  printHelp();
  process.exit(options.help ? 0 : 2);
}

await mkdir(OUTPUT_DIR, { recursive: true });

if (options.mode === 'before') {
  await composeBeforeReview();
} else if (options.mode === 'master') {
  const exports = await getCurrentExports();
  const out = resolve(options.out ?? path.join(OUTPUT_DIR, 'master-comparison.png'));
  await composeMasterComparison(exports, out);
} else if (options.mode === 'reference') {
  const exports = await getCurrentExports();
  const out = resolve(options.out ?? path.join(OUTPUT_DIR, 'reference-review.png'));
  await composeReferenceReview(exports, out);
} else {
  throw new Error(`Unknown mode: ${options.mode}`);
}

function parseArgs(args) {
  const [mode, ...rest] = args;
  const parsed = { mode, crop: '840,50,680,298' };
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
  console.log(`Card review compositor (run from the project root)

Before work, using the retained Phase 261 exports:
  node tools/compose-card-review.mjs before --reference "${REFERENCE_DEFAULT}"

Current three-family export sheet (query options default to ko/basic/4:5/png):
  node tools/compose-card-review.mjs master --locale ko --case basic --ratio 4:5 --format png

Reference crop and current output review:
  node tools/compose-card-review.mjs reference --reference "${REFERENCE_DEFAULT}" --crop 840,50,680,298

Options: --out PATH --reference PATH --templates PATH --crop x,y,width,height
The crop is scaled from the supplied reference's 1536 × 1024 coordinate space.`);
}

function resolve(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

async function assertReadable(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Input file not found: ${filePath}`);
  }
}

function validateQueryOptions() {
  const locale = options.locale ?? 'ko';
  const fixtureCase = options.case ?? 'basic';
  const ratio = options.ratio ?? '4:5';
  const format = options.format ?? 'png';
  if (!LOCALES.includes(locale)) throw new Error(`Unsupported locale: ${locale}`);
  if (!CASES.includes(fixtureCase)) throw new Error(`Unsupported case: ${fixtureCase}`);
  if (!RATIOS.includes(ratio)) throw new Error(`Unsupported ratio: ${ratio}`);
  if (!FORMATS.includes(format)) throw new Error(`Unsupported format: ${format}`);
  return { locale, fixtureCase, ratio, format };
}

function exportFilename(family, { locale, fixtureCase, ratio, format }) {
  return `${family}-${locale}-${fixtureCase}-${ratio.replace(':', 'x')}-2x.${format}`;
}

async function getCurrentExports() {
  const directory = resolve(options.dir ?? OUTPUT_DIR);
  const query = validateQueryOptions();
  const files = FAMILIES.map((family) => ({
    family,
    path: path.join(directory, exportFilename(family, query)),
  }));
  await Promise.all(files.map((file) => assertReadable(file.path)));
  return files;
}

async function makeText(text, width, height, fontSize = 22, color = '#eee7dc') {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="${fontSize}" fill="${color}" font-family="Arial, sans-serif" font-size="${fontSize}" letter-spacing="1.2">${escaped}</text></svg>`);
}

async function makeImageTile(filePath, width, height) {
  await assertReadable(filePath);
  return sharp(filePath)
    .rotate()
    .resize(width, height, { fit: 'contain', background: BACKGROUND })
    .png()
    .toBuffer();
}

async function cropReference(filePath, coordinates) {
  await assertReadable(filePath);
  const metadata = await sharp(filePath).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (!sourceWidth || !sourceHeight) throw new Error(`Reference image has no dimensions: ${filePath}`);

  const [baseLeft, baseTop, baseWidth, baseHeight] = coordinates.split(',').map(Number);
  if ([baseLeft, baseTop, baseWidth, baseHeight].some((value) => !Number.isFinite(value)) || baseWidth <= 0 || baseHeight <= 0) {
    throw new Error('Crop must be four positive-or-zero pixel values: x,y,width,height.');
  }

  const scaleX = sourceWidth / 1536;
  const scaleY = sourceHeight / 1024;
  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(baseLeft * scaleX)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(baseTop * scaleY)));
  const width = Math.max(1, Math.min(sourceWidth - left, Math.round(baseWidth * scaleX)));
  const height = Math.max(1, Math.min(sourceHeight - top, Math.round(baseHeight * scaleY)));
  return sharp(filePath).rotate().extract({ left, top, width, height }).png().toBuffer();
}

async function addHeading(composite, text, x, y, canvasWidth = 2200) {
  composite.push({ input: await makeText(text, canvasWidth, 36, 22, '#c6a87b'), left: x, top: y });
}

async function composeMasterComparison(exports, out) {
  const width = 1800;
  const height = 790;
  const composite = [];
  composite.push({ input: await makeText('MASTER EXPORTS · 2× · FIXED CARD SAMPLES', width - 80, 42, 26), left: 40, top: 26 });

  const cardWidth = 520;
  const cardHeight = 650;
  const gap = 45;
  for (let index = 0; index < exports.length; index += 1) {
    const { family, path: filePath } = exports[index];
    const x = 40 + index * (cardWidth + gap);
    composite.push({ input: await makeText(family.toUpperCase(), cardWidth, 30, 19), left: x, top: 82 });
    composite.push({ input: await makeImageTile(filePath, cardWidth, cardHeight), left: x, top: 120 });
  }

  await saveCanvas(out, width, height, composite);
}

async function composeBeforeReview() {
  const referencePath = resolve(options.reference ?? REFERENCE_DEFAULT);
  const templatePath = resolve(options.templates ?? TEMPLATE_SCREENSHOT_DEFAULT);
  const crop = await cropReference(referencePath, options.crop ?? '840,50,680,298');
  const templates = await makeImageTile(templatePath, 1120, 770);
  const oldExports = [
    { family: 'Cinematic · KO', path: path.join(ROOT, 'docs/qa/phase261/cinematic-ko-basic-4x5-2x.png') },
    { family: 'Editorial · JA', path: path.join(ROOT, 'docs/qa/phase261/editorial-ja-basic-4x5-2x.webp') },
    { family: 'ID · EN', path: path.join(ROOT, 'docs/qa/phase261/id-card-en-basic-4x5-2x.png') },
  ];
  await Promise.all(oldExports.map((item) => assertReadable(item.path)));

  const width = 2048;
  const height = 1450;
  const composite = [];
  await addHeading(composite, 'BEFORE · RETAINED PHASE 261 EXPORTS vs REFERENCE + TEMPLATES', 32, 28, width);
  await addHeading(composite, 'EXISTING 2× EXPORTS', 32, 84, 820);
  await addHeading(composite, 'REFERENCE CARD REGION · TOP RIGHT CROP', 864, 84, 1120);

  const oldCardWidth = 236;
  const oldCardHeight = 295;
  const oldCardGap = 22;
  for (let index = 0; index < oldExports.length; index += 1) {
    const item = oldExports[index];
    const x = 32 + index * (oldCardWidth + oldCardGap);
    composite.push({ input: await makeText(item.family.toUpperCase(), oldCardWidth, 30, 14, '#b7b0a4'), left: x, top: 130 });
    composite.push({ input: await makeImageTile(item.path, oldCardWidth, oldCardHeight), left: x, top: 168 });
  }

  composite.push({ input: crop, left: 864, top: 130 });
  await addHeading(composite, 'TEMPLATES PAGE · PHASE 261', 864, 620, 1120);
  composite.push({ input: templates, left: 864, top: 664 });

  await saveCanvas(resolve(options.out ?? path.join(OUTPUT_DIR, 'before-reference-review.png')), width, height, composite);
}

async function composeReferenceReview(exports, out) {
  const referencePath = resolve(options.reference ?? REFERENCE_DEFAULT);
  const templatePath = resolve(options.templates ?? TEMPLATE_SCREENSHOT_DEFAULT);
  const crop = await cropReference(referencePath, options.crop ?? '840,50,680,298');
  const templateImage = await makeImageTile(templatePath, 1060, 680);
  const width = 2200;
  const height = 1360;
  const composite = [];
  await addHeading(composite, 'REFERENCE REVIEW · CURRENT MASTER EXPORTS', 32, 26, width);
  await addHeading(composite, 'USER REFERENCE · CARD REGION', 32, 82, 1000);
  await addHeading(composite, 'CURRENT 2× MASTER EXPORTS', 1084, 82, 1080);
  composite.push({ input: await sharp(crop).resize(1000, 438, { fit: 'contain', background: BACKGROUND }).png().toBuffer(), left: 32, top: 126 });

  const cardWidth = 340;
  const cardHeight = 425;
  const gap = 12;
  for (let index = 0; index < exports.length; index += 1) {
    const { family, path: filePath } = exports[index];
    const x = 1084 + index * (cardWidth + gap);
    composite.push({ input: await makeText(family.toUpperCase(), cardWidth, 28, 15, '#b7b0a4'), left: x, top: 128 });
    composite.push({ input: await makeImageTile(filePath, cardWidth, cardHeight), left: x, top: 164 });
  }

  await addHeading(composite, 'TEMPLATES PAGE · PRIOR REVIEW SCREENSHOT', 32, 615, 1060);
  composite.push({ input: templateImage, left: 32, top: 659 });
  await saveCanvas(out, width, height, composite);
}

async function saveCanvas(out, width, height, composite) {
  await mkdir(path.dirname(out), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite(composite)
    .png()
    .toFile(out);
  console.log(`Wrote ${path.relative(ROOT, out)}`);
}

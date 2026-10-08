import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA_DIR = path.join(ROOT, 'docs/qa/real-samples');
const DEFAULT_EXPORT_DIR = path.join(QA_DIR, 'exports');
const BEFORE_EDITOR = path.join(ROOT, 'docs/qa/phase27/editor-before-1440.png');
const DEFAULT_AFTER_EDITOR = path.join(QA_DIR, 'editor-after-1440.png');
const BACKGROUND = '#15191e';
const FOREGROUND = '#f0eee8';
const MUTED = '#b7b2a8';
const GOLD = '#cfad72';
const MAX_DIMENSION = 3000;

const FAMILY_LABELS = {
  cinematic: 'Cinematic',
  editorial: 'Editorial · E2',
  identity: 'Identity · I3',
};
const EXPORT_SLUGS = {
  cinematic: 'cinematic',
  editorial: 'editorial',
  identity: 'id-card',
};
const FAMILIES = ['cinematic', 'editorial', 'identity'];
const RATIOS = ['1:1', '4:5', '3:4', '9:16', '16:9'];
const IMAGE_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg'];

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? path.resolve(process.cwd(), process.argv[index + 1])
    : fallback;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function textLayer(width, height, lines) {
  const content = lines.map((line) => {
    const color = line.color ?? FOREGROUND;
    const weight = line.weight ?? 400;
    return `<text x="${line.x ?? 40}" y="${line.y}" fill="${color}" font-family="Arial, sans-serif" font-size="${line.size ?? 24}" font-weight="${weight}" letter-spacing="${line.spacing ?? 0}">${escapeXml(line.text)}</text>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${BACKGROUND}"/>${content}</svg>`);
}

function publicAssetPath(url) {
  return path.join(ROOT, 'public', url.replace(/^\/+/, ''));
}

async function requireFile(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${label} is missing: ${path.relative(ROOT, filePath)}`);
  }
  return filePath;
}

async function findExport(exportsDir, family, ratio, pngOnly = false) {
  const base = `${EXPORT_SLUGS[family]}-en-${ratio.replace(':', 'x')}-2x`;
  const extensions = pngOnly ? ['.png'] : IMAGE_EXTENSIONS;
  for (const extension of extensions) {
    const candidate = path.join(exportsDir, `${base}${extension}`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next supported actual export extension.
    }
  }
  throw new Error(`Missing actual export ${base}.${pngOnly ? 'png' : 'png|webp|jpg|jpeg'} in ${exportsDir}`);
}

async function actualCardExports(exportsDir) {
  const exports = new Map();
  for (const family of FAMILIES) {
    for (const ratio of RATIOS) {
      exports.set(`${family}:${ratio}`, await findExport(exportsDir, family, ratio));
    }
  }
  for (const family of FAMILIES) {
    exports.set(`${family}:4:5:png`, await findExport(exportsDir, family, '4:5', true));
  }
  return exports;
}

async function fitPanel(filePath, width, height) {
  return sharp(filePath)
    .resize(width, height, { fit: 'contain', background: BACKGROUND, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function writeBoard(filePath, width, height, layers) {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`Board exceeds ${MAX_DIMENSION}px: ${path.basename(filePath)} (${width}×${height})`);
  }
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(filePath);
}

async function writeSourceBoard(outputDir, screenshots) {
  const width = 2440;
  const height = 1320;
  const panelWidth = 1140;
  const panelHeight = 1080;
  const landscape = await fitPanel(screenshots.landscape.originalPath, panelWidth, panelHeight);
  const portrait = await fitPanel(screenshots.portrait.originalPath, panelWidth, panelHeight);
  const heading = textLayer(width, 150, [
    { x: 48, y: 60, text: 'REAL FFXIV SOURCE SCREENSHOTS', size: 32, weight: 700, color: GOLD, spacing: 1 },
    { x: 48, y: 108, text: 'Overview scaled to fit this board · originals remain in the source folder', size: 22, color: MUTED },
  ]);
  const labels = textLayer(width, 70, [
    { x: 48, y: 44, text: 'LANDSCAPE · 3840 × 2160', size: 20, weight: 700 },
    { x: 1252, y: 44, text: 'PORTRAIT · 2160 × 3840', size: 20, weight: 700 },
  ]);
  await writeBoard(path.join(outputDir, '01-source-images.png'), width, height, [
    { input: heading, left: 0, top: 0 },
    { input: labels, left: 0, top: 150 },
    { input: landscape, left: 48, top: 220 },
    { input: portrait, left: 1252, top: 220 },
  ]);
}

async function copyMasterBoards(outputDir, exports) {
  for (const [family, outputName] of [
    ['cinematic', '02-cinematic-coner.png'],
    ['editorial', '03-editorial-coner.png'],
    ['identity', '04-identity-coner.png'],
  ]) {
    const source = exports.get(`${family}:4:5:png`);
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Could not read dimensions for ${source}`);
    const destination = path.join(outputDir, outputName);
    if (Math.max(metadata.width, metadata.height) <= MAX_DIMENSION) {
      await fs.copyFile(source, destination);
    } else {
      await sharp(source)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
        .png({ compressionLevel: 9 })
        .toFile(destination);
    }
  }
}

async function writeRatioBoard(outputDir, exports) {
  const width = 2820;
  const titleHeight = 150;
  const columnHeaderHeight = 70;
  const rowHeight = 500;
  const footerHeight = 50;
  const height = titleHeight + columnHeaderHeight + RATIOS.length * rowHeight + footerHeight;
  const padding = 40;
  const ratioLabelWidth = 145;
  const gap = 16;
  const columnWidth = Math.floor((width - padding * 2 - ratioLabelWidth - gap * 2) / 3);
  const panelWidth = columnWidth - 24;
  const panelHeight = rowHeight - 68;
  const layers = [
    { input: textLayer(width, titleHeight, [
      { x: 42, y: 60, text: 'CONER · RATIO OVERVIEW', size: 32, weight: 700, color: GOLD, spacing: 1 },
      { x: 42, y: 108, text: 'Downscaled overview of actual 2× exports · full exports are preserved separately', size: 21, color: MUTED },
    ]), left: 0, top: 0 },
    { input: textLayer(width, columnHeaderHeight, FAMILIES.map((family, index) => ({
      x: padding + ratioLabelWidth + gap + index * (columnWidth + gap),
      y: 45,
      text: FAMILY_LABELS[family].toUpperCase(),
      size: 20,
      weight: 700,
      color: FOREGROUND,
    }))), left: 0, top: titleHeight },
  ];

  for (let row = 0; row < RATIOS.length; row += 1) {
    const ratio = RATIOS[row];
    const rowTop = titleHeight + columnHeaderHeight + row * rowHeight;
    layers.push({ input: textLayer(ratioLabelWidth, rowHeight, [
      { x: 12, y: 52, text: ratio, size: 25, weight: 700, color: GOLD },
    ]), left: padding, top: rowTop });
    for (let column = 0; column < FAMILIES.length; column += 1) {
      const family = FAMILIES[column];
      const source = exports.get(`${family}:${ratio}`);
      const image = await fitPanel(source, panelWidth, panelHeight);
      layers.push({
        input: image,
        left: padding + ratioLabelWidth + gap + column * (columnWidth + gap) + 12,
        top: rowTop + 12,
      });
    }
  }

  await writeBoard(path.join(outputDir, '05-ratios-coner.png'), width, height, layers);
}

async function writeEditorComparison(outputDir, beforePath, afterPath) {
  const width = 2820;
  const headerHeight = 130;
  const panelWidth = 1360;
  const panelHeight = 900;
  const height = headerHeight + panelHeight + 32;
  const before = await fitPanel(beforePath, panelWidth, panelHeight);
  const after = await fitPanel(afterPath, panelWidth, panelHeight);
  const labels = textLayer(width, headerHeight, [
    { x: 42, y: 55, text: 'EDITOR · BEFORE / REAL SAMPLE', size: 30, weight: 700, color: GOLD },
    { x: 42, y: 104, text: 'Left: archived Phase 2.7 screenshot · Right: current editor capture', size: 21, color: MUTED },
    { x: 48, y: 126, text: 'BEFORE', size: 18, weight: 700 },
    { x: 1460, y: 126, text: 'AFTER', size: 18, weight: 700 },
  ]);
  await writeBoard(path.join(outputDir, '06-editor-before-after.png'), width, height, [
    { input: labels, left: 0, top: 0 },
    { input: before, left: 32, top: headerHeight },
    { input: after, left: 1428, top: headerHeight },
  ]);
}

async function writeReviewBoard(outputDir, screenshots, exports) {
  const width = 2860;
  const titleHeight = 132;
  const sourceHeight = 900;
  const cardHeight = 900;
  const height = titleHeight + sourceHeight + cardHeight + 48;
  const padding = 42;
  const gap = 26;
  const sourcePanelWidth = Math.floor((width - padding * 2 - gap) / 2);
  const sourcePanelHeight = sourceHeight - 76;
  const cardColumnWidth = Math.floor((width - padding * 2 - gap * 2) / 3);
  const cardPanelWidth = cardColumnWidth - 18;
  const cardPanelHeight = cardHeight - 84;
  const landscape = await fitPanel(screenshots.landscape.originalPath, sourcePanelWidth, sourcePanelHeight);
  const portrait = await fitPanel(screenshots.portrait.originalPath, sourcePanelWidth, sourcePanelHeight);
  const layers = [
    { input: textLayer(width, titleHeight, [
      { x: 42, y: 58, text: 'REAL SAMPLE · SOURCE TO MASTER CARDS', size: 32, weight: 700, color: GOLD, spacing: 1 },
      { x: 42, y: 104, text: 'Original screenshots above · actual 2× renderer exports below', size: 21, color: MUTED },
    ]), left: 0, top: 0 },
    { input: textLayer(sourcePanelWidth, 54, [
      { x: 8, y: 38, text: 'LANDSCAPE SOURCE · CINEMATIC', size: 19, weight: 700 },
    ]), left: padding, top: titleHeight },
    { input: textLayer(sourcePanelWidth, 54, [
      { x: 8, y: 38, text: 'PORTRAIT SOURCE · EDITORIAL / IDENTITY', size: 19, weight: 700 },
    ]), left: padding + sourcePanelWidth + gap, top: titleHeight },
    { input: landscape, left: padding, top: titleHeight + 54 },
    { input: portrait, left: padding + sourcePanelWidth + gap, top: titleHeight + 54 },
  ];

  for (let column = 0; column < FAMILIES.length; column += 1) {
    const family = FAMILIES[column];
    const cardPath = exports.get(`${family}:4:5:png`);
    const card = await fitPanel(cardPath, cardPanelWidth, cardPanelHeight);
    const left = padding + column * (cardColumnWidth + gap) + 9;
    const top = titleHeight + sourceHeight + 54;
    layers.push({
      input: textLayer(cardColumnWidth, 54, [
        { x: 8, y: 38, text: FAMILY_LABELS[family].toUpperCase(), size: 19, weight: 700 },
      ]),
      left: padding + column * (cardColumnWidth + gap),
      top: titleHeight + sourceHeight,
    });
    layers.push({ input: card, left, top });
  }

  await writeBoard(path.join(outputDir, '07-real-sample-review.png'), width, height, layers);
}

async function main() {
  const exportsDir = readOption('--exports-dir', DEFAULT_EXPORT_DIR);
  const afterEditor = readOption('--editor-after', DEFAULT_AFTER_EDITOR);
  const { conerSample } = await import('../src/data/samples/coner.ts');
  const screenshots = {
    landscape: {
      originalPath: publicAssetPath(conerSample.screenshots.landscape.original),
      optimizedPath: publicAssetPath(conerSample.screenshots.landscape.optimized),
    },
    portrait: {
      originalPath: publicAssetPath(conerSample.screenshots.portrait.original),
      optimizedPath: publicAssetPath(conerSample.screenshots.portrait.optimized),
    },
  };

  await requireFile(screenshots.landscape.originalPath, 'Landscape source screenshot');
  await requireFile(screenshots.portrait.originalPath, 'Portrait source screenshot');
  await requireFile(screenshots.landscape.optimizedPath, 'Landscape optimized screenshot');
  await requireFile(screenshots.portrait.optimizedPath, 'Portrait optimized screenshot');
  await requireFile(BEFORE_EDITOR, 'Archived before-editor screenshot');
  await requireFile(afterEditor, 'Current after-editor screenshot');
  const exports = await actualCardExports(exportsDir);
  await fs.mkdir(QA_DIR, { recursive: true });

  await writeSourceBoard(QA_DIR, screenshots);
  await copyMasterBoards(QA_DIR, exports);
  await writeRatioBoard(QA_DIR, exports);
  await writeEditorComparison(QA_DIR, BEFORE_EDITOR, afterEditor);
  await writeReviewBoard(QA_DIR, screenshots, exports);

  const outputs = [
    '01-source-images.png',
    '02-cinematic-coner.png',
    '03-editorial-coner.png',
    '04-identity-coner.png',
    '05-ratios-coner.png',
    '06-editor-before-after.png',
    '07-real-sample-review.png',
  ];
  for (const output of outputs) {
    const filePath = path.join(QA_DIR, output);
    const metadata = await sharp(filePath).metadata();
    const stats = await fs.stat(filePath);
    console.log(`${path.relative(ROOT, filePath)}\t${metadata.width}×${metadata.height}\t${stats.size} bytes`);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs', 'qa', 'phase215');
const beforeRoot = path.join(qaRoot, 'before');
const afterRoot = path.join(qaRoot, 'after');
const labels = new Map();
const afterCaptureStates = new Map(JSON.parse(await readFile(path.join(afterRoot, 'capture-states.json'), 'utf8')).map((record) => [record.name, record]));

function assert(condition, message) { if (!condition) throw new Error(message); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function escapeXml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

async function findImage(folder, stem) {
  for (const extension of ['png', 'webp', 'jpg', 'jpeg']) {
    const file = path.join(folder, `${stem}.${extension}`);
    try {
      const bytes = await readFile(file);
      const metadata = await sharp(bytes).metadata();
      const record = { path: path.relative(root, file).replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: sha256(bytes), width: metadata.width, height: metadata.height, sourceFormat: metadata.format };
      if (folder === afterRoot) {
        const native = afterCaptureStates.get(stem);
        assert(native, `Missing raw native capture provenance for ${stem}.`);
        const expectedCropPath = path.posix.join('docs/qa/phase215', native.output.replaceAll('\\', '/'));
        assert(expectedCropPath === record.path, `${stem}: capture manifest points to a different viewport crop.`);
        assert(native.sha256 === record.sha256, `${stem}: saved crop hash differs from capture-state provenance.`);
        assert(native.noResize === true && native.crop.width === metadata.width && native.crop.height === metadata.height, `${stem}: after crop was resized or has inconsistent geometry.`);
        record.nativeScreenshot = {
          method: native.method,
          rawPath: native.rawPath.replaceAll('\\', '/'),
          rawSha256: native.rawSha256,
          rawDimensions: native.rawDimensions,
          rawCaptureFormat: path.extname(native.rawPath).slice(1),
          crop: native.crop,
          noResize: native.noResize,
        };
      }
      labels.set(record.path, record);
      return { bytes, metadata, record };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Missing ${stem} screenshot in ${path.relative(root, folder)}.`);
}

function textSvg(width, height, text, options = {}) {
  const color = options.color ?? '#f4f0e7';
  const background = options.background ?? '#24272a';
  const fontSize = options.fontSize ?? 16;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/><text x="12" y="${Math.round(height * 0.67)}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="600" fill="${color}">${escapeXml(text)}</text></svg>`);
}

async function loadPair(stem) {
  const [before, after] = await Promise.all([findImage(beforeRoot, stem), findImage(afterRoot, stem)]);
  assert(before.metadata.width === after.metadata.width && before.metadata.height === after.metadata.height, `${stem}: before/after viewport mismatch (${before.metadata.width}×${before.metadata.height} vs ${after.metadata.width}×${after.metadata.height}).`);
  return { before, after, width: before.metadata.width, height: before.metadata.height };
}

async function writePairBoard(name, title, stem, crop = null) {
  const pair = await loadPair(stem);
  let beforeBytes = pair.before.bytes;
  let afterBytes = pair.after.bytes;
  let width = pair.width;
  let height = pair.height;
  if (crop) {
    const rectangle = {
      left: Math.max(0, Math.min(crop.left, width - 1)),
      top: Math.max(0, Math.min(crop.top, height - 1)),
      width: Math.min(crop.width, width - crop.left),
      height: Math.min(crop.height, height - crop.top),
    };
    assert(rectangle.width > 0 && rectangle.height > 0, `${name}: crop lies outside ${stem}.`);
    beforeBytes = await sharp(beforeBytes).extract(rectangle).png().toBuffer();
    afterBytes = await sharp(afterBytes).extract(rectangle).png().toBuffer();
    width = rectangle.width;
    height = rectangle.height;
  }
  const margin = 24;
  const labelHeight = 36;
  const gap = 16;
  const boardWidth = margin * 2 + width * 2 + gap;
  const boardHeight = margin * 2 + labelHeight + height;
  const result = await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: '#e5e1d9' } })
    .composite([
      { input: textSvg(width, labelHeight, `${title} · Before (${pair.width}×${pair.height} source)`), left: margin, top: margin },
      { input: textSvg(width, labelHeight, `${title} · After (${pair.width}×${pair.height} source)`), left: margin + width + gap, top: margin },
      { input: beforeBytes, left: margin, top: margin + labelHeight },
      { input: afterBytes, left: margin + width + gap, top: margin + labelHeight },
    ]).png().toBuffer();
  const destination = path.join(qaRoot, name);
  await writeFile(destination, result);
  return { file: name, bytes: result.byteLength, sha256: sha256(result), dimensions: { width: boardWidth, height: boardHeight }, sources: [pair.before.record, pair.after.record], crop: crop ? { requested: crop, actualWidth: width, actualHeight: height, resized: false } : null };
}

async function writeMobileBoard() {
  const margin = 24;
  const labelHeight = 34;
  const gap = 16;
  const rowGap = 18;
  const dark = await loadPair('mobile390-dark');
  const light = await loadPair('mobile390-light');
  assert(dark.width === 390 && light.width === 390, 'Mobile comparison source must be 390 CSS px wide.');
  assert(dark.width === light.width && dark.height === light.height, 'Mobile Dark/Light capture sizes differ.');
  const boardWidth = margin * 2 + dark.width * 2 + gap;
  const rowHeight = labelHeight * 2 + dark.height;
  const boardHeight = margin * 2 + rowHeight * 2 + rowGap;
  const composites = [];
  const sources = [];
  let y = margin;
  for (const [theme, pair] of [['Dark', dark], ['Light', light]]) {
    composites.push({ input: textSvg(dark.width * 2 + gap, labelHeight, `${theme} mobile · before and after · source viewport 390×${dark.height}`), left: margin, top: y });
    composites.push({ input: textSvg(dark.width, labelHeight, 'Before'), left: margin, top: y + labelHeight });
    // Place each label inside a separate 390px column header strip to keep source pixels untouched.
    composites.push({ input: textSvg(dark.width, labelHeight, 'After'), left: margin + dark.width + gap, top: y + labelHeight });
    composites.push({ input: pair.before.bytes, left: margin, top: y + labelHeight * 2 });
    composites.push({ input: pair.after.bytes, left: margin + dark.width + gap, top: y + labelHeight * 2 });
    sources.push(pair.before.record, pair.after.record);
    y += rowHeight + rowGap;
  }
  const width = boardWidth;
  const height = boardHeight;
  const board = await sharp({ create: { width, height, channels: 4, background: '#e5e1d9' } }).composite(composites).png().toBuffer();
  const name = '08-mobile-before-after.png';
  await writeFile(path.join(qaRoot, name), board);
  return { file: name, bytes: board.length, sha256: sha256(board), dimensions: { width, height }, sources, crop: null, note: 'Full native 390px captures; separate captions and no source resizing.' };
}

async function writeFourPageBoard() {
  const stems = ['templates-dark', 'export-dark', 'templates-light', 'export-light'];
  const margin = 24;
  const labelHeight = 34;
  const gap = 16;
  const rowGap = 18;
  const records = await Promise.all(stems.map(loadPair));
  const width = records[0].width;
  const height = records[0].height;
  assert(records.every((row) => row.width === width && row.height === height), 'Templates/Export screenshots must share one viewport size.');
  const boardWidth = margin * 2 + width * 2 + gap;
  const rowHeight = labelHeight * 2 + height;
  const boardHeight = margin * 2 + rowHeight * stems.length + rowGap * (stems.length - 1);
  const composites = [];
  const sources = [];
  records.forEach((row, index) => {
    const y = margin + index * (rowHeight + rowGap);
    const stem = stems[index];
    const page = stem.startsWith('templates') ? 'Templates' : 'Export';
    const theme = stem.endsWith('dark') ? 'Dark' : 'Light';
    composites.push({ input: textSvg(width, labelHeight, `${page} · ${theme} · before / after`), left: margin, top: y });
    composites.push({ input: textSvg(width, labelHeight, 'Before'), left: margin, top: y + labelHeight });
    composites.push({ input: textSvg(width, labelHeight, 'After'), left: margin + width + gap, top: y + labelHeight });
    composites.push({ input: row.before.bytes, left: margin, top: y + labelHeight * 2 });
    composites.push({ input: row.after.bytes, left: margin + width + gap, top: y + labelHeight * 2 });
    sources.push(row.before.record, row.after.record);
  });
  const board = await sharp({ create: { width: boardWidth, height: boardHeight + labelHeight, channels: 4, background: '#e5e1d9' } }).composite(composites).png().toBuffer();
  const name = '09-templates-export.png';
  await writeFile(path.join(qaRoot, name), board);
  return { file: name, bytes: board.length, sha256: sha256(board), dimensions: { width: boardWidth, height: boardHeight + labelHeight }, sources, crop: null, note: 'Four native screenshot pairs: Templates and Export in both themes.' };
}

async function writeLightDarkBoard() {
  const pairs = await Promise.all(['desktop1440-dark', 'desktop1440-light'].map(loadPair));
  const [dark, light] = pairs;
  assert(dark.width === 1440 && light.width === 1440 && dark.height === light.height, 'Light/Dark board requires matched 1440px Editor captures.');
  const margin = 24;
  const labelHeight = 34;
  const gap = 16;
  const rowGap = 18;
  const boardWidth = margin * 2 + dark.width * 2 + gap;
  const rowHeight = labelHeight * 2 + dark.height;
  const boardHeight = margin * 2 + rowHeight * 2 + rowGap;
  const composites = [];
  const sources = [];
  for (const [index, stage] of ['before', 'after'].entries()) {
    const folder = stage === 'before' ? beforeRoot : afterRoot;
    const y = margin + index * (rowHeight + rowGap);
    const darkImage = await findImage(folder, 'desktop1440-dark');
    const lightImage = await findImage(folder, 'desktop1440-light');
    composites.push({ input: textSvg(boardWidth - margin * 2, labelHeight, `${stage === 'before' ? 'Before' : 'After'} · Dark / Light parity comparison`), left: margin, top: y });
    composites.push({ input: textSvg(dark.width, labelHeight, 'Dark · Editor 1440×1000'), left: margin, top: y + labelHeight });
    composites.push({ input: textSvg(light.width, labelHeight, 'Light · Editor 1440×1000'), left: margin + dark.width + gap, top: y + labelHeight });
    composites.push({ input: darkImage.bytes, left: margin, top: y + labelHeight * 2 });
    composites.push({ input: lightImage.bytes, left: margin + dark.width + gap, top: y + labelHeight * 2 });
    sources.push(darkImage.record, lightImage.record);
  }
  const board = await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: '#e5e1d9' } }).composite(composites).png().toBuffer();
  const name = '10-light-dark-comparison.png';
  await writeFile(path.join(qaRoot, name), board);
  return { file: name, bytes: board.length, sha256: sha256(board), dimensions: { width: boardWidth, height: boardHeight + labelHeight }, sources, crop: null, note: 'Before and after rows; native 1440×1000 Dark and Light screenshots; no source resizing.' };
}

async function writeOverviewBoard() {
  const margin = 24;
  const gap = 14;
  const header = 32;
  const editorW = 720;
  const editorH = 500;
  const mobileW = 231;
  const mobileH = 500;
  const smallW = 520;
  const smallH = 361;
  const topY = margin + header * 2;
  const rowGap = 18;
  const middleY = topY + editorH + rowGap;
  const boardWidth = Math.max(margin * 2 + editorW * 2 + gap, margin * 2 + mobileW * 2 + gap * 2 + smallW * 2 + gap);
  const boardHeight = margin + header * 2 + editorH + rowGap + header + mobileH + margin;
  const items = [
    { stem: 'desktop1440-dark', label: 'Editor · Dark', width: editorW, height: editorH, x: Math.round((boardWidth - (editorW * 2 + gap)) / 2), y: topY },
    { stem: 'desktop1440-light', label: 'Editor · Light', width: editorW, height: editorH, x: Math.round((boardWidth - (editorW * 2 + gap)) / 2) + editorW + gap, y: topY },
    { stem: 'mobile390-dark', label: 'Mobile · Dark', width: mobileW, height: mobileH, x: margin, y: middleY + header },
    { stem: 'mobile390-light', label: 'Mobile · Light', width: mobileW, height: mobileH, x: margin + mobileW + gap, y: middleY + header },
    { stem: 'templates-dark', label: 'Templates · Dark', width: smallW, height: smallH, x: margin + mobileW * 2 + gap * 2, y: middleY + header },
    { stem: 'export-dark', label: 'Export · Dark', width: smallW, height: smallH, x: margin + mobileW * 2 + gap * 2 + smallW + gap, y: middleY + header },
  ];
  const sources = [];
  const composites = [{ input: textSvg(boardWidth - margin * 2, header, 'Phase 2.15 · App UI review · scaled overview (sources remain native in boards 01–10)'), left: margin, top: margin }];
  for (const item of items) {
    const source = await findImage(afterRoot, item.stem);
    const scaled = await sharp(source.bytes).resize(item.width, item.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    const label = item.stem.startsWith('mobile')
      ? `${item.label} · ${source.metadata.width}×${source.metadata.height}`
      : `${item.label} · source ${source.metadata.width}×${source.metadata.height}`;
    composites.push({ input: textSvg(item.width, header, label), left: item.x, top: item.y - header });
    composites.push({ input: scaled, left: item.x, top: item.y });
    sources.push(source.record);
  }
  const board = await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: '#e5e1d9' } }).composite(composites).png().toBuffer();
  const name = '11-app-ui-review.png';
  await writeFile(path.join(qaRoot, name), board);
  return { file: name, bytes: board.length, sha256: sha256(board), dimensions: { width: boardWidth, height: boardHeight }, sources, crop: null, note: 'At-a-glance overview only; each full screenshot is scaled to fit. Use 01–10 for native-size review.' };
}

const boards = [];
boards.push(await writePairBoard('01-dark-before-after.png', 'Editor Dark', 'desktop1440-dark'));
boards.push(await writePairBoard('02-light-before-after.png', 'Editor Light', 'desktop1440-light'));
boards.push(await writePairBoard('03-header-detail.png', 'Header / canvas context', 'desktop1440-dark', { left: 0, top: 0, width: 1440, height: 96 }));
boards.push(await writePairBoard('04-tool-rail-detail.png', 'Tool rail', 'desktop1440-dark', { left: 0, top: 48, width: 80, height: 952 }));
boards.push(await writePairBoard('05-canvas-toolbar-detail.png', 'Canvas toolbar', 'desktop1440-dark', { left: 80, top: 930, width: 1044, height: 70 }));
boards.push(await writePairBoard('06-inspector-detail.png', 'Right inspector', 'desktop1440-dark', { left: 1124, top: 48, width: 316, height: 952 }));
boards.push(await writePairBoard('07-controls-detail.png', 'Inspector controls', 'desktop1440-dark', { left: 1124, top: 300, width: 316, height: 390 }));
boards.push(await writeMobileBoard());
boards.push(await writeFourPageBoard());
boards.push(await writeLightDarkBoard());
boards.push(await writeOverviewBoard());

const report = {
  schema: 'phase215-review-boards-v1',
  generatedAt: new Date().toISOString(),
  sourceFormat: 'Before screenshots retain their original browser format. After screenshots are PNG viewport crops derived from fullPage native JPEGs retained under docs/qa/phase215/native-after; capture-states.json verifies raw SHA-256, crop SHA-256, exact crop bounds, and no resizing. PNG storage is lossless, but values include the original JPEG capture encoding. Detail boards use native, unresized crops with captions outside source crops. Board 11 resizes full-frame screenshots for an at-a-glance overview only.',
  count: boards.length,
  sources: [...labels.values()].sort((a, b) => a.path.localeCompare(b.path)),
  boards,
};
await writeFile(path.join(qaRoot, 'review-boards.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ count: boards.length, boards: boards.map((board) => ({ file: board.file, dimensions: board.dimensions })), manifest: 'docs/qa/phase215/review-boards.json' }, null, 2));

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Run with --preflight to report required screenshots without decoding or writing images.
// The normal run requires the complete before/after set and writes the 12 boards plus metadata.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phaseRoot = path.join(root, 'docs', 'qa', 'phase217');
const beforeRoot = path.join(phaseRoot, 'before');
const afterRoot = path.join(phaseRoot, 'after');
const outputRoot = phaseRoot;
const metadataPath = path.join(phaseRoot, 'boards-metadata.json');
const margin = 24;
const panelGap = 16;
const sectionGap = 20;
const titleHeight = 48;
const sectionHeadingHeight = 32;
const captionHeight = 42;
const maxBoardWidth = 2400;
const overviewWidth = 720;
const detailScale = 2;
const background = '#e8ebea';
const titleColor = '#1c282e';
const captureCache = new Map();
const captureStateCache = new Map();
const sourceRegistry = new Map();
const pairDimensionChanges = new Map();

const requiredStems = [
  'editor-1440-dark',
  'editor-1440-light',
  'editor-1920-dark',
  'editor-1920-light',
  'editor-390-dark',
  'editor-390-light',
  'templates-dark',
  'templates-light',
  'export-dark',
  'export-light',
  'job-picker-dark',
  'world-picker-dark',
];
const requiredAfterOnlyStems = ['job-picker-light', 'world-picker-light'];

const boardNames = [
  '01-dark-before-after.png',
  '02-light-before-after.png',
  '03-header.png',
  '04-tool-rail.png',
  '05-canvas-toolbar.png',
  '06-inspector.png',
  '07-form-controls.png',
  '08-job-world-picker.png',
  '09-mobile.png',
  '10-templates-export.png',
  '11-light-dark.png',
  '12-app-review-board.png',
];

const roleAliases = {
  header: ['header', 'appHeader', 'app-header'],
  headerBrand: ['headerBrand', 'headerLeft', 'brandGroup', 'header-brand', 'header-left'],
  headerActions: ['headerActions', 'headerRight', 'header-actions', 'header-right'],
  toolRail: ['rail', 'toolRail', 'leftToolRail', 'leftSidebar', 'tool-rail', 'left-sidebar'],
  canvasToolbar: ['toolbar', 'canvasToolbar', 'bottomToolbar', 'bottomTools', 'canvas-toolbar', 'bottom-toolbar'],
  inspector: ['inspector', 'rightInspector', 'rightSidebar', 'right-inspector', 'right-sidebar'],
  formControls: ['attributes', 'formControls', 'inspectorControls', 'form-controls', 'inspector-controls'],
  jobPicker: ['jobPicker', 'jobPickerMenu', 'jobPopover', 'job-picker', 'job-picker-menu'],
  worldPicker: ['worldPicker', 'worldPickerMenu', 'worldPopover', 'world-picker', 'world-picker-menu'],
  mobileSheet: ['mobileSheet', 'pickerSheet', 'mobile-sheet', 'picker-sheet'],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textSvg(width, height, lines, options = {}) {
  const fill = options.fill ?? '#dce2e1';
  const color = options.color ?? titleColor;
  const primarySize = options.primarySize ?? 14;
  const secondarySize = options.secondarySize ?? 11;
  const text = lines.map((line, index) => {
    const y = index === 0 ? 17 : 34;
    const size = index === 0 ? primarySize : secondarySize;
    const weight = index === 0 ? 700 : 500;
    return `<text x="12" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/>${text}</svg>`);
}

function normalizeViewport(value, imageWidth, imageHeight) {
  if (Array.isArray(value)) {
    return { width: value[0] ?? imageWidth, height: value[1] ?? imageHeight, dpr: value[2] ?? 1 };
  }
  if (value && typeof value === 'object') {
    return {
      width: value.width ?? value.innerWidth ?? imageWidth,
      height: value.height ?? value.innerHeight ?? imageHeight,
      dpr: value.dpr ?? value.deviceScaleFactor ?? value.scale ?? 1,
    };
  }
  return { width: imageWidth, height: imageHeight, dpr: 1 };
}

function modeFor(stem, captureState) {
  const stateTheme = String(captureState?.theme ?? captureState?.mode ?? '').toLowerCase();
  if (stateTheme === 'dark' || stateTheme === 'light') return stateTheme;
  if (/(?:^|-)dark(?:-|$)/u.test(stem)) return 'dark';
  if (/(?:^|-)light(?:-|$)/u.test(stem)) return 'light';
  return 'unspecified';
}

function relativePath(filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

async function readCaptureStates(stage) {
  if (captureStateCache.has(stage)) return captureStateCache.get(stage);
  const folder = stage === 'before' ? beforeRoot : afterRoot;
  const file = path.join(folder, 'capture-states.json');
  let states = [];
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (Array.isArray(parsed)) states = parsed;
    else if (Array.isArray(parsed.states)) states = parsed.states;
    else if (Array.isArray(parsed.captures)) states = parsed.captures;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`Could not read ${relativePath(file)}: ${error.message}`);
  }
  const byName = new Map(states.filter((state) => state?.name).map((state) => [state.name, state]));
  captureStateCache.set(stage, byName);
  return byName;
}

async function capturePathExists(stage, stem) {
  const folder = stage === 'before' ? beforeRoot : afterRoot;
  try {
    await access(path.join(folder, `${stem}.jpg`));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function missingRequiredInputs() {
  const missing = [];
  for (const stage of ['before', 'after']) {
    for (const stem of requiredStems) {
      if (!(await capturePathExists(stage, stem))) missing.push(`${stage}/${stem}.jpg`);
    }
  }
  for (const stem of requiredAfterOnlyStems) {
    if (!(await capturePathExists('after', stem))) missing.push(`after/${stem}.jpg`);
  }
  return missing;
}

async function optionalCaptureNames(stage) {
  const folder = stage === 'before' ? beforeRoot : afterRoot;
  let entries = [];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jpg'))
    .map((entry) => path.basename(entry.name, '.jpg'))
    .filter((stem) => /^(?:mobile-sheet-|editor-(?:ko|en|ja)-|(?:job|world)-picker-light$)/iu.test(stem))
    .sort((left, right) => left.localeCompare(right));
}

async function reportPreflight() {
  const missing = await missingRequiredInputs();
  const optional = {
    before: await optionalCaptureNames('before'),
    after: (await optionalCaptureNames('after')).filter((stem) => !requiredAfterOnlyStems.includes(stem)),
  };
  const report = {
    status: missing.length === 0 ? 'ready' : 'waiting-for-required-captures',
    requiredCaptureCount: requiredStems.length * 2 + requiredAfterOnlyStems.length,
    requiredStems,
    requiredAfterOnlyStems,
    missing,
    optionalCaptures: optional,
    expectedBoards: boardNames.map((file) => `docs/qa/phase217/${file}`),
    metadataOutput: 'docs/qa/phase217/boards-metadata.json',
    writesFiles: false,
    decodesImages: false,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return missing.length === 0;
}

async function loadCapture(stage, stem, optional = false) {
  const key = `${stage}/${stem}`;
  if (captureCache.has(key)) return captureCache.get(key);
  const folder = stage === 'before' ? beforeRoot : afterRoot;
  const file = path.join(folder, `${stem}.jpg`);
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    throw new Error(`Missing required JPEG capture: ${relativePath(file)}`);
  }
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
  assert(metadata.format === 'jpeg', `${relativePath(file)} must be a JPEG source, found ${metadata.format ?? 'unknown'}.`);
  assert(Number.isInteger(metadata.width) && Number.isInteger(metadata.height), `Could not read dimensions for ${relativePath(file)}.`);
  const captureStates = await readCaptureStates(stage);
  const captureState = captureStates.get(stem) ?? null;
  const viewport = normalizeViewport(captureState?.viewport, metadata.width, metadata.height);
  const record = {
    stage,
    stem,
    mode: modeFor(stem, captureState),
    path: relativePath(file),
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    format: metadata.format,
    dimensions: { width: metadata.width, height: metadata.height },
    viewport,
    captureState: captureState ? {
      overflow: captureState.overflow,
      coarse: captureState.coarse,
      headerHeight: captureState.headerHeight,
    } : null,
  };
  const capture = { bytes, metadata, record, captureState };
  captureCache.set(key, capture);
  sourceRegistry.set(record.path, record);
  return capture;
}

function pairFor(stem) {
  return Promise.all([loadCapture('before', stem), loadCapture('after', stem)]).then(([before, after]) => {
    assert(before.metadata.width === after.metadata.width, `${stem}: before/after screenshot widths differ (${before.metadata.width}px vs ${after.metadata.width}px).`);
    if (before.metadata.height !== after.metadata.height) {
      pairDimensionChanges.set(stem, {
        stem,
        beforeImage: { width: before.metadata.width, height: before.metadata.height },
        afterImage: { width: after.metadata.width, height: after.metadata.height },
        widthMatched: true,
        heightDelta: after.metadata.height - before.metadata.height,
        reason: 'Full-page screenshot height changed with the outer page layout; both images keep their natural aspect ratio and are top-aligned.',
      });
    }
    return { before, after };
  });
}

function normalizeRect(value) {
  if (!value || typeof value !== 'object') return null;
  const left = Number(value.left ?? value.x);
  const top = Number(value.top ?? value.y);
  const right = Number(value.right ?? (Number.isFinite(left) && Number.isFinite(Number(value.width)) ? left + Number(value.width) : NaN));
  const bottom = Number(value.bottom ?? (Number.isFinite(top) && Number.isFinite(Number(value.height)) ? top + Number(value.height) : NaN));
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function rectFromContainer(container, aliases) {
  if (Array.isArray(container)) {
    const entry = container.find((item) => aliases.includes(item?.role) || aliases.includes(item?.name) || aliases.includes(item?.key));
    if (entry) return normalizeRect(entry.rect ?? entry.bounds ?? entry);
    return null;
  }
  if (!container || typeof container !== 'object') return null;
  for (const alias of aliases) {
    const rect = normalizeRect(container[alias]?.rect ?? container[alias]?.bounds ?? container[alias]);
    if (rect) return rect;
  }
  return null;
}

function roleRectFor(capture, role) {
  const state = capture.captureState;
  if (!state) return null;
  const aliases = roleAliases[role] ?? [role];
  for (const container of [state.roleRects, state.roleRect, state.rects, state.roles, state.dom?.roleRects, state.dom?.roleRect]) {
    const rect = rectFromContainer(container, aliases);
    if (rect) {
      const viewport = capture.record.viewport;
      const scaleX = capture.metadata.width / viewport.width;
      const scaleY = capture.metadata.height / viewport.height;
      return {
        left: rect.left * scaleX,
        top: rect.top * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY,
        method: 'DOM roleRect from capture-states.json',
      };
    }
  }
  const directRoleName = state.role ?? state.roleRect?.role ?? state.roleRect?.name;
  if (aliases.includes(directRoleName)) {
    const rect = normalizeRect(state.roleRect);
    if (rect) {
      const viewport = capture.record.viewport;
      return {
        left: rect.left * (capture.metadata.width / viewport.width),
        top: rect.top * (capture.metadata.height / viewport.height),
        width: rect.width * (capture.metadata.width / viewport.width),
        height: rect.height * (capture.metadata.height / viewport.height),
        method: 'DOM roleRect from capture-states.json',
      };
    }
  }
  for (const alias of aliases) {
    const rect = normalizeRect(state[`${alias}Rect`]);
    if (rect) {
      const viewport = capture.record.viewport;
      return {
        left: rect.left * (capture.metadata.width / viewport.width),
        top: rect.top * (capture.metadata.height / viewport.height),
        width: rect.width * (capture.metadata.width / viewport.width),
        height: rect.height * (capture.metadata.height / viewport.height),
        method: 'DOM roleRect from capture-states.json',
      };
    }
  }
  return null;
}

function fallbackRect(role, width, height) {
  const headerHeight = Math.min(48, height);
  const railWidth = Math.min(80, width);
  const inspectorWidth = Math.min(316, width);
  const contentRight = Math.max(railWidth, width - inspectorWidth);
  const safeRect = (left, top, rectWidth, rectHeight) => ({ left, top, width: rectWidth, height: rectHeight });
  switch (role) {
    case 'header':
      return safeRect(0, 0, width, headerHeight);
    case 'headerBrand':
      return safeRect(0, 0, Math.min(320, width), headerHeight);
    case 'headerActions':
      return safeRect(Math.max(0, width - inspectorWidth), 0, inspectorWidth, headerHeight);
    case 'toolRail':
      return safeRect(0, headerHeight, railWidth, Math.max(1, height - headerHeight));
    case 'canvasToolbar':
      return safeRect(railWidth, Math.max(headerHeight, height - 50), Math.max(1, contentRight - railWidth), Math.min(50, Math.max(1, height - headerHeight)));
    case 'inspector':
      return safeRect(Math.max(0, width - inspectorWidth), headerHeight, inspectorWidth, Math.max(1, height - headerHeight));
    case 'formControls':
      return safeRect(Math.max(0, width - inspectorWidth), Math.min(300, height - 1), inspectorWidth, Math.min(390, height - Math.min(300, height - 1)));
    case 'jobPicker':
      return safeRect(Math.max(0, width - Math.min(170, width)), Math.min(150, height - 1), Math.min(170, width), Math.min(410, height - Math.min(150, height - 1)));
    case 'worldPicker':
      return safeRect(Math.max(0, width - inspectorWidth), Math.min(230, height - 1), inspectorWidth, Math.min(360, height - Math.min(230, height - 1)));
    case 'mobileSheet':
      return safeRect(0, 0, width, height);
    default:
      return safeRect(0, 0, width, height);
  }
}

function clampRect(rect, width, height) {
  const left = Math.max(0, Math.min(Math.floor(rect.left), width - 1));
  const top = Math.max(0, Math.min(Math.floor(rect.top), height - 1));
  const right = Math.max(left + 1, Math.min(Math.ceil(rect.left + rect.width), width));
  const bottom = Math.max(top + 1, Math.min(Math.ceil(rect.top + rect.height), height));
  return { left, top, width: right - left, height: bottom - top };
}

function selectCrop(capture, role, fixedRect = null) {
  const candidate = fixedRect ?? roleRectFor(capture, role);
  const fallback = candidate ? null : fallbackRect(role, capture.metadata.width, capture.metadata.height);
  const rect = clampRect(candidate ?? fallback, capture.metadata.width, capture.metadata.height);
  return {
    rect,
    method: fixedRect ? 'explicit viewport crop' : candidate?.method ?? 'documented viewport-size fallback',
  };
}

function captureCaption(capture, cropInfo = null, note = '') {
  const { stage, mode, path: sourcePath, dimensions, viewport } = capture.record;
  const stageLabel = stage[0].toUpperCase() + stage.slice(1);
  const modeLabel = mode[0].toUpperCase() + mode.slice(1);
  const firstLine = `Stage: ${stageLabel} · Mode: ${modeLabel} · Viewport: ${viewport.width}×${viewport.height} @ ${viewport.dpr}×`;
  const cropLabel = cropInfo
    ? ` · crop ${cropInfo.rect.left},${cropInfo.rect.top} ${cropInfo.rect.width}×${cropInfo.rect.height} · ${cropInfo.scale}×`
    : '';
  const shortPath = path.relative(phaseRoot, path.resolve(root, sourcePath)).replaceAll('\\', '/');
  const secondLine = `Source: ${shortPath}${cropLabel}${note ? ` · ${note}` : ''}`;
  return { lines: [firstLine, secondLine], sourceDimensions: dimensions };
}

async function makePanel(capture, options = {}) {
  const { role = null, fixedRect = null, scale = 1, targetWidth = null, note = '' } = options;
  const cropInfo = role || fixedRect
    ? { ...selectCrop(capture, role ?? 'custom', fixedRect), scale }
    : null;
  let pipeline = sharp(capture.bytes, { failOn: 'error' });
  if (cropInfo) pipeline = pipeline.extract(cropInfo.rect);
  if (targetWidth) {
    pipeline = pipeline.resize({ width: targetWidth, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' });
  } else if (scale !== 1) {
    const width = cropInfo?.rect.width ?? capture.metadata.width;
    const height = cropInfo?.rect.height ?? capture.metadata.height;
    pipeline = pipeline.resize({ width: width * scale, height: height * scale, fit: 'fill', kernel: 'lanczos3' });
  }
  const bytes = await pipeline.png().toBuffer();
  const output = await sharp(bytes).metadata();
  const caption = captureCaption(capture, cropInfo, note);
  return {
    bytes,
    width: output.width,
    height: output.height,
    caption: caption.lines,
    metadata: {
      source: capture.record.path,
      sourceSha256: capture.record.sha256,
      sourceDimensions: capture.record.dimensions,
      stage: capture.record.stage,
      mode: capture.record.mode,
      viewport: capture.record.viewport,
      crop: cropInfo ? { ...cropInfo.rect, method: cropInfo.method, scale } : null,
      outputDimensions: { width: output.width, height: output.height },
      resized: Boolean(targetWidth || scale !== 1),
      note: note || undefined,
    },
  };
}

function prepareRows(sections, maxContentWidth) {
  const prepared = [];
  for (const section of sections) {
    const rows = [];
    for (const row of section.rows) {
      let current = [row];
      const rowWidth = (panels) => panels.reduce((sum, panel) => sum + panel.width, 0) + panelGap * Math.max(0, panels.length - 1);
      if (rowWidth(row) > maxContentWidth && row.length > 1) current = row.map((panel) => [panel]);
      for (const panelRow of current) {
        assert(rowWidth(panelRow) <= maxContentWidth, `A review-board row exceeds the ${maxContentWidth}px content-width limit.`);
        rows.push(panelRow);
      }
    }
    prepared.push({ ...section, rows });
  }
  return prepared;
}

async function composeBoard(file, title, sections, options = {}) {
  const limit = options.maxWidth ?? maxBoardWidth;
  const contentLimit = limit - margin * 2;
  const preparedSections = prepareRows(sections, contentLimit);
  const widestRow = Math.max(1, ...preparedSections.flatMap((section) => section.rows.map((row) => row.reduce((sum, panel) => sum + panel.width, 0) + panelGap * Math.max(0, row.length - 1))));
  const contentWidth = Math.min(contentLimit, widestRow);
  const boardWidth = contentWidth + margin * 2;
  const composites = [];
  const titleLines = [title, 'Original JPEGs · labeled source stage, mode, viewport, and crop scale · natural aspect ratio'];
  composites.push({ input: textSvg(contentWidth, titleHeight, titleLines, { fill: '#d6dddc', primarySize: 17, secondarySize: 11 }), left: margin, top: margin });
  let y = margin + titleHeight + sectionGap;
  const boardSections = [];
  for (const section of preparedSections) {
    composites.push({ input: textSvg(contentWidth, sectionHeadingHeight, [section.heading], { fill: '#e1e5e4', primarySize: 13, secondarySize: 10 }), left: margin, top: y });
    y += sectionHeadingHeight;
    const rowMeta = [];
    for (const row of section.rows) {
      const rowWidth = row.reduce((sum, panel) => sum + panel.width, 0) + panelGap * Math.max(0, row.length - 1);
      const rowHeight = captionHeight + Math.max(...row.map((panel) => panel.height));
      let x = margin + Math.round((contentWidth - rowWidth) / 2);
      const panelRecords = [];
      for (const panel of row) {
        const imageTop = y + captionHeight;
        composites.push({ input: textSvg(panel.width, captionHeight, panel.caption, { fill: '#f3f5f4', primarySize: 12, secondarySize: 10 }), left: x, top: y });
        composites.push({ input: panel.bytes, left: x, top: imageTop });
        panelRecords.push(panel.metadata);
        x += panel.width + panelGap;
      }
      rowMeta.push(panelRecords);
      y += rowHeight + panelGap;
    }
    boardSections.push({ heading: section.heading, panels: rowMeta });
    y += sectionGap;
  }
  const boardHeight = Math.max(titleHeight + margin * 2, y - sectionGap + margin);
  const bytes = await sharp({
    create: { width: boardWidth, height: boardHeight, channels: 4, background },
  }).composite(composites).png({ compressionLevel: 9 }).toBuffer();
  const record = {
    file,
    path: `docs/qa/phase217/${file}`,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    dimensions: { width: boardWidth, height: boardHeight },
    sections: boardSections,
  };
  return { bytes, record };
}

async function fullPairSections(mode) {
  const sections = [];
  for (const size of ['1440', '1920']) {
    const stem = `editor-${size}-${mode}`;
    const pair = await pairFor(stem);
    sections.push({
      heading: `Editor · ${size}px viewport · native-size captures`,
      rows: [
        [await makePanel(pair.before)],
        [await makePanel(pair.after)],
      ],
    });
  }
  return sections;
}

async function buildHeaderBoard() {
  const pair = await pairFor('editor-1440-dark');
  const sections = [
    {
      heading: 'Full 48px header · native source pixels',
      rows: [
        [await makePanel(pair.before, { role: 'header' })],
        [await makePanel(pair.after, { role: 'header' })],
      ],
    },
    {
      heading: 'Brand and route section · 2× detail crops',
      rows: [[
        await makePanel(pair.before, { role: 'headerBrand', scale: detailScale }),
        await makePanel(pair.after, { role: 'headerBrand', scale: detailScale }),
      ]],
    },
    {
      heading: 'Save status, appearance, and locale · 2× detail crops',
      rows: [[
        await makePanel(pair.before, { role: 'headerActions', scale: detailScale }),
        await makePanel(pair.after, { role: 'headerActions', scale: detailScale }),
      ]],
    },
  ];
  const localeStems = new Set([
    ...(await optionalCaptureNames('before')).filter((stem) => /^editor-(?:ko|en|ja)-/iu.test(stem)),
    ...(await optionalCaptureNames('after')).filter((stem) => /^editor-(?:ko|en|ja)-/iu.test(stem)),
  ]);
  if (localeStems.size) {
    const rows = [];
    for (const stem of [...localeStems].sort()) {
      const before = await loadCapture('before', stem, true);
      const after = await loadCapture('after', stem, true);
      if (before && after) rows.push([
        await makePanel(before, { role: 'headerActions', scale: detailScale }),
        await makePanel(after, { role: 'headerActions', scale: detailScale }),
      ]);
      else if (after) rows.push([await makePanel(after, { role: 'headerActions', scale: detailScale })]);
      else if (before) rows.push([await makePanel(before, { role: 'headerActions', scale: detailScale })]);
    }
    if (rows.length) sections.push({ heading: 'Optional locale-specific header captures · source locale is in the filename', rows });
  }
  return composeBoard('03-header.png', '03 · Header details', sections);
}

async function buildToolRailBoard() {
  const pair = await pairFor('editor-1440-dark');
  return composeBoard('04-tool-rail.png', '04 · Editor tool rail', [{
    heading: 'Left tool rail · 2× detail crops',
    rows: [[
      await makePanel(pair.before, { role: 'toolRail', scale: detailScale }),
      await makePanel(pair.after, { role: 'toolRail', scale: detailScale }),
    ]],
  }]);
}

async function buildCanvasToolbarBoard() {
  const pair = await pairFor('editor-1440-dark');
  return composeBoard('05-canvas-toolbar.png', '05 · Canvas toolbar', [{
    heading: 'Bottom toolbar · before and after are stacked to preserve 2× detail',
    rows: [
      [await makePanel(pair.before, { role: 'canvasToolbar', scale: detailScale })],
      [await makePanel(pair.after, { role: 'canvasToolbar', scale: detailScale })],
    ],
  }]);
}

async function buildInspectorBoard() {
  const pair = await pairFor('editor-1440-dark');
  return composeBoard('06-inspector.png', '06 · Right inspector', [{
    heading: 'Inspector panel · full vertical crop at 2×',
    rows: [[
      await makePanel(pair.before, { role: 'inspector', scale: detailScale }),
      await makePanel(pair.after, { role: 'inspector', scale: detailScale }),
    ]],
  }]);
}

async function buildFormControlsBoard() {
  const pair = await pairFor('editor-1440-dark');
  return composeBoard('07-form-controls.png', '07 · Editor form controls', [{
    heading: 'Inspector controls · 2× detail crops',
    rows: [[
      await makePanel(pair.before, { role: 'formControls', scale: detailScale }),
      await makePanel(pair.after, { role: 'formControls', scale: detailScale }),
    ]],
  }]);
}

async function pickerSection(stem, label) {
  const beforeDark = await loadCapture('before', `${stem}-dark`);
  const afterDark = await loadCapture('after', `${stem}-dark`);
  const sections = [{
    heading: `${label} · Dark · 2× role crop`,
    rows: [[
      await makePanel(beforeDark, { role: stem === 'job-picker' ? 'jobPicker' : 'worldPicker', scale: detailScale }),
      await makePanel(afterDark, { role: stem === 'job-picker' ? 'jobPicker' : 'worldPicker', scale: detailScale }),
    ]],
  }];
  const afterLight = await loadCapture('after', `${stem}-light`);
  if (afterLight) {
    const beforeLight = await loadCapture('before', `${stem}-light`, true);
    const before = beforeLight ?? beforeDark;
    const note = beforeLight ? '' : 'Light before unavailable; source is Dark';
    sections.push({
      heading: beforeLight ? `${label} · Light · 2× role crop` : `${label} · Light after compared with an honestly labeled Dark before fallback`,
      rows: [[
        await makePanel(before, { role: stem === 'job-picker' ? 'jobPicker' : 'worldPicker', scale: detailScale, note }),
        await makePanel(afterLight, { role: stem === 'job-picker' ? 'jobPicker' : 'worldPicker', scale: detailScale }),
      ]],
    });
  }
  return sections;
}

async function buildPickerBoard() {
  const sections = [
    ...(await pickerSection('job-picker', 'Job picker')),
    ...(await pickerSection('world-picker', 'World picker')),
  ];
  return composeBoard('08-job-world-picker.png', '08 · Job and world pickers', sections);
}

async function buildMobileBoard() {
  const sections = [];
  for (const mode of ['dark', 'light']) {
    const pair = await pairFor(`editor-390-${mode}`);
    sections.push({
      heading: `390px mobile editor · ${mode} · source screenshots remain at 1×`,
      rows: [[await makePanel(pair.before), await makePanel(pair.after)]],
    });
  }
  const optionalNames = new Set([
    ...(await optionalCaptureNames('before')).filter((stem) => /^mobile-sheet-/iu.test(stem)),
    ...(await optionalCaptureNames('after')).filter((stem) => /^mobile-sheet-/iu.test(stem)),
  ]);
  if (optionalNames.size) {
    const rows = [];
    for (const stem of [...optionalNames].sort()) {
      const before = await loadCapture('before', stem, true);
      const after = await loadCapture('after', stem, true);
      if (before && after) rows.push([await makePanel(before, { role: 'mobileSheet' }), await makePanel(after, { role: 'mobileSheet' })]);
      else if (after) rows.push([await makePanel(after, { role: 'mobileSheet' })]);
      else if (before) rows.push([await makePanel(before, { role: 'mobileSheet' })]);
    }
    if (rows.length) sections.push({ heading: 'Optional mobile picker-sheet captures · only real supplied screenshots are included', rows });
  }
  return composeBoard('09-mobile.png', '09 · Mobile editor and sheets', sections);
}

async function buildTemplatesExportBoard() {
  const sections = [];
  for (const page of ['templates', 'export']) {
    for (const mode of ['dark', 'light']) {
      const stem = `${page}-${mode}`;
      const pair = await pairFor(stem);
      const heightNote = pair.before.metadata.height === pair.after.metadata.height
        ? 'matching full-page source heights'
        : `full-page source height ${pair.before.metadata.height}px → ${pair.after.metadata.height}px, natural aspect ratio`;
      sections.push({
        heading: `${page === 'templates' ? 'Templates' : 'Export'} · ${mode} · 720px overview tiles · ${heightNote}`,
        rows: [[
          await makePanel(pair.before, { targetWidth: overviewWidth }),
          await makePanel(pair.after, { targetWidth: overviewWidth }),
        ]],
      });
    }
  }
  return composeBoard('10-templates-export.png', '10 · Templates and Export pages', sections, { maxWidth: 1600 });
}

async function buildLightDarkBoard() {
  const sections = [];
  for (const size of ['1440', '1920']) {
    for (const stage of ['before', 'after']) {
      const dark = await loadCapture(stage, `editor-${size}-dark`);
      const light = await loadCapture(stage, `editor-${size}-light`);
      sections.push({
        heading: `${size}px editor · ${stage} · Dark and Light overview tiles`,
        rows: [[
          await makePanel(dark, { targetWidth: overviewWidth }),
          await makePanel(light, { targetWidth: overviewWidth }),
        ]],
      });
    }
  }
  return composeBoard('11-light-dark.png', '11 · Theme and viewport comparison', sections, { maxWidth: 1600 });
}

async function buildAppReviewBoard() {
  const editorDark = await loadCapture('after', 'editor-1440-dark');
  const editorLight = await loadCapture('after', 'editor-1440-light');
  const mobileDark = await loadCapture('after', 'editor-390-dark');
  const mobileLight = await loadCapture('after', 'editor-390-light');
  const jobPicker = await loadCapture('after', 'job-picker-dark');
  const templates = await loadCapture('after', 'templates-dark');
  const exportPage = await loadCapture('after', 'export-dark');
  const sections = [
    {
      heading: 'Editor · Dark and Light · After captures · overview tiles',
      rows: [[
        await makePanel(editorDark, { targetWidth: 640 }),
        await makePanel(editorLight, { targetWidth: 640 }),
      ]],
    },
    {
      heading: 'Mobile editor · Dark and Light · After captures · overview tiles',
      rows: [[
        await makePanel(mobileDark, { targetWidth: 300 }),
        await makePanel(mobileLight, { targetWidth: 300 }),
      ]],
    },
    {
      heading: 'Job picker and Templates · Dark · After captures · overview tiles',
      rows: [[
        await makePanel(jobPicker, { targetWidth: 640 }),
        await makePanel(templates, { targetWidth: 640 }),
      ]],
    },
    {
      heading: 'Export · Dark · After capture · overview tile',
      rows: [[await makePanel(exportPage, { targetWidth: 640 })]],
    },
  ];
  return composeBoard('12-app-review-board.png', '12 · Phase 2.17 app review board · After-state overview', sections, { maxWidth: 1600 });
}

async function buildBoards() {
  const outputs = [];
  outputs.push(await composeBoard('01-dark-before-after.png', '01 · Dark editor before and after', await fullPairSections('dark')));
  outputs.push(await composeBoard('02-light-before-after.png', '02 · Light editor before and after', await fullPairSections('light')));
  outputs.push(await buildHeaderBoard());
  outputs.push(await buildToolRailBoard());
  outputs.push(await buildCanvasToolbarBoard());
  outputs.push(await buildInspectorBoard());
  outputs.push(await buildFormControlsBoard());
  outputs.push(await buildPickerBoard());
  outputs.push(await buildMobileBoard());
  outputs.push(await buildTemplatesExportBoard());
  outputs.push(await buildLightDarkBoard());
  outputs.push(await buildAppReviewBoard());
  assert(outputs.length === boardNames.length, `Expected ${boardNames.length} boards, generated ${outputs.length}.`);
  assert(outputs.every((output, index) => output.record.file === boardNames[index]), 'Generated board names are out of order or unexpected.');
  return outputs;
}

async function main() {
  const args = process.argv.slice(2);
  const preflightOnly = args.includes('--preflight');
  assert(args.every((arg) => arg === '--preflight'), `Unknown argument: ${args.find((arg) => arg !== '--preflight')}`);
  if (preflightOnly) {
    await reportPreflight();
    return;
  }

  const missing = await missingRequiredInputs();
  if (missing.length) {
    const report = { status: 'waiting-for-required-captures', missing, writesFiles: false };
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  // Load and validate every mandatory screenshot before creating the output directory.
  for (const stage of ['before', 'after']) {
    await Promise.all(requiredStems.map((stem) => loadCapture(stage, stem)));
  }
  await Promise.all(requiredAfterOnlyStems.map((stem) => loadCapture('after', stem)));
  for (const stem of requiredStems) await pairFor(stem);

  const outputs = await buildBoards();
  await mkdir(outputRoot, { recursive: true });
  const boardRecords = [];
  for (const output of outputs) {
    const file = path.join(outputRoot, output.record.file);
    await writeFile(file, output.bytes);
    boardRecords.push(output.record);
  }
  const sourceRecords = [...sourceRegistry.values()].sort((left, right) => left.path.localeCompare(right.path));
  const metadata = {
    schema: 'phase217-review-boards-v1',
    generatedAt: new Date().toISOString(),
    status: 'complete',
    sourcePolicy: 'Boards are composed from the original JPEG screen captures only. Captions are provenance annotations; no synthetic application UI is added. Detail boards use actual roleRect crops when capture-states.json provides them, otherwise the documented viewport-size fallback. Detail crops are enlarged 2× without changing aspect ratio. Overview tiles are downscaled with aspect ratio preserved and are labeled as overviews. Full-page screenshots may have different before/after heights when the outer page layout changes; panels are top-aligned at natural aspect ratio, with unused board background left empty rather than stretching or padding screenshot content.',
    limits: { detailScale, overviewWidth, maxBoardWidth },
    requiredStems,
    requiredAfterOnlyStems,
    layoutChanges: [...pairDimensionChanges.values()],
    sources: sourceRecords,
    boards: boardRecords,
  };
  const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(metadataPath, metadataBytes);
  process.stdout.write(`${JSON.stringify({
    status: 'complete',
    boardCount: boardRecords.length,
    boards: boardRecords.map(({ file, dimensions, bytes }) => ({ file, dimensions, bytes })),
    sourceCount: sourceRecords.length,
    metadata: relativePath(metadataPath),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

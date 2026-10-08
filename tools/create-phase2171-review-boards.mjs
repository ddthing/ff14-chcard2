import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// --preflight reports exact missing inputs without decoding images or writing files.
// A normal run writes the five review boards and their provenance manifest.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phaseRoot = path.join(root, 'docs', 'qa', 'phase2171');
const beforeRoot = path.join(phaseRoot, 'before');
const afterRoot = path.join(phaseRoot, 'after');
const metadataPath = path.join(phaseRoot, 'boards-metadata.json');
const outputRoot = phaseRoot;
const boardNames = [
  '01-tooltip-before-after.png',
  '02-tooltip-edge-cases.png',
  '03-mobile-targets.png',
  '04-mobile-toolbar.png',
  '05-light-dark.png',
];
const requiredStems = [
  'tooltip-1440-dark-ko',
  'tooltip-1920-dark-en',
  'tooltip-390-dark-ja',
  'mobile-toolbar-dark',
  'mobile-style-light',
  'mobile-picker-light',
];
const requiredAfterOnlyStems = ['tooltip-1440-light-ko', 'tooltip-390-light-ja'];
const roleAliases = {
  header: ['header'],
  toolbar: ['toolbar'],
  tooltip: ['tooltip'],
  inspector: ['inspector'],
  mobileSheet: ['mobileSheet', 'inspector', 'mobile-sheet'],
  picker: ['picker'],
  targets: ['targets'],
};
const margin = 24;
const panelGap = 16;
const sectionGap = 18;
const titleHeight = 48;
const sectionHeight = 32;
const captionHeight = 42;
const maxBoardWidth = 2400;
const detailScale = 2;
const background = '#e8ebea';
const titleColor = '#1c282e';
const captureCache = new Map();
const stateCache = new Map();
const sourceRegistry = new Map();
const pairDimensionChanges = new Map();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativePath(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function labelSvg(width, height, lines, options = {}) {
  const fill = options.fill ?? '#dce2e1';
  const color = options.color ?? titleColor;
  const primarySize = options.primarySize ?? 13;
  const secondarySize = options.secondarySize ?? 10;
  const lineHeight = options.lineHeight ?? 16;
  const firstBaseline = Math.floor((height - lines.length * lineHeight) / 2) + lineHeight;
  const content = lines.map((line, index) => {
    const y = firstBaseline + index * lineHeight;
    const size = index === 0 ? primarySize : secondarySize;
    const weight = index === 0 ? 700 : 500;
    return `<text x="12" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/>${content}</svg>`);
}

function wrapCaptionLines(lines, width) {
  const maxChars = Math.max(14, Math.floor((width - 24) / 5.2));
  const wrapped = [];
  for (const line of lines) {
    let current = '';
    for (const word of line.split(/\s+/u)) {
      const chunks = word.length > maxChars
        ? word.match(new RegExp(`.{1,${maxChars}}`, 'gu')) ?? [word]
        : [word];
      for (const chunk of chunks) {
        const candidate = current ? `${current} ${chunk}` : chunk;
        if (candidate.length <= maxChars) current = candidate;
        else {
          if (current) wrapped.push(current);
          current = chunk;
        }
      }
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
}

function normalizeViewport(value, width, height) {
  if (Array.isArray(value)) return { width: value[0] ?? width, height: value[1] ?? height, dpr: value[2] ?? 1 };
  if (value && typeof value === 'object') {
    return { width: value.width ?? value.innerWidth ?? width, height: value.height ?? value.innerHeight ?? height, dpr: value.dpr ?? value.deviceScaleFactor ?? value.scale ?? 1 };
  }
  return { width, height, dpr: 1 };
}

function modeFor(stem, state) {
  const mode = String(state?.theme ?? state?.mode ?? '').toLowerCase();
  if (mode === 'dark' || mode === 'light') return mode;
  if (/(?:^|-)dark(?:-|$)/u.test(stem)) return 'dark';
  if (/(?:^|-)light(?:-|$)/u.test(stem)) return 'light';
  return 'unspecified';
}

async function readCaptureStates(stage) {
  if (stateCache.has(stage)) return stateCache.get(stage);
  const folder = stage === 'before' ? beforeRoot : afterRoot;
  const file = path.join(folder, 'capture-states.json');
  let records = [];
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (Array.isArray(value)) records = value;
    else if (Array.isArray(value.states)) records = value.states;
    else if (Array.isArray(value.captures)) records = value.captures;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`Could not read ${relativePath(file)}: ${error.message}`);
  }
  const result = new Map(records.filter((record) => record?.name).map((record) => [record.name, record]));
  stateCache.set(stage, result);
  return result;
}

async function captureExists(stage, stem) {
  const folder = stage === 'before' ? beforeRoot : afterRoot;
  try {
    await access(path.join(folder, `${stem}.jpg`));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function missingInputs() {
  const missing = [];
  for (const stage of ['before', 'after']) {
    for (const stem of requiredStems) if (!(await captureExists(stage, stem))) missing.push(`${stage}/${stem}.jpg`);
  }
  for (const stem of requiredAfterOnlyStems) if (!(await captureExists('after', stem))) missing.push(`after/${stem}.jpg`);
  return missing;
}

async function preflight() {
  const missing = await missingInputs();
  process.stdout.write(`${JSON.stringify({
    status: missing.length ? 'waiting-for-required-captures' : 'ready',
    requiredCount: requiredStems.length * 2 + requiredAfterOnlyStems.length,
    requiredStems,
    requiredAfterOnlyStems,
    missing,
    expectedBoards: boardNames.map((name) => `docs/qa/phase2171/${name}`),
    metadata: 'docs/qa/phase2171/boards-metadata.json',
    writesFiles: false,
    decodesImages: false,
  }, null, 2)}\n`);
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
    throw new Error(`Missing required JPEG screenshot ${relativePath(file)}.`);
  }
  const image = await sharp(bytes, { failOn: 'error' }).metadata();
  assert(image.format === 'jpeg', `${relativePath(file)} must be a JPEG, found ${image.format ?? 'unknown'}.`);
  assert(Number.isInteger(image.width) && Number.isInteger(image.height), `Could not read screenshot dimensions for ${relativePath(file)}.`);
  const states = await readCaptureStates(stage);
  const state = states.get(stem) ?? null;
  const viewport = normalizeViewport(state?.viewport, image.width, image.height);
  const record = {
    stage,
    stem,
    mode: modeFor(stem, state),
    path: relativePath(file),
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    format: image.format,
    dimensions: { width: image.width, height: image.height },
    viewport,
    captureState: state ? {
      overflow: state.overflow,
      coarse: state.coarse,
      headerHeight: state.headerHeight,
    } : null,
  };
  const capture = { bytes, image, record, state };
  captureCache.set(key, capture);
  sourceRegistry.set(record.path, record);
  return capture;
}

function pairFor(stem) {
  return Promise.all([loadCapture('before', stem), loadCapture('after', stem)]).then(([before, after]) => {
    assert(before.image.width === after.image.width, `${stem}: before/after viewport screenshot widths differ (${before.image.width}px vs ${after.image.width}px).`);
    if (before.image.height !== after.image.height) {
      pairDimensionChanges.set(stem, {
        stem,
        beforeImage: { width: before.image.width, height: before.image.height },
        afterImage: { width: after.image.width, height: after.image.height },
        widthMatched: true,
        heightDelta: after.image.height - before.image.height,
        reason: 'Viewport capture heights differ; both images remain at their natural aspect ratio and are top-aligned.',
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
    return entry ? normalizeRect(entry.rect ?? entry.bounds ?? entry) : null;
  }
  if (!container || typeof container !== 'object') return null;
  for (const alias of aliases) {
    const candidate = container[alias];
    const rect = normalizeRect(candidate?.rect ?? candidate?.bounds ?? candidate);
    if (rect) return rect;
  }
  return null;
}

function roleRectFor(capture, role) {
  const state = capture.state;
  if (!state) return null;
  const aliases = roleAliases[role] ?? [role];
  for (const container of [state.roleRects, state.rects, state.roles, state.dom?.roleRects]) {
    const rect = rectFromContainer(container, aliases);
    if (rect) {
      const scaleX = capture.image.width / capture.record.viewport.width;
      const scaleY = capture.image.height / capture.record.viewport.height;
      return { left: rect.left * scaleX, top: rect.top * scaleY, width: rect.width * scaleX, height: rect.height * scaleY, method: 'DOM roleRect from capture-states.json' };
    }
  }
  const directRole = state.role ?? state.roleRect?.role ?? state.roleRect?.name;
  if (aliases.includes(directRole)) {
    const rect = normalizeRect(state.roleRect);
    if (rect) {
      const scaleX = capture.image.width / capture.record.viewport.width;
      const scaleY = capture.image.height / capture.record.viewport.height;
      return { left: rect.left * scaleX, top: rect.top * scaleY, width: rect.width * scaleX, height: rect.height * scaleY, method: 'DOM roleRect from capture-states.json' };
    }
  }
  return null;
}

function fullRect(capture) {
  return { left: 0, top: 0, width: capture.image.width, height: capture.image.height };
}

function cropRect(capture, role) {
  const fromState = roleRectFor(capture, role);
  if (fromState) return { rect: fromState, method: fromState.method };
  return { rect: fullRect(capture), method: 'full viewport fallback (no matching roleRect)' };
}

function clampRect(rect, width, height) {
  const left = Math.max(0, Math.min(Math.floor(rect.left), width - 1));
  const top = Math.max(0, Math.min(Math.floor(rect.top), height - 1));
  const right = Math.max(left + 1, Math.min(Math.ceil(rect.left + rect.width), width));
  const bottom = Math.max(top + 1, Math.min(Math.ceil(rect.top + rect.height), height));
  return { left, top, width: right - left, height: bottom - top };
}

function domTargets(capture) {
  const state = capture.state;
  if (!state) return [];
  const candidates = [state.targets, state.targetRects, state.roleRects?.targets, state.dom?.targets];
  const raw = candidates.find(Array.isArray);
  if (!raw) return [];
  const scaleX = capture.image.width / capture.record.viewport.width;
  const scaleY = capture.image.height / capture.record.viewport.height;
  return raw.map((item, index) => {
    const tag = String(item?.tag ?? item?.tagName ?? '').toUpperCase();
    const semanticRole = String(item?.role ?? '').toLowerCase();
    const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);
    const interactiveRoles = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'option']);
    if (!interactiveTags.has(tag) && !interactiveRoles.has(semanticRole)) return null;
    const rect = normalizeRect(item?.rect ?? item?.bounds ?? item);
    if (!rect) return null;
    return {
      id: String(item.id ?? item.name ?? item.label ?? `target-${index + 1}`),
      role: item.role ?? item.tagName ?? item.tag ?? null,
      type: item.type ?? null,
      label: item.label ?? null,
      rect: { left: rect.left * scaleX, top: rect.top * scaleY, width: rect.width * scaleX, height: rect.height * scaleY },
    };
  }).filter(Boolean);
}

function targetOverlaySvg(width, height, targets, crop, scale) {
  const rects = targets.map(({ rect }) => {
    const left = Math.round((rect.left - crop.left) * scale);
    const top = Math.round((rect.top - crop.top) * scale);
    const rectWidth = Math.round(rect.width * scale);
    const rectHeight = Math.round(rect.height * scale);
    if (left + rectWidth <= 0 || top + rectHeight <= 0 || left >= width || top >= height) return '';
    const x = Math.max(0, left), y = Math.max(0, top);
    const w = Math.max(1, Math.min(width, left + rectWidth) - x);
    const h = Math.max(1, Math.min(height, top + rectHeight) - y);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#48d4a7" stroke-width="2"/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`);
}

function caption(capture, crop, scale, note = '') {
  const record = capture.record;
  const first = `Stage: ${record.stage} · Mode: ${record.mode} · Viewport: ${record.viewport.width}×${record.viewport.height} @ ${record.viewport.dpr}×`;
  const shortPath = path.relative(phaseRoot, path.resolve(root, record.path)).replaceAll('\\', '/');
  const cropLabel = crop ? ` · crop ${crop.left},${crop.top} ${crop.width}×${crop.height} · ${scale}×` : '';
  const second = `Source: ${shortPath}${cropLabel}${note ? ` · ${note}` : ''}`;
  return [first, second];
}

async function makePanel(capture, options = {}) {
  const { role = null, detail = false, overlayTargets = false, note = '' } = options;
  const selected = role ? cropRect(capture, role) : { rect: fullRect(capture), method: 'full viewport screenshot' };
  const crop = clampRect(selected.rect, capture.image.width, capture.image.height);
  const scale = detail && selected.method.startsWith('DOM roleRect') ? detailScale : 1;
  const outWidth = crop.width * scale;
  const outHeight = crop.height * scale;
  let pipeline = sharp(capture.bytes, { failOn: 'error' }).extract(crop);
  if (scale !== 1) pipeline = pipeline.resize({ width: outWidth, height: outHeight, fit: 'fill', kernel: 'lanczos3' });
  let bytes = await pipeline.png().toBuffer();
  const targets = overlayTargets ? domTargets(capture) : [];
  const appliedTargets = targets.length > 0;
  if (appliedTargets) {
    bytes = await sharp(bytes).composite([{ input: targetOverlaySvg(outWidth, outHeight, targets, crop, scale), left: 0, top: 0 }]).png().toBuffer();
  }
  const meta = await sharp(bytes).metadata();
  const labelNote = overlayTargets ? (appliedTargets ? 'green outlines are DOM target bounds' : 'no DOM target bounds supplied; screenshot unaltered') : note;
  const captionLines = wrapCaptionLines(caption(capture, crop, scale, labelNote), meta.width);
  const panelCaptionHeight = Math.max(captionHeight, 12 + captionLines.length * 12);
  return {
    bytes,
    width: meta.width,
    height: meta.height,
    caption: captionLines,
    captionHeight: panelCaptionHeight,
    metadata: {
      source: capture.record.path,
      sourceSha256: capture.record.sha256,
      sourceDimensions: capture.record.dimensions,
      stage: capture.record.stage,
      mode: capture.record.mode,
      viewport: capture.record.viewport,
      crop: { ...crop, method: selected.method, scale },
      targetOverlay: overlayTargets ? {
        applied: appliedTargets,
        method: appliedTargets ? 'capture-states.json DOM target rectangles' : null,
        targets: appliedTargets ? targets : [],
      } : null,
      caption: captionLines,
      captionHeight: panelCaptionHeight,
      outputDimensions: { width: meta.width, height: meta.height },
      resized: scale !== 1,
    },
  };
}

function normalizeRows(sections, maxContentWidth) {
  return sections.map((section) => ({
    ...section,
    rows: section.rows.flatMap((row) => {
      const rowWidth = row.reduce((sum, panel) => sum + panel.width, 0) + panelGap * Math.max(0, row.length - 1);
      if (rowWidth <= maxContentWidth) return [row];
      return row.map((panel) => {
        assert(panel.width <= maxContentWidth, `A panel is wider than the board limit (${panel.width}px > ${maxContentWidth}px).`);
        return [panel];
      });
    }),
  }));
}

async function composeBoard(file, title, sections) {
  const contentLimit = maxBoardWidth - margin * 2;
  const normalized = normalizeRows(sections, contentLimit);
  const widest = Math.max(1, ...normalized.flatMap((section) => section.rows.map((row) => row.reduce((sum, panel) => sum + panel.width, 0) + panelGap * Math.max(0, row.length - 1))));
  const contentWidth = Math.min(contentLimit, widest);
  const boardWidth = contentWidth + margin * 2;
  const composites = [{ input: labelSvg(contentWidth, titleHeight, [title, 'Real JPEG captures · source stage, mode, viewport, and crop are labeled'], { fill: '#d6dddc', primarySize: 17, secondarySize: 11 }), left: margin, top: margin }];
  let y = margin + titleHeight + sectionGap;
  const records = [];
  for (const section of normalized) {
    composites.push({ input: labelSvg(contentWidth, sectionHeight, [section.heading], { fill: '#e1e5e4', primarySize: 13 }), left: margin, top: y });
    y += sectionHeight;
    const rows = [];
    for (const row of section.rows) {
      const imageHeight = Math.max(...row.map((panel) => panel.height));
      const rowCaptionHeight = Math.max(...row.map((panel) => panel.captionHeight ?? captionHeight));
      let x = margin + Math.round((contentWidth - (row.reduce((sum, panel) => sum + panel.width, 0) + panelGap * Math.max(0, row.length - 1))) / 2);
      const panels = [];
      for (const panel of row) {
        composites.push({ input: labelSvg(panel.width, rowCaptionHeight, panel.caption, { fill: '#f3f5f4', primarySize: 12, secondarySize: 10, lineHeight: 12 }), left: x, top: y });
        composites.push({ input: panel.bytes, left: x, top: y + rowCaptionHeight });
        panels.push(panel.metadata);
        x += panel.width + panelGap;
      }
      rows.push(panels);
      y += rowCaptionHeight + imageHeight + panelGap;
    }
    records.push({ heading: section.heading, panels: rows });
    y += sectionGap;
  }
  const boardHeight = Math.max(titleHeight + margin * 2, y - sectionGap + margin);
  const bytes = await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background } })
    .composite(composites).png({ compressionLevel: 9 }).toBuffer();
  return {
    bytes,
    record: { file, path: `docs/qa/phase2171/${file}`, sha256: sha256(bytes), bytes: bytes.length, dimensions: { width: boardWidth, height: boardHeight }, sections: records },
  };
}

async function fullPairSection(stem, heading) {
  const pair = await pairFor(stem);
  return {
    heading,
    rows: [[await makePanel(pair.before)], [await makePanel(pair.after)]],
  };
}

async function rolePairSection(stem, role, heading, options = {}) {
  const pair = await pairFor(stem);
  return {
    heading,
    rows: [[
      await makePanel(pair.before, { role, detail: true, overlayTargets: options.overlayTargets }),
      await makePanel(pair.after, { role, detail: true, overlayTargets: options.overlayTargets }),
    ]],
  };
}

async function buildBoards() {
  const sections01 = [await fullPairSection('tooltip-1440-dark-ko', '1440px · Korean · Dark · native viewport captures')];
  const board01 = await composeBoard('01-tooltip-before-after.png', '01 · Tooltip before and after', sections01);

  const tooltip1920 = await pairFor('tooltip-1920-dark-en');
  const tooltip390 = await pairFor('tooltip-390-dark-ja');
  const light390Edge = await loadCapture('after', 'tooltip-390-light-ja');
  const sections02 = [
    await rolePairSection('tooltip-1920-dark-en', 'tooltip', '1920px edge case · English · Dark · 2× tooltip crop'),
    await rolePairSection('tooltip-390-dark-ja', 'tooltip', '390px edge case · Japanese · Dark · 2× tooltip crop'),
    { heading: '390px edge case · Japanese · Light · After only', rows: [[await makePanel(light390Edge, { role: 'tooltip', detail: true })]] },
  ];
  // Keep the captures loaded for the metadata and make the expected edge pair explicit.
  assert(tooltip1920.before.image.width === tooltip1920.after.image.width && tooltip390.before.image.width === tooltip390.after.image.width, 'Edge-case screenshot widths must match within each before/after pair.');
  const board02 = await composeBoard('02-tooltip-edge-cases.png', '02 · Tooltip viewport edge cases', sections02);

  const stylePair = await pairFor('mobile-style-light');
  const pickerPair = await pairFor('mobile-picker-light');
  const board03 = await composeBoard('03-mobile-targets.png', '03 · Mobile style and picker targets', [
    { heading: 'Style surface · Light · target outlines only when capture-states.json supplies DOM bounds', rows: [[
      await makePanel(stylePair.before, { role: 'mobileSheet', detail: true, overlayTargets: true }),
      await makePanel(stylePair.after, { role: 'mobileSheet', detail: true, overlayTargets: true }),
    ]] },
    { heading: 'Picker surface · Light · target outlines only when capture-states.json supplies DOM bounds', rows: [[
      await makePanel(pickerPair.before, { role: 'picker', detail: true, overlayTargets: true }),
      await makePanel(pickerPair.after, { role: 'picker', detail: true, overlayTargets: true }),
    ]] },
  ]);

  const toolbarPair = await pairFor('mobile-toolbar-dark');
  const board04 = await composeBoard('04-mobile-toolbar.png', '04 · Mobile toolbar', [
    { heading: 'Dark mobile editor · full 390px viewport screenshots', rows: [[await makePanel(toolbarPair.before), await makePanel(toolbarPair.after)]] },
    { heading: 'Toolbar · 2× role crop from the same viewport captures', rows: [[
      await makePanel(toolbarPair.before, { role: 'toolbar', detail: true }),
      await makePanel(toolbarPair.after, { role: 'toolbar', detail: true }),
    ]] },
  ]);

  const dark1440 = await loadCapture('after', 'tooltip-1440-dark-ko');
  const light1440 = await loadCapture('after', 'tooltip-1440-light-ko');
  const dark390 = await loadCapture('after', 'tooltip-390-dark-ja');
  const light390 = await loadCapture('after', 'tooltip-390-light-ja');
  const mobileToolbar = await loadCapture('after', 'mobile-toolbar-dark');
  const mobileStyle = await loadCapture('after', 'mobile-style-light');
  const mobilePicker = await loadCapture('after', 'mobile-picker-light');
  const board05 = await composeBoard('05-light-dark.png', '05 · Dark and Light tooltip and mobile comparison', [
    { heading: '1440px tooltip · Korean · After · Dark / Light', rows: [[
      await makePanel(dark1440, { role: 'tooltip', detail: true }),
      await makePanel(light1440, { role: 'tooltip', detail: true }),
    ]] },
    { heading: '390px tooltip · Japanese · After · Dark / Light', rows: [[
      await makePanel(dark390, { role: 'tooltip', detail: true }),
      await makePanel(light390, { role: 'tooltip', detail: true }),
    ]] },
    { heading: 'Mobile surfaces · actual captured modes: toolbar Dark, style Light, picker Light', rows: [
      [await makePanel(mobileToolbar, { role: 'toolbar', detail: true })],
      [await makePanel(mobileStyle, { role: 'mobileSheet', detail: true, overlayTargets: true })],
      [await makePanel(mobilePicker, { role: 'picker', detail: true, overlayTargets: true })],
    ] },
  ]);

  return [board01, board02, board03, board04, board05];
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.every((arg) => arg === '--preflight'), `Unknown argument: ${args.find((arg) => arg !== '--preflight')}`);
  if (args.includes('--preflight')) {
    await preflight();
    return;
  }
  const missing = await missingInputs();
  if (missing.length) {
    process.stderr.write(`${JSON.stringify({ status: 'waiting-for-required-captures', missing, writesFiles: false }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  for (const stage of ['before', 'after']) await Promise.all(requiredStems.map((stem) => loadCapture(stage, stem)));
  await Promise.all(requiredAfterOnlyStems.map((stem) => loadCapture('after', stem)));
  for (const stem of requiredStems) await pairFor(stem);
  const boards = await buildBoards();
  assert(boards.length === boardNames.length && boards.every((board, index) => board.record.file === boardNames[index]), 'Generated board names/count do not match the required set.');
  const records = [];
  for (const board of boards) {
    await writeFile(path.join(outputRoot, board.record.file), board.bytes);
    records.push(board.record);
  }
  const sources = [...sourceRegistry.values()].sort((a, b) => a.path.localeCompare(b.path));
  const metadata = {
    schema: 'phase2171-review-boards-v1',
    generatedAt: new Date().toISOString(),
    status: 'complete',
    sourcePolicy: 'Boards contain only original JPEG screen captures plus external provenance captions. DOM target bounds are overlaid only when present in capture-states.json and are labeled as annotations; absent bounds leave screenshots unaltered. Role crops use capture-state DOM rectangles when available. Each panel preserves its source aspect ratio, and before/after height differences are recorded instead of stretched or padded.',
    limits: { maxBoardWidth, detailScale },
    requiredStems,
    requiredAfterOnlyStems,
    layoutChanges: [...pairDimensionChanges.values()],
    sources,
    boards: records,
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: 'complete', boardCount: records.length, sourceCount: sources.length, boards: records.map(({ file, dimensions, bytes }) => ({ file, dimensions, bytes })), metadata: relativePath(metadataPath) }, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });

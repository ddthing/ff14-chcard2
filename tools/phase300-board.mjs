import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const qaRoot = path.resolve(projectRoot, 'docs/qa/phase300');
const afterRoot = path.join(qaRoot, 'after');
const outputPath = path.join(qaRoot, '20-web-experience-board.png');

const sourceNames = {
  homeHero: '01-home-dark-desktop.png',
  beforeAfter: '07-before-after.png',
  masters: '08-master-worlds.png',
  templates: '10-templates-dark.png',
  editor: '14-template-to-editor.png',
  export: '15-export-dark.png',
  mobileHome: '03-home-mobile-dark.png',
  mobileTemplates: '12-templates-mobile.png',
  mobileExport: '17-export-mobile.png',
  light: '02-home-light-desktop.png',
  dark: '01-home-dark-desktop.png',
};

const sources = Object.fromEntries(Object.entries(sourceNames).map(([key, name]) => {
  const candidates = [path.join(qaRoot, name), path.join(afterRoot, name)];
  return [key, candidates.find((candidate) => existsSync(candidate))];
}));
const missing = Object.entries(sources).filter(([, source]) => !source).map(([key]) => `${key}: ${sourceNames[key]}`);

if (missing.length) {
  throw new Error(`Board inputs are not ready. Missing screenshots:\n${missing.map((item) => `- ${item}`).join('\n')}`);
}

const board = {
  width: 2560,
  height: 1800,
  background: '#121714',
  panel: '#1a211d',
  line: '#3b4840',
  ink: '#e8ece5',
  muted: '#a3ada4',
  accent: '#c6d1c7',
  margin: 64,
  gap: 24,
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function svgBuffer(width, height, content) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`);
}

function topMatter() {
  const { width, ink, muted, accent, line } = board;
  return svgBuffer(width, 126, `
    <text x="64" y="39" fill="${accent}" font-family="Arial,sans-serif" font-size="14" letter-spacing="3">XIV ADVENTURER CARD / PHASE 3.0</text>
    <text x="64" y="91" fill="${ink}" font-family="Georgia,serif" font-size="42">Web experience board</text>
    <text x="2496" y="46" text-anchor="end" fill="${muted}" font-family="Arial,sans-serif" font-size="13" letter-spacing="1.6">ACTUAL PRODUCT SCREENS · C2 / E2 / I3</text>
    <line x1="64" y1="125" x2="2496" y2="125" stroke="${line}" stroke-width="1" />
  `);
}

function panelHeader(width, title, detail = '') {
  const safeTitle = escapeXml(title.toUpperCase());
  const safeDetail = escapeXml(detail);
  return svgBuffer(width, 56, `
    <rect width="100%" height="56" fill="${board.panel}" />
    <rect x="0" y="0" width="3" height="56" fill="${board.accent}" />
    <text x="18" y="25" fill="${board.ink}" font-family="Arial,sans-serif" font-size="13" font-weight="600" letter-spacing="1.3">${safeTitle}</text>
    ${detail ? `<text x="${width - 18}" y="25" text-anchor="end" fill="${board.muted}" font-family="Arial,sans-serif" font-size="11" letter-spacing="0.5">${safeDetail}</text>` : ''}
  `);
}

function panelFrame(width, height) {
  return svgBuffer(width, height, `
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${board.line}" stroke-width="1" />
  `);
}

async function screenshotLayer(source, width, height, fit = 'contain') {
  return sharp(source)
    .resize(width, height, { fit, position: fit === 'cover' ? 'attention' : 'centre', background: board.background })
    .png()
    .toBuffer();
}

const layers = [{ input: topMatter(), left: 0, top: 0 }];

async function addPanel({ source, x, y, width, height, title, detail = '', fit = 'contain' }) {
  const imageTop = 56;
  const inset = 12;
  const image = await screenshotLayer(source, width - inset * 2, height - imageTop - inset, fit);
  layers.push({ input: panelHeader(width, title, detail), left: x, top: y });
  layers.push({ input: image, left: x + inset, top: y + imageTop });
  layers.push({ input: panelFrame(width, height), left: x, top: y });
}

async function addMobilePanel(x, y, width, height) {
  const titleBar = panelHeader(width, 'Mobile', '390 × 844 · HOME / TEMPLATES / EXPORT');
  layers.push({ input: titleBar, left: x, top: y });

  const innerTop = y + 62;
  const innerHeight = height - 74;
  const phoneWidth = Math.floor((width - 48) / 3);
  const phoneHeight = innerHeight - 2;
  const mobileSources = [
    ['HOME', sources.mobileHome],
    ['TEMPLATES', sources.mobileTemplates],
    ['EXPORT', sources.mobileExport],
  ];

  for (const [index, [label, source]] of mobileSources.entries()) {
    const left = x + 12 + index * (phoneWidth + 12);
    const caption = svgBuffer(phoneWidth, 22, `<text x="0" y="15" fill="${board.muted}" font-family="Arial,sans-serif" font-size="10" letter-spacing="1">${label}</text>`);
    const image = await screenshotLayer(source, phoneWidth - 14, phoneHeight - 30, 'contain');
    const phoneFrame = svgBuffer(phoneWidth, phoneHeight, `
      <rect x="0.5" y="0.5" width="${phoneWidth - 1}" height="${phoneHeight - 1}" fill="${board.background}" stroke="${board.line}" />
    `);
    layers.push({ input: caption, left, top: innerTop });
    layers.push({ input: phoneFrame, left, top: innerTop + 24 });
    layers.push({ input: image, left: left + 7, top: innerTop + 28 });
  }
  layers.push({ input: panelFrame(width, height), left: x, top: y });
}

async function addThemePanel(x, y, width, height) {
  const titleBar = panelHeader(width, 'Light / Dark', 'SAME HOME · OPTICAL THEME TUNING');
  layers.push({ input: titleBar, left: x, top: y });

  const innerTop = y + 66;
  const innerHeight = height - 78;
  const gap = 12;
  const halfWidth = Math.floor((width - gap - 24) / 2);
  const halfHeight = innerHeight;
  const items = [
    ['DARK', sources.dark],
    ['LIGHT', sources.light],
  ];

  for (const [index, [label, source]] of items.entries()) {
    const left = x + 12 + index * (halfWidth + gap);
    const title = svgBuffer(halfWidth, 24, `<text x="0" y="16" fill="${board.accent}" font-family="Arial,sans-serif" font-size="10" letter-spacing="1.4">${label}</text>`);
    const image = await screenshotLayer(source, halfWidth, halfHeight - 30, 'contain');
    layers.push({ input: title, left, top: innerTop });
    layers.push({ input: image, left, top: innerTop + 28 });
  }
  layers.push({ input: panelFrame(width, height), left: x, top: y });
}

const left = board.margin;
const right = board.width - board.margin;
const contentWidth = right - left;
const rowOneY = 150;
const rowOneHeight = 600;
const rowOneLeftWidth = 1180;
const rowOneRightX = left + rowOneLeftWidth + board.gap;
const rowOneRightWidth = right - rowOneRightX;

await addPanel({ source: sources.homeHero, x: left, y: rowOneY, width: rowOneLeftWidth, height: rowOneHeight, title: 'Home hero', detail: 'A CARD AS THE FIRST IMPRESSION' });
await addPanel({ source: sources.beforeAfter, x: rowOneRightX, y: rowOneY, width: rowOneRightWidth, height: rowOneHeight, title: 'Before / after', detail: 'REAL SCREENSHOT → REAL CARD' });

const rowTwoY = rowOneY + rowOneHeight + board.gap;
const rowTwoHeight = 515;
const rowTwoWidths = [780, 780, contentWidth - 780 * 2 - board.gap * 2];
const rowTwoXs = [left, left + rowTwoWidths[0] + board.gap, left + rowTwoWidths[0] + rowTwoWidths[1] + board.gap * 2];
await addPanel({ source: sources.masters, x: rowTwoXs[0], y: rowTwoY, width: rowTwoWidths[0], height: rowTwoHeight, title: 'Master worlds', detail: 'C2 · E2 · I3' });
await addPanel({ source: sources.templates, x: rowTwoXs[1], y: rowTwoY, width: rowTwoWidths[1], height: rowTwoHeight, title: 'Templates', detail: 'EDITORIAL GALLERY' });
await addPanel({ source: sources.editor, x: rowTwoXs[2], y: rowTwoY, width: rowTwoWidths[2], height: rowTwoHeight, title: 'Editor reference', detail: 'THE PROFESSIONAL TOOL' });

const rowThreeY = rowTwoY + rowTwoHeight + board.gap;
const rowThreeHeight = board.height - rowThreeY - 50;
const rowThreeWidths = [800, 760, contentWidth - 800 - 760 - board.gap * 2];
const rowThreeXs = [left, left + rowThreeWidths[0] + board.gap, left + rowThreeWidths[0] + rowThreeWidths[1] + board.gap * 2];
await addPanel({ source: sources.export, x: rowThreeXs[0], y: rowThreeY, width: rowThreeWidths[0], height: rowThreeHeight, title: 'Export', detail: 'QUIET PAYOFF' });
await addMobilePanel(rowThreeXs[1], rowThreeY, rowThreeWidths[1], rowThreeHeight);
await addThemePanel(rowThreeXs[2], rowThreeY, rowThreeWidths[2], rowThreeHeight);

await sharp({ create: { width: board.width, height: board.height, channels: 3, background: board.background } })
  .composite(layers)
  .png({ compressionLevel: 9, effort: 8 })
  .toFile(outputPath);

console.log(`Saved ${path.relative(projectRoot, outputPath)}`);

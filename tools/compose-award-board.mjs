import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = path.resolve('docs/qa/award-pass');
const exportsDir = path.join(out, 'exports');
const families = ['cinematic', 'editorial', 'id-card'];
const labels = ['C2 / EDITORIAL CINEMA', 'E2 / IMAGE COLLISION', 'I3 / PREMIUM RECORD'];
const file = (family, locale = 'en', ratio = '4x5') => path.join(exportsDir, `${family}-${locale}-${ratio}-2x.png`);
const bg = '#11151a';
function title(text, width, height = 44) {
  return Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/><text x="16" y="28" fill="#e6ebf1" font-family="Arial,sans-serif" font-size="17">${text.replaceAll('&', '&amp;')}</text></svg>`);
}
async function canvas(name, width, height, composites) {
  await sharp({ create: { width, height, channels: 3, background: bg } }).composite(composites).png().toFile(path.join(out, name));
}
const masters = [];
for (let i = 0; i < 3; i++) {
  masters.push({ input: title(labels[i], 480), left: 16 + i * 496, top: 48 });
  masters.push({ input: await sharp(file(families[i])).resize(480, 600).toBuffer(), left: 16 + i * 496, top: 92 });
}
await canvas('01-master-cards.png', 1504, 708, [{ input: title('AWARD PASS / 4:5 / ACTUAL PNG 2x EXPORTS', 1504), left: 0, top: 0 }, ...masters]);

const typo = [], material = [];
for (let i = 0; i < 3; i++) {
  const family = families[i];
  const meta = JSON.parse(await readFile(path.join(exportsDir, `${family}-en-4x5-2x.json`), 'utf8'));
  const name = meta.fields.find(f => f.field === 'name');
  const factor = meta.size.width / meta.logical.width;
  const left = Math.max(0, Math.floor(name.x * factor - 20));
  const top = Math.max(0, Math.floor(name.y * factor - 20));
  const width = Math.min(1400, meta.size.width - left, Math.ceil(name.width * factor + 40));
  const height = Math.min(meta.size.height - top, Math.ceil(name.height * factor + 100));
  typo.push({ input: title(`${labels[i]} / NAME DETAIL`, 1100), left: 0, top: i * 404 });
  typo.push({ input: await sharp(file(family)).extract({ left, top, width, height }).resize({ width: 1080, height: 350, fit: 'contain', background: bg }).toBuffer(), left: 10, top: i * 404 + 44 });
  const crop = family === 'cinematic' ? { left: 140, top: 1540, width: 760, height: 550 } : family === 'editorial' ? { left: 60, top: 240, width: 760, height: 550 } : { left: 130, top: 1630, width: 760, height: 550 };
  material.push({ input: title(`${labels[i]} / MATERIAL, INK, RULE / 100% PIXELS`, 800), left: 0, top: i * 610 });
  material.push({ input: await sharp(file(family)).extract(crop).toBuffer(), left: 20, top: i * 610 + 44 });
}
await canvas('03-typography-detail.png', 1100, 1212, typo);
await canvas('04-material-detail.png', 800, 1830, material);

const ratioItems = [];
for (let row = 0; row < 3; row++) {
  ratioItems.push({ input: title(labels[row], 1580), left: 0, top: row * 590 });
  for (const [col, ratio] of ['1x1', '4x5', '3x4', '9x16', '16x9'].entries()) {
    ratioItems.push({ input: title(ratio.replace('x', ':'), 300), left: col * 316, top: row * 590 + 44 });
    ratioItems.push({ input: await sharp(file(families[row], 'en', ratio)).resize({ width: 300, height: 490, fit: 'contain', background: bg }).toBuffer(), left: col * 316, top: row * 590 + 88 });
  }
}
await canvas('05-ratio-system.png', 1580, 1770, ratioItems);
const languageItems = [];
for (let row = 0; row < 3; row++) {
  for (const [col, locale] of ['ko', 'en', 'ja'].entries()) {
    languageItems.push({ input: title(`${labels[row]} / ${locale.toUpperCase()}`, 400), left: col * 416, top: row * 560 });
    languageItems.push({ input: await sharp(file(families[row], locale)).resize(400, 500).toBuffer(), left: col * 416, top: row * 560 + 44 });
  }
}
await canvas('06-multilingual.png', 1248, 1680, languageItems);
const beforeAfter = [];
for (let row = 0; row < 3; row++) {
  beforeAfter.push({ input: title(`${labels[row]} / PHASE 2.6.4 (KO)`, 440), left: 0, top: row * 610 });
  beforeAfter.push({ input: title('AWARD PASS (KO)', 440), left: 456, top: row * 610 });
  beforeAfter.push({ input: await sharp(path.resolve(`docs/qa/phase264/${families[row]}-ko-basic-4x5-2x.png`)).resize(440, 550).toBuffer(), left: 0, top: row * 610 + 44 });
  beforeAfter.push({ input: await sharp(file(families[row], 'ko')).resize(440, 550).toBuffer(), left: 456, top: row * 610 + 44 });
}
await canvas('07-before-after.png', 896, 1830, beforeAfter);
await copyFile(path.resolve('docs/qa/icon-fidelity/icon-fidelity-grid.png'), path.join(out, '02-icon-fidelity.png'));
await writeFile(path.join(out, 'board-provenance.json'), JSON.stringify({ source: 'actual renderCardBlob PNGs', typographyDetail: 'display crop fit to review panel; source remains 2160x2700', materialDetail: '100% source pixels', before: 'Phase 2.6.4 retained KO exports; names differ in some supplied fixtures' }, null, 2));
console.log('Created all seven award review boards from saved export pixels.');

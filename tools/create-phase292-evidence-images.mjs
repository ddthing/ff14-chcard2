import fs from 'node:fs/promises';
import sharp from 'sharp';
const names = ['01-upload', '02-ratio-picker', '03-canvas-toolbar', '04-palette', '05-search-picker', '06-inline-confirm', '07-save-export-feedback', '08-mobile-sheet'];
const titles = ['Upload', 'Ratio picker', 'Canvas toolbar', 'Palette', 'Search picker', 'Inline confirmation', 'Save / export feedback', 'Mobile sheet'];
const rows = [];
for (let i = 0; i < names.length; i++) {
  const beforePath = `docs/qa/phase292/before/${names[i]}.png`;
  const afterPath = `docs/qa/phase292/after/${names[i]}.png`;
  const before = await sharp(beforePath).metadata();
  const after = await sharp(afterPath).metadata();
  if (before.width !== after.width || before.height !== after.height) throw new Error(`Viewport mismatch: ${names[i]}`);
  const width = before.width * 2 + 24, height = before.height + 48;
  const header = Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#14191e"/><g fill="#e1e5e9" font-family="sans-serif" font-size="18"><text x="8" y="29">BEFORE · ${titles[i]}</text><text x="${before.width + 24}" y="29">AFTER · ${titles[i]}</text></g></svg>`);
  const output = `docs/qa/phase292/${i === 0 ? '01-upload-before-after' : names[i]}.png`;
  await sharp(header).composite([{ input: beforePath, left: 0, top: 48 }, { input: afterPath, left: before.width + 24, top: 48 }]).png().toFile(output);
  rows.push({ output, before: beforePath, after: afterPath, viewport: { width: before.width, height: before.height } });
}
await fs.writeFile('docs/qa/phase292/screenshot-provenance.json', JSON.stringify(rows, null, 2));
console.log(rows);

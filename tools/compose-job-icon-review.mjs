import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const folder = path.resolve('docs/qa/phase271-icons');
const cases = [['cinematic', 'ko', 'C2 / DRK'], ['editorial', 'en', 'E2 / GNB'], ['id-card', 'ja', 'I3 / WHM']];
const rows = [];
const metadata = [];
for (const [family, locale, label] of cases) {
  const panels = [];
  for (const mode of ['fallback', 'official']) {
    const name = `${family}-${locale}-4x5-${mode}-2x.png`;
    const bytes = await readFile(path.join(folder, name));
    const info = await sharp(bytes).metadata();
    if (info.width !== 2160 || info.height !== 2700) throw new Error(`Unexpected output dimensions: ${name}`);
    metadata.push({ name, width: info.width, height: info.height, bytes: bytes.length });
    panels.push(await sharp(bytes).resize(500, 625).png().toBuffer());
  }
  const heading = Buffer.from(`<svg width="1032" height="52"><rect width="100%" height="100%" fill="#15191e"/><text x="16" y="21" fill="#e2e6ec" font-family="sans-serif" font-size="15">${label}</text><text x="16" y="42" fill="#aab4c0" font-family="sans-serif" font-size="12">FALLBACK / FEATURE FLAG OFF</text><text x="532" y="42" fill="#aab4c0" font-family="sans-serif" font-size="12">OFFICIAL GLYPH / FEATURE FLAG ON</text></svg>`);
  const row = await sharp({ create: { width: 1032, height: 685, channels: 3, background: '#15191e' } })
    .composite([{ input: heading, left: 0, top: 0 }, { input: panels[0], left: 8, top: 52 }, { input: panels[1], left: 524, top: 52 }]).png().toBuffer();
  const outName = `${family === 'id-card' ? 'identity' : family}-icon-review.png`;
  await writeFile(path.join(folder, outName), row);
  rows.push(row);
}
await sharp({ create: { width: 1032, height: 2055, channels: 3, background: '#15191e' } })
  .composite(rows.map((input, index) => ({ input, left: 0, top: 685 * index }))).png().toFile(path.join(folder, 'master-icon-comparison.png'));
await writeFile(path.join(folder, 'export-metadata.json'), JSON.stringify(metadata, null, 2));
console.log('Created three family icon reviews and Master comparison from exact exported PNGs.');

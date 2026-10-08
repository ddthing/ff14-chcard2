import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const output = path.resolve('docs/qa/phase27');
const pairs = [];
for (const viewport of [1440, 1920, 390]) {
  const panels = [];
  for (const stage of ['before', 'after']) {
    const stem = path.join(output, `editor-${stage}-${viewport}`);
    await sharp(`${stem}.jpg`).png().toFile(`${stem}.png`);
    panels.push(await sharp(`${stem}.png`).resize({ width: viewport === 390 ? 390 : 1100 }).png().toBuffer());
  }
  const sizes = await Promise.all(panels.map((panel) => sharp(panel).metadata()));
  const label = Buffer.from(`<svg width="${sizes[0].width * 2 + 24}" height="44"><rect width="100%" height="100%" fill="#16181b"/><text x="16" y="28" fill="#d8dde4" font-family="sans-serif" font-size="15">BEFORE / ${viewport}px</text><text x="${sizes[0].width + 40}" y="28" fill="#d8dde4" font-family="sans-serif" font-size="15">AFTER / ${viewport}px</text></svg>`);
  const composed = await sharp({ create: { width: sizes[0].width * 2 + 24, height: Math.max(...sizes.map((size) => size.height)) + 44, channels: 3, background: '#16181b' } })
    .composite([{ input: label, top: 0, left: 0 }, { input: panels[0], top: 44, left: 0 }, { input: panels[1], top: 44, left: sizes[0].width + 24 }]).png().toBuffer();
  await writeFile(path.join(output, `editor-comparison-${viewport}.png`), composed);
  if (viewport !== 1920) pairs.push(composed);
}
const pairSizes = await Promise.all(pairs.map((pair) => sharp(pair).metadata()));
await sharp({ create: { width: Math.max(...pairSizes.map((size) => size.width)), height: pairSizes.reduce((sum, size) => sum + size.height, 0) + 24, channels: 3, background: '#16181b' } })
  .composite([{ input: pairs[0], top: 0, left: 0 }, { input: pairs[1], top: pairSizes[0].height + 24, left: 0 }]).png().toFile(path.join(output, 'editor-comparison.png'));

const frozen = [];
for (const file of ['frozen-card-files.json', 'frozen-render-files.json']) {
  const baseline = JSON.parse((await readFile(path.join(output, file), 'utf8')).replace(/^\uFEFF/, ''));
  for (const entry of baseline) {
    const hash = createHash('sha256').update(await readFile(entry.Path)).digest('hex').toUpperCase();
    frozen.push({ path: entry.Path, unchanged: hash === entry.SHA256 });
  }
}
await writeFile(path.join(output, 'freeze-verification.json'), JSON.stringify(frozen, null, 2));
if (frozen.some((entry) => !entry.unchanged)) throw new Error('Frozen card sources changed during Editor polish.');
console.log(`Created Editor comparisons; ${frozen.length} frozen card/render/spec files unchanged.`);

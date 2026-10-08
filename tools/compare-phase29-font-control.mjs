import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'docs/qa/phase29/visual');
await fs.mkdir(path.join(dir, 'font-fallback-control'), { recursive: true });
const rows = [];
for (const family of ['cinematic', 'editorial', 'id-card']) for (const locale of ['latin', 'ko', 'ja']) {
  const stem = `${family}-${locale}-4x5-2x`;
  const filename = `qa-lab-${stem}.png`;
  const control = path.join(dir, 'font-fallback-control', filename);
  await fs.copyFile(path.join(dir, filename), control);
  const a = await sharp(path.join(dir, 'optimized', filename)).ensureAlpha().raw().toBuffer();
  const b = await sharp(control).ensureAlpha().raw().toBuffer();
  let changedPixels = 0, sum = 0, maximum = 0;
  for (let i = 0; i < a.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(a[i + c] - b[i + c]);
      sum += delta; maximum = Math.max(maximum, delta); changed ||= delta !== 0;
    }
    changedPixels += Number(changed);
  }
  rows.push({ stem, changedPixels, totalPixels: a.length / 4, meanAbsoluteChannelDifference: sum / a.length, maxChannelDifference: maximum, exactPixelParity: changedPixels === 0 });
  await fs.copyFile(path.join(dir, 'optimized', filename), path.join(dir, filename));
}
const report = { generatedAt: new Date().toISOString(), method: 'Same browser, card data and renderer: optimized font CSS compared with an explicitly disabled helper using the original full stylesheet scan. Temporary control removed before normal build.', rows, exactParityCount: rows.filter(r => r.exactPixelParity).length };
await fs.writeFile(path.join(dir, 'font-control-comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

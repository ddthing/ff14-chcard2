import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/phase210');
const rows = [];
for (const family of ['cinematic', 'editorial', 'id-card']) {
  for (const locale of ['latin', 'ko', 'ja']) {
    const stem = `${family}-${locale}-4x5-2x`;
    const reference = `docs/qa/typography-lock/exports/${stem}.png`;
    const candidate = `docs/qa/phase210/visual/qa-lab-${stem}.png`;
    const a = await sharp(path.join(root, reference)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(path.join(root, candidate)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (a.info.width !== b.info.width || a.info.height !== b.info.height || a.data.length !== b.data.length) throw new Error(`Size mismatch: ${stem}`);
    let changedPixels = 0, sum = 0, maximum = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      let changed = false;
      for (let c = 0; c < 4; c++) {
        const delta = Math.abs(a.data[i + c] - b.data[i + c]);
        sum += delta; maximum = Math.max(maximum, delta); changed ||= delta !== 0;
      }
      changedPixels += Number(changed);
    }
    rows.push({ stem, reference, candidate, width: a.info.width, height: a.info.height, changedPixels, totalPixels: a.info.width * a.info.height, meanAbsoluteChannelDifference: sum / a.data.length, maxChannelDifference: maximum, exactPixelParity: changedPixels === 0 });
  }
}
const report = { generatedAt: new Date().toISOString(), method: 'Decoded RGBA against immutable Phase 2.7.8 references, no perceptual tolerance.', rows, exactParityCount: rows.filter(r => r.exactPixelParity).length };
await fs.writeFile(path.join(out, 'visual/pixel-comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.exactParityCount !== rows.length) process.exitCode = 1;


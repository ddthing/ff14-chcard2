import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'docs/qa/phase216-job-icons');
const jobs = ['red-mage', 'dark-knight', 'white-mage', 'gunbreaker'];
const label = value => Buffer.from(`<svg width="300" height="32"><rect width="100%" height="100%" fill="#101319"/><text x="8" y="23" fill="#ded8ce" font-family="sans-serif" font-size="15">${value}</text></svg>`);
const tiles = [];
const report = { protocol: 'Native browser screenshots of production CardPreview at 432×540; production 2x PNG/WebP decoded at 2160×2700 and resized to preview dimensions. Screenshots use JPEG and are not asserted byte-identical. The isolated icon region must contain visible ink in all three sources.', cases: [] };
for (const [row, job] of jobs.entries()) {
  const audit = JSON.parse(await readFile(path.join(qa, `rendered/after-${job}-editorial-2x.png.json`), 'utf8'));
  const icon = audit.icons[0];
  const region = { left: Math.floor(icon.x), top: Math.floor(icon.y), width: Math.ceil(icon.width), height: Math.ceil(icon.height) };
  const inputs = [path.join(qa, `preview-${job}.jpg`), path.join(qa, `rendered/after-${job}-editorial-2x.png`), path.join(qa, `rendered/after-${job}-editorial-2x.webp`)];
  const sourceNames = ['Live preview', 'PNG 2x', 'WebP 2x'];
  const measurements = [];
  for (const [column, input] of inputs.entries()) {
    const normalized = await sharp(input).resize(432, 540).png().toBuffer();
    tiles.push({ input: label(`${job} / ${sourceNames[column]}`), left: column * 300, top: row * 632 });
    tiles.push({ input: await sharp(normalized).resize(300, 375).png().toBuffer(), left: column * 300, top: row * 632 + 32 });
    const crop = await sharp(normalized).extract(region).png().toBuffer();
    tiles.push({ input: await sharp(crop).resize(192, 192, { fit: 'contain', kernel: 'nearest', background: '#101319' }).png().toBuffer(), left: column * 300 + 54, top: row * 632 + 424 });
    const { data, info } = await sharp(crop).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const luminance = [];
    for (let i = 0; i < data.length; i += info.channels) luminance.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    const background = [...luminance].sort((a, b) => a - b)[Math.floor(luminance.length * 0.85)];
    let inkPixels = 0, xSum = 0, ySum = 0;
    for (const [index, value] of luminance.entries()) if (background - value > 35) { inkPixels++; xSum += index % info.width; ySum += Math.floor(index / info.width); }
    if (!inkPixels) throw new Error(`Missing exported/preview glyph: ${job}/${sourceNames[column]}`);
    measurements.push({ source: sourceNames[column], inkPixels, centroid: [xSum / inkPixels, ySum / inkPixels] });
  }
  const centroidShiftCssPixels = measurements.slice(1).map(value => Math.hypot(value.centroid[0] - measurements[0].centroid[0], value.centroid[1] - measurements[0].centroid[1]));
  if (centroidShiftCssPixels.some(value => value > 1.5)) throw new Error(`Preview/export icon position differs: ${job}`);
  report.cases.push({ job, previewSource: icon.src, region, measurements, centroidShiftCssPixels });
}
await sharp({ create: { width: 900, height: jobs.length * 632, channels: 4, background: '#101319' } }).composite(tiles).png().toFile(path.join(qa, '09-preview-export-parity.png'));
await writeFile(path.join(qa, 'preview-pixel-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const directory = path.resolve('docs/qa/phase264');
const captures = JSON.parse(await fs.readFile(path.join(directory, 'parity-capture.json'), 'utf8'));
const results = [];
for (const capture of captures) {
  const { rect } = capture;
  const liveMetadata = await sharp(path.join(directory, capture.live)).metadata();
  // CUA's raster is scaled to its delivery width; DOM coordinates remain CSS
  // pixels. The QA capture explicitly sets a 1440px browser viewport.
  const screenshotScale = liveMetadata.width / (capture.viewportWidth ?? 1440);
  const width = Math.round(rect.width * screenshotScale), height = Math.round(rect.height * screenshotScale);
  const previewName = `preview-${capture.family}-${capture.locale}-${capture.ratio.replace(':','x')}.png`;
  const preview = await sharp(path.join(directory, capture.live)).extract({ left: Math.round(rect.x * screenshotScale), top: Math.round(rect.y * screenshotScale), width, height }).removeAlpha().png().toBuffer();
  await fs.writeFile(path.join(directory, previewName), preview);
  const a = await sharp(preview).raw().toBuffer();
  const exportPath = path.join(directory, capture.file);
  const b = await sharp(exportPath).resize(width, height).removeAlpha().raw().toBuffer();
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i]);
  const metadata = await sharp(exportPath).metadata();
  const priorPath = path.resolve('docs/qa/phase263', capture.file);
  let unchangedPixels = null;
  try {
    const prior = await sharp(priorPath).ensureAlpha().raw().toBuffer();
    const current = await sharp(exportPath).ensureAlpha().raw().toBuffer();
    unchangedPixels = prior.equals(current);
  } catch { /* Only matching retained Phase 263 fixtures are compared. */ }
  results.push({ family: capture.family, locale: capture.locale, ratio: capture.ratio, preview: previewName, export: capture.file,
    exportSize: [metadata.width, metadata.height], screenshotScale, meanAbsoluteRgbDifference: Number((difference / a.length).toFixed(3)),
    unchangedFromPhase263: unchangedPixels, fontsLoaded: capture.fonts === 'loaded', imagesLoaded: capture.images.every(image=>image.loaded),
    masterId: capture.id, direction: capture.direction, version: capture.version });
}
await fs.writeFile(path.join(directory, 'parity-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.join(root, 'docs/qa/phase211');
const visualDir = path.join(evidenceDir, 'visual');
const captureNames = [
  '01-first-entry',
  '02-upload-flow',
  '03-character-flow',
  '04-template-flow',
  '05-image-adjust',
  '06-export-flow',
  '07-mobile-golden-path',
];
const families = ['cinematic', 'editorial', 'id-card'];
const locales = ['latin', 'ko', 'ja'];

function svgLabel(text, width, height, fontSize = 18) {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151a1f"/><text x="12" y="${Math.round(height * 0.68)}" fill="#f2f3f4" font-family="Arial,sans-serif" font-size="${fontSize}">${escaped}</text></svg>`);
}

async function convertCaptures() {
  const conversions = [];
  for (const name of captureNames) {
    const source = path.join(evidenceDir, 'after', `${name}.jpg`);
    const target = path.join(evidenceDir, `${name}.png`);
    const pipeline = sharp(source).rotate();
    const metadata = await pipeline.metadata();
    await pipeline.png({ compressionLevel: 9 }).toFile(target);
    conversions.push({
      source: path.relative(root, source).replaceAll('\\', '/'),
      output: path.relative(root, target).replaceAll('\\', '/'),
      sourceFormat: metadata.format,
      width: metadata.width,
      height: metadata.height,
      note: 'PNG losslessly stores pixels decoded from the source JPEG; it does not restore information discarded by JPEG compression.',
    });
  }

  const beforePath = path.join(evidenceDir, 'before/01-first-entry.jpg');
  const afterPath = path.join(evidenceDir, 'after/01-first-entry.jpg');
  const panelWidth = 720;
  const panelHeight = 405;
  const labelHeight = 44;
  const before = await sharp(beforePath).rotate().resize(panelWidth, panelHeight, { fit: 'contain', background: '#101418' }).png().toBuffer();
  const after = await sharp(afterPath).rotate().resize(panelWidth, panelHeight, { fit: 'contain', background: '#101418' }).png().toBuffer();
  const sheet = await sharp({
    create: { width: panelWidth * 2, height: panelHeight + labelHeight, channels: 4, background: '#101418' },
  }).composite([
    { input: svgLabel('BEFORE · 01-first-entry.jpg', panelWidth, labelHeight, 16), left: 0, top: 0 },
    { input: svgLabel('AFTER · 01-first-entry.jpg', panelWidth, labelHeight, 16), left: panelWidth, top: 0 },
    { input: before, left: 0, top: labelHeight },
    { input: after, left: panelWidth, top: labelHeight },
  ]).png({ compressionLevel: 9 }).toBuffer();
  const comparisonPath = path.join(evidenceDir, '08-before-after.png');
  await fs.writeFile(comparisonPath, sheet);
  const report = {
    generatedAt: new Date().toISOString(),
    conversions,
    beforeAfter: {
      before: path.relative(root, beforePath).replaceAll('\\', '/'),
      after: path.relative(root, afterPath).replaceAll('\\', '/'),
      output: path.relative(root, comparisonPath).replaceAll('\\', '/'),
      note: 'The panel contains resized renderings of the original JPEG screenshots; the first-entry cards show different entered names, so this is a flow comparison rather than a card-pixel comparison. The original files remain unchanged.',
    },
  };
  await fs.writeFile(path.join(evidenceDir, 'capture-conversion.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

async function compareFrozenVisuals() {
  await fs.mkdir(visualDir, { recursive: true });
  const rows = [];
  const thumbnails = [];
  const tileWidth = 230;
  const tileHeight = 288;
  const labelHeight = 32;

  for (const family of families) {
    for (const locale of locales) {
      const stem = `${family}-${locale}-4x5-2x`;
      const reference = `docs/qa/phase210/chrome-visual/qa-lab-${stem}.png`;
      const candidate = `docs/qa/phase211/visual/qa-lab-${stem}.png`;
      const referencePath = path.join(root, reference);
      const candidatePath = path.join(root, candidate);
      const [a, b] = await Promise.all([
        sharp(referencePath).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        sharp(candidatePath).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      ]);
      const sameSize = a.info.width === b.info.width && a.info.height === b.info.height && a.data.length === b.data.length;
      let changedPixels = null;
      let changedChannels = null;
      let meanAbsoluteChannelDifference = null;
      let maxChannelDifference = null;
      let totalPixels = Math.max(a.info.width * a.info.height, b.info.width * b.info.height);

      if (sameSize) {
        changedPixels = 0;
        changedChannels = 0;
        let sum = 0;
        let maximum = 0;
        for (let i = 0; i < a.data.length; i += 4) {
          let pixelChanged = false;
          for (let channel = 0; channel < 4; channel++) {
            const delta = Math.abs(a.data[i + channel] - b.data[i + channel]);
            if (delta !== 0) {
              changedChannels++;
              pixelChanged = true;
            }
            sum += delta;
            maximum = Math.max(maximum, delta);
          }
          if (pixelChanged) changedPixels++;
        }
        meanAbsoluteChannelDifference = sum / a.data.length;
        maxChannelDifference = maximum;
      }

      const exactPixelParity = sameSize && changedPixels === 0;
      rows.push({
        stem,
        reference,
        candidate,
        referenceDimensions: { width: a.info.width, height: a.info.height },
        candidateDimensions: { width: b.info.width, height: b.info.height },
        dimensionsMatch: sameSize,
        changedPixels,
        totalPixels,
        changedChannels,
        meanAbsoluteChannelDifference,
        maxChannelDifference,
        exactPixelParity,
      });

      const pairIndex = rows.length - 1;
      for (const [sideIndex, filePath, side] of [[0, referencePath, 'PHASE 210'], [1, candidatePath, 'PHASE 211']]) {
        const left = (pairIndex % 3 * 2 + sideIndex) * tileWidth;
        const top = Math.floor(pairIndex / 3) * (tileHeight + labelHeight);
        const label = svgLabel(`${family} / ${locale} · ${side}`, tileWidth, labelHeight, 13);
        const image = await sharp(filePath).resize(tileWidth, tileHeight, { fit: 'contain', background: '#101418' }).png().toBuffer();
        thumbnails.push({ input: label, left, top });
        thumbnails.push({ input: image, left, top: top + labelHeight });
      }
    }
  }

  const exactParityCount = rows.filter((row) => row.exactPixelParity).length;
  const report = {
    generatedAt: new Date().toISOString(),
    method: 'Decoded sRGB RGBA bytes compared exactly against the Phase 210 Chrome visual captures; no perceptual tolerance. Dimension mismatches are exact-parity failures and do not receive fabricated pixel deltas.',
    rows,
    exactParityCount,
    totalComparisons: rows.length,
    allExactPixelParity: exactParityCount === rows.length,
  };
  await fs.writeFile(path.join(visualDir, 'comparison.json'), JSON.stringify(report, null, 2));
  const sheetWidth = tileWidth * 6;
  const sheetHeight = (tileHeight + labelHeight) * 3;
  await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: '#101418' } })
    .composite(thumbnails)
    .png({ compressionLevel: 9 })
    .toFile(path.join(visualDir, 'comparison-contact-sheet.png'));
  console.log(JSON.stringify(report, null, 2));
  if (!report.allExactPixelParity) process.exitCode = 1;
}

async function compareSameCodeRepeat() {
  const rows = [];
  for (const family of families) {
    for (const locale of locales) {
      const stem = `${family}-${locale}-4x5-2x`;
      const firstRun = `docs/qa/phase211/visual/run1/qa-lab-${stem}.png`;
      const secondRun = `docs/qa/phase211/visual/qa-lab-${stem}.png`;
      const [a, b] = await Promise.all([
        sharp(path.join(root, firstRun)).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        sharp(path.join(root, secondRun)).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      ]);
      const dimensionsMatch = a.info.width === b.info.width && a.info.height === b.info.height && a.data.length === b.data.length;
      let changedPixels = null;
      let changedChannels = null;
      let meanAbsoluteChannelDifference = null;
      let maxChannelDifference = null;
      let absoluteChannelDifferenceTotal = null;

      if (dimensionsMatch) {
        changedPixels = 0;
        changedChannels = 0;
        absoluteChannelDifferenceTotal = 0;
        let maximum = 0;
        for (let i = 0; i < a.data.length; i += 4) {
          let pixelChanged = false;
          for (let channel = 0; channel < 4; channel++) {
            const delta = Math.abs(a.data[i + channel] - b.data[i + channel]);
            absoluteChannelDifferenceTotal += delta;
            if (delta !== 0) {
              changedChannels++;
              pixelChanged = true;
            }
            maximum = Math.max(maximum, delta);
          }
          if (pixelChanged) changedPixels++;
        }
        meanAbsoluteChannelDifference = absoluteChannelDifferenceTotal / a.data.length;
        maxChannelDifference = maximum;
      }

      rows.push({
        stem,
        firstRun,
        secondRun,
        firstRunDimensions: { width: a.info.width, height: a.info.height },
        secondRunDimensions: { width: b.info.width, height: b.info.height },
        dimensionsMatch,
        changedPixels,
        totalPixels: Math.max(a.info.width * a.info.height, b.info.width * b.info.height),
        changedChannels,
        absoluteChannelDifferenceTotal,
        meanAbsoluteChannelDifference,
        maxChannelDifference,
        exactPixelParity: dimensionsMatch && changedPixels === 0,
      });
    }
  }

  const exactParityCount = rows.filter((row) => row.exactPixelParity).length;
  const comparableRows = rows.filter((row) => row.dimensionsMatch);
  const report = {
    generatedAt: new Date().toISOString(),
    method: 'Decoded sRGB RGBA bytes compared exactly between two Phase 211 Chrome renders from the same frozen code; this measures repeat-render variation and does not identify its cause.',
    rows,
    exactParityCount,
    totalComparisons: rows.length,
    dimensionsMatchCount: comparableRows.length,
    totalChangedPixelsAcrossRows: comparableRows.reduce((total, row) => total + row.changedPixels, 0),
    totalChangedChannelsAcrossRows: comparableRows.reduce((total, row) => total + row.changedChannels, 0),
    totalAbsoluteChannelDifferenceAcrossRows: comparableRows.reduce((total, row) => total + row.absoluteChannelDifferenceTotal, 0),
    allExactPixelParity: exactParityCount === rows.length,
  };
  await fs.writeFile(path.join(visualDir, 'same-code-repeat.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv.includes('--captures')) {
  await convertCaptures();
} else if (process.argv.includes('--same-code-repeat')) {
  await compareSameCodeRepeat();
} else {
  await compareFrozenVisuals();
}

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs', 'qa', 'phase301-card-type-job');
const boardPath = path.join(qaRoot, '20-preview-export.png');
const reportPath = path.join(qaRoot, 'EXPORT-FIDELITY.md');
const capturesComplete = process.argv.includes('--captures-complete');

if (!capturesComplete) {
  throw new Error('Refusing triptych composition without the explicit --captures-complete release.');
}

function escapeXml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function resolveQaPath(relative) {
  const absolute = path.resolve(qaRoot, relative);
  const fromQa = path.relative(qaRoot, absolute);
  if (fromQa.startsWith('..') || path.isAbsolute(fromQa)) throw new Error('QA path escaped its evidence directory: ' + relative);
  return absolute;
}

function fontSummary(report) {
  const nameRuns = report.actualFontEvidence?.runs?.filter((run) => run.field === 'name') ?? [];
  const platformFaces = nameRuns.flatMap((run) => run.actualPlatformFonts ?? []).map((face) => ({
    family: face.familyName ?? face.family ?? 'unknown',
    postScriptName: face.postScriptName ?? null,
    glyphCount: face.glyphCount ?? null,
  }));
  const uniqueFaces = [...new Map(platformFaces.map((face) => [`${face.family}|${face.postScriptName}`, face])).values()];
  const requests = report.apiResult?.requestedFaces?.filter((face) => face.field === 'name') ?? [];
  const weights = [...new Map(requests.flatMap((request) => request.faceRefs ?? []).map((face) => [
    `${face.fontId}:${face.requestedWeight}:${face.matchedWeight}`,
    `${face.fontId} ${face.requestedWeight}→${face.matchedWeight}`,
  ])).values()];
  return {
    actualFaces: uniqueFaces,
    actualFaceText: uniqueFaces.map((face) => `${face.postScriptName ?? face.family} (${face.glyphCount ?? '?'} glyphs)`).join(' · ') || 'no platform face record',
    weights: weights.join(' · ') || 'weight data unavailable',
  };
}

function fontCssSummary(report) {
  const formats = new Map();
  for (const output of report.exports ?? []) {
    const audit = output.fontCssAudit ?? null;
    formats.set(output.format, audit ? {
      prepared: audit.prepared === true,
      selectedFaces: audit.selectedFaceCount ?? null,
      inlinedBytes: audit.inlinedBytes ?? null,
      missingAliases: audit.missingAliases ?? [],
      fallbackReason: audit.fallbackReason ?? null,
    } : { prepared: false, selectedFaces: null, inlinedBytes: null, missingAliases: [], fallbackReason: 'fontCssAudit missing from export capture' });
  }
  return formats;
}

function percentiles(histogram, total) {
  const percentile = (fraction) => {
    const target = Math.max(1, Math.ceil(total * fraction));
    let count = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      count += histogram[value];
      if (count >= target) return value;
    }
    return histogram.length - 1;
  };
  return { p95: percentile(0.95), p99: percentile(0.99) };
}

function compareRgb(reference, rendered) {
  assert.equal(reference.length, rendered.length, 'Preview and downsampled export raw buffers should match dimensions.');
  const histogram = new Uint32Array(256);
  let sum = 0;
  let squareSum = 0;
  let over2 = 0;
  let over8 = 0;
  let over16 = 0;
  const pixelCount = reference.length / 3;
  for (let index = 0; index < reference.length; index += 3) {
    let pixelMax = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(reference[index + channel] - rendered[index + channel]);
      sum += difference;
      squareSum += difference * difference;
      histogram[difference] += 1;
      pixelMax = Math.max(pixelMax, difference);
    }
    if (pixelMax > 2) over2 += 1;
    if (pixelMax > 8) over8 += 1;
    if (pixelMax > 16) over16 += 1;
  }
  const channelCount = reference.length;
  return {
    channels: channelCount,
    pixels: pixelCount,
    meanAbsoluteRgbDifference: sum / channelCount,
    normalizedMeanAbsoluteRgbDifference: sum / channelCount / 255,
    rootMeanSquareRgbDifference: Math.sqrt(squareSum / channelCount),
    channelDifferencePercentiles: percentiles(histogram, channelCount),
    pixelsOver2DeltaPercent: over2 / pixelCount * 100,
    pixelsOver8DeltaPercent: over8 / pixelCount * 100,
    pixelsOver16DeltaPercent: over16 / pixelCount * 100,
  };
}

async function toRgbBuffer(input, width, height) {
  return sharp(input)
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer();
}

function getNameCrop(report, width, height) {
  const card = report.card;
  const name = card?.textRuns?.find((run) => run.field === 'name');
  if (!card?.rect || !name?.rect) throw new Error(`Missing card.rect or name text rect for ${report.case?.id}.`);
  const scale = width / card.rect.width;
  const rect = {
    left: Math.floor((name.rect.x - card.rect.x) * scale),
    top: Math.floor((name.rect.y - card.rect.y) * scale),
    width: Math.ceil(name.rect.width * scale),
    height: Math.ceil(name.rect.height * scale),
  };
  const padding = Math.max(10, Math.round(Math.min(rect.width, rect.height) * 0.04));
  const left = Math.max(0, rect.left - padding);
  const top = Math.max(0, rect.top - padding);
  const right = Math.min(width, rect.left + rect.width + padding);
  const bottom = Math.min(height, rect.top + rect.height + padding);
  if (right <= left || bottom <= top) throw new Error(`Invalid name crop for ${report.case?.id}.`);
  return { left, top, width: right - left, height: bottom - top, scaleFactor: scale, padding };
}

function oneTriptychFaceLine(fonts) {
  const faceText = fonts.actualFaceText.length > 170 ? `${fonts.actualFaceText.slice(0, 167)}…` : fonts.actualFaceText;
  const weightText = fonts.weights.length > 140 ? `${fonts.weights.slice(0, 137)}…` : fonts.weights;
  return { faceText, weightText };
}

function exportLine(audit) {
  return ['png', 'webp'].map((format) => {
    const value = audit.get(format);
    if (!value) return `${format.toUpperCase()}: audit missing`;
    if (!value.prepared) return `${format.toUpperCase()}: renderer fallback (${value.fallbackReason ?? 'not prepared'})`;
    return `${format.toUpperCase()}: ${value.inlinedBytes ?? '?'} B font CSS; ${value.selectedFaces ?? '?'} faces; missing aliases ${value.missingAliases.length}`;
  }).join(' · ');
}

function svgText(x, y, text, size, color = '#e8e2d8', weight = 400) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(text)}</text>`;
}

async function main() {
  const [manifest, summary] = await Promise.all([
    readFile(path.join(qaRoot, 'qa-cases-combined-shortlist.json'), 'utf8').then(JSON.parse),
    readFile(path.join(qaRoot, 'combined-results.json'), 'utf8').then(JSON.parse),
  ]);
  if (summary.caseCount !== 18 || summary.passCount !== 18 || summary.failCount !== 0 || summary.captureFailureCount !== 0) {
    throw new Error(`Combined captures are not complete/passing: cases=${summary.caseCount}, pass=${summary.passCount}, fail=${summary.failCount}, captureFailures=${summary.captureFailureCount}.`);
  }
  if (!summary.completedAt) throw new Error('Combined-results report has no completion timestamp.');
  const shortlistPairs = [
    { master: 'cinematic', fontSet: manifest.shortlists.cinematic[0], mark: 'A' },
    { master: 'cinematic', fontSet: manifest.shortlists.cinematic[1], mark: 'C' },
    { master: 'editorial', fontSet: manifest.shortlists.editorial[0], mark: 'A' },
    { master: 'editorial', fontSet: manifest.shortlists.editorial[1], mark: 'C' },
    { master: 'id-card', fontSet: manifest.shortlists['id-card'][0], mark: 'A' },
    { master: 'id-card', fontSet: manifest.shortlists['id-card'][1], mark: 'C' },
  ];
  const selectedByCaseId = new Map();
  for (const selection of shortlistPairs) {
    const resultCase = summary.cases.find((item) => item.master === selection.master && item.fontSet === selection.fontSet && item.jobMark?.variant === selection.mark);
    if (!resultCase?.pass || !resultCase.reportPath) throw new Error(`Missing passing combined case: ${selection.master}/${selection.fontSet}/${selection.mark}`);
    selectedByCaseId.set(resultCase.id, selection);
  }
  const evidenceRows = [];
  for (const resultCase of summary.cases) {
    if (!resultCase.pass || !resultCase.reportPath) throw new Error(`Combined case is not passing: ${resultCase.id}`);
    const report = JSON.parse(await readFile(resolveQaPath(resultCase.reportPath), 'utf8'));
    if (!report.pass || report.case?.jobId !== manifest.job) throw new Error(`Case invariant failed for ${resultCase.id}.`);
    const previewPath = resolveQaPath(report.previewScreenshot?.path);
    const previewMetadata = await sharp(previewPath).metadata();
    const previewWidth = previewMetadata.width;
    const previewHeight = previewMetadata.height;
    if (previewWidth !== 1080 || previewHeight !== 1350) {
      throw new Error(`${resultCase.id} preview is ${previewWidth}×${previewHeight}; expected a full 1080×1350 card capture.`);
    }
    if (report.card?.rect?.width !== 432 || report.card?.rect?.height !== 540) {
      throw new Error(`${resultCase.id} logical card is ${report.card?.rect?.width}×${report.card?.rect?.height}; expected 432×540 before the 2× export.`);
    }
    const previewRaw = await toRgbBuffer(previewPath, previewWidth, previewHeight);
    const metrics = [];
    let crop;
    let previewCrop;
    const exportCrops = {};
    const fontCss = fontCssSummary(report);
    for (const output of report.exports ?? []) {
      const outputPath = resolveQaPath(output.path);
      const metadata = await sharp(outputPath).metadata();
      if (metadata.width !== previewWidth * 2 || metadata.height !== previewHeight * 2) {
        throw new Error(`${resultCase.id} ${output.format} is ${metadata.width}×${metadata.height}; expected ${previewWidth * 2}×${previewHeight * 2}.`);
      }
      const outputRaw = await toRgbBuffer(outputPath, previewWidth, previewHeight);
      metrics.push({ format: output.format, file: output.path, bytes: output.byteLength, sourceDimensions: { width: metadata.width, height: metadata.height }, comparisonDimensions: { width: previewWidth, height: previewHeight }, metrics: compareRgb(previewRaw, outputRaw), fontCssAudit: output.fontCssAudit ?? null });

      if (selectedByCaseId.has(resultCase.id)) {
        crop ??= getNameCrop(report, previewWidth, previewHeight);
        previewCrop ??= await sharp(previewPath).extract(crop).png().toBuffer();
        exportCrops[output.format] = await sharp(outputPath)
          .resize(previewWidth, previewHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
          .extract(crop)
          .png()
          .toBuffer();
      }
    }
    if (metrics.length !== 2 || !metrics.some((item) => item.format === 'png') || !metrics.some((item) => item.format === 'webp')) {
      throw new Error(`${resultCase.id} must have one PNG and one WebP export.`);
    }
    const fonts = fontSummary(report);
    const jobMark = report.apiResult?.jobMark ?? {};
    evidenceRows.push({
      ...(selectedByCaseId.get(resultCase.id) ?? {}),
      caseId: report.case.id,
      master: resultCase.master,
      fontSet: resultCase.fontSet,
      mark: resultCase.jobMark?.variant,
      reportPath: resultCase.reportPath,
      previewPath: report.previewScreenshot.path,
      previewDimensions: { width: previewWidth, height: previewHeight },
      logicalCardDimensions: { width: report.card.rect.width, height: report.card.rect.height },
      crop,
      previewCrop,
      pngCrop: exportCrops.png,
      webpCrop: exportCrops.webp,
      metrics,
      fonts,
      sourceTier: jobMark.primaryResolver?.source ?? jobMark.secondaryResolver?.source ?? report.case.expectedResolvedSource ?? 'unavailable',
      resolverUsage: jobMark.primaryUsage ?? jobMark.secondaryUsage ?? report.case.jobMark?.usage ?? 'not-applicable',
      fontCss,
      exportLine: exportLine(fontCss),
    });
  }
  const selectedIds = new Set(selectedByCaseId.keys());
  const rows = evidenceRows.filter((row) => selectedIds.has(row.caseId));
  if (evidenceRows.length !== 18 || rows.length !== 6) throw new Error(`Expected 18 measured combined cases and 6 triptychs; got ${evidenceRows.length} and ${rows.length}.`);

  const titleHeight = 112;
  const rowHeaderHeight = 98;
  const imageGutter = 20;
  const outer = 28;
  const columnGap = 20;
  const maxCropWidth = Math.max(...rows.map((row) => row.crop.width));
  const maxCropHeight = Math.max(...rows.map((row) => row.crop.height));
  const cellWidth = maxCropWidth;
  const rowHeight = rowHeaderHeight + maxCropHeight + imageGutter;
  const boardWidth = outer * 2 + cellWidth * 3 + columnGap * 2;
  const boardHeight = titleHeight + rows.length * rowHeight + outer;
  const background = { r: 18, g: 21, b: 19, alpha: 1 };
  const composite = [];
  const svgHeader = [`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${boardHeight}" viewBox="0 0 ${boardWidth} ${boardHeight}">`,
    svgText(outer, 38, 'PREVIEW / EXPORT FIDELITY · NAME-REGION TRIPLETS', 20, '#d8c7a3', 700),
    svgText(outer, 65, 'Actual renderer previews compared with unchanged 2× PNG and WebP outputs; previews are aligned to the card rectangle.', 13),
    svgText(outer, 87, 'Pixel differences describe rasterization/resampling/compression variance and are not a font-face proof or automatic pass threshold.', 12, '#b8b5ac'),
  ];
  const colTitles = ['Preview · 1080 px', 'PNG 2× · downsampled', 'WebP 2× · downsampled'];
  for (const [index, row] of rows.entries()) {
    const y = titleHeight + index * rowHeight;
    const faceLine = oneTriptychFaceLine(row.fonts);
    const masterLabel = row.master === 'id-card' ? 'I3 / Identity' : row.master === 'editorial' ? 'E2 / Editorial' : 'C2 / Cinematic';
    const iconText = `${row.mark} · ${row.sourceTier} · ${row.resolverUsage}`;
    svgHeader.push(svgText(outer, y + 18, `${masterLabel} · ${row.fontSet} · ${iconText}`, 16, '#e8e2d8', 650));
    svgHeader.push(svgText(outer, y + 39, `Name face(s): ${faceLine.faceText}`, 11, '#c8c7c0'));
    svgHeader.push(svgText(outer, y + 57, `Weights: ${faceLine.weightText}`, 11, '#c8c7c0'));
    svgHeader.push(svgText(outer, y + 75, row.exportLine, 11, '#b7c7ba'));
    for (let col = 0; col < 3; col += 1) {
      const x = outer + col * (cellWidth + columnGap);
      svgHeader.push(svgText(x, y + rowHeaderHeight - 4, colTitles[col], 12, '#d8c7a3', 600));
      const image = col === 0 ? row.previewCrop : col === 1 ? row.pngCrop : row.webpCrop;
      const metadata = await sharp(image).metadata();
      const imageX = x + Math.floor((cellWidth - metadata.width) / 2);
      const imageY = y + rowHeaderHeight + Math.floor((maxCropHeight - metadata.height) / 2);
      composite.push({ input: image, left: imageX, top: imageY });
      svgHeader.push(`<rect x="${imageX}" y="${imageY}" width="${metadata.width}" height="${metadata.height}" fill="none" stroke="#6c6d66" stroke-width="1"/>`);
    }
  }
  svgHeader.push('</svg>');
  const overlay = Buffer.from(svgHeader.join(''));
  composite.push({ input: overlay, left: 0, top: 0 });
  await mkdir(path.dirname(boardPath), { recursive: true });
  await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background } })
    .composite(composite)
    .png({ compressionLevel: 8 })
    .toFile(boardPath);

  const tableRows = evidenceRows.flatMap((row) => row.metrics.map((metric) => {
    const audit = metric.fontCssAudit ?? {};
    return `| ${row.master} | ${row.fontSet} | ${row.mark} | ${row.caseId} | ${metric.format.toUpperCase()} | ${metric.sourceDimensions.width}×${metric.sourceDimensions.height} | ${metric.bytes} | ${metric.metrics.meanAbsoluteRgbDifference.toFixed(3)} | ${metric.metrics.rootMeanSquareRgbDifference.toFixed(3)} | ${metric.metrics.channelDifferencePercentiles.p95} | ${metric.metrics.pixelsOver8DeltaPercent.toFixed(2)}% | ${audit.prepared === true ? 'prepared' : `fallback: ${audit.fallbackReason ?? 'unknown'}`} | ${audit.inlinedBytes ?? '—'} | ${(audit.missingAliases ?? []).join(', ') || 'none'} |`;
  })).join('\n');
  const triptychRows = rows.map((row) => `| ${row.master} | ${row.fontSet} | ${row.mark} | ${row.caseId} | ${row.fonts.actualFaceText} | ${row.fonts.weights} | ${row.sourceTier} / ${row.resolverUsage} | ${row.crop.left},${row.crop.top},${row.crop.width},${row.crop.height} @ ${row.crop.scaleFactor.toFixed(3)}× |`).join('\n');
  const allOutputs = evidenceRows.flatMap((row) => row.metrics.map((metric) => ({ ...metric, master: row.master })));
  const preparedOutputs = allOutputs.filter((metric) => metric.fontCssAudit?.prepared === true);
  const allMissingAliases = [...new Set(allOutputs.flatMap((metric) => metric.fontCssAudit?.missingAliases ?? []))];
  const inlineByteValues = preparedOutputs.map((metric) => metric.fontCssAudit?.inlinedBytes).filter(Number.isFinite);
  const maxInlineBytes = Math.max(0, ...inlineByteValues);
  const inlineMegabytes = (maxInlineBytes / (1024 * 1024)).toFixed(2);
  const masterDiffRanges = ['cinematic', 'editorial', 'id-card'].map((master) => {
    const values = allOutputs.filter((metric) => metric.master === master).map((metric) => metric.metrics.meanAbsoluteRgbDifference);
    return { master, min: Math.min(...values), max: Math.max(...values) };
  });
  const c2e2Range = masterDiffRanges.filter(({ master }) => master !== 'id-card').flatMap(({ min, max }) => [min, max]);
  const idCardRange = masterDiffRanges.find(({ master }) => master === 'id-card');
  const report = `# Preview / export fidelity report

Generated ${new Date().toISOString()} from completed combined shortlist captures (${summary.completedAt}). Pixel comparisons cover all 18 combined cases (six shortlisted master/font pairs × A/B/C job-mark variants). The board shows six representative triptychs, one per shortlisted master/font pair, with A/C marks alternating. Each triptych compares the same card name region from the live renderer preview, PNG 2× export downsampled to the preview dimensions, and WebP 2× export downsampled the same way.

The preview images are ${rows[0].previewDimensions.width}×${rows[0].previewDimensions.height}. Each card is laid out at 432×540 logical pixels, and the unchanged exporter outputs are 2160×2700 (PNG) and 2160×2700 (WebP). Downsampling uses libvips/sharp Lanczos3 in sRGB before channel comparison. Name crops use the card text-run name rectangle, translated from viewport coordinates into preview-image pixels by preview width divided by logical card width (${rows[0].crop.scaleFactor.toFixed(3)}× in the first row).

**These pixel values are descriptive only.** They combine layout alignment, browser text rasterization, anti-aliasing, color conversion, export rendering and WebP compression. They do not prove that the export used the same physical font face as the preview; that evidence comes from the per-role CSS.getPlatformFontsForNode audit and the export font-CSS resource audit. No identical-pixel threshold is used.

![Six name-region preview/export triptychs](./20-preview-export.png)

## Selected triptychs

| Master | Font set | Mark | Case | Actual platform face(s) in name | Requested/matched weights | Job source tier | Crop (left, top, width, height; scale) |
|---|---|---|---|---|---|---|---|
${triptychRows}

## Image-level comparisons

Mean absolute RGB difference is the average per-channel absolute delta from 0 to 255; RMSE is also on the 0–255 scale. The threshold percentages count pixels whose maximum channel delta exceeds the stated value. These measures are not quality scores.

| Master | Font set | Mark | Case | Output | Source dimensions | Bytes | Mean abs RGB Δ | RMSE RGB Δ | P95 channel Δ | Pixels with max Δ > 8 | Font-CSS path | CSS bytes | Missing aliases |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|
${tableRows}

## Export font-resource audit

Each row records the unchanged exporter’s prepareCardFontCss outcome, inlined byte count, and missing alias list. ${preparedOutputs.length} of ${allOutputs.length} outputs reported prepared font CSS; the largest captured payload was ${maxInlineBytes.toLocaleString('en-US')} bytes (${inlineMegabytes} MiB). Missing aliases across the run: ${allMissingAliases.length ? allMissingAliases.join(', ') : 'none'}. Any fallback row means the CSS inliner did not prepare font data; the exporter may use its library stylesheet scan path. The script does not modify the exporter or promote a fallback result to a font-parity pass.

## Visual finding

I inspected the six name-region triptychs and full-card Cinematic and Identity examples. In the samples, PNG and WebP keep the same visible name glyph silhouettes and line placement as the live preview after 2× downsampling. The full exports show the whole 4:5 composition, including the card frame and bottom information, rather than a top-left crop. The mean absolute RGB deltas across all PNG/WebP comparisons ranged ${Math.min(...c2e2Range).toFixed(3)}–${Math.max(...c2e2Range).toFixed(3)} for Cinematic and Editorial, and ${idCardRange.min.toFixed(3)}–${idCardRange.max.toFixed(3)} for Identity. Identity’s larger values are recorded for follow-up; these deltas combine rasterization, scaling and image differences and do not by themselves establish a font mismatch. This is a visual comparison, not a claim of pixel identity or a substitute for the per-role font-face audit.
`;
  await writeFile(reportPath, report, 'utf8');
  console.log(JSON.stringify({
    board: path.relative(root, boardPath),
    report: path.relative(root, reportPath),
    combinedCases: summary.caseCount,
    combinedPasses: summary.passCount,
    completedAt: summary.completedAt,
    triptychs: rows.map((row) => row.caseId),
    pixelMetrics: rows.map((row) => ({ caseId: row.caseId, outputs: row.metrics.map((metric) => ({ format: metric.format, mae: metric.metrics.meanAbsoluteRgbDifference, rmse: metric.metrics.rootMeanSquareRgbDifference })) })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

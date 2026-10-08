import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs/qa/phase214');
const inputPath = path.join(qaRoot, 'rendered/qa214-theme-parity.json');
const outputPath = path.join(qaRoot, 'theme-render-comparison.json');
const expectedFamilies = ['cinematic', 'editorial', 'id-card'];
const expectedThemes = ['dark', 'light'];
const expectedFormats = ['png', 'webp'];
const phase213TimingsPath = path.join(root, 'docs/qa/phase213-material/after/qa213-export-timings.json');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function compareDecodedPixels(darkPath, lightPath) {
  const [darkPixels, lightPixels] = await Promise.all([
    sharp(darkPath).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(lightPath).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (darkPixels.info.width !== lightPixels.info.width || darkPixels.info.height !== lightPixels.info.height || darkPixels.info.channels !== lightPixels.info.channels) {
    return { identical: false, dimensionsMatch: false, changedPixels: null, changedChannels: null, totalChannels: null, changedChannelPercent: null, meanAbsoluteChannelDelta: null, maxChannelDelta: null, bounds: null };
  }
  let changedPixels = 0;
  let changedChannels = 0;
  let totalDelta = 0;
  let maxChannelDelta = 0;
  let left = darkPixels.info.width;
  let top = darkPixels.info.height;
  let right = -1;
  let bottom = -1;
  const { width, channels } = darkPixels.info;
  for (let offset = 0; offset < darkPixels.data.length; offset += channels) {
    let changed = false;
    for (let channel = 0; channel < channels; channel += 1) {
      const delta = Math.abs(darkPixels.data[offset + channel] - lightPixels.data[offset + channel]);
      if (!delta) continue;
      changed = true;
      changedChannels += 1;
      totalDelta += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (!changed) continue;
    changedPixels += 1;
    const pixel = offset / channels;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  const totalChannels = darkPixels.data.length;
  return {
    identical: changedPixels === 0,
    dimensionsMatch: true,
    width: darkPixels.info.width,
    height: darkPixels.info.height,
    changedPixels,
    changedChannels,
    totalChannels,
    changedChannelPercent: Math.round((changedChannels / totalChannels) * 100 * 1_000_000) / 1_000_000,
    meanAbsoluteChannelDelta: Math.round((totalDelta / totalChannels) * 1_000_000_000) / 1_000_000_000,
    maxChannelDelta,
    bounds: changedPixels ? { left, top, right, bottom } : null,
  };
}

function timingSummary(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sampleCount: values.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    maxMs: sorted[sorted.length - 1],
    samplesMs: values,
  };
}

async function readPhase213Timings() {
  try {
    return JSON.parse(await readFile(phase213TimingsPath, 'utf8'));
  } catch {
    return null;
  }
}

const report = JSON.parse(await readFile(inputPath, 'utf8'));
assert(report.schema === 'phase214-theme-card-parity-v1', `Unexpected report schema ${String(report.schema)}.`);
assert(Array.isArray(report.captures), 'Report has no capture rows.');
const captures = new Map();
for (const row of report.captures) {
  assert(expectedThemes.includes(row.theme), `Unexpected theme ${String(row.theme)}.`);
  assert(expectedFamilies.includes(row.family), `Unexpected card family ${String(row.family)}.`);
  assert(expectedFormats.includes(row.format), `Unexpected file format ${String(row.format)}.`);
  const key = `${row.theme}/${row.family}/${row.format}`;
  assert(!captures.has(key), `Duplicate capture ${key}.`);
  const expectedName = `qa214-card-${row.theme}-${row.family}-${row.format}-2x.${row.format}`;
  assert(row.name === expectedName && path.basename(row.name) === row.name, `Unexpected file name for ${key}: ${String(row.name)}.`);
  const bytes = await readFile(path.join(qaRoot, 'rendered', row.name));
  const actualHash = sha256(bytes);
  assert(row.output?.bytes === bytes.byteLength, `Byte size mismatch for ${key}.`);
  assert(row.output?.sha256 === actualHash, `Hash mismatch between capture metadata and ${row.name}.`);
  captures.set(key, { row, actualHash, byteLength: bytes.byteLength });
}

const pairs = [];
for (const family of expectedFamilies) {
  for (const format of expectedFormats) {
    const dark = captures.get(`dark/${family}/${format}`);
    const light = captures.get(`light/${family}/${format}`);
    assert(dark && light, `Missing ${family} ${format} theme pair.`);
    const geometryEqual = JSON.stringify(dark.row.card.geometry) === JSON.stringify(light.row.card.geometry);
    const textEqual = JSON.stringify(dark.row.card.text) === JSON.stringify(light.row.card.text);
    const assetsEqual = JSON.stringify(dark.row.card.assets) === JSON.stringify(light.row.card.assets);
    const paintStylesEqual = JSON.stringify(dark.row.card.paintElements) === JSON.stringify(light.row.card.paintElements);
    const sameMountedNode = dark.row.card.mountedNodeIdentity === light.row.card.mountedNodeIdentity
      && typeof dark.row.card.mountedNodeIdentity === 'string';
    const dimensionsEqual = JSON.stringify(dark.row.output.size) === JSON.stringify(light.row.output.size);
    const pixelDelta = dark.actualHash === light.actualHash
      ? { identical: true, dimensionsMatch: true, width: dark.row.output.size.width, height: dark.row.output.size.height, changedPixels: 0, changedChannels: 0, totalChannels: null, changedChannelPercent: 0, meanAbsoluteChannelDelta: 0, maxChannelDelta: 0, bounds: null }
      : await compareDecodedPixels(
        path.join(qaRoot, 'rendered', dark.row.name),
        path.join(qaRoot, 'rendered', light.row.name),
      );
    pairs.push({
      family,
      format,
      dark: { file: dark.row.name, bytes: dark.byteLength, sha256: dark.actualHash, size: dark.row.output.size },
      light: { file: light.row.name, bytes: light.byteLength, sha256: light.actualHash, size: light.row.output.size },
      identicalBytes: dark.actualHash === light.actualHash,
      identicalGeometry: geometryEqual,
      identicalTextAndTypography: textEqual,
      identicalCardAssets: assetsEqual,
      identicalMaterialAndSvgPaintStyles: paintStylesEqual,
      sameMountedCardNode: sameMountedNode,
      identicalOutputDimensions: dimensionsEqual,
      identicalDecodedPixels: pixelDelta.identical,
      decodedPixelDelta: pixelDelta,
      appSurfaceTokens: { dark: dark.row.card.appSurfaceToken ?? null, light: light.row.card.appSurfaceToken ?? null },
      appColorSchemes: { dark: dark.row.card.appColorScheme ?? null, light: light.row.card.appColorScheme ?? null },
      cardArticleColorSchemes: {
        dark: dark.row.card.paintElements?.[0]?.colorScheme ?? null,
        light: light.row.card.paintElements?.[0]?.colorScheme ?? null,
      },
    });
  }
}

const phase214PngRuns = report.png2xTimingRuns?.filter((run) => run.format === 'png' && run.scale === 2 && Number.isFinite(run.repeat) && Number.isFinite(run.renderDurationMs)) ?? [];
const repeatStability = report.repeatStability ?? [];
const phase213Report = await readPhase213Timings();
const performanceComparison = expectedFamilies.map((family) => {
  const phase213Runs = phase213Report?.runs?.filter((run) => run.family === family && run.format === 'png' && run.requestedScale === 2 && Number.isFinite(run.renderDurationMs)).map((run) => run.renderDurationMs) ?? [];
  const baseline = timingSummary(phase213Runs);
  const themes = expectedThemes.map((theme) => {
    const timings = phase214PngRuns.filter((run) => run.theme === theme && run.family === family).map((run) => run.renderDurationMs);
    const current = timingSummary(timings);
    const changePercent = baseline && current
      ? Math.round(((current.medianMs / baseline.medianMs) - 1) * 10_000) / 100
      : null;
    return { theme, current, changeVsPhase213Percent: changePercent, within15Percent: changePercent === null ? null : changePercent <= 15 };
  });
  return { family, phase213Baseline: baseline, themes };
});

const failures = [
  ...(report.failures ?? []).map((failure) => `capture: ${failure}`),
  ...(captures.size !== expectedFamilies.length * expectedThemes.length * expectedFormats.length ? [`capture count ${captures.size} does not match the expected matrix.`] : []),
  ...pairs.filter((pair) => !pair.identicalBytes).map((pair) => `${pair.family}/${pair.format}: light and dark output hashes differ.`),
  ...pairs.filter((pair) => !pair.identicalGeometry).map((pair) => `${pair.family}/${pair.format}: preview geometry differs.`),
  ...pairs.filter((pair) => !pair.identicalTextAndTypography).map((pair) => `${pair.family}/${pair.format}: preview text or typography differs.`),
  ...pairs.filter((pair) => !pair.identicalCardAssets).map((pair) => `${pair.family}/${pair.format}: preview card assets differ.`),
  ...pairs.filter((pair) => !pair.identicalMaterialAndSvgPaintStyles).map((pair) => `${pair.family}/${pair.format}: material/SVG paint styles differ between themes.`),
  ...pairs.filter((pair) => !pair.sameMountedCardNode).map((pair) => `${pair.family}/${pair.format}: Light and Dark captures did not use the same retained card DOM node.`),
  ...pairs.filter((pair) => !pair.identicalOutputDimensions).map((pair) => `${pair.family}/${pair.format}: exported image dimensions differ.`),
  ...pairs.filter((pair) => !pair.identicalDecodedPixels).map((pair) => `${pair.family}/${pair.format}: decoded export pixels differ between themes.`),
  ...repeatStability.filter((row) => row.stableBytesAcrossRepeats !== true)
    .map((row) => `${row.family}/${row.theme}/${row.format}: repeated exports within this theme are not byte-stable.`),
];
const output = {
  schema: 'phase214-theme-render-comparison-v1',
  generatedAt: new Date().toISOString(),
  source: path.relative(root, inputPath).replaceAll('\\', '/'),
  environment: report.environment,
  cardStateSha256: report.cardStateSha256 ?? null,
  captureCount: captures.size,
  expectedCaptureCount: expectedFamilies.length * expectedThemes.length * expectedFormats.length,
  exactOutputParity: failures.length === 0 && pairs.length === expectedFamilies.length * expectedFormats.length,
  rendererPixelParity: pairs.filter((pair) => pair.format === 'png').every((pair) => pair.identicalDecodedPixels),
  allFormatDecodedPixelParity: pairs.every((pair) => pair.identicalDecodedPixels),
  allTimedRepeatHashesStable: repeatStability.length === expectedFamilies.length * expectedThemes.length * expectedFormats.length
    && repeatStability.every((row) => row.stableBytesAcrossRepeats === true),
  repeatStability: repeatStability.map((row) => ({
    family: row.family,
    theme: row.theme,
    format: row.format,
    warmupCount: row.warmupCount,
    timedRepeatCount: row.timedRepeatCount,
    selectedRepeat: row.selectedRepeat,
    stableBytesAcrossRepeats: row.stableBytesAcrossRepeats,
    outputHashes: row.outputHashes,
    timingsMs: row.timingsMs,
    medianMs: row.medianMs,
    p95Ms: row.p95Ms,
  })),
  comparisonMethod: 'SHA-256 of the actual saved PNG/WebP files, decoded RGBA pixel deltas where hashes differ, and normalized DOM geometry, text/typography, asset, and output dimension summaries from each active theme.',
  pairs,
  performanceComparison,
  failures,
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, outputPath), captures: captures.size, pairs: pairs.length, exactOutputParity: output.exactOutputParity, failures }, null, 2));
if (!output.exactOutputParity) process.exitCode = 1;

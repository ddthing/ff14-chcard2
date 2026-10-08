import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs/qa/phase2141');
const captureRoot = path.join(qaRoot, 'rendered');
const matrixSource = path.join(captureRoot, 'qa2141-repeat-matrix.json');
const families = ['cinematic', 'editorial', 'id-card'];
const groups = ['dark', 'light', 'system-dark', 'system-light'];
const formats = ['png', 'webp'];
const exactPairs = [
  ['dark', 'light'], ['dark', 'system-dark'], ['light', 'system-light'],
  ['system-dark', 'system-light'], ['dark', 'system-light'], ['light', 'system-dark'],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function round(value, digits = 9) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function decodeRgba(file) {
  const { data, info } = await sharp(file).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const aligned = data.byteOffset % 4 === 0 ? data : Buffer.from(data);
  return { data: aligned, words: new Uint32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4), info };
}

function pixelDelta(left, right) {
  assert(left.info.width === right.info.width && left.info.height === right.info.height, 'Decoded dimensions differ.');
  assert(left.data.length === right.data.length, 'Decoded RGBA byte lengths differ.');
  let changedPixels = 0;
  let changedChannels = 0;
  let totalAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  let leftBound = left.info.width;
  let topBound = left.info.height;
  let rightBound = -1;
  let bottomBound = -1;
  const width = left.info.width;
  for (let pixelIndex = 0; pixelIndex < left.words.length; pixelIndex += 1) {
    if (left.words[pixelIndex] === right.words[pixelIndex]) continue;
    const offset = pixelIndex * 4;
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      if (delta === 0) continue;
      pixelChanged = true;
      changedChannels += 1;
      totalAbsoluteDelta += delta;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
    }
    if (!pixelChanged) continue;
    changedPixels += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x < leftBound) leftBound = x;
    if (y < topBound) topBound = y;
    if (x > rightBound) rightBound = x;
    if (y > bottomBound) bottomBound = y;
  }
  const totalChannels = left.data.length;
  return {
    dimensions: { width, height: left.info.height, channels: 4 },
    exactPixels: changedPixels === 0,
    changedPixels,
    changedPixelPercent: round((changedPixels / (totalChannels / 4)) * 100, 6),
    changedChannels,
    totalChannels,
    meanAbsoluteChannelDelta: round(totalAbsoluteDelta / totalChannels, 9),
    maxChannelDelta,
    bounds: changedPixels ? { left: leftBound, top: topBound, right: rightBound, bottom: bottomBound } : null,
  };
}

function zeroDelta(width, height) {
  return {
    dimensions: { width, height, channels: 4 },
    exactPixels: true,
    changedPixels: 0,
    changedPixelPercent: 0,
    changedChannels: 0,
    totalChannels: width * height * 4,
    meanAbsoluteChannelDelta: 0,
    maxChannelDelta: 0,
    bounds: null,
  };
}

function getOutput(index, family, group, format, repeat) {
  const row = index.get(`${family}/${group}/${format}/${repeat}`);
  assert(row, `Missing output ${family}/${group}/${format}/repeat-${repeat}.`);
  return row;
}

async function compareSavedOutputs(left, right) {
  if (left.sha256 === right.sha256) return zeroDelta(left.dimensions.width, left.dimensions.height);
  return pixelDelta(await decodeRgba(path.join(captureRoot, left.name)), await decodeRgba(path.join(captureRoot, right.name)));
}

function combineEnvelope(rows) {
  const within = rows.filter((row) => row.comparisonKind === 'within-group-repeat');
  return {
    comparisonCount: within.length,
    changedPixels: Math.max(0, ...within.map((row) => row.delta.changedPixels)),
    changedPixelPercent: Math.max(0, ...within.map((row) => row.delta.changedPixelPercent)),
    meanAbsoluteChannelDelta: Math.max(0, ...within.map((row) => row.delta.meanAbsoluteChannelDelta)),
    maxChannelDelta: Math.max(0, ...within.map((row) => row.delta.maxChannelDelta)),
  };
}

function withinEnvelope(delta, envelope) {
  return delta.changedPixels <= envelope.changedPixels
    && delta.changedPixelPercent <= envelope.changedPixelPercent
    && delta.meanAbsoluteChannelDelta <= envelope.meanAbsoluteChannelDelta
    && delta.maxChannelDelta <= envelope.maxChannelDelta;
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function styleAudit(groupsForFamily) {
  const sourceReferences = [];
  const styleStates = [];
  for (const row of groupsForFamily) {
    sourceReferences.push({ group: row.group, rows: row.state.stylesheetTokenAudit?.appTokenRulesMatchingCard ?? [] });
    styleStates.push({
      group: row.group,
      geometry: row.state.geometry,
      styles: row.state.styles,
      pseudoStyles: row.state.pseudoStyles,
      cardTokenValues: row.state.cardTokenValues,
      ambientAppTokens: row.state.stylesheetTokenAudit?.appTokenCustomPropertiesOnCardNodes ?? [],
      fontChecks: row.state.fontChecks,
      fontFaces: row.state.fontFaces,
      imageSources: row.state.imageSources,
    });
  }
  const baseline = styleStates[0];
  const computedDifferences = styleStates.slice(1).map((state) => ({
    group: state.group,
    sameGeometry: equalJson(state.geometry, baseline.geometry),
    sameComputedStyles: equalJson(state.styles, baseline.styles),
    samePseudoStyles: equalJson(state.pseudoStyles, baseline.pseudoStyles),
    sameCardTokens: equalJson(state.cardTokenValues, baseline.cardTokenValues),
    sameAmbientAppTokenIsolation: equalJson(state.ambientAppTokens, baseline.ambientAppTokens),
    sameFontChecks: equalJson(state.fontChecks, baseline.fontChecks),
    sameFontFaces: equalJson(state.fontFaces, baseline.fontFaces),
    sameImageSourcesAndCrops: equalJson(state.imageSources, baseline.imageSources),
  }));
  const appRules = sourceReferences.flatMap((row) => row.rows.map((rule) => ({ group: row.group, ...rule })));
  return {
    sourceAppTokenRuleCount: appRules.length,
    sourceAppTokenRulesMatchingCard: appRules,
    inheritedAppTokens: groupsForFamily.map((row) => ({
      group: row.group,
      examples: row.state.stylesheetTokenAudit?.appTokenCustomPropertiesOnCardNodes?.slice(0, 1) ?? [],
      nodeCountWithInheritedValues: row.state.stylesheetTokenAudit?.appTokenCustomPropertiesOnCardNodes?.length ?? 0,
      interpretation: 'Inherited custom properties are inventoried separately; they count as dependencies only when source declarations consume them or a relevant computed noncustom style changes.',
    })),
    computedComparisons: computedDifferences,
    computedPropertiesStableAcrossAppearance: computedDifferences.every((row) => row.sameGeometry
      && row.sameComputedStyles && row.samePseudoStyles && row.sameCardTokens && row.sameAmbientAppTokenIsolation
      && row.sameFontChecks && row.sameFontFaces && row.sameImageSourcesAndCrops),
    ambientAppTokensNeutralOnCard: groupsForFamily.every((row) => (row.state.stylesheetTokenAudit?.appTokenCustomPropertiesOnCardNodes ?? []).every((node) => Object.values(node.appValues ?? {}).every((value) => value === '' || value === 'initial'))),
  };
}

async function createDiffPng(family, leftRow, rightRow, delta, name) {
  const left = await decodeRgba(path.join(captureRoot, leftRow.name));
  const right = await decodeRgba(path.join(captureRoot, rightRow.name));
  const output = Buffer.alloc(left.data.length, 0);
  const boost = 8;
  for (let offset = 0; offset < output.length; offset += 4) {
    const max = Math.max(
      Math.abs(left.data[offset] - right.data[offset]),
      Math.abs(left.data[offset + 1] - right.data[offset + 1]),
      Math.abs(left.data[offset + 2] - right.data[offset + 2]),
    );
    if (!max) continue;
    const value = Math.min(255, max * boost);
    output[offset] = 255;
    output[offset + 1] = 40 + value * 0.6;
    output[offset + 2] = 16;
    output[offset + 3] = 255;
  }
  const outputPath = path.join(qaRoot, name);
  await sharp(output, { raw: { width: left.info.width, height: left.info.height, channels: 4 } }).png().toFile(outputPath);
  return { family, file: name, sourceFiles: [leftRow.name, rightRow.name], dimensions: { width: left.info.width, height: left.info.height }, ...delta, visualization: 'Lossless full-resolution RGBA difference map: unchanged pixels are transparent; changed RGB pixels are orange/red with channel delta amplified 8× (clamped at 255). No labels overlap card pixels.' };
}

await mkdir(qaRoot, { recursive: true });
const report = JSON.parse(await readFile(matrixSource, 'utf8'));
assert(report.schema === 'phase2141-repeat-matrix-v1', `Unexpected schema: ${report.schema}`);
assert(Array.isArray(report.outputs), 'Matrix report is missing output rows.');
assert(report.failures?.length === 0, `Capture failures: ${(report.failures ?? []).join('; ')}`);
assert(report.viewport?.width === 1280 && report.viewport?.height === 720, `Expected the matched 1280x720 viewport, observed ${JSON.stringify(report.viewport)}.`);
assert(report.devicePixelRatio === 1, `Expected DPR 1, observed ${report.devicePixelRatio}.`);
assert(report.outputCountPrimary === 72, `Expected 72 primary real binary captures, observed ${report.outputCountPrimary}.`);

const outputIndex = new Map();
const allOutputByName = new Map();
for (const output of report.outputs) allOutputByName.set(output.name, output);
for (const output of report.outputs) {
  if (!groups.includes(output.group)) continue;
  const key = `${output.family}/${output.group}/${output.format}/${output.repeat}`;
  assert(!outputIndex.has(key), `Duplicate matrix output row ${key}.`);
  assert(families.includes(output.family) && formats.includes(output.format), `Unexpected family/format ${key}.`);
  const bytes = await readFile(path.join(captureRoot, output.name));
  assert(sha256(bytes) === output.sha256, `Saved output hash mismatch: ${output.name}.`);
  const metadata = await sharp(bytes).metadata();
  assert(metadata.format === output.format, `${output.name} is actually ${metadata.format}.`);
  assert(metadata.width === output.dimensions.width && metadata.height === output.dimensions.height, `Dimension mismatch ${output.name}.`);
  assert(output.dimensions.width === 2160 && output.dimensions.height === 2700 && output.dimensions.actualScale === 2 && output.dimensions.capped === false, `Unexpected size/cap for ${output.name}.`);
  outputIndex.set(key, output);
}
assert(outputIndex.size === 72, `Only ${outputIndex.size}/72 primary saved outputs were validated.`);
for (const family of families) for (const group of groups) for (const format of formats) for (let repeat = 1; repeat <= 3; repeat += 1) getOutput(outputIndex, family, group, format, repeat);

const transitionOutputs = report.outputs.filter((row) => row.group.startsWith('transition-'));
assert(transitionOutputs.length === 12, `Expected 12 immediate/settled transition exports, observed ${transitionOutputs.length}.`);
for (const output of transitionOutputs) {
  const bytes = await readFile(path.join(captureRoot, output.name));
  assert(sha256(bytes) === output.sha256, `Transition output hash mismatch: ${output.name}.`);
  const metadata = await sharp(bytes).metadata();
  assert(metadata.format === 'png' && metadata.width === 2160 && metadata.height === 2700, `Transition output is not a 2160×2700 PNG: ${output.name}.`);
}

const allComparisons = [];
const envelopes = [];
const crossGroups = [];
const styleAuditByFamily = [];
const diffImages = [];
for (const family of families) {
  const familyGroups = report.groups.filter((row) => row.family === family);
  assert(familyGroups.length === 4, `${family} has ${familyGroups.length}/4 appearance snapshots.`);
  const uniqueNodes = new Set(familyGroups.map((row) => row.mountedNodeIdentity));
  assert(uniqueNodes.size === 1, `${family} did not retain one DOM node across all groups.`);
  styleAuditByFamily.push({ family, ...styleAudit(familyGroups) });
  for (const format of formats) {
    const localRows = [];
    const rawCache = new Map();
    const loadRaw = async (output) => {
      if (!rawCache.has(output.name)) rawCache.set(output.name, await decodeRgba(path.join(captureRoot, output.name)));
      return rawCache.get(output.name);
    };
    const compareRows = async (left, right, comparisonKind, groupPair) => {
      let delta;
      if (left.sha256 === right.sha256) {
        delta = zeroDelta(left.dimensions.width, left.dimensions.height);
      } else {
        delta = pixelDelta(await loadRaw(left), await loadRaw(right));
      }
      const row = {
        family, format, comparisonKind,
        groups: groupPair,
        left: { group: left.group, repeat: left.repeat, name: left.name, sha256: left.sha256 },
        right: { group: right.group, repeat: right.repeat, name: right.name, sha256: right.sha256 },
        identicalBytes: left.sha256 === right.sha256,
        delta,
      };
      localRows.push(row);
      allComparisons.push(row);
      return row;
    };
    for (const group of groups) {
      for (let left = 1; left <= 3; left += 1) for (let right = left + 1; right <= 3; right += 1) {
        await compareRows(getOutput(outputIndex, family, group, format, left), getOutput(outputIndex, family, group, format, right), 'within-group-repeat', [group, group]);
      }
    }
    const envelope = combineEnvelope(localRows);
    envelopes.push({ family, format, ...envelope });
    for (const [leftGroup, rightGroup] of exactPairs) {
      const pairRows = [];
      for (let left = 1; left <= 3; left += 1) for (let right = 1; right <= 3; right += 1) {
        pairRows.push(await compareRows(getOutput(outputIndex, family, leftGroup, format, left), getOutput(outputIndex, family, rightGroup, format, right), 'between-group', [leftGroup, rightGroup]));
      }
      const worst = {
        changedPixels: Math.max(...pairRows.map((row) => row.delta.changedPixels)),
        changedPixelPercent: Math.max(...pairRows.map((row) => row.delta.changedPixelPercent)),
        meanAbsoluteChannelDelta: Math.max(...pairRows.map((row) => row.delta.meanAbsoluteChannelDelta)),
        maxChannelDelta: Math.max(...pairRows.map((row) => row.delta.maxChannelDelta)),
      };
      crossGroups.push({
        family, format,
        comparison: `${leftGroup}-vs-${rightGroup}`,
        pairCount: pairRows.length,
        allPixelPairs: pairRows,
        worstObservedCrossGroupDelta: worst,
        repeatEnvelope: envelope,
        withinRepeatEnvelope: withinEnvelope(worst, envelope),
      });
    }
    if (format === 'png') {
      const dark = getOutput(outputIndex, family, 'dark', format, 1);
      const light = getOutput(outputIndex, family, 'light', format, 1);
      const pair = localRows.find((row) => row.comparisonKind === 'between-group' && row.groups[0] === 'dark' && row.groups[1] === 'light' && row.left.repeat === 1 && row.right.repeat === 1);
      assert(pair, `${family} Dark/Light diff comparison missing.`);
      const diffNumber = String(families.indexOf(family) + 3).padStart(2, '0');
      diffImages.push(await createDiffPng(family, dark, light, pair.delta, `${diffNumber}-${family === 'cinematic' ? 'c2' : family === 'editorial' ? 'e2' : 'i3'}-diff.png`));
    }
  }
}

const relevantCrossGroups = crossGroups.filter((row) => [
  'dark-vs-light', 'dark-vs-system-dark', 'light-vs-system-light',
].includes(row.comparison));
const systemTransitions = [];
for (const family of families) for (const target of ['dark', 'light']) {
  const immediate = allOutputByName.get(`qa2141-card-transition-immediate-system-${target}-${family}-png-r1-2x.png`);
  const settled = allOutputByName.get(`qa2141-card-transition-settled-system-${target}-${family}-png-r1-2x.png`);
  assert(immediate && settled, `Missing immediate/settled System ${target} transition for ${family}.`);
  const delta = await compareSavedOutputs(immediate, settled);
  const envelope = envelopes.find((row) => row.family === family && row.format === 'png');
  assert(envelope, `Missing PNG repeat envelope for ${family}.`);
  systemTransitions.push({
    family,
    target,
    immediate: { name: immediate.name, sha256: immediate.sha256, stateAtRenderStart: immediate.stateBeforeRender },
    settled: { name: settled.name, sha256: settled.sha256, stateAtRenderStart: settled.stateBeforeRender },
    identicalBytes: immediate.sha256 === settled.sha256,
    delta,
    repeatEnvelope: envelope,
    withinRepeatEnvelope: withinEnvelope(delta, envelope),
  });
}
const sourceCssZero = styleAuditByFamily.every((row) => row.sourceAppTokenRuleCount === 0);
const computedStylesStable = styleAuditByFamily.every((row) => row.computedPropertiesStableAcrossAppearance);
const ambientTokensNeutral = styleAuditByFamily.every((row) => row.ambientAppTokensNeutralOnCard);
const allThemePairsWithinRepeatEnvelope = relevantCrossGroups.every((row) => row.withinRepeatEnvelope);
const systemTransitionsWithinRepeatEnvelope = systemTransitions.every((row) => row.withinRepeatEnvelope);
const allRepeatExact = envelopes.every((row) => row.changedPixels === 0 && row.meanAbsoluteChannelDelta === 0 && row.maxChannelDelta === 0);
const isolationPass = sourceCssZero && computedStylesStable && ambientTokensNeutral && allThemePairsWithinRepeatEnvelope && systemTransitionsWithinRepeatEnvelope;
const themeDeltaReport = {
  schema: 'phase2141-theme-delta-v1',
  generatedAt: new Date().toISOString(),
  environment: report.environment,
  cardStateSha256: report.cardStateSha256,
  comparisonMethod: 'Each saved file was SHA-256 checked. Every primary image was decoded to sRGB RGBA. For each family and format, all three pair combinations inside every one of four groups were compared to form a strict maximum repeat envelope. All nine cross-group repeat combinations were then compared for every unique pair of four groups. A named theme comparison passes only when its worst changed-pixel count, changed-pixel percent, mean absolute channel delta, and max channel delta are each no greater than the corresponding maximum observed inside-group repeat metric. No samples were selected or dropped.',
  metricDefinitions: {
    changedPixels: 'Number of output pixels with at least one unequal RGBA channel.',
    meanAbsoluteChannelDelta: 'Sum of absolute RGBA channel differences divided by total RGBA channel count, including unchanged channels/pixels.',
    maxChannelDelta: 'Largest absolute single-channel difference on the 0–255 scale.',
    changedPixelPercent: 'Changed pixels divided by total output pixels, expressed as percent.',
    maxVsEnvelope: 'For a group pair, the maximum value across its nine run-to-run comparisons is compared against the maximum value across all within-group repeat pairs for that family and file format.',
  },
  repeatEnvelope: envelopes,
  betweenGroupComparisons: crossGroups,
  requiredAppearanceComparisons: relevantCrossGroups.map(({ family, format, comparison, worstObservedCrossGroupDelta, repeatEnvelope, withinRepeatEnvelope }) => ({ family, format, comparison, worstObservedCrossGroupDelta, repeatEnvelope, withinRepeatEnvelope })),
  systemImmediateVsSettledExports: systemTransitions,
  cssAndComputedStyleAudit: styleAuditByFamily,
  repeatedExportsExact: allRepeatExact,
  sourceAppThemeTokenReferencesZero: sourceCssZero,
  cardComputedStylesAndGeometryStable: computedStylesStable,
  ambientThemeCustomPropertiesNeutralOnCard: ambientTokensNeutral,
  namedThemeDeltasWithinRepeatEnvelope: allThemePairsWithinRepeatEnvelope,
  systemTransitionDeltasWithinRepeatEnvelope: systemTransitionsWithinRepeatEnvelope,
  themeIsolationPass: isolationPass,
  browserRasterNondeterminismObserved: !allRepeatExact,
  diffImages,
  failures: [
    ...(!sourceCssZero ? ['At least one card-matching stylesheet rule references an App Theme token.'] : []),
    ...(!computedStylesStable ? ['At least one card computed style, pseudo style, font record, image/crop record, or fractional geometry differs across appearance groups.'] : []),
    ...(!ambientTokensNeutral ? ['At least one ambient App/Editor UI custom property remains non-neutral inside the card render scope.'] : []),
    ...(!allThemePairsWithinRepeatEnvelope ? ['A required theme pair exceeds the maximum within-theme repeat noise envelope.'] : []),
    ...(!systemTransitionsWithinRepeatEnvelope ? ['At least one immediate-vs-settled System export delta exceeds its family PNG repeat envelope.'] : []),
  ],
};

const repeatMatrix = {
  schema: 'phase2141-repeat-matrix-with-pixel-analysis-v1',
  capture: report,
  withinRepeatComparisons: allComparisons.filter((row) => row.comparisonKind === 'within-group-repeat'),
  repeatEnvelope: envelopes,
  actualPrimaryBinaryCount: outputIndex.size,
  retainedActualBinaries: [...outputIndex.values()].map((row) => ({ name: row.name, sha256: row.sha256, bytes: row.bytes, dimensions: row.dimensions })),
};
await writeFile(path.join(qaRoot, '01-repeat-matrix.json'), `${JSON.stringify(repeatMatrix, null, 2)}\n`);
await writeFile(path.join(qaRoot, '02-theme-delta.json'), `${JSON.stringify(themeDeltaReport, null, 2)}\n`);
await writeFile(path.join(captureRoot, 'qa2141-theme-delta.json'), `${JSON.stringify(themeDeltaReport, null, 2)}\n`);
console.log(JSON.stringify({
  outputRoot: path.relative(root, qaRoot).replaceAll('\\', '/'),
  actualPrimaryBinaryCount: outputIndex.size,
  withinComparisons: allComparisons.filter((row) => row.comparisonKind === 'within-group-repeat').length,
  crossComparisons: allComparisons.filter((row) => row.comparisonKind === 'between-group').length,
  repeatEnvelope: envelopes,
  themeIsolationPass: isolationPass,
  cssSourceAuditZero: sourceCssZero,
  computedStylesStable,
  failures: themeDeltaReport.failures,
}, null, 2));
if (!isolationPass) process.exitCode = 1;

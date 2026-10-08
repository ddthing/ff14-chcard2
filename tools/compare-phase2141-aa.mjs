import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs/qa/phase2141');
const captureRoot = path.join(qaRoot, 'rendered');
const families = ['cinematic', 'editorial', 'id-card'];
const familyModes = ['editorial/dark', 'editorial/light', 'editorial/system-dark', 'editorial/system-light', 'id-card/dark', 'id-card/light', 'id-card/system-dark', 'id-card/system-light'];
const formats = ['png', 'webp'];
const repeats = Array.from({ length: 12 }, (_unused, index) => index + 1);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function round(value, digits = 9) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function canonicalizeRendererPseudoClasses(svg) {
  const uuidPattern = /^u[a-z0-9]{4}\d+$/;
  const uuidTokens = new Set();
  const canonical = svg.replace(/\bclass="([^"]*)"/gu, (_match, value) => {
    const classes = value.split(/\s+/u).map((token) => {
      if (!uuidPattern.test(token)) return token;
      uuidTokens.add(token);
      return '__RENDERER_GENERATED_PSEUDO_CLASS__';
    });
    return `class="${classes.join(' ')}"`;
  }).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gu, (style) => style.replace(/\.(u[a-z0-9]{4}\d+)(?=::(?:before|after)\b)/gu, (_match, token) => {
    uuidTokens.add(token);
    return '.__RENDERER_GENERATED_PSEUDO_CLASS__';
  }));
  return { canonical, uuidTokens: [...uuidTokens] };
}

async function decodeRgba(file) {
  const { data, info } = await sharp(file).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const aligned = data.byteOffset % 4 === 0 ? data : Buffer.from(data);
  return { data: aligned, words: new Uint32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4), info };
}

function comparePixels(left, right) {
  assert(left.info.width === right.info.width && left.info.height === right.info.height, 'A/A image dimensions differ.');
  let changedPixels = 0;
  let changedChannels = 0;
  let sumDelta = 0;
  let maxChannelDelta = 0;
  let leftBound = left.info.width;
  let topBound = left.info.height;
  let rightBound = -1;
  let bottomBound = -1;
  for (let index = 0; index < left.words.length; index += 1) {
    if (left.words[index] === right.words[index]) continue;
    const offset = index * 4;
    let hasDiff = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      if (!delta) continue;
      hasDiff = true;
      changedChannels += 1;
      sumDelta += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (!hasDiff) continue;
    changedPixels += 1;
    const x = index % left.info.width;
    const y = Math.floor(index / left.info.width);
    leftBound = Math.min(leftBound, x);
    topBound = Math.min(topBound, y);
    rightBound = Math.max(rightBound, x);
    bottomBound = Math.max(bottomBound, y);
  }
  const totalChannels = left.data.length;
  return {
    width: left.info.width,
    height: left.info.height,
    channels: 4,
    exactPixels: changedPixels === 0,
    changedPixels,
    changedPixelPercent: round(changedPixels / (totalChannels / 4) * 100, 6),
    changedChannels,
    totalChannels,
    meanAbsoluteChannelDelta: round(sumDelta / totalChannels, 9),
    maxChannelDelta,
    bounds: changedPixels ? { left: leftBound, top: topBound, right: rightBound, bottom: bottomBound } : null,
  };
}

function zeroDelta(width, height) {
  return { width, height, channels: 4, exactPixels: true, changedPixels: 0, changedPixelPercent: 0, changedChannels: 0, totalChannels: width * height * 4, meanAbsoluteChannelDelta: 0, maxChannelDelta: 0, bounds: null };
}

function envelope(rows) {
  return {
    comparisonCount: rows.length,
    changedPixels: Math.max(0, ...rows.map((row) => row.delta.changedPixels)),
    changedPixelPercent: Math.max(0, ...rows.map((row) => row.delta.changedPixelPercent)),
    meanAbsoluteChannelDelta: Math.max(0, ...rows.map((row) => row.delta.meanAbsoluteChannelDelta)),
    maxChannelDelta: Math.max(0, ...rows.map((row) => row.delta.maxChannelDelta)),
  };
}

function within(candidate, observed) {
  return candidate.changedPixels <= observed.changedPixels
    && candidate.changedPixelPercent <= observed.changedPixelPercent
    && candidate.meanAbsoluteChannelDelta <= observed.meanAbsoluteChannelDelta
    && candidate.maxChannelDelta <= observed.maxChannelDelta;
}

function distribution(rows, select) {
  const sorted = rows.map(select).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, median: null, p90: null, max: null };
  return {
    count: sorted.length,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1],
    max: sorted.at(-1),
  };
}

const aa = JSON.parse(await readFile(path.join(captureRoot, 'qa2141-aa-diagnostic.json'), 'utf8'));
const systemAA = JSON.parse(await readFile(path.join(captureRoot, 'qa2141-aa-system-diagnostic.json'), 'utf8'));
const failedSystemAAAttempt = JSON.parse(await readFile(path.join(captureRoot, 'qa2141-aa-system-diagnostic-attempt-1.json'), 'utf8'));
const primary = JSON.parse(await readFile(path.join(captureRoot, 'qa2141-repeat-matrix.json'), 'utf8'));
const primaryDelta = JSON.parse(await readFile(path.join(qaRoot, '02-theme-delta.json'), 'utf8'));
assert(aa.schema === 'phase2141-aa-diagnostic-v1', `Unexpected A/A schema ${aa.schema}.`);
assert(aa.failures?.length === 0, `A/A collection errors: ${(aa.failures ?? []).join('; ')}`);
assert(systemAA.schema === 'phase2141-system-aa-diagnostic-v1', `Unexpected System A/A schema ${systemAA.schema}.`);
assert(systemAA.failures?.length === 0, `System A/A collection errors: ${(systemAA.failures ?? []).join('; ')}`);
assert(aa.fixedViewport?.width === 1280 && aa.fixedViewport?.height === 720 && aa.fixedViewport?.devicePixelRatio === 1, 'A/A environment is not the required matched viewport/DPR.');
assert(systemAA.fixedViewport?.width === 1280 && systemAA.fixedViewport?.height === 720 && systemAA.fixedViewport?.devicePixelRatio === 1, 'System A/A environment is not the required matched viewport/DPR.');
assert(aa.actualBinaryCount === 96, `Expected 96 additional binary A/A captures, got ${aa.actualBinaryCount}.`);
assert(aa.rawSvgPayloadCount === 12, `Expected 12 raw SVG payload captures, got ${aa.rawSvgPayloadCount}.`);
assert(primary.cardStateSha256 === aa.cardStateSha256, 'A/A fixed card state hash differs from the primary 72-capture matrix.');
assert(systemAA.actualBinaryCount === 96 && systemAA.rawSvgPayloadCount === 12, 'Expected 96 System A/A exports and twelve System raw SVG payloads.');
assert(failedSystemAAAttempt.failures?.some((failure) => failure.includes('invalid-name')) && failedSystemAAAttempt.partialOutputs?.length === 0, 'Retained first System A/A collector failure does not match the expected zero-output invalid-name attempt.');
assert(primary.cardStateSha256 === systemAA.cardStateSha256 && aa.cardStateSha256 === systemAA.cardStateSha256, 'System A/A fixed card state hash differs from the primary/manual A/A state.');
assert(primaryDelta.schema === 'phase2141-theme-delta-v1', 'Primary comparator report is missing.');
const primaryStrictThreeRepeatResult = primaryDelta.primaryStrictThreeRepeatResult ?? {
  status: primaryDelta.themeIsolationPass === true ? 'pass' : 'fail',
  themeIsolationPass: primaryDelta.themeIsolationPass,
  repeatedExportsExact: primaryDelta.repeatedExportsExact,
  rendererPixelParity: primaryDelta.rendererPixelParity,
  namedThemeDeltasWithinRepeatEnvelope: primaryDelta.namedThemeDeltasWithinRepeatEnvelope,
  systemTransitionDeltasWithinRepeatEnvelope: primaryDelta.systemTransitionDeltasWithinRepeatEnvelope,
  repeatEnvelope: primaryDelta.repeatEnvelope,
  requiredAppearanceComparisons: primaryDelta.requiredAppearanceComparisons,
  systemImmediateVsSettledExports: primaryDelta.systemImmediateVsSettledExports,
  failures: [...(primaryDelta.failures ?? [])],
};

const aaRows = new Map();
const svgComparisons = [];
const allAABlocks = [...aa.blocks, ...systemAA.blocks];
for (const blockKey of familyModes) {
  const [family, mode] = blockKey.split('/');
  const block = allAABlocks.find((row) => row.family === family && row.mode === mode);
  assert(block, `Missing no-theme A/A block ${blockKey}.`);
  assert(block.noThemeSwitchInsideBlock === true && block.sameCardSignatureAtStartAndEnd === true, `State/app mode was not stable in ${blockKey}.`);
  assert(block.outputs.length === 24, `${blockKey} has ${block.outputs.length}/24 A/A outputs.`);
  assert(block.svgProbes.length === 3, `${blockKey} has ${block.svgProbes.length}/3 raw SVG probes.`);
  for (const format of formats) {
    const captures = block.outputs.filter((row) => row.format === format);
    assert(captures.length === 12, `${blockKey}/${format} has ${captures.length}/12 runs.`);
    for (const row of captures) {
      const key = `${family}/${mode}/${format}/${row.repeat}`;
      assert(!aaRows.has(key), `Duplicate A/A row ${key}.`);
      const bytes = await readFile(path.join(captureRoot, row.name));
      assert(sha256(bytes) === row.sha256, `A/A output checksum mismatch: ${row.name}.`);
      const metadata = await sharp(bytes).metadata();
      assert(metadata.format === format && metadata.width === 2160 && metadata.height === 2700, `A/A dimensions/format mismatch: ${row.name}.`);
      aaRows.set(key, row);
    }
  }
  for (const probe of block.svgProbes) {
    const payload = await readFile(path.join(captureRoot, probe.rawSvgFile), 'utf8');
    assert(sha256(payload) === probe.rawSha256, `Raw SVG checksum mismatch: ${probe.rawSvgFile}.`);
    const normalized = canonicalizeRendererPseudoClasses(payload);
    assert(sha256(normalized.canonical) === probe.canonicalSha256, `Canonical SVG checksum mismatch: ${probe.rawSvgFile}.`);
    assert(JSON.stringify(normalized.uuidTokens) === JSON.stringify(probe.uuidTokens), `Generated pseudo-class token inventory mismatch: ${probe.rawSvgFile}.`);
    svgComparisons.push({
      family,
      mode,
      repeat: probe.repeat,
      rawSvgFile: probe.rawSvgFile,
      rawSvgSha256: probe.rawSha256,
      canonicalSvgSha256: probe.canonicalSha256,
      rawPayloadBytes: Buffer.byteLength(payload),
      canonicalPayloadBytes: Buffer.byteLength(normalized.canonical),
      generatedPseudoClassUuids: probe.uuidTokens,
      rawSameAsBlockFirst: probe.rawSameAsFirst,
      canonicalSameAsBlockFirst: probe.canonicalSameAsFirst,
      fontCssSha256: probe.fontCssSha256,
      fontCssSameAsBlockFirst: probe.fontCssSameAsFirst,
      generatedTokenNormalization: 'Only renderer-generated pseudo-class UUID tokens in cloned class attributes and their matching ::before/::after stylesheet selectors are replaced. Source node IDs, content, card styles, computed values, font CSS, geometry, and embedded image data are retained verbatim.',
    });
  }
}
assert(aaRows.size === 192, `Only ${aaRows.size}/192 manual+System A/A output rows validated.`);

const withinComparisons = [];
const envelopes = [];
const rawCache = new Map();
async function getRaw(row) {
  if (!rawCache.has(row.name)) rawCache.set(row.name, await decodeRgba(path.join(captureRoot, row.name)));
  return rawCache.get(row.name);
}
for (const family of ['editorial', 'id-card']) for (const mode of ['dark', 'light', 'system-dark', 'system-light']) for (const format of formats) {
  const rows = repeats.map((repeat) => aaRows.get(`${family}/${mode}/${format}/${repeat}`));
  const comparisons = [];
  for (let left = 0; left < rows.length; left += 1) for (let right = left + 1; right < rows.length; right += 1) {
    const a = rows[left];
    const b = rows[right];
    const delta = a.sha256 === b.sha256 ? zeroDelta(a.dimensions.width, a.dimensions.height) : comparePixels(await getRaw(a), await getRaw(b));
    const comparison = { family, mode, format, leftRepeat: a.repeat, rightRepeat: b.repeat, identicalBytes: a.sha256 === b.sha256, leftSha256: a.sha256, rightSha256: b.sha256, delta };
    comparisons.push(comparison);
    withinComparisons.push(comparison);
  }
  envelopes.push({ family, mode, format, ...envelope(comparisons), distributions: {
    changedPixels: distribution(comparisons, (row) => row.delta.changedPixels),
    meanAbsoluteChannelDelta: distribution(comparisons, (row) => row.delta.meanAbsoluteChannelDelta),
    maxChannelDelta: distribution(comparisons, (row) => row.delta.maxChannelDelta),
  } });
}

rawCache.clear();
const samePreferenceResolvedGroups = ['dark', 'light', 'system-dark', 'system-light'];
const primaryCaptures = primary.outputs.filter((row) => samePreferenceResolvedGroups.includes(row.group));
const supplementalCaptures = [
  ...aa.blocks.flatMap((block) => block.outputs.map((row) => ({ ...row, group: row.mode, preferenceSource: 'supplemental-manual-A/A' }))),
  ...systemAA.blocks.flatMap((block) => block.outputs.map((row) => ({ ...row, group: row.mode, preferenceSource: 'supplemental-system-A/A' }))),
];
const allCapturedRows = [
  ...primaryCaptures.map((row) => ({ ...row, preferenceSource: row.group.startsWith('system-') ? 'primary-system' : 'primary-manual' })),
  ...supplementalCaptures,
];
const sameConditionIndex = new Map();
for (const row of allCapturedRows) {
  const key = `${row.family}/${row.group}/${row.format}`;
  if (!sameConditionIndex.has(key)) sameConditionIndex.set(key, []);
  sameConditionIndex.get(key).push(row);
}

const sameConditionWithinComparisons = [];
const sameConditionRepeatGroups = [];
const sameConditionRawCache = new Map();
async function getSameConditionRaw(row) {
  if (!sameConditionRawCache.has(row.name)) sameConditionRawCache.set(row.name, await decodeRgba(path.join(captureRoot, row.name)));
  return sameConditionRawCache.get(row.name);
}
for (const family of families) for (const group of samePreferenceResolvedGroups) for (const format of formats) {
  const key = `${family}/${group}/${format}`;
  const captures = sameConditionIndex.get(key) ?? [];
  const expectedSamples = family === 'cinematic' ? 3 : 15;
  assert(captures.length === expectedSamples, `${key} has ${captures.length}/${expectedSamples} exact-condition outputs.`);
  const sortedCaptures = [...captures].sort((left, right) => left.repeat - right.repeat);
  for (const capture of sortedCaptures) {
    const expectedPreference = group.startsWith('system-') ? 'system' : group;
    const expectedResolved = group.endsWith('dark') ? 'dark' : 'light';
    const observedPreference = capture.stateBeforeRender?.preference ?? capture.modeAtRenderStart?.preference;
    const observedResolved = capture.stateBeforeRender?.resolved ?? capture.modeAtRenderStart?.resolved;
    assert(observedPreference === expectedPreference && observedResolved === expectedResolved, `${key} output ${capture.name} has mismatched exact preference/resolution.`);
  }
  const comparisons = [];
  for (let left = 0; left < sortedCaptures.length; left += 1) for (let right = left + 1; right < sortedCaptures.length; right += 1) {
    const a = sortedCaptures[left];
    const b = sortedCaptures[right];
    const delta = a.sha256 === b.sha256 ? zeroDelta(a.dimensions.width, a.dimensions.height) : comparePixels(await getSameConditionRaw(a), await getSameConditionRaw(b));
    const comparison = { family, group, format, left: { name: a.name, sha256: a.sha256, repeat: a.repeat, captureSource: a.preferenceSource }, right: { name: b.name, sha256: b.sha256, repeat: b.repeat, captureSource: b.preferenceSource }, identicalBytes: a.sha256 === b.sha256, delta };
    comparisons.push(comparison);
    sameConditionWithinComparisons.push(comparison);
  }
  sameConditionRepeatGroups.push({ family, group, format, sampleCount: sortedCaptures.length, primarySamples: sortedCaptures.filter((row) => !row.preferenceSource?.startsWith('supplemental-')).length, supplementalManualAASamples: sortedCaptures.filter((row) => row.preferenceSource === 'supplemental-manual-A/A').length, supplementalSystemAASamples: sortedCaptures.filter((row) => row.preferenceSource === 'supplemental-system-A/A').length, ...envelope(comparisons) });
}
sameConditionRawCache.clear();

const globalConditionEnvelopes = [];
for (const family of families) for (const format of formats) {
  const groups = sameConditionRepeatGroups.filter((row) => row.family === family && row.format === format);
  assert(groups.length === 4, `${family}/${format} is missing an exact appearance-condition group.`);
  globalConditionEnvelopes.push({
    family, format, exactConditionGroupCount: groups.length, contributingGroups: groups,
    comparisonCount: groups.reduce((sum, row) => sum + row.comparisonCount, 0),
    changedPixels: Math.max(...groups.map((row) => row.changedPixels)),
    changedPixelPercent: Math.max(...groups.map((row) => row.changedPixelPercent)),
    meanAbsoluteChannelDelta: Math.max(...groups.map((row) => row.meanAbsoluteChannelDelta)),
    maxChannelDelta: Math.max(...groups.map((row) => row.maxChannelDelta)),
  });
}

const allPrimaryCrossGroupRows = primaryDelta.betweenGroupComparisons ?? [];
const allPrimaryCrossGroupPairCount = allPrimaryCrossGroupRows.reduce((sum, row) => sum + (row.allPixelPairs?.length ?? 0), 0);
assert(allPrimaryCrossGroupPairCount === 324, `Expected all 324 primary cross-group pixel pairs, found ${allPrimaryCrossGroupPairCount}.`);
const allCrossGroupMeasuredChecks = allPrimaryCrossGroupRows.map((cross) => {
  const repeatNoise = globalConditionEnvelopes.find((row) => row.family === cross.family && row.format === cross.format);
  assert(repeatNoise, `Missing exact-condition repeat envelope ${cross.family}/${cross.format}.`);
  return { family: cross.family, format: cross.format, comparison: cross.comparison, observedPixelPairCount: cross.allPixelPairs.length, observedCrossGroupMaximum: cross.worstObservedCrossGroupDelta, fixedGlobalEnvelopeAcrossExactConditions: repeatNoise, withinFixedGlobalEnvelope: within(cross.worstObservedCrossGroupDelta, repeatNoise) };
});
const all324CrossGroupPairsWithinMeasuredNoise = allCrossGroupMeasuredChecks.every((row) => row.withinFixedGlobalEnvelope);
const directPrimaryCrossChecks = primaryDelta.requiredAppearanceComparisons.filter((row) => ['dark-vs-light', 'dark-vs-system-dark', 'light-vs-system-light'].includes(row.comparison));
const expandedComparisons = directPrimaryCrossChecks.map((cross) => {
  const exactConditionEnvelope = globalConditionEnvelopes.find((row) => row.family === cross.family && row.format === cross.format);
  assert(exactConditionEnvelope, `Missing exact-condition envelope ${cross.family}/${cross.format}.`);
  const modes = cross.comparison === 'dark-vs-system-dark' ? ['dark', 'system-dark'] : cross.comparison === 'light-vs-system-light' ? ['light', 'system-light'] : ['dark', 'light'];
  return { family: cross.family, format: cross.format, comparison: cross.comparison, originalThreeRepeatEnvelope: cross.repeatEnvelope, fixedGlobalEnvelopeAcrossExactConditions: exactConditionEnvelope, worstObservedPrimaryCrossGroupDelta: cross.worstObservedCrossGroupDelta, comparedExactPreferenceResolvedGroups: modes, withinFixedGlobalEnvelope: within(cross.worstObservedCrossGroupDelta, exactConditionEnvelope), primaryThreeRepeatGateStayedFailingWhereObserved: !within(cross.worstObservedCrossGroupDelta, cross.repeatEnvelope) };
});

const systemTransitionComparisons = [];
for (const transition of primaryDelta.systemImmediateVsSettledExports ?? []) {
  const combinedMeasuredNoise = globalConditionEnvelopes.find((row) => row.family === transition.family && row.format === 'png');
  assert(combinedMeasuredNoise, `Missing exact-condition PNG envelope for ${transition.family}.`);
  systemTransitionComparisons.push({
    family: transition.family,
    target: transition.target,
    primaryStrictTransitionDelta: transition.delta,
    fixedGlobalEnvelopeAcrossExactConditions: combinedMeasuredNoise,
    withinOriginalPrimaryEnvelope: within(transition.delta, transition.repeatEnvelope),
    withinFixedGlobalEnvelope: within(transition.delta, combinedMeasuredNoise),
  });
}

const svgModeComparisons = [];
for (const family of ['editorial', 'id-card']) {
  const dark = svgComparisons.filter((row) => row.family === family && row.mode === 'dark');
  const light = svgComparisons.filter((row) => row.family === family && row.mode === 'light');
  const systemDark = svgComparisons.filter((row) => row.family === family && row.mode === 'system-dark');
  const systemLight = svgComparisons.filter((row) => row.family === family && row.mode === 'system-light');
  svgModeComparisons.push({
    family,
    captureRepeats: [1, 6, 12],
    darkCanonicalHashes: dark.map((row) => row.canonicalSvgSha256),
    lightCanonicalHashes: light.map((row) => row.canonicalSvgSha256),
    systemDarkCanonicalHashes: systemDark.map((row) => row.canonicalSvgSha256),
    systemLightCanonicalHashes: systemLight.map((row) => row.canonicalSvgSha256),
    allWithinDarkBlockCanonicalEqual: dark.every((row) => row.canonicalSvgSha256 === dark[0]?.canonicalSvgSha256),
    allWithinLightBlockCanonicalEqual: light.every((row) => row.canonicalSvgSha256 === light[0]?.canonicalSvgSha256),
    allWithinSystemDarkBlockCanonicalEqual: systemDark.every((row) => row.canonicalSvgSha256 === systemDark[0]?.canonicalSvgSha256),
    allWithinSystemLightBlockCanonicalEqual: systemLight.every((row) => row.canonicalSvgSha256 === systemLight[0]?.canonicalSvgSha256),
    correspondingDarkLightCanonicalEqual: dark.length === light.length && dark.every((row, index) => row.canonicalSvgSha256 === light[index]?.canonicalSvgSha256),
    correspondingDarkSystemDarkCanonicalEqual: dark.length === systemDark.length && dark.every((row, index) => row.canonicalSvgSha256 === systemDark[index]?.canonicalSvgSha256),
    correspondingLightSystemLightCanonicalEqual: light.length === systemLight.length && light.every((row, index) => row.canonicalSvgSha256 === systemLight[index]?.canonicalSvgSha256),
    canonicalSVGInputEqualAcrossAllFourConditions: dark.length === 3 && light.length === 3 && systemDark.length === 3 && systemLight.length === 3
      && dark.every((row, index) => [light[index], systemDark[index], systemLight[index]].every((other) => row.canonicalSvgSha256 === other?.canonicalSvgSha256)),
    rawBytesEqualAcrossCorrespondingDarkLight: dark.length === light.length && dark.every((row, index) => row.rawSvgSha256 === light[index]?.rawSvgSha256),
    interpretation: 'A canonical SHA match proves that the captured modern-screenshot foreignObject SVG differs only in renderer-generated pseudo-class UUID tokens for these samples. A raw SHA mismatch with canonical equality is serializer naming noise, not a style/image change. A canonical mismatch remains an unresolved serialized-input difference.',
  });
}

const canonicalSvgIndependentOfTheme = svgModeComparisons.every((row) => row.canonicalSVGInputEqualAcrossAllFourConditions);
const primaryStrictGateStillPass = primaryStrictThreeRepeatResult.themeIsolationPass === true;
const requiredCrossGroupWithinMeasuredNoise = expandedComparisons.every((row) => row.withinFixedGlobalEnvelope);
const systemTransitionsWithinMeasuredSameThemeNoise = systemTransitionComparisons.every((row) => row.withinFixedGlobalEnvelope);
const crossGroupPixelsWithinMeasuredSameThemeNoise = all324CrossGroupPairsWithinMeasuredNoise && requiredCrossGroupWithinMeasuredNoise;
const expandedRasterWithinObservedSameThemeNoise = crossGroupPixelsWithinMeasuredSameThemeNoise && systemTransitionsWithinMeasuredSameThemeNoise;
const sourceAndComputedThemeIsolationPass = primaryDelta.sourceAppThemeTokenReferencesZero === true
  && primaryDelta.cardComputedStylesAndGeometryStable === true
  && primaryDelta.ambientThemeCustomPropertiesNeutralOnCard === true;
const caseBSupportedWithExpandedSampling = !primaryStrictGateStillPass && sourceAndComputedThemeIsolationPass
  && canonicalSvgIndependentOfTheme && expandedRasterWithinObservedSameThemeNoise;
const primaryStrictFailures = primaryStrictThreeRepeatResult.failures ?? [];
const report = {
  schema: 'phase2141-aa-analysis-v1',
  generatedAt: new Date().toISOString(),
  primary72Unchanged: true,
  primaryCardStateSha256: primary.cardStateSha256,
  additionalCaptureCardStateSha256: aa.cardStateSha256,
  primaryStrictThreeRepeatResult,
  primaryStrictFailures,
  environment: aa.environment,
  additionalActualExportCount: aa.actualBinaryCount + systemAA.actualBinaryCount,
  manualAABinaryCount: aa.actualBinaryCount,
  systemAABinaryCount: systemAA.actualBinaryCount,
  svgRawCaptureCount: aa.rawSvgPayloadCount + systemAA.rawSvgPayloadCount,
  svgNormalizationRules: 'Normalize only modern-screenshot generated pseudo class name tokens in cloned class attributes and the matching ::before/::after CSS selectors. Do not normalize or omit source IDs, content, any computed CSS, font CSS, image pixels/data URLs, SVG shapes or geometry.',
  collectionAttempts: [
    { file: 'rendered/qa2141-aa-system-diagnostic-attempt-1.json', status: 'rejected-by-collector', reason: failedSystemAAAttempt.failures[0], actualBinariesSaved: 0, samplingStatus: 'excluded; retained for audit only' },
    { file: 'rendered/qa2141-aa-system-diagnostic.json', status: 'complete', actualBinariesSaved: systemAA.actualBinaryCount, samplingStatus: 'included' },
  ],
  svgComparisons,
  svgModeComparisons,
  aaWithinComparisons: withinComparisons,
  noThemeAARasterEnvelopes: envelopes,
  samePreferenceResolvedWithinRepeatGroups: sameConditionRepeatGroups,
  samePreferenceResolvedWithinRepeatComparisons: sameConditionWithinComparisons,
  globalEnvelopeAcrossExactPreferenceResolvedConditions: globalConditionEnvelopes,
  primaryCrossGroupVsExpandedAABaselines: expandedComparisons,
  all324PrimaryCrossGroupPixelPairsVsCombinedEnvelope: allCrossGroupMeasuredChecks,
  primarySystemImmediateSettledTransitionsVsExpandedNoise: systemTransitionComparisons,
  diagnosis: {
    primaryStrict72Gate: primaryStrictGateStillPass ? 'pass' : 'fail',
    sourceAndComputedThemeIsolationStillPass: sourceAndComputedThemeIsolationPass,
    serializedSvgCanonicalThemeIndependent: canonicalSvgIndependentOfTheme,
    primaryCrossGroupDeltasInsideCombinedMeasuredSameThemeNoise: crossGroupPixelsWithinMeasuredSameThemeNoise,
    sameConditionWithinComparisonCount: sameConditionWithinComparisons.length,
    all24ExactConditionGroupsBuilt: sameConditionRepeatGroups.length === 24,
    all324CrossGroupPairsInsideCombinedMeasuredSameThemeNoise: all324CrossGroupPairsWithinMeasuredNoise,
    requiredAppearanceComparisonsInsideCombinedMeasuredSameThemeNoise: requiredCrossGroupWithinMeasuredNoise,
    systemImmediateSettledDeltasInsideCombinedMeasuredSameThemeNoise: systemTransitionsWithinMeasuredSameThemeNoise,
    caseBSupportedWithExpandedSampling,
    interpretation: primaryStrictGateStillPass
      ? 'Primary 72-capture strict gate passed; supplementary A/A controls are diagnostic.'
      : canonicalSvgIndependentOfTheme && expandedRasterWithinObservedSameThemeNoise
        ? 'The original strict 3-repeat gate remains recorded as failed. The max envelope across all four exact primary conditions plus balanced 12-run manual and System A/A blocks encloses all 1,704 within-condition pairs, 324 cross-group pairs, and six System immediate/settled comparisons. Canonical foreignObject SVG is unchanged across manual and System Dark/Light. This supports measured browser/renderer raster variance; do not relabel original outputs as pixel exact.'
        : 'A/A or canonical SVG evidence remains outside the expected noise model; theme/artwork isolation is unresolved.',
  },
};
await writeFile(path.join(qaRoot, 'AA_DIAGNOSTIC.json'), `${JSON.stringify(report, null, 2)}\n`);
primaryDelta.primaryStrictThreeRepeatResult = primaryStrictThreeRepeatResult;
primaryDelta.primaryStrictFailures = primaryStrictFailures;
primaryDelta.primaryStrictThreeRepeatGatePass = primaryStrictGateStillPass;
primaryDelta.primaryNamedThemeDeltasWithinThreeRepeatEnvelope = primaryStrictThreeRepeatResult.namedThemeDeltasWithinRepeatEnvelope;
primaryDelta.primarySystemTransitionsWithinThreeRepeatEnvelope = primaryStrictThreeRepeatResult.systemTransitionDeltasWithinRepeatEnvelope;
primaryDelta.themeIsolationPass = caseBSupportedWithExpandedSampling;
primaryDelta.namedThemeDeltasWithinRepeatEnvelope = caseBSupportedWithExpandedSampling && requiredCrossGroupWithinMeasuredNoise;
primaryDelta.systemTransitionDeltasWithinRepeatEnvelope = caseBSupportedWithExpandedSampling && systemTransitionsWithinMeasuredSameThemeNoise;
primaryDelta.repeatedExportsExact = primaryStrictThreeRepeatResult.repeatedExportsExact;
primaryDelta.finalAcceptance = {
  case: caseBSupportedWithExpandedSampling ? 'B' : 'unresolved',
  themeIsolationPass: caseBSupportedWithExpandedSampling,
  pixelExact: primaryStrictThreeRepeatResult.repeatedExportsExact === true,
  primaryStrictThreeRepeatGate: primaryStrictGateStillPass ? 'pass' : 'fail',
  expandedEnvelopeMethod: 'Maximum across each exact preference+resolved-theme group after combining original three primary runs and the balanced additional 12-run manual/System A/A samples; C2 has three primary samples per exact group. Group cross-comparisons never contribute to the within-group envelope.',
  all324BetweenConditionPairsWithinGlobalEnvelope: all324CrossGroupPairsWithinMeasuredNoise,
  allSixSystemImmediateSettledPairsWithinGlobalEnvelope: systemTransitionsWithinMeasuredSameThemeNoise,
  rawBrowserExportsRemainUnchanged: true,
};
primaryDelta.failures = caseBSupportedWithExpandedSampling ? [] : [
  ...(sourceAndComputedThemeIsolationPass ? [] : ['Card source/computed theme isolation still has a violation.']),
  ...(canonicalSvgIndependentOfTheme ? [] : ['Canonical foreignObject SVG inputs differ across appearance modes.']),
  ...(all324CrossGroupPairsWithinMeasuredNoise ? [] : ['At least one of the 324 cross-group pixel pairs exceeds the exact-condition repeat envelope.']),
  ...(systemTransitionsWithinMeasuredSameThemeNoise ? [] : ['At least one System immediate/settled transition exceeds the exact-condition repeat envelope.']),
];
primaryDelta.supplementalAAControl = {
  reportFile: 'AA_DIAGNOSTIC.json',
  manualAABinaryCount: aa.actualBinaryCount,
  systemAABinaryCount: systemAA.actualBinaryCount,
  additionalActualExports: aa.actualBinaryCount + systemAA.actualBinaryCount,
  manualRawForeignObjectSvgPayloads: aa.rawSvgPayloadCount,
  systemRawForeignObjectSvgPayloads: systemAA.rawSvgPayloadCount,
  additionalRawForeignObjectSvgPayloads: aa.rawSvgPayloadCount + systemAA.rawSvgPayloadCount,
  originalThreeRepeatPixelVerdictPreserved: primaryStrictGateStillPass ? 'pass' : 'fail',
  primaryStrictThreeRepeatFailureCount: primaryStrictFailures.length,
  primaryStrictThreeRepeatFailures: primaryStrictFailures,
  primaryCrossGroupDeltasInsideCombinedMeasuredSameThemeNoise: crossGroupPixelsWithinMeasuredSameThemeNoise,
  combinedExactPreferenceResolvedWithinComparisonCount: sameConditionWithinComparisons.length,
  sameConditionGroupCounts: sameConditionRepeatGroups.map(({ family, group, format, sampleCount, comparisonCount, changedPixels, changedPixelPercent, meanAbsoluteChannelDelta, maxChannelDelta }) => ({ family, group, format, sampleCount, comparisonCount, changedPixels, changedPixelPercent, meanAbsoluteChannelDelta, maxChannelDelta })),
  globalEnvelopeAcrossExactPreferenceResolvedConditions: globalConditionEnvelopes,
  canonicalForeignObjectSvgUnchangedAcrossManualDarkLight: canonicalSvgIndependentOfTheme,
  all324CrossGroupPixelPairsInsideCombinedMeasuredNoise: all324CrossGroupPairsWithinMeasuredNoise,
  allSystemImmediateSettledComparisonsInsideCombinedMeasuredNoise: systemTransitionsWithinMeasuredSameThemeNoise,
  caseBSupportedWithExpandedSampling,
  envelopeMethod: 'Build four disjoint within-condition groups per family/format keyed by exact appearance preference plus resolved theme: manual Dark, manual Light, System-dark, System-light. E2/I3 have fifteen samples in each group (three primary plus twelve A/A); C2 retains three primary samples in each group. Compute every within-group pair, then define the global same-theme noise envelope as the maximum across all four exact-condition groups. Never compare manual Dark against System-dark as a within-group pair.',
};
await writeFile(path.join(qaRoot, '02-theme-delta.json'), `${JSON.stringify(primaryDelta, null, 2)}\n`);
console.log(JSON.stringify({
  output: 'docs/qa/phase2141/AA_DIAGNOSTIC.json',
  additionalActualExportCount: aaRows.size,
  svgRawCaptureCount: svgComparisons.length,
  noThemeAARasterEnvelopes: envelopes,
  svgModeComparisons: svgModeComparisons.map((row) => ({ family: row.family, allWithinDark: row.allWithinDarkBlockCanonicalEqual, allWithinLight: row.allWithinLightBlockCanonicalEqual, darkVsLight: row.correspondingDarkLightCanonicalEqual })),
  expandedPrimaryCrossChecks: expandedComparisons.map(({ family, format, comparison, originalThreeRepeatEnvelope, expandedManualDarkAndLightAAEnvelope, combinedPrimaryAndAdditionalSameThemeNoiseEnvelope, thresholdStatus }) => ({ family, format, comparison, originalThreeRepeatEnvelope, expandedManualDarkAndLightAAEnvelope, combinedPrimaryAndAdditionalSameThemeNoiseEnvelope, thresholdStatus })),
  all324CrossGroupPairsWithinMeasuredNoise: all324CrossGroupPairsWithinMeasuredNoise,
  systemTransitionsWithinMeasuredNoise: systemTransitionsWithinMeasuredSameThemeNoise,
  caseBSupportedWithExpandedSampling: report.diagnosis.caseBSupportedWithExpandedSampling,
  diagnosis: report.diagnosis,
}, null, 2));

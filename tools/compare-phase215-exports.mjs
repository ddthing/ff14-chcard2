import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendered = path.join(root, 'docs', 'qa', 'phase215', 'rendered');
const output = path.join(root, 'docs', 'qa', 'phase215', '01-export-pixel-gate.json');
const priorDeltaPath = path.join(root, 'docs', 'qa', 'phase2141', 'AA_DIAGNOSTIC.json');
const families = ['cinematic', 'editorial', 'id-card'];
const groups = ['dark', 'light', 'system-dark', 'system-light'];
const formats = ['png', 'webp'];
const repeats = [1, 2, 3];

function assert(condition, message) { if (!condition) throw new Error(message); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function round(value, digits = 9) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function fileName(stage, group, family, format, repeat) { return `qa215-card-${stage}-${group}-${family}-${format}-r${repeat}-2x.${format}`; }

async function decode(name) {
  const bytes = await readFile(path.join(rendered, name));
  const image = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { name, bytes, sha256: sha256(bytes), raw: image.data, width: image.info.width, height: image.info.height, channels: image.info.channels, format: image.info.format };
}

function compare(a, b) {
  assert(a.width === b.width && a.height === b.height && a.channels === b.channels, `Decoded dimensions differ: ${a.name} ${a.width}×${a.height} vs ${b.name} ${b.width}×${b.height}.`);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let sum = 0;
  const channels = a.channels;
  for (let offset = 0; offset < a.raw.length; offset += channels) {
    let changed = false;
    for (let channel = 0; channel < channels; channel += 1) {
      const delta = Math.abs(a.raw[offset + channel] - b.raw[offset + channel]);
      if (!delta) continue;
      changed = true;
      sum += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (changed) changedPixels += 1;
  }
  return {
    left: a.name,
    right: b.name,
    leftSha256: a.sha256,
    rightSha256: b.sha256,
    dimensions: { width: a.width, height: a.height, channels },
    exactBinary: a.sha256 === b.sha256,
    exactDecodedPixels: changedPixels === 0,
    changedPixels,
    changedPixelPercent: round((changedPixels / (a.width * a.height)) * 100, 7),
    maxChannelDelta,
    meanAbsoluteChannelDelta: round(sum / a.raw.length),
    mad: round(sum / a.raw.length),
  };
}

function maxMetric(rows, field) { return Math.max(0, ...rows.map((row) => row[field])); }

function metricsWithin(actual, envelope) {
  return {
    changedPixels: actual.changedPixels <= envelope.changedPixels,
    changedPixelPercent: actual.changedPixelPercent <= envelope.changedPixelPercent,
    meanAbsoluteChannelDelta: actual.meanAbsoluteChannelDelta <= envelope.meanAbsoluteChannelDelta,
    maxChannelDelta: actual.maxChannelDelta <= envelope.maxChannelDelta,
    all: actual.changedPixels <= envelope.changedPixels
      && actual.changedPixelPercent <= envelope.changedPixelPercent
      && actual.meanAbsoluteChannelDelta <= envelope.meanAbsoluteChannelDelta
      && actual.maxChannelDelta <= envelope.maxChannelDelta,
  };
}

const allFiles = await readdir(rendered).catch((error) => {
  if (error?.code === 'ENOENT') throw new Error(`No captured outputs found at ${path.relative(root, rendered)}. Run /qa-phase215?stage=before and ?stage=after first.`);
  throw error;
});
const available = new Set(allFiles);
const priorDelta = JSON.parse(await readFile(priorDeltaPath, 'utf8'));
assert(priorDelta.schema === 'phase2141-aa-analysis-v1', `Unexpected Phase 2.14.1 gate schema at ${path.relative(root, priorDeltaPath)}.`);
const priorEnvelopes = new Map(priorDelta.globalEnvelopeAcrossExactPreferenceResolvedConditions.map((row) => [`${row.family}/${row.format}`, row]));
const matrixReports = new Map();
for (const stage of ['before', 'after']) {
  const bytes = await readFile(path.join(rendered, `qa215-export-matrix-${stage}.json`));
  const matrix = JSON.parse(bytes.toString('utf8'));
  assert(matrix.schema === 'phase215-export-theme-matrix-v1' && matrix.stage === stage, `Invalid ${stage} export matrix report.`);
  assert(matrix.outputs?.length === 72 && matrix.failures?.length === 0, `${stage} matrix incomplete: ${matrix.outputs?.length ?? 0}/72; failures=${matrix.failures?.length ?? 0}.`);
  assert(matrix.environment?.viewport?.width === 1280 && matrix.environment?.viewport?.height === 720 && matrix.environment?.dpr === 1, `${stage} matrix has a different renderer viewport or DPR.`);
  matrixReports.set(stage, matrix);
}
const missing = [];
const cache = new Map();
async function get(stage, group, family, format, repeat) {
  const name = fileName(stage, group, family, format, repeat);
  if (!available.has(name)) { missing.push(name); return null; }
  if (!cache.has(name)) cache.set(name, await decode(name));
  return cache.get(name);
}

const themeEvidence = [];
const stageRepeatEvidence = [];
const beforeAfterEvidence = [];
const outputMetadata = new Map();
for (const stage of ['before', 'after']) for (const row of matrixReports.get(stage).outputs) {
  outputMetadata.set(`${stage}/${row.group}/${row.family}/${row.format}/${row.repeat}`, row);
}
for (const family of families) for (const format of formats) {
  for (const stage of ['before', 'after']) for (const group of groups) {
    const values = await Promise.all(repeats.map((repeat) => get(stage, group, family, format, repeat)));
    if (values.some((value) => !value)) continue;
    const comparisons = [];
    for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) comparisons.push(compare(values[left], values[right]));
    const envelope = priorEnvelopes.get(`${family}/${format}`);
    assert(envelope, `Missing Phase 2.14.1 repeat envelope for ${family}/${format}.`);
    const withinMaxima = {
      changedPixels: maxMetric(comparisons, 'changedPixels'),
      changedPixelPercent: maxMetric(comparisons, 'changedPixelPercent'),
      meanAbsoluteChannelDelta: maxMetric(comparisons, 'meanAbsoluteChannelDelta'),
      mad: maxMetric(comparisons, 'mad'),
      maxChannelDelta: maxMetric(comparisons, 'maxChannelDelta'),
    };
    stageRepeatEvidence.push({ stage, group, resolved: group.endsWith('dark') ? 'dark' : 'light', family, format, outputCount: values.length, phase2141Envelope: envelope, withinRepeatMaxima: withinMaxima, withinRepeatWithinPhase2141Envelope: metricsWithin(withinMaxima, envelope), pairwise: comparisons, exact: comparisons.every((row) => row.exactDecodedPixels) });
  }
  for (const stage of ['before', 'after']) for (const groupA of groups) for (const groupB of groups) {
    if (groups.indexOf(groupB) <= groups.indexOf(groupA)) continue;
    const left = await Promise.all(repeats.map((repeat) => get(stage, groupA, family, format, repeat)));
    const right = await Promise.all(repeats.map((repeat) => get(stage, groupB, family, format, repeat)));
    if ([...left, ...right].some((value) => !value)) continue;
    const comparisons = [];
    for (const a of left) for (const b of right) comparisons.push(compare(a, b));
    const repeatEvidence = stageRepeatEvidence.filter((row) => row.stage === stage && row.family === family && row.format === format && [groupA, groupB].includes(row.group));
    const phase2141Envelope = priorEnvelopes.get(`${family}/${format}`);
    assert(phase2141Envelope, `Missing Phase 2.14.1 repeat envelope for ${family}/${format}.`);
    const priorComparison = metricsWithin({
      changedPixels: maxMetric(comparisons, 'changedPixels'),
      changedPixelPercent: maxMetric(comparisons, 'changedPixelPercent'),
      meanAbsoluteChannelDelta: maxMetric(comparisons, 'meanAbsoluteChannelDelta'),
      maxChannelDelta: maxMetric(comparisons, 'maxChannelDelta'),
    }, phase2141Envelope);
    const withinEnvelope = {
      changedPixels: Math.max(0, ...repeatEvidence.map((row) => row.withinRepeatMaxima.changedPixels)),
      changedPixelPercent: Math.max(0, ...repeatEvidence.map((row) => row.withinRepeatMaxima.changedPixelPercent)),
      meanAbsoluteChannelDelta: Math.max(0, ...repeatEvidence.map((row) => row.withinRepeatMaxima.meanAbsoluteChannelDelta)),
      maxChannelDelta: Math.max(0, ...repeatEvidence.map((row) => row.withinRepeatMaxima.maxChannelDelta)),
    };
    const betweenMaxima = {
      changedPixels: maxMetric(comparisons, 'changedPixels'),
      changedPixelPercent: maxMetric(comparisons, 'changedPixelPercent'),
      meanAbsoluteChannelDelta: maxMetric(comparisons, 'meanAbsoluteChannelDelta'),
      maxChannelDelta: maxMetric(comparisons, 'maxChannelDelta'),
    };
    const withinStageEnvelope = metricsWithin(betweenMaxima, withinEnvelope);
    themeEvidence.push({
      stage, family, format, groupA, groupB,
      resolvedA: groupA.endsWith('dark') ? 'dark' : 'light',
      resolvedB: groupB.endsWith('dark') ? 'dark' : 'light',
      withinConditionRepeatEnvelope: withinEnvelope,
      maximumBetweenConditionDelta: betweenMaxima,
      withinConditionRepeatEnvelopeNotExceeded: withinStageEnvelope,
      phase2141RepeatEnvelope: phase2141Envelope,
      phase2141EnvelopeNotExceeded: priorComparison,
      withinStageAndPhase2141Envelopes: withinStageEnvelope.all && priorComparison.all,
      pairwise: comparisons,
    });
  }
  for (const group of groups) for (const repeat of repeats) {
    const before = await get('before', group, family, format, repeat);
    const after = await get('after', group, family, format, repeat);
    if (before && after) {
      const beforeRow = outputMetadata.get(`before/${group}/${family}/${format}/${repeat}`);
      const afterRow = outputMetadata.get(`after/${group}/${family}/${format}/${repeat}`);
      const sameFrozenCardData = beforeRow?.stateHash === afterRow?.stateHash;
      const sameArticleRect = JSON.stringify(beforeRow?.articleRect) === JSON.stringify(afterRow?.articleRect);
      beforeAfterEvidence.push({ family, format, group, repeat, sameFrozenCardData, sameArticleRect, sameFrozenInputAndGeometry: sameFrozenCardData && sameArticleRect, delta: compare(before, after) });
    }
  }
}

const missingUnique = [...new Set(missing)].sort();
const requestedOutputCount = 2 * groups.length * families.length * formats.length * repeats.length;
const report = {
  schema: 'phase215-export-pixel-gate-v1',
  generatedAt: new Date().toISOString(),
  sourceDirectory: 'docs/qa/phase215/rendered',
  protocol: 'Each exported PNG/WebP is decoded to sRGB RGBA without resizing, matching the Phase 2.14.1 comparator. Source hashes and dimensions are retained. A changed pixel has any unequal RGBA channel. Strict before/after file/decoded-pixel equality is reported separately from the fresh within-condition repeat envelope; neither is inferred from the old baseline.',
  crossStageAttribution: {
    uiOnlyPixelParityClaimAllowed: false,
    reason: 'A user-authorized parallel Phase 2.16 job-icon/card/export source update occurred between the pre-polish and post-polish captures. Keep before/after raster deltas as observations; use the same-stage appearance comparisons and computed/source-style audit to attribute Phase 2.15 Theme isolation.',
  },
  requestedOutputCount,
  foundOutputCount: requestedOutputCount - missingUnique.length,
  missing: missingUnique,
  complete: missingUnique.length === 0,
  priorPhase2141EnvelopeSource: 'docs/qa/phase2141/AA_DIAGNOSTIC.json globalEnvelopeAcrossExactPreferenceResolvedConditions, same Chrome 154 / 1280×720 / DPR1 protocol. The original strict three-repeat failure is retained separately.',
  priorPhase2141OriginalStrictThreeRepeatResult: priorDelta.primaryStrictThreeRepeatResult,
  priorPhase2141ExpandedGlobalEnvelope: priorDelta.globalEnvelopeAcrossExactPreferenceResolvedConditions,
  stageMatrixMetadata: [...matrixReports.entries()].map(([stage, matrix]) => ({ stage, cardStateSha256: matrix.outputs[0]?.stateHash ?? null, groups: [...new Set(matrix.outputs.map((row) => row.group))], outputCount: matrix.outputs.length, systemSimulator: { native: matrix.environment.nativeSystemPreference, current: matrix.environment.simulatedSystemPreference, listenerCount: matrix.environment.systemListenerCount, mediaChangeCount: matrix.environment.systemMediaChangeCount } })),
  exactConditions: groups,
  withinStageThemeRepeatEvidence: stageRepeatEvidence,
  withinStageCrossThemeEvidence: themeEvidence,
  matchingBeforeAfterEvidence: beforeAfterEvidence,
  summary: {
    allWithinConditionRepeatsExact: stageRepeatEvidence.length > 0 && stageRepeatEvidence.every((row) => row.exact),
    allWithinConditionRepeatsWithinPhase2141Envelope: stageRepeatEvidence.length > 0 && stageRepeatEvidence.every((row) => row.withinRepeatWithinPhase2141Envelope.all),
    allConditionDeltasWithinFreshRepeatEnvelope: themeEvidence.length > 0 && themeEvidence.every((row) => row.withinConditionRepeatEnvelopeNotExceeded.all),
    allConditionDeltasWithinPhase2141Envelope: themeEvidence.length > 0 && themeEvidence.every((row) => row.phase2141EnvelopeNotExceeded.all),
    beforeAfterDeltaMeasuredForAllPairs: beforeAfterEvidence.length === families.length * formats.length * groups.length * repeats.length,
    allBeforeAfterPairsUseSameFrozenInputAndGeometry: beforeAfterEvidence.length > 0 && beforeAfterEvidence.every((row) => row.sameFrozenInputAndGeometry),
  },
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: path.relative(root, output), complete: report.complete, foundOutputCount: available.size, missingCount: missingUnique.length, summary: report.summary }, null, 2));
if (!report.complete) process.exitCode = 1;

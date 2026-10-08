import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const qa = path.join(root, 'docs/qa/phase2141');
const rendered = path.join(qa, 'rendered');
const round = (value) => Math.round(value * 100) / 100;
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]);
};
const maybeJson = async (filename) => JSON.parse(await readFile(filename, 'utf8'));
const readOrEmpty = async (filename) => {
  try { return await maybeJson(filename); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};
const fmt = (value) => value === null || value === undefined ? '—' : `${round(Number(value))} ms`;

const sourceSnapshot = await maybeJson(path.join(qa, 'before-source.json'));
const sourceFiles = [...(sourceSnapshot.files ?? [])].sort((first, second) => first.file.localeCompare(second.file));
const sourceFingerprint = createHash('sha256').update(JSON.stringify({ buildId: sourceSnapshot.buildId, files: sourceFiles })).digest('hex');
const ratioBatches = await readOrEmpty(path.join(rendered, 'qa2141-perf-ratio.json')) ?? [];
const initialSamples = await readOrEmpty(path.join(rendered, 'qa2141-perf-initial.json')) ?? [];

const phase292Files = [
  ['canonical', 'docs/qa/phase292/raw/after-1440-canonical.json'],
  ['full-follow-up', 'docs/qa/phase292/raw/after-1440-full.json'],
  ['second-pass', 'docs/qa/phase292/raw/after-1440-second-pass.json'],
];
const phase292 = [];
for (const [label, relative] of phase292Files) {
  const record = await maybeJson(path.join(root, relative));
  const profile = record.scenarioProfiles?.find((item) => item.id === '10-ratio-switches');
  const samples = profile?.profile?.timings?.filter((item) => item.name === 'qa.ratio.selectionToTwoFrames').map((item) => item.durationMs) ?? [];
  const action = record.userActionSequences?.find((item) => item.id === '10-ratio-switches');
  phase292.push({
    label,
    capturedAt: record.capturedAt,
    viewport: record.environment?.viewport ?? null,
    userAgent: record.environment?.userAgent ?? null,
    ratioSequenceMs: action?.durationMs ?? null,
    samples,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maxMs: samples.length ? round(Math.max(...samples)) : null,
    sourceFingerprint: record.uninstrumentedSourceFingerprint ?? null,
  });
}

const phase214Baseline = await maybeJson(path.join(root, 'docs/qa/phase214/rendered/qa214-editor-performance.json'));
const expectedViewport = { width: 1440, height: 1000 };
const oldPrimary = phase292[0];
const oldPrimaryP95 = oldPrimary?.p95Ms;
const threshold15PercentMs = oldPrimaryP95 === null || oldPrimaryP95 === undefined ? null : round(oldPrimaryP95 * 1.15);
const expectedDpr = oldPrimary?.viewport?.devicePixelRatio ?? 1;
const expectedUserAgent = oldPrimary?.userAgent ?? null;

const currentMeasuredRuns = ratioBatches.flatMap((batch, batchIndex) => (batch.measuredRuns ?? []).map((run) => ({
  batchIndex: batchIndex + 1,
  theme: run.theme,
  runIndex: run.runIndex,
  sampleCount: run.samples?.length ?? 0,
  p50Ms: percentile((run.samples ?? []).map((sample) => sample.eventToTwoAnimationFramesMs), 0.5),
  p95Ms: percentile((run.samples ?? []).map((sample) => sample.eventToTwoAnimationFramesMs), 0.95),
  maxMs: (run.samples ?? []).length ? round(Math.max(...run.samples.map((sample) => sample.eventToTwoAnimationFramesMs))) : null,
  commitP95Ms: percentile((run.samples ?? []).map((sample) => sample.eventToStateCommitMs), 0.95),
  firstFrameP95Ms: percentile((run.samples ?? []).flatMap((sample) => sample.eventToFirstAnimationFrameMs === null ? [] : [sample.eventToFirstAnimationFrameMs]), 0.95),
  elapsedP95Ms: percentile((run.samples ?? []).map((sample) => sample.eventToTwoAnimationFramesMs), 0.95),
  failures: run.failures ?? [],
  sourceViewport: batch.environment?.viewport ?? null,
})));
const allCurrentSamples = ratioBatches.flatMap((batch) => (batch.measuredRuns ?? []).flatMap((run) => (run.samples ?? []).map((sample) => sample.eventToTwoAnimationFramesMs)));
const currentBatchViewportsMatch = ratioBatches.length > 0 && ratioBatches.every((batch) => batch.environment?.viewport?.width === expectedViewport.width && batch.environment?.viewport?.height === expectedViewport.height);
const currentBatchDprMatches = ratioBatches.length > 0 && ratioBatches.every((batch) => batch.environment?.devicePixelRatio === expectedDpr);
const currentBatchUserAgentMatches = Boolean(expectedUserAgent) && ratioBatches.length > 0 && ratioBatches.every((batch) => batch.environment?.userAgent === expectedUserAgent);
const completeFiveRunBatches = ratioBatches.filter((batch) => batch.measuredRuns?.length === 5 && batch.measuredRuns.every((run) => run.samples?.length === 10 && !run.failures?.length));
const allCurrentRunP95 = completeFiveRunBatches.flatMap((batch) => batch.measuredRuns.map((run) => percentile(run.samples.map((sample) => sample.eventToTwoAnimationFramesMs), 0.95)));
const regressionCount = threshold15PercentMs === null ? 0 : allCurrentRunP95.filter((value) => value > threshold15PercentMs).length;
const regressionDecision = allCurrentRunP95.length === 0
  ? 'Not assessed: no complete five-run batch was collected.'
  : regressionCount >= Math.ceil(allCurrentRunP95.length * 0.8)
    ? `Possible sustained regression: ${regressionCount}/${allCurrentRunP95.length} run p95 values exceed the 15% comparison line.`
    : regressionCount > 0
      ? `No sustained regression established: ${regressionCount}/${allCurrentRunP95.length} run p95 values exceed the 15% comparison line; inspect the individual samples.`
      : 'No measured run p95 exceeds the 15% comparison line.';

const currentInitial = initialSamples.map((sample, index) => ({
  index: index + 1,
  capturedAt: sample.capturedAt,
  viewport: sample.environment?.viewport ?? null,
  dpr: sample.environment?.devicePixelRatio ?? null,
  theme: sample.theme ?? null,
  navigationType: sample.navigation?.type ?? null,
  deliveryType: sample.navigation?.deliveryType ?? null,
  responseEndMs: sample.navigation?.responseEndMs ?? null,
  fixtureMountElapsedMs: sample.fixtureMountElapsedMs,
  hydrationAndVisibleMasterMs: sample.hydrationAndVisibleMasterMs,
  legacyFirstUsableMs: sample.legacyFirstUsableMs,
  strictFirstUsableMs: sample.strictFirstUsableMs,
  resourceCacheHints: (sample.resourceEvidence ?? []).map((resource) => ({ name: resource.name, transferSize: resource.transferSize, cacheHint: resource.cacheHint })),
}));
const initialMatchesViewport = currentInitial.length > 0 && currentInitial.every((sample) => sample.viewport?.width === expectedViewport.width && sample.viewport?.height === expectedViewport.height);
const initialDprMatches = currentInitial.length > 0 && initialSamples.every((sample) => sample.environment?.devicePixelRatio === expectedDpr);
const initialUserAgentMatches = Boolean(expectedUserAgent) && currentInitial.length > 0 && initialSamples.every((sample) => sample.environment?.userAgent === expectedUserAgent);
const legacyValues = currentInitial.map((sample) => Number(sample.legacyFirstUsableMs)).filter(Number.isFinite);
const strictValues = currentInitial.map((sample) => Number(sample.strictFirstUsableMs)).filter(Number.isFinite);
const historical214RatioViewport = phase214Baseline.environment?.viewport ?? null;
const historical214RatioP95 = phase214Baseline.ratioProbe?.p95Ms ?? null;
const historical214Initial = phase214Baseline.initialUsable ?? null;

const ratioRows = currentMeasuredRuns.map((run) => `| ${run.batchIndex} | ${run.sourceViewport?.width ?? '—'}×${run.sourceViewport?.height ?? '—'} @ ${ratioBatches[run.batchIndex - 1]?.environment?.devicePixelRatio ?? '—'} DPR | ${run.theme?.preference ?? '—'}/${run.theme?.resolved ?? '—'} | ${run.runIndex} | ${run.sampleCount}/10 | ${fmt(run.p50Ms)} | ${fmt(run.p95Ms)} | ${fmt(run.commitP95Ms)} | ${fmt(run.firstFrameP95Ms)} | ${run.failures.length ? run.failures.join('; ') : '0'} |`).join('\n');
const initialRows = currentInitial.map((sample) => `| ${sample.index} | ${sample.viewport?.width ?? '—'}×${sample.viewport?.height ?? '—'} @ ${sample.dpr ?? '—'} DPR | ${sample.navigationType ?? '—'} | ${sample.theme?.preference ?? '—'}/${sample.theme?.resolved ?? '—'} | ${fmt(sample.hydrationAndVisibleMasterMs)} | ${fmt(sample.legacyFirstUsableMs)} | ${fmt(sample.strictFirstUsableMs)} | ${sample.deliveryType ?? 'unknown'} |`).join('\n');
const oldRows = phase292.map((row) => `| ${row.label} | ${row.capturedAt} | ${row.viewport?.width ?? '—'}×${row.viewport?.height ?? '—'} @ ${row.viewport?.devicePixelRatio ?? '—'} DPR | ${row.samples.length}/10 | ${fmt(row.p50Ms)} | ${fmt(row.p95Ms)} | ${fmt(row.maxMs)} | ${fmt(row.ratioSequenceMs)} |`).join('\n');
const readinessByViewport = initialMatchesViewport && initialDprMatches && initialUserAgentMatches ? 'All current readiness rows match the 1440×1000, DPR, and user-agent reference.' : 'Current readiness rows do not all match the 1440×1000, DPR, and user-agent reference; no fully matched initial-usability comparison is made.';
const ratioByViewport = currentBatchViewportsMatch && currentBatchDprMatches && currentBatchUserAgentMatches ? 'All current ratio batches match the 1440×1000, DPR, and user-agent reference.' : 'Current ratio batches do not all match the 1440×1000, DPR, and user-agent reference; no fully matched ratio comparison is made.';
const currentBatchCount = ratioBatches.length;
const expectedMeasuredRuns = currentBatchCount * 5;
const doc = `# Phase 2.14.1 matched performance repeats

Generated ${new Date().toISOString()} from locally collected Phase 2.14.1 performance evidence.

## Ratio picker protocol and result

The repeat helper uses the actual Editor ratio trigger and option buttons through **HTMLElement.click()** (Event.isTrusted=false). Each measured transition opens the menu, waits two animation frames, starts its timer immediately before option activation, then records the store commit, first-frame DOM commit, and the duration through the second animation frame. It reads the article rectangle only after the timed interval ends. This matches the archived Phase 2.9.2 interval, which begins at option activation and ends after two frames. Each batch begins at 4:5, discards one ten-selection warm-up sequence, then captures five ten-selection sequences and restores the original ratio after the batch.

| Batch | Viewport/DPR | Theme preference/resolved | Run | Samples | p50 | p95 (two-frame) | p95 state commit | p95 first-frame DOM | Failures |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
${ratioRows || '| — | No ratio batches collected | — | — | — | — | — | — | — |'}

Pooled measured sample count: **${allCurrentSamples.length}** (expected ${expectedMeasuredRuns * 10} if all ${currentBatchCount} batches are complete); pooled p50 **${fmt(percentile(allCurrentSamples, 0.5))}**, p95 **${fmt(percentile(allCurrentSamples, 0.95))}**, max **${fmt(allCurrentSamples.length ? Math.max(...allCurrentSamples) : null)}**. Each batch should contain five complete measured runs plus one excluded warm-up. Complete batches: ${completeFiveRunBatches.length}/${currentBatchCount}. ${ratioByViewport}

### Archived Phase 2.9.2 reference

| Record | Captured | Viewport | Click-to-two-frame samples | p50 | p95 | Max | Ten-selection sequence total |
|---|---|---:|---:|---:|---:|---:|---:|
${oldRows}

The primary archived comparator is the canonical 1440×1000 Phase 2.9.2 profile (one ten-action run; p95 ${fmt(oldPrimaryP95)}). Full follow-up p95 values vary, including the second-pass ${fmt(phase292[2]?.p95Ms)} outlier. Those historical runs are useful context, not a five-run stable baseline. At the existing 15% review line, the canonical threshold is **${fmt(threshold15PercentMs)}**. ${regressionDecision}

The previously reported Phase 2.14 p95 of **${fmt(historical214RatioP95)}** used viewport ${historical214RatioViewport?.width ?? '—'}×${historical214RatioViewport?.height ?? '—'} and waits one animation frame after opening the menu before option activation; this Phase 2.14.1 helper uses the Phase 2.9.2 two-frame open wait and measures the interval from option activation. It is therefore not the matched baseline for the table above.

## Initial Editor readiness

Each direct Editor navigation records three milestones from navigation start: hydrated and visible Master; legacy readiness after **document.fonts.ready**, all card image decodes, and optical typography readiness; strict readiness after an explicit **loadCardPreviewFonts(toCardData(), locale)**, another image decode/optical check, and two animation frames. Fixture mount time is stored separately. Resource timing includes same-origin fonts, sample artwork, job icons, and material maps to expose transfer/cache hints. No browser cache is cleared, so cache classifications are observational rather than controlled cold/hot measurements.

| Run | Viewport | Navigation | Theme | Hydrated + visible | Legacy readiness | Strict readiness | Delivery hint |
|---:|---:|---|---|---:|---:|---:|---|
${initialRows || '| — | No readiness samples collected | — | — | — | — | — | — |'}

Current legacy-readiness p50 **${fmt(percentile(legacyValues, 0.5))}** and strict-readiness p50 **${fmt(percentile(strictValues, 0.5))}**, n=${currentInitial.length}. ${readinessByViewport} Historical direct-Editor records show Phase 2.9 at 149.4 ms (n=3 warm) and Phase 2.9.2 at 150.3 ms (n=3 warm) for 1440×1000 (see phase29/initial-after.json and phase292/initial-after.json). Those records name the condition “hydrated + visible master + optical ready + font ready + card images decoded,” while this run decodes all four current card images; the archived raw records also measured the largest sample-image decode separately. Treat the similar medians as context, not a matched before/after delta. The separate Phase 2.9.2 profiler-page capture reports 170.2 ms (n=1) from a QA-mounted route (phase292/raw/after-1440-canonical.json), so it is another proxy. One current reload is visibly slower (legacy 237.4 ms; strict 314.9 ms); the evidence does not isolate its cause. The Phase 2.14 strict sample was ${fmt(historical214Initial?.navigationElapsedMs)} at ${historical214RatioViewport?.width ?? '—'}×${historical214RatioViewport?.height ?? '—'}, with explicit preview-font loading plus all image decodes, optical readiness, and two frames. It has a different viewport and is not a paired comparison.

Initial navigation cache evidence per sample is in **qa2141-perf-initial.json**, including resource transfer size and delivery metadata. A nonzero transfer indicates bytes reported by Resource Timing; zero may mean memory/disk cache, local handling, or unavailable transfer accounting. These records do not establish a controlled cold-cache result or a general Time to Interactive measurement.

## Source and measurement limits

- Baseline source snapshot build ID: **${sourceSnapshot.buildId}**, ${sourceFiles.length} files, snapshot fingerprint **${sourceFingerprint}** (SHA-256 of build ID plus sorted path/hash entries from before-source.json).
- Phase 2.9.2 browser: ${phase292[0]?.viewport?.width ?? '—'}×${phase292[0]?.viewport?.height ?? '—'} at DPR 1, ${phase292[0]?.capturedAt ?? 'capture time unavailable'}; exact historical user-agent and source fingerprints are in the archived raw records.
- The switch action and browser environment are matched, but the historical card-rendering implementation predates the Phase 2.13 material maps and the current app shell. Do not attribute any apparent timing difference to theme isolation or claim byte-identical card-source conditions.
- Current rows preserve per-selection timing and post-commit dimensions. Two animation frames are a render-settle proxy; they are not compositor-present timestamps.
- Test runs are sequential in the visible browser. A batch is theme-labeled at start, but theme-specific analysis requires separate complete batches.
- Runtime source/build fingerprint is not exposed by the browser fixture; the before-source snapshot identifies the Phase 2.14 baseline only. Root QA build logs should identify the final temporary and production build IDs.
- This report does not infer causality from a timing delta. Header layout, observers, or variable propagation require evidence in the profile before attribution.
`;

await mkdir(qa, { recursive: true });
await writeFile(path.join(qa, '08-performance-repeat.md'), doc);
console.log(JSON.stringify({
  report: 'docs/qa/phase2141/08-performance-repeat.md',
  sourceSnapshotFingerprint: sourceFingerprint,
  initialSampleCount: initialSamples.length,
  ratioBatchCount: ratioBatches.length,
  completeFiveRunBatches: completeFiveRunBatches.length,
  pooledRatioSampleCount: allCurrentSamples.length,
  oldPhase292P95Ms: phase292.map((row) => ({ run: row.label, p95Ms: row.p95Ms })),
  regressionDecision,
}, null, 2));

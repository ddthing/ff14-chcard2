import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/qa/phase215');
const rendered = path.join(output, 'rendered');
const round = (value) => Math.round(value * 100) / 100;

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]);
}

async function readGroup(metric, stage) {
  try {
    const value = JSON.parse(await readFile(path.join(rendered, `qa215-perf-${metric}-${stage}.json`), 'utf8'));
    return Array.isArray(value.samples) ? value.samples : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function readProbeSource(stage) {
  try { return JSON.parse(await readFile(path.join(output, 'qa-source', `built-${stage}-probe-source.json`), 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function metricEnvironment(sample) {
  const environment = sample.environment ?? {};
  const theme = environment.theme ?? sample.theme ?? {};
  const readiness = sample.readiness ?? {};
  const warmup = sample.warmup ?? {};
  return JSON.stringify({
    userAgent: environment.userAgent ?? environment.environment?.userAgent ?? null,
    platform: environment.platform ?? null,
    language: environment.language ?? null,
    viewport: environment.viewport ?? environment.environment?.viewport ?? null,
    dpr: environment.devicePixelRatio ?? environment.dpr ?? environment.environment?.devicePixelRatio ?? null,
    theme: { preference: theme.preference ?? null, resolved: theme.resolved ?? null },
    startingCard: { template: readiness.template ?? warmup.startingTemplate ?? warmup.template ?? null, ratio: readiness.ratio ?? warmup.startingRatio ?? warmup.ratio ?? null },
    export: { format: sample.format ?? null, scale: sample.scale ?? null },
    drag: { control: sample.control ?? null, pointerType: sample.pointerType ?? null },
  });
}

function completeGroup(metric, samples) {
  if (!samples.length) return false;
  if (metric === 'initial') return samples.every((sample) => ['hydratedAndVisibleMasterMs', 'legacyFirstUsableMs', 'strictFirstUsableMs'].every((field) => Number.isFinite(Number(sample.milestones?.[field]))));
  if (metric === 'ratio') return samples.every((batch) => batch.measuredRuns?.length === 5 && batch.measuredRuns.every((run) => run.samples?.length === 10 && !run.failures?.length));
  if (metric === 'template') return samples.every((batch) => batch.measuredRuns?.length === 5 && batch.measuredRuns.every((run) => run.actionCount === 10 && !run.failures?.length));
  if (metric === 'png2x') return samples.every((batch) => batch.measuredRuns?.length === 5 && batch.measuredRuns.every((run) => Number.isFinite(Number(run.totalMs))));
  if (metric === 'drag') return samples.every((drag) => drag.trustedPointerEvents === true && drag.frameIntervalsMs?.length > 0);
  return false;
}

function matchedEnvironment(metric, before, after) {
  if (!completeGroup(metric, before) || !completeGroup(metric, after)) return false;
  const conditionCounts = (samples) => {
    const counts = new Map();
    for (const sample of samples) {
      const units = Array.isArray(sample.measuredRuns) ? sample.measuredRuns : [sample];
      for (const unit of units) {
        const key = metricEnvironment(Array.isArray(sample.measuredRuns)
          ? { ...sample, ...unit, environment: sample.environment, warmup: sample.warmup }
          : sample);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  };
  const beforeCounts = conditionCounts(before);
  const afterCounts = conditionCounts(after);
  return beforeCounts.size === afterCounts.size && [...beforeCounts].every(([key, count]) => afterCounts.get(key) === count);
}

function formatMs(value) { return value === null || value === undefined ? '—' : `${round(value)} ms`; }
function formatDelta(value, baseline) {
  if (value === null || baseline === null || baseline === undefined) return '—';
  const percent = baseline ? round((value / baseline) * 100) : null;
  return `${value > 0 ? '+' : ''}${formatMs(value)}${percent === null ? '' : ` (${percent > 0 ? '+' : ''}${percent}%)`}`;
}

function summarize(values) {
  return { n: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), maxMs: values.length ? round(Math.max(...values)) : null };
}

function initialValues(samples, field) {
  return samples.map((sample) => Number(sample.milestones?.[field])).filter(Number.isFinite);
}

function ratioValues(samples) {
  return samples.flatMap((batch) => (batch.measuredRuns ?? []).flatMap((run) => (run.samples ?? [])
    .map((item) => Number(item.eventToTwoAnimationFramesMs)).filter(Number.isFinite)));
}

function sequenceValues(samples, field) {
  return samples.flatMap((batch) => (batch.measuredRuns ?? []).map((run) => Number(run[field])).filter(Number.isFinite));
}

function dragIntervals(samples) {
  return samples.flatMap((drag) => (drag.frameIntervalsMs ?? []).map(Number).filter(Number.isFinite));
}

const groups = {};
for (const metric of ['initial', 'ratio', 'template', 'png2x', 'drag']) {
  groups[metric] = { before: await readGroup(metric, 'before'), after: await readGroup(metric, 'after') };
}
const probeSource = { before: await readProbeSource('before'), after: await readProbeSource('after') };
const probeSourceParity = probeSource.before?.extractedSourceSha256 && probeSource.after?.extractedSourceSha256
  ? probeSource.before.extractedSourceSha256 === probeSource.after.extractedSourceSha256
  : null;
const probeSourceRows = ['before', 'after'].map((stage) => {
  const value = probeSource[stage];
  return value
    ? `| ${stage} | ${value.buildId ?? '—'} | \`${value.sourceMap ?? '—'}\` | \`${value.extractedSourceSha256 ?? '—'}\` | ${value.exactSourceMatch ? 'yes' : 'no'} |`
    : `| ${stage} | — | — | — | not captured |`;
}).join('\n');

const metrics = [
  {
    key: 'initial', label: 'Strict first usable Editor', unit: 'navigations',
    before: summarize(initialValues(groups.initial.before, 'strictFirstUsableMs')),
    after: summarize(initialValues(groups.initial.after, 'strictFirstUsableMs')),
    environmentMatch: matchedEnvironment('initial', groups.initial.before, groups.initial.after),
  },
  {
    key: 'initial-visible', label: 'Hydrated + visible Master', unit: 'navigations',
    before: summarize(initialValues(groups.initial.before, 'hydratedAndVisibleMasterMs')),
    after: summarize(initialValues(groups.initial.after, 'hydratedAndVisibleMasterMs')),
    environmentMatch: matchedEnvironment('initial', groups.initial.before, groups.initial.after),
  },
  {
    key: 'initial-legacy', label: 'Legacy first usable Editor', unit: 'navigations',
    before: summarize(initialValues(groups.initial.before, 'legacyFirstUsableMs')),
    after: summarize(initialValues(groups.initial.after, 'legacyFirstUsableMs')),
    environmentMatch: matchedEnvironment('initial', groups.initial.before, groups.initial.after),
  },
  {
    key: 'ratio', label: 'Ratio selection → two RAFs', unit: 'selections',
    before: summarize(ratioValues(groups.ratio.before)), after: summarize(ratioValues(groups.ratio.after)),
    environmentMatch: matchedEnvironment('ratio', groups.ratio.before, groups.ratio.after),
  },
  {
    key: 'template', label: 'Ten template switches', unit: 'sequences',
    before: summarize(sequenceValues(groups.template.before, 'durationMs')),
    after: summarize(sequenceValues(groups.template.after, 'durationMs')),
    environmentMatch: matchedEnvironment('template', groups.template.before, groups.template.after),
  },
  {
    key: 'png2x', label: 'PNG 2× blob ready', unit: 'exports',
    before: summarize(sequenceValues(groups.png2x.before, 'totalMs')),
    after: summarize(sequenceValues(groups.png2x.after, 'totalMs')),
    environmentMatch: matchedEnvironment('png2x', groups.png2x.before, groups.png2x.after),
  },
  {
    key: 'drag', label: 'Trusted range-drag RAF intervals', unit: 'frame intervals',
    before: summarize(dragIntervals(groups.drag.before)), after: summarize(dragIntervals(groups.drag.after)),
    environmentMatch: matchedEnvironment('drag', groups.drag.before, groups.drag.after),
  },
];

const rows = metrics.map((metric) => {
  const comparable = metric.environmentMatch && metric.before.n > 0 && metric.after.n > 0;
  const medianDelta = comparable ? round(metric.after.p50Ms - metric.before.p50Ms) : null;
  const tailDelta = comparable ? round(metric.after.p95Ms - metric.before.p95Ms) : null;
  return `| ${metric.label} | ${metric.before.n} | ${formatMs(metric.before.p50Ms)} | ${formatMs(metric.before.p95Ms)} | ${metric.after.n} | ${formatMs(metric.after.p50Ms)} | ${formatMs(metric.after.p95Ms)} | ${comparable ? `p50 ${formatDelta(medianDelta, metric.before.p50Ms)}; p95 ${formatDelta(tailDelta, metric.before.p95Ms)}` : 'No matched delta (environment or sample mismatch)'} |`;
}).join('\n');

const ratioRunRows = ['before', 'after'].flatMap((stage) => groups.ratio[stage].flatMap((batch, batchIndex) =>
  (batch.measuredRuns ?? []).map((run) => `| ${stage} | ${batch.environment?.theme?.preference ?? '—'}/${batch.environment?.theme?.resolved ?? '—'} | ${batchIndex + 1} | ${run.runIndex ?? '—'} | ${(run.samples ?? []).length}/10 | ${formatMs(run.p50Ms)} | ${formatMs(run.p95Ms)} | ${(run.failures ?? []).length ? run.failures.join('; ') : '0'} |`))).join('\n');

const templateRunRows = ['before', 'after'].flatMap((stage) => groups.template[stage].flatMap((batch, batchIndex) =>
  (batch.measuredRuns ?? []).map((run) => `| ${stage} | ${batch.environment?.theme?.preference ?? '—'}/${batch.environment?.theme?.resolved ?? '—'} | ${batchIndex + 1} | ${run.runIndex ?? '—'} | ${run.actionCount ?? 0} | ${formatMs(run.durationMs)} | ${(run.failures ?? []).length ? run.failures.join('; ') : '0'} |`))).join('\n');

const pngRunRows = ['before', 'after'].flatMap((stage) => groups.png2x[stage].flatMap((batch, batchIndex) =>
  (batch.measuredRuns ?? []).map((run) => `| ${stage} | ${batch.environment?.theme?.preference ?? '—'}/${batch.environment?.theme?.resolved ?? '—'} | ${batchIndex + 1} | ${run.runIndex ?? '—'} | ${formatMs(run.totalMs)} | ${run.width ?? '—'}×${run.height ?? '—'} | ${run.blobBytes ?? '—'} |`))).join('\n');

const dragRows = ['before', 'after'].flatMap((stage) => {
  const byCondition = new Map();
  for (const drag of groups.drag[stage]) {
    const key = JSON.stringify({ theme: drag.environment?.theme, control: drag.control, pointerType: drag.pointerType });
    const record = byCondition.get(key) ?? { theme: drag.environment?.theme, control: drag.control, pointerType: drag.pointerType, drags: 0, intervals: [] };
    record.drags += 1;
    record.intervals.push(...(drag.frameIntervalsMs ?? []).map(Number).filter(Number.isFinite));
    byCondition.set(key, record);
  }
  return [...byCondition.values()].map((record) => `| ${stage} | ${record.theme?.preference ?? '—'}/${record.theme?.resolved ?? '—'} | ${record.control ?? '—'} (${record.pointerType ?? '—'}) | ${record.drags} | ${record.intervals.length} | ${formatMs(percentile(record.intervals, 0.5))} | ${formatMs(percentile(record.intervals, 0.95))} | ${formatMs(record.intervals.length ? Math.max(...record.intervals) : null)} |`);
}).join('\n');

const initialRows = ['before', 'after'].flatMap((stage) => groups.initial[stage].map((sample) => `| ${stage} | ${sample.sampleIndex ?? '—'} | ${sample.environment?.theme?.preference ?? '—'}/${sample.environment?.theme?.resolved ?? '—'} | ${sample.environment?.viewport?.width ?? '—'}×${sample.environment?.viewport?.height ?? '—'} @ ${sample.environment?.devicePixelRatio ?? '—'} DPR | ${formatMs(sample.milestones?.hydratedAndVisibleMasterMs)} | ${formatMs(sample.milestones?.legacyFirstUsableMs)} | ${formatMs(sample.milestones?.strictFirstUsableMs)} | ${sample.environment?.navigation?.type ?? '—'} | ${sample.environment?.navigation?.deliveryType ?? 'unavailable'} | ${sample.environment?.navigation?.transferSize ?? '—'} |`)).join('\n');

const doc = `# Phase 2.15 matched performance profile

Generated ${new Date().toISOString()} from local captures under \`rendered/\`.

| Metric | Before n | Before p50 | Before p95 | After n | After p50 | After p95 | Comparison |
|---|---:|---:|---:|---:|---:|---:|---|
${rows}

The helper emits a before/after delta only when both groups have equal sample counts for every user agent, platform, language, viewport, DPR, preferred/resolved appearance, starting card state, and action-specific condition. This supports multiple balanced appearance groups, such as separate Dark and Light batches, while suppressing unmatched or incomplete comparisons. Deltas describe the measured profiles; they do not establish a UI regression or cause.

## Initial Editor readiness

Each readiness row measures a direct \`/editor\` navigation. “Legacy” waits for document fonts, card image decode, and optical readiness. “Strict” additionally loads the current card preview fonts and waits two animation frames. Repeated reloads left the browser cache uncleared, but the browser did not report a delivery type and document transfer sizes are retained per row; this is not a controlled or verified warm-cache claim.

| Stage | Sample | Appearance | Viewport | Hydrated + visible | Legacy usable | Strict usable | Navigation | Delivery hint | Document transfer bytes |
|---|---:|---|---|---:|---:|---:|---|---|---:|
${initialRows || '| — | — | — | — | — | — | — | — | — | — |'}

## Ratio runs

Each ten-selection run opens the actual Editor ratio menu, waits two animation frames, activates the real menu option using \`HTMLElement.click()\`, and measures through the second animation frame after selection. One warm-up sequence is excluded; the requested profile is five measured sequences of ten actions. DOM clicks are synthetic and have \`isTrusted=false\`. Two-frame completion is a render-settle proxy, not a compositor-present timestamp.

| Stage | Theme | Batch | Run | Samples | p50 | p95 | Failures |
|---|---|---:|---:|---:|---:|---:|---|
${ratioRunRows || '| — | — | — | — | — | — | — | No complete ratio runs collected |'}

## Template runs

One warm-up ten-switch sequence is excluded; each measured sequence reports the total through two frames after every actual Editor template option click.

| Stage | Theme | Batch | Run | Actions | Sequence duration | Failures |
|---|---|---:|---:|---:|---:|---|
${templateRunRows || '| — | — | — | — | — | — | No complete template runs collected |'}

## PNG 2× runs

The same visible Editor article and current serialized card data are passed to production \`renderCardBlob('png', 2)\`. The timer ends at blob creation and excludes download handling.

| Stage | Theme | Batch | Run | Blob ready | Output | Bytes |
|---|---|---:|---:|---:|---|---:|
${pngRunRows || '| — | — | — | — | — | — | No complete PNG 2× runs collected |'}

## Physical range drags

| Stage | Theme | Control | Physical drags | RAF intervals | p50 | p95 | Max |
|---|---|---|---:|---:|---:|---:|---:|
${dragRows || '| — | — | — | — | — | — | — | — |'}

## Build and probe source

The browser runs the compiled build listed below. The helper extracts each probe's \`sourcesContent\` from the corresponding Next.js SSR source map, hashes the extracted TypeScript source, and verifies it against the workspace file at that build.

| Stage | Build ID | SSR source map | Probe source SHA-256 | Workspace source matched |
|---|---|---|---|---|
${probeSourceRows}

Extracted source parity: **${probeSourceParity === null ? 'not yet verified' : probeSourceParity ? 'exact' : 'different'}**.

## Protocol and limits

- Cache warmth is not verified. The browser cache was not cleared, but Resource Timing only provides observational delivery hints.
- Template timing covers ten activations of the actual Editor template options, with two animation frames after each action. One warm-up is excluded and five sequences are measured.
- The QA browser reported React 418 during profile-route hydration. The exact compiled before probe source is reused for the after build; timing values can include QA-probe hydration/recovery overhead and should be treated as a harness proxy.
- The approved Phase 2.16 renderer generation changed between these captures. UI action protocols and browser conditions can be matched, but timing differences across initial readiness, ratio, template, PNG, and drag are not attributable to Phase 2.15 UI changes alone.
- Two-frame and drag RAF values describe browser scheduling/render-settle intervals. They are not compositor-present timestamps, presented FPS, or GPU timing.
- These rows report observations. They do not infer causality or assert a UI regression.
`;

await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'PERFORMANCE.md'), doc);
const json = {
  schema: 'qa215-performance-comparison-v1', generatedAt: new Date().toISOString(), metrics, probeSource, probeSourceParity,
  ratioRuns: ratioRunRows,
  limits: [
    'Browser cache was not cleared, and Resource Timing delivery labels do not verify cache warmth.',
    'React 418 was reported by the baseline QA browser while the performance probe was mounted; timing includes QA harness behavior.',
    'The approved Phase 2.16 renderer generation changed between captures; performance deltas are not attributable to Phase 2.15 UI changes alone.',
    'Two-RAF and drag RAF values are render-settle/scheduling proxies, not compositor-present timestamps or FPS.',
    'No causal attribution is inferred.',
  ],
};
await writeFile(path.join(output, 'performance-comparison.json'), `${JSON.stringify(json, null, 2)}\n`);
console.log(JSON.stringify({ report: 'docs/qa/phase215/PERFORMANCE.md', metrics: metrics.map(({ key, before, after, environmentMatch }) => ({ key, before, after, environmentMatch })) }, null, 2));

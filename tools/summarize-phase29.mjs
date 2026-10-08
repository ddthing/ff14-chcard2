import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/phase29');
const mode = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(mode)) throw new Error('Use before or after.');

const assembledPath = path.join(out, mode === 'before' ? '01-baseline.json' : '02-optimized.json');
let assembled;
try {
  assembled = JSON.parse(await fs.readFile(assembledPath, 'utf8'));
} catch (error) {
  if (mode === 'after' && error?.code === 'ENOENT') {
    throw new Error('02-optimized.json is not assembled yet; no after summary was written.');
  }
  throw error;
}
if (assembled.schemaVersion !== 2 || !Array.isArray(assembled.initial) || !Array.isArray(assembled.runs)) {
  throw new Error(`${path.basename(assembledPath)} is not an assembled Phase 2.9 report; no summary was written.`);
}

const percentile = (values, q) => {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * q) - 1] : null;
};
const stats = (values) => {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.length ? sorted.at(-1) : null,
  };
};

function summarizeProfile(item) {
  const profile = item.profile ?? { counters: {}, timings: [], commits: [] };
  const commits = profile.commits ?? [];
  const timings = profile.timings ?? [];
  const profilerIds = [...new Set(commits.map((commit) => commit.id))];
  const timingNames = [...new Set(timings.map((timing) => timing.name))];

  return {
    id: item.id,
    counters: profile.counters ?? {},
    profilers: Object.fromEntries(profilerIds.map((id) => {
      const rows = commits.filter((commit) => commit.id === id);
      return [id, {
        commits: rows.length,
        actualDurationMs: stats(rows.map((row) => row.actualDuration)),
        baseDurationMs: stats(rows.map((row) => row.baseDuration)),
        note: 'Inclusive values stay separate by Profiler ID; nested boundaries are not summed.',
      }];
    })),
    timings: Object.fromEntries(timingNames.map((name) => {
      const rows = timings.filter((timing) => timing.name === name);
      return [name, {
        ...stats(rows.map((row) => row.durationMs)),
        details: rows.map((row) => row.detail ?? null),
      }];
    })),
  };
}

function summarizeRun(run) {
  const profiles = (run.scenarioProfiles ?? []).map(summarizeProfile);
  const resources = run.resources ?? [];
  const exports = run.exports ?? [];
  return {
    rawSource: run.rawSource ?? null,
    viewport: run.environment?.viewport ?? null,
    scenario: run.scenario ?? null,
    actions: run.userActionSequences ?? [],
    failedActions: (run.userActionSequences ?? []).filter((action) => action.failed).map((action) => action.id),
    frames: (run.frames ?? []).map((frame) => ({
      ...frame,
      intervalPercentilesMs: { p50: frame.p50Ms, p95: frame.p95Ms, p99: frame.p99Ms, max: frame.maxMs },
      frequencyNote: 'RAF sample frequency/interval is not GPU presentation FPS.',
    })),
    profiles,
    exports: {
      primary: exports.filter((item) => item.debugTimings !== true),
      diagnostic: exports.filter((item) => item.debugTimings === true),
      primaryGroups: Object.fromEntries([...new Set(exports.filter((item) => item.debugTimings !== true).map((item) => `${item.format}-${item.scale}x`))].map((key) => {
        const [format, scaleText] = key.split('-');
        const rows = exports.filter((item) => item.debugTimings !== true && item.format === format && item.scale === Number.parseInt(scaleText, 10));
        const stage = (name) => stats(rows.map((row) => row.profileTimingDelta?.find((timing) => timing.name === name)?.durationMs));
        return [key, {
          repetitions: rows.length,
          totalMs: stats(rows.map((row) => row.totalMs)),
          rendererMs: stage('export.renderer.domToBlob'),
          assetsWaitMs: stage('export.assets.wait.total'),
          dimensionCheckMs: stage('export.renderer.dimensionCheck'),
          blobBytes: stats(rows.map((row) => row.blobBytes)),
          dimensions: rows.map((row) => ({ width: row.width, height: row.height, capped: row.capped })),
        }];
      })),
    },
    memory: run.memory ?? [],
    longTasks: {
      count: (run.longTasks ?? []).length,
      totalDurationMs: (run.longTasks ?? []).reduce((sum, entry) => sum + (entry.duration ?? 0), 0),
      maxDurationMs: Math.max(0, ...(run.longTasks ?? []).map((entry) => entry.duration ?? 0)),
      entries: run.longTasks ?? [],
    },
    longAnimationFrames: {
      count: (run.longAnimationFrames ?? []).length,
      totalDurationMs: (run.longAnimationFrames ?? []).reduce((sum, entry) => sum + (entry.duration ?? 0), 0),
      maxDurationMs: Math.max(0, ...(run.longAnimationFrames ?? []).map((entry) => entry.duration ?? 0)),
      entries: run.longAnimationFrames ?? [],
    },
    resourceLog: {
      entries: resources.length,
      cap: 6000,
      partial: resources.length >= 6000,
      note: resources.length >= 6000 ? 'Resource Timing log reached its collection cap; late requests/sums are partial.' : 'No cap reached in the captured resource log.',
    },
    environment: run.environment ?? null,
    supplement: run.supplement ?? null,
  };
}

const initial = assembled.initial ?? [];
const byViewport = [...new Set(initial.map((entry) => entry.width))].sort((a, b) => a - b).map((width) => {
  const rows = initial.filter((entry) => entry.width === width);
  const warm = rows.filter((entry) => entry.condition === 'warm-repeat');
  return {
    width,
    samples: rows.length,
    warmRepeats: warm.length,
    complete: rows.filter((entry) => entry.status === 'complete').length,
    firstUsableMs: stats(warm.map((entry) => entry.firstUsableMs)),
    interactiveUsableMs: stats(warm.map((entry) => entry.interactiveUsableMs)),
    fontReadyMs: stats(warm.map((entry) => entry.fontReadyMs)),
    imageReadyMs: stats(warm.map((entry) => entry.imageReadyMs)),
    sampleDecodeWaitMs: stats(warm.map((entry) => entry.sampleDecodeWaitMs)),
    mode: rows[0]?.mode ?? null,
    conditionDefinition: rows[0]?.firstUsableCondition ?? null,
  };
});

const report = {
  schemaVersion: 2,
  mode,
  source: assembledPath,
  assembledAt: assembled.assembledAt ?? null,
  summarizedAt: new Date().toISOString(),
  environment: assembled.environment ?? null,
  initialByViewport: byViewport,
  runCount: (assembled.runs ?? []).length,
  failedActions: (assembled.runs ?? []).flatMap((run) => (run.userActionSequences ?? []).filter((action) => action.failed).map((action) => ({ viewport: run.environment?.viewport, id: action.id }))),
  runs: (assembled.runs ?? []).map(summarizeRun),
  limits: [
    'The assembler merges the 390px template-switch supplement; raw canonical files are not re-read here.',
    'The initial probe is direct /editor and opt-in. Its first-usable measure includes the PerformanceInitialProbe work.',
    'Exact full JS CPU time and GPU/paint-composite time are not present in the source capture.',
    'RAF intervals are not GPU presentation FPS.',
    'Resource Timing is partial for any run at the 6000-entry cap.',
    'Diagnostic debugTiming exports remain separate from primary exports.',
  ],
};

const outputPath = path.join(out, `${mode}-summary.json`);
await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode, outputPath, viewports: byViewport.map((x) => x.width), runs: report.runCount, failedActions: report.failedActions.length }, null, 2));

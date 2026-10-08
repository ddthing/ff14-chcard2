import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const qa = path.join(root, 'docs/qa/phase29');
const baselineFile = path.join(qa, '01-baseline.json');
const optimizedFile = path.join(qa, '02-optimized.json');
const missing = await fs.stat(optimizedFile).then(() => false, (error) => error?.code === 'ENOENT');
if (missing) {
  throw new Error('02-optimized.json is not assembled. No before/after report was written.');
}
const optimizedInput = JSON.parse(await fs.readFile(optimizedFile, 'utf8'));
if (optimizedInput.schemaVersion !== 2 || !Array.isArray(optimizedInput.initial) || !Array.isArray(optimizedInput.runs)) {
  throw new Error('02-optimized.json exists but is a raw/incomplete capture, not the assembled three-viewport report. No before/after report was written.');
}

function summarize(mode) {
  const result = spawnSync(process.execPath, [path.join(root, 'tools/summarize-phase29.mjs'), mode], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Could not summarize ${mode}.`);
}

summarize('before');
summarize('after');
const before = JSON.parse(await fs.readFile(path.join(qa, 'before-summary.json'), 'utf8'));
const after = JSON.parse(await fs.readFile(path.join(qa, 'after-summary.json'), 'utf8'));
const baselineSource = JSON.parse(await fs.readFile(baselineFile, 'utf8'));
const visualDir = path.join(qa, 'visual');
const visualComparison = JSON.parse(await fs.readFile(path.join(visualDir, 'pixel-comparison.json'), 'utf8'));
const visualRepeat = JSON.parse(await fs.readFile(path.join(visualDir, 'repeat-variation.json'), 'utf8'));
const visualFontControl = JSON.parse(await fs.readFile(path.join(visualDir, 'font-control-comparison.json'), 'utf8'));
const uploadByteParity = JSON.parse(await fs.readFile(path.join(visualDir, 'upload-byte-parity.json'), 'utf8'));
const visualLab = JSON.parse(await fs.readFile(path.join(visualDir, 'qa-lab-results.json'), 'utf8'));
const exportMutex = JSON.parse(await fs.readFile(path.join(qa, 'export-mutex-after.json'), 'utf8'));
const exportCleanup = JSON.parse(await fs.readFile(path.join(qa, 'real-export-cleanup-after.json'), 'utf8'));
const uploadLongTaskBounds = JSON.parse(await fs.readFile(path.join(qa, 'upload-long-task-bounds.json'), 'utf8'));
const optimizedSourceManifest = JSON.parse(await fs.readFile(path.join(qa, 'optimized-source.json'), 'utf8'));
const finalVerification = JSON.parse(await fs.readFile(path.join(qa, 'final-verification.json'), 'utf8'));
const realExportMouseBefore = JSON.parse(await fs.readFile(path.join(qa, 'real-export-mouse-before.json'), 'utf8'));
const realExportMouseAfter = JSON.parse(await fs.readFile(path.join(qa, 'real-export-mouse-after.json'), 'utf8'));

const round = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const statsFrom = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p) => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.length ? sorted.at(-1) : null };
};
const metricPair = (beforeValue, afterValue) => ({
  before: beforeValue ?? null,
  after: afterValue ?? null,
  delta: Number.isFinite(beforeValue) && Number.isFinite(afterValue) ? round(afterValue - beforeValue) : null,
  percentDelta: Number.isFinite(beforeValue) && Number.isFinite(afterValue) && beforeValue !== 0
    ? round(((afterValue - beforeValue) / beforeValue) * 100)
    : null,
});
const matchedStatsPair = (beforeStats, afterStats) => {
  const beforeValue = beforeStats?.p50 ?? null;
  const afterValue = afterStats?.p50 ?? null;
  const beforeCount = beforeStats?.count ?? beforeStats?.n ?? 0;
  const afterCount = afterStats?.count ?? afterStats?.n ?? 0;
  const matched = Number.isFinite(beforeValue) && Number.isFinite(afterValue) && beforeCount === afterCount;
  return {
    nBefore: beforeCount,
    nAfter: afterCount,
    before: beforeValue,
    after: afterValue,
    delta: matched ? round(afterValue - beforeValue) : null,
    percentDelta: matched && beforeValue !== 0 ? round(((afterValue - beforeValue) / beforeValue) * 100) : null,
    matched,
  };
};
const runByWidth = (summary) => new Map(summary.runs.map((run) => [run.viewport?.width, run]));
const beforeRuns = runByWidth(before), afterRuns = runByWidth(after);
const widths = [...new Set([...beforeRuns.keys(), ...afterRuns.keys()])].sort((a, b) => a - b);
const findProfile = (run, id) => run?.profiles.find((item) => item.id === id);
const selectedCounterNames = (counters) => Object.keys(counters ?? {}).filter((name) => (
  name.startsWith('render.') || name.startsWith('reactProfiler.commit.') ||
  name.startsWith('optical.') || name.startsWith('store.image.') ||
  name.startsWith('history.') || name.startsWith('draft.')
)).sort();

// Render-count and inclusive Profiler summaries, kept by scenario and Profiler ID.
const renderCounts = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  note: 'Scenario counters and inclusive Profiler durations are reported separately. Nested Profiler durations are never summed.',
  viewports: widths.map((width) => {
    const b = beforeRuns.get(width), a = afterRuns.get(width);
    const ids = [...new Set([...(b?.profiles ?? []).map(x => x.id), ...(a?.profiles ?? []).map(x => x.id)])].sort();
    return {
      width,
      scenarios: ids.map((id) => {
        const bp = findProfile(b, id), ap = findProfile(a, id);
        const names = [...new Set([...Object.keys(bp?.counters ?? {}), ...Object.keys(ap?.counters ?? {})])]
          .filter((name) => selectedCounterNames({ [name]: 1 }).length > 0).sort();
        const counters = Object.fromEntries(names.map((name) => [name, metricPair(bp?.counters?.[name], ap?.counters?.[name])]));
        const profilerIds = [...new Set([...Object.keys(bp?.profilers ?? {}), ...Object.keys(ap?.profilers ?? {})])].sort();
        const profilers = Object.fromEntries(profilerIds.map((profilerId) => {
          const x = bp?.profilers?.[profilerId], y = ap?.profilers?.[profilerId];
          return [profilerId, {
            commits: metricPair(x?.commits, y?.commits),
            actualDurationP50Ms: metricPair(x?.actualDurationMs?.p50, y?.actualDurationMs?.p50),
            actualDurationP95Ms: metricPair(x?.actualDurationMs?.p95, y?.actualDurationMs?.p95),
            baseDurationP50Ms: metricPair(x?.baseDurationMs?.p50, y?.baseDurationMs?.p50),
            baseDurationP95Ms: metricPair(x?.baseDurationMs?.p95, y?.baseDurationMs?.p95),
          }];
        }));
        return { id, counters, profilers };
      }),
    };
  }),
};

// Export format/scale medians and timing-stage deltas.
const exportTimings = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  note: 'Primary exports only; debugTiming runs stay separate. 1440 has 3 primary repetitions, 1920/390 one. Compare only matched sample counts. Page-level real-export probes are documented separately in PERFORMANCE.md.',
  viewports: widths.map((width) => {
    const b = beforeRuns.get(width), a = afterRuns.get(width);
    const keys = [...new Set([...Object.keys(b?.exports?.primaryGroups ?? {}), ...Object.keys(a?.exports?.primaryGroups ?? {})])].sort();
    return {
      width,
      formats: keys.map((key) => {
        const x = b?.exports?.primaryGroups?.[key], y = a?.exports?.primaryGroups?.[key];
        const stages = ['totalMs', 'rendererMs', 'assetsWaitMs', 'dimensionCheckMs', 'blobBytes'];
        const matchedRepetitions = Boolean(x && y && x.repetitions === y.repetitions);
        return {
          key,
          repetitions: { before: x?.repetitions ?? 0, after: y?.repetitions ?? 0, matched: matchedRepetitions },
          metrics: Object.fromEntries(stages.map((stage) => {
            const pair = matchedStatsPair(x?.[stage], y?.[stage]);
            return [stage, matchedRepetitions ? pair : { ...pair, delta: null, percentDelta: null, matched: false }];
          })),
          outputDimensions: { before: x?.dimensions ?? [], after: y?.dimensions ?? [] },
        };
      }),
    };
  }),
};

// Long Tasks/LoAF are run-level aggregates; timings are not assigned to a scenario without matching monotonic bounds.
const longTaskReport = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  attributionLimit: 'General assembled action records do not preserve matching monotonic window bounds, so these per-run Long Task/LoAF totals are not action-attributed. The one upload comparison below is an approximate clock reconstruction with a 5 ms exclusion margin, not an exact action trace or CPU profile.',
  uploadApproximateWindow: uploadLongTaskBounds,
  runs: widths.map((width) => {
    const b = beforeRuns.get(width), a = afterRuns.get(width);
    return {
      width,
      before: b ? { longTasks: b.longTasks, longAnimationFrames: b.longAnimationFrames, resourceLog: b.resourceLog } : null,
      after: a ? { longTasks: a.longTasks, longAnimationFrames: a.longAnimationFrames, resourceLog: a.resourceLog } : null,
      deltas: {
        longTaskCount: metricPair(b?.longTasks?.count, a?.longTasks?.count),
        longTaskTotalMs: metricPair(b?.longTasks?.totalDurationMs, a?.longTasks?.totalDurationMs),
        longTaskMaxMs: metricPair(b?.longTasks?.maxDurationMs, a?.longTasks?.maxDurationMs),
        loafCount: metricPair(b?.longAnimationFrames?.count, a?.longAnimationFrames?.count),
        loafTotalMs: metricPair(b?.longAnimationFrames?.totalDurationMs, a?.longAnimationFrames?.totalDurationMs),
        loafMaxMs: metricPair(b?.longAnimationFrames?.maxDurationMs, a?.longAnimationFrames?.maxDurationMs),
      },
    };
  }),
};

const mdTable = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(value => String(typeof value === 'number' ? round(value) : (value ?? '—')).replaceAll('|', '\\|')).join(' | ')} |`),
].join('\n');
const mb = (value) => Number.isFinite(value) ? `${round(value / 1e6, 1)} MB` : '—';
const memoryStages = ['initial-after-first-usable-editor', 'after-upload', 'after-replacement', 'after-20-transforms', 'after-cleanup'];
const memoryLines = ['# Phase 2.9 memory samples', '',
  'JS heap is `performance.memory.usedJSHeapSize` and is a browser JS-heap sample, not process peak. RGBA pixel/canvas estimates exclude decoder/GPU/native allocations. Values below preserve the per-viewport stages; repeated stages remain separately visible in source `01`/`02`.', '',
  '| Viewport | Stage | Before JS heap | After JS heap | Before RGBA estimate | After RGBA estimate |',
  '| ---: | --- | ---: | ---: | ---: | ---: |'];
for (const width of widths) {
  const b = beforeRuns.get(width), a = afterRuns.get(width);
  for (const stage of memoryStages) {
    const bs = (b?.memory ?? []).filter(m => m.stage === stage);
    const as = (a?.memory ?? []).filter(m => m.stage === stage);
    if (!bs.length && !as.length) continue;
    const count = Math.max(bs.length, as.length);
    for (let i = 0; i < count; i++) {
      const x = bs[i], y = as[i];
      memoryLines.push(`| ${width} | ${stage}${count > 1 ? ` #${i+1}` : ''} | ${mb(x?.heapUsedBytes)} | ${mb(y?.heapUsedBytes)} | ${mb(x?.imagePixelEstimateBytes)} | ${mb(y?.imagePixelEstimateBytes)} |`);
    }
  }
  const firstFiveSnapshot = (run) => (run?.memory ?? []).filter(m => /^after-(?:png|webp)-/.test(m.stage)).slice(0, 5).at(-1);
  const firstFiveBefore = firstFiveSnapshot(b), firstFiveAfter = firstFiveSnapshot(a);
  if (firstFiveBefore || firstFiveAfter) memoryLines.push(`| ${width} | after first 5 primary exports (5th per-export snapshot) | ${mb(firstFiveBefore?.heapUsedBytes)} | ${mb(firstFiveAfter?.heapUsedBytes)} | ${mb(firstFiveBefore?.imagePixelEstimateBytes)} | ${mb(firstFiveAfter?.imagePixelEstimateBytes)} |`);
  const explicitMarker = (run) => (run?.memory ?? []).find(m => m.stage === 'after-5-exports');
  const markerBefore = explicitMarker(b), markerAfter = explicitMarker(a);
  if (markerBefore || markerAfter) memoryLines.push(`| ${width} | explicit source marker “after-5-exports”${width === 1440 ? ' (source marker follows 15 primary exports)' : ''} | ${mb(markerBefore?.heapUsedBytes)} | ${mb(markerAfter?.heapUsedBytes)} | ${mb(markerBefore?.imagePixelEstimateBytes)} | ${mb(markerAfter?.imagePixelEstimateBytes)} |`);
  const maxB = Math.max(0, ...(b?.memory ?? []).map(m => m.heapUsedBytes ?? 0));
  const maxA = Math.max(0, ...(a?.memory ?? []).map(m => m.heapUsedBytes ?? 0));
  memoryLines.push(`| ${width} | max sampled heap | ${mb(maxB)} | ${mb(maxA)} | — | — |`);
}
const cleanupLifetime = exportCleanup.profile.timings.find(timing => timing.name === 'export.objectUrl.lifetime');
const cleanupState = exportCleanup.profile.timings.filter(timing => timing.name === 'export.objectUrl.retained').at(-1)?.detail;
memoryLines.push('', '| Viewport | Canonical renderer in-progress sampled JS heap peak before | after |', '| ---: | ---: | ---: |',
  '| 1440 | 345.5 MB | 86.6 MB |',
  '| 1920 | 308.2 MB | 57.3 MB |',
  '| 390 | 276.2 MB | 68.9 MB |',
  '', 'These are browser `usedJSHeapSize` samples during the actual export probes, not process/native/GPU peaks; they are distinct from the canonical scenario maxima above.', '',
  `Matched 1440px ExportPage cleanup probe: one object URL (${exportCleanup.profile.counters['export.objectUrl.createdBytes']} B) was retained for ${round(cleanupLifetime?.durationMs)} ms; the final measured state was ${cleanupState?.activeCount ?? '—'} active URLs / ${cleanupState?.activeBytes ?? '—'} active bytes. The post-TTL JS heap sample was ${mb(exportCleanup.memory?.usedBytes)}. The probe records one revoke; it does not support claims about six revocations.`, '',
  'Object URL lifetimes and individual ExportPage memory probes are also preserved in their dedicated real-export artifacts; do not infer native/GPU memory from JS heap.');

const initialRows = widths.map(width => {
  const x = before.initialByViewport.find(row => row.width === width);
  const y = after.initialByViewport.find(row => row.width === width);
  const first = matchedStatsPair(x?.firstUsableMs, y?.firstUsableMs);
  const interactive = matchedStatsPair(x?.interactiveUsableMs, y?.interactiveUsableMs);
  return [width, first.nBefore, first.before, first.nAfter, first.after, first.delta,
    interactive.nBefore, interactive.before, interactive.nAfter, interactive.after, interactive.delta];
});
const interactionRows = [];
for (const width of widths) {
  const b = beforeRuns.get(width), a = afterRuns.get(width);
  const ids = [...new Set([...(b?.actions ?? []).map(x => x.id), ...(a?.actions ?? []).map(x => x.id)])].sort();
  for (const id of ids) {
    const x = (b?.actions ?? []).filter(v => v.id === id), y = (a?.actions ?? []).filter(v => v.id === id);
    const pair = matchedStatsPair(statsFrom(x.map(v => v.durationMs)), statsFrom(y.map(v => v.durationMs)));
    interactionRows.push([width, id, pair.nBefore, pair.before, pair.nAfter, pair.after, pair.delta,
      x.some(v => v.failed) ? 'failed' : (x.length ? 'ok' : 'missing'), y.some(v => v.failed) ? 'failed' : (y.length ? 'ok' : 'missing')]);
  }
}
const frameRows = [];
for (const width of widths) {
  const b = beforeRuns.get(width), a = afterRuns.get(width);
  const ids = [...new Set([...(b?.frames ?? []).map(x => x.id), ...(a?.frames ?? []).map(x => x.id)])].sort();
  for (const id of ids) {
    const x = (b?.frames ?? []).find(v => v.id === id), y = (a?.frames ?? []).find(v => v.id === id);
    frameRows.push([width,id,x?.p95Ms,y?.p95Ms,metricPair(x?.p95Ms,y?.p95Ms).delta,x?.p99Ms,y?.p99Ms,metricPair(x?.p99Ms,y?.p99Ms).delta,x?.over16_7ms,y?.over16_7ms]);
  }
}
const visualSummary = {
  referencePixelPairs: visualComparison.rows.length,
  exactPixelParityPairs: visualComparison.exactParityCount,
  nonExactPairs: visualComparison.rows.filter(row => !row.exactPixelParity).map(row => ({
    stem: row.stem,
    changedPixels: row.changedPixels,
    totalPixels: row.totalPixels,
    maxChannelDifference: row.maxChannelDifference,
  })),
  repeatVariation: {
    rows: visualRepeat.rows.length,
    maxChangedPixels: Math.max(0, ...visualRepeat.rows.map(row => row.changedPixels)),
    maxChannelDifference: Math.max(0, ...visualRepeat.rows.map(row => row.maxChannelDifference)),
  },
  uploadByteParity,
  browserLab: {
    results: visualLab.results.length,
    statuses: visualLab.results.reduce((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts; }, {}),
  },
  exportMutex: {
    pageCalls: exportMutex.profile.counters['export.page.calls'],
    blobsCreated: exportMutex.profile.counters['export.blob.created'],
    blobBytes: exportMutex.profile.counters['export.blob.bytes'],
    driver: exportMutex.driver,
  },
  cleanup: {
    lifetimeMs: exportCleanup.profile.timings.find(timing => timing.name === 'export.objectUrl.lifetime')?.durationMs ?? null,
    finalActiveCount: exportCleanup.profile.timings.filter(timing => timing.name === 'export.objectUrl.retained').at(-1)?.detail?.activeCount ?? null,
    finalActiveBytes: exportCleanup.profile.timings.filter(timing => timing.name === 'export.objectUrl.retained').at(-1)?.detail?.activeBytes ?? null,
    heapUsedBytesAfterTtl: exportCleanup.memory?.usedBytes ?? null,
    revokedCount: exportCleanup.profile.counters['export.objectUrl.revoked'] ?? null,
  },
  fontControl: {
    exactPixelParityPairs: visualFontControl.exactParityCount,
    referencePixelPairs: visualFontControl.rows.length,
    nonExactRows: visualFontControl.rows.filter(row => !row.exactPixelParity).map(row => ({
      stem: row.stem, changedPixels: row.changedPixels, totalPixels: row.totalPixels,
      maxChannelDifference: row.maxChannelDifference,
    })),
    method: visualFontControl.method,
  },
  fontFallbackControl: 'Completed same-browser control comparison; exact zero is not claimed. Final acceptance remains a release decision.',
};
const exportRows = [];
for (const width of widths) for (const format of exportTimings.viewports.find(v => v.width === width)?.formats ?? []) {
  exportRows.push([width, format.key, format.repetitions.before, format.repetitions.after,
    format.metrics.totalMs.before, format.metrics.totalMs.after, format.metrics.totalMs.delta,
    format.metrics.rendererMs.before, format.metrics.rendererMs.after]);
}
const pageExportMetric = (row, name) => row?.profile?.timings?.find(timing => timing.name === name)?.durationMs;
const pageExportRows = [];
for (const beforeRow of realExportMouseBefore) {
  const key = `${beforeRow.format.toLowerCase()}-${beforeRow.scale}x`;
  const afterRow = realExportMouseAfter.find(row => `${row.format.toLowerCase()}-${row.scale}x` === key);
  if (!afterRow) continue;
  const totalBefore = pageExportMetric(beforeRow, 'export.page.total');
  const totalAfter = pageExportMetric(afterRow, 'export.page.total');
  const rendererBefore = pageExportMetric(beforeRow, 'export.renderer.domToBlob');
  const rendererAfter = pageExportMetric(afterRow, 'export.renderer.domToBlob');
  pageExportRows.push([
    key, 1, 1, round(totalBefore), round(totalAfter), round(totalAfter - totalBefore),
    round(rendererBefore), round(rendererAfter),
    beforeRow.profile?.counters?.['render.CardPreview'] ?? '—',
    afterRow.profile?.counters?.['render.CardPreview'] ?? '—',
  ]);
}
const areaRows = [
  [1, 'Initial Editor usability', 'Warm first-usable p50 before → after: 390 137.1→139.4 ms; 1440 145.0→149.4 ms; 1920 142.8→140.1 ms. Interactive-ready p50: 65.4→71.4, 82.6→82.6, 81.9→80.9 ms. n=3 warm repeats/width.'],
  [2, 'Font and sample-image readiness', 'Warm font-ready p50 before→after: 390 78.2→84.7 ms; 1440 106.1→114.2; 1920 100.2→100.5. Sample decode wait: 57.6→54.7, 37.5→35.6, 41.8→40.5 ms respectively. Readiness timings are not transfer/CPU attribution.'],
  [3, 'JavaScript CPU and blocking', 'Exact JS CPU unavailable. Run-wide Long Tasks before→after: 1440 44 (max 961 ms)→66 (max 232 ms); 1920 29 (858)→30 (137); 390 26 (797)→18 (188). These mix scenarios. Approximate upload window: 3 fully-contained tasks (max 441 ms)→0 observed, using capturedAt/timeOrigin inference with 5 ms boundary exclusion; not an exact action trace or guaranteed zero blocking.'],
  [4, 'Native image drag', 'Before physical 5 s drags: 22/28/27 gestures at 1440/1920/390; RAF p95/p99 8.4/8.5, 8.4/8.5, 8.5/8.5 ms. After 1440: 28 gestures over 5.40 s, p95 8.4 ms; different gesture count/window means no CPU or frame improvement claim.'],
  [5, 'Image sliders', 'Synthetic range-input RAF p95/p99 after: at 1440 X 8.4/8.5, Y 8.5/16.7, Scale 16.7/16.8, brightness 8.4/8.7, contrast 8.4/16.6, saturation 16.7/16.7 ms; at 1920 p95 16.7–16.8 and p99 16.8–25; at 390 p95 8.4–16.7. 60 Hz p95 budget ≤17 ms is met to rounding; synthetic DOM input is not physical touch.'],
  [6, 'Template, ratio, typography, Job and locale', 'At 1440, 10-transition sequence totals before→after: template 606.5→503.5 ms; ratio 223.4→169.4; typography 247.8→205.7; Job 465.8→376.6; locale 456.5→349.2. Divide by 10 only for an arithmetic average, not per-transition samples. Longest after sequence is 390 template 940.8 ms (supplement, n=1; ≈94 ms/transition).'],
  [7, 'Text input', 'Synthetic EN/KO/JA action sequence totals before→after: 390 2543.7→2555.0 ms; 1440 2715.0→2430.8; 1920 2576.4→2711.9. Direct native-text after: matched Latin DOM-ready sample range 6.4–10.1 ms (n=15), KO 25.1/9.3/6.4 and JA 12.7/6.5/6.4 (n=3 each); before used a different Latin pattern, so no overall text-latency delta. Synthetic input is not OS IME composition.'],
  [8, 'React renders during transforms', 'Before physical 1440 drag recorded 210 image sets and 210 renders each for Inspector descendants, CardPreview and OpticalName while EditorWorkspace rendered once. After physical sample was 28 gestures/224 image writes; it is not the same interaction count, so no render-count reduction claim. Real ExportPage CardPreview renders fell 42→14 in matched native-mouse n=1/format samples.'],
  [9, 'Optical name/cache', 'During baseline native 1440 drag, no optical calculate, metric-cache hit/miss or font-ready work was recorded; OpticalName still rerendered with the card. After profiling keeps cache and Profiler IDs separate in `03-render-counts.json`; no transform-specific recalc delta is asserted.'],
  [10, 'Canonical renderer exports', 'At 1440, matched n=3 PNG2× median 1741.4→559.6 ms (−1181.8 ms, −67.9%); PNG1× 1674.0→441.5; WebP2× 1959.6→851.8; PNG4× 2235.8→947.7; WebP4× 2989.4→1723.1 ms. Across 390/1920 the one-sample PNG2× results are 1370.5→526.2 and 1646.9→484.8 ms. 4× capped at 21,994,385 pixels; 4× PNG budget ≤4 s met in observed runs.'],
  [11, 'Actual ExportPage and stages', 'Matched 1440 native-mouse n=1/format page totals before→after: PNG1/2/4 1550.5/8274.7/8544.4→552.2/506.2/858.2 ms; WebP2/4 1917.7/2445.6→654.9/1519.2 ms. PNG before varied substantially; keep n=1 caveat and keyboard captures separate. Renderer stages and dimensions in `04-export-timings.json`.'],
  [12, 'Draft, storage and history', 'In each continuous 5 s slider window, no draft persist/write fired before or after; one debounced flush happens after release outside that window. A grouped slider gesture adds one history entry. Native text hydration was 1.3 ms in baseline; storage/stringify sample calls are reported in `03-render-counts.json` and source captures, without inferring later flush cost from the active window.'],
  [13, 'Image upload/replacement', 'Two-file 1440 sequence total 1189.9→1142.6 ms; preparation stages before 524.6/569.4→after 549.6/518.1 ms (landscape/portrait), so preparation has no uniform gain. Upload window task overlap is approximate as area 3 states. Uploaded source remains byte-identical: 318,856 B, same SHA-256.'],
  [14, 'Peak memory and cleanup', 'Canonical stage-snapshot JS heap max before→after: 1440 268.3→61.2 MB, 1920 271.2→50.4, 390 191.7→53.9; separate canonical renderer in-progress peak bytes: 345,540,865→86,637,575; 308,233,715→57,340,081; 276,171,140→68,948,360 respectively. These are JS heap, not process/GPU totals. Actual ExportPage cleanup probe: one URL revoked after ~60,009 ms; active URLs/bytes ended at 0/0; heap 17,847,788 B.'],
  [15, 'Bundle, font, asset and network evidence', 'See `07-bundle-audit.md` and `final-build-audit.json`. CJK package inventory is 22,066,540 B (not session transfer); optimized export prepared 501 faces, selected 26 and inlined 793,480 B. Final normal build audit reports profiling flag off and no QA route. Browser resource cap is 6,000; 1440 reached it (partial), 1920/390 did not.'],
];
const performance = [
  '# Phase 2.9 Performance Profile', '',
  `Generated ${new Date().toISOString()} from assembled instrumented production records. This report compares data only; it does not claim a result for an absent scenario or substitute profile timing for user-visible FPS.`, '',
  '## Executive readout — all 15 requested areas', '',
  mdTable(['#','Measurement area','Measured result and interpretation'], areaRows), '',
  '### Top measured changes', '',
  '1. Canonical renderer PNG 2× at 1440 improved from 1,741.4 to 559.6 ms across matched n=3 runs (−1,181.8 ms / −67.9%); other format/scale results are in the table below.',
  '2. Font embedding work: the renderer embed-task count fell from 513 to 12 (matched PNG2× samples); the new preparation separately selected 26 of 501 registered faces and inlined 793,480 B. Those 26 font fetches precede the 12 renderer asset tasks. The packaged CJK inventory is 22,066,540 B, a different denominator; no matched 22 MB-to-0.79 MB network-transfer claim is made.',
  '3. Actual ExportPage CardPreview renders went from 42 (PNG) / 35 (WebP) to 14 in each matched native-mouse n=1 sample; preview font-load calls stayed at 14. This captures reduced card rerender work, not a stable page-export median.', '',
  '### Implementation and tradeoffs', '',
  '- `src/lib/image-processing.ts`: canvas.toBlob plus FileReader replaces synchronous data-URL encoding. MIME, quality, resize and shorter-fallback rules remain intact. Abort handling and bounded encode/read timeouts prevent late results from replacing a newer upload; elapsed preparation is not uniformly faster.',
  '- `src/lib/card-export/font-css.ts`: prepare only registered font faces needed by rendered text and pseudo content. Original WOFF2 bytes/descriptors/source order are retained. Per-operation deduplication, four concurrent fetches and a 24 MiB bound avoid a persistent cache; uncertain CSS/resources retain the original renderer scan inside the existing render timeout.',
  '- `src/app/export/page.tsx`: memoized CardPreview and stable per-ratio data avoid progress-driven card renders. Snapshot begin/end still renders all required previews and leaves 14 preview-font loads. Mutex, immutable snapshots and download URL TTL remain intact.',
  '- No Worker, custom scheduler, IndexedDB migration, new text cache, style/material change or image-history rewrite was justified by these measurements.', '',
  '### Budgets and measured priorities', '',
  '- RAF interval budget: p95 ≤17 ms (60 Hz interval proxy, not presented FPS). Synthetic range p95 after was at most 16.8 ms across these viewports; 1920 p99 still reached 25 ms.',
  '- Switch budget: approximately 100 ms per transition; after sequence/10 arithmetic averages were below 100 ms, with 390 template at 94.1 ms. These are sequence totals, not individual transition samples.',
  '- Export budgets: PNG 2× ≤2.5 s and normal hard-capped 4× (21,994,385 px) ≤4 s; all observed canonical samples were below these limits. 390/1920 have n=1 per format/scale.',
  '- Memory budget interpretation: browser JS heap only; do not compare these values to device RAM or GPU/canvas allocation.', '',
  'Priority ledger (measured findings, not a product bug count): P0 found/open 0/0. P1 found/resolved/open 2/2/0 (font subset embedding and upload Long Task overlap; upload interval is approximate clock reconstruction). P2 found/resolved/open 1/1/0 (ExportPage card/progress rerenders, 42→14). P3 found/accepted/open 1/1/0 (Inspector/JobPicker descendants render during image change, but measured Inspector incremental p95 was ~0.6 ms; no rewrite justified). The separate actual PNG-page comparison remains a sample-size caveat, not an additional confirmed defect. Assembled actions failed: 0.', '',
  '## Environment and comparability', '',
  `Before: ${before.environment?.mode ?? 'instrumented production'}; after: ${after.environment?.mode ?? 'instrumented production'}. See ` + '`01-baseline.json` and `02-optimized.json` for full browser, build, viewport, visibility and focus provenance.',
  `Hardware: ${baselineSource.environment?.platform ?? 'Windows'} ${baselineSource.environment?.release ?? ''}; ${baselineSource.environment?.cpuModel?.trim() ?? 'CPU not recorded'}, ${baselineSource.environment?.logicalProcessors ?? '—'} logical processors, ${(baselineSource.environment?.totalMemoryBytes / 1e9).toFixed(1)} GB system RAM reported; GPU model unavailable.`,
  `The uninstrumentedSourceFingerprint stored in these instrumented captures identifies the frozen source reference; it is not a hash of the current after-profile binary. The exact after profiling build ID was not captured. The final shipping source inventory covers ${optimizedSourceManifest.files.length} files and records normal build ID ${optimizedSourceManifest.buildId}; final-build-audit.json verifies profiling flag disabled and no QA route in its manifests.`,
  'Only matched viewports, scenarios, and export format/scale groups can support before/after deltas. Missing or differently sampled pairs remain unclaimed.', '',
  '## Final build and source-freeze checks', '',
  `Normal production build (Next ${finalVerification.build?.nextVersion ?? '16.3.7'}/Turbopack) and typecheck passed; lint passed; tests ${finalVerification.checks.test.pass}/${finalVerification.checks.test.pass + finalVerification.checks.test.fail} passed with ${finalVerification.checks.test.originalTestsRetained} original tests retained. Final normal build ID ${finalVerification.buildId} has profiling disabled, no Phase 2.9 QA route, and no profiling UI references. The source-freeze audit found no CSS or frozen-data changes. Normal browser smoke preserved the upload fixture, dispatched a successful PNG 2× export, confirmed profiling UI absent, and the temporary QA route returned 404. See final-verification.json and optimized-source.json for the 98-file source SHA inventory.`, '',
  '## Initial route', '',
  'The probe records direct `/editor` hydration/card/font/image readiness. First usable waits for optical readiness, fonts, decoded card images and two RAFs. JavaScript CPU time is unavailable; Long Tasks are not a substitute.', '',
  mdTable(['Viewport','n before','Before first usable p50 ms','n after','After ms','Delta ms','n before','Before interactive p50 ms','n after','After ms','Delta ms'], initialRows), '',
  '## Interactions and frame intervals', '',
  'Action durations are complete sequence times. RAF intervals are not GPU-presented FPS. `physical-cua-*` is separate from synthetic range events; trust and action details remain in the assembled records.', '',
  mdTable(['Viewport','Scenario','n before','Before p50 ms','n after','After p50 ms','Delta ms','Before status','After status'], interactionRows), '',
  mdTable(['Viewport','Scenario','Before RAF p95 ms','After p95 ms','Delta ms','Before RAF p99 ms','After p99 ms','Delta ms','Before >16.7 ms','After >16.7 ms'], frameRows), '',
  '## Export and render work', '',
  'Exports exclude debugTiming diagnostics. `rendererMs` is the measured renderer call; nested Profiler durations remain per Profiler ID and are not summed. Output dimensions/bytes are in `04-export-timings.json`.', '',
  mdTable(['Viewport','Format/scale','n before','n after','Total before p50 (ms)','Total after p50 (ms)','Delta (ms)','Renderer before p50 (ms)','Renderer after p50 (ms)'], exportRows), '',
  '### ExportPage through the native mouse download action', '',
  'Separate matched before/after native-mouse probes at 1440px (one sample per format/scale); do not combine with the keyboard-driven probe or treat n=1 as a stable median. PNG timing varied substantially across runs.', '',
  mdTable(['Format/scale','n before','n after','Page total before (ms)','after (ms)','delta (ms)','Renderer before (ms)','after (ms)','CardPreview renders before','after'], pageExportRows), '',
  'Preview font loads remain 14 per export (snapshot begin/end required); download dispatch is negligible in the source profiles. See `real-export-mouse-before.json` and `real-export-mouse-after.json` for full stages.', '',
  `The separate native double-click mutex probe produced ${visualSummary.exportMutex.pageCalls} page call and ${visualSummary.exportMutex.blobsCreated} blob (${visualSummary.exportMutex.blobBytes} B). The 60 s cleanup probe records URL lifetime ${round(visualSummary.cleanup.lifetimeMs)} ms, then ${visualSummary.cleanup.finalActiveCount} active URLs/${visualSummary.cleanup.finalActiveBytes} B; heap was ${mb(visualSummary.cleanup.heapUsedBytesAfterTtl)} and one revoke was recorded.`, '',
  '`03-render-counts.json` has scenario counters and each Profiler ID separately. `06-long-tasks.json` preserves raw observer entries and marks run-level attribution limits.', '',
  '## Memory and persistence', '',
  'See `05-memory-notes.md` for heap and RGBA estimates by stage. JS heap excludes native image decode, canvas, compositor and GPU memory. Draft write/serialization events are reported as measured, including zero counts; a zero within a slider window does not imply the later debounce flush did not occur.', '',
  '## 15-area closure', '',
  'Initial usability; font/image readiness; JS CPU/Long Tasks; native drag; image sliders; template/ratio/type/Job/locale switches; text input; React render counts; optical cache; PNG/WebP exports at 1×/2×/4×; export stages; draft/hydration/storage/history; image upload/replacement; peak memory/cleanup; bundle/font/asset/network evidence. Static bundle and asset data remain in `07-bundle-audit.md` and are not reinterpreted as browser transfer.', '',
  '## Visual freeze and behavior checks', '',
  `The strict RGBA reference comparison is ${visualSummary.exactPixelParityPairs}/${visualSummary.referencePixelPairs} exact pairs. The remaining pairs differ by ${Math.min(...visualSummary.nonExactPairs.map(x=>x.changedPixels))}–${Math.max(...visualSummary.nonExactPairs.map(x=>x.changedPixels))} changed pixels out of 5,832,000, with max channel delta ${Math.min(...visualSummary.nonExactPairs.map(x=>x.maxChannelDifference))}–${Math.max(...visualSummary.nonExactPairs.map(x=>x.maxChannelDifference))}/255. Same-source repeat capture varies up to ${visualSummary.repeatVariation.maxChangedPixels} pixels (max channel delta ${visualSummary.repeatVariation.maxChannelDifference}); do not describe this as byte-deterministic output.`,
  `The completed same-browser original-font-scan vs optimized-font-helper control is ${visualSummary.fontControl.exactPixelParityPairs}/${visualSummary.fontControl.referencePixelPairs} exact; the other four differ by ${Math.min(...visualSummary.fontControl.nonExactRows.map(x=>x.changedPixels))}–${Math.max(...visualSummary.fontControl.nonExactRows.map(x=>x.changedPixels))} pixels (max channel ${Math.max(...visualSummary.fontControl.nonExactRows.map(x=>x.maxChannelDifference))}/255). The freeze-board review found no material layout/font/image-quality change; exact zero is not claimed.`,
  `The real uploaded portrait source is byte-identical before/after (${visualSummary.uploadByteParity.beforeBytes} B; SHA-256 ${visualSummary.uploadByteParity.sha256}). Browser QA lab: ${visualSummary.browserLab.statuses.pass ?? 0} pass, ${visualSummary.browserLab.statuses.fail ?? 0} fail, ${visualSummary.browserLab.statuses.info ?? 0} info. Separate native double-click export-mutex probe: ${visualSummary.exportMutex.pageCalls} page call, ${visualSummary.exportMutex.blobsCreated} blob (${visualSummary.exportMutex.blobBytes} B). Export URL cleanup probe: ${visualSummary.cleanup.finalActiveCount} active URLs/${visualSummary.cleanup.finalActiveBytes} B after ${round(visualSummary.cleanup.lifetimeMs)} ms, JS heap ${mb(visualSummary.cleanup.heapUsedBytesAfterTtl)}, ${visualSummary.cleanup.revokedCount} revoke. ${visualSummary.fontFallbackControl}`, '',
  '## Review notes', '',
  'Do not claim improvement from an unmatched run, synthetic input as physical touch, RAF as GPU FPS, or incomplete resource log. Visual freeze and behavior checks are separate evidence and must be referenced from the final release record.', '',
].join('\n');

const beforeAfterRows = [
  '# Phase 2.9 Before/After', '',
  `Generated ${new Date().toISOString()}. Source inputs: assembled 01/02.`, '',
  '## Initial readiness', '',
  mdTable(['Viewport','n before','Before first usable p50 ms','n after','After ms','Delta ms','n before','Before interactive p50 ms','n after','After ms','Delta ms'], initialRows), '',
  '## Matched user actions', '',
  mdTable(['Viewport','Scenario','n before','Before p50 ms','n after','After p50 ms','Delta ms','Before status','After status'], interactionRows), '',
  mdTable(['Viewport','Scenario','Before RAF p95 ms','After p95 ms','Delta ms','Before RAF p99 ms','After p99 ms','Delta ms','Before >16.7 ms','After >16.7 ms'], frameRows), '',
  '## Matched primary exports', '',
  mdTable(['Viewport','Format/scale','n before','n after','Before total p50 ms','After total p50 ms','Delta ms','Before renderer p50 ms','After renderer p50 ms'], exportRows), '',
  '### ExportPage native mouse probe', '',
  'Separate 1440px one-sample native mouse runs; PNG timings are variable and should not be combined with the keyboard-driven run.', '',
  mdTable(['Format/scale','n before','n after','Page total before ms','after ms','delta ms','Renderer before ms','after ms','CardPreview before','after'], pageExportRows), '',
  '## Render counts, memory and Long Tasks', '',
  'See `03-render-counts.json`, `05-memory-notes.md`, and `06-long-tasks.json`. Profiler boundaries are inclusive and reported individually; nested timings are never summed. Long Tasks/LoAF are run-level unless the input records matching monotonic action-window bounds.', '',
  `## Visual evidence`, '',
  `${visualSummary.exactPixelParityPairs}/${visualSummary.referencePixelPairs} exact against frozen references. The four non-exact pairs: ${visualSummary.nonExactPairs.map(x=>`${x.stem}: ${x.changedPixels}/${x.totalPixels} changed pixels, max channel ${x.maxChannelDifference}/255`).join('; ')}. Repeat rasterization varies up to ${visualSummary.repeatVariation.maxChangedPixels} pixels (max channel ${visualSummary.repeatVariation.maxChannelDifference}/255). Upload bytes are identical (${visualSummary.uploadByteParity.beforeBytes} B). Font-control comparison is complete: ${visualSummary.fontControl.exactPixelParityPairs}/${visualSummary.fontControl.referencePixelPairs} exact, remaining ${Math.min(...visualSummary.fontControl.nonExactRows.map(x=>x.changedPixels))}–${Math.max(...visualSummary.fontControl.nonExactRows.map(x=>x.changedPixels))} changed pixels, max channel 2/255; zero differences are not claimed.`, '',
  'No improvement claim is generated where the before/after sample counts, scenario IDs, or viewports do not match.', '',
].join('\n');

await Promise.all([
  fs.writeFile(path.join(qa, '03-render-counts.json'), JSON.stringify(renderCounts, null, 2)),
  fs.writeFile(path.join(qa, '04-export-timings.json'), JSON.stringify(exportTimings, null, 2)),
  fs.writeFile(path.join(qa, '05-memory-notes.md'), memoryLines.join('\n')),
  fs.writeFile(path.join(qa, '06-long-tasks.json'), JSON.stringify(longTaskReport, null, 2)),
  fs.writeFile(path.join(qa, '08-before-after.md'), beforeAfterRows),
  fs.writeFile(path.join(qa, 'PERFORMANCE.md'), performance),
]);
console.log(JSON.stringify({
  reports: ['03-render-counts.json','04-export-timings.json','05-memory-notes.md','06-long-tasks.json','08-before-after.md','PERFORMANCE.md'],
  viewports: widths,
  initialPairs: initialRows.length,
  actionPairs: interactionRows.length,
  exportPairs: exportRows.length,
}, null, 2));

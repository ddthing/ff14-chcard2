import fs from 'node:fs/promises';
const sources = ['raw/before-1440-upload-v3.json', 'raw/after-1440-canonical.json'];
const rows = [];
for (const source of sources) {
  const run = JSON.parse(await fs.readFile(`docs/qa/phase29/${source}`, 'utf8'));
  const profile = run.scenarioProfiles.find(p => p.id === 'actual-source-drop-upload-replace');
  const action = run.userActionSequences.find(p => p.id === profile.id);
  const endMs = profile.capturedAt - run.environment.timeOriginEpochMs;
  const startMs = endMs - action.durationMs;
  const marginMs = 5;
  const contained = run.longTasks.filter(task => task.startTime >= startMs + marginMs && task.startTime + task.duration <= endMs - marginMs);
  rows.push({ source, actionId: profile.id, actionCount: action.actionCount, startMs, endMs, marginMs, longTasksFullyInsideApproximateWindow: contained, maximumDurationMs: Math.max(0, ...contained.map(t => t.duration)) });
}
const report = { method: 'Approximate upload-sequence bounds reconstructed from the scenario end capturedAt (Date.now), recorded duration (performance.now), and document timeOrigin. Only tasks fully inside with a 5ms boundary exclusion are counted. This is clock-alignment inference, not an exact monotonic action trace or JS CPU profiler.', rows };
await fs.writeFile('docs/qa/phase29/upload-long-task-bounds.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

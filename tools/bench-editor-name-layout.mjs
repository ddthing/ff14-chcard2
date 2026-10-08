import { register } from 'node:module';
import { performance } from 'node:perf_hooks';

register('../tests/ts-alias-loader.mjs', import.meta.url);

const { getCardNameLayout } = await import('../src/lib/card-name-layout.ts');
const iterations = Number(process.argv.find((value) => value.startsWith('--iterations='))?.split('=')[1] ?? 2000);
const batches = Number(process.argv.find((value) => value.startsWith('--batches='))?.split('=')[1] ?? 7);
const name = '카엘 오리온 달빛 기사의 기록'.repeat(2);
let checksum = 0;
const timings = [];

for (let batch = 0; batch < batches + 1; batch += 1) {
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const layout = getCardNameLayout(name, 'ko');
    checksum += layout.maxLineUnits + layout.lines.length;
  }
  const durationMs = performance.now() - start;
  if (batch > 0) timings.push(durationMs);
}

const sorted = [...timings].sort((a, b) => a - b);
console.log(JSON.stringify({
  benchmark: 'repeated-editor-card-name-layout',
  iterationsPerBatch: iterations,
  measuredBatches: batches,
  medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
  p95Ms: Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(3)),
  checksum,
}, null, 2));

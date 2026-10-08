import { register } from 'node:module';
import { performance } from 'node:perf_hooks';

register('../tests/ts-alias-loader.mjs', import.meta.url);

// This standalone process needs counters enabled before importing the profiler.
process.env.NEXT_PUBLIC_PERFORMANCE_PROFILING = '1';

const [{ demoAdventurerData }, { persistEditorDraft, EDITOR_STORAGE_KEY }, { profileRead, profileReset }] = await Promise.all([
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
  import('../src/lib/performance-profile.ts'),
]);

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const payloadBytes = Number(process.argv.find((value) => value.startsWith('--payload-mib='))?.split('=')[1] ?? 4);
const iterations = Number(process.argv.find((value) => value.startsWith('--iterations='))?.split('=')[1] ?? 20);
const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };
const imageUrl = `data:image/png;base64,${'A'.repeat(payloadBytes * 1024 * 1024)}`;
const card = { ...demoAdventurerData, imageUrl };

persistEditorDraft(card, storage);
profileReset();

const timings = [];
for (let index = 0; index < iterations; index += 1) {
  const updated = {
    ...card,
    character: { ...card.character, name: `Benchmark Adventurer ${index}` },
  };
  const start = performance.now();
  if (!persistEditorDraft(updated, storage)) throw new Error('Draft persistence failed during benchmark');
  timings.push(performance.now() - start);
}

const sorted = [...timings].sort((a, b) => a - b);
const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
const profile = profileRead();
console.log(JSON.stringify({
  benchmark: 'persist-editor-draft-with-large-image',
  payloadMiB: payloadBytes,
  serializedLength: storage.getItem(EDITOR_STORAGE_KEY).length,
  iterations,
  medianMs: Number(percentile(0.5).toFixed(3)),
  p95Ms: Number(percentile(0.95).toFixed(3)),
  parseExistingCalls: profile.counters['draft.persistEditorDraft.parseExisting.calls'] ?? 0,
  writes: profile.counters['draft.persistEditorDraft.writes'] ?? 0,
}, null, 2));

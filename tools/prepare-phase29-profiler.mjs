import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [
  ['docs/qa/phase29/qa-profiler-page.tsx.txt', 'src/app/qa-phase29/page.tsx'],
  ['docs/qa/phase29/qa-profiler-client.tsx.txt', 'src/app/qa-phase29/profiler-client.tsx'],
  ['docs/qa/phase29/qa-profiler-collector.ts.txt', 'src/app/qa-phase29/collect/route.ts'],
];

if (process.argv.includes('--remove')) {
  for (const [, target] of outputs) await rm(resolve(root, target), { force: true });
  console.log('Removed temporary Phase 2.9 profiler routes. Archived sources remain in docs/qa/phase29/.');
} else {
  for (const [template, targetPath] of outputs) {
    const target = resolve(root, targetPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(resolve(root, template), 'utf8'), 'utf8');
  }
  console.log('Installed opt-in /qa-phase29. Set NEXT_PUBLIC_PERFORMANCE_PROFILING=1 before a production --profile build.');
}

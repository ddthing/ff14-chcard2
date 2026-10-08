import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'docs/qa/phase2141/qa-source');
const sources = [
  ['src/app/qa-phase2141/page.tsx', 'src__app__qa-phase2141__page.tsx.txt'],
  ['src/app/qa-phase2141/lab-client.tsx', 'src__app__qa-phase2141__lab-client.tsx.txt'],
  ['src/app/qa-phase2141/collect/route.ts', 'src__app__qa-phase2141__collect__route.ts.txt'],
  ['src/app/qa-phase2141-fixture/fixture.tsx', 'src__app__qa-phase2141-fixture__fixture.tsx.txt'],
  ['src/app/qa-phase2141-performance/fixture.tsx', 'src__app__qa-phase2141-performance__fixture.tsx.txt'],
  ['tools/compare-phase2141-isolation.mjs', 'tools__compare-phase2141-isolation.mjs.txt'],
  ['tools/compare-phase2141-aa.mjs', 'tools__compare-phase2141-aa.mjs.txt'],
  ['tools/prepare-phase2141-editor-evidence.mjs', 'tools__prepare-phase2141-editor-evidence.mjs.txt'],
  ['tools/phase2141-performance-report.mjs', 'tools__phase2141-performance-report.mjs.txt'],
  ['tools/prepare-phase2141-qa.mjs', 'tools__prepare-phase2141-qa.mjs.txt'],
];

await fs.mkdir(archive, { recursive: true });
for (const [source, destination] of sources) {
  await fs.copyFile(path.join(root, source), path.join(archive, destination));
}
console.log(`Archived ${sources.length} temporary Phase 2.14.1 QA sources under docs/qa/phase2141/qa-source.`);

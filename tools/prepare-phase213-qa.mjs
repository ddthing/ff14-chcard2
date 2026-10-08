import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/qa/phase213-material/qa-source');
const sources = [
  ['src/app/qa-phase213/page.tsx', 'src__app__qa-phase213__page.tsx.txt'],
  ['src/app/qa-phase213/lab-client.tsx', 'src__app__qa-phase213__lab-client.tsx.txt'],
  ['src/app/qa-phase213/collect/route.ts', 'src__app__qa-phase213__collect__route.ts.txt'],
  ['src/app/qa-phase213-fixture/fixture.tsx', 'src__app__qa-phase213-fixture__fixture.tsx.txt'],
  ['tools/prepare-phase213-qa.mjs', 'tools__prepare-phase213-qa.mjs.txt'],
  ['tools/compare-phase213-material.mjs', 'tools__compare-phase213-material.mjs.txt'],
];

await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(root, 'docs/qa/phase213-material/comparison'), { recursive: true });
for (const [source, archive] of sources) {
  await fs.copyFile(path.join(root, source), path.join(output, archive));
}
console.log(`Archived ${sources.length} Phase 2.13 QA sources to ${path.relative(root, output).replaceAll('\\', '/')}.`);

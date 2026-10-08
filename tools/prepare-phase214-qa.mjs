import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/qa/phase214/qa-source');
const sources = [
  ['src/app/qa-phase214/page.tsx', 'src__app__qa-phase214__page.tsx.txt'],
  ['src/app/qa-phase214/lab-client.tsx', 'src__app__qa-phase214__lab-client.tsx.txt'],
  ['src/app/qa-phase214/collect/route.ts', 'src__app__qa-phase214__collect__route.ts.txt'],
  ['src/app/qa-phase214-fixture/fixture.tsx', 'src__app__qa-phase214-fixture__fixture.tsx.txt'],
  ['tools/prepare-phase214-qa.mjs', 'tools__prepare-phase214-qa.mjs.txt'],
  ['tools/compare-phase214-themes.mjs', 'tools__compare-phase214-themes.mjs.txt'],
  ['tools/prepare-phase214-screenshots.mjs', 'tools__prepare-phase214-screenshots.mjs.txt'],
];

await fs.mkdir(output, { recursive: true });
for (const [source, archive] of sources) {
  await fs.copyFile(path.join(root, source), path.join(output, archive));
}
console.log(`Archived ${sources.length} Phase 2.14 QA sources to ${path.relative(root, output).replaceAll('\\', '/')}.`);

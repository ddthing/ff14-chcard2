import { mkdir, copyFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'docs', 'qa', 'phase215', 'qa-source');
const tempRoutes = [
  path.join(root, 'src', 'app', 'qa-phase215'),
  path.join(root, 'src', 'app', 'qa-phase215-fixture'),
];
const sources = [
  ['src/app/qa-phase215/page.tsx', 'src__app__qa-phase215__page.tsx.txt'],
  ['src/app/qa-phase215/lab-client.tsx', 'src__app__qa-phase215__lab-client.tsx.txt'],
  ['src/app/qa-phase215/collect/route.ts', 'src__app__qa-phase215__collect__route.ts.txt'],
  ['src/app/qa-phase215-fixture/fixture.tsx', 'src__app__qa-phase215-fixture__fixture.tsx.txt'],
  ['tools/phase215-source-freeze.mjs', 'tools__phase215-source-freeze.mjs.txt'],
  ['tools/compare-phase215-exports.mjs', 'tools__compare-phase215-exports.mjs.txt'],
  ['tools/compare-phase215-style-audits.mjs', 'tools__compare-phase215-style-audits.mjs.txt'],
  ['tools/create-phase215-review-boards.mjs', 'tools__create-phase215-review-boards.mjs.txt'],
  ['tools/capture-phase215-before-ui-css.mjs', 'tools__capture-phase215-before-ui-css.mjs.txt'],
  ['tools/prepare-phase215-qa.mjs', 'tools__prepare-phase215-qa.mjs.txt'],
];

await mkdir(archive, { recursive: true });
for (const [source, destination] of sources) await copyFile(path.join(root, source), path.join(archive, destination));
console.log(`Archived ${sources.length} temporary Phase 2.15 QA sources under docs/qa/phase215/qa-source.`);

if (process.argv.includes('--clean')) {
  for (const target of tempRoutes) {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Refusing cleanup outside workspace: ${resolved}`);
    const info = await stat(resolved).catch(() => null);
    if (info?.isDirectory()) await rm(resolved, { recursive: true, force: false });
  }
  console.log('Removed temporary Phase 2.15 QA routes. Permanent tools and archived source remain.');
}

import { copyFile, lstat, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'docs', 'qa', 'phase217', 'qa-source');
const entries = [
  ['src/app/qa-phase217/page.tsx', 'src__app__qa-phase217__page.tsx.txt'],
  ['src/app/qa-phase217/fixture.tsx', 'src__app__qa-phase217__fixture.tsx.txt'],
  ['src/app/qa-phase217/collect/route.ts', 'src__app__qa-phase217__collect__route.ts.txt'],
  ['src/app/editor/qa-phase217-performance/page.tsx', 'src__app__editor__qa-phase217-performance__page.tsx.txt'],
  ['src/app/editor/qa-phase217-performance/client.tsx', 'src__app__editor__qa-phase217-performance__client.tsx.txt'],
  ['tools/phase217-source-freeze.mjs', 'tools__phase217-source-freeze.mjs.txt'],
  ['tools/prepare-phase217-qa.mjs', 'tools__prepare-phase217-qa.mjs.txt'],
  ['tools/compare-phase217-exports.mjs', 'tools__compare-phase217-exports.mjs.txt'],
  ['tools/repair-phase217-before-metadata.mjs', 'tools__repair-phase217-before-metadata.mjs.txt'],
  ['tools/phase217-ui-seed.mjs', 'tools__phase217-ui-seed.mjs.txt'],
];
const routeDirs = ['src/app/qa-phase217', 'src/app/editor/qa-phase217-performance'];
const restoring = process.argv.includes('--restore');
const cleaning = process.argv.includes('--clean');
if (restoring && cleaning) throw new Error('Use either --restore or --clean, not both.');

await mkdir(archive, { recursive: true });
for (const [relative, storedName] of entries) {
  const source = path.join(root, relative);
  const stored = path.join(archive, storedName);
  if (restoring) {
    await mkdir(path.dirname(source), { recursive: true });
    await copyFile(stored, source);
  } else {
    const info = await lstat(source).catch(() => null);
    if (!info?.isFile()) throw new Error(`Temporary QA source is missing: ${relative}`);
    await copyFile(source, stored);
  }
}

if (cleaning) {
  for (const relative of routeDirs) {
    const target = path.resolve(root, relative);
    const expected = path.join(root, relative);
    if (target !== expected || !target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe cleanup path: ${target}`);
    const info = await lstat(target).catch(() => null);
    if (!info) continue;
    if (!info.isDirectory()) throw new Error(`Refusing to clean non-directory QA route: ${target}`);
    await rm(target, { recursive: true, force: false });
  }
}

console.log(JSON.stringify({
  action: restoring ? 'restored' : cleaning ? 'archived-and-cleaned' : 'archived',
  archive: path.relative(root, archive),
  files: entries.map(([, name]) => name),
  removedRoutes: cleaning ? routeDirs : [],
}, null, 2));

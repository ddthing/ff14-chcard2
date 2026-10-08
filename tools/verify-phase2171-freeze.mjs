import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'docs/qa/phase2171');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, ''));
const allowedChanges = new Set([
  'src/app/editor/editor.module.css',
  'src/components/app-shell.module.css',
  'src/components/editor/toolbar-tooltip-button.tsx',
  'src/components/editor/toolbar-tooltip.module.css',
]);
const allowedAdditions = new Set(['src/components/editor/toolbar-tooltip-placement.ts']);
async function collect(folder) {
  const files = [];
  for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
    const name = path.posix.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await collect(name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}
const protectedBaseline = await readJson(path.join(qa, 'before-protected-source.json'));
const sourceBaseline = await readJson(path.join(qa, 'before-source.json'));
const protectedFiles = [];
for (const file of protectedBaseline.protectedFiles) {
  const sha256 = hash(await readFile(path.join(root, file.path)));
  protectedFiles.push({ path: file.path, sha256, same: sha256 === file.sha256 });
}
const beforeMap = new Map(sourceBaseline.map(row => [row.path, row.sha256]));
const sourceFiles = [];
for (const file of await collect('src')) sourceFiles.push({ path: file, sha256: hash(await readFile(path.join(root, file))) });
const afterMap = new Map(sourceFiles.map(row => [row.path, row.sha256]));
const changedSource = sourceFiles.filter(row => beforeMap.has(row.path) && beforeMap.get(row.path) !== row.sha256)
  .map(row => ({ ...row, before: beforeMap.get(row.path) }));
const addedSource = sourceFiles.filter(row => !beforeMap.has(row.path)).map(row => row.path);
const removedSource = sourceBaseline.filter(row => !afterMap.has(row.path)).map(row => row.path);
const testNames = text => text.split(/\r?\n/u).map(line => line.trim())
  .filter(line => line.startsWith('✔ ')).map(line => line.slice(2).replace(/ \([\d.]+ms\)$/u, ''));
const oldTests = testNames(await readFile(path.join(root, 'docs/qa/phase217/test-final.log'), 'utf8'));
const currentTests = testNames(await readFile(path.join(qa, 'test-final.log'), 'utf8'));
const counts = new Map();
for (const name of currentTests) counts.set(name, (counts.get(name) ?? 0) + 1);
const missingOriginalTests = [];
for (const name of oldTests) {
  const remaining = counts.get(name) ?? 0;
  if (!remaining) missingOriginalTests.push(name);
  else counts.set(name, remaining - 1);
}
const concurrentSourceChanges = [
  ...changedSource.filter(row => !allowedChanges.has(row.path)).map(row => ({ path: row.path, kind: 'changed' })),
  ...addedSource.filter(file => !allowedAdditions.has(file)).map(file => ({ path: file, kind: 'added' })),
  ...removedSource.map(file => ({ path: file, kind: 'removed' })),
];
const report = {
  generatedAt: new Date().toISOString(),
  protectedCount: protectedFiles.length,
  protectedExact: protectedFiles.every(row => row.same),
  sourceScopeExact: changedSource.every(row => allowedChanges.has(row.path))
    && addedSource.every(file => allowedAdditions.has(file)) && removedSource.length === 0,
  changedSource, addedSource, removedSource, protectedFiles, sourceFiles,
  originalTestCount: oldTests.length, currentTestCount: currentTests.length, missingOriginalTests,
  cleanupOwnedChanges: changedSource.filter(row => allowedChanges.has(row.path)),
  cleanupOwnedAdditions: addedSource.filter(file => allowedAdditions.has(file)),
  concurrentSourceChanges,
  concurrentChangeNote: 'A separate active same-workspace chat, Build phase 3.0 web experience, changed Home/Templates/marketing/AppShell routing while this cleanup was running. These source differences are preserved and are not claimed as Phase 2.17.1 changes. Full-workspace sourceScopeExact remains false; the protected169-file boundary is still exact.',
};
await writeFile(path.join(qa, 'source-freeze.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ protectedCount: report.protectedCount, protectedExact: report.protectedExact,
  sourceScopeExact: report.sourceScopeExact, originalTestCount: oldTests.length,
  currentTestCount: currentTests.length, missingOriginalTests, concurrentChanges: concurrentSourceChanges.length }, null, 2));
if (!report.protectedExact || oldTests.length !== 215 || missingOriginalTests.length) process.exitCode = 1;

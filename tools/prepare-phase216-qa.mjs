import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'docs/qa/phase216-job-icons/qa-source');
const route = path.join(root, 'src/app/qa-phase216');
const files = ['page.tsx', 'fixture.tsx', 'collect/route.ts'];
const restoring = process.argv.includes('--restore');
await mkdir(archive, { recursive: true });
for (const file of files) {
  const source = path.join(route, file);
  const stored = path.join(archive, `${file.replaceAll('/', '__')}.txt`);
  if (restoring) {
    await mkdir(path.dirname(source), { recursive: true });
    await copyFile(stored, source);
  } else await copyFile(source, stored);
}
if (process.argv.includes('--clean')) {
  const absoluteTarget = path.resolve(route);
  if (absoluteTarget !== path.resolve(root, 'src/app/qa-phase216') || !absoluteTarget.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe cleanup path: ${absoluteTarget}`);
  if ((await stat(absoluteTarget)).isDirectory()) await rm(absoluteTarget, { recursive: true, force: false });
}
console.log(restoring ? 'Restored development-only Phase 2.16 QA route.' : 'Archived production-component QA fixture; temporary route cleaned only when --clean was supplied.');

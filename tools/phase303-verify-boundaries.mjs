import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const out = 'docs/qa/phase303-job-lock';
const before = JSON.parse(await readFile(path.join(root, out, 'production-source-before.json'), 'utf8'));
const allowed = new Set([
  'src/components/cards/card-job-motif.tsx', 'src/components/cards/card-job-motif.module.css',
  'src/lib/job-motif-tokens.ts',
  'src/lib/job-identity-optics.ts',
  'public/images/hero-adventurer.webp', 'public/images/kael-adventurer.webp', 'public/images/seraphine-adventurer.webp',
  ...['cinematic', 'editorial', 'identity'].flatMap(f => [`src/components/cards/masters/${f}-master.tsx`, `src/components/cards/masters/${f}-master.module.css`]),
]);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) await walk(relative);
    else if (entry.isFile()) files.push(relative);
  }
}
for (const dir of ['src', 'public', 'licenses']) await walk(dir);
files.push(...before.files.map(x => x.path).filter(x => !/^(src|public|licenses)\//.test(x)));
const after = [];
for (const file of [...new Set(files)].sort()) {
  const bytes = await readFile(path.join(root, file));
  after.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const old = new Map(before.files.map(x => [x.path, x.sha256]));
const now = new Map(after.map(x => [x.path, x.sha256]));
const changed = after.filter(x => old.has(x.path) && old.get(x.path) !== x.sha256).map(x => x.path);
const added = after.filter(x => !old.has(x.path)).map(x => x.path);
const removed = before.files.filter(x => !now.has(x.path)).map(x => x.path);
const unauthorized = [...changed, ...added, ...removed].filter(x => !allowed.has(x));
const report = { recordedAt: new Date().toISOString(), allowed: [...allowed], changed, added, removed, unauthorized, protectedBoundaryPass: unauthorized.length === 0, sourceBeforeCount: before.fileCount, sourceAfterCount: after.length };
await writeFile(path.join(root, out, 'production-source-after.json'), JSON.stringify({ stage: 'after', files: after, fileCount: after.length }, null, 2));
await writeFile(path.join(root, out, 'protected-boundary-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (unauthorized.length) process.exitCode = 1;

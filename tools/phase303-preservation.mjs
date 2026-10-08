import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'docs/qa/phase303-job-lock');
const stage = process.argv.includes('--after') ? 'after' : 'before';
const paths = [];
async function walk(dir) {
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) await walk(relative);
    else if (entry.isFile()) paths.push(relative);
  }
}
for (const dir of ['docs/qa/phase301-card-type-job', 'docs/qa/phase302-jobmark-correction']) await walk(dir);
paths.push('docs/design/font-candidates.md');
for (const name of await readdir(path.join(root, 'tools'))) if (/^phase30[12].*\.mjs$/.test(name)) paths.push(`tools/${name}`);
const files = [];
for (const file of paths.sort()) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(path.join(root, file))) { hash.update(chunk); bytes += chunk.length; }
  files.push({ path: file, bytes, sha256: hash.digest('hex') });
}
await mkdir(out, { recursive: true });
const report = { stage, recordedAt: new Date().toISOString(), fileCount: files.length, files };
if (stage === 'after') {
  const before = JSON.parse(await readFile(path.join(out, 'explorations-before.json'), 'utf8'));
  const old = new Map(before.files.map(x => [x.path, x.sha256]));
  const now = new Map(files.map(x => [x.path, x.sha256]));
  const changed = files.filter(x => old.has(x.path) && old.get(x.path) !== x.sha256).map(x => x.path);
  const added = files.filter(x => !old.has(x.path)).map(x => x.path);
  const removed = before.files.filter(x => !now.has(x.path)).map(x => x.path);
  report.comparison = { exactMatch: !changed.length && !added.length && !removed.length, changed, added, removed };
  if (!report.comparison.exactMatch) process.exitCode = 1;
}
await writeFile(path.join(out, `explorations-${stage}.json`), JSON.stringify(report, null, 2), { flag: stage === 'before' ? 'wx' : 'w' });
console.log(JSON.stringify({ stage, fileCount: files.length, comparison: report.comparison }));

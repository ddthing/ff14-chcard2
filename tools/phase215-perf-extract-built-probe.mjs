import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const stage = process.argv[2];
if (stage !== 'before' && stage !== 'after') throw new Error('Usage: node tools/phase215-perf-extract-built-probe.mjs before|after');

const sourceMapDirectory = path.join(root, '.next', 'server', 'chunks', 'ssr');
const sourceMaps = (await readdir(sourceMapDirectory)).filter((name) => name.endsWith('.js.map'));
const targetSuffix = '/src/app/qa-phase215-performance/probe.tsx';
const hash = (value) => createHash('sha256').update(value).digest('hex');
let found = null;

for (const name of sourceMaps) {
  const absolute = path.join(sourceMapDirectory, name);
  const bytes = await readFile(absolute);
  const map = JSON.parse(bytes.toString('utf8'));
  const index = (map.sources ?? []).findIndex((source) => String(source).replaceAll('\\', '/').endsWith(targetSuffix));
  if (index < 0) continue;
  const source = map.sourcesContent?.[index];
  if (typeof source !== 'string') throw new Error(`SSR map has no embedded source for ${map.sources[index]}.`);
  if (found && found.source !== source) throw new Error('Multiple SSR maps contain differing performance-probe source text.');
  const chunkName = name.slice(0, -4);
  const chunkPath = path.join(sourceMapDirectory, chunkName);
  const chunk = await readFile(chunkPath).catch(() => null);
  found ??= { source, sourceMap: path.relative(root, absolute), sourceMapSha256: hash(bytes), sourceMapEntry: map.sources[index], chunkPath: chunk ? path.relative(root, chunkPath) : null, chunkSha256: chunk ? hash(chunk) : null };
}

if (!found) throw new Error(`No SSR source map under ${path.relative(root, sourceMapDirectory)} contains the performance probe source.`);

const currentSource = await readFile(path.join(root, 'src', 'app', 'qa-phase215-performance', 'probe.tsx'));
const archive = path.join(root, 'docs', 'qa', 'phase215', 'qa-source');
await mkdir(archive, { recursive: true });
const extractedName = `built-${stage}-src__app__qa-phase215-performance__probe.tsx.txt`;
const { source: extractedSource, ...mapMetadata } = found;
await writeFile(path.join(archive, extractedName), extractedSource, 'utf8');

const metadata = {
  schema: 'qa215-built-probe-source-v1', stage,
  buildId: (await readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8')).trim(),
  ...mapMetadata,
  extractedSource: `docs/qa/phase215/qa-source/${extractedName}`,
  extractedSourceSha256: hash(extractedSource),
  currentWorkspaceSourceSha256: hash(currentSource),
  exactSourceMatch: Buffer.compare(Buffer.from(extractedSource, 'utf8'), currentSource) === 0,
};
await writeFile(path.join(archive, `built-${stage}-probe-source.json`), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(metadata, null, 2));

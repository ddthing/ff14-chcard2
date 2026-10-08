import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs', 'qa', 'phase215');
const patterns = [
  'src/components/cards',
  'src/components/ffxiv/job-icon.tsx',
  'src/components/ffxiv/job-icon.module.css',
  'src/components/editor/card-preview.tsx',
  'src/data/fonts',
  'src/data/ffxiv',
  'src/data/samples/coner.ts',
  'src/lib/card-export',
  'src/lib/card-art-tokens.ts',
  'src/lib/card-materials.ts',
  'src/lib/job-themes.ts',
  'src/lib/job-motif-tokens.ts',
  'src/lib/typography-presets.ts',
  'src/store/editor-store.ts',
  'src/store/editor-persistence.ts',
  'src/lib/app-appearance.ts',
  'src/components/theme-provider.tsx',
  'src/lib/ffxiv-assets',
  'public/images/materials',
  'public/fonts',
  'public/assets/samples/coner',
  'public/assets/ffxiv/jobs',
  'package.json',
  'package-lock.json',
];

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function collectFiles(relative) {
  const absolute = path.join(root, relative);
  const info = await stat(absolute).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [relative.replaceAll('\\', '/')];
  if (!info.isDirectory()) return [];
  const result = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

async function snapshot(stage) {
  const missingRoots = [];
  for (const relative of patterns) {
    if (!await stat(path.join(root, relative)).catch(() => null)) missingRoots.push(relative);
  }
  if (missingRoots.length) throw new Error(`Protected source roots are missing and cannot be silently omitted: ${missingRoots.join(', ')}`);
  const files = [...new Set((await Promise.all(patterns.map(collectFiles))).flat())].sort();
  const rows = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(root, relative));
    rows.push({ path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  const report = {
    schema: 'phase215-protected-source-freeze-v1',
    generatedAt: new Date().toISOString(),
    stage,
    rule: 'These inputs must remain byte-identical across Phase 2.15 UI polish. This inventory covers Master card implementation and tokens/materials, preview/export, persistence/store, typography/data, theme state/scope contract, and declared dependency manifests.',
    protectedRoots: patterns,
    fileCount: rows.length,
    files: rows,
    inventorySha256: sha256(Buffer.from(JSON.stringify(rows))),
  };
  const destination = path.join(qaRoot, `${stage}-source-freeze.json`);
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ saved: path.relative(root, destination), fileCount: rows.length, inventorySha256: report.inventorySha256 }, null, 2));
}

function assertStage(value) {
  if (value !== 'before' && value !== 'after') throw new Error('Usage: node tools/phase215-source-freeze.mjs before|after');
  return value;
}

const stage = assertStage(process.argv[2]);
await snapshot(stage);
if (stage === 'after') {
  const beforePath = path.join(qaRoot, 'before-source.json');
  const afterPath = path.join(qaRoot, 'after-source-freeze.json');
  const [beforeBytes, afterBytes] = await Promise.all([readFile(beforePath), readFile(afterPath)]);
  const before = JSON.parse(beforeBytes.toString('utf8'));
  const after = JSON.parse(afterBytes.toString('utf8'));
  const beforeByPath = new Map(before.files.map((row) => [row.path ?? row.file, row]));
  const afterByPath = new Map(after.files.map((row) => [row.path, row]));
  const isProtected = (file) => patterns.some((protectedRoot) => file === protectedRoot || file.startsWith(`${protectedRoot.replaceAll('\\', '/')}/`));
  const protectedBefore = new Map([...beforeByPath].filter(([file]) => isProtected(file)));
  const protectedAfter = new Map([...afterByPath].filter(([file]) => isProtected(file)));
  const changedFiles = [...protectedAfter].flatMap(([file, current]) => {
    const old = protectedBefore.get(file);
    return old && old.sha256 !== current.sha256 ? [{ path: file, before: old.sha256, after: current.sha256 }] : [];
  });
  const missingBefore = [...protectedAfter.keys()].filter((file) => !protectedBefore.has(file)).sort();
  const missingAfter = [...protectedBefore.keys()].filter((file) => !protectedAfter.has(file)).sort();
  const comparison = {
    schema: 'phase215-protected-source-freeze-diff-v1',
    generatedAt: new Date().toISOString(),
    baselineSource: 'docs/qa/phase215/before-source.json (pre-edit all-source snapshot)',
    baselineFiles: before.files.length,
    matchedProtectedBaselineFiles: protectedBefore.size,
    afterProtectedFiles: protectedAfter.size,
    exact: changedFiles.length === 0 && missingBefore.length === 0 && missingAfter.length === 0,
    completeCoverage: missingBefore.length === 0 && missingAfter.length === 0,
    changedCount: changedFiles.length,
    changes: changedFiles,
    unbaselinedProtectedPaths: missingBefore,
    removedProtectedPaths: missingAfter,
    afterInventorySha256: after.inventorySha256,
  };
  const output = path.join(qaRoot, 'source-freeze-diff.json');
  await writeFile(output, `${JSON.stringify(comparison, null, 2)}\n`);
  console.log(JSON.stringify({ comparison: path.relative(root, output), exact: comparison.exact, completeCoverage: comparison.completeCoverage, changedCount: comparison.changedCount, unbaselinedProtectedPaths: missingBefore, removedProtectedPaths: missingAfter, changes: changedFiles }, null, 2));
  if (!comparison.exact) process.exitCode = 1;
}

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs', 'qa', 'phase217');

// These files define card content, typography, materials, preview/export pixels,
// job artwork, theme isolation, interactions, or persistence and must not change.
const protectedRoots = [
  'src/components/cards',
  'src/components/ffxiv',
  'src/components/editor/card-preview.tsx',
  'src/components/theme-provider.tsx',
  'src/data/fonts',
  'src/data/ffxiv',
  'src/data/samples/coner.ts',
  'src/lib/card-export',
  'src/lib/card-art-tokens.ts',
  'src/lib/card-materials.ts',
  'src/lib/job-themes.ts',
  'src/lib/job-motif-tokens.ts',
  'src/lib/typography-presets.ts',
  'src/lib/app-appearance.ts',
  'src/store/editor-store.ts',
  'src/store/editor-persistence.ts',
  'src/app/app-theme.css',
  'src/app/editor/interaction-tokens.css',
  'src/app/fonts.css',
  'src/lib/ffxiv-assets',
  'public/images/materials',
  'public/fonts',
  'public/assets/samples/coner',
  'public/assets/ffxiv/jobs',
  'package.json',
  'package-lock.json',
];
const allowedUiCssExemptions = [
  {
    path: 'src/app/app-theme.css',
    rationale: 'The user permits app palette/token value changes in this stylesheet. The exact original and post-edit SHA-256 remain recorded, while CSS theme-isolation logic, Card scope, ThemeProvider, app-appearance behavior, and all card rendering inputs remain protected. The export and computed-style gates verify that app tokens do not leak into CardPreview.',
  },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isQaRoute(relative) {
  const file = relative.replaceAll('\\', '/');
  return file.startsWith('src/app/qa-phase217/') || file.startsWith('src/app/editor/qa-phase217-performance/');
}

async function collectFiles(relative) {
  const normalized = relative.replaceAll('\\', '/');
  const absolute = path.join(root, relative);
  const info = await stat(absolute).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [normalized];
  if (!info.isDirectory()) return [];
  const result = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = path.posix.join(normalized, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

async function hashFiles(files) {
  const rows = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(root, relative));
    rows.push({ path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return rows;
}

async function snapshot(stage) {
  const missingRoots = [];
  for (const relative of protectedRoots) {
    if (!await stat(path.join(root, relative)).catch(() => null)) missingRoots.push(relative);
  }
  if (missingRoots.length) {
    throw new Error(`Protected source roots are missing and cannot be omitted: ${missingRoots.join(', ')}`);
  }

  const protectedFiles = [...new Set((await Promise.all(protectedRoots.map(collectFiles))).flat())].sort();
  const protectedRows = await hashFiles(protectedFiles);
  const sourceFiles = (await collectFiles('src')).filter(file => !isQaRoute(file)).sort();
  const sourceRows = await hashFiles(sourceFiles);
  const report = {
    schema: 'phase217-protected-source-freeze-v1',
    generatedAt: new Date().toISOString(),
    stage,
    rule: 'Protected card rendering, typography, materials, job assets, theme isolation, interactions, and persistence inputs must remain byte-identical. The full src/ inventory is retained as the pre-polish source baseline; only CSS additions/edits/removals outside protected roots are allowed by this phase.',
    protectedRoots,
    allowedUiCssExemptions,
    protectedFileCount: protectedRows.length,
    protectedFiles: protectedRows,
    protectedInventorySha256: sha256(Buffer.from(JSON.stringify(protectedRows))),
    sourceBaseline: 'src/** excluding this temporary QA route',
    sourceFileCount: sourceRows.length,
    sourceFiles: sourceRows,
    sourceInventorySha256: sha256(Buffer.from(JSON.stringify(sourceRows))),
  };
  const destination = path.join(qaRoot, `${stage}-source-freeze.json`);
  await mkdir(qaRoot, { recursive: true });
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ saved: path.relative(root, destination), protectedFileCount: protectedRows.length, protectedInventorySha256: report.protectedInventorySha256, sourceFileCount: sourceRows.length, sourceInventorySha256: report.sourceInventorySha256 }, null, 2));
}

function assertStage(value) {
  if (value !== 'before' && value !== 'after') throw new Error('Usage: node tools/phase217-source-freeze.mjs before|after');
  return value;
}

const stage = assertStage(process.argv[2]);
await snapshot(stage);

if (stage === 'after') {
  const beforePath = path.join(qaRoot, 'before-source-freeze.json');
  const afterPath = path.join(qaRoot, 'after-source-freeze.json');
  const [beforeBytes, afterBytes] = await Promise.all([readFile(beforePath), readFile(afterPath)]);
  const before = JSON.parse(beforeBytes.toString('utf8'));
  const after = JSON.parse(afterBytes.toString('utf8'));
  const byPath = rows => new Map(rows.map(row => [row.path, row]));
  const beforeProtectedAll = byPath(before.protectedFiles);
  const afterProtectedAll = byPath(after.protectedFiles);
  const exemptionPaths = new Set(allowedUiCssExemptions.map(row => row.path));
  const beforeProtected = new Map([...beforeProtectedAll].filter(([file]) => !exemptionPaths.has(file)));
  const afterProtected = new Map([...afterProtectedAll].filter(([file]) => !exemptionPaths.has(file)));
  const changedProtected = [...afterProtected].flatMap(([file, current]) => {
    const old = beforeProtected.get(file);
    return old && old.sha256 !== current.sha256 ? [{ path: file, before: old.sha256, after: current.sha256 }] : [];
  });
  const addedProtected = [...afterProtected.keys()].filter(file => !beforeProtected.has(file)).sort();
  const removedProtected = [...beforeProtected.keys()].filter(file => !afterProtected.has(file)).sort();
  const missingUiExemptions = [...exemptionPaths].filter(file => !beforeProtectedAll.has(file) || !afterProtectedAll.has(file));
  const allowedUiCssChanges = allowedUiCssExemptions.map(exemption => {
    const beforeFile = beforeProtectedAll.get(exemption.path);
    const afterFile = afterProtectedAll.get(exemption.path);
    return {
      ...exemption,
      beforeSha256: beforeFile?.sha256 ?? null,
      afterSha256: afterFile?.sha256 ?? null,
      changed: Boolean(beforeFile && afterFile && beforeFile.sha256 !== afterFile.sha256),
    };
  });

  const beforeSource = byPath(before.sourceFiles);
  const afterSource = byPath(after.sourceFiles);
  const changedSource = [...afterSource].flatMap(([file, current]) => {
    const old = beforeSource.get(file);
    return old && old.sha256 !== current.sha256 ? [{ path: file, before: old.sha256, after: current.sha256 }] : [];
  });
  const addedSource = [...afterSource.keys()].filter(file => !beforeSource.has(file)).sort();
  const removedSource = [...beforeSource.keys()].filter(file => !afterSource.has(file)).sort();
  const sourceChanges = [
    ...changedSource.map(row => ({ ...row, kind: 'changed' })),
    ...addedSource.map(file => ({ path: file, kind: 'added' })),
    ...removedSource.map(file => ({ path: file, kind: 'removed' })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const isCss = file => file.toLowerCase().endsWith('.css');
  const cssOnly = sourceChanges.every(row => isCss(row.path));
  const protectedExact = changedProtected.length === 0 && addedProtected.length === 0 && removedProtected.length === 0 && missingUiExemptions.length === 0;
  const protectedExactIncludingAllowedUiCss = changedProtected.length === 0
    && allowedUiCssChanges.every(row => !row.changed)
    && addedProtected.length === 0 && removedProtected.length === 0 && missingUiExemptions.length === 0;
  const report = {
    schema: 'phase217-protected-source-freeze-diff-v1',
    generatedAt: new Date().toISOString(),
    baseline: 'docs/qa/phase217/before-source-freeze.json (captured before Phase 2.17 edits)',
    beforeProtectedFileCount: beforeProtectedAll.size,
    afterProtectedFileCount: afterProtectedAll.size,
    effectiveProtectedFileCount: beforeProtected.size,
    protectedExact,
    protectedExactIncludingAllowedUiCss,
    changedProtected,
    addedProtected,
    removedProtected,
    allowedUiCssExemptions: allowedUiCssChanges,
    missingUiExemptions,
    beforeSourceFileCount: beforeSource.size,
    afterSourceFileCount: afterSource.size,
    cssOnly,
    sourceChanges,
    sourceChangesAreCssOnly: cssOnly,
    afterProtectedInventorySha256: after.protectedInventorySha256,
    afterSourceInventorySha256: after.sourceInventorySha256,
  };
  const output = path.join(qaRoot, 'source-freeze-diff.json');
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ comparison: path.relative(root, output), protectedExact, protectedExactIncludingAllowedUiCss, cssOnly, changedProtectedCount: changedProtected.length, allowedUiCssChanges, addedProtectedCount: addedProtected.length, removedProtectedCount: removedProtected.length, sourceChanges: sourceChanges.map(row => ({ path: row.path, kind: row.kind })) }, null, 2));
  if (!protectedExact || !cssOnly) process.exitCode = 1;
}

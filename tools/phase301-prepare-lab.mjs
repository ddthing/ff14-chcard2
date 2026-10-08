import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs', 'qa', 'phase301-card-type-job');
const qaSource = path.join(qaRoot, 'qa-source');
const archiveRoot = path.join(qaSource, 'actual-production');
const labRoot = path.join(root, 'tmp', 'phase301-lab');
const frozenPath = path.join(qaRoot, 'production-source-before.json');
const candidateManifestPath = path.join(qaRoot, 'fonts', 'font-manifest.json');
const baselineOnly = process.argv.includes('--baseline-only');
const templateFiles = [
  ['lab-page.tsx.txt', 'app/page.tsx'],
  ['lab-layout.tsx.txt', 'app/layout.tsx'],
  ['lab.css.txt', 'app/lab.css'],
  ['jobmark-variants.css.txt', 'app/jobmark-variants.css'],
];
const textExtensions = new Set(['.ts', '.tsx', '.css', '.json', '.svg', '.mjs', '.js', '.md']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function listFiles(directory, relative = '') {
  const output = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(directory, child));
    else if (entry.isFile()) output.push(child);
  }
  return output.sort((a, b) => a.localeCompare(b));
}

async function assertProductionFreeze() {
  const freeze = JSON.parse(await readFile(frozenPath, 'utf8'));
  if (freeze.schema !== 'phase301-production-source-freeze-v1' || freeze.stage !== 'before') {
    throw new Error('Expected the main-owned Phase 3.0.1 production source freeze before preparing the lab.');
  }
  const changed = [];
  for (const entry of freeze.files) {
    const absolute = path.resolve(root, entry.path);
    if (!inside(root, absolute)) throw new Error('Freeze entry escaped the repository: ' + entry.path);
    let bytes;
    try { bytes = await readFile(absolute); } catch { changed.push({ path: entry.path, reason: 'missing' }); continue; }
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) changed.push({ path: entry.path, reason: 'hash-or-size-changed' });
  }
  if (changed.length) throw new Error('Protected production files changed since the freeze: ' + changed.slice(0, 12).map((item) => item.path).join(', '));
  return { schema: freeze.schema, capturedAt: freeze.capturedAt, fileCount: freeze.fileCount, verified: true };
}

async function archiveActualSources() {
  const sourceRoot = path.join(root, 'src');
  const files = (await listFiles(sourceRoot)).filter((relative) => textExtensions.has(path.extname(relative).toLowerCase()));
  const manifestPath = path.join(qaSource, 'actual-production-source-manifest.json');
  let prior = null;
  try { prior = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* first archive */ }
  const current = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(sourceRoot, relative));
    const record = { path: `src/${relative.replaceAll('\\', '/')}`, bytes: bytes.length, sha256: sha256(bytes) };
    if (prior) {
      const old = prior.files.find((item) => item.path === record.path);
      if (!old || old.bytes !== record.bytes || old.sha256 !== record.sha256) {
        throw new Error('Archived renderer source differs from the frozen live source: ' + record.path);
      }
    } else {
      const archivePath = path.join(archiveRoot, `${relative}.txt`);
      await mkdir(path.dirname(archivePath), { recursive: true });
      await writeFile(archivePath, bytes);
    }
    current.push(record);
  }
  if (prior && prior.files.length !== current.length) throw new Error('Archived source file count changed since its first copy.');
  const manifest = prior ?? {
    schema: 'phase301-byte-exact-renderer-source-v1',
    capturedAt: new Date().toISOString(),
    sourceRoot: 'src/**',
    archiveRoot: 'docs/qa/phase301-card-type-job/qa-source/actual-production/**/*.txt',
    files: current,
  };
  if (!prior) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function copyTreeIfPresent(from, to) {
  try {
    await stat(from);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, force: true, preserveTimestamps: true });
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function makeFontManifestForLab(sourceManifest) {
  const fontFiles = [];
  const fonts = {};
  const aliases = {};
  const sets = {};
  for (const [id, item] of Object.entries(sourceManifest.fonts ?? {})) {
    const fontEntry = {
      family: item.family,
      internalFamily: item.internalFamily,
      postScriptName: item.postScriptName,
      verifiedFacesByWeight: item.verifiedFacesByWeight,
      genre: item.genre,
      weightMode: item.weightMode,
      weights: item.weights,
      files: [],
    };
    const aliasesForFont = {};
    for (const [scriptKey, alias] of Object.entries(sourceManifest.aliases?.[id] ?? item.aliases ?? {})) {
      aliasesForFont[normalizeScript(scriptKey)] = alias;
    }
    aliases[id] = aliasesForFont;
    for (const file of item.files ?? []) {
      const sourcePath = path.resolve(qaRoot, file.path);
      if (!inside(qaRoot, sourcePath)) throw new Error('Font manifest path escaped QA font folder: ' + file.path);
      const bytes = await readFile(sourcePath);
      if (file.bytes !== undefined && bytes.length !== file.bytes) throw new Error(`Font byte count changed: ${file.path}`);
      if (file.sha256 && sha256(bytes) !== file.sha256) throw new Error(`Font hash changed: ${file.path}`);
      const relativeAsset = path.posix.join(id, path.basename(file.path));
      const destination = path.join(labRoot, 'public', 'phase301-fonts', ...relativeAsset.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
      const normalized = {
        url: `/phase301-fonts/${relativeAsset}`,
        script: normalizeScript(file.script),
        format: file.format,
        unicodeRange: file.unicodeRange,
        weightMode: file.weightMode ?? item.weightMode,
        weights: file.weights ?? item.weights,
        bytes: bytes.length,
        sha256: sha256(bytes),
        internalFamily: file.internalFamily,
        fullName: file.fullName,
        postScriptName: file.postScriptName,
        typographicFamily: file.typographicFamily,
        glyphCount: file.glyphCount,
      };
      fontEntry.files.push(normalized);
      fontFiles.push({ id, ...normalized });
    }
    fonts[id] = fontEntry;
  }
  for (const [setId, mapping] of Object.entries(sourceManifest.sets ?? {})) {
    const next = {};
    for (const [key, value] of Object.entries(mapping)) next[normalizeScript(key)] = value;
    sets[setId] = next;
  }
  return {
    moduleText: `export const PHASE301_FONT_MANIFEST = ${JSON.stringify({ fonts, aliases, sets }, null, 2)} as const;\n`,
    summary: { schema: sourceManifest.schema, fontCount: Object.keys(fonts).length, fileCount: fontFiles.length, totalBytes: fontFiles.reduce((sum, file) => sum + file.bytes, 0), fonts: fontFiles },
  };
}

function normalizeScript(value) {
  if (value === 'ko' || value === 'korean') return 'korean';
  if (value === 'ja' || value === 'japanese') return 'japanese';
  if (value === 'zh-Hans' || value === 'zhHans' || value === 'sc') return 'zhHans';
  if (value === 'zh-Hant' || value === 'zhHant' || value === 'tc') return 'zhHant';
  return 'latin';
}

async function writeLabProject({ freeze, sourceManifest, sourceArchive, fontSummary, moduleText }) {
  const marker = {
    schema: 'phase301-lab-owned-v1',
    root: 'tmp/phase301-lab',
    createdAt: new Date().toISOString(),
    sourceFreezeCapturedAt: freeze.capturedAt,
  };
  await mkdir(path.join(labRoot, 'app'), { recursive: true });
  await mkdir(path.join(labRoot, 'qa'), { recursive: true });
  for (const [templateName, destination] of templateFiles) {
    const source = path.join(qaSource, templateName);
    const target = path.join(labRoot, destination);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
  await writeFile(path.join(labRoot, 'app', 'phase301-font-manifest.ts'), moduleText);
  await writeFile(path.join(labRoot, 'app', 'production-fonts.css'), await readFile(path.join(root, 'src', 'app', 'fonts.css')));
  await writeFile(path.join(labRoot, 'qa', 'stage1-cases.json'), await readFile(path.join(qaRoot, 'qa-cases-stage1.json')));
  await writeFile(path.join(labRoot, 'qa', 'font-manifest.json'), JSON.stringify({ schema: sourceManifest.schema, sets: sourceManifest.sets, fonts: Object.fromEntries(Object.entries(sourceManifest.fonts).map(([id, font]) => [id, { family: font.family, genre: font.genre, weightMode: font.weightMode, weights: font.weights }])) }, null, 2) + '\n');
  const tsconfig = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
  tsconfig.compilerOptions.paths = { '@/*': ['./source/src/*'] };
  tsconfig.include = ['next-env.d.ts', '.next/types/**/*.ts', '.next/dev/types/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx', 'source/src/**/*.ts', 'source/src/**/*.tsx'];
  tsconfig.exclude = ['node_modules'];
  await writeFile(path.join(labRoot, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  await writeFile(path.join(labRoot, 'next.config.mjs'), "const nextConfig = { poweredByHeader: false, images: { unoptimized: true } };\nexport default nextConfig;\n");
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  packageJson.scripts = { dev: 'next dev --webpack -p 3330', build: 'next build --webpack', start: 'next start -p 3330' };
  await writeFile(path.join(labRoot, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
  // Mirror only the public icon opt-in. Never copy the root environment file.
  const rootEnv = await readFile(path.join(root, '.env.local'), 'utf8').catch(() => '');
  const enabled = /^NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED\s*=\s*["']?true["']?\s*$/mu.test(rootEnv);
  await writeFile(path.join(labRoot, '.env.local'), `NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED=${enabled}\n`);
  await writeFile(path.join(labRoot, '.phase301-lab-owned.json'), JSON.stringify(marker, null, 2) + '\n');
  await writeFile(path.join(labRoot, 'qa', 'lab-preparation.json'), JSON.stringify({
    schema: 'phase301-lab-preparation-v1',
    preparedAt: new Date().toISOString(),
    productionFreeze: freeze,
    archivedSource: { fileCount: sourceArchive.files.length, totalBytes: sourceArchive.files.reduce((sum, item) => sum + item.bytes, 0) },
    fonts: fontSummary,
    route: '/',
    httpPort: 3330,
    api: 'window.__PHASE301_QA__',
  }, null, 2) + '\n');
  return marker;
}

async function main() {
  if (path.resolve(labRoot) !== path.resolve(root, 'tmp', 'phase301-lab') || !inside(root, path.resolve(labRoot))) {
    throw new Error('Refusing to prepare a lab outside the fixed repository temp path.');
  }
  const freeze = await assertProductionFreeze();
  const sourceArchive = await archiveActualSources();
  let sourceManifest = null;
  try { sourceManifest = JSON.parse(await readFile(candidateManifestPath, 'utf8')); } catch (error) {
    if (error?.code !== 'ENOENT' || !baselineOnly) throw new Error(`Font manifest missing at ${candidateManifestPath}; use --baseline-only for a P0 structural smoke.`);
  }
  if (!sourceManifest) sourceManifest = { schema: 'phase301-font-assets-empty-v1', fonts: {}, sets: {}, baselineOnly: true };
  if (!sourceManifest.fonts || !sourceManifest.sets) throw new Error('Font manifest must contain fonts and sets objects.');

  try {
    const existing = JSON.parse(await readFile(path.join(labRoot, '.phase301-lab-owned.json'), 'utf8'));
    if (existing.schema !== 'phase301-lab-owned-v1' || existing.root !== 'tmp/phase301-lab') throw new Error('Existing temp path is not marked as this Phase 3.0.1 lab.');
    await rm(labRoot, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(labRoot, { recursive: true });
  const sourceCopy = path.join(labRoot, 'source', 'src');
  await cp(path.join(root, 'src'), sourceCopy, { recursive: true, force: true, preserveTimestamps: true });
  await copyTreeIfPresent(path.join(root, 'public', 'fonts'), path.join(labRoot, 'public', 'fonts'));
  await copyTreeIfPresent(path.join(root, 'public', 'images', 'materials'), path.join(labRoot, 'public', 'images', 'materials'));
  await copyTreeIfPresent(path.join(root, 'public', 'assets', 'samples', 'coner'), path.join(labRoot, 'public', 'assets', 'samples', 'coner'));
  await copyTreeIfPresent(path.join(root, 'public', 'assets', 'ffxiv', 'jobs'), path.join(labRoot, 'public', 'assets', 'ffxiv', 'jobs'));
  const { moduleText, summary: fontSummary } = await makeFontManifestForLab(sourceManifest);
  await writeLabProject({ freeze, sourceManifest, sourceArchive, fontSummary, moduleText });
  console.log(JSON.stringify({
    labRoot: path.relative(root, labRoot),
    route: 'http://127.0.0.1:3330/',
    baselineOnly: Boolean(sourceManifest.baselineOnly),
    sourceFiles: sourceArchive.files.length,
    sourceArchive: 'docs/qa/phase301-card-type-job/qa-source/actual-production-source-manifest.json',
    sourceFreezeVerified: freeze.verified,
    candidateFontFiles: fontSummary.fileCount,
    candidateFontBytes: fontSummary.totalBytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

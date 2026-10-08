import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phase301Root = path.join(root, 'docs', 'qa', 'phase301-card-type-job');
const phase302Root = path.join(root, 'docs', 'qa', 'phase302-jobmark-correction');
const qaSource = path.join(phase302Root, 'qa-source');
const labRoot = path.join(root, 'tmp', 'phase302-lab');
const freezePath = path.join(phase301Root, 'production-source-before.json');
const sourceManifestPath = path.join(phase301Root, 'fonts', 'font-manifest.json');
const port = 3332;
const fontSets = ['S1', 'S2', 'S3', 'S4'];
const fontScripts = ['latin', 'korean'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function verifyProductionFreeze() {
  const freeze = JSON.parse(await readFile(freezePath, 'utf8'));
  if (freeze.schema !== 'phase301-production-source-freeze-v1' || freeze.stage !== 'before') {
    throw new Error('Phase 3.0.1 production freeze is missing or has an unexpected schema.');
  }
  const changes = [];
  for (const entry of freeze.files) {
    const absolute = path.resolve(root, entry.path);
    if (!inside(root, absolute)) throw new Error('Production freeze entry escaped the repository: ' + entry.path);
    let bytes;
    try { bytes = await readFile(absolute); } catch { changes.push(`${entry.path}: missing`); continue; }
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) changes.push(`${entry.path}: hash/size changed`);
  }
  if (changes.length) throw new Error('Production source differs from the Phase 3.0.1 freeze: ' + changes.slice(0, 10).join(', '));
  return { schema: freeze.schema, capturedAt: freeze.capturedAt, fileCount: freeze.fileCount, verified: true };
}

async function copyIfPresent(from, to) {
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

async function verifyJobmarkAssets(optics) {
  const publicRoot = path.join(root, 'public');
  const resources = new Map();
  for (const record of Object.values(optics.jobs ?? {})) {
    if (!record.source) continue;
    const source = record.source;
    if (source.src && source.sha256) resources.set(source.src, source.sha256);
  }
  for (const [url, expectedHash] of resources) {
    if (!url.startsWith('/')) throw new Error('Expected a local Job-icon URL: ' + url);
    const target = path.resolve(publicRoot, ...url.slice(1).split('/'));
    if (!inside(publicRoot, target)) throw new Error('Job-icon asset escaped the public folder: ' + url);
    const bytes = await readFile(target);
    const actualHash = sha256(bytes);
    if (actualHash !== expectedHash) throw new Error(`Job-icon asset changed since its optical review: ${url}`);
  }
  return { resourceCount: resources.size, verified: true, sources: [...resources.keys()] };
}

async function createFontPayload(sourceManifest) {
  const usedFontIds = new Set();
  const aliasScriptsByFont = new Map();
  const rememberAlias = (id, script) => {
    usedFontIds.add(id);
    const scripts = aliasScriptsByFont.get(id) ?? new Set();
    scripts.add(script);
    aliasScriptsByFont.set(id, scripts);
  };
  for (const setName of fontSets) {
    const set = sourceManifest.sets?.[setName];
    if (!set) throw new Error(`Phase 3.0.1 manifest is missing required name candidate ${setName}.`);
    for (const script of fontScripts) {
      if (!set[script]) throw new Error(`Phase 3.0.1 manifest is missing ${setName}/${script}.`);
      rememberAlias(set[script], script);
    }
  }

  const fonts = {};
  const aliases = {};
  const files = new Map();
  for (const id of usedFontIds) {
    const sourceFont = sourceManifest.fonts?.[id];
    if (!sourceFont) throw new Error(`Phase 3.0.1 font record is missing: ${id}.`);
    const font = {
      family: sourceFont.family,
      internalFamily: sourceFont.internalFamily,
      postScriptName: sourceFont.postScriptName,
      verifiedFacesByWeight: sourceFont.verifiedFacesByWeight,
      genre: sourceFont.genre,
      weightMode: sourceFont.weightMode,
      weights: sourceFont.weights,
      files: [],
    };
    aliases[id] = {};
    for (const script of aliasScriptsByFont.get(id) ?? []) {
      const alias = sourceManifest.aliases?.[id]?.[script];
      if (!alias) throw new Error(`Verified alias missing for ${id}/${script}.`);
      aliases[id][script] = alias;
    }

    for (const record of sourceFont.files ?? []) {
      if (!fontScripts.includes(record.script)) continue;
      const sourceFile = path.resolve(phase301Root, record.path);
      if (!inside(path.join(phase301Root, 'fonts'), sourceFile)) throw new Error('Font file path escaped Phase 3.0.1 QA assets: ' + record.path);
      const bytes = await readFile(sourceFile);
      if (record.bytes !== undefined && bytes.length !== record.bytes) throw new Error(`Font asset byte count changed: ${record.path}`);
      if (record.sha256 && sha256(bytes) !== record.sha256) throw new Error(`Font asset hash changed: ${record.path}`);
      const relative = path.posix.join(id, path.basename(record.path));
      const url = `/phase302-fonts/${relative}`;
      if (!files.has(relative)) files.set(relative, { bytes, sha256: sha256(bytes), byteLength: bytes.length });
      font.files.push({
        url,
        script: record.script,
        format: record.format,
        unicodeRange: record.unicodeRange,
        weightMode: record.weightMode ?? sourceFont.weightMode,
        weights: record.weights ?? sourceFont.weights,
        bytes: bytes.length,
        sha256: sha256(bytes),
        internalFamily: record.internalFamily,
        fullName: record.fullName,
        postScriptName: record.postScriptName,
        typographicFamily: record.typographicFamily,
        glyphCount: record.glyphCount,
      });
    }
    fonts[id] = font;
  }

  const sets = Object.fromEntries(fontSets.map((setName) => [setName, Object.fromEntries(
    fontScripts.map((script) => [script, sourceManifest.sets[setName][script]]),
  )]));
  return {
    manifest: { fonts, aliases, sets },
    files,
    summary: {
      sourceSchema: sourceManifest.schema,
      sets: fontSets,
      scripts: fontScripts,
      fontIds: [...usedFontIds],
      familyCount: usedFontIds.size,
      fileRecordCount: [...usedFontIds].reduce((sum, id) => sum + fonts[id].files.length, 0),
      uniqueFileCount: files.size,
      totalBytes: [...files.values()].reduce((sum, file) => sum + file.byteLength, 0),
    },
  };
}

async function writeLab({ freeze, fontManifest, fontFiles, fontSummary, jobmarkAssets }) {
  const marker = {
    schema: 'phase302-lab-owned-v1',
    root: 'tmp/phase302-lab',
    createdAt: new Date().toISOString(),
    productionFreezeCapturedAt: freeze.capturedAt,
  };
  await mkdir(path.join(labRoot, 'app'), { recursive: true });
  await mkdir(path.join(labRoot, 'qa'), { recursive: true });

  const copies = [
    ['lab-page.tsx.txt', 'app/page.tsx'],
    ['lab-layout.tsx.txt', 'app/layout.tsx'],
    ['lab.css.txt', 'app/lab.css'],
    ['jobmark-variants.css.txt', 'app/jobmark-variants.css'],
    ['user-corrections.css.txt', 'app/user-corrections.css'],
    ['user-corrections.mjs.txt', 'app/user-corrections.mjs'],
  ];
  for (const [sourceName, targetName] of copies) {
    const source = path.join(qaSource, sourceName);
    const target = path.join(labRoot, targetName);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
  await writeFile(path.join(labRoot, 'app', 'user-corrections.d.ts'), `declare module '*.mjs' {\n  export type Phase302CorrectionAudit = { applied: boolean; template?: string; layout?: string; ribbon?: { found: boolean; outerGeometryPreserved: boolean; innerLineCount: number; innerScales: number[]; emblemFound: boolean; [key: string]: unknown }; unofficialCopyHidden?: number; c2DividerRemoved?: boolean; reason?: string; };\n  export function applyUserCorrections(article: Element): Phase302CorrectionAudit;\n}\n`);

  await writeFile(path.join(labRoot, 'app', 'phase302-font-manifest.ts'), `export const PHASE302_FONT_MANIFEST = ${JSON.stringify(fontManifest, null, 2)} as const;\n`);
  await writeFile(path.join(labRoot, 'app', 'phase302-jobmark-optics.json'), await readFile(path.join(qaSource, 'jobmark-optics.json')));
  await writeFile(path.join(labRoot, 'app', 'production-fonts.css'), await readFile(path.join(root, 'src', 'app', 'fonts.css')));

  const tsconfig = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
  tsconfig.compilerOptions.paths = { '@/*': ['./source/src/*'] };
  tsconfig.include = ['next-env.d.ts', '.next/types/**/*.ts', '.next/dev/types/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx', 'source/src/**/*.ts', 'source/src/**/*.tsx'];
  tsconfig.exclude = ['node_modules'];
  await writeFile(path.join(labRoot, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  await writeFile(path.join(labRoot, 'next.config.mjs'), "const nextConfig = { poweredByHeader: false, images: { unoptimized: true } };\nexport default nextConfig;\n");
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  packageJson.scripts = { dev: `next dev --webpack -p ${port}`, build: 'next build --webpack', start: `next start -p ${port}` };
  await writeFile(path.join(labRoot, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');

  const rootEnv = await readFile(path.join(root, '.env.local'), 'utf8').catch(() => '');
  const enabled = /^NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED\s*=\s*["']?true["']?\s*$/mu.test(rootEnv);
  await writeFile(path.join(labRoot, '.env.local'), `NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED=${enabled}\n`);
  await writeFile(path.join(labRoot, '.phase302-lab-owned.json'), JSON.stringify(marker, null, 2) + '\n');
  await writeFile(path.join(labRoot, 'qa', 'font-manifest.json'), JSON.stringify(fontManifest, null, 2) + '\n');
  await writeFile(path.join(labRoot, 'qa', 'lab-preparation.json'), JSON.stringify({
    schema: 'phase302-lab-preparation-v1',
    preparedAt: new Date().toISOString(),
    route: '/',
    httpPort: port,
    api: 'window.__PHASE302_QA__',
    productionFreeze: freeze,
    candidateFonts: fontSummary,
    jobmarkAssets,
    fullManifestRecords: Object.values(fontManifest.fonts).reduce((sum, font) => sum + font.files.length, 0),
  }, null, 2) + '\n');

  const sourceCopy = path.join(labRoot, 'source', 'src');
  await cp(path.join(root, 'src'), sourceCopy, { recursive: true, force: true, preserveTimestamps: true });
  await copyIfPresent(path.join(root, 'public', 'fonts'), path.join(labRoot, 'public', 'fonts'));
  await copyIfPresent(path.join(root, 'public', 'images', 'materials'), path.join(labRoot, 'public', 'images', 'materials'));
  await copyIfPresent(path.join(root, 'public', 'assets', 'samples', 'coner'), path.join(labRoot, 'public', 'assets', 'samples', 'coner'));
  await copyIfPresent(path.join(root, 'public', 'assets', 'ffxiv', 'jobs'), path.join(labRoot, 'public', 'assets', 'ffxiv', 'jobs'));
  for (const [relative, file] of fontFiles) {
    const target = path.join(labRoot, 'public', 'phase302-fonts', ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }
  return marker;
}

async function main() {
  const expectedLabRoot = path.resolve(root, 'tmp', 'phase302-lab');
  if (path.resolve(labRoot) !== expectedLabRoot || !inside(root, expectedLabRoot)) {
    throw new Error('Refusing to prepare a Phase302 lab outside its fixed repository temp directory.');
  }
  const freeze = await verifyProductionFreeze();
  const phase301SourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
  const optics = JSON.parse(await readFile(path.join(qaSource, 'jobmark-optics.json'), 'utf8'));
  const jobmarkAssets = await verifyJobmarkAssets(optics);
  const { manifest: fontManifest, files: fontFiles, summary: fontSummary } = await createFontPayload(phase301SourceManifest);

  try {
    const currentMarker = JSON.parse(await readFile(path.join(labRoot, '.phase302-lab-owned.json'), 'utf8'));
    if (currentMarker.schema !== 'phase302-lab-owned-v1' || currentMarker.root !== 'tmp/phase302-lab') {
      throw new Error('Existing temporary directory is not marked as this Phase302 lab.');
    }
    await rm(labRoot, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  await mkdir(labRoot, { recursive: true });
  const marker = await writeLab({ freeze, fontManifest, fontFiles, fontSummary, jobmarkAssets });
  console.log(JSON.stringify({
    labRoot: path.relative(root, labRoot),
    route: `http://127.0.0.1:${port}/`,
    api: 'window.__PHASE302_QA__',
    sourceFreezeVerified: freeze.verified,
    jobmarkAssets,
    fontSummary,
    marker: marker.schema,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

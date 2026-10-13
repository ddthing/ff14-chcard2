import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = 'licenses/fonts/PREVIEW_FONT_SUBSETS_2026-10-13.json';
const previewRoot = 'public/fonts/previews';
const cssDirectory = `${previewRoot}/css`;
const generatedFamiliesPath = 'src/data/fonts/preview-families.generated.ts';
const outputRoot = path.join(projectRoot, previewRoot);
const cssRoot = path.join(projectRoot, cssDirectory);
const modes = new Set(process.argv.slice(2));
assert.ok(modes.size <= 1 && [...modes].every((mode) => mode === '--check' || mode === '--write'),
  'Use either --check or --write.');
const checkOnly = modes.has('--check');

function projectPath(relativePath, label) {
  assert.equal(typeof relativePath, 'string', `${label} must be a project-relative path`);
  const resolved = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, resolved);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `${label} must stay inside the project`);
  return resolved;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safePublicPath(relativePath) {
  assert.ok(relativePath.startsWith(`${previewRoot}/`) && relativePath.endsWith('.woff2'),
    `Preview output must be a WOFF2 file under ${previewRoot}: ${relativePath}`);
  assert.ok(!relativePath.split('/').some((segment) => segment === '..'),
    `Preview output path escapes its directory: ${relativePath}`);
  return relativePath;
}

function validateUnicodeRange(range, label) {
  assert.equal(typeof range, 'string', `${label} must be a CSS unicode-range`);
  const ranges = range.split(',').map((part) => part.trim());
  assert.ok(ranges.length > 0 && ranges.every((part) => {
    const match = part.match(/^U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$/iu);
    if (!match) return false;
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    return start <= end && end <= 0x10ffff;
  }), `${label} is not a valid Unicode range list`);
  return ranges;
}

function unicodeRangeCoverageCount(range, sourceStart, sourceEnd, label) {
  const ranges = validateUnicodeRange(range, label).map((part) => {
    const [, first, last] = part.match(/^U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$/iu);
    return [Number.parseInt(first, 16), Number.parseInt(last ?? first, 16)];
  });
  let count = 0;
  let previousEnd = -1;
  for (const [start, end] of ranges) {
    assert.ok(start >= sourceStart && end <= sourceEnd, `${label} escapes its source cmap block`);
    assert.ok(start > previousEnd, `${label} contains overlapping or unsorted Unicode ranges`);
    count += end - start + 1;
    previousEnd = end;
  }
  return count;
}

async function walkFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function renderFamilyCss(fontId, assets) {
  const rules = assets.map((asset) => {
    const ranges = validateUnicodeRange(asset.unicodeRange, `${asset.path}.unicodeRange`);
    const weight = String(asset.cssWeight);
    assert.match(weight, /^\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)?$/u,
      `${asset.path}.cssWeight must be a numeric weight or variable range`);
    assert.ok(asset.style === 'normal' || asset.style === 'italic', `${asset.path}.style is invalid`);
    return [
      '@font-face {',
      `  font-family: ${JSON.stringify(asset.previewFamily)};`,
      `  font-style: ${asset.style};`,
      `  font-weight: ${weight};`,
      '  font-display: swap;',
      `  src: url(${JSON.stringify(`/${asset.path.slice('public/'.length)}`)}) format("woff2");`,
      `  unicode-range: ${ranges.join(', ')};`,
      '}',
    ].join('\n');
  });
  return [
    '/* Generated from licenses/fonts/PREVIEW_FONT_SUBSETS_2026-10-13.json. */',
    `/* Lazy preview faces for ${fontId}; source fonts remain the applied/exported faces. */`,
    ...rules,
  ].join('\n\n').trimEnd() + '\n';
}

function renderFamiliesModule(families) {
  const rows = families.map((family) => (
    `  ${JSON.stringify(family.fontId)}: { family: ${JSON.stringify(family.family)}, stylesheet: ${JSON.stringify(`/fonts/previews/css/${family.fontId}.css`)} },`
  ));
  return [
    '// Generated from licenses/fonts/PREVIEW_FONT_SUBSETS_2026-10-13.json.',
    '// Do not edit by hand; preview aliases never enter saved card data.',
    'export const TYPOGRAPHY_PREVIEW_FAMILIES = {',
    ...rows,
    '} as const;',
    '',
    'export type TypographyPreviewFontId = keyof typeof TYPOGRAPHY_PREVIEW_FAMILIES;',
    '',
  ].join('\n');
}

async function readManifest() {
  const absolutePath = projectPath(manifestPath, 'manifest path');
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

async function validateManifest(manifest) {
  assert.equal(manifest.schemaVersion, 1, 'Unsupported font preview manifest schema');
  const blockSize = manifest.generation?.unicodeBlockSize;
  assert.ok(Number.isInteger(blockSize) && blockSize >= 128 && blockSize <= 4096 && (blockSize & (blockSize - 1)) === 0,
    'Manifest Unicode block size must be a supported power of two');
  const families = manifest.families;
  const assets = manifest.assets;
  assert.ok(Array.isArray(families) && families.length > 0, 'Manifest must include source families');
  assert.ok(Array.isArray(assets) && assets.length > 0, 'Manifest must include preview assets');
  assert.equal(manifest.summary?.sourceFaceCount, families.length, 'Manifest source face count is stale');
  assert.equal(manifest.summary?.previewAssetCount, assets.length, 'Manifest preview asset count is stale');

  const familyBySource = new Map();
  const aliasesByFont = new Map();
  const expectedCss = new Map();
  const allAssets = new Set();
  const assetsByFont = new Map();
  const assetsBySource = new Map();
  const totalSourceBytes = families.reduce((total, family) => total + family.sourceBytes, 0);
  assert.equal(manifest.summary?.sourceBytes, totalSourceBytes, 'Manifest source byte total is stale');
  const excludedFontIds = new Set((manifest.excludedProtectedAssets ?? []).map((asset) => asset.fontId));

  for (const family of families) {
    const { fontId, sourcePath, sourceSha256, sourceBytes: bytes, license, licenseFile, previewFamily, reservedFontNames = [] } = family;
    assert.ok(fontId && sourcePath && sourceSha256 && Number.isInteger(bytes), 'Manifest source face is incomplete');
    assert.match(sourceSha256, /^[a-f0-9]{64}$/u, `${sourcePath} source SHA-256 is invalid`);
    assert.match(family.sourceCmapSha256, /^[a-f0-9]{64}$/u, `${sourcePath} source cmap proof is invalid`);
    assert.match(family.sourceMetricsSha256, /^[a-f0-9]{64}$/u, `${sourcePath} source metric proof is invalid`);
    assert.ok(Number.isInteger(family.sourceCmapCodepointCount) && family.sourceCmapCodepointCount > 0,
      `${sourcePath} source cmap count is invalid`);
    assert.match(previewFamily, /^XIV Preview \d{3}$/u, `${fontId} preview alias is invalid`);
    assert.ok(!reservedFontNames.some((reserved) => previewFamily.toLowerCase().includes(reserved.toLowerCase())),
      `${fontId} preview alias contains a reserved font name`);
    assert.ok(typeof family.sourceUrl === 'string' && family.sourceUrl.startsWith('https://'), `${fontId} needs source provenance`);
    assert.ok(typeof license === 'string' && license.trim(), `${fontId} needs a license label`);
    assert.ok(licenseFile.startsWith('licenses/fonts/'), `${fontId} license must be under licenses/fonts`);
    const currentAlias = aliasesByFont.get(fontId);
    if (currentAlias) assert.equal(currentAlias.family, previewFamily, `${fontId} has inconsistent preview aliases`);
    else aliasesByFont.set(fontId, { family: previewFamily, stylesheet: `/fonts/previews/css/${fontId}.css` });
    for (const [otherFontId, otherAlias] of aliasesByFont) {
      if (otherFontId !== fontId) assert.notEqual(otherAlias.family, previewFamily, `${fontId} preview alias is shared`);
    }
    assert.equal(familyBySource.has(sourcePath), false, `${sourcePath} is duplicated in the source manifest`);
    familyBySource.set(sourcePath, family);

    const sourceFile = projectPath(sourcePath, `${fontId} sourcePath`);
    const source = await readFile(sourceFile);
    assert.equal(source.byteLength, bytes, `${sourcePath} source size changed`);
    assert.equal(hash(source), sourceSha256, `${sourcePath} source hash changed`);

    const licenseContents = await readFile(projectPath(licenseFile, `${fontId} licenseFile`), 'utf8');
    assert.ok(licenseContents.trim(), `${fontId} license file is empty`);
    if (license === 'SIL Open Font License 1.1') {
      assert.match(licenseContents, /SIL\s+OPEN\s+FONT\s+LICENSE|SIL Open Font License/iu,
        `${fontId} license label does not match its license file`);
      assert.match(licenseContents, /Modified Version/iu, `${fontId} OFL file does not authorize a modified version`);
      for (const reserved of reservedFontNames) {
        assert.ok(licenseContents.toLowerCase().includes(reserved.toLowerCase()),
          `${fontId} license file omits reserved font name ${reserved}`);
      }
    } else if (license === 'KOGL Type 1') {
      assert.match(licenseContents, /KOGL Type 1/iu, `${fontId} license file does not match KOGL Type 1`);
      assert.match(licenseContents, /derivative use/iu, `${fontId} KOGL file does not document derivative use`);
      assert.ok(family.sourceAttribution, `${fontId} KOGL preview requires source attribution`);
    } else {
      assert.fail(`${fontId} has an unreviewed preview license: ${license}`);
    }
    if (family.publicLicenseFile) {
      const publicLicense = await readFile(projectPath(family.publicLicenseFile, `${fontId} publicLicenseFile`), 'utf8');
      assert.equal(publicLicense, licenseContents, `${fontId} public license copy differs from the reviewed source`);
    }
    for (const noticePath of family.supplementalNotices ?? []) {
      const notice = await readFile(projectPath(noticePath, `${fontId} supplemental notice`), 'utf8');
      assert.ok(notice.trim(), `${fontId} supplemental notice is empty`);
    }
  }

  let previewBytes = 0;
  for (const asset of assets) {
    assert.equal(excludedFontIds.has(asset.fontId), false,
      `${asset.fontId} is listed as protected and cannot have preview subsets`);
    const family = familyBySource.get(asset.sourcePath);
    assert.ok(family, `${asset.path} references an unreviewed font source`);
    assert.equal(asset.fontId, family.fontId, `${asset.path} font id differs from its source family`);
    assert.equal(asset.previewFamily, family.previewFamily, `${asset.path} alias differs from its source family`);
    assert.equal(asset.sourcePath, family.sourcePath, `${asset.path} source path changed`);
    const blockSize = manifest.generation.unicodeBlockSize;
    assert.ok(Array.isArray(asset.sourceBlock) && asset.sourceBlock.length === 2, `${asset.path} source block is missing`);
    const [start, end] = asset.sourceBlock;
    assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 0x10ffff,
      `${asset.path} source block is invalid`);
    assert.equal(start % blockSize, 0, `${asset.path} source block is not aligned`);
    assert.equal(end, Math.min(start + blockSize - 1, 0x10ffff), `${asset.path} source block has an invalid end`);
    const weightToken = String(asset.cssWeight).match(/^\d+(?:\.\d+)?$/u)?.[0]?.replace('.', '_') ?? 'variable';
    const sourceStem = path.basename(asset.sourcePath, path.extname(asset.sourcePath));
    const expectedPath = `${previewRoot}/${asset.fontId}/${sourceStem}-w${weightToken}-u${start.toString(16).padStart(6, '0')}.woff2`;
    assert.equal(asset.path, expectedPath, `${asset.path} does not match its source face and Unicode block`);
    assert.ok(Number.isInteger(asset.codepointCount) && asset.codepointCount > 0,
      `${asset.path} must prove source cmap coverage`);
    for (const proof of ['cmapSha256', 'metricsSha256', 'sha256']) {
      assert.match(asset[proof], /^[a-f0-9]{64}$/u, `${asset.path} ${proof} is invalid`);
    }
    assert.ok(Number.isInteger(asset.bytes) && asset.bytes > 0, `${asset.path} byte count is invalid`);
    assert.equal(unicodeRangeCoverageCount(asset.unicodeRange, start, end, `${asset.path}.unicodeRange`),
      asset.codepointCount, `${asset.path} Unicode range count differs from source cmap coverage`);
    const publicPath = safePublicPath(asset.path);
    assert.equal(allAssets.has(publicPath), false, `${publicPath} is duplicated`);
    allAssets.add(publicPath);
    const absoluteOutput = projectPath(publicPath, `${asset.path} output`);
    const binary = await readFile(absoluteOutput);
    assert.equal(binary.byteLength, asset.bytes, `${asset.path} byte count changed`);
    assert.equal(hash(binary), asset.sha256, `${asset.path} content hash changed`);
    assert.equal(binary.toString('latin1', 0, 4), 'wOF2', `${asset.path} is not WOFF2`);
    previewBytes += asset.bytes;
    const current = assetsByFont.get(asset.fontId) ?? [];
    current.push(asset);
    assetsByFont.set(asset.fontId, current);
    const sourceAssets = assetsBySource.get(asset.sourcePath) ?? [];
    sourceAssets.push(asset);
    assetsBySource.set(asset.sourcePath, sourceAssets);
  }
  assert.equal(previewBytes, manifest.summary.previewBytes, 'Manifest preview byte total is stale');

  for (const family of families) {
    const sourceAssets = assetsBySource.get(family.sourcePath) ?? [];
    assert.ok(sourceAssets.length > 0, `${family.sourcePath} has no generated Unicode shards`);
    const generatedPaths = sourceAssets.map((asset) => asset.path).sort();
    assert.deepEqual([...family.outputs].sort(), generatedPaths, `${family.sourcePath} output list is stale`);
    const blockStarts = sourceAssets.map((asset) => asset.sourceBlock[0]);
    assert.equal(new Set(blockStarts).size, blockStarts.length, `${family.sourcePath} repeats a Unicode block`);
    assert.equal(sourceAssets.reduce((total, asset) => total + asset.codepointCount, 0),
      family.sourceCmapCodepointCount, `${family.sourcePath} Unicode shard coverage count is incomplete`);
  }

  const outputFiles = (await walkFiles(outputRoot))
    .filter((file) => file.toLowerCase().endsWith('.woff2'))
    .map((file) => path.relative(projectRoot, file).replaceAll('\\', '/'))
    .sort();
  assert.deepEqual(outputFiles, [...allAssets].sort(), 'Preview directory has missing or unmanifested WOFF2 files');

  for (const excluded of manifest.excludedProtectedAssets ?? []) {
    assert.ok(excluded.reason && excluded.licenseFile, `${excluded.fontId} needs a license exclusion reason`);
    assert.equal(familyBySource.has(excluded.sourcePath), false, `${excluded.fontId} cannot also be subset`);
    const excludedBytes = await readFile(projectPath(excluded.sourcePath, `${excluded.fontId} protected original`));
    assert.equal(excludedBytes.byteLength, excluded.bytes, `${excluded.sourcePath} protected original size changed`);
    assert.equal(hash(excludedBytes), excluded.sha256, `${excluded.sourcePath} protected original hash changed`);
    const license = await readFile(projectPath(excluded.licenseFile, `${excluded.fontId} license`), 'utf8');
    assert.ok(license.trim(), `${excluded.fontId} exclusion license is empty`);
  }
  const excludedBytes = (manifest.excludedProtectedAssets ?? []).reduce((total, asset) => total + asset.bytes, 0);
  assert.equal(manifest.summary?.excludedProtectedAssetCount, manifest.excludedProtectedAssets?.length ?? 0,
    'Manifest protected-font exclusion count is stale');
  assert.equal(manifest.summary?.excludedProtectedBytes, excludedBytes, 'Manifest protected-font byte total is stale');

  for (const fontId of aliasesByFont.keys()) {
    const familyAssets = assetsByFont.get(fontId) ?? [];
    assert.ok(familyAssets.length > 0, `${fontId} has no preview assets`);
    familyAssets.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)
      || String(left.cssWeight).localeCompare(String(right.cssWeight))
      || left.sourceBlock[0] - right.sourceBlock[0]);
    expectedCss.set(`${cssDirectory}/${fontId}.css`, renderFamilyCss(fontId, familyAssets));
  }
  assert.equal(aliasesByFont.size, new Set(assets.map((asset) => asset.fontId)).size,
    'Every reviewed source font must have generated preview assets');

  const familiesModule = renderFamiliesModule([...aliasesByFont].map(([fontId, value]) => ({ fontId, ...value })));
  return { expectedCss, familiesModule, sourceFaceCount: families.length, previewAssetCount: assets.length, previewBytes };
}

async function writeGeneratedFiles(expectedCss, familiesModule) {
  await mkdir(cssRoot, { recursive: true });
  for (const [relativePath, contents] of expectedCss) {
    const target = projectPath(relativePath, 'generated preview CSS');
    await writeFile(target, contents, 'utf8');
  }
  const expectedCssPaths = new Set([...expectedCss.keys()].map((relativePath) => projectPath(relativePath, 'generated preview CSS')));
  const currentCss = (await walkFiles(cssRoot)).filter((file) => file.endsWith('.css'));
  for (const existing of currentCss) {
    if (!expectedCssPaths.has(existing)) {
      // This directory is exclusively generated preview CSS. Removing stale
      // per-font files is safe when an offline font manifest is regenerated.
      await unlink(existing);
    }
  }
  await writeFile(projectPath(generatedFamiliesPath, 'generated family map'), familiesModule, 'utf8');
}

async function checkGeneratedFiles(expectedCss, familiesModule) {
  const stale = [];
  for (const [relativePath, expected] of expectedCss) {
    let actual;
    try {
      actual = await readFile(projectPath(relativePath, 'generated preview CSS'), 'utf8');
    } catch {
      stale.push(relativePath);
      continue;
    }
    if (actual !== expected) stale.push(relativePath);
  }
  let familiesActual;
  try {
    familiesActual = await readFile(projectPath(generatedFamiliesPath, 'generated family map'), 'utf8');
  } catch {
    stale.push(generatedFamiliesPath);
  }
  if (familiesActual !== undefined && familiesActual !== familiesModule) stale.push(generatedFamiliesPath);
  const expectedCssPaths = new Set([...expectedCss.keys()].map((relativePath) => projectPath(relativePath, 'generated preview CSS')));
  for (const file of await walkFiles(cssRoot)) {
    if (file.endsWith('.css') && !expectedCssPaths.has(file)) stale.push(path.relative(projectRoot, file).replaceAll('\\', '/'));
  }
  assert.deepEqual(stale, [], `Generated preview CSS is stale: ${stale.join(', ')}. Run npm run fonts:generate.`);
}

async function main() {
  const manifest = await readManifest();
  const validated = await validateManifest(manifest);
  if (checkOnly) {
    await checkGeneratedFiles(validated.expectedCss, validated.familiesModule);
    console.log(JSON.stringify({ mode: 'checked', ...validated, expectedCss: undefined, familiesModule: undefined }, null, 2));
    return;
  }
  await writeGeneratedFiles(validated.expectedCss, validated.familiesModule);
  console.log(JSON.stringify({ mode: 'generated', ...validated, expectedCss: undefined, familiesModule: undefined }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

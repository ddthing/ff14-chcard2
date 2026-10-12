import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_REGISTRY } from '../src/data/fonts/registry.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedFiles = [
  {
    path: 'src/app/fonts.css',
    render: renderFontsCss,
  },
  {
    path: 'src/data/fonts/stylesheet-loaders.generated.ts',
    render: renderStylesheetLoaders,
  },
];

function assertSafeProjectPath(relativePath, label) {
  assert.equal(typeof relativePath, 'string', `${label} must be a string`);
  const resolved = path.resolve(projectRoot, relativePath);
  const fromRoot = path.relative(projectRoot, resolved);
  assert.ok(fromRoot && !fromRoot.startsWith(`..${path.sep}`) && fromRoot !== '..' && !path.isAbsolute(fromRoot), `${label} must stay inside the project`);
  return resolved;
}

function validateUnicodeRange(range, label) {
  assert.equal(typeof range, 'string', `${label} must be a string`);
  const parts = range.split(',').map((part) => part.trim());
  assert.ok(parts.length > 0 && parts.every((part) => {
    const match = part.match(/^U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$/i);
    if (!match) return false;
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    return start <= end && end <= 0x10ffff;
  }), `${label} must be a valid comma-separated CSS unicode-range`);
}

export async function validateFontRegistry(registry = FONT_REGISTRY) {
  const ids = new Set();
  const localPaths = new Set();
  const packageRoles = new Set();
  const defaultPackageRoles = new Set();
  const cssOrders = new Set();

  for (const [key, entry] of Object.entries(registry)) {
    assert.match(key, /^[A-Za-z_$][\w$]*$/u, `Registry key ${key} must be a valid TypeScript identifier`);
    assert.ok(entry.id && entry.family, `${key} needs a stable id and family`);
    assert.ok(!ids.has(entry.id), `${key} duplicates font id ${entry.id}`);
    ids.add(entry.id);
    if (entry.cssOrder !== undefined) {
      assert.ok(Number.isInteger(entry.cssOrder) && entry.cssOrder >= 0, `${key}.cssOrder must be a non-negative integer`);
      assert.ok(!cssOrders.has(entry.cssOrder), `${key}.cssOrder duplicates ${entry.cssOrder}`);
      cssOrders.add(entry.cssOrder);
    }
    assert.match(entry.sourceUrl, /^https:\/\//u, `${key} needs an HTTPS sourceUrl`);
    assert.equal(typeof entry.license, 'string', `${key}.license must name its license`);
    assert.ok(entry.license.trim().length > 0, `${key}.license must not be empty`);
    assert.ok(Array.isArray(entry.supportedScripts) && entry.supportedScripts.length > 0, `${key} needs at least one supported script`);
    assert.ok(entry.supportedScripts.every((script) => ['latin', 'korean', 'japanese'].includes(script)), `${key} has an unknown supported script`);
    assert.ok(Number.isFinite(entry.axes?.weight?.[0]) && Number.isFinite(entry.axes?.weight?.[1]) && entry.axes.weight[0] <= entry.axes.weight[1], `${key} needs a valid weight axis range`);

    assert.equal(typeof entry.licenseFile, 'string', `${key}.licenseFile must be set`);
    assert.ok(entry.licenseFile.startsWith('licenses/fonts/'), `${key}.licenseFile must be under licenses/fonts`);
    const licensePath = assertSafeProjectPath(entry.licenseFile, `${key}.licenseFile`);
    const license = await readFile(licensePath, 'utf8');
    assert.ok(license.trim().length > 0, `${key}.licenseFile must not be empty`);
    if (entry.license === 'SIL Open Font License 1.1') {
      assert.match(license, /SIL\s+OPEN\s+FONT\s+LICENSE|SIL Open Font License/iu, `${key} license metadata must match its SIL Open Font License file`);
    }
    if (entry.publicLicenseFile) {
      assert.ok(entry.publicLicenseFile.startsWith('public/fonts/licenses/'), `${key}.publicLicenseFile must be under public/fonts/licenses`);
      const publicLicensePath = assertSafeProjectPath(entry.publicLicenseFile, `${key}.publicLicenseFile`);
      assert.equal(await readFile(publicLicensePath, 'utf8'), license, `${entry.publicLicenseFile} must match ${entry.licenseFile}`);
    }

    if (entry.weights) {
      assert.ok(entry.weights.length > 0, `${key}.weights must not be empty`);
      assert.ok(entry.weights.every((weight) => Number.isFinite(weight) && weight >= entry.axes.weight[0] && weight <= entry.axes.weight[1]), `${key}.weights must be within its declared axis`);
      assert.deepEqual([...new Set(entry.weights)], [...entry.weights], `${key}.weights must not contain duplicates`);
    }

    for (const [assetIndex, asset] of (entry.localAssets ?? []).entries()) {
      const label = `${key}.localAssets[${assetIndex}]`;
      const assetPath = assertSafeProjectPath(asset.filePath, `${label}.filePath`);
      assert.equal(asset.filePath.startsWith('public/fonts/'), true, `${label}.filePath must be under public/fonts`);
      assert.equal(asset.publicPath, `/${asset.filePath.replaceAll('\\', '/').slice('public/'.length)}`, `${label}.publicPath must match its public file`);
      assert.ok(!localPaths.has(asset.filePath), `${label} duplicates ${asset.filePath}`);
      localPaths.add(asset.filePath);

      const fileStats = await stat(assetPath);
      assert.equal(fileStats.size, asset.bytes, `${asset.filePath} byte count changed; review and update registry metadata`);
      const bytes = await readFile(assetPath);
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'wOF2', `${asset.filePath} must be WOFF2`);
      assert.ok(['latin', 'latin-ext', 'vietnamese', 'full'].includes(asset.subset), `${label} has an unknown subset`);
      assert.ok(asset.style === undefined || ['normal', 'italic'].includes(asset.style), `${label}.style must be normal or italic`);
      if (asset.stretch !== undefined) assert.match(asset.stretch, /^\d+(?:\.\d+)?%$/u, `${label}.stretch must be a CSS percentage`);
      if (asset.weight !== undefined) {
        assert.ok(Number.isFinite(asset.weight) && asset.weight >= entry.axes.weight[0] && asset.weight <= entry.axes.weight[1], `${label}.weight must be within the declared axis`);
        if (entry.weights) assert.ok(entry.weights.includes(asset.weight), `${label}.weight must appear in the family weight list`);
      }
      if (asset.subset === 'full') assert.equal(asset.unicodeRange, undefined, `${label} full font files should not declare unicode-range`);
      else validateUnicodeRange(asset.unicodeRange, `${label}.unicodeRange`);
    }

    if (entry.package) {
      const packageData = entry.package;
      assert.ok(['sans', 'serif'].includes(packageData.role), `${key}.package.role must be sans or serif`);
      assert.ok(packageData.isDefault === undefined || typeof packageData.isDefault === 'boolean', `${key}.package.isDefault must be boolean`);
      for (const script of entry.supportedScripts) {
        const packageRole = `${script}:${packageData.role}`;
        packageRoles.add(packageRole);
        if (packageData.isDefault) {
          assert.ok(!defaultPackageRoles.has(packageRole), `${key} duplicates the default ${packageData.role} package font for ${script}`);
          defaultPackageRoles.add(packageRole);
        }
      }
      assert.ok(packageData.name && packageData.version, `${key}.package needs a package name and version`);
      assert.equal(packageData.stylesheet.startsWith(`${packageData.name}/`), true, `${key}.package.stylesheet must use its package name`);
      assert.match(packageData.stylesheet, /\.css$/u, `${key}.package.stylesheet must be a CSS file for the generated importer`);
      assert.equal(packageData.stylesheetPath, `node_modules/${packageData.stylesheet}`, `${key}.package.stylesheetPath must match its import`);
      const stylesheetPath = assertSafeProjectPath(packageData.stylesheetPath, `${key}.package.stylesheetPath`);
      await stat(stylesheetPath);
      assert.ok(Number.isInteger(packageData.fileCount) && packageData.fileCount > 0, `${key}.package.fileCount must be positive`);
      assert.ok(Number.isInteger(packageData.fontBytes) && packageData.fontBytes > 0, `${key}.package.fontBytes must be positive`);
      assert.equal(packageData.unicodeRangeLoading, true, `${key}.package must retain unicode-range loading`);
    }
  }

  for (const role of packageRoles) {
    assert.ok(defaultPackageRoles.has(role), `A default package face is required for ${role}`);
  }
}

export function renderFontsCss(registry = FONT_REGISTRY) {
  const faceBlocks = [];
  const orderedEntries = Object.entries(registry).sort(([, left], [, right]) => (
    (left.cssOrder ?? Number.POSITIVE_INFINITY) - (right.cssOrder ?? Number.POSITIVE_INFINITY)
  ));

  for (const [, entry] of orderedEntries) {
    for (const asset of entry.localAssets ?? []) {
      const [minimumWeight, maximumWeight] = entry.axes.weight;
      const weight = asset.weight ?? (minimumWeight === maximumWeight ? `${minimumWeight}` : `${minimumWeight} ${maximumWeight}`);
      const lines = [
        '@font-face {',
        `  font-family: ${JSON.stringify(entry.family)};`,
        `  font-style: ${asset.style ?? 'normal'};`,
        `  font-display: ${entry.fontDisplay ?? 'swap'};`,
        `  font-weight: ${weight};`,
        ...(asset.stretch ? [`  font-stretch: ${asset.stretch};`] : []),
        `  src: url(${JSON.stringify(asset.publicPath)}) format("woff2");`,
        ...(asset.unicodeRange ? [`  unicode-range: ${asset.unicodeRange};`] : []),
        '}',
      ];
      faceBlocks.push(lines.join('\n'));
    }
  }

  return [
    '/* Generated from src/data/fonts/registry.ts. Do not edit by hand. */',
    ...faceBlocks,
    '',
  ].join('\n\n');
}

export function renderStylesheetLoaders(registry = FONT_REGISTRY) {
  const entries = Object.entries(registry).filter(([, entry]) => entry.package);
  const lines = [
    '// Generated from src/data/fonts/registry.ts. Do not edit by hand.',
    'export const TYPOGRAPHY_STYLESHEET_LOADERS = {',
    ...entries.map(([key, entry]) => `  ${key}: () => import(${JSON.stringify(entry.package.stylesheet)}),`),
    '} as const;',
    '',
    'export type TypographyStylesheetId = keyof typeof TYPOGRAPHY_STYLESHEET_LOADERS;',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  assert.ok(args.every((argument) => argument === '--check'), `Unknown generator option: ${args.find((argument) => argument !== '--check')}`);

  await validateFontRegistry();
  const staleFiles = [];

  for (const generated of generatedFiles) {
    const absolutePath = path.join(projectRoot, generated.path);
    const expected = generated.render();
    if (checkOnly) {
      let actual;
      try {
        actual = await readFile(absolutePath, 'utf8');
      } catch {
        staleFiles.push(generated.path);
        continue;
      }
      if (actual !== expected) staleFiles.push(generated.path);
      continue;
    }

    await writeFile(absolutePath, expected, 'utf8');
  }

  if (staleFiles.length > 0) {
    console.error(`Generated font files are stale: ${staleFiles.join(', ')}. Run node --experimental-strip-types tools/generate-font-registry.mjs.`);
    process.exitCode = 1;
  } else if (checkOnly) {
    console.log('Font registry generated files are current.');
  } else {
    console.log(`Generated ${generatedFiles.map(({ path: outputPath }) => outputPath).join(' and ')}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (!specifier.startsWith('./') && !specifier.startsWith('../')) ||
      extname(specifier)
    ) {
      return nextResolve(specifier, context);
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const parentPath = fileURLToPath(context.parentURL);
      const candidate = `${resolvePath(dirname(parentPath), specifier)}.ts`;
      if (!existsSync(candidate)) throw error;
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  },
});

process.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED = 'true';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(resolvePath(root, 'src/lib/ffxiv-assets/job-icon-manifest.json'), 'utf8'),
);
const maskMetrics = JSON.parse(
  readFileSync(resolvePath(root, 'docs/ffxiv-assets/job-icon-mask-metrics.json'), 'utf8'),
);
const { FFXIV_OFFICIAL_ASSETS_ENABLED } = await import(
  '../src/lib/ffxiv-assets/config.ts'
);
const { getOfficialJobIconAsset, getOfficialJobIconSrc, OFFICIAL_JOB_ICON_ASSETS } = await import(
  '../src/lib/ffxiv-assets/job-icons.ts'
);
const { JOBS } = await import(
  pathToFileURL(resolvePath(root, 'src/data/ffxiv/jobs.ts')).href
);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function localAssetPath(publicSrc) {
  assert.match(publicSrc, /^\/assets\/ffxiv\/jobs\/official\//);
  return resolvePath(root, 'public', publicSrc.slice(1));
}

async function pngFilesRecursively(directory) {
  const children = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    children.map((child) => {
      const path = resolvePath(directory, child.name);
      return child.isDirectory() ? pngFilesRecursively(path) : [path];
    }),
  );
  return nested.flat().filter((path) => path.toLowerCase().endsWith('.png'));
}

test('enabled manifest maps every source job except missing Beastmaster', async () => {
  assert.equal(FFXIV_OFFICIAL_ASSETS_ENABLED, true);
  assert.equal(Object.keys(manifest.entries).length, 33);
  assert.ok(JOBS.some((job) => job.id === 'beastmaster'));

  const expectedIds = JOBS.filter((job) => job.id !== 'beastmaster')
    .map((job) => job.id)
    .sort();
  assert.deepEqual(Object.keys(manifest.entries).sort(), expectedIds);
  assert.deepEqual(Object.keys(OFFICIAL_JOB_ICON_ASSETS).sort(), expectedIds);

  for (const jobId of expectedIds) {
    const asset = getOfficialJobIconAsset(jobId);
    const entry = manifest.entries[jobId];
    const sourceGroup = entry.sourcePath.split('/')[3];
    const expectedMode = ['01_TANK', '02_HEALER', '03_DPS', '06_LIMITED'].includes(sourceGroup)
      ? 'gold-hue'
      : 'neutral-luminance';
    assert.ok(asset, `${jobId} should resolve from the local reviewed manifest`);
    assert.equal(entry.extractionMode, expectedMode);
    assert.equal(getOfficialJobIconSrc(jobId), entry.src);
    assert.deepEqual(
      {
        src: asset.src,
        maskSrc: asset.maskSrc,
        sourcePath: asset.sourcePath,
        width: asset.width,
        height: asset.height,
      },
      {
        src: entry.src,
        maskSrc: entry.maskSrc,
        sourcePath: entry.sourcePath,
        width: 76,
        height: 76,
      },
    );

    const [sourceBytes, runtimeBytes, maskBytes] = await Promise.all([
      readFile(resolvePath(root, entry.sourcePath)),
      readFile(localAssetPath(entry.src)),
      readFile(localAssetPath(entry.maskSrc)),
    ]);
    assert.deepEqual(runtimeBytes, sourceBytes, `${jobId} original stays byte-identical`);
    assert.equal(sha256(sourceBytes), entry.sourceSha256, `${jobId} source SHA-256`);
    assert.equal(sha256(maskBytes), entry.maskSha256, `${jobId} mask SHA-256`);

    const metadata = await sharp(maskBytes).metadata();
    assert.deepEqual(
      { format: metadata.format, width: metadata.width, height: metadata.height },
      { format: 'png', width: 76, height: 76 },
      `${jobId} mask stays native resolution`,
    );
    const { data, info } = await sharp(maskBytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
      const offset = pixel * info.channels;
      if (data[offset + 3] === 0) continue;
      assert.deepEqual(
        [...data.slice(offset, offset + 3)],
        [255, 255, 255],
        `${jobId} mask pixels must be white for currentColor tinting`,
      );
    }
  }
});

test('source and runtime inventories stay scoped to supplied jobs', async () => {
  const sourceFiles = await pngFilesRecursively(resolvePath(root, 'vendor/ffxiv-fankit/class-job-icons'));
  const runtimeFiles = await pngFilesRecursively(resolvePath(root, 'public/assets/ffxiv/jobs/official'));
  const directRuntimeFiles = await readdir(resolvePath(root, 'public/assets/ffxiv/jobs/official'));
  const maskFiles = await readdir(resolvePath(root, 'public/assets/ffxiv/jobs/official/masks'));

  assert.equal(sourceFiles.length, 45);
  assert.equal(runtimeFiles.length, 66);
  assert.equal(directRuntimeFiles.filter((name) => name.endsWith('.png')).length, 33);
  assert.equal(maskFiles.filter((name) => name.endsWith('.png')).length, 33);
});

test('golden healer masks exclude their green background fields', () => {
  for (const jobId of ['white-mage', 'scholar', 'astrologian', 'sage']) {
    const entry = maskMetrics.find((item) => item.jobId === jobId);
    assert.ok(entry, `mask metrics exist for ${jobId}`);
    assert.equal(entry.extractionMode, 'gold-hue');
    const [minX, minY, maxX, maxY] = entry.glyphBounds;
    assert.ok(maxX - minX + 1 < 48 || maxY - minY + 1 < 48, `${jobId} must not become a frame-sized rectangle`);
    assert.ok(entry.nonzeroAlphaPixels < 1000, `${jobId} should contain glyph pixels only`);
  }
});

test('frame cleanup removes faint detached halo pixels but keeps glyph details', async () => {
  assert.ok(maskMetrics.every((item) => item.remainingFrameHaloComponents === 0));

  async function maskAlphaGrid(jobId) {
    const bytes = await readFile(localAssetPath(manifest.entries[jobId].maskSrc));
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return (x, y) => data[(y * info.width + x) * info.channels + 3];
  }

  const whiteMage = maskMetrics.find((item) => item.jobId === 'white-mage');
  const whiteMageAlpha = await maskAlphaGrid('white-mage');
  assert.equal(whiteMage.frameHaloPixelsRemoved, 1);
  assert.equal(whiteMageAlpha(14, 14), 0);

  let whiteMageInnerDotAlpha = 0;
  for (let y = 21; y <= 28; y += 1) {
    for (let x = 31; x <= 39; x += 1) {
      whiteMageInnerDotAlpha = Math.max(whiteMageInnerDotAlpha, whiteMageAlpha(x, y));
    }
  }
  assert.equal(whiteMageInnerDotAlpha, 255);

  const goldsmith = maskMetrics.find((item) => item.jobId === 'goldsmith');
  const goldsmithAlpha = await maskAlphaGrid('goldsmith');
  assert.equal(goldsmith.frameHaloPixelsRemoved, 0);
  assert.equal(goldsmithAlpha(61, 61), 64);
});

test('unknown, unsafe and missing ids stay on the generic fallback path', () => {
  for (const jobId of ['beastmaster', 'unknown-job', '../paladin', 'constructor', '__proto__']) {
    assert.equal(getOfficialJobIconAsset(jobId), null, `${jobId} must not resolve`);
    assert.equal(getOfficialJobIconSrc(jobId), null, `${jobId} must not resolve an original`);
  }
  assert.equal(getOfficialJobIconAsset(null), null);
  assert.equal(getOfficialJobIconAsset(undefined), null);
});

test('importer check confirms deterministic mask bytes and source copies', () => {
  execFileSync(process.execPath, ['tools/import-ffxiv-job-icons.mjs', '--check'], {
    cwd: root,
    stdio: 'pipe',
  });
});

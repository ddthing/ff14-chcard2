import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((!specifier.startsWith('./') && !specifier.startsWith('../')) || extname(specifier)) {
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
const manifest = JSON.parse(readFileSync(resolvePath(root, 'src/lib/ffxiv-assets/xivapi-job-icon-manifest.json'), 'utf8'));
const { FFXIV_OFFICIAL_ASSETS_ENABLED, resolveJobIcon } = await import('../src/lib/ffxiv-assets/index.ts');
const { JOBS } = await import(pathToFileURL(resolvePath(root, 'src/data/ffxiv/jobs.ts')).href);

function localAssetPath(src) {
  assert.match(src, /^\/assets\/ffxiv\/jobs\/xivapi\/(?:svg|icons)\//);
  return resolvePath(root, 'public', src.slice(1));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha(bytes) {
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
}

test('XIVAPI covers all source-backed jobs and never resolves a non-XIVAPI asset', () => {
  assert.equal(FFXIV_OFFICIAL_ASSETS_ENABLED, true);
  assert.equal(manifest.currentJobCount, JOBS.length);
  assert.deepEqual(Object.keys(manifest.entries).sort(), JOBS.map((job) => job.id).sort());

  const counts = { svg: 0, icons: 0 };
  for (const job of JOBS) {
    const entry = manifest.entries[job.id];
    const selected = entry.svg?.verified ? entry.svg : entry.raster;
    const resolved = resolveJobIcon({ jobId: job.id, usage: 'picker' });
    if (job.id === 'beastmaster') {
      assert.equal(selected, null);
      assert.equal(resolved, null);
      continue;
    }
    assert.ok(selected, `${job.id} has a reviewed XIVAPI source`);
    assert.equal(selected.integrityVerified, true);
    assert.ok(resolved, `${job.id} resolves when official assets are enabled`);
    assert.match(resolved.src, /^\/assets\/ffxiv\/jobs\/xivapi\//);
    assert.ok(['xivapi-svg', 'xivapi-raster'].includes(resolved.source));
    assert.equal(resolved.src, selected.src);
    counts[selected.provider] += 1;
  }
  assert.deepEqual(counts, { svg: 16, icons: 17 });
});

test('14 newly adopted raw 256px XIVAPI icons pass integrity, alpha and usage gates', async () => {
  const jobs = [
    'dark-knight', 'astrologian', 'ninja', 'carpenter', 'blacksmith', 'armorer',
    'goldsmith', 'leatherworker', 'weaver', 'alchemist', 'culinarian', 'miner',
    'botanist', 'fisher',
  ];
  const requiredUsages = ['picker', 'micro', 'cardSmall', 'cardMedium', 'export'];

  for (const jobId of jobs) {
    const source = manifest.entries[jobId].raster;
    assert.equal(source.src, `/assets/ffxiv/jobs/xivapi/icons/${jobId}.png`);
    assert.deepEqual([source.width, source.height, source.provider, source.verified, source.integrityVerified], [256, 256, 'icons', true, true]);
    assert.deepEqual(source.verifiedUsages, requiredUsages);
    assert.equal(source.verifiedUsages.includes('cardDisplay'), false);

    const bytes = await readFile(localAssetPath(source.src));
    assert.equal(sha256(bytes), source.sha256, `${jobId} SHA-256`);
    assert.equal(gitBlobSha(bytes), source.upstreamGitBlobSha, `${jobId} pinned upstream Git blob`);
    const metadata = await sharp(bytes).metadata();
    assert.deepEqual([metadata.format, metadata.width, metadata.height, metadata.hasAlpha], ['png', 256, 256, true]);

    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 256);
    assert.equal(info.height, 256);
    assert.deepEqual([data[3], data[(255 * 4) + 3], data[((255 * 256) * 4) + 3], data[((256 * 256) - 1) * 4 + 3]], [0, 0, 0, 0]);
    let nonzero = 0;
    let full = 0;
    let minX = 256;
    let minY = 256;
    let maxX = -1;
    let maxY = -1;
    for (let pixel = 0; pixel < 256 * 256; pixel += 1) {
      const alpha = data[pixel * info.channels + 3];
      if (!alpha) continue;
      const x = pixel % 256;
      const y = Math.floor(pixel / 256);
      nonzero += 1;
      if (alpha === 255) full += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    assert.ok(nonzero > 1_000, `${jobId} has a complete nonempty glyph`);
    assert.ok(full > 500, `${jobId} includes solid source pixels`);
    assert.ok(minX >= 8 && minY >= 8 && maxX <= 247 && maxY <= 247, `${jobId} glyph is not clipped to the canvas edge`);
  }
});

test('generated job-mask and SDF assets are absent from runtime and archived build trees', () => {
  const retiredAssetPaths = [
    'public/assets/ffxiv/jobs/official/masks',
    'public/assets/ffxiv/jobs/derived',
    'dist/assets/ffxiv/jobs/official/masks',
    'dist/assets/ffxiv/jobs/derived',
    'out/assets/ffxiv/jobs/official/masks',
    'out/assets/ffxiv/jobs/derived',
    '.asset-archive/job-icon-derived/public/assets/ffxiv/jobs/official/masks',
    '.asset-archive/job-icon-derived/public/assets/ffxiv/jobs/derived',
    '.asset-archive/job-icon-derived/build-output/dist/assets/ffxiv/jobs/official/masks',
    '.asset-archive/job-icon-derived/build-output/dist/assets/ffxiv/jobs/derived',
    '.asset-archive/job-icon-derived/build-output/out/assets/ffxiv/jobs/official/masks',
    '.asset-archive/job-icon-derived/build-output/out/assets/ffxiv/jobs/derived',
    'docs/qa/icon-fidelity/candidates',
  ];

  for (const relativePath of retiredAssetPaths) {
    assert.equal(existsSync(resolvePath(root, relativePath)), false, `${relativePath} must stay removed`);
  }
});

test('source-only Fan Kit checker and pinned XIVAPI checker pass', () => {
  execFileSync(process.execPath, ['tools/check-fankit-source-copies.mjs', '--check'], { cwd: root, stdio: 'pipe' });
  execFileSync(process.execPath, ['tools/sync-xivapi-job-icons.mjs', '--check'], { cwd: root, stdio: 'pipe' });
});

test('legacy mask generators fail closed without writing files', () => {
  for (const script of [
    'tools/import-ffxiv-job-icons.mjs',
    'tools/icon-fidelity-lab.mjs',
    'tools/compare-xivapi-job-icons.mjs',
  ]) {
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 2, `${script} should be retired`);
    assert.match(result.stderr, /Retired:/, `${script} should explain its retirement`);
  }
});

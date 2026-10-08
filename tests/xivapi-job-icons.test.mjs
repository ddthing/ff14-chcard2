import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { register } from 'node:module';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./ts-alias-loader.mjs', import.meta.url);
process.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED = 'true';

const root = resolvePath(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(
  readFileSync(resolvePath(root, 'src/lib/ffxiv-assets/xivapi-job-icon-manifest.json'), 'utf8'),
);
const {
  FFXIV_OFFICIAL_ASSETS_ENABLED,
  resolveJobIcon,
  resolveJobIconFromSources,
} = await import('../src/lib/ffxiv-assets/index.ts');
const { JOBS } = await import(pathToFileURL(resolvePath(root, 'src/data/ffxiv/jobs.ts')).href);

function isSource(value) {
  return Boolean(value && typeof value === 'object' && typeof value.src === 'string');
}

function sourceCandidates(entry) {
  const candidates = [];
  if (isSource(entry.svg)) candidates.push(entry.svg);

  if (isSource(entry.raster)) {
    candidates.push(entry.raster);
  } else if (entry.raster && typeof entry.raster === 'object') {
    candidates.push(...Object.values(entry.raster).filter(isSource));
  }

  if (entry.rasterCandidates && typeof entry.rasterCandidates === 'object') {
    candidates.push(...Object.values(entry.rasterCandidates).filter(isSource));
  }

  return [...new Map(candidates.map(source => [source.src, source])).values()];
}

function adoptedRaster(entry) {
  return isSource(entry.raster) ? entry.raster : null;
}

function isReviewedFor(source, usage) {
  return source?.verified === true && (!source.verifiedUsages || source.verifiedUsages.includes(usage));
}

function expectedSource(jobId, usage = 'picker') {
  const entry = manifest.entries[jobId];
  if (isReviewedFor(entry?.svg, usage)) return ['xivapi-svg', entry.svg.src];
  if (isReviewedFor(adoptedRaster(entry ?? {}), usage)) return ['xivapi-raster', entry.raster.src];
  return null;
}

test('manifest covers every canonical job and records source gaps explicitly', () => {
  const jobIds = JOBS.map(job => job.id).sort();
  assert.equal(manifest.currentJobCount, JOBS.length);
  assert.deepEqual(Object.keys(manifest.entries).sort(), jobIds);
  assert.ok(manifest.entries.beastmaster, 'missing jobs remain visible in the manifest');
  assert.equal(manifest.entries.beastmaster.svg ?? null, null);
  assert.equal(adoptedRaster(manifest.entries.beastmaster), null);

  for (const jobId of jobIds) {
    const actual = resolveJobIcon({ jobId, usage: 'picker' });
    assert.deepEqual(
      actual ? [actual.source, actual.src] : null,
      expectedSource(jobId),
      `${jobId} follows its reviewed source order`,
    );
  }
});

test('each checked-in XIVAPI candidate is local, present and matches its recorded checksum', () => {
  const publishedCoverage = { svg: 0, icons: 0, companion: 0, risingstones: 0 };
  const sourceAvailable = manifest.coverage.sourceAvailable ?? manifest.coverage;
  assert.deepEqual(sourceAvailable, { svg: 33, icons: 33, companion: 33, risingstones: 31 });
  assert.deepEqual(manifest.coverage.publishedSources, { svg: 16, icons: 18, companion: 0, risingstones: 0 });

  for (const entry of Object.values(manifest.entries)) {
    if (isSource(entry.svg)) publishedCoverage.svg += 1;
    const rasterSource = isSource(entry.raster) ? entry.raster : null;
    if (rasterSource) {
      const provider = rasterSource.provider ?? rasterSource.sourceProvider ?? rasterSource.src.split('/')[5];
      if (typeof provider === 'string' && provider in publishedCoverage) publishedCoverage[provider] += 1;
    }

    for (const source of sourceCandidates(entry)) {
      assert.match(source.src, /^\/assets\/ffxiv\/jobs\/xivapi\//);
      assert.doesNotMatch(source.src, /(?:\.\.|%|\\|\?|#)/);
      assert.equal(source.integrityVerified, true, `${source.src} has passed byte verification`);
      assert.match(source.sha256, /^[a-f\d]{64}$/i, `${source.src} records SHA-256`);
      const localPath = resolvePath(root, 'public', source.src.slice(1));
      const bytes = readFileSync(localPath);
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        source.sha256,
        `${source.src} matches SHA-256`,
      );
    }
  }

  assert.ok(
    Object.values(publishedCoverage).some(count => count > 0),
    'at least one quality-reviewed XIVAPI source is adopted for runtime use',
  );
  const recordedPublishedCoverage = manifest.coverage.publishedSources ?? manifest.coverage;
  for (const [provider, count] of Object.entries(publishedCoverage)) {
    assert.equal(recordedPublishedCoverage[provider], count, `${provider} coverage matches published sources`);
  }
});

test('reviewed XIVAPI SVG and raster sources cascade without generated-mask fallback', () => {
  assert.equal(FFXIV_OFFICIAL_ASSETS_ENABLED, true);
  const svg = {
    src: '/assets/ffxiv/jobs/xivapi/svg/paladin.svg',
    width: 1000,
    height: 1000,
    provider: 'svg',
    sha256: 'a'.repeat(64),
    integrityVerified: true,
    verified: true,
    visualScale: 0.79,
    opticalOffsetX: 0.025,
    opticalOffsetY: -0.015,
  };
  const raster = {
    src: '/assets/ffxiv/jobs/xivapi/icons/paladin.png',
    width: 256,
    height: 256,
    provider: 'icons',
    sha256: 'b'.repeat(64),
    integrityVerified: true,
    verified: true,
  };
  const common = {
    jobId: 'paladin',
    usage: 'picker',
    officialAssetsEnabled: true,
    entry: { svg, raster },
  };

  const vector = resolveJobIconFromSources(common);
  assert.deepEqual(
    vector && [vector.source, vector.src, vector.renderAs],
    ['xivapi-svg', svg.src, 'mask'],
  );
  assert.deepEqual(
    vector && [vector.visualScale, vector.opticalOffsetX, vector.opticalOffsetY],
    [0.79, 0.025, -0.015],
  );

  const rasterFallback = resolveJobIconFromSources({ ...common, failedSources: [svg.src] });
  assert.deepEqual(
    rasterFallback && [rasterFallback.source, rasterFallback.src],
    ['xivapi-raster', raster.src],
  );

  const noGeneratedMaskFallback = resolveJobIconFromSources({
    ...common,
    failedSources: [svg.src, raster.src],
  });
  assert.equal(noGeneratedMaskFallback, null);

  assert.equal(resolveJobIconFromSources({
    ...common,
    failedSources: [svg.src, raster.src],
  }), null);
  assert.equal(resolveJobIconFromSources({ ...common, officialAssetsEnabled: false }), null);
});

test('unsafe local source paths never override the generic fallback', () => {
  const unsafePaths = [
    'https://example.invalid/paladin.svg',
    '//example.invalid/paladin.svg',
    '/assets/ffxiv/jobs/xivapi/svg/../paladin.svg',
    '/assets/ffxiv/jobs/xivapi/svg/%2e%2e/paladin.svg',
    '/assets/ffxiv/jobs/xivapi/svg/paladin.svg?download=1',
    '/assets/ffxiv/jobs/xivapi/svg/paladin.svg#icon',
    '/assets/ffxiv/jobs/xivapi/svg/paladin icon.svg',
    '/assets/ffxiv/jobs/xivapi/svg\\paladin.svg',
  ];

  for (const src of unsafePaths) {
    const result = resolveJobIconFromSources({
      jobId: 'paladin',
      usage: 'picker',
      officialAssetsEnabled: true,
      entry: {
        svg: {
          src,
          width: 1000,
          height: 1000,
          provider: 'svg',
          sha256: 'c'.repeat(64),
          integrityVerified: true,
          verified: true,
        },
      },
    });
    assert.equal(result, null, `${src} must be rejected`);
  }
});

test('display marks require a reviewed SVG and per-usage approvals stay scoped', () => {
  const svg = {
    src: '/assets/ffxiv/jobs/xivapi/svg/warrior.svg',
    width: 1000,
    height: 1000,
    provider: 'svg',
    sha256: 'd'.repeat(64),
    integrityVerified: true,
    verified: true,
    verifiedUsages: ['picker', 'micro', 'cardSmall', 'cardMedium'],
  };
  const raster = {
    src: '/assets/ffxiv/jobs/xivapi/icons/warrior.png',
    width: 256,
    height: 256,
    provider: 'icons',
    sha256: 'e'.repeat(64),
    integrityVerified: true,
    verified: true,
  };
  const base = {
    jobId: 'warrior',
    officialAssetsEnabled: true,
    entry: { svg, raster },
  };

  assert.equal(resolveJobIconFromSources({ ...base, usage: 'cardDisplay' }), null);
  assert.equal(resolveJobIconFromSources({ ...base, usage: 'cardSmall' })?.source, 'xivapi-svg');
  assert.equal(resolveJobIconFromSources({ ...base, usage: 'export' })?.source, 'xivapi-raster');
  assert.equal(resolveJobIconFromSources({ ...base, usage: 'small' })?.usage, 'cardSmall');
  assert.equal(resolveJobIconFromSources({ ...base, usage: 'medium' })?.usage, 'cardMedium');
  assert.equal(resolveJobIconFromSources({ ...base, usage: 'editorialLarge' }), null);

  const displaySvg = resolveJobIconFromSources({
    ...base,
    usage: 'cardDisplay',
    entry: { svg: { ...svg, verifiedUsages: ['cardDisplay'] }, raster },
  });
  assert.equal(displaySvg?.source, 'xivapi-svg');

  const monochromeSourceAppearance = resolveJobIconFromSources({
    ...base,
    usage: 'micro',
    appearance: 'source',
  });
  assert.equal(monochromeSourceAppearance?.renderAs, 'mask');

  const nativeSourceAppearance = resolveJobIconFromSources({
    ...base,
    usage: 'micro',
    appearance: 'source',
    entry: { svg: { ...svg, colorMode: 'native' }, raster },
  });
  assert.equal(nativeSourceAppearance?.renderAs, 'image');
});

test('the feature flag leaves generic fallback available and unknown IDs never resolve', () => {
  assert.equal(resolveJobIcon({ jobId: 'paladin', usage: 'picker', officialAssetsEnabled: false }), null);
  for (const jobId of ['beastmaster', '../paladin', 'unknown-job', 'constructor', '__proto__']) {
    assert.equal(resolveJobIcon({ jobId, usage: 'picker', officialAssetsEnabled: true }), null);
  }
});

test('a reviewed representative job resolves a preferred XIVAPI source', () => {
  const representativeJobs = [
    'paladin', 'warrior', 'dark-knight', 'gunbreaker', 'white-mage',
    'astrologian', 'dragoon', 'black-mage', 'dancer', 'red-mage',
  ];
  const adopted = representativeJobs
    .map(jobId => ({ jobId, expected: expectedSource(jobId) }))
    .find(({ expected }) => expected && expected[0] !== 'fan-kit');

  assert.ok(adopted, 'at least one reviewed comparison job adopts XIVAPI art');
  const resolved = resolveJobIcon({ jobId: adopted.jobId, usage: 'picker' });
  assert.equal(resolved?.source, adopted.expected[0]);
  assert.equal(resolved?.src, adopted.expected[1]);
  assert.equal(resolved?.verified, true);
});

test('previously mask-backed jobs now use the inspected 256px XIVAPI originals', () => {
  const migratedJobs = [
    'dark-knight', 'astrologian', 'ninja', 'carpenter', 'blacksmith', 'armorer',
    'goldsmith', 'leatherworker', 'weaver', 'alchemist', 'culinarian', 'miner',
    'botanist', 'fisher',
  ];
  for (const jobId of migratedJobs) {
    const small = resolveJobIcon({ jobId, usage: 'cardSmall' });
    assert.deepEqual(small && [small.source, small.src, small.width, small.height], [
      'xivapi-raster', `/assets/ffxiv/jobs/xivapi/icons/${jobId}.png`, 256, 256,
    ]);
    assert.equal(resolveJobIcon({ jobId, usage: 'cardDisplay' }), null, `${jobId} stays off the large raster path`);
  }
});

test('Reaper source appearance preserves raster color while tinted appearance uses source alpha', () => {
  const reaperSource = manifest.entries.reaper.raster;
  assert.equal(reaperSource.colorMode, 'source-color-and-alpha-mask');

  const original = resolveJobIcon({ jobId: 'reaper', usage: 'picker', appearance: 'source' });
  assert.deepEqual(
    original && [original.source, original.src, original.renderAs],
    ['xivapi-raster', reaperSource.src, 'image'],
  );

  const tinted = resolveJobIcon({ jobId: 'reaper', usage: 'picker', appearance: 'tinted' });
  assert.deepEqual(
    tinted && [tinted.source, tinted.src, tinted.renderAs],
    ['xivapi-raster', reaperSource.src, 'mask'],
  );
});

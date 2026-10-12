import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
const { resolveJobIcon } = await import('../src/lib/ffxiv-assets/job-icon-resolver.ts');

test('large job marks resolve only to approved XIVAPI sources or to the template fallback', () => {
  for (const usage of ['small', 'medium', 'editorialLarge']) {
    const icon = resolveJobIcon({ jobId: 'gunbreaker', usage, officialAssetsEnabled: true });
    assert.equal(icon?.source, 'xivapi-svg');
    assert.equal(icon?.src, '/assets/ffxiv/jobs/xivapi/svg/gunbreaker.svg');
    assert.doesNotMatch(icon?.src ?? '', /(?:derived|official\/masks)/);
  }
  assert.equal(resolveJobIcon({ jobId: 'beastmaster', usage: 'editorialLarge', officialAssetsEnabled: true }), null);
});

test('large marks prefer original SVGs and allow only manifest-approved original raster fallbacks', () => {
  const ninja = resolveJobIcon({ jobId: 'ninja', usage: 'cardDisplay', officialAssetsEnabled: true });
  assert.deepEqual(
    { source: ninja?.source, src: ninja?.src, width: ninja?.width, height: ninja?.height },
    {
      source: 'xivapi-raster',
      src: '/assets/ffxiv/jobs/xivapi/icons/ninja.png',
      width: 256,
      height: 256,
    },
  );
  const reaper = resolveJobIcon({ jobId: 'reaper', usage: 'cardDisplay', officialAssetsEnabled: true });
  assert.equal(reaper?.source, 'xivapi-raster');
  assert.equal(reaper?.src, '/assets/ffxiv/jobs/xivapi/icons/reaper.png');
  const vectorFirst = resolveJobIcon({ jobId: 'summoner', usage: 'cardDisplay', officialAssetsEnabled: true });
  assert.equal(vectorFirst?.source, 'xivapi-svg');
  assert.equal(vectorFirst?.src, '/assets/ffxiv/jobs/xivapi/svg/summoner.svg');
  assert.equal(resolveJobIcon({ jobId: 'beastmaster', usage: 'cardDisplay', officialAssetsEnabled: true }), null);
});

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

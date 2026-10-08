import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);
const { getDerivedJobIconAsset } = await import('../src/lib/ffxiv-assets/derived-job-icons.ts');

test('Award Masters reject the retired GNB SDF exception while retaining the lab evidence', async () => {
  for (const usage of ['small', 'medium', 'editorialLarge']) {
    for (const job of ['gunbreaker', 'dark-knight', 'white-mage', 'beastmaster', 'unknown', undefined, null]) {
      assert.equal(getDerivedJobIconAsset(job, usage), null);
    }
  }
  const png = await readFile(new URL('../public/assets/ffxiv/jobs/derived/sdf/candidates/gunbreaker@2432.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 2432);
  assert.equal(png.readUInt32BE(20), 2432);
});

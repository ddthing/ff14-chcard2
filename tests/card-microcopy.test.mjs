import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
register('./ts-alias-loader.mjs', import.meta.url);
const { getCardMicrocopy } = await import('../src/lib/card-microcopy.ts');
test('printed microcopy uses canonical jobs and actual service/region data', () => {
  assert.deepEqual(getCardMicrocopy({jobId:'gunbreaker',service:'global',physicalRegionId:'japan'}), {jobAbbreviation:'GNB',origin:'GLOBAL / JP'});
  assert.deepEqual(getCardMicrocopy({jobId:'white-mage',service:'korea',physicalRegionId:null}), {jobAbbreviation:'WHM',origin:'KOREA'});
});
test('missing or unknown microcopy never invents a code or a region', () => {
  assert.deepEqual(getCardMicrocopy({job:'Unregistered job'}), {jobAbbreviation:'',origin:''});
  assert.equal(getCardMicrocopy({job:'Bard',service:'global',physicalRegionId:'unknown'}).origin,'GLOBAL');
});

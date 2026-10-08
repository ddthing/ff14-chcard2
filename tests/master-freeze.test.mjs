import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const { MASTER_CARD_CONFIG, MASTER_TEMPLATE_ORDER, MASTER_DESIGN_VERSION, MASTER_VISUAL_VERSION, masterFieldProps } = await import('../src/lib/master-card-config.ts');
const { MASTER_ART_TOKENS } = await import('../src/lib/card-art-tokens.ts');

test('the picker exposes exactly the three locked Master A directions', () => {
  assert.equal(MASTER_DESIGN_VERSION, '2.6.4');
  assert.equal(MASTER_VISUAL_VERSION, '3.0.0');
  assert.deepEqual(MASTER_TEMPLATE_ORDER.map(family => [MASTER_CARD_CONFIG[family].id, MASTER_CARD_CONFIG[family].direction, MASTER_CARD_CONFIG[family].layout]), [
    ['cinematic-master', 'c2', 'a'], ['editorial-master', 'e2', 'a'], ['identity-master', 'i3', 'a'],
  ]);
  assert.equal(new Set(MASTER_TEMPLATE_ORDER).size, 3);
});

test('locked compositions print every primary field and retain disjoint priority tiers', () => {
  for (const spec of Object.values(MASTER_CARD_CONFIG)) {
    assert.ok(spec.information.primary.every(field => spec.defaultFields.includes(field)));
    const tiers = Object.values(spec.information).flat();
    assert.equal(new Set(tiers).size, tiers.length);
    assert.equal(new Set(spec.defaultFields).size, spec.defaultFields.length);
    for (const field of spec.defaultFields) assert.ok(Object.values(spec.typography).some(fields => fields.includes(field)), `${spec.id}: missing typography role for ${field}`);
  }
});

test('renderer field attributes preserve each family information and type roles', () => {
  assert.deepEqual(masterFieldProps('cinematic', 'name'), { 'data-field': 'name', 'data-information-priority': 'primary', 'data-typography-role': 'display' });
  assert.equal(masterFieldProps('editorial', 'world')['data-information-priority'], 'secondary');
  assert.equal(masterFieldProps('editorial', 'jobAbbreviation')['data-typography-role'], 'secondary-display');
  assert.equal(masterFieldProps('id-card', 'freeCompany')['data-information-priority'], 'primary');
  assert.equal(masterFieldProps('id-card', 'languages')['data-information-priority'], 'secondary');
  assert.equal(masterFieldProps('id-card', 'origin')['data-typography-role'], 'micro');
});

test('outer frames are independent of the browser viewport', () => {
  assert.equal(MASTER_ART_TOKENS['id-card'].frameRuleWidth, '1px');
  for (const material of Object.values(MASTER_ART_TOKENS)) {
    assert.match(material.frameRuleWidth, /^(?:0|\d+(?:\.\d+)?px)$/);
  }
});

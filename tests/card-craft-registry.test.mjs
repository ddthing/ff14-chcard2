import assert from 'node:assert/strict';
import test from 'node:test';
import {CARD_PICTOGRAMS} from '../src/lib/card-graphics/pictograms.ts';
import {getCraftMaterialProperties} from '../src/lib/card-graphics/materials.ts';

test('printed pictogram registry covers every record field with unique local geometry',()=>{
 assert.deepEqual(Object.keys(CARD_PICTOGRAMS).sort(),['world','dataCenter','service','race','clan','grandCompany','languages','playStyles','freeCompany'].sort());
 assert.equal(new Set(Object.values(CARD_PICTOGRAMS).map(v=>v.path)).size,9);
 for(const entry of Object.values(CARD_PICTOGRAMS)){assert.ok(entry.purpose);assert.match(entry.path,/^M/);assert.doesNotMatch(entry.path,/https?:|data:|<|>/);}
});

test('craft material roles retain the custom palette rather than imposing sample colors',()=>{
 const palette={primary:'#334455',accent:'#cc4455',light:'#fff5e8',dark:'#1c1918'};
 for(const family of ['cinematic','editorial','id-card']){
  const custom=getCraftMaterialProperties(family,palette,'custom','#a34f5a');
  assert.equal(custom['--craft-paper'],palette.light);assert.equal(custom['--craft-ink'],palette.dark);
  assert.ok(custom['--craft-brass'].includes(palette.accent));assert.ok(custom['--craft-red'].includes(palette.accent));
 }
});

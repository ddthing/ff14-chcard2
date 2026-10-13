import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {CARD_PICTOGRAMS} from '../src/lib/card-graphics/pictograms.ts';
import {getCraftMaterialProperties} from '../src/lib/card-graphics/materials.ts';

const xxdIconSource=readFileSync(new URL('../src/components/icons/vendor/xxd-ui-kit/nodes.js',import.meta.url),'utf8');
const appIconSource=readFileSync(new URL('../src/components/app-icon.tsx',import.meta.url),'utf8');
const xxdIconNames=new Set([...xxdIconSource.matchAll(/^  ([A-Za-z][A-Za-z0-9]*):/gm)].map((match)=>match[1]));

test('printed pictogram registry covers every record field with unique XXD icon mappings',()=>{
 assert.deepEqual(Object.keys(CARD_PICTOGRAMS).sort(),['world','dataCenter','service','race','clan','grandCompany','languages','playStyles','freeCompany'].sort());
 const pictograms=Object.values(CARD_PICTOGRAMS);
 assert.equal(new Set(pictograms.map(v=>v.iconName)).size,9);
 for(const entry of pictograms){assert.ok(entry.purpose);assert.ok(xxdIconNames.has(entry.iconName));}
 assert.match(xxdIconSource, /"stroke-width": 1\.5/);
 assert.match(xxdIconSource, /"stroke-linecap": "round"/);
 assert.match(xxdIconSource, /"stroke-linejoin": "miter"/);
 assert.match(appIconSource, /viewBox="0 0 24 24"/);
 assert.match(appIconSource, /strokeWidth=\{1\.5\}/);
});

test('craft material roles retain the custom palette rather than imposing sample colors',()=>{
 const palette={primary:'#334455',accent:'#cc4455',light:'#fff5e8',dark:'#1c1918'};
 for(const family of ['cinematic','editorial','id-card']){
  const custom=getCraftMaterialProperties(family,palette,'custom','#a34f5a');
  assert.equal(custom['--craft-paper'],palette.light);assert.equal(custom['--craft-ink'],palette.dark);
  assert.ok(custom['--craft-brass'].includes(palette.accent));assert.ok(custom['--craft-red'].includes(palette.accent));
 }
});

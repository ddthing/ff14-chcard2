import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import {readFile} from 'node:fs/promises';
const evidenceTest=evidenceTests(test,'coner-art-direction');

evidenceTest('PNG and WebP 2x evidence shares field geometry and decoded assets',async()=>{
 for(const family of ['cinematic','editorial','id-card']){
  const base=`../docs/qa/coner-art-direction/exports/${family}-en-4x5-2x`;
  const [png,webp]=await Promise.all(['.json','-webp.json'].map(async suffix=>JSON.parse(await readFile(new URL(base+suffix,import.meta.url),'utf8'))));
  assert.deepEqual(png.fields,webp.fields);assert.deepEqual(png.size,webp.size);
  assert.equal(webp.fonts,'loaded');assert.ok(webp.images.every(image=>image.loaded));
  assert.deepEqual(png.glyphs,webp.glyphs);assert.equal(png.credit,webp.credit);
 }
});

evidenceTest('2.7.5 actual master exports keep primary fields, shadow-free type and an unboxed outlined credit',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const ratio of ['1x1','4x5','3x4','9x16','16x9']){
  const data=JSON.parse(await readFile(new URL(`../docs/qa/coner-art-direction/exports/${family}-en-${ratio}-2x.json`,import.meta.url),'utf8'));
  assert.equal(data.character.name,'Coner');assert.equal(data.character.jobId,'red-mage');assert.equal(data.credit,'© SQUARE ENIX');
  assert.equal(data.creditStyle.background,'none');assert.ok(parseFloat(data.creditStyle.stroke)>0);
  assert.ok(data.textStyles.every(style=>style.shadow==='none'));
  assert.equal(data.fonts,'loaded');assert.ok(data.images.every(img=>img.loaded));
  for(const field of data.fields.filter(f=>f.priority==='primary'))assert.equal(field.inside,true,`${family}/${ratio}: ${field.field}`);
  if(family==='id-card')assert.equal(new Set(data.glyphs).size,9);
  if(family!=='editorial')assert.equal(data.frame,family);
 }
});

evidenceTest('multilingual and long-name exports retain their complete visible name and primary fields',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const locale of ['ko','ja','en']){
  const data=JSON.parse(await readFile(new URL(`../docs/qa/coner-art-direction/exports/stress-${family}-${locale}-4x5-2x.json`,import.meta.url),'utf8'));
  const name=data.fields.find(field=>field.field==='name');assert.ok(name);assert.equal(name.inkInside,true,`${family}/${locale}: name ink outside card`);
  for(const field of data.fields.filter(f=>f.priority==='primary')){assert.equal(field.inside,true,`${family}/${locale}: ${field.field}`);assert.equal(field.inkInside,true,`${family}/${locale}: ${field.field} ink`);}
 }
});

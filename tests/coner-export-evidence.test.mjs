import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import {readFile} from 'node:fs/promises';
const evidenceTest=evidenceTests(test,'real-samples');
evidenceTest('real Coner ratio exports keep source screenshots, RDM and the uniform credit',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const ratio of ['1x1','4x5','3x4','9x16','16x9']){
  const data=JSON.parse(await readFile(new URL(`../docs/qa/real-samples/exports/${family}-en-${ratio}-2x.json`,import.meta.url),'utf8'));
  assert.equal(data.character.name,'Coner');assert.equal(data.character.jobId,'red-mage');assert.equal(data.credit,'© SQUARE ENIX');assert.equal(data.fonts,'loaded');
  assert.ok(data.imageUrl.startsWith('/assets/samples/coner/optimized/'));
  assert.deepEqual([data.imageAdjustments.rotation,data.imageAdjustments.brightness,data.imageAdjustments.contrast,data.imageAdjustments.saturation,data.imageAdjustments.exposure],[0,1,1,1,0]);
  for(const image of data.images)assert.equal(image.loaded,true);
  for(const field of data.fields.filter(f=>f.priority==='primary'))assert.equal(field.inside,true,`${family}/${ratio}: ${field.field}`);
 }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import { register } from 'node:module';
import {readFile} from 'node:fs/promises';

register('./ts-alias-loader.mjs', import.meta.url);

const evidenceTest=evidenceTests(test,'precision-craft');
const {getMasterArtProperties} = await import('../src/lib/card-art-tokens.ts');

test('Master hairline tokens specify one output pixel per requested export scale',()=>{
 const palette={primary:'#334455',accent:'#994455',light:'#f5eddf',dark:'#241d19'};
 for(const family of ['cinematic','editorial','id-card'])for(const ratio of ['1:1','4:5','3:4','9:16','16:9']){
  const width=ratio==='16:9'?1920:1080;
  const property=getMasterArtProperties(family,palette,ratio)['--master-rule-weight'];
  const divisor=Number(property.match(/\/\s*(\d+)/)?.[1]);
  for(const scale of [1,2,4])assert.equal(width*scale/divisor,scale);
 }
});

test('Editorial precision geometry has no repeating polygon tear or detached drop cap',async()=>{
 const base=new URL('../src/components/cards/masters/',import.meta.url);
 const [css,tsx]=await Promise.all(['editorial-master.module.css','editorial-master.tsx'].map(file=>readFile(new URL(file,base),'utf8')));
 for(const polygon of css.matchAll(/polygon\(([^)]+)\)/g))assert.ok(polygon[1].split(',').length<=5,'repeating jagged polygon is not an approved boundary');
 assert.doesNotMatch(tsx,/splitFirstGrapheme|EditorialScribble/,'initial sizing and random script must not fragment the title');
});

async function evidence(stem){
 return JSON.parse(await readFile(new URL(`../docs/qa/precision-craft/exports/${stem}.json`,import.meta.url),'utf8'));
}

evidenceTest('captured Master rules paint fractional widths instead of the browser-clamped layout border',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const ratio of ['1x1','4x5','3x4','9x16','16x9']){
  const data=await evidence(`${family}-en-${ratio}-2x`);
  assert.ok(data.rules.length>0,`${family}/${ratio} must capture a real information rule`);
  for(const rule of data.rules){
   assert.match(rule.paintSource,/^linear-gradient/);
   const height=rule.paintSize.split(',')[0].trim().split(/\s+/)[1];
   const width=parseFloat(height)*data.size.width/data.logical.width;
   assert.ok(Math.abs(width-2)<.03,`${family}/${ratio}: ${width}px paint width`);
  }
 }
});

evidenceTest('precision exports retain unshadowed text, decoded assets and non-overlapping main facts',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const ratio of ['1x1','4x5','3x4','9x16','16x9']){
  const data=await evidence(`${family}-en-${ratio}-2x`);
  assert.equal(data.credit,'© SQUARE ENIX');assert.equal(data.creditStyle.background,'none');
  assert.ok(data.textStyles.every(style=>style.shadow==='none'));
  assert.equal(data.fonts,'loaded');assert.ok(data.images.every(image=>image.loaded));
  const fields=data.fields.filter(field=>['primary','secondary'].includes(field.priority)&&field.width>0);
  for(const field of fields){assert.ok(field.inside,`${family}/${ratio}/${field.field} box`);assert.ok(field.inkInside,`${family}/${ratio}/${field.field} ink`);}
  for(let a=0;a<fields.length;a++)for(let b=a+1;b<fields.length;b++){
   const x=fields[a],y=fields[b];
   const width=Math.min(x.x+x.width,y.x+y.width)-Math.max(x.x,y.x);
   const height=Math.min(x.y+x.height,y.y+y.height)-Math.max(x.y,y.y);
   assert.ok(width<=1||height<=1,`${family}/${ratio}/${x.field} overlaps ${y.field}`);
  }
 }
});

evidenceTest('precision name stress captures preserve all primary name ink in KO JA and long Latin',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const locale of ['ko','ja','en']){
  const data=await evidence(`stress-${family}-${locale}-4x5-2x`);
  for(const field of data.fields.filter(field=>field.priority==='primary'))assert.ok(field.inside&&field.inkInside,`${family}/${locale}/${field.field}`);
 }
});

evidenceTest('Japanese Identity keeps the sample clan together rather than orphaning its final kana',async()=>{
 for(const prefix of ['', 'stress-']){
  const data=await evidence(`${prefix}id-card-ja-4x5-2x`);
  const clan=data.fields.find(field=>field.field==='clan');
  assert.equal(clan.text,'デューンフォーク');assert.equal(clan.lineCount,1);
 }
});

evidenceTest('genuinely long CJK names retain primary ink and clear Identity record headings',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const locale of ['ko','ja']){
  const data=await evidence(`long-${family}-${locale}-4x5-2x`);
  assert.ok(Array.from(data.character.name).length>7);
  const facts=data.fields.filter(field=>field.priority==='primary'||(field.priority==='secondary'&&field.width>0));
  for(const field of facts)assert.ok(field.inside&&field.inkInside,`${family}/${locale}/${field.field}`);
  if(family==='id-card')assert.equal(data.recordHeaders.length,4,'full Identity fixture must capture all record headings');
  if(family==='id-card')for(const header of data.recordHeaders)for(const fact of facts){
   const width=Math.min(header.x+header.width,fact.x+fact.width)-Math.max(header.x,fact.x);
   const height=Math.min(header.y+header.height,fact.y+fact.height)-Math.max(header.y,fact.y);
   assert.ok(width<=1||height<=1,`${locale}/${header.text} overlaps ${fact.field}`);
  }
 }
});

evidenceTest('texture-off and PNG/WebP exports preserve the same Master geometry',async()=>{
 for(const family of ['cinematic','editorial','id-card']){
  const normal=await evidence(`${family}-en-4x5-2x`);
  for(const stem of [`plain-${family}-en-4x5-2x`,`${family}-en-4x5-2x-webp`]){
   const variant=await evidence(stem);assert.deepEqual(variant.fields,normal.fields);assert.deepEqual(variant.size,normal.size);
   assert.ok(variant.images.every(image=>image.loaded));assert.equal(variant.fonts,'loaded');
  }
 }
});

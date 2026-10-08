import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {CARD_NAME_ENVELOPES,fitOpticalName} from '../src/lib/card-name-envelope.ts';
import {getEditorialBrushShape} from '../src/lib/card-graphics/editorial-shape.ts';
const evidenceTest=evidenceTests(test,'expressive-precision');

test('optical envelopes have script caps and measured dense glyphs shrink without changing the stored name',()=>{
 const reference={width:220,height:66,ink:3000,lines:1};
 for(const family of ['cinematic','editorial','id-card'])for(const ratio of ['1:1','4:5','3:4','9:16','16:9']){
  const box=CARD_NAME_ENVELOPES[family][ratio];
  assert.ok(box.caps.korean<box.caps.latin);assert.ok(box.caps.japanese<box.caps.latin);
  const sparse=fitOpticalName({family,ratio,script:'japanese',metrics:{width:200,height:80,ink:2000,lines:1},reference,lineHeight:1,availableWidth:box.width});
  const dense=fitOpticalName({family,ratio,script:'japanese',metrics:{width:200,height:94,ink:9000,lines:1},reference,lineHeight:1,availableWidth:box.width});
  assert.ok(dense.size<sparse.size);assert.ok(dense.width<=box.width+.01);assert.ok(dense.height<=box.height+.01);
 }
});

test('Editorial ratios reuse the authored dry-brush silhouette and select a readable card composition',()=>{
 const ids=new Set();
 for(const ratio of ['1:1','4:5','3:4','9:16','16:9']){
  const shape=getEditorialBrushShape(ratio);ids.add(shape.id);
  assert.match(shape.inkOutline,/^\/assets\/card-materials\/v3\/.+\.svg$/);
  assert.ok(['side-panel','stacked'].includes(shape.composition));
 }
 assert.equal(ids.size,5);
 assert.equal(getEditorialBrushShape('9:16').composition,'stacked');
 assert.equal(new Set(['1:1','4:5','3:4','9:16','16:9'].map(ratio=>getEditorialBrushShape(ratio).inkOutline)).size,1);
});

async function evidence(stem){return JSON.parse(await readFile(new URL(`../docs/qa/expressive-precision/exports/${stem}.json`,import.meta.url),'utf8'));}

async function printedName(directory,stem){
 const base=new URL(`../docs/qa/${directory}/exports/${stem}`,import.meta.url);
 const record=JSON.parse(await readFile(new URL(base.href+'.json'),'utf8'));
 const name=record.fields.find(field=>field.field==='name'),scale=record.size.width/record.logical.width;
 const crop={left:Math.floor(name.x*scale),top:Math.floor(name.y*scale),width:Math.ceil(name.width*scale),height:Math.ceil(name.height*scale)};
 const {data,info}=await sharp(await readFile(new URL(base.href+'.png'))).extract(crop).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let first=crop.height,last=-1,ink=0;
 for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){
  const at=(y*crop.width+x)*info.channels;
  if((data[at]+data[at+1]+data[at+2])/3<110){ink++;first=Math.min(first,y);last=Math.max(last,y);}
 }
 return {height:last-first+1,ink};
}

evidenceTest('actual PNG Korean name loses excess height/ink and matches Latin visual weight',async()=>{
 const [before,korean,latin]=await Promise.all([
  printedName('precision-craft','stress-id-card-ko-4x5-2x'),
  printedName('expressive-precision','id-card-ko-4x5-2x'),
  printedName('expressive-precision','id-card-latin-4x5-2x'),
 ]);
 assert.ok(korean.height<before.height*.9);
 assert.ok(korean.ink<before.ink*.7);
 assert.ok(Math.abs(korean.ink/latin.ink-1)<.1);
});

evidenceTest('45 family/script/ratio exports settle actual font measurements and retain primary ink',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const script of ['latin','ko','ja'])for(const ratio of ['1x1','4x5','3x4','9x16','16x9']){
  const data=await evidence(`${family}-${script}-${ratio}-2x`);
  assert.equal(data.optical.opticalReady,'true');assert.equal(data.fonts,'loaded');assert.ok(data.images.every(image=>image.loaded));
  assert.equal(data.assetOpticalSnapshots[0].ready,'true');assert.equal(data.assetOpticalSnapshots[0].size,data.optical.opticalSize);
  for(const field of data.fields.filter(field=>field.priority==='primary'))assert.ok(field.inside&&field.inkInside,`${family}/${script}/${ratio}/${field.field}`);
  assert.ok(data.shadows.every(style=>style.shadow==='none'));assert.equal(data.credit,'© SQUARE ENIX');
  const box=CARD_NAME_ENVELOPES[family][data.ratio];
  assert.ok(Number(data.optical.opticalWidth)<=box.width+.03);assert.ok(Number(data.optical.opticalHeight)<=box.height+.03);
 }
});

evidenceTest('Korean Identity loses the oversized block and dense Kanji differs from light Kana',async()=>{
 for(const ratio of ['4x5','3x4']){
  const [latin,ko]=await Promise.all(['latin','ko'].map(script=>evidence(`id-card-${script}-${ratio}-2x`)));
  assert.ok(Number(ko.optical.opticalSize)<Number(latin.optical.opticalSize)*.84);
  assert.ok(Number(ko.optical.weight)<760);
  assert.ok(Number(ko.optical.opticalInk)<=Number(latin.optical.opticalReferenceInk)*1.02);
 }
 const [kana,kanji]=await Promise.all(['ja','kanji'].map(script=>evidence(`id-card-${script}-4x5-2x`)));
 assert.ok(Number(kanji.optical.opticalSize)<Number(kana.optical.opticalSize));
});

evidenceTest('long-name primary facts and Identity group headers stay separated',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const script of ['stress-ko','stress-ja','stress-latin']){
  const data=await evidence(`${family}-${script}-4x5-2x`);
  const facts=data.fields.filter(field=>field.priority==='primary');
  for(const field of facts)assert.ok(field.inside&&field.inkInside,`${family}/${script}/${field.field}`);
  if(family==='id-card'){
   assert.equal(data.headers.length,4);
   for(const header of data.headers)for(const fact of facts){
    const w=Math.min(header.x+header.width,fact.x+fact.width)-Math.max(header.x,fact.x);
    const h=Math.min(header.y+header.height,fact.y+fact.height)-Math.max(header.y,fact.y);
    assert.ok(w<=1||h<=1,`${script}/${header.text} overlaps ${fact.field}`);
   }
  }
 }
});

evidenceTest('PNG and WebP retain measured name size, silhouette and field geometry',async()=>{
 for(const family of ['cinematic','editorial','id-card']){
  const [png,webp]=await Promise.all(['','-webp'].map(suffix=>evidence(`${family}-latin-4x5-2x${suffix}`)));
  assert.deepEqual(png.fields,webp.fields);assert.deepEqual(png.shapes,webp.shapes);assert.deepEqual(png.optical,webp.optical);
 }
});

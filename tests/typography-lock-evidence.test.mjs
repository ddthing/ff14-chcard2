import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {CARD_NAME_ENVELOPES} from '../src/lib/card-name-envelope.ts';

const folder=new URL('../docs/qa/typography-lock/',import.meta.url);
const evidenceTest=evidenceTests(test,'typography-lock');
async function evidence(stem){return JSON.parse(await readFile(new URL(`exports/${stem}.json`,folder),'utf8'));}

evidenceTest('typography lock captures 45 base cases and 90 all-ratio stress cases through production export',async()=>{
 const report=JSON.parse(await readFile(new URL('verification.json',folder),'utf8'));
 assert.equal(report.baseCases,45);assert.equal(report.stressCases,90);assert.equal(report.verifiedMatrix,135);assert.deepEqual(report.failures,[]);
 assert.equal(report.verifiedPresets,45);assert.ok(report.presetRecords.every(record=>record.optical.font.startsWith('"Cormorant Garamond Variable"')&&record.issues.length===0));
 for(const record of report.records){
  const data=await evidence(record.stem),box=CARD_NAME_ENVELOPES[data.family][data.ratio];
  assert.equal(data.fonts,'loaded');assert.ok(data.images.every(image=>image.loaded));
  assert.equal(data.assetOpticalSnapshots[0].ready,'true');assert.equal(data.assetOpticalSnapshots[0].size,data.optical.opticalSize);
  assert.ok(Number(data.optical.opticalWidth)<=box.width+.03);assert.ok(Number(data.optical.opticalHeight)<=box.height+.03);
  for(const field of data.fields.filter(field=>field.priority==='primary'))assert.ok(field.inside&&field.inkInside,`${record.stem}/${field.field}`);
 }
});

evidenceTest('KO and JA names use loaded display serif faces even in the condensed Identity preset',async()=>{
 for(const family of ['cinematic','editorial','id-card'])for(const script of ['ko','ja'])for(const ratio of ['1x1','4x5','3x4','9x16','16x9']){
  const data=await evidence(`${family}-${script}-${ratio}-2x`),face=script==='ko'?'Noto Serif KR Variable':'Noto Serif JP Variable';
  assert.match(data.optical.font,/Cormorant Garamond Variable/);assert.ok(data.optical.font.includes(face));
  assert.ok(data.loadedFaces.some(font=>font.family.replaceAll('"','')===face));
  const job=data.roleStyles.filter(style=>style.text===data.fields.find(field=>field.field==='job')?.text);
  assert.ok(job.every(style=>parseFloat(style.size)<parseFloat(data.optical.fontSize)),`${family}/${script}/${ratio}: name hierarchy`);
 }
});

evidenceTest('script comparison changes locale only, and PNG/WebP keep identical measured typography',async()=>{
 for(const family of ['cinematic','editorial','id-card']){
  const latin=await evidence(`${family}-latin-4x5-2x`);
  for(const script of ['locale-ko','locale-ja']){
   const data=await evidence(`${family}-${script}-4x5-2x`);
   assert.deepEqual(data.character,latin.character);assert.equal(data.imageUrl,latin.imageUrl);assert.deepEqual(data.imageAdjustments,latin.imageAdjustments);
   assert.equal(data.optical.opticalSize,latin.optical.opticalSize);
  }
  const webp=await evidence(`${family}-latin-4x5-2x-webp`);
  for(const key of ['fields','optical','shapes','frame','pictograms'])assert.deepEqual(webp[key],latin[key]);
 }
});

evidenceTest('required six 2x exports and seven comparison boards exist as decodable images',async()=>{
 const parity=JSON.parse(await readFile(new URL('preview-parity.json',folder),'utf8'));
 assert.equal(parity.records.length,6);assert.deepEqual(parity.failures,[]);
 assert.ok(parity.records.every(record=>record.geometryMatches&&record.typographyMatches&&record.fontsLoaded&&record.meanAbsoluteRgbDifference<=8));
 const stems=['cinematic-ko-4x5','cinematic-ja-16x9','editorial-ko-4x5','editorial-ja-9x16','id-card-ko-3x4','id-card-latin-4x5'];
 for(const stem of stems){const data=await evidence(`${stem}-2x`),metadata=await sharp(await readFile(new URL(`exports/${stem}-2x.png`,folder))).metadata();assert.equal(metadata.width,data.size.width);assert.equal(metadata.height,data.size.height);assert.equal(data.size.scale,2);}
 for(const file of ['01-cinematic-ko-en-ja.png','02-editorial-ko-en-ja.png','03-identity-ko-en-ja.png','04-short-long-names.png','05-mixed-script.png','06-ratio-matrix.png','07-final-master-triptych.png']){const metadata=await sharp(await readFile(new URL(file,folder))).metadata();assert.ok(metadata.width>900&&metadata.height>600);}
});

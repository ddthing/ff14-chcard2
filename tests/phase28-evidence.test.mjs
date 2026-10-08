import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';

const out=new URL('../docs/qa/phase28/',import.meta.url);
const load=async file=>JSON.parse(await readFile(new URL(file,out),'utf8'));
const evidenceTest=evidenceTests(test,'phase28');
evidenceTest('actual browser stability lab and IME handlers finish without failed checks',async()=>{
 const [report,ime,mobile]=await Promise.all(['qa-lab-results.json','ime-results.json','mobile-flow.json'].map(load));
 assert.equal(report.results.filter(item=>item.status==='fail').length,0);
 assert.equal(report.results.filter(item=>item.status==='pass').length,65);
 assert.equal(ime.checks.length,5);assert.ok(ime.checks.every(item=>item.pass));assert.equal(ime.restored,true);
 assert.equal(mobile.documentWidth,390);assert.equal(mobile.inputVisible,true);assert.equal(mobile.focusTrapped28Tabs,true);
});
evidenceTest('all nine representative Master exports retain frozen pixels and immutable art sources',async()=>{
 const report=await load('verification.json');
 assert.deepEqual(report.failures,[]);assert.equal(report.comparisons.length,9);
 assert.ok(report.comparisons.every(item=>item.width===2160&&item.height===2700&&item.meanAbsoluteChannelDifference<=.001));
 assert.ok(report.protectedRecords.every(item=>item.unchanged));
});
evidenceTest('rapid repeat artifacts decode correctly within the unchanged export memory cap',async()=>{
 const report=await load('verification.json');
 assert.equal(report.repeats.length,5);
 for(const item of report.repeats){const m=await sharp(await readFile(new URL(item.file,out))).metadata();assert.equal(m.width,item.width);assert.equal(m.height,item.height);assert.ok(item.pixels<=22_000_000);}
 const first=await readFile(new URL('qa-lab-repeat-png-2x-first.png',out)),second=await readFile(new URL('qa-lab-repeat-png-2x-second.png',out));assert.deepEqual(first,second);
 const replacement=await load('upload-replace.json');assert.equal(replacement.afterUndo,'✓C.png');assert.equal(replacement.afterRedo,'✓A.png');
});

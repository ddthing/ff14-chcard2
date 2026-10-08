import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/phase28');
const lab=JSON.parse(await fs.readFile(path.join(out,'qa-lab-results.json'),'utf8'));
const failures=lab.results.filter(item=>item.status==='fail').map(item=>`${item.id}: ${item.detail}`);
const comparisons=[];
for(const family of ['cinematic','editorial','id-card'])for(const locale of ['latin','ko','ja']){
 const stem=`${family}-${locale}-4x5-2x`,current=path.join(out,`qa-lab-${stem}.png`),before=path.join(root,'docs/qa/typography-lock/exports',stem+'.png');
 const a=await sharp(before).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const b=await sharp(current).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(a.info.width!==b.info.width||a.info.height!==b.info.height){failures.push(`${stem}: dimensions`);continue;}
 let sum=0,changed=0;for(let i=0;i<a.data.length;i++){const d=Math.abs(a.data[i]-b.data[i]);sum+=d;if(d)changed++;}
 const record={stem,width:b.info.width,height:b.info.height,identicalPixels:a.data.equals(b.data),meanAbsoluteChannelDifference:Number((sum/a.data.length).toFixed(5)),changedChannelFraction:Number((changed/a.data.length).toFixed(5))};
 comparisons.push(record);
 // Same renderer/art contract; allow only tiny antialiasing noise across browser sessions.
 if(record.meanAbsoluteChannelDifference>1)failures.push(`${stem}: freeze raster mismatch ${record.meanAbsoluteChannelDifference}`);
}
const protectedBefore=JSON.parse(await fs.readFile(path.join(root,'docs/qa/typography-lock/protected-files.json'),'utf8'));
const protectedRecords=[];
for(const entry of protectedBefore){
 const file=entry.file.replaceAll('\\','/');
 if(!/^src\/(data\/(fonts\/registry|ffxiv\/|samples\/)|lib\/(card-name|card-art|card-graphics\/|job-motif)|components\/cards\/craft\/)/.test(file))continue;
 const digest=createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
 protectedRecords.push({file,unchanged:digest===entry.sha256});if(digest!==entry.sha256)failures.push(`Frozen source changed: ${file}`);
}
const repeats=[];
for(const file of ['qa-lab-repeat-png-2x-first.png','qa-lab-repeat-png-2x-second.png','qa-lab-repeat-webp-2x.webp','qa-lab-repeat-png-4x.png','qa-lab-repeat-png-1x.png']){
 const meta=await sharp(path.join(out,file)).metadata();
 repeats.push({file,width:meta.width,height:meta.height,pixels:meta.width*meta.height,format:meta.format});
 if(meta.width*meta.height>22_000_000||Math.max(meta.width,meta.height)>8192)failures.push(`${file}: export cap`);
}
const ime=JSON.parse(await fs.readFile(path.join(out,'ime-results.json'),'utf8'));
if(!ime.restored||ime.checks.some(check=>!check.pass)||ime.checks.length!==5)failures.push('IME checks/restoration');
const mobile=JSON.parse(await fs.readFile(path.join(out,'mobile-flow.json'),'utf8'));
if(!mobile.inputVisible||!mobile.focusTrapped28Tabs||mobile.documentWidth!==390)failures.push('Mobile focus/viewport');
const replace=JSON.parse(await fs.readFile(path.join(out,'upload-replace.json'),'utf8'));
if(replace.afterUndo!=='✓C.png'||replace.afterRedo!=='✓A.png'||replace.replaceProof.some(row=>row.accent!=='#336699'))failures.push('Upload replace/history/custom palette');
const report={phase:'2.8',visualVersion:lab.visualVersion,labPassed:lab.results.filter(x=>x.status==='pass').length,labInfo:lab.results.filter(x=>x.status==='info').length,imeChecks:ime.checks.length,comparisons,repeats,protectedRecords,failures};
await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({labPassed:report.labPassed,comparisons,failures},null,2));if(failures.length)process.exitCode=1;

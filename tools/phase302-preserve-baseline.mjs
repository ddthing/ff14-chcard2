import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const stage=process.argv.includes('--after')?'after':'before';
const outputDir=path.join(root,'docs/qa/phase302-jobmark-correction');
const files=[];
async function walk(relative){
  for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
    const child=path.posix.join(relative,entry.name);
    if(entry.isDirectory())await walk(child);
    else if(entry.isFile())files.push(child);
  }
}
await walk('docs/qa/phase301-card-type-job');
files.push('docs/design/font-candidates.md');
for(const entry of await readdir(path.join(root,'tools'))){if(/^phase301.*\.mjs$/.test(entry))files.push('tools/'+entry);}
const records=[];
for(const file of files.sort()){
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(path.join(root,file))){hash.update(chunk);bytes+=chunk.length;}
  records.push({path:file,bytes,sha256:hash.digest('hex')});
}
const snapshot={stage,recordedAt:new Date().toISOString(),fileCount:records.length,totalBytes:records.reduce((n,x)=>n+x.bytes,0),files:records};
const beforePath=path.join(outputDir,'phase301-baseline-before.json');
if(stage==='before'){
  await writeFile(beforePath,JSON.stringify(snapshot,null,2),{flag:'wx'});
}else{
  const before=JSON.parse(await readFile(beforePath,'utf8'));
  const old=new Map(before.files.map(x=>[x.path,x.sha256]));
  const now=new Map(records.map(x=>[x.path,x.sha256]));
  const added=[...now.keys()].filter(x=>!old.has(x));
  const removed=[...old.keys()].filter(x=>!now.has(x));
  const changed=[...now.keys()].filter(x=>old.has(x)&&old.get(x)!==now.get(x));
  snapshot.comparison={exactMatch:!added.length&&!removed.length&&!changed.length,added,removed,changed};
  await writeFile(path.join(outputDir,'phase301-baseline-after.json'),JSON.stringify(snapshot,null,2));
  if(!snapshot.comparison.exactMatch)process.exitCode=1;
}
console.log(JSON.stringify({stage,fileCount:snapshot.fileCount,totalBytes:snapshot.totalBytes,comparison:snapshot.comparison}));

import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/phase29');
const mode=process.argv[2]??'before';
if(!['before','after'].includes(mode))throw new Error('Use before or after');
const read=async file=>JSON.parse(await fs.readFile(path.join(out,file),'utf8'));
const runs=[];
for(const width of [1440,1920,390]){
 const file=`raw/${mode}-${width}-canonical.json`,run=await read(file);
 if(width===390){
  try{
   const supplement=await read(`raw/${mode}-390-template-supplement.json`);
   run.userActionSequences=[...run.userActionSequences.filter(a=>a.id!=='10-template-switches'),...supplement.userActionSequences];
   run.scenarioProfiles=[...run.scenarioProfiles.filter(a=>a.id!=='10-template-switches'),...supplement.scenarioProfiles];
   run.supplement={file:`raw/${mode}-390-template-supplement.json`,reason:'Mobile selection closes the sheet; the corrected driver reopens it for every selection.'};
  }catch(error){if(mode==='before')throw error;}
 }
 runs.push({rawSource:file,...run});
}
const report={schemaVersion:2,phase:'2.9',mode,assembledAt:new Date().toISOString(),environment:await read('environment.json'),initial:await read(`initial-${mode}.json`),runs,
 notes:['Opt-in production React profiling, not development mode. Same browser/hardware/origin, matched source workloads.','1440 export has 3 primary repetitions; 1920/390 have one primary repetition per format/scale; diagnostic debug runs are separate.','RAF frequency is not a GPU presentation counter. JS heap samples are lower bounds and exclude native/GPU memory.','Exact full JS execution time and paint/composite trace unavailable. LoAF script attribution is partial.','Resource log is bounded at 6000 entries; late-export sums are partial if that cap is reached. Initial direct Editor traces are separately preserved.']};
for(const run of runs){if(run.environment.viewport.width!==Number(run.rawSource.match(/-(\d+)-/)[1]))throw new Error('Viewport mismatch');if(run.userActionSequences.some(a=>a.failed))throw new Error('Failed canonical action');}
await fs.writeFile(path.join(out,mode==='before'?'01-baseline.json':'02-optimized.json'),JSON.stringify(report,null,2));
console.log(`Assembled ${mode}: ${runs.length} viewports, ${runs.reduce((n,r)=>n+r.exports.length,0)} exports, no failed canonical actions.`);

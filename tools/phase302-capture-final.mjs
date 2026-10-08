import { spawn } from 'node:child_process';
const stages=[['job-matrix','job-matrix'],['family-strength','strength'],['fankit-size-sweep','size-sweep'],['e2-placement','placement'],['retained-name-alternatives','name-alternatives']];
for(const [plan,result] of stages){
  console.log(`Capturing ${result}`);
  const exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['tools/phase302-qa-run.mjs',`--cases=docs/qa/phase302-jobmark-correction/qa-cases-${plan}.json`,`--output=${result}-results.json`,'--debug-port=9328','--base-url=http://127.0.0.1:3332'],{stdio:'inherit',windowsHide:true});
    child.once('error',reject);child.once('exit',resolve);
  });
  if(exitCode!==0)throw new Error(`${result} failed (${exitCode}); remaining captures stopped.`);
}

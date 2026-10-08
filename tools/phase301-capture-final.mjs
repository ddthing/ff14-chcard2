import { spawn } from 'node:child_process';

const stages = [
  ['p0','p0'], ['stage1','stage1'], ['stage2-jobmarks','stage2'],
  ['icon-sources','icon-source'], ['metadata-comparison','metadata-comparison'],
  ['metadata-zh','metadata-zh'], ['combined-shortlist','combined'], ['export-probes','export-probes'],
];
const selected = process.argv.includes('--remaining') ? stages.slice(2) : stages;
for (const [plan, output] of selected) {
  console.log(`Capturing ${output}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'tools/phase301-qa-run.mjs',
      `--cases=docs/qa/phase301-card-type-job/qa-cases-${plan}.json`,
      `--output=${output}-results.json`, '--debug-port=9327', '--base-url=http://127.0.0.1:3330',
    ], { stdio:'inherit', windowsHide:true });
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) throw new Error(`${output} capture failed (${code}); remaining stages were not run.`);
}

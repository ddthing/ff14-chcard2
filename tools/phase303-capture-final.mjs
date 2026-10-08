import { spawn } from 'node:child_process';
for (const stage of ['ratios', 'locales', 'longnames']) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/phase303-qa-run.mjs', `--manifest=qa-cases-${stage}.json`, '--port=9329', '--base-url=http://127.0.0.1:3334'], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', resolve);
  });
  if (code) throw new Error(`Phase303 ${stage} failed (${code})`);
}

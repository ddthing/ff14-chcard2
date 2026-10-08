import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsRoot = path.join(root, 'tests');
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(file);
  }
}

await collect(testsRoot);
files.sort();
if (!files.length) throw new Error('No tests/*.test.mjs files were found.');

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    '--experimental-strip-types',
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--test',
    ...files,
  ], { cwd: root, stdio: 'inherit', windowsHide: true });
  child.once('error', reject);
  child.once('exit', resolve);
});
if (exitCode !== 0) process.exitCode = exitCode ?? 1;

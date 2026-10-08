import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(await readFile(path.join(root, 'docs/qa/phase217/before-source-freeze.json'), 'utf8'));
const expected = inventory.sourceFiles.find(row => row.path === 'src/app/app-theme.css');
let source = await readFile(path.join(root, 'src/app/app-theme.css'), 'utf8');
for (const [current, original] of [
  ['#e5e7e6', '#e9e6e0'], ['#f1f3f2', '#f7f6f3'], ['#fbfcfa', '#fffdf9'],
  ['#cdd3d4', '#d8d8d4'], ['#fafbf9', '#f8f6f2'], ['#e7eceb', '#eeebe6'],
  ['#c0c7c7', '#cbc9c3'], ['#7c8689', '#878681'], ['#222a2d', '#202526'],
  ['#e4ecef', '#e7edf1'],
]) source = source.replaceAll(current, original);
source = source.replace('--app-text-muted: #586266;', '--app-text-muted: #59605f;')
  .replace('--app-text-subtle: #586266;', '--app-text-subtle: #585f5e;');
const variants = [source, source.replace(/\r?\n/g, '\r\n'), source.replace(/\r\n/g, '\n')];
const original = variants.find(value => createHash('sha256').update(value).digest('hex') === expected.sha256);
if (!original) throw new Error('Reconstructed theme does not match the original source SHA-256; no file was written.');
const destination = path.join(root, 'docs/qa/phase217/original-ui/src/app/app-theme.css');
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, original);
console.log(JSON.stringify({ path: 'src/app/app-theme.css', sha256: expected.sha256, verifiedOriginalBytes: Buffer.byteLength(original) }));

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/phase29');
const before = JSON.parse(await fs.readFile(path.join(out, 'uninstrumented-source.json'), 'utf8'));
const changed = [];
for (const entry of before.files) {
  const data = await fs.readFile(path.join(root, entry.file));
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  if (hash !== entry.sha256) changed.push(entry.file);
}
const cssChanged = changed.filter(file => /\.css$/i.test(file));
const frozenDataChanged = changed.filter(file => /src[\\/]data[\\/]|typography-presets|master-card-config|src[\\/]lib[\\/]types\.ts/.test(file)
  && !/src[\\/]data[\\/]fonts[\\/]load-fonts\.ts$/.test(file));
const report = { generatedAt: new Date().toISOString(), changed, cssChanged, frozenDataChanged, note: 'Compared all original source files with the preserved pre-optimization SHA-256 inventory; pixel parity and upload-byte parity are separate browser evidence.' };
await fs.writeFile(path.join(out, 'source-freeze-check.json'), JSON.stringify(report, null, 2));
console.log(report);
if (cssChanged.length || frozenDataChanged.length) process.exitCode = 1;

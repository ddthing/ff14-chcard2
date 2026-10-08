import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'docs/qa/phase217');
const files = ['src/app/app-theme.css', 'src/components/app-shell.module.css', 'src/app/editor/editor.module.css', 'src/components/editor/toolbar-tooltip.module.css', 'src/app/templates/templates.module.css', 'src/app/export/export.module.css'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const recordPath = path.join(qa, 'baseline-rebuild-manifest.json');
const restoring = process.argv.includes('--restore');
if (restoring) {
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  for (const row of record.files) if (digest(await readFile(path.join(root, row.path))) !== row.originalSha256) throw new Error(`CSS changed during baseline build: ${row.path}`);
  if (digest(await readFile(path.join(root, 'next.config.ts'))) !== record.instrumentedConfigSha256) throw new Error('Next config changed during baseline build; refusing overwrite.');
  for (const row of record.files) await copyFile(path.join(qa, 'candidate-ui', row.path), path.join(root, row.path));
  await copyFile(path.join(qa, 'candidate-ui/next.config.ts'), path.join(root, 'next.config.ts'));
  await copyFile(path.join(qa, 'candidate-ui/next-env.d.ts'), path.join(root, 'next-env.d.ts'));
  for (const row of record.files) if (digest(await readFile(path.join(root, row.path))) !== row.candidateSha256) throw new Error(`Candidate restore failed: ${row.path}`);
  console.log('Restored all six candidate CSS sources and exact Next config/env; baseline server must already be started at port3017.');
} else {
  const inventory = JSON.parse(await readFile(path.join(qa, 'before-source-freeze.json'), 'utf8'));
  const rows = [];
  for (const relative of files) {
    const original = await readFile(path.join(qa, 'original-ui', relative));
    const expected = inventory.sourceFiles.find(row => row.path === relative);
    if (!expected || digest(original) !== expected.sha256) throw new Error(`Unverified original UI CSS: ${relative}`);
    rows.push({ path: relative, originalSha256: digest(original), candidateSha256: digest(await readFile(path.join(root, relative))) });
  }
  const config = await readFile(path.join(root, 'next.config.ts'));
  const instrumentedConfig = config.toString('utf8').replace('poweredByHeader: false,', "poweredByHeader: false,\n  distDir: process.env.PHASE217_BASELINE_DIR ?? '.next',");
  if (instrumentedConfig === config.toString('utf8')) throw new Error('Unexpected Next config; no source was changed.');
  for (const relative of [...files, 'next.config.ts', 'next-env.d.ts']) {
    const backup = path.join(qa, 'candidate-ui', relative);
    await mkdir(path.dirname(backup), { recursive: true });
    await copyFile(path.join(root, relative), backup);
  }
  await writeFile(recordPath, `${JSON.stringify({ protocol: 'Original six UI styles verified against pre-polish SHA-256; temporary isolated build .next/phase217-before for deterministic optical-ready before screenshots. Candidate server3016 remains immutable. Restore guarded by exact source hashes.', files: rows, originalConfigSha256: digest(config), instrumentedConfigSha256: digest(instrumentedConfig) }, null, 2)}\n`);
  for (const relative of files) await copyFile(path.join(qa, 'original-ui', relative), path.join(root, relative));
  await writeFile(path.join(root, 'next.config.ts'), instrumentedConfig);
  console.log('Prepared verified original UI CSS for isolated baseline rebuild. Set PHASE217_BASELINE_DIR=.next/phase217-before; start3017 before --restore.');
}

import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = [
  ['docs/qa/phase28/qa-lab-page.tsx.txt', 'src/app/qa-phase28-lab/page.tsx'],
  ['docs/qa/phase28/qa-lab-client.tsx.txt', 'src/app/qa-phase28-lab/lab-client.tsx'],
  ['docs/qa/phase28/qa-lab-collector.ts.txt', 'src/app/qa-phase28-lab/collect/route.ts'],
];

if (process.argv.includes('--remove')) {
  for (const [, targetPath] of artifacts) {
    await rm(resolve(root, targetPath), { force: true });
  }
  console.log('Removed the temporary Phase 2.8 lab routes. Archived source templates remain in docs/qa/phase28/.');
} else {
  for (const [templatePath, targetPath] of artifacts) {
    const source = await readFile(resolve(root, templatePath), 'utf8');
    const target = resolve(root, targetPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source, 'utf8');
  }
  console.log('Installed the local-only Phase 2.8 lab at /qa-phase28-lab. Start Next in development mode on port 3002.');
}

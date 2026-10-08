import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = [
  ['docs/qa/phase28/qa-ime-page.tsx.txt', 'src/app/qa-phase28-ime/page.tsx'],
  ['docs/qa/phase28/qa-ime-lab.tsx.txt', 'src/app/qa-phase28-ime/phase28-ime-lab.tsx'],
];

if (process.argv.includes('--remove')) {
  for (const [, targetPath] of artifacts) {
    await rm(resolve(root, targetPath), { force: true });
  }
  console.log('Removed the temporary IME QA route. Archived source and QA evidence remain in docs/qa/phase28/.');
} else {
  for (const [templatePath, targetPath] of artifacts) {
    const source = await readFile(resolve(root, templatePath), 'utf8');
    const target = resolve(root, targetPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source, 'utf8');
  }
  console.log('Installed the development-only IME QA route at /qa-phase28-ime.');
}

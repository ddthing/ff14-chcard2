import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = [
  ['docs/qa/phase29/visual/qa-visual-page.tsx.txt', 'src/app/qa-phase29-visual/page.tsx'],
  ['docs/qa/phase29/visual/qa-visual-client.tsx.txt', 'src/app/qa-phase29-visual/lab-client.tsx'],
  ['docs/qa/phase29/visual/qa-visual-collector.ts.txt', 'src/app/qa-phase29-visual/collect/route.ts'],
];

if (process.argv.includes('--remove')) {
  for (const [, targetPath] of artifacts) {
    await rm(resolve(root, targetPath), { force: true });
  }
  console.log('Removed only the fixed Phase 2.9 visual lab files. Archived templates and captured evidence remain.');
} else {
  const sources = await Promise.all(artifacts.map(([templatePath]) => readFile(resolve(root, templatePath), 'utf8')));
  const targets = artifacts.map(([, targetPath]) => resolve(root, targetPath));
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    try {
      await access(target);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Refusing to overwrite existing lab file: ${artifacts[index][1]}. Run --remove first if it belongs to this generator.`);
  }

  const createdTargets = [];
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, sources[index], { encoding: 'utf8', flag: 'wx' });
      createdTargets.push(target);
    }
  } catch (error) {
    await Promise.all(createdTargets.map((target) => rm(target, { force: true })));
    throw error;
  }
  console.log('Prepared the local-only Phase 2.9 visual lab at /qa-phase29-visual. Do not install it until the profiling build is ready.');
}

import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/phase292/visual');
const names = ['page.tsx', 'lab-client.tsx', 'collect/route.ts'];
const templates = ['qa-visual-page.tsx.txt', 'qa-visual-client.tsx.txt', 'qa-visual-collector.ts.txt'];
await fs.mkdir(out, { recursive: true });
for (let i = 0; i < names.length; i++) {
  const target = path.join(root, 'src/app/qa-phase292-visual', names[i]);
  if (process.argv.includes('--remove')) await fs.rm(target, { force: true });
  else {
    const content = (await fs.readFile(path.join(root, 'docs/qa/phase29/visual', templates[i]), 'utf8'))
      .replaceAll('phase29', 'phase292').replaceAll('PHASE29', 'PHASE292').replaceAll('Phase 2.9', 'Phase 2.9.2');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { flag: 'wx' });
    await fs.writeFile(path.join(out, templates[i]), content);
  }
}
console.log(process.argv.includes('--remove') ? 'Removed fixed Phase 2.9.2 visual QA route files.' : 'Prepared Phase 2.9.2 visual QA lab.');

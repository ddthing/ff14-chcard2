import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/phase210');
const files = [
 ['docs/qa/phase292/qa-profiler-page.tsx.txt', 'src/app/qa-phase210/page.tsx'],
 ['docs/qa/phase292/qa-profiler-client.tsx.txt', 'src/app/qa-phase210/profiler-client.tsx'],
 ['docs/qa/phase292/qa-profiler-collector.ts.txt', 'src/app/qa-phase210/collect/route.ts'],
 ['docs/qa/phase292/motion-emulation.ts.txt', 'src/app/qa-phase210/motion-emulation.ts'],
 ['docs/qa/phase292/visual/qa-visual-page.tsx.txt', 'src/app/qa-phase210-visual/page.tsx'],
 ['docs/qa/phase292/visual/qa-visual-client.tsx.txt', 'src/app/qa-phase210-visual/lab-client.tsx'],
 ['docs/qa/phase292/visual/qa-visual-collector.ts.txt', 'src/app/qa-phase210-visual/collect/route.ts'],
 ['docs/qa/phase210/qa-source/src__app__qa-phase210__compatibility-probe.tsx.txt', 'src/app/qa-phase210/compatibility-probe.tsx'],
];
await fs.mkdir(path.join(out, 'visual'), { recursive: true });
if (process.argv.includes('--remove')) {
  for (const [, target] of files) await fs.rm(path.join(root, target), { force: true });
  await fs.rm(path.join(root, 'src/app/qa-phase210/compatibility-probe.tsx'), { force: true });
  await fs.writeFile(path.join(root, 'next.config.ts'), await fs.readFile(path.join(out, 'next-config-original.txt'), 'utf8'));
  await fs.writeFile(path.join(root, 'tsconfig.json'), await fs.readFile(path.join(out, 'tsconfig-original.txt'), 'utf8'));
  console.log('Removed fixed compatibility QA sources and restored build configuration.');
} else {
  for (const [source, target] of files) {
    const archive = path.join(out, 'qa-source', target.replaceAll('/', '__') + '.txt');
    let content;
    try { content = await fs.readFile(archive, 'utf8'); }
    catch { content = (await fs.readFile(path.join(root, source), 'utf8')).replaceAll('phase292', 'phase210').replaceAll('Phase292', 'Phase210').replaceAll('Phase 2.9.2', 'Phase 2.10'); }
    if (target.endsWith('profiler-client.tsx') && !content.includes("from './compatibility-probe'")) content = content.replace("import { emulateReducedMotion", "import { CompatibilityProbe } from './compatibility-probe';\nimport { emulateReducedMotion").replace('      <div ref={workspaceRef}', '      <CompatibilityProbe />\n      <div ref={workspaceRef}');
    const dest = path.join(root, target);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, { flag: 'wx' });
    await fs.mkdir(path.dirname(archive), {recursive:true});
    await fs.writeFile(archive, content);
  }
  const config = await fs.readFile(path.join(root, 'next.config.ts'), 'utf8');
  await fs.writeFile(path.join(out, 'next-config-original.txt'), config);
  await fs.writeFile(path.join(out, 'tsconfig-original.txt'), await fs.readFile(path.join(root, 'tsconfig.json'), 'utf8'));
  await fs.writeFile(path.join(root, 'next.config.ts'), config.replace('  poweredByHeader: false,', "  poweredByHeader: false,\n  distDir: process.env.FF14_PHASE210_QA === '1' ? '.next-phase210' : '.next',"));
  console.log('Prepared isolated .next-phase210 QA build sources.');
}

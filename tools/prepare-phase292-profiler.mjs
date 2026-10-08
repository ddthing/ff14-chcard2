import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/phase292');
const targets = ['src/app/qa-phase292/page.tsx', 'src/app/qa-phase292/profiler-client.tsx', 'src/app/qa-phase292/collect/route.ts', 'src/app/qa-phase292/motion-emulation.ts'];
await fs.mkdir(out, { recursive: true });
if (process.argv.includes('--remove')) {
  for (const target of targets) await fs.rm(path.join(root, target), { force: true });
  const original = await fs.readFile(path.join(out, 'next-config-original.txt'), 'utf8');
  const current = await fs.readFile(path.join(root, 'next.config.ts'), 'utf8');
  if (current !== original.replace('  poweredByHeader: false,', "  poweredByHeader: false,\n  distDir: process.env.FF14_PHASE292_PROFILE === '1' ? '.next-phase292' : '.next',")) throw new Error('Next config changed; refusing to overwrite.');
  await fs.writeFile(path.join(root, 'next.config.ts'), original);
  await fs.writeFile(path.join(root, 'tsconfig.json'), await fs.readFile(path.join(out, 'tsconfig-original.txt'), 'utf8'));
  console.log('Removed only Phase 2.9.2 profiling routes and restored the saved build configuration.');
} else {
  const archivedNames = ['qa-profiler-page.tsx.txt', 'qa-profiler-client.tsx.txt', 'qa-profiler-collector.ts.txt', 'motion-emulation.ts.txt'];
  const replay = await fs.access(path.join(out, 'motion-emulation.ts.txt')).then(() => true, () => false);
  if (replay) {
    for (let i = 0; i < targets.length; i++) {
      const target = path.join(root, targets[i]);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, await fs.readFile(path.join(out, archivedNames[i]), 'utf8'), { flag: 'wx' });
    }
    const original = await fs.readFile(path.join(root, 'next.config.ts'), 'utf8');
    await fs.writeFile(path.join(out, 'next-config-original.txt'), original);
    await fs.writeFile(path.join(out, 'tsconfig-original.txt'), await fs.readFile(path.join(root, 'tsconfig.json'), 'utf8'));
    await fs.writeFile(path.join(root, 'next.config.ts'), original.replace('  poweredByHeader: false,', "  poweredByHeader: false,\n  distDir: process.env.FF14_PHASE292_PROFILE === '1' ? '.next-phase292' : '.next',"));
    console.log('Replayed the archived Phase 2.9.2 profiling sources.');
    process.exit(0);
  }
  let client = await fs.readFile(path.join(root, 'docs/qa/phase29/qa-profiler-client.tsx.txt'), 'utf8');
  client = client.replaceAll('phase29', 'phase292').replaceAll('Phase29', 'Phase292').replaceAll('Phase 2.9', 'Phase 2.9.2')
    .replace('docs/qa/phase292/uninstrumented-source.json', 'docs/qa/phase29/optimized-source.json');
  const ratioStart = client.indexOf("      } else if (kind === 'ratio') {");
  const ratioEnd = client.indexOf("      } else if (kind === 'typography') {", ratioStart);
  if (ratioStart < 0 || ratioEnd < 0) throw new Error('Expected ratio driver not found.');
  client = client.slice(0, ratioStart) + `      } else if (kind === 'ratio') {
        const ratios = ['1:1', '4:5', '3:4', '9:16', '16:9'];
        for (let index = 0; index < 10; index++) {
          const trigger = workspaceRef.current?.querySelector<HTMLButtonElement>('[data-editor-ratio-trigger]');
          if (!trigger) throw new Error('Actual visual ratio trigger was not found.');
          trigger.click();
          await waitFrames(2);
          const option = workspaceRef.current?.querySelector<HTMLButtonElement>('[data-ratio-value="' + ratios[index % ratios.length] + '"]');
          if (!option) throw new Error('Actual visual ratio option was not found.');
          option.click();
          actionCount++;
          await waitFrames(2);
        }
` + client.slice(ratioEnd);
  client = client.replace("'typography' | 'job' | 'locale'", "'typography' | 'job' | 'world' | 'locale'");
  const pickerStart = client.indexOf("      } else if (kind === 'job') {");
  const pickerEnd = client.indexOf('      } else {', pickerStart + 45);
  // The first inner else is the mobile trigger branch; isolate through the locale branch instead.
  const localeStart = client.indexOf("      } else {\n        const locales", pickerStart);
  if (pickerStart < 0 || pickerEnd < 0 || localeStart < 0) throw new Error('Expected picker driver not found.');
  const picker = client.slice(pickerStart, localeStart).replace("kind === 'job'", "kind === 'job' || kind === 'world'")
    .replace("await openEditorPanel('character');", "await openEditorPanel(kind === 'world' ? 'information' : 'character');")
    .replaceAll('copy.fields.job', "(kind === 'world' ? copy.fields.world : copy.fields.job)");
  client = client.slice(0, pickerStart) + picker + client.slice(localeStart);
  client = client.replace('<button type="button" style={buttonStyle} onClick={() => void runTenSwitches(\'locale\')}>', '<button type="button" style={buttonStyle} onClick={() => void runTenSwitches(\'world\')}>10 World switches</button>\n              <button type="button" style={buttonStyle} onClick={() => void runTenSwitches(\'locale\')}>');
  const templates = [
    (await fs.readFile(path.join(root, 'docs/qa/phase29/qa-profiler-page.tsx.txt'), 'utf8')).replaceAll('Phase29', 'Phase292'),
    client,
    (await fs.readFile(path.join(root, 'docs/qa/phase29/qa-profiler-collector.ts.txt'), 'utf8')).replace("'phase29'", "'phase292'"),
  ];
  for (let i = 0; i < templates.length; i++) {
    const target = path.join(root, targets[i]);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, templates[i], { flag: 'wx' });
    await fs.writeFile(path.join(out, ['qa-profiler-page.tsx.txt', 'qa-profiler-client.tsx.txt', 'qa-profiler-collector.ts.txt'][i]), templates[i]);
  }
  const original = await fs.readFile(path.join(root, 'next.config.ts'), 'utf8');
  await fs.writeFile(path.join(out, 'next-config-original.txt'), original);
  await fs.writeFile(path.join(out, 'tsconfig-original.txt'), await fs.readFile(path.join(root, 'tsconfig.json'), 'utf8'));
  await fs.writeFile(path.join(root, 'next.config.ts'), original.replace('  poweredByHeader: false,', "  poweredByHeader: false,\n  distDir: process.env.FF14_PHASE292_PROFILE === '1' ? '.next-phase292' : '.next',"));
  console.log('Prepared a separate .next-phase292 profiling build; normal .next remains intact.');
}

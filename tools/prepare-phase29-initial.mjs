import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = resolve(root, 'src/app/editor/page.tsx');
const probe = resolve(root, 'src/components/editor/performance-initial-probe.tsx');
const original = "import { EditorWorkspace } from '@/components/editor/editor-workspace';\n\nexport default function EditorPage() {\n  return <EditorWorkspace />;\n}\n";
const measured = await readFile(resolve(root, 'docs/qa/phase29/initial-page.tsx.txt'), 'utf8');
const current = (await readFile(page, 'utf8')).replaceAll('\r\n', '\n').trim();
if (![original.trim(), measured.replaceAll('\r\n', '\n').trim()].includes(current)) throw new Error('Editor route changed; refusing to overwrite it.');
if (process.argv.includes('--remove')) {
  await writeFile(page, original);
  await rm(probe, { force: true });
  console.log('Removed temporary direct Editor initial probe.');
} else {
  await writeFile(probe, await readFile(resolve(root, 'docs/qa/phase29/initial-probe.tsx.txt'), 'utf8'));
  await writeFile(page, measured);
  console.log('Installed opt-in direct Editor initial probe. Build with NEXT_PUBLIC_PERFORMANCE_PROFILING=1 --profile.');
}

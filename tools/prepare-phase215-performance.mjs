import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(root, 'src', 'app', 'qa-phase215-performance');
const archive = path.join(root, 'docs', 'qa', 'phase215', 'qa-source');
const editorPage = path.join(root, 'src', 'app', 'editor', 'page.tsx');
const originalEditorPage = "import { EditorWorkspace } from '@/components/editor/editor-workspace';\n\nexport default function EditorPage() {\n  return <EditorWorkspace />;\n}\n";
const instrumentedEditorPage = "import { EditorWorkspace } from '@/components/editor/editor-workspace';\nimport Phase215PerformanceProbe from '@/app/qa-phase215-performance/probe';\n\ntype PageSearchParams = Promise<Record<string, string | string[] | undefined>>;\n\nexport default async function EditorPage({ searchParams }: { searchParams: PageSearchParams }) {\n  const value = (await searchParams)['qa215-stage'];\n  const stage = value === 'before' || value === 'after' ? value : null;\n  return <><EditorWorkspace />{process.env.NEXT_PUBLIC_PERFORMANCE_PROFILING === '1' && stage && <Phase215PerformanceProbe stage={stage} />}</>;\n}\n";
const sources = [
  ['src/app/qa-phase215-performance/page.tsx', 'src__app__qa-phase215-performance__page.tsx.txt'],
  ['src/app/qa-phase215-performance/probe.tsx', 'src__app__qa-phase215-performance__probe.tsx.txt'],
  ['src/app/qa-phase215-performance/collect/route.ts', 'src__app__qa-phase215-performance__collect__route.ts.txt'],
  ['src/app/editor/page.tsx', 'src__app__editor__page-with-perf-hook.tsx.txt'],
  ['tools/phase215-perf-report.mjs', 'tools__phase215-perf-report.mjs.txt'],
  ['tools/phase215-perf-extract-built-probe.mjs', 'tools__phase215-perf-extract-built-probe.mjs.txt'],
  ['tools/prepare-phase215-performance.mjs', 'tools__prepare-phase215-performance.mjs.txt'],
];

const clean = process.argv.includes('--clean');
const resolvedSourceDirectory = path.resolve(sourceDirectory);
if (resolvedSourceDirectory !== path.join(root, 'src', 'app', 'qa-phase215-performance')) throw new Error('Refusing to archive or remove an unexpected QA route path.');

if (clean) {
  const currentEditorPage = await readFile(editorPage, 'utf8');
  if (currentEditorPage !== instrumentedEditorPage) throw new Error('Editor page changed after profiling instrumentation; refusing to overwrite it during cleanup. Review and restore the page manually.');
}

await mkdir(archive, { recursive: true });
for (const [source, destination] of sources) await copyFile(path.join(root, source), path.join(archive, destination));
console.log(`Archived ${sources.length} Phase 2.15 performance sources under docs/qa/phase215/qa-source.`);

if (clean) {
  const info = await stat(resolvedSourceDirectory).catch(() => null);
  if (info?.isDirectory()) await rm(resolvedSourceDirectory, { recursive: true, force: false });
  await writeFile(editorPage, originalEditorPage, 'utf8');
  console.log('Removed the temporary performance route and restored the exact original Editor page.');
}

import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pagePath = resolve(root, 'src/app/export/page.tsx');
const probePath = resolve(root, 'src/components/editor/performance-export-probe.tsx');
const page = (await readFile(pagePath, 'utf8')).replaceAll('\r\n', '\n');
const importLine = "import { PerformanceExportProbe } from '@/components/editor/performance-export-probe';";
const renderLine = '      {PERFORMANCE_PROFILING_ENABLED && <PerformanceExportProbe />}';
if (!page.includes(importLine) || !page.includes(renderLine)) throw new Error('Expected temporary export probe was not found; refusing to change the page.');
await writeFile(resolve(root, 'docs/qa/phase29/export-probe.tsx.txt'), await readFile(probePath, 'utf8'));
await writeFile(pagePath, page.replace(importLine + '\n', '').replace(renderLine + '\n', '').replace('PERFORMANCE_PROFILING_ENABLED, profileCount, profileStart', 'profileCount, profileStart'));
await rm(probePath);
console.log('Archived and removed only the temporary ExportPage profiling UI.');

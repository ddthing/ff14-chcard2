import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs', 'qa', 'phase215');
const buildRoot = path.join(root, '.next');
const chunks = path.join(buildRoot, 'static', 'chunks');
const sourceBaselinePath = path.join(qaRoot, 'before-source.json');
const outputRoot = path.join(qaRoot, 'before', 'compiled-ui-css');
const expectedBuildId = 'TGys2JA8pChSE19oM9VkZ';
const modules = [
  { name: 'app-shell', source: 'src/components/app-shell.module.css', chunk: '0my0l-4fk62li.css', prefix: 'app-shell-module__' },
  { name: 'editor', source: 'src/app/editor/editor.module.css', chunk: '33cmcchigmk91.css', prefix: 'editor-module__' },
  { name: 'templates', source: 'src/app/templates/templates.module.css', chunk: '18vmlrp_llg-c.css', prefix: 'templates-module__' },
  { name: 'export', source: 'src/app/export/export.module.css', chunk: '41li-0z_adwts.css', prefix: 'export-module__' },
];

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function copyRuleWithAtRuleContext(rule) {
  let node = rule.clone();
  const wrappers = [];
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'atrule') wrappers.unshift(parent);
  }
  for (const wrapper of wrappers) {
    const clone = wrapper.clone();
    clone.removeAll();
    clone.append(node);
    node = clone;
  }
  return node;
}

function extractNamespaceCss(source, cssModule) {
  const parsed = postcss.parse(source, { from: cssModule.chunk });
  const output = postcss.root();
  const selectors = [];
  parsed.walkRules((rule) => {
    if (!rule.selector.includes(cssModule.prefix)) return;
    selectors.push(rule.selector);
    output.append(copyRuleWithAtRuleContext(rule));
  });
  return { css: output.toString(), selectors };
}

const buildId = (await readFile(path.join(buildRoot, 'BUILD_ID'), 'utf8')).trim();
if (buildId !== expectedBuildId) throw new Error(`Refusing to capture compiled before CSS from build ${buildId}; expected baseline build ${expectedBuildId}.`);
const sourceBaseline = JSON.parse(await readFile(sourceBaselinePath, 'utf8'));
const baselineByFile = new Map(sourceBaseline.files.map((row) => [row.file, row]));
await mkdir(outputRoot, { recursive: true });

const records = [];
for (const cssModule of modules) {
  const sourceHash = baselineByFile.get(cssModule.source)?.sha256;
  if (!sourceHash) throw new Error(`Pre-edit source hash is missing for ${cssModule.source}.`);
  const chunkPath = path.join(chunks, cssModule.chunk);
  const [chunkBytes, chunkInfo, sourceInfo, currentSourceBytes] = await Promise.all([
    readFile(chunkPath), stat(chunkPath), stat(path.join(root, cssModule.source)), readFile(path.join(root, cssModule.source)),
  ]);
  const chunkText = chunkBytes.toString('utf8');
  const extracted = extractNamespaceCss(chunkText, cssModule);
  if (extracted.selectors.length === 0) throw new Error(`No ${cssModule.prefix} selectors found in ${cssModule.chunk}.`);
  const forbiddenPatterns = [/cards?-module__/i, /cinematic-master-module__/i, /editorial-master-module__/i, /identity-master-module__/i, /card-job-motif-module__/i, /job-icon-module__/i];
  const forbiddenMatches = forbiddenPatterns.flatMap((pattern) => extracted.selectors.filter((selector) => pattern.test(selector)));
  if (forbiddenMatches.length) throw new Error(`${cssModule.name}: extracted namespace unexpectedly includes protected card selectors: ${forbiddenMatches.join(', ')}`);
  const fileBytes = Buffer.from(`/* Original Phase 2.15 before-build CSS rules for ${cssModule.source}. Extracted from ${cssModule.chunk} (${buildId}) by CSS-module namespace; Card, JobIcon, and card-motif namespaces are excluded. */\n${extracted.css}\n`);
  const filename = `${cssModule.name}.css`;
  await writeFile(path.join(outputRoot, filename), fileBytes);
  records.push({
    module: cssModule.name,
    source: cssModule.source,
    sourceSha256AtBeforeSnapshot: sourceHash,
    currentSourceSha256: sha256(currentSourceBytes),
    sourceCurrentMtimeUtc: sourceInfo.mtime.toISOString(),
    compiledChunk: `.next/static/chunks/${cssModule.chunk}`,
    compiledChunkSha256: sha256(chunkBytes),
    compiledChunkMtimeUtc: chunkInfo.mtime.toISOString(),
    compiledChunkBytes: chunkBytes.byteLength,
    extractedFile: `docs/qa/phase215/before/compiled-ui-css/${filename}`,
    extractedSha256: sha256(fileBytes),
    extractedBytes: fileBytes.byteLength,
    selectorRuleCount: extracted.selectors.length,
    cssModulePrefix: cssModule.prefix,
    sourceMatchesBeforeHash: sha256(currentSourceBytes) === sourceHash,
    compiledBeforeCurrentSourceMtime: chunkInfo.mtime <= sourceInfo.mtime,
    excludedProtectedSelectorMatches: forbiddenMatches,
  });
}

const report = {
  schema: 'phase215-compiled-before-ui-css-v1',
  generatedAt: new Date().toISOString(),
  phase215BaselineBuildId: buildId,
  sourceBaseline: 'docs/qa/phase215/before-source.json',
  protocol: 'Retains only compiled CSS rules whose selector contains one of the four explicitly scoped UI CSS-module prefixes. It does not copy Card, Master, JobIcon, or Card-job-motif CSS rules. The output fragments are audit/overlay sources, not complete Next.js bundles.',
  modules: records,
  sourceBaselineMtimeUtc: sourceBaseline.at,
  captureBoundary: 'Every compiled chunk is checked to have been emitted before the current source CSS file modification time. The original baseline SHA-256 is reported separately because the current source has since been polished.',
};
await writeFile(path.join(outputRoot, 'capture-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, outputRoot), buildId, modules: records.map(({ module, extractedFile, selectorRuleCount, sourceMatchesBeforeHash, compiledBeforeCurrentSourceMtime, excludedProtectedSelectorMatches }) => ({ module, extractedFile, selectorRuleCount, sourceMatchesBeforeHash, compiledBeforeCurrentSourceMtime, excludedProtectedSelectorMatches })) }, null, 2));

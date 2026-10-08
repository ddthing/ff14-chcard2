import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendered = path.join(root, 'docs', 'qa', 'phase215', 'rendered');
const output = path.join(root, 'docs', 'qa', 'phase215', '02-style-isolation-audit.json');
const families = ['cinematic', 'editorial', 'id-card'];
const groups = ['dark', 'light', 'system-dark', 'system-light'];
const stages = ['before', 'after'];

async function load(stage, group, family) {
  const filename = `qa215-style-${stage}-${group}-${family}.json`;
  const bytes = await readFile(path.join(rendered, filename));
  const report = JSON.parse(bytes.toString('utf8'));
  if (report.schema !== 'phase215-card-style-audit-v1' || report.family !== family || report.preference !== (group.startsWith('system-') ? 'system' : group) || report.resolved !== (group.endsWith('dark') ? 'dark' : 'light')) {
    throw new Error(`${filename} does not match the expected family / preference / resolved theme.`);
  }
  return { filename, report };
}

function diffNodes(left, right) {
  const a = new Map(left.nodes.map((node) => [node.path, node]));
  const b = new Map(right.nodes.map((node) => [node.path, node]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changes = [];
  for (const nodePath of paths) {
    const before = a.get(nodePath);
    const after = b.get(nodePath);
    if (!before || !after) {
      changes.push({ nodePath, missingFrom: before ? 'right' : 'left' });
      continue;
    }
    for (const key of ['values', 'appTokens', 'cardTokens', 'before', 'after']) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes.push({ nodePath, key, before: before[key], after: after[key] });
    }
    // Width/height are card geometry. Absolute page x/y is intentionally reported separately;
    // App Shell polish may move the preview without changing any card render input.
    for (const key of ['width', 'height']) {
      if (before.rect[key] !== after.rect[key]) changes.push({ nodePath, key: `rect.${key}`, before: before.rect[key], after: after.rect[key] });
    }
  }
  return changes;
}

const evidence = [];
const beforeAfterGeometry = [];
for (const family of families) {
  const byStageAndGroup = new Map();
  for (const stage of stages) for (const group of groups) {
    const loaded = await load(stage, group, family);
    byStageAndGroup.set(`${stage}/${group}`, loaded);
    const appMatches = loaded.report.cssAudit.appTokenDeclarationMatches;
    evidence.push({ stage, group, family, source: loaded.filename, cardRenderScope: loaded.report.article.scope, template: loaded.report.article.template, articleColorScheme: loaded.report.article.colorScheme, articleRect: loaded.report.article.rect, nodeCount: loaded.report.nodes.length, appTokenDeclarationMatches: appMatches, inaccessibleStylesheetCount: loaded.report.cssAudit.inaccessibleStylesheetCount });
  }
  for (const stage of stages) {
    const reference = byStageAndGroup.get(`${stage}/dark`).report;
    for (const group of groups.filter((item) => item !== 'dark')) {
      const current = byStageAndGroup.get(`${stage}/${group}`).report;
      const changes = diffNodes(reference, current);
      const appRefs = current.cssAudit.appTokenDeclarationMatches.length;
      const articleDimensionsMatch = reference.article.rect.width === current.article.rect.width && reference.article.rect.height === current.article.rect.height;
      evidence.push({ stage, groupA: 'dark', groupB: group, family, kind: 'within-stage-theme-style', descendantStyleDiffCount: changes.length, descendantStyleDiffs: changes, appTokenDeclarationMatches: appRefs, articleDimensionsMatch, exactComputedStyleMatch: changes.length === 0 });
    }
  }
  for (const group of groups) {
    const before = byStageAndGroup.get(`before/${group}`).report;
    const after = byStageAndGroup.get(`after/${group}`).report;
    const changes = diffNodes(before, after);
    beforeAfterGeometry.push({ family, group, beforeArticleRect: before.article.rect, afterArticleRect: after.article.rect, sameArticleDimensions: before.article.rect.width === after.article.rect.width && before.article.rect.height === after.article.rect.height });
    evidence.push({ family, group, kind: 'before-after-style-comparison', descendantStyleDiffCount: changes.length, changedStylePropertyCount: changes.filter((row) => row.key === 'values').length, descendantStyleDiffs: changes });
  }
}

const isolationPairs = evidence.filter((row) => row.kind === 'within-stage-theme-style');
const appReferenceRows = evidence.filter((row) => !row.kind && 'appTokenDeclarationMatches' in row);
const report = {
  schema: 'phase215-card-style-isolation-v1',
  generatedAt: new Date().toISOString(),
  protocol: 'Compares the full native computed style vector, card custom property values, ::before/::after vectors, and dimensions for every descendant of the real production CardPreview article. Compares each group to manual Dark within the same stage. Before/after style deltas are reported as observations and are not required to be exact because surrounding App Shell layout may move the card.',
  requiredComputedProperties: 'See qa-phase215-fixture/fixture.tsx AuditProperty; source archiving records the exact QA tool revision.',
  exactGroups: groups,
  sourceAudit: {
    matchedAppTokenDeclarations: appReferenceRows.reduce((sum, row) => sum + (Array.isArray(row.appTokenDeclarationMatches) ? row.appTokenDeclarationMatches.length : 0), 0),
    inaccessibleStylesheets: Math.max(0, ...appReferenceRows.map((row) => row.inaccessibleStylesheetCount ?? 0)),
    allCardRootsUseRenderScope: appReferenceRows.length === stages.length * groups.length * families.length && appReferenceRows.every((row) => row.cardRenderScope === 'true'),
  },
  summary: {
    allSameStageComputedStylesMatchAcrossFourGroups: isolationPairs.length === stages.length * families.length * (groups.length - 1) && isolationPairs.every((row) => row.exactComputedStyleMatch),
    noAppTokenDeclarationsMatchCardSubtrees: appReferenceRows.every((row) => Array.isArray(row.appTokenDeclarationMatches) && row.appTokenDeclarationMatches.length === 0),
    beforeAfterStyleDeltasAreObservationalOnly: true,
  },
  articleGeometryByStage: beforeAfterGeometry,
  evidence,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: path.relative(root, output), sourceAudit: report.sourceAudit, summary: report.summary, stylePairs: isolationPairs.length }, null, 2));

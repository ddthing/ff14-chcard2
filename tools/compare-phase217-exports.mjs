import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'docs', 'qa', 'phase217');
const rendered = path.join(qa, 'rendered');
const output = path.join(qa, '01-export-pixel-gate.json');
const styleOutput = path.join(qa, '02-style-isolation-audit.json');
const performanceOutput = path.join(qa, '03-performance-comparison.json');
const priorPath = path.join(root, 'docs', 'qa', 'phase2141', 'AA_DIAGNOSTIC.json');
const sourceDiffPath = path.join(qa, 'source-freeze-diff.json');
const families = ['cinematic', 'editorial', 'id-card'];
const groups = ['dark', 'light', 'system-dark', 'system-light'];
const formats = ['png', 'webp'];
const repeats = [1, 2, 3];
const stages = ['before', 'after'];
const failures = [];
const missing = [];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function round(value, digits = 9) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fileName(stage, group, family, format, repeat) {
  return `qa217-card-${stage}-${group}-${family}-${format}-r${repeat}-2x.${format}`;
}

function styleFileName(stage, group, family) {
  return `qa217-style-${stage}-${group}-${family}.json`;
}

function compare(left, right) {
  assert(left.width === right.width && left.height === right.height && left.channels === right.channels,
    `Decoded dimensions differ: ${left.name} ${left.width}×${left.height} vs ${right.name} ${right.width}×${right.height}.`);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let sum = 0;
  const channels = left.channels;
  for (let offset = 0; offset < left.raw.length; offset += channels) {
    let changed = false;
    for (let channel = 0; channel < channels; channel += 1) {
      const delta = Math.abs(left.raw[offset + channel] - right.raw[offset + channel]);
      if (!delta) continue;
      changed = true;
      sum += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (changed) changedPixels += 1;
  }
  const pixelCount = left.width * left.height;
  const meanAbsoluteChannelDelta = round(sum / left.raw.length);
  return {
    left: left.name,
    right: right.name,
    leftSha256: left.sha256,
    rightSha256: right.sha256,
    dimensions: { width: left.width, height: left.height, channels },
    exactBinary: left.sha256 === right.sha256,
    exactDecodedPixels: changedPixels === 0,
    changedPixels,
    changedPixelPercent: round((changedPixels / pixelCount) * 100, 7),
    maxChannelDelta,
    meanAbsoluteChannelDelta,
    mad: meanAbsoluteChannelDelta,
  };
}

function maxima(rows, field) {
  return Math.max(0, ...rows.map(row => row[field]));
}

function maxEnvelope(rows) {
  return {
    changedPixels: maxima(rows, 'changedPixels'),
    changedPixelPercent: maxima(rows, 'changedPixelPercent'),
    meanAbsoluteChannelDelta: maxima(rows, 'meanAbsoluteChannelDelta'),
    maxChannelDelta: maxima(rows, 'maxChannelDelta'),
  };
}

function metricsWithin(actual, envelope) {
  const metrics = ['changedPixels', 'changedPixelPercent', 'meanAbsoluteChannelDelta', 'maxChannelDelta'];
  const checks = Object.fromEntries(metrics.map(metric => [metric, actual[metric] <= envelope[metric]]));
  return { ...checks, all: Object.values(checks).every(Boolean) };
}

const files = new Set(await readdir(rendered).catch(error => {
  if (error?.code === 'ENOENT') throw new Error(`No Phase 2.17 captures found at ${path.relative(root, rendered)}.`);
  throw error;
}));
const prior = JSON.parse(await readFile(priorPath, 'utf8'));
assert(prior.schema === 'phase2141-aa-analysis-v1', `Unexpected historical pixel envelope schema at ${path.relative(root, priorPath)}.`);
const priorEnvelopes = new Map(prior.globalEnvelopeAcrossExactPreferenceResolvedConditions.map(row => [`${row.family}/${row.format}`, row]));
const sourceDiff = JSON.parse(await readFile(sourceDiffPath, 'utf8').catch(() => {
  throw new Error('Missing docs/qa/phase217/source-freeze-diff.json. Run node tools/phase217-source-freeze.mjs after after the final CSS edits.');
}));
const sourceGate = {
  protectedExact: sourceDiff.protectedExact === true,
  protectedExactIncludingAllowedUiCss: sourceDiff.protectedExactIncludingAllowedUiCss === true,
  cssOnly: sourceDiff.cssOnly === true,
  allowedUiCssExemptions: sourceDiff.allowedUiCssExemptions ?? [],
  changedProtectedCount: sourceDiff.changedProtected?.length ?? null,
  addedProtectedCount: sourceDiff.addedProtected?.length ?? null,
  removedProtectedCount: sourceDiff.removedProtected?.length ?? null,
  sourceChanges: sourceDiff.sourceChanges ?? [],
};

const cache = new Map();
async function loadCapture(stage, group, family, format, repeat) {
  const name = fileName(stage, group, family, format, repeat);
  const metadataName = `${name}.json`;
  if (!files.has(name)) {
    missing.push(name);
    return null;
  }
  if (!files.has(metadataName)) {
    missing.push(metadataName);
    return null;
  }
  const key = `${name}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const [bytes, metadataBytes] = await Promise.all([
      readFile(path.join(rendered, name)),
      readFile(path.join(rendered, metadataName)),
    ]);
    const image = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    const computedHash = sha256(bytes);
    if (metadata.sha256 !== computedHash) failures.push(`${metadataName}: browser SHA-256 does not match collected bytes.`);
    if (metadata.stage !== stage || metadata.group !== group || metadata.family !== family || metadata.format !== format || metadata.repeat !== repeat) {
      failures.push(`${metadataName}: capture metadata does not match the file name.`);
    }
    if (metadata.outputWidth !== 2160 || metadata.outputHeight !== 2700 || image.info.width !== 2160 || image.info.height !== 2700) {
      failures.push(`${name}: expected real 2× 4:5 renderer output 2160×2700; metadata=${metadata.outputWidth}×${metadata.outputHeight}, decoded=${image.info.width}×${image.info.height}.`);
    }
    if (metadata.articleRect?.width !== 432 || metadata.articleRect?.height !== 540) {
      failures.push(`${metadataName}: expected mounted 432×540 CSS-pixel card; found ${metadata.articleRect?.width}×${metadata.articleRect?.height}.`);
    }
    const capture = {
      name,
      bytes,
      sha256: computedHash,
      raw: image.data,
      width: image.info.width,
      height: image.info.height,
      channels: image.info.channels,
      metadata,
    };
    cache.set(key, capture);
    return capture;
  } catch (error) {
    failures.push(`${name}: unable to decode capture or metadata (${error instanceof Error ? error.message : String(error)}).`);
    return null;
  }
}

const styleCache = new Map();
async function loadStyle(stage, group, family) {
  const name = styleFileName(stage, group, family);
  if (!files.has(name)) {
    missing.push(name);
    return null;
  }
  if (styleCache.has(name)) return styleCache.get(name);
  try {
    const report = JSON.parse(await readFile(path.join(rendered, name), 'utf8'));
    if (report.schema !== 'phase217-card-style-audit-v1' || report.stage !== stage || report.group !== group || report.family !== family) {
      failures.push(`${name}: style audit does not match the requested stage/theme/family.`);
    }
    if (report.article?.scope !== 'true' || report.article?.rect?.width !== 432 || report.article?.rect?.height !== 540) {
      failures.push(`${name}: missing render scope or expected 432×540 card geometry.`);
    }
    if (report.environment?.dpr !== 1) failures.push(`${name}: expected DPR1, found ${report.environment?.dpr}.`);
    if (report.environment?.viewport?.width !== 1280 || report.environment?.viewport?.height !== 720) {
      failures.push(`${name}: expected 1280×720 CSS-pixel capture viewport; found ${report.environment?.viewport?.width}×${report.environment?.viewport?.height}.`);
    }
    const actualAppTokenValueCount = report.nodes.reduce((count, node) => count + Object.values(node.appTokens ?? {}).filter(value => typeof value === 'string' && value.trim() !== '').length, 0);
    if (actualAppTokenValueCount !== 0) failures.push(`${name}: detected ${actualAppTokenValueCount} non-empty App Theme custom property values inside the card subtree.`);
    report.computedAppTokenValueCount = actualAppTokenValueCount;
    styleCache.set(name, report);
    return report;
  } catch (error) {
    failures.push(`${name}: unable to read style audit (${error instanceof Error ? error.message : String(error)}).`);
    return null;
  }
}

const outputMetadata = new Map();
const repeatEvidence = [];
const groupEnvelopes = new Map();
const themeEvidence = [];
const caseBEvidence = [];
const beforeAfterEvidence = [];

for (const stage of stages) {
  for (const family of families) {
    for (const format of formats) {
      for (const group of groups) {
        const values = await Promise.all(repeats.map(repeat => loadCapture(stage, group, family, format, repeat)));
        if (values.some(value => !value)) continue;
        const pairwise = [];
        for (let left = 0; left < values.length; left += 1) {
          for (let right = left + 1; right < values.length; right += 1) pairwise.push(compare(values[left], values[right]));
        }
        const envelope = maxEnvelope(pairwise);
        const historicalEnvelope = priorEnvelopes.get(`${family}/${format}`);
        if (!historicalEnvelope) {
          failures.push(`Missing Phase 2.14.1 envelope for ${family}/${format}.`);
          continue;
        }
        const historicalCheck = metricsWithin(envelope, historicalEnvelope);
        const row = {
          stage, group, resolved: group.endsWith('dark') ? 'dark' : 'light', family, format,
          outputCount: values.length,
          exactBinaryRepeats: pairwise.every(item => item.exactBinary),
          exactDecodedPixelRepeats: pairwise.every(item => item.exactDecodedPixels),
          freshWithinThemeRepeatEnvelope: envelope,
          withinRepeatWithinPhase2141Envelope: historicalCheck,
          pairwise,
        };
        repeatEvidence.push(row);
        groupEnvelopes.set(`${stage}/${family}/${format}/${group}`, envelope);
        for (const value of values) outputMetadata.set(`${stage}/${group}/${family}/${format}/${value.metadata.repeat}`, value.metadata);
      }

      const stageGroups = groups.map(group => groupEnvelopes.get(`${stage}/${family}/${format}/${group}`)).filter(Boolean);
      const freshEnvelope = stageGroups.length === groups.length ? {
        changedPixels: maxima(stageGroups, 'changedPixels'),
        changedPixelPercent: maxima(stageGroups, 'changedPixelPercent'),
        meanAbsoluteChannelDelta: maxima(stageGroups, 'meanAbsoluteChannelDelta'),
        maxChannelDelta: maxima(stageGroups, 'maxChannelDelta'),
      } : null;
      const historicalEnvelope = priorEnvelopes.get(`${family}/${format}`);
      for (let left = 0; left < groups.length; left += 1) {
        for (let right = left + 1; right < groups.length; right += 1) {
          const groupA = groups[left];
          const groupB = groups[right];
          const a = await Promise.all(repeats.map(repeat => loadCapture(stage, groupA, family, format, repeat)));
          const b = await Promise.all(repeats.map(repeat => loadCapture(stage, groupB, family, format, repeat)));
          if ([...a, ...b].some(value => !value)) continue;
          const comparisons = a.flatMap(leftValue => b.map(rightValue => compare(leftValue, rightValue)));
          const maximum = maxEnvelope(comparisons);
          const withinFresh = freshEnvelope ? metricsWithin(maximum, freshEnvelope) : { all: false, unavailable: true };
          const withinHistorical = historicalEnvelope ? metricsWithin(maximum, historicalEnvelope) : { all: false, unavailable: true };
          const row = {
            stage, family, format, groupA, groupB,
            resolvedA: groupA.endsWith('dark') ? 'dark' : 'light',
            resolvedB: groupB.endsWith('dark') ? 'dark' : 'light',
            freshWithinThemeRepeatEnvelope: freshEnvelope,
            maximumBetweenConditionDelta: maximum,
            withinFreshRepeatEnvelope: withinFresh,
            phase2141Envelope: historicalEnvelope,
            withinPhase2141Envelope: withinHistorical,
            withinFreshAndPhase2141Envelopes: withinFresh.all === true && withinHistorical.all === true,
            pairwise: comparisons,
          };
          themeEvidence.push(row);
          if ((groupA === 'dark' && groupB === 'system-dark') || (groupA === 'light' && groupB === 'system-light')) {
            caseBEvidence.push({
              stage, family, format,
              comparison: groupA === 'dark' ? 'manual-dark-vs-system-dark' : 'manual-light-vs-system-light',
              exactBinaryEquality: comparisons.every(item => item.exactBinary),
              exactDecodedPixelEquality: comparisons.every(item => item.exactDecodedPixels),
              withinFreshAndPhase2141Envelopes: row.withinFreshAndPhase2141Envelopes,
              maximumDelta: maximum,
              pairwise: comparisons,
            });
          }
        }
      }
    }
  }
}

for (const family of families) {
  for (const format of formats) {
    for (const group of groups) {
      for (const repeat of repeats) {
        const before = await loadCapture('before', group, family, format, repeat);
        const after = await loadCapture('after', group, family, format, repeat);
        if (!before || !after) continue;
        const beforeStateHash = before.metadata.stateHash;
        const afterStateHash = after.metadata.stateHash;
        const beforeRect = before.metadata.articleRect;
        const afterRect = after.metadata.articleRect;
        const sameFrozenCardData = beforeStateHash === afterStateHash;
        const sameCardSize = beforeRect?.width === afterRect?.width && beforeRect?.height === afterRect?.height;
        const delta = compare(before, after);
        const historicalEnvelope = priorEnvelopes.get(`${family}/${format}`);
        const withinHistorical = historicalEnvelope ? metricsWithin(delta, historicalEnvelope) : { all: false, unavailable: true };
        beforeAfterEvidence.push({
          family, format, group, repeat,
          sameFrozenCardData,
          sameCardSize,
          articleOffset: { before: { x: beforeRect?.x, y: beforeRect?.y }, after: { x: afterRect?.x, y: afterRect?.y } },
          strictByteEquality: delta.exactBinary,
          strictDecodedPixelEquality: delta.exactDecodedPixels,
          phase2141Envelope: historicalEnvelope,
          withinPhase2141Envelope: withinHistorical,
          delta,
        });
      }
    }
  }
}

const sampleMatrixEvidence = [];
for (const stage of stages) {
  for (const family of families) {
    const rows = [...outputMetadata.entries()]
      .filter(([key]) => key.startsWith(`${stage}/`) && key.includes(`/${family}/`))
      .map(([, metadata]) => metadata);
    const stateHashes = [...new Set(rows.map(row => row.stateHash))];
    const cardSizes = [...new Set(rows.map(row => `${row.articleRect?.width}x${row.articleRect?.height}`))];
    sampleMatrixEvidence.push({
      stage,
      family,
      outputCount: rows.length,
      stateHashes,
      cardSizes,
      oneFrozenInputAndSize: rows.length === groups.length * formats.length * repeats.length && stateHashes.length === 1 && cardSizes.length === 1,
    });
  }
}

function normalizeGeneratedUseIds(value) {
  if (typeof value === 'string') return value.replace(/_r_\d+_/g, '_r_<generated>_');
  if (Array.isArray(value)) return value.map(normalizeGeneratedUseIds);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeGeneratedUseIds(item)]));
  return value;
}

function styleFingerprint(report) {
  const originX = report.article.rect.x;
  const originY = report.article.rect.y;
  const normalizedNodes = report.nodes.map(node => ({
    path: node.path,
    id: normalizeGeneratedUseIds(node.id),
    dataTemplate: node.dataTemplate,
    values: normalizeGeneratedUseIds(node.values),
    appTokens: Object.fromEntries(Object.entries(node.appTokens ?? {}).filter(([, value]) => typeof value === 'string' && value.trim() !== '').sort(([left], [right]) => left.localeCompare(right))),
    cardTokens: normalizeGeneratedUseIds(Object.fromEntries(Object.entries(node.cardTokens ?? {}).sort(([left], [right]) => left.localeCompare(right)))),
    rect: {
      x: round(node.rect.x - originX, 3),
      y: round(node.rect.y - originY, 3),
      width: node.rect.width,
      height: node.rect.height,
    },
    before: normalizeGeneratedUseIds(node.before),
    after: normalizeGeneratedUseIds(node.after),
  }));
  const normalized = {
    family: report.family,
    article: {
      scope: report.article.scope,
      template: report.article.template,
      width: report.article.rect.width,
      height: report.article.rect.height,
      colorScheme: report.article.colorScheme,
    },
    appTokenValueCount: report.appTokenValueCount,
    nodes: normalizedNodes,
  };
  return sha256(Buffer.from(JSON.stringify(normalized)));
}

const styleEvidence = [];
const styleReports = new Map();
for (const stage of stages) {
  for (const family of families) {
    for (const group of groups) {
      const report = await loadStyle(stage, group, family);
      if (!report) continue;
      const row = { stage, group, family, source: styleFileName(stage, group, family), fingerprint: styleFingerprint(report), article: report.article, appTokenValueCount: report.computedAppTokenValueCount, reportedAppTokenPropertyCount: report.appTokenValueCount };
      styleEvidence.push(row);
      styleReports.set(`${stage}/${group}/${family}`, report);
    }
  }
}
const styleCrossCondition = [];
const styleCrossStage = [];
for (const family of families) {
  for (const stage of stages) {
    const reference = styleEvidence.find(row => row.stage === stage && row.family === family && row.group === 'dark');
    if (!reference) continue;
    for (const group of groups.filter(value => value !== 'dark')) {
      const current = styleEvidence.find(row => row.stage === stage && row.family === family && row.group === group);
      if (current) styleCrossCondition.push({ stage, family, referenceGroup: 'dark', group, exactCardStyleEquality: current.fingerprint === reference.fingerprint, referenceFingerprint: reference.fingerprint, fingerprint: current.fingerprint });
    }
  }
  for (const group of groups) {
    const before = styleEvidence.find(row => row.stage === 'before' && row.family === family && row.group === group);
    const after = styleEvidence.find(row => row.stage === 'after' && row.family === family && row.group === group);
    if (before && after) styleCrossStage.push({ family, group, exactCardStyleEquality: before.fingerprint === after.fingerprint, beforeFingerprint: before.fingerprint, afterFingerprint: after.fingerprint });
  }
}

const styleReport = {
  schema: 'phase217-card-style-isolation-report-v1',
  generatedAt: new Date().toISOString(),
  protocol: 'Raw style audits are captured from the production CardPreview subtree in each manual/System appearance condition. The comparison normalizes node x/y positions to the article origin and React useId-generated `_r_N_` suffixes in SVG fragment references so app-shell offsets and unique DOM IDs do not masquerade as card style changes. Computed styles, relative geometry, card tokens, pseudo styles, and non-empty App Theme token values remain exact.',
  rawStyleAuditCount: styleEvidence.length,
  expectedStyleAuditCount: stages.length * groups.length * families.length,
  audits: styleEvidence,
  crossConditionCardStyles: styleCrossCondition,
  beforeAfterCardStyles: styleCrossStage,
  summary: {
    complete: styleEvidence.length === stages.length * groups.length * families.length,
    noAppThemeTokensInCard: styleEvidence.length > 0 && styleEvidence.every(row => row.appTokenValueCount === 0),
    cardStylesExactAcrossAppearanceConditions: styleCrossCondition.length > 0 && styleCrossCondition.every(row => row.exactCardStyleEquality),
    cardStylesExactBeforeAfter: styleCrossStage.length > 0 && styleCrossStage.every(row => row.exactCardStyleEquality),
  },
};
await writeFile(styleOutput, `${JSON.stringify(styleReport, null, 2)}\n`);

const performanceFiles = [...files].filter(name => name.startsWith('qa217-performance-') && name.endsWith('.json'));
const performanceRows = [];
const performanceIssues = [];
for (const name of performanceFiles) {
  try {
    const report = JSON.parse(await readFile(path.join(rendered, name), 'utf8'));
    if (report.schema === 'phase217-performance-exports-v1') {
      const samples = report.runs ?? [];
      const renderTimes = samples.map(row => row.renderMs).filter(Number.isFinite);
      performanceRows.push({
        name, kind: 'exports', stage: report.stage, theme: report.theme, family: report.family, ratio: report.ratio, format: report.format,
        stateHash: report.stateHash,
        environment: report.environment,
        runCount: samples.length,
        renderMs: { samples: renderTimes, mean: renderTimes.length ? round(renderTimes.reduce((sum, value) => sum + value, 0) / renderTimes.length, 3) : null, median: renderTimes.length ? round([...renderTimes].sort((a, b) => a - b)[Math.floor(renderTimes.length / 2)], 3) : null },
        allRunsReady: samples.length > 0 && samples.every(row => row.fontStatus === 'loaded' && row.decodedImageCount === row.imageCount && row.twoAnimationFrames && row.stableGeometry),
        allRunsHaveSameState: samples.length > 0 && samples.every(row => row.stateHash === report.stateHash),
      });
      if (samples.length !== 5) performanceIssues.push(`${name}: expected five fresh timed runs; found ${samples.length}.`);
      if (samples.some(row => row.outputWidth !== 2160 || row.outputHeight !== 2700)) performanceIssues.push(`${name}: found a non-2160×2700 4:5 export.`);
    } else if (report.schema === 'phase217-performance-preview-readiness-v1' || report.schema === 'phase217-performance-initial-usable-v1') {
      performanceRows.push({
        name, kind: report.schema === 'phase217-performance-initial-usable-v1' ? 'initial-usable' : 'preview-readiness',
        stage: report.stage, theme: report.theme, family: report.family, ratio: report.ratio,
        stateHash: report.stateHash, readyMs: report.navigationUsableMs ?? report.readiness?.readyMs,
        environment: report.environment,
        ready: report.readiness?.fontStatus === 'loaded' && report.readiness?.decodedImageCount === report.readiness?.imageCount && report.readiness?.twoAnimationFrames && report.readiness?.stableGeometry && report.readiness?.opticalReady,
      });
    } else if (report.schema === 'phase217-performance-template-change-v1') {
      const changes = report.changes ?? [];
      const elapsed = changes.map(row => row.elapsedMs).filter(Number.isFinite);
      performanceRows.push({
        name, kind: 'template-changes', stage: report.stage, theme: report.theme, changeCount: changes.length,
        cardDataConsistent: report.cardDataConsistent === true,
        selectionSequence: report.selectionSequence ?? changes.map(({ template, ratio }) => ({ template, ratio })),
        environment: report.environment,
        elapsedMs: { samples: elapsed, mean: report.summaryMs?.mean ?? null, median: report.summaryMs?.median ?? null, p95: report.summaryMs?.p95 ?? null, max: report.summaryMs?.max ?? null },
      });
      if (changes.length !== report.changeCount || changes.length !== 30) performanceIssues.push(`${name}: expected 30 template/ratio changes; found ${changes.length}.`);
      if (report.cardDataConsistent !== true) performanceIssues.push(`${name}: one or more setter changes failed fonts/image/two-RAF readiness.`);
    }
  } catch (error) {
    performanceIssues.push(`${name}: unable to read report (${error instanceof Error ? error.message : String(error)}).`);
  }
}
const dragFiles = [...files].filter(name => name.startsWith('qa217-drag-') && name.endsWith('.json'));
for (const name of dragFiles) {
  try {
    const report = JSON.parse(await readFile(path.join(rendered, name), 'utf8'));
    if (report.schema !== 'phase217-trusted-range-drag-v1') {
      performanceIssues.push(`${name}: unexpected trusted drag report schema.`);
      continue;
    }
    const samples = report.samples ?? [];
    const frameP95 = samples.map(row => row.frameIntervalMs?.p95).filter(Number.isFinite);
    const maxFrame = samples.map(row => row.frameIntervalMs?.max).filter(Number.isFinite);
    performanceRows.push({
      name, kind: 'trusted-range-drag', stage: report.stage, theme: report.theme, family: report.family, ratio: report.ratio,
      sampleCount: samples.length,
      allPointerDownsTrusted: samples.length > 0 && samples.every(row => row.trustedPointerDown === true),
      anyRangeValueChanged: samples.some(row => row.startValue !== row.endValue),
      frameP95Ms: frameP95.length ? Math.max(...frameP95) : null,
      maxFrameIntervalMs: maxFrame.length ? Math.max(...maxFrame) : null,
      totalDragDurationMs: samples.reduce((sum, row) => sum + (Number.isFinite(row.durationMs) ? row.durationMs : 0), 0),
      environment: report.environment ?? null,
    });
    if (samples.length !== report.sampleCount) performanceIssues.push(`${name}: drag sample count does not match the report.`);
    if (samples.some(row => row.trustedPointerDown !== true)) performanceIssues.push(`${name}: found a drag sample without a trusted pointerdown.`);
  } catch (error) {
    performanceIssues.push(`${name}: unable to read trusted drag report (${error instanceof Error ? error.message : String(error)}).`);
  }
}
const performanceComparisons = [];
for (const before of performanceRows.filter(row => row.kind === 'exports' && row.stage === 'before')) {
  const after = performanceRows.find(row => row.kind === 'exports' && row.stage === 'after' && row.theme === before.theme && row.family === before.family && row.ratio === before.ratio && row.format === before.format);
  if (!after) continue;
  performanceComparisons.push({
    theme: before.theme, family: before.family, ratio: before.ratio, format: before.format,
    sameFrozenCardData: before.stateHash === after.stateHash,
    beforeRenderMs: before.renderMs,
    afterRenderMs: after.renderMs,
    meanChangePercent: before.renderMs.mean === 0 ? null : round(((after.renderMs.mean - before.renderMs.mean) / before.renderMs.mean) * 100, 3),
  });
}
for (const before of performanceRows.filter(row => row.kind === 'template-changes' && row.stage === 'before')) {
  const after = performanceRows.find(row => row.kind === 'template-changes' && row.stage === 'after' && row.theme === before.theme);
  if (!after) continue;
  performanceComparisons.push({
    theme: before.theme, metric: 'template-ratio-setter-to-ready', changeCount: before.changeCount,
    sameSelectionSequence: JSON.stringify(before.selectionSequence) === JSON.stringify(after.selectionSequence),
    beforeElapsedMs: before.elapsedMs,
    afterElapsedMs: after.elapsedMs,
    meanChangePercent: before.elapsedMs.mean === 0 ? null : round(((after.elapsedMs.mean - before.elapsedMs.mean) / before.elapsedMs.mean) * 100, 3),
  });
}
for (const before of performanceRows.filter(row => row.kind === 'initial-usable' && row.stage === 'before')) {
  const after = performanceRows.find(row => row.kind === 'initial-usable' && row.stage === 'after' && row.theme === before.theme && row.family === before.family && row.ratio === before.ratio);
  if (!after) continue;
  performanceComparisons.push({
    theme: before.theme, family: before.family, ratio: before.ratio, metric: 'navigation-to-usable',
    sameFrozenCardData: before.stateHash === after.stateHash,
    beforeNavigationUsableMs: before.readyMs,
    afterNavigationUsableMs: after.readyMs,
    changePercent: before.readyMs === 0 ? null : round(((after.readyMs - before.readyMs) / before.readyMs) * 100, 3),
  });
}
for (const before of performanceRows.filter(row => row.kind === 'trusted-range-drag' && row.stage === 'before')) {
  const after = performanceRows.find(row => row.kind === 'trusted-range-drag' && row.stage === 'after' && row.theme === before.theme && row.family === before.family && row.ratio === before.ratio);
  if (!after) continue;
  performanceComparisons.push({
    theme: before.theme, family: before.family, ratio: before.ratio, metric: 'trusted-range-drag-raf',
    beforeSampleCount: before.sampleCount,
    afterSampleCount: after.sampleCount,
    beforeFrameP95Ms: before.frameP95Ms,
    afterFrameP95Ms: after.frameP95Ms,
    beforeMaxFrameIntervalMs: before.maxFrameIntervalMs,
    afterMaxFrameIntervalMs: after.maxFrameIntervalMs,
    beforeAnyRangeValueChanged: before.anyRangeValueChanged,
    afterAnyRangeValueChanged: after.anyRangeValueChanged,
  });
}
const performanceReport = {
  schema: 'phase217-performance-comparison-v1',
  generatedAt: new Date().toISOString(),
  protocol: 'Timing summaries are observations only. Before/after are compared for the same stage-independent card data, theme, family, ratio, and export format. Export runs wait for fonts, image decode, stable card geometry, and two animation frames, with an unmeasured renderer warmup. No performance pass threshold is inferred from this small local sample.',
  rawReportCount: performanceRows.length,
  reports: performanceRows,
  comparisons: performanceComparisons,
  issues: performanceIssues,
  summary: {
    fiveRunExportReportsOnly: performanceRows.filter(row => row.kind === 'exports').length > 0 && performanceRows.filter(row => row.kind === 'exports').every(row => row.runCount === 5),
    allReadinessChecksPassed: performanceRows.filter(row => row.kind === 'exports').every(row => row.allRunsReady)
      && performanceRows.filter(row => row.kind === 'preview-readiness' || row.kind === 'initial-usable').every(row => row.ready)
      && performanceRows.filter(row => row.kind === 'template-changes').every(row => row.cardDataConsistent),
    allPairedReportsUseSameCardData: performanceComparisons.some(row => typeof row.sameFrozenCardData === 'boolean')
      && performanceComparisons.filter(row => typeof row.sameFrozenCardData === 'boolean').every(row => row.sameFrozenCardData),
    allPairedTemplateChangeSequencesMatch: performanceComparisons.filter(row => typeof row.sameSelectionSequence === 'boolean').length > 0
      && performanceComparisons.filter(row => typeof row.sameSelectionSequence === 'boolean').every(row => row.sameSelectionSequence),
    trustedRangeDragReports: performanceRows.filter(row => row.kind === 'trusted-range-drag').length,
    allCapturedDragsAreTrustedAndChangeTheRange: performanceRows.filter(row => row.kind === 'trusted-range-drag').length > 0
      && performanceRows.filter(row => row.kind === 'trusted-range-drag').every(row => row.allPointerDownsTrusted && row.anyRangeValueChanged),
  },
};
await writeFile(performanceOutput, `${JSON.stringify(performanceReport, null, 2)}\n`);

const requestedOutputCount = stages.length * groups.length * families.length * formats.length * repeats.length;
const expectedStyleCount = stages.length * groups.length * families.length;
const allStateAndGeometryStable = beforeAfterEvidence.length === families.length * formats.length * groups.length * repeats.length
  && beforeAfterEvidence.every(row => row.sameFrozenCardData && row.sameCardSize)
  && sampleMatrixEvidence.length === stages.length * families.length
  && sampleMatrixEvidence.every(row => row.oneFrozenInputAndSize);
const allWithinFreshAndPrior = themeEvidence.length === stages.length * families.length * formats.length * 6
  && themeEvidence.every(row => row.withinFreshAndPhase2141Envelopes);
const allBeforeAfterWithinPrior = beforeAfterEvidence.length > 0 && beforeAfterEvidence.every(row => row.withinPhase2141Envelope.all);
const allCaseBWithinFreshAndPrior = caseBEvidence.length === stages.length * families.length * formats.length * 2
  && caseBEvidence.every(row => row.withinFreshAndPhase2141Envelopes);
const strictBeforeAfter = beforeAfterEvidence.length > 0 && beforeAfterEvidence.every(row => row.strictByteEquality && row.strictDecodedPixelEquality);
const summary = {
  complete: missing.length === 0 && failures.length === 0,
  expectedOutputCount: requestedOutputCount,
  foundOutputCount: requestedOutputCount - new Set(missing.filter(name => !name.includes('style-'))).size,
  missingCount: new Set(missing).size,
  metadataOrProtocolFailureCount: failures.length,
  allCardStateAndCardSizeMatchBeforeAfter: allStateAndGeometryStable,
  allWithinConditionRepeatEnvelopesWithinPhase2141Ceiling: repeatEvidence.length === stages.length * groups.length * families.length * formats.length
    && repeatEvidence.every(row => row.withinRepeatWithinPhase2141Envelope.all),
  allAppearanceDeltasWithinFreshAndPhase2141Envelopes: allWithinFreshAndPrior,
  allSystemCaseBComparisonsWithinFreshAndPhase2141Envelopes: allCaseBWithinFreshAndPrior,
  allBeforeAfterDeltasWithinPhase2141Envelope: allBeforeAfterWithinPrior,
  strictBeforeAfterBinaryAndPixelEquality: strictBeforeAfter,
  strictWithinConditionBinaryAndPixelEquality: repeatEvidence.length > 0 && repeatEvidence.every(row => row.exactBinaryRepeats && row.exactDecodedPixelRepeats),
  styleAuditsComplete: styleReport.summary.complete && styleEvidence.length === expectedStyleCount,
  styleIsolationPass: styleReport.summary.noAppThemeTokensInCard && styleReport.summary.cardStylesExactAcrossAppearanceConditions && styleReport.summary.cardStylesExactBeforeAfter,
  protectedSourceExact: sourceGate.protectedExact,
  sourceChangesCssOnly: sourceGate.cssOnly,
};
summary.pass = summary.complete
  && summary.allCardStateAndCardSizeMatchBeforeAfter
  && summary.allWithinConditionRepeatEnvelopesWithinPhase2141Ceiling
  && summary.allAppearanceDeltasWithinFreshAndPhase2141Envelopes
  && summary.allSystemCaseBComparisonsWithinFreshAndPhase2141Envelopes
  && summary.allBeforeAfterDeltasWithinPhase2141Envelope
  && summary.styleAuditsComplete
  && summary.styleIsolationPass
  && summary.protectedSourceExact
  && summary.sourceChangesCssOnly;

const report = {
  schema: 'phase217-export-pixel-gate-v1',
  generatedAt: new Date().toISOString(),
  sourceDirectory: 'docs/qa/phase217/rendered',
  protocol: 'Actual production CardPreview/loadCardPreviewFonts/renderCardBlob from the exact current Coner 4:5 samples. The CSS preview is checked at 432×540 DPR1 and renderer outputs at the real 2× export size 2160×2700. The 144 outputs cover three families, four manual/System conditions, PNG/WebP, three repeats, before/after. Files decode to sRGB RGBA without resizing. Strict byte and decoded-pixel equality remains reported; local repeat envelopes are derived fresh and every change is also capped by the unchanged Phase 2.14.1 envelope.',
  priorPhase2141EnvelopeSource: 'docs/qa/phase2141/AA_DIAGNOSTIC.json globalEnvelopeAcrossExactPreferenceResolvedConditions; no threshold has been widened.',
  phase2141Envelopes: [...priorEnvelopes.values()],
  sourceFreezeGate: sourceGate,
  requestedOutputCount,
  foundOutputCount: summary.foundOutputCount,
  missing: [...new Set(missing)].sort(),
  failures,
  withinConditionRepeatEvidence: repeatEvidence,
  freshWithinStageAppearanceEnvelopeEvidence: themeEvidence,
  systemCaseBEqualityEvidence: caseBEvidence,
  strictBeforeAfterEvidence: beforeAfterEvidence,
  fixedSampleMatrixEvidence: sampleMatrixEvidence,
  performanceReport: 'docs/qa/phase217/03-performance-comparison.json',
  styleReport: 'docs/qa/phase217/02-style-isolation-audit.json',
  summary,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: path.relative(root, output), styleReport: path.relative(root, styleOutput), performanceReport: path.relative(root, performanceOutput), summary }, null, 2));
if (!summary.pass || performanceIssues.length) process.exitCode = 1;

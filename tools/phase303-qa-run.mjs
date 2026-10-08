import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProductionCase,
  assertForeground,
  captureProductionPreview,
  connectPhase303,
  evidenceRoot,
  rawRoot,
  renderProductionExport,
  setViewportAndMedia,
  waitForPhase303Api,
  writeProductionCaseReport,
  navigateAndAssert,
} from "./phase303-qa-cdp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const manifestName = String(args.get("manifest") ?? "qa-cases-core.json");
const debugPort = Number(args.get("port") ?? 9329);
const baseUrl = String(args.get("base-url") ?? "http://127.0.0.1:3334").replace(/\/$/, "");
const force = args.has("force");
const manifestPath = path.join(evidenceRoot, manifestName);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schema !== "phase303-qa-case-manifest-v1") throw new Error(`Unexpected manifest schema: ${manifest.schema}`);

const route = manifest.route ?? "/phase303-qa";
const viewport = manifest.viewport ?? { width: 1440, height: 1120, deviceScaleFactor: 1 };
const targetUrl = `${baseUrl}${route}`;
const caseIds = new Set();
for (const item of manifest.cases) {
  if (!item.caseId || caseIds.has(item.caseId)) throw new Error(`Missing or duplicate caseId in ${manifestName}: ${item.caseId}`);
  caseIds.add(item.caseId);
}

await mkdir(rawRoot, { recursive: true });
const { client } = await connectPhase303(debugPort);
const failedCases = [];
let captured = 0;
let skipped = 0;

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
}

function makeChecks(item, ready) {
  const card = ready.card;
  const expectedRatio = item.ratio.split(":").map(Number);
  const actualRatio = card.rect.width / card.rect.height;
  const nameJobOverlap = overlaps(card.characterName.rect, card.jobName.rect);
  const expectedSourceAliases = item.sourceClass === "generic-fallback" ? ["generic-fallback", "fallback"] : [item.sourceClass];
  const sourceMatches = card.marks.some((mark) => expectedSourceAliases.includes(mark.source));
  const imagesDecoded = card.images.every((image) => image.loaded && image.naturalWidth > 0 && image.naturalHeight > 0);
  const expectedAbbreviation = ready.expectedAbbreviation;
  const escapedAbbreviation = expectedAbbreviation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const visibleAbbreviationMentions = (card.jobAbbreviation.semanticText?.match(new RegExp(`(?:^|[^A-Z0-9])${escapedAbbreviation}(?=$|[^A-Z0-9])`, "gi")) ?? []).length;
  const checks = {
    masterMatches: card.attributes.template === item.master,
    ratioAttributeMatches: card.attributes.ratio === item.ratio,
    ratioGeometryMatches: Math.abs(actualRatio - (expectedRatio[0] / expectedRatio[1])) < 0.015,
    jobIdMatches: card.attributes.jobId === item.jobId,
    localizedFullJobNameMatches: card.jobName.text === ready.expectedJobName,
    canonicalAbbreviationMatches: card.jobAbbreviation.text === expectedAbbreviation,
    exactlyOneAbbreviationNode: card.jobAbbreviationElementCount === 1,
    exactlyOneVisibleAbbreviation: visibleAbbreviationMentions === 1,
    markSourceMatchesExpectedClass: sourceMatches,
    visibleMarkPresent: card.visibleMarkCount > 0,
    noDuplicateMarks: card.duplicateMarkCount === 0,
    allImagesDecoded: imagesDecoded,
    opticalNameReady: card.opticalNames.length > 0 && card.opticalNames.every((name) => name.ready),
    characterAndJobNameDoNotOverlap: !nameJobOverlap,
    productionCardVisible: card.visible && card.rect.width > 0 && card.rect.height > 0,
  };
  return {
    checks,
    pass: Object.values(checks).every(Boolean),
    diagnostics: {
      expectedRatio: expectedRatio[0] / expectedRatio[1],
      actualRatio,
      expectedJobName: ready.expectedJobName,
      actualJobName: card.jobName.text,
      expectedAbbreviation,
      actualAbbreviation: card.jobAbbreviation.text,
      visibleAbbreviationText: card.jobAbbreviation.visibleText,
      semanticAbbreviationText: card.jobAbbreviation.semanticText,
      excludedDecorativeLayer: card.jobAbbreviation.excludedMaterialLayer,
      visibleAbbreviationMentions,
      sourceClass: item.sourceClass,
      expectedSourceAliases,
      actualMarkSources: card.marks.map((mark) => mark.source),
      nameJobOverlap,
    },
  };
}

try {
  await setViewportAndMedia(client, {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    mobile: false,
    colorScheme: manifest.colorScheme ?? "dark",
    reducedMotion: "no-preference",
  });
  const navigation = await navigateAndAssert(client, targetUrl, viewport);
  await waitForPhase303Api(client);

  const environment = await (async () => {
    const result = await client.send("Runtime.evaluate", {
      expression: "({url:location.href,visibility:document.visibilityState,hasFocus:document.hasFocus(),width:innerWidth,height:innerHeight,devicePixelRatio,locale:document.documentElement.lang,userAgent:navigator.userAgent})",
      returnByValue: true,
    });
    return result.result?.value ?? {};
  })();

  for (const item of manifest.cases) {
    if (item.capture === false) {
      skipped += 1;
      continue;
    }
    const reportPath = path.join(rawRoot, `${String(item.caseId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.json`);
    try {
      await access(reportPath);
      if (!force) throw new Error(`Evidence already exists; pass --force to overwrite: ${path.relative(root, reportPath)}`);
    } catch (error) {
      if (error?.code !== "ENOENT" && !String(error.message).startsWith("Evidence already exists;")) throw error;
      if (String(error.message).startsWith("Evidence already exists;") && !force) throw error;
    }

    const foreground = await assertForeground(client, viewport);
    const ready = await applyProductionCase(client, {
      caseId: item.caseId,
      master: item.master,
      jobId: item.jobId,
      ratio: item.ratio,
      locale: item.locale,
      characterName: item.characterName,
    });
    const checks = makeChecks(item, ready);
    const preview = await captureProductionPreview(client, item.caseId, { scale: 1 });
    const exports = [];
    for (const output of item.exports ?? []) {
      exports.push(await renderProductionExport(client, {
        caseId: item.caseId,
        format: output.format,
        scale: output.scale,
      }));
    }

    const report = {
      schema: "phase303-production-card-case-v1",
      stage: manifest.stage,
      caseId: item.caseId,
      case: item,
      source: manifest.source,
      protocol: {
        url: targetUrl,
        environment,
        foreground,
        navigation,
        viewport,
        renderer: "actual production CardPreview and renderCardBlob; QA API changes data props only; no card DOM reparenting or card CSS overrides",
      },
      readiness: ready.readiness,
      productionCard: ready.card,
      expected: {
        localizedJobName: ready.expectedJobName,
        canonicalAbbreviation: ready.expectedAbbreviation,
      },
      preview,
      exports,
      checks,
      recordedAt: new Date().toISOString(),
    };
    const relativeReport = await writeProductionCaseReport(item.caseId, report);
    captured += 1;
    if (!checks.pass) failedCases.push({ caseId: item.caseId, failedChecks: Object.entries(checks.checks).filter(([, pass]) => !pass).map(([name]) => name), diagnostics: checks.diagnostics });
    console.log(JSON.stringify({ caseId: item.caseId, pass: checks.pass, report: relativeReport, exports: exports.length }));
  }

  const summary = {
    schema: "phase303-qa-run-summary-v1",
    manifest: manifestName,
    stage: manifest.stage,
    url: targetUrl,
    viewport,
    caseCount: manifest.cases.length,
    captured,
    skipped,
    failed: failedCases.length,
    failedCases,
    recordedAt: new Date().toISOString(),
  };
  const summaryPath = path.join(evidenceRoot, manifestName.replace(/\.json$/i, "-run-summary.json"));
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ summary: path.relative(root, summaryPath), captured, skipped, failed: failedCases.length }, null, 2));
  if (failedCases.length) process.exitCode = 1;
} finally {
  client.close();
}

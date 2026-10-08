import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const expectedFixture = {
  id: "builtin-coner-cinematic-4:5",
  name: "Coner",
  template: "cinematic",
  ratio: "4:5",
  imageUrl: "/assets/samples/coner/optimized/portrait.webp",
  resetKeys: [
    "ff14-adventurer-card:draft:v3",
    "ff14-adventurer-card:draft:v2",
    "ff14-adventurer-card:draft:v1",
    "ff14-adventurer-card:draft:recovery",
  ],
};

function quantile(values, percentile) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return Math.round(value * 100) / 100;
}

function summarize(values) {
  return { n: values.filter(Number.isFinite).length, p50: quantile(values, 0.5), p95: quantile(values, 0.95) };
}

function assertExportFixture(report, stage) {
  const rows = report.performanceSamples ?? [];
  if (rows.length !== 30 || report.performanceSummaries?.length !== 10) {
    throw new Error(stage + " export-only report must contain 10 cohorts × 3 samples.");
  }
  const keys = new Set();
  for (const row of rows) {
    keys.add([row.viewport, row.theme].join("|"));
    if (
      row.route !== "export" ||
      row.pageVisibility !== "visible" ||
      row.pageHasFocus !== true ||
      row.exportFixtureId !== expectedFixture.id ||
      row.exportFixture?.name !== expectedFixture.name ||
      row.exportFixture?.template !== expectedFixture.template ||
      row.exportFixture?.ratio !== expectedFixture.ratio ||
      row.exportFixture?.imageUrl !== expectedFixture.imageUrl ||
      !expectedFixture.resetKeys.every((key) => row.exportDraftReset?.clearedKeys?.includes(key))
    ) {
      throw new Error(stage + " export fixture/input assertion failed: " + JSON.stringify(row));
    }
  }
  if (keys.size !== 10) throw new Error(stage + " export report is missing one or more viewport/theme cohorts.");
}

function sortRows(rows) {
  const routeOrder = new Map([["home", 0], ["templates", 1], ["export", 2]]);
  const viewportOrder = new Map([["390x844", 0], ["768x1024", 1], ["1280x800", 2], ["1440x900", 3], ["1920x1080", 4]]);
  const themeOrder = new Map([["dark", 0], ["light", 1]]);
  return rows.sort((left, right) =>
    (routeOrder.get(left.route) ?? 99) - (routeOrder.get(right.route) ?? 99) ||
    (viewportOrder.get(left.viewport) ?? 99) - (viewportOrder.get(right.viewport) ?? 99) ||
    (themeOrder.get(left.theme) ?? 99) - (themeOrder.get(right.theme) ?? 99) ||
    left.sample - right.sample);
}

function makeSummaries(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.route, row.viewport, row.theme].join("|");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups].map(([key, items]) => {
    const [route, viewport, theme] = key.split("|");
    return {
      route, viewport, theme, locale: "ko", samples: items.length,
      responseStartMs: summarize(items.map((item) => item.responseStartMs)),
      domContentLoadedMs: summarize(items.map((item) => item.domContentLoadedMs)),
      loadMs: summarize(items.map((item) => item.loadMs)),
      lcpMs: summarize(items.map((item) => item.lcpMs)),
      cls: summarize(items.map((item) => item.cls)),
      horizontalOverflowCount: items.filter((item) => item.horizontalOverflow).length,
    };
  });
}

function csvRow(row) {
  return [
    row.route, row.viewport, row.theme, row.locale, row.sample, row.pageVisibility, row.pageHasFocus,
    row.actualViewportWidth, row.actualViewportHeight, row.exportFixtureId ?? "",
    row.exportFixture?.name ?? "", row.exportFixture?.template ?? "", row.exportFixture?.ratio ?? "",
    row.exportFixture?.imageUrl ?? "", row.responseStartMs, row.domContentLoadedMs, row.loadMs, row.lcpMs,
    row.cls, row.horizontalOverflow, row.resourceCount, row.resourceTransferBytes,
  ].join(",");
}

for (const stage of ["before", "after"]) {
  const directory = path.join(qaRoot, stage === "before" ? "baseline" : "after");
  const canonicalPath = path.join(directory, "browser-report.json");
  const exportPath = path.join(directory, "export-only-browser-report.json");
  const canonical = JSON.parse(await readFile(canonicalPath, "utf8"));
  const exportReport = JSON.parse(await readFile(exportPath, "utf8"));
  if (canonical.application.productionBuildId !== exportReport.application.productionBuildId) {
    throw new Error(stage + " export-only report build ID does not match the full report.");
  }
  assertExportFixture(exportReport, stage);
  const exportRows = exportReport.performanceSamples;
  const mergedRows = sortRows([
    ...canonical.performanceSamples.filter((row) => row.route !== "export"),
    ...exportRows,
  ]);
  const exportScreenshotRows = exportReport.screenshots.filter((row) => row.route === "export");
  if (exportScreenshotRows.length !== 3) throw new Error(stage + " export-only screenshot set is incomplete.");
  const mergedScreenshots = [
    ...canonical.screenshots.filter((row) => row.route !== "export"),
    ...exportScreenshotRows,
  ];
  canonical.performanceSamples = mergedRows;
  canonical.performanceSummaries = makeSummaries(mergedRows);
  canonical.screenshots = mergedScreenshots;
  const initialForegroundAssertions = canonical.protocol.foregroundAssertionsPassed ?? 0;
  const exportForegroundAssertions = exportReport.protocol.foregroundAssertionsPassed ?? 0;
  canonical.protocol.originalFullRunForegroundAssertions = initialForegroundAssertions;
  canonical.protocol.exportOnlyForegroundAssertions = exportForegroundAssertions;
  canonical.protocol.foregroundAssertionsPassed = initialForegroundAssertions + exportForegroundAssertions;
  canonical.protocol.fullMeasuredRoutes = ["home", "templates", "export"];
  canonical.protocol.exportFixtureRemeasurement = {
    fixtureId: expectedFixture.id,
    card: expectedFixture.name + " / C2 Cinematic / " + expectedFixture.ratio + " / portrait",
    imageUrl: expectedFixture.imageUrl,
    draftKeysResetBeforeEveryExportNavigation: expectedFixture.resetKeys,
    exportCohorts: 10,
    exportSamples: exportRows.length,
    foregroundAssertionsPassed: exportForegroundAssertions,
    sourceReport: stage + "/export-only-browser-report.json",
    mergedAt: new Date().toISOString(),
    priorFullRunExportRows: "Preserved in legacy-unmatched-export-fixture/ and excluded from this comparison.",
  };
  canonical.exportFixtureRemeasurement = canonical.protocol.exportFixtureRemeasurement;
  await writeFile(canonicalPath, JSON.stringify(canonical, null, 2) + "\n");
  const header = "route,viewport,theme,locale,sample,pageVisibility,pageHasFocus,actualViewportWidth,actualViewportHeight,exportFixtureId,exportName,exportTemplate,exportRatio,exportImageUrl,responseStartMs,domContentLoadedMs,loadMs,lcpMs,cls,horizontalOverflow,resourceCount,resourceTransferBytes";
  const csv = [header, ...mergedRows.map(csvRow)].join("\n") + "\n";
  await writeFile(path.join(directory, "performance-samples.csv"), csv);
  await writeFile(path.join(directory, "performance-progress.json"), JSON.stringify({
    schema: "phase300-performance-progress-v2",
    updatedAt: new Date().toISOString(),
    stage, baseUrl: canonical.application.baseUrl, trialsPerCohort: canonical.protocol.trialsPerCohort,
    completedCohorts: canonical.performanceSummaries.map(({ route, viewport, theme, locale, samples }) => ({ route, viewport, theme, locale, samples })),
    performanceSamples: mergedRows,
    exportFixtureRemeasurement: canonical.protocol.exportFixtureRemeasurement,
  }, null, 2) + "\n");
  console.log(JSON.stringify({ stage, buildId: canonical.application.productionBuildId, samples: mergedRows.length, cohorts: canonical.performanceSummaries.length, exportScreenshots: exportScreenshotRows.map((row) => row.file), fixture: expectedFixture.id }, null, 2));
}

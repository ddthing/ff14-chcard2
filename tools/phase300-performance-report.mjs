import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const beforePath = path.join(qaRoot, "baseline", "browser-report.json");
const afterPath = path.join(qaRoot, "after", "browser-report.json");
const provenancePath = path.join(qaRoot, "baseline-build-provenance.json");
const before = JSON.parse(await readFile(beforePath, "utf8"));
const afterCandidate = await readFile(afterPath, "utf8").then((text) => JSON.parse(text)).catch(() => null);
const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
const homeQa = await readFile(path.join(qaRoot, "home-template-qa.json"), "utf8").then((text) => JSON.parse(text)).catch(() => null);
const entryQa = await readFile(path.join(qaRoot, "after", "entry-export-functional-report.json"), "utf8").then((text) => JSON.parse(text)).catch(() => null);

function hasForegroundProof(report) {
  return report?.protocol?.foregroundedOnEveryNavigation === true &&
    report.protocol.visibilityAndFocusAsserted === true &&
    report.protocol.actualViewportAsserted === true &&
    Array.isArray(report.performanceSamples) && report.performanceSamples.length > 0 &&
    report.performanceSamples.every((sample) => sample.pageVisibility === "visible" && sample.pageHasFocus === true &&
      Number.isFinite(sample.actualViewportWidth) && Number.isFinite(sample.actualViewportHeight));
}

if (!hasForegroundProof(before)) {
  const destination = path.join(qaRoot, "PERFORMANCE.md");
  await writeFile(destination, [
    "# Phase 3.0 performance",
    "",
    "The final foreground-asserted before/after cohorts are pending. The initial reports did not record page visibility, focus, or actual viewport dimensions and are preserved under legacy-unfocused/ for audit history only.",
    "",
    "Do not use legacy-unfocused measurements as the final comparison. Re-run phase300-cdp-qa.mjs against the reconstructed baseline and final production build with the foreground-asserting harness before publishing performance conclusions.",
    "",
  ].join("\n"));
  console.log(path.relative(root, destination) + " (foreground cohorts pending)");
  process.exit(0);
}
const after = hasForegroundProof(afterCandidate) ? afterCandidate : null;

function formatPair(value, unit = "ms") {
  if (!value || value.p50 === null || value.p95 === null) return "—";
  const digits = unit === "ms" ? 1 : 4;
  return value.p50.toFixed(digits) + " / " + value.p95.toFixed(digits);
}

function delta(beforeValue, afterValue, unit = "ms") {
  if (!beforeValue || !afterValue || beforeValue.p50 === null || afterValue.p50 === null) return "—";
  const difference = afterValue.p50 - beforeValue.p50;
  const rounded = difference.toFixed(unit === "ms" ? 1 : 4);
  const percent = beforeValue.p50 === 0 ? "" : " (" + ((difference / beforeValue.p50) * 100).toFixed(1) + "%)";
  return (difference > 0 ? "+" : "") + rounded + percent;
}

const afterByKey = new Map((after?.performanceSummaries ?? []).map((row) => [
  [row.route, row.viewport, row.theme].join("|"), row,
]));
const lines = [
  "# Phase 3.0 performance",
  "",
  after
    ? "Production lab measurements for the frozen pre-change build and the current Phase 3.0 build."
    : afterCandidate
      ? "Foreground-asserted measurements for the frozen pre-change build. The existing after report is excluded because it lacks visibility, focus, and actual viewport assertions."
      : "Production lab measurements for the frozen pre-change build. The paired after-run has not been recorded yet.",
  "",
  "The browser used device scale factor 1 and no CPU or network throttling. Each route / viewport / theme cohort has one warmup followed by " +
    before.protocol.trialsPerCohort + " measured visits; the Chrome profile retained its HTTP cache across cohorts.",
  "Every measured navigation was brought to the foreground and checked for visible document state, focused page state, and the requested innerWidth / innerHeight before its sample was accepted.",
  "Foreground/page-size assertions passed on " + before.protocol.foregroundAssertionsPassed + " before navigations and " + (after?.protocol.foregroundAssertionsPassed ?? "pending") + " after navigations.",
  ...(after?.protocol.exportFixtureRemeasurement ? [
    "Export rows were remeasured separately after clearing only the editor v3/v2/v1/recovery draft keys before each /export visit; both builds rendered " + after.protocol.exportFixtureRemeasurement.card + " from " + after.protocol.exportFixtureRemeasurement.imageUrl + ". Home/Templates samples remain from the full foreground runs; the earlier unmatched Export rows are archived under legacy-unmatched-export-fixture/.",
  ] : []),
  "",
  "The table reports p50 / p95. Percentiles use linear interpolation; with three samples, p95 is only a directional upper tail.",
  "Load and LCP values are milliseconds; CLS is unitless.",
  "",
  "## Route cohorts",
  "",
  after
    ? "| Page | Viewport | Theme | Before load | After load | Load Δ p50 | Before LCP | After LCP | LCP Δ p50 | Before CLS | After CLS |"
    : "| Page | Viewport | Theme | Load p50 / p95 (ms) | LCP p50 / p95 (ms) | CLS p50 / p95 | Horizontal overflow |",
  after
    ? "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|"
    : "|---|---:|---|---:|---:|---:|---:|",
];
for (const beforeRow of before.performanceSummaries) {
  const key = [beforeRow.route, beforeRow.viewport, beforeRow.theme].join("|");
  const afterRow = afterByKey.get(key);
  if (after) {
    lines.push("| " + beforeRow.route + " | " + beforeRow.viewport + " | " + beforeRow.theme +
      " | " + formatPair(beforeRow.loadMs) + " | " + formatPair(afterRow?.loadMs) +
      " | " + delta(beforeRow.loadMs, afterRow?.loadMs) +
      " | " + formatPair(beforeRow.lcpMs) + " | " + formatPair(afterRow?.lcpMs) +
      " | " + delta(beforeRow.lcpMs, afterRow?.lcpMs) +
      " | " + formatPair(beforeRow.cls, "cls") + " | " + formatPair(afterRow?.cls, "cls") + " |");
  } else {
    lines.push("| " + beforeRow.route + " | " + beforeRow.viewport + " | " + beforeRow.theme +
      " | " + formatPair(beforeRow.loadMs) + " | " + formatPair(beforeRow.lcpMs) +
      " | " + formatPair(beforeRow.cls, "cls") + " | " + beforeRow.horizontalOverflowCount + " / " + beforeRow.samples + " |");
  }
}
lines.push(
  "",
  "## Scroll and locale checks",
  "",
  "- Before scroll sample: " + before.scrollFrameReport.frames + " requestAnimationFrame intervals; p50 / p95 " +
    formatPair(before.scrollFrameReport.intervalMs) + " ms; " + before.scrollFrameReport.over16_7ms +
    " intervals exceeded 16.7 ms and " + before.scrollFrameReport.over50ms + " exceeded 50 ms.",
  ...(after ? [
    "- After scroll sample: " + after.scrollFrameReport.frames + " requestAnimationFrame intervals; p50 / p95 " +
      formatPair(after.scrollFrameReport.intervalMs) + " ms; " + after.scrollFrameReport.over16_7ms +
      " intervals exceeded 16.7 ms and " + after.scrollFrameReport.over50ms + " exceeded 50 ms.",
  ] : []),
  "- Before locale smoke: " + before.localeValidation.filter((row) => row.htmlLang === row.locale && !row.horizontalOverflow).length +
    " of " + before.localeValidation.length + " route/locale checks matched the document language without horizontal overflow.",
);
const stackCheck = homeQa?.interactionChecks?.find((check) => check.name === "hero-card-stack-cycle");
const compareCheck = homeQa?.interactionChecks?.find((check) => check.name === "accessible-before-after-range");
const templateCheck = homeQa?.interactionChecks?.find((check) => check.name === "template-selection-to-editor");
const fullScrollCheck = homeQa?.interactionChecks?.find((check) => check.name === "home-full-page-down-up-and-lazy-remount");
const homeMatchesAfter = Boolean(after && homeQa?.application?.buildId === after.application.productionBuildId);
const entryMatchesAfter = Boolean(after && entryQa?.application?.productionBuildId === after.application.productionBuildId);
const fullScrollFrame = fullScrollCheck?.frameIntervals ?? {};
lines.push("", "## Interaction probes", "");
if (homeMatchesAfter && stackCheck) {
  lines.push("- Home card-stack pointer to visible state change: " + stackCheck.pointerNextMs + " ms and " + stackCheck.pointerNextAgainMs + " ms; these are harness state-change waits, not field INP. EventTiming rows captured at the observer's 16 ms threshold: " + (stackCheck.eventTimingEntries?.length ?? 0) + ".");
  lines.push("- Before/after range: " + (compareCheck?.states ?? []).map((row) => "card " + row.targetValue + "% / original screenshot " + row.actualOriginalWidthPercent + "%").join(", ") + "; accessible value after switching to EN: " + (compareCheck?.afterLocaleSwitch?.ariaValueText ?? "not recorded") + ".");
  lines.push("- Template-to-Editor navigation ready: " + (templateCheck?.editorReadyMs ?? "not recorded") + " ms; selected template: " + (templateCheck?.editorTemplate ?? "not recorded") + ".");
  lines.push("- Full Home down/up scroll: reached bottom " + Boolean(fullScrollCheck?.reachedBottom) + ", returned to top " + Boolean(fullScrollCheck?.returnedToTop) + ", story observed " + Boolean(fullScrollCheck?.storyObservedDuringDown) + "; " + (fullScrollFrame.samples ?? 0) + " rAF intervals, p50/p95 " + formatPair({ p50: fullScrollFrame.p50Ms ?? null, p95: fullScrollFrame.p95Ms ?? null }) + " ms, " + (fullScrollFrame.over16_7ms ?? 0) + " >16.7 ms and " + (fullScrollFrame.over50ms ?? 0) + " >50 ms.");
} else {
  lines.push("- Home interaction proxies are pending or belong to a different build; no current-build pointer or route latency is claimed.");
}
if (entryMatchesAfter && entryQa) {
  const completedDownloads = (entryQa.downloads ?? []).filter((row) => row.progressState === "completed");
  lines.push("- Create upload states: " + (entryQa.upload?.stateEvents ?? []).map((row) => row.state).join(" → ") + "; saved-draft cancel restored focus: " + Boolean(entryQa.savedDraftConfirmation?.focusRestored) + ".");
  lines.push("- Editor-to-Export workflow total probe wall time: " + (entryQa.editorToExport?.elapsedMs ?? "not recorded") + " ms, including route navigation, settling, and screenshot capture; this is not isolated navigation or animation latency. Completed downloads: " + completedDownloads.map((row) => row.format.toUpperCase() + " " + row.dimensions.width + "×" + row.dimensions.height).join(", ") + ".");
  lines.push("- Full upload/draft/print functional run build: " + (entryQa.functionalRunBuildId ?? "not recorded") + "; final visual recapture builds: " + (entryQa.visualRecaptureBuildIds ?? [after.application.productionBuildId]).join(", ") + ". Later changes to these surfaces were presentation CSS/marketing updates; the editor, store, and export implementation remained unchanged.");
} else {
  lines.push("- Create/export interaction and download outcomes are pending final-build evidence; no current-build interaction latency is claimed.");
}
lines.push(
  "",
  "## Build and browser",
  "",
  "- Before: " + provenance.framework + ", build mode " + before.application.buildMode +
    ", build ID " + (before.application.productionBuildId ?? "unavailable") + "; rebuilt from the archived source snapshot.",
  after
    ? "- After: build mode " + after.application.buildMode + ", build ID " + (after.application.productionBuildId ?? "unavailable") + "."
    : "- After: pending.",
  "- Browser: " + before.browser.product + ".",
  "- Both builds used NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED=true; job-icon-build-parity.json confirms loaded xivapi-svg job icons in both production builds.",
  "- Frozen source/config snapshots and the CSS workaround are preserved in docs/qa/phase300/baseline-build-provenance.json; the temporary baseline tree will be removed after paired capture.",
  "- Before build workaround: the original Export CSS Module failed production compilation on two print-only global selectors. The QA copy removed only those selectors; regular screen styling is unchanged.",
  "- The final source freeze records the narrowly authorized WebP header-prefix parser fix separately from the protected renderer/export engine; baseline/after provenance will identify the exact build IDs.",
);
if (after && before.application.buildMode !== after.application.buildMode) {
  lines.push("- Compiler caveat: before and after use different build modes (" + before.application.buildMode + " vs " + after.application.buildMode + "); treat the timing difference as directional.");
}
if (after) {
  const beforeTemplatesDark = beforeByKey("templates", "1440x900", "dark");
  const afterTemplatesDark = afterByKey.get("templates|1440x900|dark");
  const beforeTemplatesLight = beforeByKey("templates", "1440x900", "light");
  const afterTemplatesLight = afterByKey.get("templates|1440x900|light");
  const darkDelta = afterTemplatesDark?.lcpMs?.p50 - beforeTemplatesDark?.lcpMs?.p50;
  const lightDelta = afterTemplatesLight?.lcpMs?.p50 - beforeTemplatesLight?.lcpMs?.p50;
  const maxTemplateP95 = Math.max(...(after.performanceSummaries
    .filter((row) => row.route === "templates")
    .map((row) => row.lcpMs.p95)
    .filter(Number.isFinite)));
  if (Number.isFinite(darkDelta) && Number.isFinite(lightDelta)) {
    const trend = (value) => value > 0 ? "rose " + value.toFixed(0) : value < 0 ? "fell " + Math.abs(value).toFixed(0) : "was unchanged";
    lines.push("- Observed LCP change: Templates desktop p50 " + trend(darkDelta) +
      " ms in Dark and " + trend(lightDelta) + " ms in Light; the largest Templates p95 was " +
      maxTemplateP95.toFixed(1) + " ms in these warmed local cohorts.");
  }
}
lines.push(
  "",
  "## Measurement limits",
  "",
  "- LCP and CLS come from buffered browser PerformanceObservers on one local document load; they are lab observations, not field Web Vitals.",
  "- This report does not claim a field INP value; state-change and export-completion probes below are kept separate from NavigationTiming and LCP.",
  "- Pointer-to-state-change waits are local harness proxies; they are not field INP. requestAnimationFrame intervals do not measure compositor presentation or GPU timing and are not a 60 fps guarantee.",
  "- The isolated headless Chrome profile warms fonts and assets between cohorts. First-sample cold-cache performance is not represented.",
  "- Local Windows CPU and I/O contention can affect timings; baseline and after cohorts should be run separately from production builds.",
  "",
  "Artifacts: baseline/browser-report.json, baseline/performance-samples.csv, and the screenshots listed by the browser report.",
  "",
);
const destination = path.join(qaRoot, "PERFORMANCE.md");
await writeFile(destination, lines.join("\n"));
console.log(path.relative(root, destination));

function beforeByKey(route, viewport, theme) {
  return before.performanceSummaries.find((row) => row.route === route && row.viewport === viewport && row.theme === theme);
}

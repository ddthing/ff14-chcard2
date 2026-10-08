import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const finalScreenshotNames = [
  "01-home-dark-desktop.png", "02-home-light-desktop.png", "03-home-mobile-dark.png", "04-home-mobile-light.png",
  "05-hero-detail.png", "06-card-stack-states.png", "07-before-after.png", "08-master-worlds.png", "09-scroll-story.png",
  "10-templates-dark.png", "11-templates-light.png", "12-templates-mobile.png", "13-template-hover-select.png",
  "14-template-to-editor.png", "15-export-dark.png", "16-export-light.png", "17-export-mobile.png",
  "18-editor-to-export.png", "19-export-success.png", "20-web-experience-board.png",
];
const reportNames = [
  "baseline/browser-report.json", "baseline/performance-samples.csv", "after/browser-report.json", "after/performance-samples.csv",
  "baseline/export-only-browser-report.json", "baseline/export-only-performance-samples.csv",
  "after/export-only-browser-report.json", "after/export-only-performance-samples.csv",
  "home-template-qa.json", "home-scroll-cadence.json", "responsive-visual-audit.json", "accessibility-audit.json",
  "theme-isolation-audit.json", "job-icon-build-parity.json", "source-freeze-diff.json", "baseline-build-provenance.json",
  "baseline-restoration.json", "landmark-role-img-probe.json", "create-footer-opacity-probe.json",
  "identity-world-observer-failure.json", "identity-world-observer-trace.json",
  "reduced-motion-qa.json",
  "after/entry-export-functional-report.json", "after/create-entry-recapture-report.json",
  "after/entry-export-visual-recapture-report.json", "PERFORMANCE.md",
  "legacy-unfocused/README.md", "legacy-unmatched-export-fixture/README.md",
];

const readJson = async (relative) => JSON.parse(await readFile(path.join(qaRoot, relative), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function describeFile(relative) {
  const absolute = path.join(qaRoot, relative);
  const bytes = await readFile(absolute);
  return { file: relative.replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) };
}

const [before, after, home, responsive, axe, theme, icons, source, provenance, entry, motion] = await Promise.all([
  readJson("baseline/browser-report.json"),
  readJson("after/browser-report.json"),
  readJson("home-template-qa.json"),
  readJson("responsive-visual-audit.json"),
  readJson("accessibility-audit.json"),
  readJson("theme-isolation-audit.json"),
  readJson("job-icon-build-parity.json"),
  readJson("source-freeze-diff.json"),
  readJson("baseline-build-provenance.json"),
  readJson("after/entry-export-functional-report.json"),
  readJson("motion/motion-manifest.json"),
]);

const finalScreenshots = [];
for (const name of finalScreenshotNames) finalScreenshots.push(await describeFile(name));
const reducedMotion = await readJson("reduced-motion-qa.json");
const reducedMotionScreenshots = await Promise.all(reducedMotion.screenshots.map((image) => describeFile(image.file)));
const matrixContact = await describeFile("30-viewport-matrix.png");
const matrixImages = await Promise.all(responsive.cases.map((item) => describeFile(item.screenshot.replaceAll("\\", "/"))));
const motionFrames = await Promise.all(motion.frames.map(async (frame) => {
  const file = (frame.file ?? frame.frame).replaceAll("\\", "/");
  return { ...(await describeFile(file)), group: frame.group, offsetMs: frame.offsetMs };
}));
const reportFiles = [];
for (const name of reportNames) {
  const relative = name.replaceAll("\\", "/");
  const exists = await stat(path.join(qaRoot, relative)).then(() => true).catch(() => false);
  if (exists) reportFiles.push(await describeFile(relative));
}
const fullScroll = home.interactionChecks.find((check) => check.name === "home-full-page-down-up-and-lazy-remount");

const manifest = {
  schema: "phase300-final-qa-manifest-v1",
  generatedAt: new Date().toISOString(),
  browser: after.browser.product,
  officialAssetsBuildFlag: "NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED=true",
  builds: {
    before: {
      buildId: before.application.productionBuildId,
      framework: provenance.framework,
      mode: before.application.buildMode,
      foregroundAssertionsPassed: before.protocol.foregroundAssertionsPassed,
      sampleCount: before.performanceSamples.length,
      cohortCount: before.performanceSummaries.length,
    },
    after: {
      buildId: after.application.productionBuildId,
      framework: provenance.framework,
      mode: after.application.buildMode,
      foregroundAssertionsPassed: after.protocol.foregroundAssertionsPassed,
      sampleCount: after.performanceSamples.length,
      cohortCount: after.performanceSummaries.length,
    },
    frozenSource: {
      protectedFilesExact: source.exactProtected,
      baselineCoverageComplete: source.completeBaselineCoverage,
      protectedChanged: source.protectedChanges.length,
      authorizedBugFixes: source.authorizedBugFixes.map((item) => item.path),
      unclassifiedChanges: source.unclassifiedChanges.length + source.unclassifiedAdded.length + source.unclassifiedRemoved.length,
    },
  },
  verification: {
    homeInteractions: { checks: home.interactionChecks.length, failed: home.interactionChecks.filter((check) => !check.pass).length, motionFrameCount: home.motion.frameCount },
    fullHomeScroll: {
      pass: fullScroll.pass,
      reachedBottom: fullScroll.reachedBottom,
      returnedToTop: fullScroll.returnedToTop,
      storyObserved: fullScroll.storyObservedDuringDown,
      frameIntervals: fullScroll.frameIntervals,
    },
    responsive: {
      cases: responsive.cases.length,
      pageHorizontalOverflow: responsive.pageHorizontalOverflowCount,
      clippedCardText: responsive.clippedCardTextCount,
      ratioMismatches: responsive.ratioMismatchCount,
    },
    accessibility: { pages: axe.pageCount, violations: axe.violationCount },
    themeIsolation: {
      styleRows: theme.dark.cards.reduce((count, card) => count + card.nodes.length, 0),
      differences: theme.styleDifferences.length,
      editorReferenceExactAcrossThemes: theme.frozenEditorReference.exactAcrossThemes,
    },
    jobIconParity: {
      pass: icons.pass,
      builds: icons.samples.map((sample) => ({ stage: sample.stage, buildId: sample.buildId, loadedOfficialIcons: sample.loadedOfficialIconCount, sources: sample.officialSources })),
    },
    createExport: {
      buildId: entry.application.productionBuildId,
      uploadStates: entry.upload.stateEvents.map((event) => event.state),
      savedDraftFocusRestored: entry.savedDraftConfirmation.focusRestored,
      editorToExportMs: entry.editorToExport.elapsedMs,
      downloads: entry.downloads.map((download) => ({ format: download.format, dimensions: download.dimensions, completed: download.progressState === "completed" })),
      printRatioPass: entry.print.ratioCheckPassed,
    },
    reducedMotion: {
      cases: reducedMotion.cases.length,
      caseChecksPassed: reducedMotion.summary.caseChecksPassed,
      homeScrollPass: reducedMotion.summary.homeScrollPass,
      ordinaryNavigationPass: reducedMotion.summary.ordinaryNavigationPass,
      screenshotCount: reducedMotionScreenshots.length,
    },
    exportFixtureMatched: {
      id: after.protocol.exportFixtureRemeasurement?.fixtureId ?? null,
      card: after.protocol.exportFixtureRemeasurement?.card ?? null,
      imageUrl: after.protocol.exportFixtureRemeasurement?.imageUrl ?? null,
      resetKeys: after.protocol.exportFixtureRemeasurement?.draftKeysResetBeforeEveryExportNavigation ?? [],
      baselineSamples: JSON.parse(await readFile(path.join(qaRoot, "baseline", "export-only-browser-report.json"), "utf8")).performanceSamples.length,
      finalSamples: JSON.parse(await readFile(path.join(qaRoot, "after", "export-only-browser-report.json"), "utf8")).performanceSamples.length,
      archivedUnmatchedRuns: "legacy-unmatched-export-fixture/",
    },
  },
  screenshots: finalScreenshots,
  reducedMotionScreenshots,
  responsiveMatrix: { contactSheet: matrixContact, cases: matrixImages },
  motion: { manifest: "motion/motion-manifest.json", frames: motionFrames },
  reports: reportFiles,
  legacyUnfocusedArchive: "legacy-unfocused/ (retained for audit history; excluded from final comparison)",
  limitations: [
    "Local Windows Chrome lab, warm HTTP cache, and no CPU/network throttling.",
    "Three samples per cohort make p95 a directional upper tail.",
    "requestAnimationFrame cadence is not a compositor/GPU trace or a 60 fps guarantee.",
    "No field INP or physical-device browser result is claimed.",
  ],
};
await writeFile(path.join(qaRoot, "qa-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ manifest: "docs/qa/phase300/qa-manifest.json", before: manifest.builds.before.buildId, after: manifest.builds.after.buildId, screenshots: finalScreenshots.length, matrixCases: matrixImages.length, motionFrames: motionFrames.length }, null, 2));

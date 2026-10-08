import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase303-job-lock");
await mkdir(evidenceRoot, { recursive: true });

const masters = [
  { id: "cinematic", code: "c2" },
  { id: "editorial", code: "e2" },
  { id: "id-card", code: "i3" },
];
const jobs = ["red-mage", "dragoon", "gunbreaker", "white-mage", "black-mage", "astrologian", "reaper", "beastmaster"];
const sourceClassByJob = {
  "red-mage": "xivapi-svg",
  dragoon: "xivapi-svg",
  gunbreaker: "xivapi-svg",
  "white-mage": "xivapi-svg",
  "black-mage": "xivapi-svg",
  astrologian: "fan-kit",
  reaper: "xivapi-raster",
  beastmaster: "generic-fallback",
};
const exportSourceJobs = new Set(["red-mage", "astrologian", "reaper", "beastmaster"]);
const ratios = ["1:1", "4:5", "3:4", "9:16", "16:9"];
const locales = [
  { id: "en", name: "Coner", nameKey: "coner-en" },
  { id: "ko", name: "코너", nameKey: "coner-ko" },
  { id: "ja", name: "コナー", nameKey: "coner-ja" },
];
const allFourExports = [
  { format: "png", scale: 1 },
  { format: "png", scale: 2 },
  { format: "png", scale: 4 },
  { format: "webp", scale: 2 },
];
const pngAllScales = [1, 2, 4].map((scale) => ({ format: "png", scale }));
const png2xOnly = [{ format: "png", scale: 2 }];
const id = (prefix, master, jobId, ratio, locale, nameKey) =>
  `${prefix}-${master.code}-${jobId}-${ratio.replace(":", "-")}-${locale}-${nameKey}`;
const makeCase = ({ caseId, master, jobId, ratio, locale, characterName, exports = [], capture = true, reuseCaseId = null, ...extra }) => ({
  caseId,
  master: master.id,
  jobId,
  ratio,
  locale,
  characterName,
  layoutVariant: "a",
  capture,
  ...(reuseCaseId ? { reuseCaseId } : {}),
  sourceClass: sourceClassByJob[jobId],
  preview: true,
  exports,
  ...extra,
});

const coreCases = masters.flatMap((master) => jobs.map((jobId) => makeCase({
  caseId: id("core", master, jobId, "4:5", "en", "coner"),
  master,
  jobId,
  ratio: "4:5",
  locale: "en",
  characterName: "Coner",
  exports: exportSourceJobs.has(jobId) ? allFourExports : [],
  sourceClass: sourceClassByJob[jobId],
})));

const ratioCases = masters.flatMap((master) => ["red-mage", "astrologian"].flatMap((jobId) => ratios.map((ratio) => {
  const reused = ratio === "4:5";
  const coreReference = id("core", master, jobId, "4:5", "en", "coner");
  const caseId = reused ? coreReference : id("ratio", master, jobId, ratio, "en", "coner");
  return makeCase({
    caseId,
    master,
    jobId,
    ratio,
    locale: "en",
    characterName: "Coner",
    capture: !reused,
    reuseCaseId: reused ? coreReference : null,
    exports: jobId === "astrologian" && !reused ? pngAllScales : [],
    ratioProbe: true,
  });
})));

const localeCases = masters.flatMap((master) => locales.map((locale) => {
  const reused = locale.id === "en";
  const coreReference = id("core", master, "red-mage", "4:5", "en", "coner");
  return makeCase({
    caseId: reused ? coreReference : id("locale", master, "red-mage", "4:5", locale.id, locale.nameKey),
    master,
    jobId: "red-mage",
    ratio: "4:5",
    locale: locale.id,
    characterName: locale.name,
    capture: !reused,
    reuseCaseId: reused ? coreReference : null,
    exports: !reused ? png2xOnly : [],
    localizationProbe: true,
  });
}));

const longnamesCases = masters.flatMap((master) => locales.map((locale) => makeCase({
  caseId: id("longname", master, "gunbreaker", "4:5", locale.id, "alexander"),
  master,
  jobId: "gunbreaker",
  ratio: "4:5",
  locale: locale.id,
  characterName: "Alexander",
  exports: png2xOnly,
  longNameCollisionProbe: true,
  longNameDescription: "Alexander character name plus canonical localized Gunbreaker name.",
})));

const baselineCases = masters.map((master) => makeCase({
  caseId: id("baseline", master, "red-mage", "4:5", "en", "coner"),
  master,
  jobId: "red-mage",
  ratio: "4:5",
  locale: "en",
  characterName: "Coner",
  exports: allFourExports,
  performanceProbe: true,
}));
const exportCases = coreCases.filter((item) => item.exports.length > 0).map((item) => ({
  ...item,
  capture: false,
  reuseCaseId: item.caseId,
  exportProbe: true,
}));

const manifests = [
  {
    filename: "qa-cases-baseline-performance.json",
    stage: "baseline-performance",
    purpose: "Pre-implementation baseline: production RDM at 4:5 EN Coner across C2/E2/I3, Preview plus PNG 1x/2x/4x and WebP 2x. Use one first-load and five warmed samples; record engine-reported actual dimensions and caps.",
    cases: baselineCases,
  },
  {
    filename: "qa-cases-core.json",
    stage: "production-core",
    purpose: "Eight canonical Jobs × C2/E2/I3 at 4:5 EN Coner. RDM, AST, RPR and BST also exercise all four production export variants.",
    cases: coreCases,
  },
  {
    filename: "qa-cases-exports.json",
    stage: "source-export-matrix",
    purpose: "RDM, AST, RPR and BST across C2/E2/I3 at 4:5. Export rows reuse the matching core preview case and produce PNG 1x/2x/4x plus WebP 2x; actual engine dimensions/capping are recorded.",
    cases: exportCases,
  },
  {
    filename: "qa-cases-ratios.json",
    stage: "ratio-matrix",
    purpose: "RDM and AST across C2/E2/I3 × 1:1, 4:5, 3:4, 9:16, 16:9. The 4:5 points reuse core captures; AST's new ratios exercise PNG 1x/2x/4x.",
    cases: ratioCases,
  },
  {
    filename: "qa-cases-locales.json",
    stage: "locale-matrix",
    purpose: "RDM C2/E2/I3 × EN/KO/JA at 4:5. EN Coner reuses the core capture; KO/JA use localized Coner names and PNG 2x.",
    cases: localeCases,
  },
  {
    filename: "qa-cases-longnames.json",
    stage: "long-name-collision",
    purpose: "Gunbreaker C2/E2/I3 × EN/KO/JA with the character name Alexander and the canonical localized Gunbreaker Job name at 4:5; includes PNG 2x.",
    cases: longnamesCases,
  },
];

for (const manifest of manifests) {
  const output = {
    schema: "phase303-qa-case-manifest-v1",
    stage: manifest.stage,
    route: "/phase303-qa",
    colorScheme: "dark",
    viewport: { width: 1440, height: 1120, deviceScaleFactor: 1 },
    source: "production CardPreview / Master renderer and production renderCardBlob; no QA DOM reparenting or card style overrides",
    purpose: manifest.purpose,
    caseCount: manifest.cases.length,
    captureCount: manifest.cases.filter((item) => item.capture !== false).length,
    reuseCount: manifest.cases.filter((item) => item.capture === false).length,
    cases: manifest.cases,
  };
  await writeFile(path.join(evidenceRoot, manifest.filename), JSON.stringify(output, null, 2) + "\n");
}

const oldDirectionCase = (master) => `phase302-red-mage-${master}-${master === "editorial" ? "mark-b" : "mark-c"}.png`;
const beforeAfter = {
  schema: "phase303-before-after-comparison-v1",
  purpose: "Phase 3.0.2 selected candidate direction versus the Phase303 production renderer; Phase302 images are read-only references.",
  cases: masters.map((master) => ({
    master: master.id,
    before: `../phase302-jobmark-correction/raw/${oldDirectionCase(master)}`,
    afterCaseId: id("core", master, "red-mage", "4:5", "en", "coner"),
  })),
};
await writeFile(path.join(evidenceRoot, "qa-before-after.json"), JSON.stringify(beforeAfter, null, 2) + "\n");

console.log(JSON.stringify({
  evidenceRoot: path.relative(root, evidenceRoot),
  manifests: manifests.map((manifest) => ({
    file: manifest.filename,
    stage: manifest.stage,
    cases: manifest.cases.length,
    captures: manifest.cases.filter((item) => item.capture !== false).length,
    reused: manifest.cases.filter((item) => item.capture === false).length,
  })),
  uniquePreviewCaptures: coreCases.length + ratioCases.filter((item) => item.capture !== false).length + localeCases.filter((item) => item.capture !== false).length + longnamesCases.length,
}, null, 2));

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPhase302JobMarkCases,
  buildPhase302NameAlternativeCases,
  buildPhase302OpacityCases,
  buildPhase302PlacementCases,
  buildPhase302SizeSweepCases,
  phase302NameFontByMaster,
  phase302JobCaseId,
} from "./phase302-qa-cdp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase302-jobmark-correction");
const outputPath = path.join(evidenceRoot, "board-plan.json");
const masters = ["cinematic", "editorial", "id-card"];
const jobCases = buildPhase302JobMarkCases();
const strengthCases = buildPhase302OpacityCases();
const sizeCases = buildPhase302SizeSweepCases();
const nameAlternativeCases = buildPhase302NameAlternativeCases();
const placementCases = buildPhase302PlacementCases();
const caseId = (jobId, master, variant) => phase302JobCaseId(jobId, master, variant);
const caseLookup = new Map([...jobCases, ...strengthCases, ...sizeCases, ...nameAlternativeCases, ...placementCases].map((item) => [item.id, item]));
const ref = (id, label, extra = {}) => {
  if (!caseLookup.has(id)) throw new Error(`Board plan references a missing Phase302 case: ${id}`);
  return { caseId: id, label, ...extra };
};
const rdmAbc = (master) => ["A", "B", "C"].map((variant) => ref(caseId("red-mage", master, variant), `RDM · ${variant}`, { exportFormat: "png" }));
const multiJob = (jobId) => masters.flatMap((master) => ["A", "B", "C"].map((variant) => ref(caseId(jobId, master, variant), `${master} · ${variant}`)));
const sourceCases = ["red-mage", "reaper", "astrologian", "beastmaster"].flatMap((jobId) => masters.map((master) =>
  ref(caseId(jobId, master, "B"), `${master} · ${jobId}`, { exportFormat: "png" })));
const strengthLabels = { 100: "100%", 75: "75%", 60: "60%", 45: "45%" };
const opacityTiles = strengthCases.map((item) => ref(item.id, `${item.master} · ${strengthLabels[Math.round(item.jobMark.visualStrength * 100)]}`));
const sizeTiles = sizeCases.map((item) => ref(item.id, `AST · ${item.jobMark.sizeLogicalPx} logical px`, { exportFormat: "png" }))
  .sort((left, right) => caseLookup.get(left.caseId).jobMark.sizeLogicalPx - caseLookup.get(right.caseId).jobMark.sizeLogicalPx);
const safeSizeLabels = new Map([[10, "SMALL · 10 logical px"], [14, "MEDIUM · 14 logical px"], [15.2, "LARGE-SAFE · 15.2 logical px ceiling"]]);
const safeSizeTiles = sizeTiles.filter((tile) => safeSizeLabels.has(caseLookup.get(tile.caseId).jobMark.sizeLogicalPx))
  .map((tile) => ({ ...tile, label: safeSizeLabels.get(caseLookup.get(tile.caseId).jobMark.sizeLogicalPx) }));
if (safeSizeTiles.length !== 3) throw new Error("Required size comparison must contain exactly AST 10/14/15.2 logical-px cases.");
const retainedNameTiles = nameAlternativeCases.map((item) => ref(item.id, `${item.master === "cinematic" ? "C2" : "E2"} · ${item.nameFontSet} · ${item.jobMark.variant}`));
const placementRow = [
  ref(caseId("red-mage", "editorial", "A"), "E2 · A · job row", { exportFormat: "png" }),
  ...placementCases.filter((item) => item.jobMark.placement === "job-row")
    .map((item) => ref(item.id, `E2 · ${item.jobMark.variant} · job-row reference`)),
];
const placementOffset = placementCases.filter((item) => item.jobMark.placement === "rdm-neighbor")
  .map((item) => ref(item.id, `E2 · ${item.jobMark.variant} · RDM offset`));

const detailTiles = [
  ref(caseId("red-mage", "cinematic", "C"), "C2 · full icon + abbreviation", {
    exportFormat: "png", cropParts: [{ jobMark: "activeMark" }, { role: "job", field: "jobAbbreviation" }], cropPaddingPx: 20,
    note: "Seal and RDM baseline; visible bounds from the actual mark rect.",
  }),
  ref(caseId("red-mage", "editorial", "B"), "E2 · large RDM + full icon", {
    exportFormat: "png", cropParts: [{ jobMark: "activeMark" }, { role: "job", field: "jobAbbreviation" }], cropPaddingPx: 24,
    note: "Actual row-placement icon and retained large RDM text.",
  }),
  ref(caseId("red-mage", "id-card", "B"), "I3 · full badge", {
    exportFormat: "png", cropFrom: "activeMark", cropPaddingPx: 20,
    note: "Badge edge and inner emblem at native export resolution.",
  }),
  ref(caseId("astrologian", "editorial", "B"), "Fan Kit · AST 76px source", {
    exportFormat: "png", cropFrom: "activeMark", cropPaddingPx: 18,
    note: "Real Fan Kit asset; include its whole visible silhouette.",
  }),
  ref(caseId("reaper", "editorial", "B"), "Raster · Reaper HQ source", {
    exportFormat: "png", cropFrom: "activeMark", cropPaddingPx: 18,
    note: "Real HQ raster source; inspect edge at 100/200/400%.",
  }),
  ref(caseId("beastmaster", "editorial", "B"), "Generic · Beastmaster fallback", {
    exportFormat: "png", cropFrom: "activeMark", cropPaddingPx: 18,
    note: "Real generic fallback; verify it remains legible and un-cropped.",
  }),
];

const boards = [
  { file: "01-c2-rdm-abc.png", title: "C2 · RDM A / B / C", columns: 3, tileWidth: 600, captionHeight: 400, tiles: rdmAbc("cinematic") },
  { file: "02-e2-rdm-abc.png", title: "E2 · RDM A / B / C", columns: 3, tileWidth: 600, captionHeight: 400, note: "B/C preserve the large RDM typography and use only the two E2 placement candidates.", tiles: rdmAbc("editorial") },
  { file: "03-i3-rdm-abc.png", title: "I3 · RDM A / B / C", columns: 3, tileWidth: 600, captionHeight: 400, tiles: rdmAbc("id-card") },
  ...["dragoon", "gunbreaker", "white-mage", "black-mage"].map((jobId, index) => ({
    file: `${String(index + 4).padStart(2, "0")}-${["drg", "gnb", "whm", "blm"][index]}.png`,
    title: `${jobId.toUpperCase()} · all masters A / B / C`,
    columns: 3,
    tileWidth: 600,
    captionHeight: 400,
    tiles: multiJob(jobId),
  })),
  {
    file: "08-svg-raster-fankit-generic.png",
    title: "Real source tiers · same corrected full-icon system",
    columns: 3,
    tileWidth: 600,
    captionHeight: 400,
    note: "Only original resolver assets: SVG, HQ raster, Fan Kit, and Beastmaster generic fallback. PNG2x exports; captions report source and visible bounds.",
    tiles: sourceCases,
  },
  {
    file: "09-opacity-comparison.png",
    title: "RDM · family strength comparison on full cards",
    columns: 4,
    tileWidth: 500,
    captionHeight: 400,
    note: "100/75/60/45 percent are QA controls, not production opacity selections.",
    tiles: opacityTiles,
  },
  {
    file: "10-size-comparison.png",
    title: "AST Fan Kit · small / medium / large-safe",
    columns: 3,
    tileWidth: 720,
    captionHeight: 400,
    note: "Exactly three full-card sizes: SMALL 10, MEDIUM 14, and LARGE-SAFE 15.2 logical px at the measured Fan Kit source ceiling. PNG2x review confirmed 15.2 clean; 16/18 are above-ceiling probes and slightly soft, so they are excluded from the safe-size candidate range.",
    tiles: safeSizeTiles,
  },
  {
    file: "11-all-master-comparison.png",
    title: "RDM · final A / B / C family comparison",
    columns: 3,
    tileWidth: 720,
    captionHeight: 400,
    note: "Rows C2/E2/I3, columns A/B/C. Same name, canonical data, photo, ratio, and family name candidate within each row. No winner selected.",
    tiles: masters.flatMap((master) => ["A", "B", "C"].map((variant) => ref(caseId("red-mage", master, variant), `${master} · ${variant}`, { exportFormat: "png" }))),
  },
  {
    file: "12-e2-placement-options.png",
    title: "E2 · the two permitted icon placements",
    columns: 3,
    tileWidth: 600,
    captionHeight: 400,
    note: "Job-row emblem versus RDM-neighbor/offset emblem only. This compares placement without selecting a production winner.",
    tiles: [...placementRow, ...placementOffset],
  },
  ...[
    { file: "13-icon-detail-100.png", scale: 0.5, title: "Icon detail · preview raster scale (100%)", note: "PNG2x crops downsampled 0.5× to 1080px preview-card raster scale; crop bounds use measured export/card coordinates." },
    { file: "14-icon-detail-200.png", scale: 1, title: "Icon detail · native PNG2x pixels (200%)", note: "Crops shown at native 2160px export-card scale without resampling." },
    { file: "15-icon-detail-400.png", scale: 2, title: "Icon detail · PNG2x enlarged to 400%", note: "Native PNG2x source crops enlarged 2× nearest-neighbor to inspect path edges, raster stair-step, halo, material contrast, and baseline." },
  ].map(({ file, scale, title, note }) => ({
    file,
    title,
    columns: 2,
    captionHeight: 400,
    note,
    tiles: detailTiles.map((tile) => ({ ...tile, displayScale: scale })),
  })),
  {
    file: "16-fankit-size-sweep.png",
    title: "AST Fan Kit · complete measured size sweep",
    columns: 4,
    tileWidth: 540,
    captionHeight: 400,
    note: "Supplementary eight-point evidence at 6/8/10/12/14/15.2/16/18 logical px. PNG2x edge review found 15.2 clean; 16/18 are above the measured ceiling and slightly soft, so they are excluded from the safe-size candidate range.",
    tiles: sizeTiles,
  },
  {
    file: "17-retained-serif-alternates.png",
    title: "Retained serif name alternates · fixed common S1 body",
    columns: 3,
    tileWidth: 720,
    captionHeight: 400,
    note: "Supplementary preview retention check only: C2 S3 and E2 S4 across A/B/C. All non-name information stays on common S1 Serif; this is not a new font rescreen and selects no winner.",
    tiles: retainedNameTiles,
  },
];

const plan = {
  schema: "phase302-board-plan-v1",
  generatedAt: new Date().toISOString(),
  baselineNameSets: phase302NameFontByMaster,
  commonBodyFontSet: "S1",
  requiredArtifacts: boards.map((board) => board.file),
  winnerSelected: false,
  boards,
};
await writeFile(outputPath, JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ plan: "docs/qa/phase302-jobmark-correction/board-plan.json", boardCount: boards.length, tileCounts: boards.map((board) => ({ file: board.file, tiles: board.tiles.length })) }, null, 2));

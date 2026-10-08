import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase301-card-type-job");
const outputPath = path.join(evidenceRoot, "board-plan.json");
const masters = ["cinematic", "editorial", "id-card"];
const serifSets = ["S1", "S2", "S3", "S4"];
const sansIdentitySets = ["N1", "N2"];
const fontPanelNames = ["korean-ko", "katakana-ja", "mixed-korean", "mixed-japanese"];
const stage1Id = (fontSet, master, specimen) => `stage1-${fontSet.toLowerCase()}-${master}-${specimen}`;
const stage2Id = (jobId, master, variant) => `stage2-${jobId}-${master}-mark-${variant.toLowerCase()}`;
const sourceTierId = (jobId, probe) => `source-tier-${jobId}-${probe}`;
const combinedId = (master, fontSet, variant) => `combined-${master}-${fontSet.toLowerCase()}-mark-${variant.toLowerCase()}`;
const metadataId = (metadataSet, master, specimen) => `metadata-${metadataSet.toLowerCase()}-${master}-${specimen}`;

const fontTiles = (master, fontSets, specimens) => fontSets.flatMap((fontSet) => specimens.map((specimen) => ({
  caseId: stage1Id(fontSet, master, specimen),
  label: `${fontSet} · ${specimen}`,
})));

const allFontSets = [
  ...serifSets.flatMap((fontSet) => masters.map((master) => ({ fontSet, master }))),
  ...sansIdentitySets.map((fontSet) => ({ fontSet, master: "id-card" })),
];
const allJobIds = ["red-mage", "dragoon", "gunbreaker", "white-mage", "black-mage"];
const probes = ["safe12-cardmedium-b", "safe32-cardmedium-b", "medium72-cardmedium-c", "stress220-cardmedium-b", "stress220-carddisplay-b"];
const probeLabels = {
  "safe12-cardmedium-b": "SAFE · 12px",
  "safe32-cardmedium-b": "SMALL · 32px",
  "medium72-cardmedium-c": "MEDIUM · 72px",
  "stress220-cardmedium-b": "STRESS · 220px cardMedium",
  "stress220-carddisplay-b": "APPROVED · 220px cardDisplay",
};
const shortlistByMaster = {
  cinematic: ["S1", "S3"],
  editorial: ["S2", "S4"],
  "id-card": ["S1", "N2"],
};
const detailProbes = [
  {
    caseId: combinedId("cinematic", "S1", "C"),
    cropRole: "display", cropField: "name", cropPaddingPx: 24,
    label: "C2 · S1 · CJK name strokes",
    note: "Mixed Latin + Hangul specimen; raw display-name ink bounds.",
  },
  {
    caseId: combinedId("editorial", "S2", "C"),
    cropParts: [{ jobMark: "icon" }, { role: "job", field: "jobAbbreviation" }], cropPaddingPx: 24,
    label: "E2 · S2 · C icon + abbreviation baseline",
    note: "Union of actual icon rect and visible abbreviation ink rect.",
  },
  {
    caseId: combinedId("editorial", "S2", "C"),
    cropRole: "caption", cropText: "비공식 · 팬메이드", cropPaddingPx: 16,
    label: "E2 · S2 · paper-small legal caption",
    note: "Small localized production caption ink; exact text row bounds.",
  },
  {
    caseId: combinedId("id-card", "N2", "C"),
    cropFrom: "jobMarkPrimarySlot", cropPaddingPx: 20,
    label: "I3 · N2 · job badge",
    note: "Actual rendered mark image bounds from the identity card.",
  },
  {
    caseId: sourceTierId("astrologian", "medium72-cardmedium-c"),
    cropFrom: "jobMarkIcon", cropPaddingPx: 18,
    label: "Fan Kit · 72px cardMedium C",
    note: "Actual 76px Fan Kit source at the corrected 72px logical footprint.",
  },
  {
    caseId: sourceTierId("reaper", "stress220-cardmedium-b"),
    cropFrom: "jobMarkIcon", cropPaddingPx: 18,
    label: "Raster · 220px cardMedium B stress",
    note: "QA-only enlargement of the actual raster source.",
  },
  {
    caseId: sourceTierId("beastmaster", "safe32-cardmedium-b"),
    cropFrom: "jobMarkIcon", cropPaddingPx: 18,
    label: "Generic · 32px cardMedium B",
    note: "Actual generic fallback at the safe production-size comparison.",
  },
];

const boards = [
  { file: "01-c2-fonts.png", title: "C2 · Serif font candidates", columns: 4, tileWidth: 420, captionHeight: 220, tiles: fontTiles("cinematic", serifSets, fontPanelNames) },
  { file: "02-e2-fonts.png", title: "E2 · Serif font candidates", columns: 4, tileWidth: 420, captionHeight: 220, tiles: fontTiles("editorial", serifSets, fontPanelNames) },
  { file: "03-i3-fonts.png", title: "I3 · Serif and Sans candidates", columns: 4, tileWidth: 420, captionHeight: 220, tiles: fontTiles("id-card", [...serifSets, ...sansIdentitySets], fontPanelNames) },
  { file: "04-ko-fonts.png", title: "Korean · cross-family candidate comparison", columns: 4, tileWidth: 420, captionHeight: 220, tiles: allFontSets.map(({ fontSet, master }) => ({ caseId: stage1Id(fontSet, master, "korean-ko"), label: `${master} · ${fontSet}` })) },
  { file: "05-ja-fonts.png", title: "Japanese · cross-family candidate comparison", columns: 4, tileWidth: 420, captionHeight: 220, tiles: allFontSets.map(({ fontSet, master }) => ({ caseId: stage1Id(fontSet, master, "katakana-ja"), label: `${master} · ${fontSet}` })) },
  { file: "06-mixed-script.png", title: "Mixed scripts · Latin with Hangul and Kana", columns: 4, tileWidth: 420, captionHeight: 220, tiles: allFontSets.flatMap(({ fontSet, master }) => ["mixed-korean", "mixed-japanese"].map((specimen) => ({ caseId: stage1Id(fontSet, master, specimen), label: `${master} · ${fontSet} · ${specimen}` }))) },
  ...masters.map((master, index) => ({
    file: `${String(7 + index).padStart(2, "0")}-${["c2", "e2", "i3"][index]}-jobmark-abc.png`,
    title: `${["C2", "E2", "I3"][index]} · RDM A / B / C`,
    columns: 3,
    tileWidth: 500,
    captionHeight: 220,
    tiles: ["A", "B", "C"].map((variant) => ({ caseId: stage2Id("red-mage", master, variant), label: `RDM · ${variant}` })),
  })),
  ...allJobIds.map((jobId, index) => ({
    file: `${String(10 + index).padStart(2, "0")}-${["rdm", "drg", "gnb", "whm", "blm"][index]}.png`,
    title: `${jobId.toUpperCase()} · all Masters, A / B / C`,
    columns: 3,
    tileWidth: 500,
    captionHeight: 220,
    tiles: masters.flatMap((master) => ["A", "B", "C"].map((variant) => ({ caseId: stage2Id(jobId, master, variant), label: `${master} · ${variant}` }))),
  })),
  {
    file: "15-icon-source-mixed.png",
    title: "Job-mark sources · small alternatives, medium, and size stresses",
    columns: 4,
    tileWidth: 420,
    captionHeight: 220,
    note: "Export is 5× logical size: SAFE12=60px, SMALL32=160px, MEDIUM72=360px, STRESS220=1100px. Only 12 logical px is below the 76px Fan Kit source bound; 220px cardDisplay is the SVG-only gate.",
    tiles: probes.flatMap((probe) => ["red-mage", "reaper", "astrologian", "beastmaster"].map((jobId) => ({
      caseId: sourceTierId(jobId, probe),
      label: `${jobId} · ${probeLabels[probe]}`,
      note: probe === "stress220-carddisplay-b" ? "220 logical px · SVG only, lower tiers use fallback" : probe === "stress220-cardmedium-b" ? "220 logical px (1100 export px) · QA-only source-quality stress" : probe === "medium72-cardmedium-c" ? "72 logical px (360 export px) · corrected hybrid footprint" : probe === "safe32-cardmedium-b" ? "32 logical px (160 export px) · small comparison size; not the safety gate" : "12 logical px (60 export px) · below 76px Fan Kit source bound",
    }))),
  },
  {
    file: "16-master-comparison.png",
    title: "Shortlist · 2 typography candidates per Master × A / B / C",
    columns: 6,
    tileWidth: 600,
    captionHeight: 220,
    note: "18 comparison cells. These are tentative shortlist alternatives for user choice; no candidate is a production winner.",
    tiles: masters.flatMap((master) => shortlistByMaster[master].flatMap((fontSet) => ["A", "B", "C"].map((variant) => ({
      caseId: combinedId(master, fontSet, variant),
      label: `${master} · ${fontSet} · ${variant}`,
      note: "Shortlist alternative; no winner",
    })))),
  },
  {
    file: "17-detail-100.png",
    title: "Export detail · Preview raster scale (100%; PNG2x × 0.5)",
    columns: 2,
    captionHeight: 220,
    note: "PNG2x crops are downsampled by 0.5 to the 1080px preview-card raster scale, not CSS pixels; crop mapping uses measured export/card-rect ratios.",
    tiles: detailProbes.map((tile) => ({ ...tile, exportFormat: "png", displayScale: 0.5 })),
  },
  {
    file: "18-detail-200.png",
    title: "Export detail · Native PNG2x export pixels (200%)",
    columns: 2,
    captionHeight: 220,
    note: "PNG2x crops are shown at native export pixel dimensions (2160px card width in this contract); no image resampling is applied.",
    tiles: detailProbes.map((tile) => ({ ...tile, exportFormat: "png", displayScale: 1 })),
  },
  {
    file: "19-metadata-comparison.png",
    title: "Metadata · fixed S1 display anchor × M1 / M2 / M3",
    columns: 3,
    tileWidth: 460,
    captionHeight: 220,
    note: "M1 reuses the matching Stage1 S1/M1 capture. Metadata coverage is separate from the canonical 18 shortlist cells.",
    tiles: masters.flatMap((master) => [
      { caseId: stage1Id("S1", master, "mixed-korean"), label: `${master} · S1/M1 · KO` },
      { caseId: metadataId("M2", master, "korean"), label: `${master} · S1/M2 · KO` },
      { caseId: metadataId("M3", master, "korean"), label: `${master} · S1/M3 · KO` },
      { caseId: stage1Id("S1", master, "mixed-japanese"), label: `${master} · S1/M1 · JA` },
      { caseId: metadataId("M2", master, "japanese"), label: `${master} · S1/M2 · JA` },
      { caseId: metadataId("M3", master, "japanese"), label: `${master} · S1/M3 · JA` },
    ]),
  },
];

const plan = {
  schema: "phase301-board-plan-v1",
  generatedAt: new Date().toISOString(),
  shortlistByMaster,
  winnerSelected: false,
  requiredArtifacts: boards.map((board) => board.file),
  boards,
};
await writeFile(outputPath, JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ plan: "docs/qa/phase301-card-type-job/board-plan.json", boardCount: boards.length, tileCounts: boards.map((board) => ({ file: board.file, tiles: board.tiles.length })) }, null, 2));

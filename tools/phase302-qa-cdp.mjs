import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase302-jobmark-correction");
const rawRoot = path.join(evidenceRoot, "raw");
const phase302OpticsRegistry = JSON.parse(await readFile(path.join(evidenceRoot, "qa-source", "jobmark-optics.json"), "utf8"));
const phase302EditorialFamilyPalette = phase302OpticsRegistry.familyPalette?.editorial ?? null;
const phase302EditorialPaletteReferencePath = phase302EditorialFamilyPalette?.referenceCaseId
  ? path.join(rawRoot, `${safeFileName(phase302EditorialFamilyPalette.referenceCaseId)}.json`)
  : null;
const phase302EditorialPaletteReference = phase302EditorialPaletteReferencePath
  ? JSON.parse(await readFile(phase302EditorialPaletteReferencePath, "utf8"))
  : null;
const phase302SharedEditorialInkColor = String(phase302EditorialFamilyPalette?.jobIconColor ?? "").trim();
const phase302ObservedRdmReferenceInkColor = phase302EditorialPaletteReference?.apiResult?.jobMark?.primaryDom?.color ?? null;
if (!phase302EditorialFamilyPalette || phase302EditorialFamilyPalette.referenceJobId !== "red-mage" ||
    phase302EditorialPaletteReference?.case?.jobId !== "red-mage" || phase302EditorialPaletteReference?.case?.master !== "editorial" ||
    phase302EditorialPaletteReference?.case?.jobMark?.variant !== "B" ||
    !computedRgbaMatches(phase302SharedEditorialInkColor, phase302ObservedRdmReferenceInkColor)) {
  throw new Error("The shared Editorial family ink must match its declared raw RDM B reference.");
}
const phase301E2ReferenceJobs = ["red-mage", "dragoon", "gunbreaker", "white-mage", "black-mage"];
const phase301E2ReferenceJobSet = new Set(phase301E2ReferenceJobs);
const phase301RawRoot = path.resolve(evidenceRoot, "..", "phase301-card-type-job", "raw");
const phase301E2JobReferenceReports = Object.fromEntries(await Promise.all(phase301E2ReferenceJobs.map(async (jobId) => {
  const filename = `stage2-${jobId}-editorial-mark-a.json`;
  const report = JSON.parse(await readFile(path.join(phase301RawRoot, filename), "utf8"));
  return [jobId, { filename, report }];
})));

// For the three jobs without a same-job Phase301 E2 capture, derive the
// expected large-abbreviation face from the identical physical face observed
// in all five Phase301 job baselines. The manifest supplies the Cormorant
// family identity/genre/Latin script and supports weight 600; the captures
// independently verify its rendered PostScript instance.
const phase301AbbreviationFaceObservations = phase301E2ReferenceJobs.map((jobId) => {
  const { filename, report } = phase301E2JobReferenceReports[jobId];
  const row = report.actualFontEvidence?.runs?.find((item) => item.field === "jobAbbreviation" && item.role === "job");
  const faces = row?.actualPlatformFonts?.filter((face) => Number(face.glyphCount) > 0) ?? [];
  const actualGenre = row?.actualGenres?.find((face) => face.genre)?.genre ?? null;
  if (!row || faces.length !== 1 || Number(row.paintState?.fontWeight) !== 600 || !actualGenre) {
    throw new Error(`Phase301 E2 abbreviation reference is incomplete for ${jobId} (${filename}).`);
  }
  return {
    jobId,
    filename,
    text: row.text,
    fontId: "cormorant-garamond",
    familyName: faces[0].familyName,
    postScriptName: faces[0].postScriptName,
    isCustomFont: Boolean(faces[0].isCustomFont),
    script: "latin",
    cssWeight: 600,
    genre: actualGenre,
  };
});
const phase301AbbreviationFaceSignatures = new Set(phase301AbbreviationFaceObservations.map((face) => JSON.stringify({
  fontId: face.fontId,
  familyName: face.familyName,
  postScriptName: face.postScriptName,
  isCustomFont: face.isCustomFont,
  script: face.script,
  cssWeight: face.cssWeight,
  genre: face.genre,
})));
if (phase301AbbreviationFaceSignatures.size !== 1) {
  throw new Error("Phase301 E2 job references do not agree on the Cormorant 600 physical abbreviation face.");
}
const phase302VerifiedP0AbbreviationFace = {
  ...phase301AbbreviationFaceObservations[0],
  verifiedByPhase301Cases: phase301AbbreviationFaceObservations.map((face) => face.filename),
};

function phase302P0ReferenceRawPath(jobId) {
  if (phase301E2ReferenceJobSet.has(jobId)) {
    return `../phase301-card-type-job/raw/stage2-${jobId}-editorial-mark-a.json`;
  }
  // The generic RDM P0 capture remains a valid reference for shared E2
  // masthead text. Its abbreviation text is deliberately not used; those
  // three source-tier jobs receive an independent physical-face policy.
  return "../phase301-card-type-job/raw/p0-editorial-coner-en.json";
}

function phase302P0ExpectedFacesByField(jobId, master, variant) {
  if (master !== "editorial" || variant !== "A" || phase301E2ReferenceJobSet.has(jobId)) return undefined;
  return { jobAbbreviation: phase302VerifiedP0AbbreviationFace };
}

export const STAGE1_NAMES = Object.freeze([
  { id: "coner-en", text: "Coner", locale: "en", nameLang: "en" },
  { id: "korean-ko", text: "코너", locale: "ko", nameLang: "ko" },
  { id: "katakana-ja", text: "コナー", locale: "ja", nameLang: "ja" },
  { id: "han-hans", text: "光", locale: "ja", nameLang: "zh-Hans" },
  { id: "latin-hant", text: "Coner 光", locale: "ja", nameLang: "zh-Hant" },
  { id: "mixed-korean", text: "Coner 코너", locale: "ko", nameLang: "ko" },
  { id: "mixed-japanese", text: "コナー Coner", locale: "ja", nameLang: "ja" },
]);

export const STAGE1_VARIANTS = Object.freeze([
  ...["S1", "S2", "S3", "S4"].flatMap((fontSet) => ["cinematic", "editorial", "id-card"].map((master) => ({ fontSet, master }))),
  { fontSet: "N1", master: "id-card" },
  { fontSet: "N2", master: "id-card" },
]);

export function buildStage1Cases({ fontSetMetadata = {} } = {}) {
  return STAGE1_VARIANTS.flatMap(({ fontSet, master }) => STAGE1_NAMES.map((specimen) => {
    const set = fontSetMetadata[fontSet] ?? {};
    const localizedFaces = set.expectedFacesByNameLanguage?.[specimen.nameLang];
    return {
      id: `stage1-${fontSet.toLowerCase()}-${master}-${specimen.id}`,
      specimenId: specimen.id,
      p0ReferenceCaseId: `p0-${master}-${specimen.id}`,
      stage: "stage1-font",
      master,
      fontSet,
      metadataSet: "M1",
      comparisonGroup: `stage1-crop-${master}`,
      comparisonInvariant: "imageCropFingerprint",
      name: specimen.text,
      locale: specimen.locale,
      nameLang: specimen.nameLang,
      jobId: "red-mage",
      jobMark: { variant: "A" },
      expectedFacesByRole: localizedFaces ?? set.expectedFacesByRoleByMaster?.[master] ?? set.expectedFacesByRole ?? null,
      expectedGenreByRole: set.expectedGenreByRoleByMaster?.[master] ?? set.expectedGenreByRole ?? null,
      expectedFaceSource: "font-assets-manifest",
      expectedGenreSource: "font-assets-manifest",
      allowedCustomFaces: set.allowedCustomFaces ?? [],
      familyGenreByName: set.familyGenreByName ?? {},
      preview: true,
      fontEvidence: true,
    };
  }));
}

export function buildP0ReferenceCases() {
  const expectedGenreByMaster = {
    cinematic: { display: "serif", secondaryDisplay: "serif", job: "serif", information: "sans", label: "mono", caption: "sans", micro: "mono" },
    editorial: { display: "serif", secondaryDisplay: "serif", job: "serif", information: "sans", label: "sans", caption: "sans", micro: "mono" },
    "id-card": { display: "serif", secondaryDisplay: "serif", job: "serif", information: "serif", caption: "serif", label: "mono", micro: "mono" },
  };
  const familyGenreByName = {
    "Cormorant Garamond Variable": "serif", "Noto Serif KR Variable": "serif", "Noto Serif JP Variable": "serif",
    "Noto Sans KR Variable": "sans", "Noto Sans JP Variable": "sans", "DM Sans Variable": "sans",
    "Arial": "sans", "Segoe UI": "sans", "Malgun Gothic": "sans", "Apple SD Gothic Neo": "sans", "Meiryo": "sans", "Yu Gothic": "sans",
    "Georgia": "serif", "Times New Roman": "serif", "Batang": "serif", "Yu Mincho": "serif", "Hiragino Mincho ProN": "serif",
    "Consolas": "mono", "Liberation Mono": "mono", "Courier New": "mono", "Menlo": "mono", "SFMono-Regular": "mono", "SF Mono": "mono", "Cascadia Mono": "mono", "Cascadia Code": "mono",
  };
  return ["cinematic", "editorial", "id-card"].flatMap((master) => STAGE1_NAMES.map((specimen) => ({
    id: `p0-${master}-${specimen.id}`,
    specimenId: specimen.id,
    stage: "p0-production-reference",
    master,
    fontSet: "P0",
    metadataSet: "P0",
    comparisonGroup: `p0-crop-${master}`,
    comparisonInvariant: "imageCropFingerprint",
    name: specimen.text,
    locale: specimen.locale,
    nameLang: null,
    expectedGenreByRole: expectedGenreByMaster[master],
    familyGenreByName,
    preview: true,
    fontEvidence: true,
    candidatePassApplicable: false,
  })));
}

export function buildMetadataFallbackCases({ fontSetMetadata = {} } = {}) {
  const set = fontSetMetadata.S1 ?? {};
  return ["cinematic", "editorial", "id-card"].flatMap((master) => [
    { script: "zh-Hans", text: "简体中文" },
    { script: "zh-Hant", text: "繁體中文" },
  ].map(({ script, text }) => ({
    id: `coverage-m1-${master}-${script.toLowerCase()}`,
    stage: "metadata-fallback",
    master,
    fontSet: "S1",
    metadataSet: "M1",
    p0ReferenceCaseId: `p0-${master}-coner-en`,
    comparisonGroup: `m1-zh-crop-${master}`,
    comparisonInvariant: "imageCropFingerprint",
    expectedFacesByRole: set.expectedFacesByRoleByMaster?.[master] ?? set.expectedFacesByRole ?? null,
    expectedGenreByRole: set.expectedGenreByRoleByMaster?.[master] ?? set.expectedGenreByRole ?? null,
    expectedFaceSource: "font-assets-manifest",
    expectedGenreSource: "font-assets-manifest",
    allowedCustomFaces: set.allowedCustomFaces ?? [],
    familyGenreByName: set.familyGenreByName ?? {},
    name: "Coner",
    locale: "en",
    nameLang: "en",
    metadataLang: script,
    metadataText: text,
    preview: true,
    fontEvidence: true,
  })));
}

export function buildMetadataComparisonCases({ fontSetMetadata = {} } = {}) {
  const set = fontSetMetadata.S1 ?? {};
  return ["cinematic", "editorial", "id-card"].flatMap((master) => [
    { suffix: "korean", name: "Coner 코너", locale: "ko", nameLang: "ko" },
    { suffix: "japanese", name: "コナー Coner", locale: "ja", nameLang: "ja" },
  ].flatMap((specimen) => ["M2", "M3"].map((metadataSet) => ({
    id: `metadata-${metadataSet.toLowerCase()}-${master}-${specimen.suffix}`,
    stage: "metadata-comparison",
    master,
    fontSet: "S1",
    metadataSet,
    name: specimen.name,
    locale: specimen.locale,
    nameLang: specimen.nameLang,
    jobId: "red-mage",
    jobMark: { variant: "A", jobId: "red-mage" },
    p0ReferenceCaseId: `p0-${master}-${specimen.suffix === "korean" ? "mixed-korean" : "mixed-japanese"}`,
    comparisonGroup: `metadata-crop-${master}-${specimen.suffix}`,
    comparisonInvariant: "imageCropFingerprint",
    expectedFacesByRole: set.expectedFacesByNameLanguage?.[specimen.nameLang] ?? set.expectedFacesByRoleByMaster?.[master] ?? set.expectedFacesByRole ?? null,
    expectedGenreByRole: fontSetMetadata[metadataSet]?.expectedGenreByRoleByMaster?.[master] ?? fontSetMetadata[metadataSet]?.expectedGenreByRole ?? null,
    expectedFaceSource: "font-assets-manifest",
    expectedGenreSource: "font-assets-manifest",
    allowedCustomFaces: [...new Set([...(set.allowedCustomFaces ?? []), ...(fontSetMetadata[metadataSet]?.allowedCustomFaces ?? [])])],
    familyGenreByName: { ...(set.familyGenreByName ?? {}), ...(fontSetMetadata[metadataSet]?.familyGenreByName ?? {}) },
    preview: true,
    fontEvidence: true,
  }))));
}

export function buildCombinedShortlistCases() {
  const candidateSetsByMaster = {
    cinematic: ["S1", "S3"],
    editorial: ["S2", "S4"],
    "id-card": ["S1", "N2"],
  };
  const variants = ["A", "B", "C"];
  return Object.entries(candidateSetsByMaster).flatMap(([master, fontSets]) => fontSets.flatMap((fontSet) => variants.map((variant) => ({
    id: `combined-${master}-${fontSet.toLowerCase()}-mark-${variant.toLowerCase()}`,
    stage: "combined-shortlist",
    master,
    fontSet,
    metadataSet: "M1",
    name: "Coner 코너",
    locale: "ko",
    nameLang: "ko",
    jobId: "red-mage",
    jobMark: {
      variant,
      usage: master === "cinematic" ? "cardSmall" : master === "editorial" ? "cardDisplay" : "cardMedium",
      textTypography: "P0",
      jobId: "red-mage",
    },
    expectedResolvedSource: "xivapi-svg",
    candidatePassApplicable: true,
    comparisonGroup: `combined-${master}-${fontSet}`,
    comparisonInvariant: "fixtureFingerprint",
    comparisonGroups: [
      { group: `combined-fixture-${master}-${fontSet}`, invariant: "fixtureFingerprint" },
      { group: `combined-crop-${master}`, invariant: "imageCropFingerprint" },
    ],
    p0ReferenceCaseId: `p0-${master}-mixed-korean`,
    preview: true,
    fontEvidence: true,
    exports: ["png", "webp"],
  }))));
}

export function buildStage2JobMarkCases() {
  const masters = ["cinematic", "editorial", "id-card"];
  const jobs = ["red-mage", "dragoon", "gunbreaker", "white-mage", "black-mage"];
  const variants = ["A", "B", "C"];
  return jobs.flatMap((jobId) => masters.flatMap((master) => variants.map((variant) => ({
    id: `stage2-${jobId}-${master}-mark-${variant.toLowerCase()}`,
    stage: "p0-jobmark-abc",
    master,
    fontSet: "P0",
    metadataSet: "P0",
    name: "Coner",
    locale: "en",
    nameLang: null,
    jobId,
    sourceTier: "xivapi-svg",
    expectedResolvedSource: "xivapi-svg",
    jobMark: { variant, usage: master === "cinematic" ? "cardSmall" : master === "editorial" ? "cardDisplay" : "cardMedium", jobId, textTypography: "P0" },
    candidatePassApplicable: false,
    comparisonGroup: `abc-${master}-${jobId}`,
    comparisonInvariant: "fixtureFingerprint",
    comparisonGroups: [
      { group: `abc-fixture-${master}-${jobId}`, invariant: "fixtureFingerprint" },
      { group: `multi-job-crop-${master}`, invariant: "imageCropFingerprint" },
    ],
    preview: true,
    fontEvidence: true,
  }))));
}

export function buildJobMarkSourceCases() {
  const tiers = [
    { jobId: "red-mage", sourceTier: "xivapi-svg" },
    { jobId: "reaper", sourceTier: "xivapi-raster" },
    { jobId: "astrologian", sourceTier: "xivapi-raster" },
    { jobId: "beastmaster", sourceTier: "generic" },
  ];
  const probes = [
    { variant: "B", usage: "cardMedium", sizeLogicalPx: 12, probe: "safe12-cardmedium-b" },
    { variant: "B", usage: "cardMedium", sizeLogicalPx: 32, probe: "safe32-cardmedium-b" },
    { variant: "C", usage: "cardMedium", sizeLogicalPx: 72, probe: "medium72-cardmedium-c" },
    { variant: "B", usage: "cardMedium", sizeLogicalPx: 220, probe: "stress220-cardmedium-b" },
    { variant: "B", usage: "cardDisplay", sizeLogicalPx: 220, probe: "stress220-carddisplay-b" },
  ];
  return tiers.flatMap(({ jobId, sourceTier }) => {
    const tierProbes = jobId === "beastmaster"
      ? [{ variant: "B", usage: "cardMedium", sizeLogicalPx: Number(phase302OpticsRegistry.jobs.beastmaster.sizeLogicalCeiling), probe: "generic-small10" }]
      : probes;
    return tierProbes.map((probe) => ({
      id: `source-tier-${jobId}-${probe.probe}`,
      stage: "p0-source-tier",
      master: "editorial",
      fontSet: "P0",
      metadataSet: "P0",
      name: "Coner",
      locale: "en",
      nameLang: null,
      jobId,
      sourceTier,
      expectedResolvedSource: sourceTier === "generic" || probe.usage === "cardDisplay" && sourceTier !== "xivapi-svg" ? "fallback" : sourceTier,
      usageProbe: probe.probe,
      jobMark: { variant: probe.variant, usage: probe.usage, sizeLogicalPx: probe.sizeLogicalPx, jobId },
      candidatePassApplicable: false,
      comparisonGroup: `source-tier-${jobId}`,
      comparisonInvariant: "fixtureFingerprint",
      comparisonGroups: [
        { group: `source-pair-${jobId}`, invariant: "fixtureFingerprint" },
        { group: "source-board-image-crop", invariant: "imageCropFingerprint" },
      ],
      preview: true,
      fontEvidence: true,
      exports: ["png"],
    }));
  });
}

export const phase302NameFontByMaster = { cinematic: "S1", editorial: "S2", "id-card": "S1" };
const phase302CommonBodyFontSet = "S1";
const phase302StrengthByMaster = { cinematic: 0.62, editorial: 0.55, "id-card": 0.68 };
const phase302UsageByMaster = { cinematic: "cardSmall", editorial: "cardMedium", "id-card": "cardMedium" };
const phase302RequiredJobs = ["red-mage", "dragoon", "gunbreaker", "white-mage", "black-mage", "astrologian", "reaper", "beastmaster"];
const phase302SourceByJob = {
  "red-mage": "xivapi-svg",
  dragoon: "xivapi-svg",
  gunbreaker: "xivapi-svg",
  "white-mage": "xivapi-svg",
  "black-mage": "xivapi-svg",
  astrologian: "xivapi-raster",
  reaper: "xivapi-raster",
  beastmaster: "fallback",
};

export function phase302JobCaseId(jobId, master, variant) {
  return `phase302-${jobId}-${master}-mark-${variant.toLowerCase()}`;
}

export function phase302NameAlternativeCaseId(master, nameFontSet, variant) {
  return `phase302-name-alt-${master}-${nameFontSet.toLowerCase()}-mark-${variant.toLowerCase()}`;
}

function phase302DefaultSizeLogicalPx(master, jobId) {
  const familySizes = phase302OpticsRegistry.sizeSystem.familySizesLogicalPx[master];
  const familySize = Number(familySizes[jobId === "beastmaster" || master === "cinematic" ? "small" : "medium"]);
  const sourceCeiling = Number(phase302OpticsRegistry.jobs[jobId]?.sizeLogicalCeiling);
  return Number.isFinite(sourceCeiling) ? Math.min(familySize, sourceCeiling) : familySize;
}

function phase302JobMarkCase({ jobId, master, variant, nameFontSet = phase302NameFontByMaster[master], caseIdOverride = null, sizeLogicalPx = phase302DefaultSizeLogicalPx(master, jobId), visualStrength = phase302StrengthByMaster[master], placement = master === "editorial" ? "job-row" : undefined, exports = [] }) {
  const id = caseIdOverride ?? phase302JobCaseId(jobId, master, variant);
  const e2P0ReferenceCaseId = nameFontSet === phase302NameFontByMaster.editorial
    ? phase302JobCaseId(jobId, master, "A")
    : phase302NameAlternativeCaseId(master, nameFontSet, "A");
  return {
    id,
    stage: "phase302-jobmark-matrix",
    master,
    fontSet: nameFontSet,
    nameFontSet,
    commonBodyFontSet: phase302CommonBodyFontSet,
    metadataSet: phase302CommonBodyFontSet,
    name: "Coner 코너",
    locale: "ko",
    nameLang: "ko",
    jobId,
    sourceTier: phase302SourceByJob[jobId],
    expectedResolvedSource: phase302SourceByJob[jobId],
    candidatePassApplicable: true,
    p0ReferenceCaseId: variant === "A" ? null : master === "editorial" ? e2P0ReferenceCaseId : null,
    p0ReferenceRawPath: variant === "A" && master === "editorial" ? phase302P0ReferenceRawPath(jobId) : null,
    ...(phase302P0ExpectedFacesByField(jobId, master, variant) ? {
      p0ExpectedFacesByField: phase302P0ExpectedFacesByField(jobId, master, variant),
    } : {}),
    jobMark: {
      variant,
      jobId,
      usage: phase302UsageByMaster[master],
      sizeLogicalPx,
      visualStrength,
      ...(placement && variant !== "A" ? { placement } : {}),
      textTypography: master === "editorial" ? "P0" : phase302CommonBodyFontSet,
    },
    comparisonGroups: [
      { group: `fixture-${master}-${jobId}-${nameFontSet}`, invariant: "fixtureFingerprint" },
      { group: `crop-${master}-${jobId}-${nameFontSet}`, invariant: "imageCropFingerprint" },
    ],
    preview: true,
    fontEvidence: true,
    exports,
  };
}

export function buildPhase302JobMarkCases() {
  return phase302RequiredJobs.flatMap((jobId) => ["cinematic", "editorial", "id-card"].flatMap((master) => ["A", "B", "C"].map((variant) => {
    const exports = [];
    if (jobId === "red-mage") exports.push("png", "webp");
    else if (["astrologian", "reaper", "beastmaster"].includes(jobId) && ["B", "C"].includes(variant)) exports.push("png");
    return phase302JobMarkCase({ jobId, master, variant, exports });
  })));
}

export function buildPhase302PlacementCases() {
  return ["B", "C"].flatMap((variant) => {
    const comparisonGroups = [
      { group: `placement-fixture-${variant}`, invariant: "fixtureFingerprint" },
      { group: `placement-crop-${variant}`, invariant: "imageCropFingerprint" },
    ];
    const cases = [
      phase302JobMarkCase({
        jobId: "red-mage",
        master: "editorial",
        variant,
        placement: "job-row",
        caseIdOverride: `${phase302JobCaseId("red-mage", "editorial", variant)}-job-row-reference`,
        exports: [],
      }),
      phase302JobMarkCase({
        jobId: "red-mage",
        master: "editorial",
        variant,
        placement: "rdm-neighbor",
        caseIdOverride: `${phase302JobCaseId("red-mage", "editorial", variant)}-rdm-neighbor`,
        exports: [],
      }),
    ];
    return cases.map((caseInput) => ({
      ...caseInput,
      stage: "phase302-placement-comparison",
      p0ReferenceCaseId: phase302JobCaseId("red-mage", "editorial", "A"),
      comparisonGroup: `placement-fixture-${variant}`,
      comparisonInvariant: "fixtureFingerprint",
      comparisonGroups,
    }));
  });
}

export function buildPhase302OpacityCases() {
  return [1, 0.75, 0.6, 0.45].flatMap((visualStrength) => ["cinematic", "editorial", "id-card"].map((master) => {
    const caseInput = phase302JobMarkCase({ jobId: "red-mage", master, variant: "B", visualStrength, exports: [] });
    return {
      ...caseInput,
      id: `phase302-strength-red-mage-${master}-${Math.round(visualStrength * 100)}`,
      stage: "phase302-family-strength",
      p0ReferenceCaseId: master === "editorial" ? phase302JobCaseId("red-mage", master, "A") : null,
      comparisonGroups: [
        { group: `strength-fixture-${master}`, invariant: "fixtureFingerprint" },
        { group: `strength-crop-${master}`, invariant: "imageCropFingerprint" },
      ],
    };
  }));
}

export function buildPhase302SizeSweepCases() {
  const sweep = phase302OpticsRegistry.sizeSystem.astrologianSweepLogicalPx ?? [];
  const safe = Number(phase302OpticsRegistry.sizeSystem.commonMaximumLogicalPx);
  const sizes = [...new Set([...sweep.map(Number), safe].filter(Number.isFinite))].sort((a, b) => a - b);
  return sizes.map((sizeLogicalPx) => ({
    ...phase302JobMarkCase({
      jobId: "astrologian",
      master: "editorial",
      variant: "B",
      sizeLogicalPx,
      exports: ["png"],
    }),
    id: `phase302-size-astrologian-editorial-${String(sizeLogicalPx).replace(".", "-")}`,
    stage: "phase302-fankit-size-sweep",
    p0ReferenceCaseId: phase302JobCaseId("astrologian", "editorial", "A"),
    jobMark: {
      ...phase302JobMarkCase({ jobId: "astrologian", master: "editorial", variant: "B", sizeLogicalPx }).jobMark,
      allowSourceUpscaleProbe: sizeLogicalPx > safe,
    },
    comparisonGroups: [
      { group: "size-sweep-fixture", invariant: "fixtureFingerprint" },
      { group: "size-sweep-crop", invariant: "imageCropFingerprint" },
    ],
  }));
}

export function buildPhase302NameAlternativeCases() {
  const alternatives = [
    { master: "cinematic", nameFontSet: "S3" },
    { master: "editorial", nameFontSet: "S4" },
  ];
  return alternatives.flatMap(({ master, nameFontSet }) => ["A", "B", "C"].map((variant) => {
    const caseInput = phase302JobMarkCase({
      jobId: "red-mage",
      master,
      variant,
      nameFontSet,
      caseIdOverride: phase302NameAlternativeCaseId(master, nameFontSet, variant),
      exports: [],
    });
    return {
      ...caseInput,
      stage: "phase302-retained-name-alternative",
      p0ReferenceCaseId: variant === "A" ? null : master === "editorial" ? phase302NameAlternativeCaseId(master, nameFontSet, "A") : null,
      comparisonGroups: [
        { group: `name-alt-fixture-${master}-${nameFontSet}`, invariant: "fixtureFingerprint" },
        { group: `name-alt-crop-${master}`, invariant: "imageCropFingerprint" },
      ],
    };
  }));
}

export function buildPhase302SourceQualityCases() {
  const sourceJobs = new Set(["red-mage", "astrologian", "reaper", "beastmaster"]);
  return buildPhase302JobMarkCases().filter((caseInput) => sourceJobs.has(caseInput.jobId) && caseInput.jobMark.variant === "B");
}

export class CdpSession {
  #socket;
  #nextId = 0;
  #pending = new Map();
  #listeners = new Map();

  constructor(webSocketUrl) {
    this.#socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.#socket.addEventListener("open", resolve, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
    });
    this.#socket.addEventListener("message", (event) => this.#onMessage(event));
  }

  #onMessage(event) {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method && this.#listeners.has(message.method)) {
      for (const listener of [...this.#listeners.get(message.method)]) listener(message.params ?? {});
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const listeners = this.#listeners.get(method) ?? new Set();
      const listener = (params) => {
        listeners.delete(listener);
        clearTimeout(timer);
        resolve(params);
      };
      listeners.add(listener);
      this.#listeners.set(method, listeners);
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`CDP event timed out: ${method}`));
      }, timeoutMs);
    });
  }

  close() { this.#socket.close(); }
}

export async function connectLab(debugPort, { timeoutMs = 12000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (target) {
        const client = new CdpSession(target.webSocketDebuggerUrl);
        await client.ready;
        await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("DOM.enable"), client.send("CSS.enable")]);
        return { client, version, target };
      }
    } catch {}
    await sleep(120);
  }
  throw new Error(`No page target became available on Chrome CDP port ${debugPort}.`);
}

export async function evaluate(client, expression, timeoutMs = 30000) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}

export async function setViewportAndMedia(client, {
  width = 1440,
  height = 1120,
  deviceScaleFactor = 1,
  mobile = false,
  colorScheme = "dark",
  reducedMotion = "no-preference",
} = {}) {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile });
  await client.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: colorScheme },
      { name: "prefers-reduced-motion", value: reducedMotion },
    ],
  });
  return { width, height, deviceScaleFactor, mobile, colorScheme, reducedMotion };
}

export async function navigateAndAssert(client, url, expectedViewport) {
  await client.send("Page.bringToFront");
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(`Navigation failed for ${url}: ${result.errorText}`);
  await loaded;
  await waitForPageSettle(client);
  return assertForeground(client, expectedViewport);
}

export async function assertForeground(client, expectedViewport) {
  await client.send("Page.bringToFront");
  const actual = await evaluate(client, "({visibility:document.visibilityState,hasFocus:document.hasFocus(),width:innerWidth,height:innerHeight,scrollX,scrollY})");
  if (actual.visibility !== "visible" || actual.hasFocus !== true) throw new Error(`CDP page is not foreground: ${JSON.stringify(actual)}`);
  if (expectedViewport && (actual.width !== expectedViewport.width || actual.height !== expectedViewport.height)) {
    throw new Error(`CDP viewport mismatch: expected ${expectedViewport.width}x${expectedViewport.height}; got ${actual.width}x${actual.height}`);
  }
  return actual;
}

export async function waitForPageSettle(client, { minimumMs = 350, timeoutMs = 12000 } = {}) {
  const expression = `(async()=>{const start=performance.now();await(document.fonts?.ready??Promise.resolve());const imgs=[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight});await Promise.race([Promise.all(imgs.map(i=>i.decode?.().catch(()=>{})??Promise.resolve())),new Promise(r=>setTimeout(r,4000))]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,${minimumMs}))));return {elapsedMs:performance.now()-start,fontStatus:document.fonts?.status??'unsupported',images:imgs.length}})()`;
  return evaluate(client, expression, timeoutMs);
}

export async function resetLabCase(client) {
  const result = await evaluate(client, `(async()=>{
    const api=window.__PHASE302_QA__;
    const resetResult=typeof api?.reset==='function'?await api.reset():null;
    localStorage.clear();sessionStorage.clear();window.scrollTo({top:0,left:0,behavior:'instant'});
    return {apiReady:!!api,resetAvailable:typeof api?.reset==='function',resetResult};
  })()`);
  if (!result.apiReady) throw new Error("Phase 3.0.1 lab API is not installed on this page.");
  await waitForPageSettle(client, { minimumMs: 80 });
  return result;
}

export async function waitForLabApi(client, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(client, `(()=>{const api=window.__PHASE302_QA__;return api?{version:api.version,ready:api.version===1&&api.ready!==false,methods:['apply','render','reset','readBlob','releaseBlob'].filter(k=>typeof api[k]==='function')} : null})()`);
    if (last?.ready && last.methods.includes("apply") && last.methods.includes("render")) return last;
    await sleep(100);
  }
  throw new Error(`Phase 3.0.1 lab API did not become ready: ${JSON.stringify(last)}`);
}

export async function readDocumentFontCache(client) {
  return evaluate(client, `({status:document.fonts?.status??'unsupported',faces:Array.from(document.fonts??[]).map((face)=>({family:String(face.family).replace(/[\"']/g,''),weight:face.weight,status:face.status})),readAt:performance.now()})`);
}

export async function applyLabCase(client, payload) {
  const startedAt = performance.now();
  const result = await evaluate(client, `(async()=>await window.__PHASE302_QA__.apply(${JSON.stringify(payload)}))()`, 60000);
  const apiWallMs = performance.now() - startedAt;
  await waitForPageSettle(client, { minimumMs: 80 });
  const state = await evaluate(client, `(()=>{
    const card=document.querySelector('article[data-card-render-scope][data-master-id]');
    if(!card)return {found:false};
    const r=card.getBoundingClientRect();
    const rect=(el)=>{const x=el.getBoundingClientRect();return {x:x.x+scrollX,y:x.y+scrollY,width:x.width,height:x.height}};
    const roleNodes=[...card.querySelectorAll('[data-master-typography-role]')];
    const roleIndexes=new Map(roleNodes.map((el,index)=>[el,index]));
    const textRuns=roleNodes.map((el,index)=>{
      const s=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);
      const lineRects=[...range.getClientRects()].map(r=>({x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}));
      let opacity=1,current=el,hiddenAncestor=false;
      while(current instanceof Element){const style=getComputedStyle(current);opacity*=Number(style.opacity||1);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')hiddenAncestor=true;current=current.parentElement}
      const fontSize=parseFloat(s.fontSize)||0;
      const parentRole=el.parentElement?.closest('[data-master-typography-role]')??null;
      const childRole=el.querySelector('[data-master-typography-role]');
      const text=(el.innerText||el.textContent||'').trim();
      return {nodeIndex:index,parentRoleIndex:parentRole?roleIndexes.get(parentRole)??null:null,isLeaf:!childRole,painted:!hiddenAncestor&&opacity>0&&fontSize>0&&lineRects.some(r=>r.width>0&&r.height>0),role:el.getAttribute('data-master-typography-role'),field:el.getAttribute('data-field'),text,declaredStack:s.fontFamily,weight:s.fontWeight,size:s.fontSize,tracking:s.letterSpacing,lineHeight:s.lineHeight,fontStyle:s.fontStyle,textTransform:s.textTransform,rect:rect(el),ink:rect(range),inkLineCount:lineRects.length,inkLineRects:lineRects};
    });
    const icon=card.querySelector('[data-icon-source]');
    const opacityAudit=(el)=>{let product=1,current=el;const chain=[];while(current instanceof Element){const s=getComputedStyle(current),parsed=Number(s.opacity),opacity=Number.isFinite(parsed)?parsed:1;product*=opacity;chain.push({tag:current.tagName.toLowerCase(),className:typeof current.className==='string'?current.className:'',primarySlot:current.hasAttribute('data-phase302-primary-slot'),opacity});current=current.parentElement}return {product,chain}};
    const markElements=[...card.querySelectorAll('[data-icon-source]')].map(el=>{const s=getComputedStyle(el),box=rect(el),effective=opacityAudit(el),glyph=el.querySelector('.officialGlyph'),glyphColor=glyph?getComputedStyle(glyph).backgroundColor:null;return {source:el.getAttribute('data-icon-source'),jobId:el.getAttribute('data-job-id'),src:el.getAttribute('data-icon-src')??el.getAttribute('src'),variant:el.getAttribute('data-job-mark-variant'),rect:box,display:s.display,visibility:s.visibility,opacity:s.opacity,color:s.color,jobIconColor:s.getPropertyValue('--job-icon-color').trim(),glyphColor,effectiveOpacity:effective.product,opacityChain:effective.chain,visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&box.width>0&&box.height>0}});
    const containsUnofficial=(value)=>{const lower=value.toLocaleLowerCase();return lower.includes('unofficial')||lower.includes('fan-made')||lower.includes('fan made')||value.includes('비공식')||value.includes('팬메이드')||value.includes('非公式')||value.includes('ファンメイド')};
    const unofficialVisibleCount=containsUnofficial(card.innerText||'')?1:0;
    const unofficialCopyHiddenCount=card.querySelectorAll('[data-phase302-unofficial-copy="hidden"]').length;
    const images=[...card.querySelectorAll('img')].map((img)=>{const s=getComputedStyle(img);return {src:img.getAttribute('src'),currentSrc:img.currentSrc,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,objectFit:s.objectFit,objectPosition:s.objectPosition,loaded:img.complete&&img.naturalWidth>0}});
    const optical=[...card.querySelectorAll('[data-optical-ready]')].map(el=>({ready:el.getAttribute('data-optical-ready'),size:el.getAttribute('data-optical-size'),width:el.getAttribute('data-optical-width'),height:el.getAttribute('data-optical-height'),ink:el.getAttribute('data-optical-ink'),font:getComputedStyle(el).fontFamily,fontSize:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight,tracking:getComputedStyle(el).letterSpacing,lineHeight:getComputedStyle(el).lineHeight}));
    const primarySlot=card.querySelector('[data-phase302-primary-slot]');
    const ribbonEmblem=card.querySelector('[data-phase302-ribbon-emblem]');
    const ribbonRule=card.querySelector('[data-phase302-ribbon-rule]');
    return {found:true,masterId:card.getAttribute('data-master-id'),lang:card.getAttribute('lang'),ratio:card.getAttribute('data-ratio')??getComputedStyle(card).aspectRatio,rect:rect(card),textRuns,images,optical,jobMark:icon?{source:icon.getAttribute('data-icon-source'),jobId:icon.getAttribute('data-job-id'),src:icon.getAttribute('data-icon-src')??icon.getAttribute('src'),variant:icon.getAttribute('data-job-mark-variant'),iconRect:rect(icon),primarySlotRect:primarySlot?rect(primarySlot):null,markElements,visibleDomMarkCount:markElements.filter(mark=>mark.visible).length}:null,correctionGeometry:{ribbonEmblemRect:ribbonEmblem?rect(ribbonEmblem):null,ribbonRuleRect:ribbonRule?rect(ribbonRule):null},unofficialVisibleCount,unofficialCopyHiddenCount,visible:r.width>0&&r.height>0};
  })()`);
  if (!state.found || !state.visible) throw new Error(`Lab card missing/hidden after apply: ${JSON.stringify({ payload, state })}`);
  return { case: payload, apiResult: result, apiWallMs, state };
}

export async function captureCardScreenshot(client, caseId, cardSelector = "article[data-card-render-scope][data-master-id]") {
  const rasterScale = 2.5;
  const rect = await evaluate(client, `(()=>{const el=document.querySelector(${JSON.stringify(cardSelector)});if(!el)return null;el.scrollIntoView({behavior:'instant',block:'center',inline:'center'});const r=el.getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()`);
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error(`Missing actual card for screenshot case ${caseId}.`);
  await waitForPageSettle(client, { minimumMs: 80 });
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png", fromSurface: true, captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: rasterScale },
  }, 60000);
  const bytes = Buffer.from(screenshot.data, "base64");
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") throw new Error(`Preview screenshot for ${caseId} is not a valid PNG.`);
  const pixelDimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  const expectedPixelDimensions = { width: Math.round(rect.width * rasterScale), height: Math.round(rect.height * rasterScale) };
  if (Math.abs(pixelDimensions.width - expectedPixelDimensions.width) > 1 || Math.abs(pixelDimensions.height - expectedPixelDimensions.height) > 1) {
    throw new Error(`Preview screenshot raster scale mismatch for ${caseId}: expected ${expectedPixelDimensions.width}x${expectedPixelDimensions.height} at ${rasterScale}x from ${rect.width}x${rect.height}; received ${pixelDimensions.width}x${pixelDimensions.height}.`);
  }
  await mkdir(rawRoot, { recursive: true });
  const filename = `${safeFileName(caseId)}.png`;
  const output = path.join(rawRoot, filename);
  await writeFile(output, bytes);
  return { path: path.posix.join("raw", filename), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), cardRect: rect, rasterScale, expectedPixelDimensions, pixelDimensions };
}

export async function inspectGlyphFaces(client, { cardSelector = "article[data-card-render-scope][data-master-id]", caseInput = {}, fontManifest = null, requestedFaces = [], expectedFacesSource = "unavailable", expectedFacesSourceByRole = {}, expectedGenreSource = "unavailable", expectedGenreSourceByRole = {}, familyGenreByName = {}, allowedCustomFaces = [], roleP0Exceptions = [], p0ReferenceRuns = [], p0ExpectedFacesByField = {}, jobMarkVariant = null } = {}) {
  await Promise.all([client.send("DOM.enable"), client.send("CSS.enable")]);
  const flatNodes = (await client.send("DOM.getFlattenedDocument", { depth: -1, pierce: true })).nodes ?? [];
  const flatById = new Map(flatNodes.map((node) => [node.nodeId, node]));
  const cardNodeId = await client.send("DOM.querySelector", {
    nodeId: (await client.send("DOM.getDocument", { depth: 0 })).root.nodeId,
    selector: cardSelector,
  }).then((result) => result.nodeId);
  if (!cardNodeId) throw new Error(`No card node found for actual-font inspection: ${cardSelector}`);
  const attrs = (node) => {
    const list = node?.attributes ?? [];
    return Object.fromEntries(Array.from({ length: Math.floor(list.length / 2) }, (_, index) => [list[index * 2], list[index * 2 + 1]]));
  };
  const normalizedGenreMap = new Map(Object.entries(familyGenreByName).map(([family, genre]) => [normalizeFace(family), genre]));
  const roleNodes = await client.send("DOM.querySelectorAll", { nodeId: cardNodeId, selector: "[data-master-typography-role]" });
  const textFor = (node) => {
    if (node.nodeType === 3) return node.nodeValue ?? "";
    return (node.children ?? []).map(textFor).join("");
  };
  async function textPaintState(nodeId) {
    const resolved = await client.send("DOM.resolveNode", { nodeId });
    if (!resolved.object?.objectId) return { paintable: null, reason: "DOM.resolveNode returned no object" };
    const response = await client.send("Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function(){
        const target=this,s=getComputedStyle(target),range=document.createRange();range.selectNodeContents(target);
        const rects=[...range.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}));
        const alpha=(value)=>{if(value==='transparent')return 0;const rgba=value.match(/rgba\\([^,]+,[^,]+,[^,]+,\\s*([0-9.]+)\\s*\\)/i);return rgba?Number(rgba[1]):1};
        let opacity=1,current=target,hiddenAncestor=false;
        while(current instanceof Element){const cs=getComputedStyle(current);opacity*=Number(cs.opacity||1);if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse')hiddenAncestor=true;current=current.parentElement}
        const fontSize=parseFloat(s.fontSize)||0,colorAlpha=alpha(s.color),fill=s.webkitTextFillColor||s.color,fillAlpha=alpha(fill),backgroundText=s.webkitBackgroundClip.split(',').some(v=>v.trim()==='text')&&s.backgroundImage!=='none';
        const hasVisibleFill=colorAlpha>0||fillAlpha>0||backgroundText;
        const paintable=!hiddenAncestor&&opacity>0&&fontSize>0&&hasVisibleFill&&rects.some(r=>r.width>0&&r.height>0);
        const secondaryMark=target.closest('[data-phase302-secondary-mark="true"]');
        const secondaryContainer=target.closest('[data-phase302-secondary-container="true"]');
        return {paintable,reason:paintable?(backgroundText&&colorAlpha===0&&fillAlpha===0?'background-clipped-text':'painted'):hiddenAncestor?'hidden-ancestor':fontSize===0?'font-size-zero':opacity===0?'opacity-zero':colorAlpha===0&&fillAlpha===0?'text-fill-transparent':'no-text-range-ink',fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,opacity,textFillColor:fill,backgroundClip:s.webkitBackgroundClip,backgroundImage:s.backgroundImage,rectCount:rects.length,rects,insideSecondaryHiddenMarker:Boolean(secondaryMark||secondaryContainer),secondaryHiddenMarkerKind:secondaryMark?'secondary-mark':secondaryContainer?'secondary-container':null};
      }`,
      returnByValue: true,
    });
    if (response.exceptionDetails) return { paintable: null, reason: response.exceptionDetails.text ?? "paintability inspection failed" };
    return response.result?.value ?? { paintable: null, reason: "paintability returned no value" };
  }
  const rows = [];
  for (const nodeId of roleNodes.nodeIds ?? []) {
    const { node } = await client.send("DOM.describeNode", { nodeId, depth: -1 });
    const attributes = attrs(node);
    const text = textFor(node).trim();
    if (!text) continue;
    const ancestorAttributes = [];
    let ancestor = flatById.get(nodeId);
    while (ancestor && ancestor.nodeId !== cardNodeId) {
      ancestor = flatById.get(ancestor.parentId);
      if (ancestor) ancestorAttributes.push(attrs(ancestor));
    }
    const field = attributes["data-field"] ?? ancestorAttributes.find((value) => value["data-field"])?.["data-field"] ?? null;
    const role = attributes["data-master-typography-role"] ?? null;
    const elementLang = attributes.lang ?? ancestorAttributes.find((value) => value.lang)?.lang ?? null;
    const script = independentScriptForText(text, elementLang, caseInput, field);
    const classes = String(attributes.class ?? "").split(/\s+/).filter(Boolean);
    const paintState = await textPaintState(nodeId);
    const hiddenAbbreviationReplacedByIcon = paintState.paintable === false && jobMarkVariant === "B" && /abbreviation/i.test(String(field ?? ""));
    const intentionallyHiddenFallbackDuplicate = field === "phase302-fallback-mark" &&
      (jobMarkVariant === "B" || jobMarkVariant === "C") && paintState.insideSecondaryHiddenMarker === true &&
      paintState.paintable === false && paintState.reason === "hidden-ancestor";
    const isUnofficialMarker = (value) => Object.prototype.hasOwnProperty.call(value, "data-phase302-unofficial") ||
      value["data-phase302-unofficial-copy"] === "hidden";
    const hasUnofficialMarker = isUnofficialMarker(attributes) || ancestorAttributes.some(isUnofficialMarker);
    const intentionallyRemovedUnofficialNotice = hasUnofficialMarker && paintState.paintable === false && paintState.reason === "hidden-ancestor";
    const normalizedText = text.replace(/\s+/g, " ").trim();
    const roleP0Exception = hiddenAbbreviationReplacedByIcon ? null : (roleP0Exceptions.find((exception) => {
      const exceptionField = exception.field ?? exception.dataField ?? exception.fieldName;
      const exceptionRole = exception.role ?? exception.typographyRole ?? exception.masterRole;
      const exceptionText = exception.textSample ?? exception.sampleText ?? exception.text;
      const exceptionClass = exception.classMarker ?? exception.className ?? exception.marker;
      const selectors = [exception.selector, exception.cssSelector].filter((value) => typeof value === "string");
      const selectorClasses = selectors.flatMap((selector) => [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
      const hasClassMarker = (marker) => classes.some((name) => name === String(marker).replace(/^\./, "") || name.includes(String(marker).replace(/^\./, "")));
      const classMatches = !exceptionClass && selectorClasses.length === 0 ||
        (exceptionClass && hasClassMarker(exceptionClass)) || selectorClasses.some(hasClassMarker);
      const hasNodeIdentity = Boolean(exceptionField || exceptionText || exceptionClass || selectorClasses.length);
      return hasNodeIdentity && (!exceptionField || exceptionField === field) && (!exceptionRole || exceptionRole === role) &&
        (!exceptionText || String(exceptionText).replace(/\s+/g, " ").trim() === normalizedText) && classMatches;
    }) ?? null);
    const policySetId = independentExpectedSet(caseInput, role, field, classes);
    const independentPlan = policySetId === "P0" ? null : independentFontPlan(fontManifest, policySetId, script);
    const p0Required = Boolean(roleP0Exception || policySetId === "P0");
    const p0ManifestFacePolicy = p0ExpectedFacesByField[field] ?? null;
    const p0ManifestFont = p0ManifestFacePolicy ? fontManifest?.fonts?.[p0ManifestFacePolicy.fontId] : null;
    const p0ManifestFiles = (p0ManifestFont?.files ?? []).filter((file) => file.script === p0ManifestFacePolicy?.script);
    const p0PolicyCssWeight = Number(paintState.fontWeight);
    const p0ManifestMatchedWeight = p0ManifestFont && p0ManifestFiles.length > 0 && Number.isFinite(p0PolicyCssWeight)
      ? cssMatchedFontWeight(p0ManifestFont, p0ManifestFiles, p0PolicyCssWeight)
      : null;
    const p0ManifestFamilyNames = [p0ManifestFont?.family, p0ManifestFont?.internalFamily].filter(Boolean).map(normalizeFace);
    const p0ManifestFacePolicyAudit = p0ManifestFacePolicy ? {
      fontId: p0ManifestFacePolicy.fontId,
      familyName: p0ManifestFacePolicy.familyName,
      postScriptName: p0ManifestFacePolicy.postScriptName,
      script: p0ManifestFacePolicy.script,
      cssWeight: p0ManifestFacePolicy.cssWeight,
      manifestFamily: p0ManifestFont?.family ?? null,
      manifestInternalFamily: p0ManifestFont?.internalFamily ?? null,
      manifestGenre: p0ManifestFont?.genre ?? null,
      manifestScripts: p0ManifestFont?.scripts ?? [],
      manifestMatchedWeight: p0ManifestMatchedWeight,
      verifiedByPhase301Cases: p0ManifestFacePolicy.verifiedByPhase301Cases ?? [],
      pass: Boolean(p0ManifestFont && p0ManifestFamilyNames.includes(normalizeFace(p0ManifestFacePolicy.familyName)) &&
        p0ManifestFont.genre === p0ManifestFacePolicy.genre && p0ManifestFont.scripts?.includes(p0ManifestFacePolicy.script) &&
        p0ManifestFacePolicy.isCustomFont === true && Number(p0ManifestFacePolicy.cssWeight) === p0PolicyCssWeight &&
        p0ManifestMatchedWeight === Number(p0ManifestFacePolicy.cssWeight) &&
        typeof p0ManifestFacePolicy.postScriptName === "string" && p0ManifestFacePolicy.postScriptName.length > 0 &&
        (p0ManifestFacePolicy.verifiedByPhase301Cases?.length ?? 0) === phase301E2ReferenceJobs.length),
    } : null;
    const p0ReferenceRow = p0Required ? p0ReferenceRuns.find((reference) =>
      (!field || reference.field === field) && (!role || reference.role === role) &&
      String(reference.text).replace(/\s+/g, " ").trim() === normalizedText &&
      (!classes.length || !reference.classNames?.length || classes.some((name) => reference.classNames.includes(name)))
    ) ?? null : null;
    const p0ExpectedFonts = p0ReferenceRow?.actualPlatformFonts?.filter((font) => font.glyphCount > 0) ??
      (p0ManifestFacePolicyAudit?.pass ? [{
        familyName: p0ManifestFacePolicy.familyName,
        postScriptName: p0ManifestFacePolicy.postScriptName,
        isCustomFont: p0ManifestFacePolicy.isCustomFont,
        glyphCount: 1,
      }] : []);
    const p0ExpectedFaces = p0ExpectedFonts.map((font) => font.familyName);
    const p0ExpectedGenre = p0ReferenceRow?.actualGenres?.find((font) => font.genre)?.genre ??
      roleP0Exception?.expectedGenre ?? roleP0Exception?.genre ?? (p0ManifestFacePolicyAudit?.pass ? p0ManifestFacePolicy.genre : null);
    const platformFonts = (await client.send("CSS.getPlatformFontsForNode", { nodeId })).fonts ?? [];
    const declaredP0ExpectedFamily = roleP0Exception?.expectedFaces ?? roleP0Exception?.expectedFace ?? roleP0Exception?.expectedFamily ?? roleP0Exception?.familyName ?? roleP0Exception?.family ?? null;
    const manifestExpectedFamilies = caseInput.expectedFacesByRole?.[role] ?? caseInput.roleFamilies?.[role] ?? null;
    const manifestExpectedGenre = caseInput.expectedGenreByRole?.[role] ?? null;
    const expectedFamily = p0Required
      ? (p0ExpectedFaces.length ? p0ExpectedFaces : declaredP0ExpectedFamily)
      : manifestExpectedFamilies ?? independentPlan?.families ?? null;
    const expectedGenre = p0Required
      ? p0ExpectedGenre
      : manifestExpectedGenre ?? independentPlan?.genres[0] ?? null;
    const expectedFamilySource = p0Required
      ? (p0ReferenceRow ? "untouched-P0-reference-run" : p0ManifestFacePolicyAudit?.pass ? "phase301-font-assets-manifest+verified-P0-physical-face" : "P0-exception-without-reference")
      : manifestExpectedFamilies ? (expectedFacesSourceByRole[role] ?? expectedFacesSource) : independentPlan ? "role-policy+font-assets-manifest" : "role-policy-unmapped";
    const rowExpectedGenreSource = p0Required
      ? (p0ReferenceRow ? "untouched-P0-reference-run" : p0ManifestFacePolicyAudit?.pass ? "phase301-font-assets-manifest+verified-P0-physical-face" : "P0-exception-without-reference")
      : manifestExpectedGenre ? (expectedGenreSourceByRole[role] ?? expectedGenreSource) : independentPlan ? "role-policy+font-assets-manifest" : "role-policy-unmapped";
    const intendedFamilies = normalizeFamilyList(expectedFamily);
    const request = requestedFaces.find((face) => face.role === role && (face.field ?? null) === field && String(face.text ?? "").replace(/\s+/g, " ").trim() === normalizedText) ??
      requestedFaces.find((face) => face.role === role && (face.field ?? null) === field && face.script === script) ?? null;
    const expectedFontIds = p0Required ? [] : independentPlan?.fontIds ?? [];
    const requestFontIds = request?.fontIds ?? [];
    const requestMapPass = p0Required
      ? !request
      : Boolean(request && request.fontSet === policySetId && request.script === script && expectedFontIds.length > 0 && expectedFontIds.length === requestFontIds.length && expectedFontIds.every((fontId) => requestFontIds.includes(fontId)) && request.applied === true);
    const requestRefs = request?.faceRefs ?? [];
    const computedCssWeight = Number(paintState.fontWeight);
    const requestWeightChecks = p0Required ? [] : expectedFontIds.map((fontId) => {
      const reference = requestRefs.find((face) => face.fontId === fontId);
      const font = fontManifest?.fonts?.[fontId];
      const requestedScript = reference?.script ?? script;
      const scriptFiles = (font?.files ?? []).filter((file) => file.script === requestedScript);
      const expectedMatchedWeight = Number.isFinite(computedCssWeight) ? cssMatchedFontWeight(font, scriptFiles, computedCssWeight) : null;
      const recordedMatchedWeight = Number(reference?.matchedWeight);
      const appliedCssWeight = Number(reference?.appliedWeight);
      return {
        fontId,
        script: requestedScript,
        computedCssWeight: Number.isFinite(computedCssWeight) ? computedCssWeight : null,
        requestedWeight: Number.isFinite(Number(reference?.requestedWeight)) ? Number(reference.requestedWeight) : null,
        appliedWeight: Number.isFinite(appliedCssWeight) ? appliedCssWeight : null,
        matchedWeight: Number.isFinite(recordedMatchedWeight) ? recordedMatchedWeight : null,
        expectedMatchedWeight,
        availableWeights: describeFileWeights(font, scriptFiles),
        pass: Boolean(reference && Number.isFinite(computedCssWeight) && appliedCssWeight === computedCssWeight &&
          expectedMatchedWeight !== null && recordedMatchedWeight === expectedMatchedWeight),
      };
    });
    const requestWeightMismatch = requestWeightChecks.some((check) => !check.pass);
    const expectedFaceMapped = p0Required ? p0ExpectedFaces.length > 0 : Boolean(independentPlan?.fontIds?.length || manifestExpectedFamilies);
    const p0ExpectedIdentities = new Set(p0ExpectedFonts.map((font) => `${normalizeFace(font.familyName)}|${normalizeFace(font.postScriptName ?? "")}|${font.isCustomFont}`));
    const actualFaceMatches = platformFonts.filter((font) => font.glyphCount > 0).map((font) => {
      if (p0Required) {
        const identity = `${normalizeFace(font.familyName)}|${normalizeFace(font.postScriptName ?? "")}|${font.isCustomFont}`;
        const match = p0ExpectedIdentities.has(identity);
        const manifestBackedFace = match && p0ManifestFacePolicyAudit?.pass;
        return {
          font,
          match,
          matchedFontId: manifestBackedFace ? p0ManifestFacePolicy.fontId : null,
          script: manifestBackedFace ? p0ManifestFacePolicy.script : null,
          weight: manifestBackedFace ? p0ManifestFacePolicy.cssWeight : null,
          matchMode: manifestBackedFace ? "font-assets-manifest+verified-P0-physical-face" : "exact-P0-reference",
          expectedPostScriptNames: p0ExpectedFonts.map((expected) => expected.postScriptName).filter(Boolean),
        };
      }
      if (independentPlan) {
        const match = matchPlatformFontToPlan(font, independentPlan, request, fontManifest);
        return { font, match: match.matched, matchedFontId: match.fontId, script: match.script, weight: match.weight, matchMode: match.mode, expectedPostScriptNames: match.expectedPostScriptNames };
      }
      const match = intendedFamilies.includes(normalizeFace(font.familyName));
      return { font, match, matchedFontId: null, matchMode: "manifest-family-list" };
    });
    const unmatchedActualFaces = actualFaceMatches.filter((row) => !row.match).map((row) => row.font.familyName);
    const actualFaceProofPass = actualFaceMatches.length > 0 && unmatchedActualFaces.length === 0;
    const actualIdentities = new Set(platformFonts.filter((font) => font.glyphCount > 0).map((font) => `${normalizeFace(font.familyName)}|${normalizeFace(font.postScriptName ?? "")}|${font.isCustomFont}`));
    const p0IdentityExpectationPresent = Boolean(p0ReferenceRow || p0ManifestFacePolicyAudit?.pass);
    const p0ExceptionPass = Boolean(p0Required && p0IdentityExpectationPresent && p0ExpectedIdentities.size > 0 && p0ExpectedIdentities.size === actualIdentities.size && [...p0ExpectedIdentities].every((identity) => actualIdentities.has(identity)));
    const systemFallbacks = platformFonts.filter((font) => !font.isCustomFont && font.glyphCount > 0);
    // Platform font family names can be weight-specific/localized (for
    // example, "SUIT Medium"). The exact per-file PostScript + script +
    // weight match above is authoritative for these faces.
    const actualMatchFor = (font) => actualFaceMatches.find((row) => row.font === font) ?? null;
    const unexpectedCustomFaces = platformFonts.filter((font) => {
      if (!font.isCustomFont || font.glyphCount <= 0) return false;
      return !actualMatchFor(font)?.match;
    });
    const actualGenres = platformFonts.filter((font) => font.glyphCount > 0).map((font) => {
      const matched = actualMatchFor(font);
      const manifestGenre = matched?.matchedFontId ? fontManifest?.fonts?.[matched.matchedFontId]?.genre : null;
      const nameGenre = normalizedGenreMap.get(normalizeFace(font.familyName)) ??
        normalizedGenreMap.get(normalizeFace(font.postScriptName ?? "")) ?? null;
      return {
        familyName: font.familyName,
        postScriptName: font.postScriptName ?? null,
        genre: manifestGenre ?? nameGenre,
        matchedFontId: matched?.matchedFontId ?? null,
        glyphCount: font.glyphCount,
        isCustomFont: font.isCustomFont,
      };
    });
    const genreMismatch = Boolean(expectedGenre && actualGenres.some((font) => font.genre !== null && font.genre !== expectedGenre));
    const genreUnclassified = Boolean(expectedGenre && actualGenres.some((font) => font.genre === null));
    const expectedP0SystemFallback = Boolean(p0Required && p0ExceptionPass && systemFallbacks.length > 0);
    const unexpectedSystemFallback = systemFallbacks.length > 0 && !expectedP0SystemFallback;
    const intentionalNonPainted = hiddenAbbreviationReplacedByIcon || intentionallyRemovedUnofficialNotice || intentionallyHiddenFallbackDuplicate;
    const faceMatchPass = intentionalNonPainted || (p0Required ? p0ExceptionPass : expectedFaceMapped && actualFaceProofPass);
    const expectedP0LegacyGenreFinding = Boolean(p0Required && p0ExceptionPass && (genreMismatch || genreUnclassified));
    rows.push({
      text, field, role, classNames: classes,
      painted: paintState.paintable,
      paintState,
      intentionallyReplacedByMark: hiddenAbbreviationReplacedByIcon,
      intentionallyRemovedUnofficialNotice,
      intentionallyHiddenFallbackDuplicate,
      hiddenFallbackMarkerKind: intentionallyHiddenFallbackDuplicate ? paintState.secondaryHiddenMarkerKind : null,
      replacementMarkVariant: intentionalNonPainted ? jobMarkVariant : null,
      roleP0Exception: roleP0Exception ? { ...roleP0Exception, matchedReferenceCase: p0ReferenceRow?.caseId ?? null, matchedReferenceText: p0ReferenceRow?.text ?? null } : null,
      p0ReferenceRequired: p0Required,
      p0ManifestFacePolicyAudit,
      roleP0ExceptionPass: p0Required ? p0ExceptionPass : null,
      independentRolePolicy: { policySetId, script, expectedFontIds, actualRequestFontIds: requestFontIds, requestMapPass },
      requestWeightMismatch,
      requestWeightChecks,
      actualFaceMatches: actualFaceMatches.map((row) => ({ familyName: row.font.familyName, postScriptName: row.font.postScriptName, matched: row.match, matchedFontId: row.matchedFontId, matchedScript: row.script ?? null, matchedWeight: row.weight ?? null, matchMode: row.matchMode, expectedPostScriptNames: row.expectedPostScriptNames ?? null })),
      expectedP0SystemFallback,
      intendedCandidateFace: expectedFamily,
      expectedFaceSource: expectedFamilySource,
      intendedFamilies,
      expectedFaceMapped: expectedFaceMapped || hiddenAbbreviationReplacedByIcon,
      faceMatchPass,
      unmatchedActualFaces,
      expectedGenre,
      expectedGenreSource: rowExpectedGenreSource,
      actualPlatformFonts: platformFonts.map((font) => ({ familyName: font.familyName, postScriptName: font.postScriptName, isCustomFont: font.isCustomFont, glyphCount: font.glyphCount })),
      actualGenres,
      queriedNodeType: "role-text-element",
      systemFallback: systemFallbacks.length > 0,
      systemFallbacks: systemFallbacks.map((font) => ({ familyName: font.familyName, postScriptName: font.postScriptName, glyphCount: font.glyphCount })),
      unexpectedCustomFaces: unexpectedCustomFaces.map((font) => ({ familyName: font.familyName, postScriptName: font.postScriptName, glyphCount: font.glyphCount })),
      genreMismatch,
      genreUnclassified,
      expectedP0LegacyGenreFinding,
      unexpectedSystemFallback,
      unexpectedGenreMismatch: genreMismatch && !expectedP0LegacyGenreFinding,
      unexpectedGenreUnclassified: genreUnclassified && !expectedP0LegacyGenreFinding,
    });
  }
  return {
    method: "CSS.getPlatformFontsForNode",
    granularity: "individual [data-master-typography-role] text elements inside the real card; each row reports all actual platform faces and glyph counts used by that role span",
    runCount: rows.length,
    systemFallbackRunCount: rows.filter((row) => row.systemFallback).length,
    unexpectedSystemFallbackRunCount: rows.filter((row) => row.unexpectedSystemFallback).length,
    expectedP0SystemFallbackRunCount: rows.filter((row) => row.expectedP0SystemFallback).length,
    missingPlatformFontRunCount: rows.filter((row) => row.painted !== false && row.actualPlatformFonts.length === 0).length,
    intentionallyReplacedTextCount: rows.filter((row) => row.intentionallyReplacedByMark).length,
    intentionallyRemovedUnofficialNoticeCount: rows.filter((row) => row.intentionallyRemovedUnofficialNotice).length,
    intentionallyHiddenFallbackDuplicateCount: rows.filter((row) => row.intentionallyHiddenFallbackDuplicate).length,
    nonPaintedTextAnomalyCount: rows.filter((row) => row.painted === false && !row.intentionallyReplacedByMark && !row.intentionallyRemovedUnofficialNotice && !row.intentionallyHiddenFallbackDuplicate).length,
    roleP0ExceptionRunCount: rows.filter((row) => row.roleP0Exception !== null).length,
    roleP0ExceptionFailureCount: rows.filter((row) => row.roleP0Exception !== null && !row.roleP0ExceptionPass).length,
    allowedCustomFaceCount: allowedCustomFaces.length,
    missingExpectedFaceRunCount: rows.filter((row) => row.painted !== false && !row.expectedFaceMapped && !row.intentionallyReplacedByMark).length,
    independentExpectedFaceMapRunCount: rows.filter((row) => row.expectedFaceMapped && ["role-policy+font-assets-manifest", "font-assets-manifest", "untouched-P0-reference-run", "phase301-font-assets-manifest+verified-P0-physical-face"].includes(row.expectedFaceSource)).length,
    independentExpectedFaceMapMissingRunCount: rows.filter((row) => row.painted !== false && !row.intentionallyReplacedByMark && (!row.expectedFaceMapped || !["role-policy+font-assets-manifest", "font-assets-manifest", "untouched-P0-reference-run", "phase301-font-assets-manifest+verified-P0-physical-face"].includes(row.expectedFaceSource))).length,
    actualFaceMismatchRunCount: rows.filter((row) => row.painted !== false && !row.faceMatchPass).length,
    roleRequestMismatchRunCount: rows.filter((row) => row.painted !== false && row.independentRolePolicy.policySetId !== "P0" && !row.independentRolePolicy.requestMapPass).length,
    requestWeightMismatchRunCount: rows.filter((row) => row.painted !== false && !row.intentionallyReplacedByMark && row.requestWeightMismatch).length,
    expectedGenreMappedRunCount: rows.filter((row) => row.painted !== false && !row.intentionallyReplacedByMark && row.expectedGenre !== null).length,
    independentExpectedGenreMapMissingRunCount: rows.filter((row) => row.painted !== false && !row.intentionallyReplacedByMark &&
      (row.expectedGenre === null || !["role-policy+font-assets-manifest", "font-assets-manifest", "untouched-P0-reference-run", "phase301-font-assets-manifest+verified-P0-physical-face"].includes(row.expectedGenreSource))).length,
    expectedRoleRunCount: rows.length,
    unexpectedCustomFaceRunCount: rows.filter((row) => row.painted !== false && row.unexpectedCustomFaces.length > 0).length,
    genreMismatchRunCount: rows.filter((row) => row.genreMismatch).length,
    genreUnclassifiedRunCount: rows.filter((row) => row.genreUnclassified).length,
    unexpectedGenreMismatchRunCount: rows.filter((row) => row.unexpectedGenreMismatch).length,
    unexpectedGenreUnclassifiedRunCount: rows.filter((row) => row.unexpectedGenreUnclassified).length,
    runs: rows,
  };
}

export async function renderAndSave(client, { caseId, format, scale = 2, expectedBytes = null }) {
  const renderResult = await evaluate(client, `(async()=>await window.__PHASE302_QA__.render({format:${JSON.stringify(format)},scale:${scale}}))()`, 120000);
  const handle = renderResult?.blobId ?? renderResult?.blobHandle ?? renderResult?.id;
  if (!handle) throw new Error(`Lab render did not return a Blob handle: ${JSON.stringify(renderResult)}`);
  const byteLength = Number(renderResult.byteLength ?? renderResult.bytes);
  if (!Number.isFinite(byteLength) || byteLength <= 0) throw new Error(`Lab render returned invalid byte size: ${JSON.stringify(renderResult)}`);
  if (expectedBytes !== null && byteLength !== expectedBytes) throw new Error(`Lab render byte length mismatch: expected ${expectedBytes}, got ${byteLength}`);
  const chunks = [];
  const chunkBytes = 49152;
  for (let offset = 0; offset < byteLength; offset += chunkBytes) {
    const payload = await evaluate(client, `(async()=>await window.__PHASE302_QA__.readBlob(${JSON.stringify(handle)},${offset},${Math.min(chunkBytes, byteLength - offset)}))()`, 60000);
    const base64 = typeof payload === "string" ? payload : payload?.base64;
    if (typeof base64 !== "string") throw new Error(`Blob reader returned no base64 data at byte ${offset}.`);
    chunks.push(Buffer.from(base64, "base64"));
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== byteLength) throw new Error(`Retrieved Blob size ${bytes.length} did not match reported ${byteLength}.`);
  const imageMetadata = await sharp(bytes).metadata();
  const actualPixelDimensions = { width: Number(imageMetadata.width), height: Number(imageMetadata.height) };
  const enginePixelDimensions = renderResult.dimensions ? { width: Number(renderResult.dimensions.width), height: Number(renderResult.dimensions.height) } : null;
  if (!actualPixelDimensions.width || !actualPixelDimensions.height || !enginePixelDimensions ||
      actualPixelDimensions.width !== enginePixelDimensions.width || actualPixelDimensions.height !== enginePixelDimensions.height) {
    throw new Error(`Export pixel dimensions do not match the renderer report for ${caseId}/${format}: ${JSON.stringify({ actualPixelDimensions, enginePixelDimensions })}`);
  }
  const logicalDimensions = renderResult.logicalDimensions ?? null;
  const logicalPixelRatio = logicalDimensions?.width && logicalDimensions?.height ? {
    x: actualPixelDimensions.width / Number(logicalDimensions.width),
    y: actualPixelDimensions.height / Number(logicalDimensions.height),
  } : null;
  if (!logicalPixelRatio || Math.abs(logicalPixelRatio.x - 5) > 0.001 || Math.abs(logicalPixelRatio.y - 5) > 0.001) {
    throw new Error(`Export scale is not 5 physical pixels per logical unit for ${caseId}/${format}: ${JSON.stringify({ logicalDimensions, actualPixelDimensions, logicalPixelRatio })}`);
  }
  const fileExtension = format === "webp" ? "webp" : "png";
  await mkdir(rawRoot, { recursive: true });
  const filename = `${safeFileName(caseId)}-2x.${fileExtension}`;
  const output = path.join(rawRoot, filename);
  await writeFile(output, bytes);
  await evaluate(client, `window.__PHASE302_QA__.releaseBlob?.(${JSON.stringify(handle)})??true`);
  return {
    path: path.posix.join("raw", filename),
    format,
    scale,
    mimeType: renderResult.mimeType ?? (format === "webp" ? "image/webp" : "image/png"),
    byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    dimensions: renderResult.dimensions ?? null,
    actualPixelDimensions,
    logicalDimensions,
    logicalPixelRatio,
    timings: { fontLoadMs: renderResult.fontLoadMs ?? null, previewReadyMs: renderResult.previewReadyMs ?? null, rasterMs: renderResult.rasterMs ?? null },
    progress: renderResult.progress ?? null,
    fontCssAudit: renderResult.fontCssAudit ?? null,
  };
}

function geometryRect(value) {
  if (Array.isArray(value) && value.length >= 4) {
    const [x, y, width, height] = value.map(Number);
    return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
  }
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x ?? value.left ?? value.minX);
  const y = Number(value.y ?? value.top ?? value.minY);
  const right = Number(value.right ?? value.maxX);
  const bottom = Number(value.bottom ?? value.maxY);
  const width = Number(value.width ?? (Number.isFinite(right) ? right - x : NaN));
  const height = Number(value.height ?? (Number.isFinite(bottom) ? bottom - y : NaN));
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}

function rectInside(inner, outer, tolerance = 0.75) {
  const a = geometryRect(inner);
  const b = geometryRect(outer);
  if (!a || !b || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.x >= b.x - tolerance && a.y >= b.y - tolerance &&
    a.x + a.width <= b.x + b.width + tolerance && a.y + a.height <= b.y + b.height + tolerance;
}

function normalizedUnitBox(value) {
  const rect = geometryRect(value);
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const epsilon = 0.015;
  return rect.x >= -epsilon && rect.y >= -epsilon && rect.x + rect.width <= 1 + epsilon && rect.y + rect.height <= 1 + epsilon;
}

function auditLeafTextInkOverlaps(textRuns = []) {
  const rows = textRuns.filter((row) => Array.isArray(row.inkLineRects));
  const byIndex = new Map(rows.map((row) => [row.nodeIndex, row]));
  const normalizeText = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
  const isAncestor = (ancestorIndex, childIndex) => {
    let current = byIndex.get(childIndex)?.parentRoleIndex ?? null;
    const visited = new Set();
    while (current !== null && !visited.has(current)) {
      if (current === ancestorIndex) return true;
      visited.add(current);
      current = byIndex.get(current)?.parentRoleIndex ?? null;
    }
    return false;
  };
  const sameTextParentChildExemptions = [];
  const excludedNonLeafPairs = [];
  const overlaps = [];
  let comparedLeafRunPairCount = 0;
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const right = rows[rightIndex];
      const parentChild = isAncestor(left.nodeIndex, right.nodeIndex) || isAncestor(right.nodeIndex, left.nodeIndex);
      if (parentChild && normalizeText(left.text) === normalizeText(right.text)) {
        sameTextParentChildExemptions.push({ left: left.nodeIndex, right: right.nodeIndex, text: normalizeText(left.text) });
        continue;
      }
      if (parentChild || !left.isLeaf || !right.isLeaf || left.painted === false || right.painted === false) {
        if ((parentChild || !left.isLeaf || !right.isLeaf) && left.painted !== false && right.painted !== false) {
          excludedNonLeafPairs.push({ left: left.nodeIndex, right: right.nodeIndex, reason: parentChild ? "nested-role-pair" : "non-leaf-role-pair" });
        }
        continue;
      }
      comparedLeafRunPairCount += 1;
      for (const leftRect of left.inkLineRects) {
        for (const rightRect of right.inkLineRects) {
          const width = Math.min(leftRect.x + leftRect.width, rightRect.x + rightRect.width) - Math.max(leftRect.x, rightRect.x);
          const height = Math.min(leftRect.y + leftRect.height, rightRect.y + rightRect.height) - Math.max(leftRect.y, rightRect.y);
          const area = Math.max(0, width) * Math.max(0, height);
          if (width > 0.5 && height > 0.5 && area >= 1) {
            overlaps.push({
              left: { nodeIndex: left.nodeIndex, field: left.field, role: left.role, text: normalizeText(left.text), rect: leftRect },
              right: { nodeIndex: right.nodeIndex, field: right.field, role: right.role, text: normalizeText(right.text), rect: rightRect },
              intersection: { x: Math.max(leftRect.x, rightRect.x), y: Math.max(leftRect.y, rightRect.y), width, height, areaCssPx2: area },
            });
          }
        }
      }
    }
  }
  return {
    method: "painted-leaf-range-rect-intersections",
    overlapThreshold: { minWidthCssPx: 0.5, minHeightCssPx: 0.5, minAreaCssPx2: 1 },
    paintedRoleRunCount: rows.filter((row) => row.painted !== false).length,
    paintedLeafRunCount: rows.filter((row) => row.painted !== false && row.isLeaf).length,
    comparedLeafRunPairCount,
    sameTextParentChildExemptions,
    excludedNonLeafPairs,
    overlapCount: overlaps.length,
    overlaps,
    pass: overlaps.length === 0,
  };
}

function iconDomSourcePath(dom) {
  if (dom?.imageSrc || dom?.src) return String(dom.imageSrc ?? dom.src);
  const match = String(dom?.maskStyle ?? "").match(/url\(["']?([^"')]+)["']?\)/u);
  return match?.[1] ?? null;
}

function iconDomJobId(dom, fallbackJobId = null) {
  if (dom?.jobId) return String(dom.jobId);
  if (dom?.source === "fallback") return fallbackJobId;
  const source = iconDomSourcePath(dom);
  if (!source) return null;
  const filename = path.posix.basename(source.replaceAll("\\", "/")).replace(/[?#].*$/, "").replace(/\.[^.]+$/, "");
  return filename || null;
}

export async function captureCase(client, caseInput, { cardSelector = "article[data-card-render-scope][data-master-id]", screenshot = true, fontEvidence = true, exports = [], fontManifest = null } = {}) {
  const { p0ReferenceActualFontRuns = [], p0ReferenceRawPath = null, p0ExpectedFacesByField = {}, ...applyPayloadBase } = caseInput;
  const applyPayload = applyPayloadBase.metadataText && !applyPayloadBase.metadataSpecimen
    ? { ...applyPayloadBase, metadataSpecimen: applyPayloadBase.metadataText }
    : applyPayloadBase;
  const reset = await resetLabCase(client);
  const documentFontsBeforeApply = await readDocumentFontCache(client);
  const applied = await applyLabCase(client, applyPayload);
  const inkOverlapAudit = auditLeafTextInkOverlaps(applied.state.textRuns ?? []);
  const foreground = await assertForeground(client);
  const screenshotArtifact = screenshot ? await captureCardScreenshot(client, caseInput.id, cardSelector) : null;
  const api = applied.apiResult ?? {};
  const requestedJobId = String(applyPayload.jobMark?.jobId ?? applyPayload.jobId ?? "red-mage");
  const actualJobId = api.fixture?.cardData?.character?.jobId ?? null;
  const jobMark = api.jobMark ?? {};
  const resolver = jobMark.variant === "A" ? jobMark.secondaryResolver : jobMark.primaryResolver;
  const activeDom = jobMark.variant === "A" ? jobMark.secondaryDom : jobMark.primaryDom;
  const actualResolverSource = resolver?.actualSource ?? resolver?.source ?? null;
  const expectedResolverSource = applyPayload.expectedResolvedSource ?? null;
  const resolverSourcePass = expectedResolverSource === null || actualResolverSource === expectedResolverSource;
  const resolverSrc = resolver?.src ?? null;
  const resolverFileStem = resolverSrc ? path.posix.basename(String(resolverSrc).replaceAll("\\", "/")).replace(/\.[^.]+$/, "") : null;
  const resolverPathPass = !resolverSrc || resolverFileStem === requestedJobId;
  const jobDataPass = actualJobId === requestedJobId;
  const activeDomSourcePath = iconDomSourcePath(activeDom);
  const activeDomJobId = iconDomJobId(activeDom, actualJobId);
  const renderedJobId = activeDomJobId;
  const jobIdMatchesEmblem = renderedJobId === requestedJobId && activeDom?.source === actualResolverSource;
  const markCounts = jobMark.markCounts ?? null;
  const domMarkElements = applied.state.jobMark?.markElements ?? [];
  const visibleDomMarks = domMarkElements.filter((mark) => mark.visible);
  const visibleDomJobIds = visibleDomMarks.map((mark) => iconDomJobId(mark, actualJobId)).filter(Boolean);
  const duplicateJobIds = [...new Set(visibleDomJobIds.filter((id) => visibleDomJobIds.filter((candidate) => candidate === id).length > 1))];
  const oneVisibleJobEmblem = markCounts?.visible === 1 && markCounts.duplicateSourceVisible === false &&
    applied.state.jobMark?.visibleDomMarkCount === 1 && duplicateJobIds.length === 0;
  const opticalFit = jobMark.opticalFit ?? null;
  const activeRect = jobMark.variant === "A" ? jobMark.secondaryRect : jobMark.primaryRect;
  const slotRect = opticalFit?.renderedSlotRect ?? null;
  const visibleRect = opticalFit?.renderedVisibleRect ?? null;
  const alphaBounds = opticalFit?.anyAlphaBoundsAfterTransform ?? null;
  const sourceVisibleBounds = opticalFit?.visibleBoundsAfterTransform ?? null;
  const activeMarkInsideCard = rectInside(activeRect, applied.state.rect);
  const fallbackMark = opticalFit?.sourceKind === "fallback";
  const fallbackRect = activeRect ?? slotRect;
  const visibleShapeInsideSlot = visibleRect ? rectInside(visibleRect, slotRect) : fallbackMark && rectInside(fallbackRect, slotRect);
  const sourceVisibleBoundsValid = fallbackMark ? Boolean(geometryRect(fallbackRect)?.width > 0 && geometryRect(fallbackRect)?.height > 0) : normalizedUnitBox(sourceVisibleBounds);
  const alphaBoundsValid = alphaBounds ? normalizedUnitBox(alphaBounds) : fallbackMark && sourceVisibleBoundsValid;
  const sourceTier = opticalFit?.sourceKind ?? actualResolverSource;
  const sourceTierMatchesResolver = sourceTier === actualResolverSource;
  const fullSilhouetteContained = opticalFit?.contain === true && opticalFit?.clipped === false &&
    visibleShapeInsideSlot && activeMarkInsideCard && sourceVisibleBoundsValid && alphaBoundsValid && sourceTierMatchesResolver;
  const expectedVisualStrength = Number(applyPayload.jobMark?.visualStrength);
  const visibleMarkOpacityRows = visibleDomMarks.map((mark) => mark.effectiveOpacity).filter((value) => Number.isFinite(Number(value))).map(Number);
  const actualVisualStrength = visibleDomMarks.length === 1 && visibleMarkOpacityRows.length === 1 ? visibleMarkOpacityRows[0] : NaN;
  const reportedVisualStrength = Number(jobMark.familyStrength);
  const visualStrengthPass = Number.isFinite(expectedVisualStrength) && Number.isFinite(actualVisualStrength) &&
    Math.abs(expectedVisualStrength - actualVisualStrength) <= 0.001 &&
    Number.isFinite(reportedVisualStrength) && Math.abs(expectedVisualStrength - reportedVisualStrength) <= 0.001;
  const familyTintRequired = applyPayload.master === "editorial" && jobMark.variant !== "A";
  const expectedFamilyTint = phase302SharedEditorialInkColor || null;
  const actualTintMark = visibleDomMarks.length === 1 ? visibleDomMarks[0] : null;
  const actualFamilyTint = actualTintMark?.color ?? null;
  const actualGlyphTint = actualTintMark?.glyphColor ?? null;
  const expectedFamilyRgba = parseComputedRgba(expectedFamilyTint);
  const actualFamilyRgba = parseComputedRgba(actualFamilyTint);
  const actualGlyphRgba = parseComputedRgba(actualGlyphTint);
  const familyTintPass = !familyTintRequired || Boolean(expectedFamilyTint && actualFamilyTint &&
    computedRgbaMatches(expectedFamilyTint, actualFamilyTint) &&
    (!actualGlyphTint || computedRgbaMatches(expectedFamilyTint, actualGlyphTint)));
  const sourceRgbaAudit = {
    applicable: familyTintRequired,
    expectedToken: familyTintRequired ? "familyPalette.editorial.jobIconColor" : null,
    expectedComputedColor: expectedFamilyTint,
    expectedRgba: expectedFamilyRgba,
    actualIconColor: actualFamilyTint,
    actualIconRgba: actualFamilyRgba,
    actualGlyphColor: actualGlyphTint,
    actualGlyphRgba,
    iconColorProperty: actualTintMark?.jobIconColor ?? null,
    source: actualTintMark?.source ?? null,
    referenceJobId: phase302EditorialFamilyPalette?.referenceJobId ?? null,
    referenceCaseId: phase302EditorialFamilyPalette?.referenceCaseId ?? null,
    referenceRawPath: phase302EditorialPaletteReferencePath ? path.relative(evidenceRoot, phase302EditorialPaletteReferencePath).replaceAll("\\", "/") : null,
    observedReferenceColor: phase302ObservedRdmReferenceInkColor,
    pass: familyTintPass,
  };
  const requestedPlacement = applyPayload.jobMark?.placement ?? null;
  const actualPlacement = jobMark.placement ?? null;
  const placementPass = requestedPlacement === null || actualPlacement === requestedPlacement;
  const expectedFullJobName = api.fixture?.cardData?.character?.job ?? null;
  const fullJobName = jobMark.fullJobName ?? null;
  const fullJobNameRect = jobMark.fullJobNameRect ?? null;
  const fullJobNamePass = Boolean(expectedFullJobName && fullJobName === expectedFullJobName && geometryRect(fullJobNameRect)?.width > 0 && geometryRect(fullJobNameRect)?.height > 0);
  const expectedPrimaryTextVisible = jobMark.variant === "C" || jobMark.variant === "A" || applyPayload.master === "editorial" && jobMark.variant === "B";
  const primaryTextVisible = jobMark.primaryTextVisible === true;
  const variantTextHierarchyPass = primaryTextVisible === expectedPrimaryTextVisible && fullJobNamePass;
  const secondaryMarkDispositionPass = jobMark.variant === "A"
    ? jobMark.secondaryProductionMarkRetained === true
    : jobMark.secondaryProductionMarkHiddenForReplacement === true;
  const jobSourceEvidence = {
    requestedJobId, actualJobId, jobDataPass,
    renderedJobId, activeDomSourcePath, jobIdMatchesEmblem,
    markVariant: jobMark.variant ?? applyPayload.jobMark?.variant ?? "A",
    usage: jobMark.variant === "A" ? jobMark.secondaryUsage ?? null : jobMark.primaryUsage ?? null,
    expectedResolvedSource: expectedResolverSource, actualResolvedSource: actualResolverSource,
    resolverSrc, resolverFileStem, resolverSourcePass, resolverPathPass,
    resolverPass: resolverSourcePass && resolverPathPass,
    markCounts,
    duplicateJobIds,
    oneVisibleJobEmblem,
    duplicateSourceVisible: markCounts?.duplicateSourceVisible ?? null,
    primaryText: jobMark.primaryText ?? null,
    primaryTextVisible,
    expectedPrimaryTextVisible,
    fullJobName,
    expectedFullJobName,
    fullJobNameRect,
    variantTextHierarchyPass,
    secondaryMarkDispositionPass,
    visualStrength: {
      requested: Number.isFinite(expectedVisualStrength) ? expectedVisualStrength : null,
      actual: Number.isFinite(actualVisualStrength) ? actualVisualStrength : null,
      reported: Number.isFinite(reportedVisualStrength) ? reportedVisualStrength : null,
      actualVisibleMarkCount: visibleDomMarks.length,
      effectiveOpacityChain: visibleDomMarks.length === 1 ? visibleDomMarks[0].opacityChain ?? [] : [],
      pass: visualStrengthPass,
    },
    placement: { requested: requestedPlacement, actual: actualPlacement, pass: placementPass },
    sourceRgbaAudit,
    opticalFit,
    activeRect,
    activeMarkInsideCard,
    visibleShapeInsideSlot,
    sourceVisibleBoundsValid,
    alphaBoundsValid,
    sourceTierMatchesResolver,
    fullSilhouetteContained,
  };
  const requestedFaceRecords = [
    ...(Array.isArray(api.requestedFaces) ? api.requestedFaces : []),
    ...(Array.isArray(api.readyFaces) ? api.readyFaces : []),
    ...(Array.isArray(api.faceRecords) ? api.faceRecords : []),
  ];
  const requestedAliases = [...new Set(requestedFaceRecords.flatMap((face) => [
    ...(Array.isArray(face.aliases) ? face.aliases : []),
    ...(Array.isArray(face.faceRefs) ? face.faceRefs.map((ref) => ref.alias).filter(Boolean) : []),
  ]).map(normalizeFace))];
  const preloadedAliases = new Set(documentFontsBeforeApply.faces.filter((face) => face.status === "loaded").map((face) => normalizeFace(face.family)));
  const warmAliases = requestedAliases.filter((alias) => preloadedAliases.has(alias));
  const firstLoadAliases = requestedAliases.filter((alias) => !preloadedAliases.has(alias));
  const requestedFacesByRole = {};
  for (const face of requestedFaceRecords) {
    const role = face.role ?? face.typographyRole ?? face.masterRole;
    const family = face.familyName ?? face.family ?? face.name;
    if (!role || !family) continue;
    const current = requestedFacesByRole[role] ?? [];
    current.push(family);
    requestedFacesByRole[role] = current;
  }
  const familyGenreByName = { ...(caseInput.familyGenreByName ?? {}), ...(api.familyGenreByName ?? {}) };
  for (const face of requestedFaceRecords) {
    const family = face.familyName ?? face.family;
    const genre = face.genre ?? face.type;
    if (family && genre) familyGenreByName[normalizeFace(family)] = genre;
  }
  const faceNames = (values) => (Array.isArray(values) ? values : [values]).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (value && typeof value === "object") return [value.familyName ?? value.family ?? value.name].filter(Boolean);
    return [];
  });
  const intendedRoles = { ...requestedFacesByRole, ...(api.requestedFacesByRole ?? {}), ...(caseInput.roleFamilies ?? {}), ...(caseInput.expectedFacesByRole ?? {}) };
  const expectedFaceSource = "api-requested-only";
  const expectedFacesSourceByRole = Object.fromEntries(Object.keys(intendedRoles).map((role) => [role, "api-requested-only"]));
  for (const role of Object.keys(caseInput.roleFamilies ?? {})) expectedFacesSourceByRole[role] = caseInput.roleFamiliesSource ?? "case-manifest";
  for (const role of Object.keys(caseInput.expectedFacesByRole ?? {})) expectedFacesSourceByRole[role] = caseInput.expectedFaceSource ?? "case-manifest";
  const expectedGenreByRole = { ...(api.expectedGenreByRole ?? {}), ...(caseInput.expectedGenreByRole ?? {}) };
  const expectedGenreSource = "api-requested-only";
  const expectedGenreSourceByRole = Object.fromEntries(Object.keys(expectedGenreByRole).map((role) => [role, "api-requested-only"]));
  for (const role of Object.keys(caseInput.expectedGenreByRole ?? {})) expectedGenreSourceByRole[role] = caseInput.expectedGenreSource ?? "case-manifest";
  const allowedCustomFaces = [
    ...faceNames(caseInput.allowedCustomFaces),
    ...faceNames(api.allowedCustomFaces),
    ...faceNames(requestedFaceRecords),
  ];
  const roleP0Exceptions = api.roleP0Exceptions ?? api.makeFaceRequests?.roleP0Exceptions ?? api.fontFacePlan?.roleP0Exceptions ?? [];
  const actualFaces = fontEvidence ? await inspectGlyphFaces(client, {
    cardSelector,
    caseInput: applyPayload,
    fontManifest,
    requestedFaces: requestedFaceRecords,
    intendedRoles,
    expectedFacesSource: expectedFaceSource,
    expectedFacesSourceByRole,
    expectedGenreByRole,
    expectedGenreSource,
    expectedGenreSourceByRole,
    familyGenreByName,
    allowedCustomFaces,
    roleP0Exceptions,
    p0ReferenceRuns: p0ReferenceActualFontRuns,
    p0ExpectedFacesByField,
    jobMarkVariant: applyPayload.jobMark?.variant ?? null,
  }) : null;
  const corrections = api.userCorrections ?? null;
  const ribbon = corrections?.ribbon ?? null;
  const ribbonEmblemRect = applied.state.correctionGeometry?.ribbonEmblemRect ?? null;
  const ribbonLines = ribbon?.lineMeasurements ?? [];
  const expectedRibbonInsets = [3, 6];
  const ribbonInsetPass = ribbonLines.length === 2 && ribbonLines.every((line, index) => {
    const measured = line.measuredPerpendicularInsetCssPx?.mean;
    return Number.isFinite(Number(measured)) && Math.abs(Number(measured) - expectedRibbonInsets[index]) <= 0.2 &&
      Number(line.maxEdgeAngleDeltaDegrees ?? Infinity) <= 0.1;
  });
  // The QA-added generic L remains covered by the per-node glyph-face audit;
  // it is an icon glyph, not an information-size role.
  const bodyRows = (applied.state.textRuns ?? []).filter((row) => row.field !== "name" && row.field !== "phase302-fallback-mark" &&
    !(applyPayload.master === "editorial" && row.field === "jobAbbreviation") &&
    !(applyPayload.jobMark?.variant === "B" && row.field === "jobAbbreviation" && applyPayload.master !== "editorial") &&
    Number.parseFloat(row.size) > 0);
  const commonTypography = api.commonTypography ?? null;
  const expectedBodySizes = commonTypography?.appliedFontSizeCssPx ?? [];
  const bodyFontSizeChecks = bodyRows.map((row) => {
    const matchingSizes = expectedBodySizes.filter((entry) => entry.role === row.role);
    const expected = (matchingSizes.find((entry) => entry.field === row.field) ?? matchingSizes[0])?.px;
    const actual = Number.parseFloat(row.size);
    return { field: row.field, role: row.role, expectedCssPx: Number(expected), actualCssPx: actual, pass: Number.isFinite(Number(expected)) && Number.isFinite(actual) && Math.abs(actual - Number(expected)) <= 0.02 };
  });
  const bodyFontSizePass = bodyFontSizeChecks.length > 0 && bodyFontSizeChecks.every((check) => check.pass);
  const commonTypographyPass = commonTypography?.fontSet === "S1" && commonTypography?.genre === "serif" &&
    Number(commonTypography.logicalPxAt432Width) === 8 && Number(commonTypography.previewPxAt2_5Scale) === 20 && bodyFontSizePass;
  const ribbonEmblemBox = geometryRect(ribbonEmblemRect);
  const cardBox = geometryRect(applied.state.rect);
  const ribbonEmblemSizePass = Boolean(ribbonEmblemBox && cardBox && ribbonEmblemBox.width / cardBox.width >= 0.045 && rectInside(ribbonEmblemBox, cardBox));
  const correctionEvidence = {
    audit: corrections,
    commonHookApplied: corrections?.applied === true,
    unofficialTextHidden: applied.state.unofficialVisibleCount === 0,
    unofficialCopyHiddenNodeCount: applied.state.unofficialCopyHiddenCount ?? null,
    c2DividerRemoved: applyPayload.master !== "cinematic" || corrections?.c2DividerRemoved === true,
    i3RibbonCorrected: applyPayload.master !== "id-card" || Boolean(ribbon?.found && ribbon.geometryApplied && ribbon.outerGeometryPreserved && ribbon.innerLineCount === 2 && ribbon.emblemFound && ribbonInsetPass && ribbonEmblemSizePass),
    ribbonInsetPass: applyPayload.master !== "id-card" || ribbonInsetPass,
    ribbonEmblemRect,
    ribbonEmblemVisibleFraction: ribbonEmblemBox && cardBox ? ribbonEmblemBox.width / cardBox.width : null,
    ribbonEmblemSizePass: applyPayload.master !== "id-card" || ribbonEmblemSizePass,
    commonTypographyPass,
    commonTypography,
    bodyFontSizeChecks,
    bodyFontSizeCssPx: [...new Set(bodyRows.map((row) => Number.parseFloat(row.size)))],
    bodyRoleTextRunCount: bodyRows.length,
  };
  const renderArtifacts = [];
  const fontSignature = (snapshot) => JSON.stringify((snapshot?.runs ?? []).map((row) => ({
    field: row.field,
    role: row.role,
    text: row.text,
    actual: row.actualPlatformFonts.map((font) => ({ familyName: font.familyName, postScriptName: font.postScriptName, isCustomFont: font.isCustomFont, glyphCount: font.glyphCount })),
  })));
  for (const format of exports) {
    const rendered = await renderAndSave(client, { caseId: caseInput.id, format, scale: 2 });
    const postRenderFonts = fontEvidence ? await inspectGlyphFaces(client, {
      cardSelector,
      caseInput: applyPayload,
      fontManifest,
      requestedFaces: requestedFaceRecords,
      intendedRoles,
      expectedFacesSource: expectedFaceSource,
      expectedFacesSourceByRole,
      expectedGenreByRole,
      expectedGenreSource,
      expectedGenreSourceByRole,
      familyGenreByName,
      allowedCustomFaces,
      roleP0Exceptions,
      p0ReferenceRuns: p0ReferenceActualFontRuns,
      p0ExpectedFacesByField,
      jobMarkVariant: applyPayload.jobMark?.variant ?? null,
    }) : null;
    rendered.postRenderFontEvidence = postRenderFonts;
    rendered.domFontSignatureStableAfterRender = Boolean(actualFaces && postRenderFonts && fontSignature(actualFaces) === fontSignature(postRenderFonts));
    renderArtifacts.push(rendered);
  }
  const fallbackFailures = actualFaces?.systemFallbackRunCount ?? null;
  return {
    schema: "phase302-card-case-v1",
    capturedAt: new Date().toISOString(),
    case: applyPayload,
    reset,
    foreground,
    apiResult: api,
    apiWallMs: applied.apiWallMs,
    jobSourceEvidence,
    correctionEvidence,
    fontTiming: {
      cacheClassification: requestedAliases.length === 0 ? "unknown" : firstLoadAliases.length > 0 ? "first-load-or-partially-cold" : "warm-cache",
      requestedAliases,
      aliasesLoadedBeforeApply: warmAliases,
      aliasesLoadedDuringApply: firstLoadAliases,
      documentFaceCountBeforeApply: documentFontsBeforeApply.faces.length,
      loadedFaceCountBeforeApply: documentFontsBeforeApply.faces.filter((face) => face.status === "loaded").length,
      fontLoadMs: api.fontLoadMs ?? null,
      previewReadyMs: api.previewReadyMs ?? null,
    },
    card: applied.state,
    inkOverlapAudit,
    actualFontEvidence: actualFaces,
    systemFallbackPass: fallbackFailures === null ? null : fallbackFailures === 0,
    previewScreenshot: screenshotArtifact,
    exports: renderArtifacts,
    domFontStabilityMismatchCount: renderArtifacts.filter((row) => !row.domFontSignatureStableAfterRender).length,
    p0ReferenceRawPath,
    p0ExpectedFacesByField,
  };
}

export async function writeCaseReport(caseId, report) {
  await mkdir(rawRoot, { recursive: true });
  const filename = `${safeFileName(caseId)}.json`;
  await writeFile(path.join(rawRoot, filename), JSON.stringify(report, null, 2) + "\n");
  return path.posix.join("raw", filename);
}

export function safeFileName(value) {
  const result = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  if (!result) throw new Error(`Invalid artifact name: ${String(value)}`);
  return result;
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFace(value) {
  return String(value).replace(/["']/g, "").trim().toLocaleLowerCase("en-US");
}

function parseComputedRgba(value) {
  const source = String(value ?? "").trim().toLowerCase();
  let channels;
  let scale;
  if (source.startsWith("color(srgb ") && source.endsWith(")")) {
    channels = source.slice("color(srgb ".length, -1).trim().split(/[\s,/]+/).filter(Boolean);
    scale = 1;
  } else if (/^rgba?\(/.test(source) && source.endsWith(")")) {
    channels = source.slice(source.indexOf("(") + 1, -1).trim().split(/[\s,/]+/).filter(Boolean);
    scale = 255;
  } else {
    return null;
  }
  if (channels.length < 3 || channels.length > 4) return null;
  const component = (token, channelScale) => {
    const numeric = Number(token.replace(/%$/, ""));
    if (!Number.isFinite(numeric)) return NaN;
    return token.endsWith("%") ? numeric / 100 : numeric / channelScale;
  };
  const rgba = [component(channels[0], scale), component(channels[1], scale), component(channels[2], scale), channels[3] === undefined ? 1 : component(channels[3], 1)];
  return rgba.every((channel) => Number.isFinite(channel)) ? rgba.map((channel) => Math.min(1, Math.max(0, channel))) : null;
}

function computedRgbaMatches(left, right, tolerance = 1 / 255) {
  const a = parseComputedRgba(left);
  const b = parseComputedRgba(right);
  return Boolean(a && b && a.every((channel, index) => Math.abs(channel - b[index]) <= tolerance));
}

function normalizeFamilyList(value) {
  const values = Array.isArray(value) ? value.flatMap(normalizeFamilyList) : typeof value === "string"
    ? value.split(",")
    : value && typeof value === "object"
      ? normalizeFamilyList(value.familyNames ?? value.families ?? value.familyName ?? value.family ?? value.name ?? [])
      : [];
  return [...new Set(values.map(normalizeFace).filter((family) => family && !["serif", "sans-serif", "monospace", "system-ui", "cursive", "fantasy"].includes(family)))];
}

function scriptKeyForLanguage(value, locale = "en") {
  if (value === "zh-Hans") return "zhHans";
  if (value === "zh-Hant") return "zhHant";
  if (value === "ko") return "korean";
  if (value === "ja") return "japanese";
  if (value === "en") return "latin";
  return locale === "ko" ? "korean" : locale === "ja" ? "japanese" : "latin";
}

function independentScriptForText(text, lang, caseInput, field) {
  const locale = caseInput.locale ?? "en";
  if (field === "name" && caseInput.nameLang) return scriptKeyForLanguage(caseInput.nameLang, locale);
  if (caseInput.metadataLang && caseInput.metadataText === text) return scriptKeyForLanguage(caseInput.metadataLang, locale);
  if (lang?.startsWith("zh-")) return scriptKeyForLanguage(lang, locale);
  if (/[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u.test(text)) return "korean";
  if (/[\u3040-\u30ff\u31f0-\u31ff]/u.test(text)) return "japanese";
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(text)) return locale === "ko" ? "korean" : "japanese";
  return "latin";
}

function independentExpectedSet(caseInput, role, field, classes) {
  // Phase 3.0.2 keeps one common serif body map (S1), while the tested
  // character-name set is selected per family. E2's large decorative RDM
  // abbreviation is the sole intentional P0 typography exception.
  if (caseInput.master === "editorial" && field === "jobAbbreviation" && caseInput.jobMark?.textTypography === "P0") return "P0";
  if (caseInput.master === "editorial" && classes.some((value) => value.includes("mastheadTitle"))) return "P0";
  if (field === "name") return caseInput.nameFontSet ?? caseInput.fontSet ?? (caseInput.master === "editorial" ? "S2" : "S1");
  return caseInput.commonBodyFontSet ?? "S1";
}

function independentFontPlan(fontManifest, setId, script) {
  const set = fontManifest?.sets?.[setId];
  const latinId = set?.latin;
  const scriptId = set?.[script];
  if (!latinId || !scriptId) return null;
  const fontIds = script === "latin" || latinId === scriptId ? [latinId] : [latinId, scriptId];
  const families = [];
  const genres = [];
  for (const fontId of fontIds) {
    const font = fontManifest.fonts?.[fontId];
    if (!font) return null;
    const alias = fontManifest.aliases?.[fontId]?.[fontId === latinId ? "latin" : script];
    families.push(font.family, font.internalFamily, alias);
    genres.push(font.genre);
  }
  return { setId, script, fontIds, families: [...new Set(families.filter(Boolean))], genres: [...new Set(genres.filter(Boolean))] };
}

function fontFileSupportsWeight(font, file, weight) {
  const raw = file.weights ?? font.weights ?? [];
  if (Array.isArray(raw)) return raw.map(Number).includes(Number(weight));
  const values = Array.isArray(raw.values) ? raw.values.map(Number) : [];
  if (values.length) return values.includes(Number(weight));
  const minimum = Number(raw.min ?? weight);
  const maximum = Number(raw.max ?? weight);
  return Number(weight) >= minimum && Number(weight) <= maximum;
}

function describeFileWeights(font, files) {
  const specs = files.map((file) => {
    const raw = file.weights ?? font?.weights ?? [];
    const mode = file.weightMode ?? raw?.mode ?? font?.weightMode ?? "static";
    if (Array.isArray(raw)) return { mode, values: raw.map(Number).filter(Number.isFinite) };
    const values = Array.isArray(raw?.values) ? raw.values.map(Number).filter(Number.isFinite) : [];
    return { mode, values, min: Number(raw?.min), max: Number(raw?.max) };
  });
  const values = [...new Set(specs.flatMap((spec) => spec.values))].sort((a, b) => a - b);
  const variable = specs.filter((spec) => spec.mode === "variable");
  if (variable.length) {
    const minima = variable.map((spec) => Number.isFinite(spec.min) ? spec.min : Math.min(...spec.values));
    const maxima = variable.map((spec) => Number.isFinite(spec.max) ? spec.max : Math.max(...spec.values));
    return { mode: "variable", min: Math.min(...minima), max: Math.max(...maxima), values };
  }
  return { mode: "static", values };
}

function cssMatchedFontWeight(font, files, cssWeight) {
  if (!Number.isFinite(cssWeight) || files.length === 0) return null;
  const availability = describeFileWeights(font, files);
  if (availability.mode === "variable") {
    if (!Number.isFinite(availability.min) || !Number.isFinite(availability.max)) return null;
    return Math.min(availability.max, Math.max(availability.min, cssWeight));
  }
  const values = availability.values;
  if (values.length === 0) return null;
  if (values.includes(cssWeight)) return cssWeight;
  if (cssWeight < 400) {
    return values.filter((value) => value <= cssWeight).sort((a, b) => b - a)[0] ??
      values.filter((value) => value > cssWeight).sort((a, b) => a - b)[0] ?? values[0];
  }
  if (cssWeight <= 500) {
    return values.filter((value) => value >= cssWeight && value <= 500).sort((a, b) => a - b)[0] ??
      values.filter((value) => value < cssWeight).sort((a, b) => b - a)[0] ??
      values.filter((value) => value > 500).sort((a, b) => a - b)[0] ?? values[0];
  }
  return values.filter((value) => value >= cssWeight).sort((a, b) => a - b)[0] ??
    values.filter((value) => value < cssWeight).sort((a, b) => b - a)[0] ?? values[0];
}

function matchPlatformFontToPlan(platformFont, plan, request, fontManifest) {
  const actualFamily = normalizeFace(platformFont.familyName);
  const actualPostScript = normalizeFace(platformFont.postScriptName ?? "");
  for (const fontId of plan?.fontIds ?? []) {
    const font = fontManifest?.fonts?.[fontId];
    if (!font) continue;
    const reference = request?.faceRefs?.find((face) => face.fontId === fontId);
    const script = reference?.script ?? plan.script;
    const weight = Number(reference?.matchedWeight ?? reference?.appliedWeight ?? reference?.requestedWeight ?? 400);
    const aliases = Object.values(fontManifest.aliases?.[fontId] ?? {});
    const familyNames = [font.family, font.internalFamily, ...aliases, ...(font.files ?? []).map((file) => file.internalFamily)].filter(Boolean).map(normalizeFace);
    const files = (font.files ?? []).filter((file) => file.script === script && fontFileSupportsWeight(font, file, weight));
    const staticFiles = files.filter((file) => (file.weightMode ?? font.weightMode) === "static");
    if (staticFiles.length > 0) {
      if (staticFiles.some((file) => normalizeFace(file.postScriptName ?? "") === actualPostScript)) {
        return { matched: true, fontId, script, weight, mode: "static", expectedPostScriptNames: staticFiles.map((file) => file.postScriptName).filter(Boolean) };
      }
      if (familyNames.includes(actualFamily)) {
        return { matched: false, fontId, script, weight, mode: "static", expectedPostScriptNames: staticFiles.map((file) => file.postScriptName).filter(Boolean), reason: "family matched, but platform PostScript name did not match the exact weight-specific file" };
      }
      continue;
    }
    if (familyNames.includes(actualFamily)) {
      return { matched: files.length > 0, fontId, script, weight, mode: "variable", expectedPostScriptNames: files.map((file) => file.postScriptName).filter(Boolean), reason: files.length > 0 ? null : "no manifest file supports the requested script and weight" };
    }
  }
  return { matched: false, fontId: null, script: plan?.script ?? null, weight: null, mode: null, expectedPostScriptNames: [] };
}

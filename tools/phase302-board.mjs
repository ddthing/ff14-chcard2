import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "docs", "qa", "phase302-jobmark-correction");
const reportDir = path.join(evidenceRoot, "raw");
const planPath = path.join(evidenceRoot, "board-plan.json");
const allRequiredBoards = [
  "01-c2-rdm-abc.png", "02-e2-rdm-abc.png", "03-i3-rdm-abc.png", "04-drg.png", "05-gnb.png", "06-whm.png", "07-blm.png",
  "08-svg-raster-fankit-generic.png", "09-opacity-comparison.png", "10-size-comparison.png", "11-all-master-comparison.png",
  "12-e2-placement-options.png", "13-icon-detail-100.png", "14-icon-detail-200.png", "15-icon-detail-400.png",
  "16-fankit-size-sweep.png", "17-retained-serif-alternates.png",
];
const plan = JSON.parse(await readFile(planPath, "utf8"));
const reportCache = new Map();
const reportFor = async (caseId) => {
  if (!reportCache.has(caseId)) reportCache.set(caseId, readFile(path.join(reportDir, `${safeName(caseId)}.json`), "utf8").then(JSON.parse));
  return reportCache.get(caseId);
};

function escapeXml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function safeName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function wrapWords(value, maxChars) {
  const output = [];
  for (const paragraph of String(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (Array.from(word).length > maxChars) {
        if (line) { output.push(line); line = ""; }
        const points = Array.from(word);
        for (let index = 0; index < points.length; index += maxChars) output.push(points.slice(index, index + maxChars).join(""));
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (Array.from(next).length > maxChars) { output.push(line); line = word; }
      else line = next;
    }
    if (line) output.push(line);
  }
  return output;
}

function caseFaces(report) {
  const name = String(report.case?.name ?? "");
  const rows = report.actualFontEvidence?.runs ?? [];
  const compactName = name.replace(/\s+/g, "");
  const exact = rows.filter((row) => row.field === "name" || row.text?.replace(/\s+/g, "").includes(compactName));
  const faces = [...new Set((exact.length ? exact : rows).flatMap((row) => (row.actualPlatformFonts ?? []).map((font) => {
    const match = (row.actualFaceMatches ?? []).find((item) => item.familyName === font.familyName && item.postScriptName === font.postScriptName);
    return match?.matchedFontId === "ridi-batang" || font.postScriptName === "RIDIBatang"
      ? `${font.familyName} (${font.postScriptName ?? "RIDIBatang"})`
      : font.familyName;
  })))];
  return faces.length ? faces.join(" + ") : "font-face capture missing";
}

function caseMetrics(report) {
  const name = String(report.case?.name ?? "");
  const textRuns = report.card?.textRuns ?? [];
  const compactName = name.replace(/\s+/g, "");
  const row = textRuns.find((item) => item.field === "name") ?? textRuns.find((item) => item.text?.replace(/\s+/g, "").includes(compactName)) ?? textRuns.find((item) => ["display", "primary"].includes(item.role));
  const nameRequest = (report.apiResult?.requestedFaces ?? []).find((item) => item.field === "name");
  const scriptLabel = { latin: "Latin", korean: "KO", japanese: "JA", zhHans: "SC", zhHant: "TC" };
  const matchedWeights = (nameRequest?.faceRefs ?? []).map((face) =>
    `${scriptLabel[face.script] ?? face.script} ${face.matchedWeight ?? "?"} ${face.availability?.mode ?? "mode?"}`);
  const cssWeight = row?.weight ?? report.apiResult?.requestedWeight ?? "—";
  const weight = `CSS ${cssWeight}${matchedWeights.length ? ` · matched ${matchedWeights.join(" / ")}` : ""}`;
  const tracking = row?.tracking ?? report.apiResult?.tracking ?? "—";
  const mark = report.apiResult?.jobMark ?? {};
  const markSize = mark.primarySizeLogicalPx ?? report.case?.jobMark?.sizeLogicalPx ?? null;
  const familyStrength = mark.visualStrength ?? report.case?.jobMark?.visualStrength ?? null;
  const placement = mark.placement ?? report.case?.jobMark?.placement ?? "family default";
  const optical = mark.opticalFit ?? {};
  const boxLabel = (box) => box && Number.isFinite(Number(box.x)) && Number.isFinite(Number(box.y)) &&
    Number.isFinite(Number(box.width)) && Number.isFinite(Number(box.height))
    ? `${Number(box.x).toFixed(2)},${Number(box.y).toFixed(2)} ${Number(box.width).toFixed(2)}×${Number(box.height).toFixed(2)}`
    : "not reported";
  const sourceDimensions = optical.sourceDimensions;
  const sourceDimensionLabel = sourceDimensions?.width && sourceDimensions?.height ? `${sourceDimensions.width}×${sourceDimensions.height}` : "generic fallback";
  const boundsLabel = `${boxLabel(optical.visibleBounds)} → ${boxLabel(optical.visibleBoundsAfterTransform)}; alpha ${boxLabel(optical.anyAlphaBoundsAfterTransform)}`;
  const renderedRect = boxLabel(optical.renderedVisibleRect);
  return {
    weight: String(weight), tracking: String(tracking),
    markSize: markSize === null ? "—" : `${markSize} logical / ${Number(markSize) * 5} PNG2x px`,
    strength: familyStrength === null ? "—" : `${Math.round(Number(familyStrength) * 100)}%`,
    placement: String(placement),
    sourceDimensions: sourceDimensionLabel,
    visibleBounds: boundsLabel,
    renderedRect,
    fullContainment: optical.contain === true && optical.clipped === false ? "contain=true · clipped=false" : `contain=${optical.contain ?? "?"} · clipped=${optical.clipped ?? "?"}`,
  };
}

function caseTier(report) {
  const mark = report.apiResult?.jobMark;
  const resolver = mark?.variant === "A" ? mark?.secondaryResolver : mark?.primaryResolver;
  return report.case?.sourceTier ?? report.case?.jobMark?.sourceTier ?? resolver?.actualSource ?? resolver?.source ?? report.card?.jobMark?.source ?? "font comparison";
}

function cardPath(report, tile) {
  const exportPath = tile.exportFormat ? report.exports?.find((item) => item.format === tile.exportFormat)?.path : null;
  const relative = tile.imagePath ?? exportPath ?? report.previewScreenshot?.path;
  if (!relative) throw new Error(`No image path for board case ${report.case?.id}`);
  return path.join(evidenceRoot, relative);
}

async function resolveDetailCrop(report, tile) {
  const imagePath = cardPath(report, tile);
  const imageSize = await sharp(imagePath).metadata();
  let crop = tile.crop;
  if (!crop && (tile.cropRole || tile.cropFrom || tile.cropParts)) {
    const card = report.card?.rect;
    if (!card?.width || !card?.height) throw new Error(`Cannot resolve detail crop for ${report.case?.id}: missing card bounds.`);
    const boundsForPart = (part) => {
      if (part.jobMark === "icon") return report.card?.jobMark?.iconRect ?? null;
      if (part.jobMark === "primarySlot") return report.card?.jobMark?.primarySlotRect ?? null;
      if (part.jobMark === "activeMark") {
        const mark = report.apiResult?.jobMark ?? {};
        return mark.variant === "A" ? mark.secondaryRect ?? null : mark.primaryRect ?? null;
      }
      if (part.jobMark === "primaryMark") return report.apiResult?.jobMark?.primaryRect ?? null;
      if (part.jobMark === "secondaryMark") return report.apiResult?.jobMark?.secondaryRect ?? null;
      const row = (report.card?.textRuns ?? []).find((item) => item.role === part.role && (!part.field || item.field === part.field) &&
        (!part.text || item.text?.replace(/\s+/g, " ").trim() === part.text.replace(/\s+/g, " ").trim()));
      return row?.ink ?? row?.rect ?? null;
    };
    const parts = tile.cropParts ?? [
      ...(tile.cropRole ? [{ role: tile.cropRole, field: tile.cropField, text: tile.cropText }] : []),
      ...(tile.cropFrom === "jobMarkIcon" ? [{ jobMark: "icon" }] : []),
      ...(tile.cropFrom === "jobMarkPrimarySlot" ? [{ jobMark: "primarySlot" }] : []),
      ...(tile.cropFrom === "activeMark" ? [{ jobMark: "activeMark" }] : []),
      ...(tile.cropFrom === "primaryMark" ? [{ jobMark: "primaryMark" }] : []),
      ...(tile.cropFrom === "secondaryMark" ? [{ jobMark: "secondaryMark" }] : []),
    ];
    const bounds = parts.map(boundsForPart).filter((value) => value?.width > 0 && value?.height > 0);
    if (bounds.length !== parts.length || bounds.length === 0) {
      throw new Error(`Cannot resolve all detail crop bounds for ${report.case?.id}: ${JSON.stringify(parts)}.`);
    }
    const union = {
      x: Math.min(...bounds.map((value) => value.x)),
      y: Math.min(...bounds.map((value) => value.y)),
      right: Math.max(...bounds.map((value) => value.x + value.width)),
      bottom: Math.max(...bounds.map((value) => value.y + value.height)),
    };
    const scaleX = imageSize.width / card.width;
    const scaleY = imageSize.height / card.height;
    const left = (union.x - card.x) * scaleX;
    const top = (union.y - card.y) * scaleY;
    const right = (union.right - card.x) * scaleX;
    const bottom = (union.bottom - card.y) * scaleY;
    const padding = tile.cropPaddingPx ?? 18;
    const x1 = Math.max(0, Math.floor(left - padding));
    const y1 = Math.max(0, Math.floor(top - padding));
    const x2 = Math.min(imageSize.width, Math.ceil(right + padding));
    const y2 = Math.min(imageSize.height, Math.ceil(bottom + padding));
    crop = { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
  }
  if (!crop) throw new Error(`Detail board tile needs crop bounds: ${report.case?.id}`);
  const displayScale = tile.displayScale;
  if (![0.5, 1, 2].includes(displayScale)) throw new Error(`Detail tile ${report.case?.id} requires displayScale 0.5 (100%), 1 (200%), or 2 (400%).`);
  return { imagePath, crop, displayScale, width: Math.max(1, Math.round(crop.width * displayScale)), height: Math.max(1, Math.round(crop.height * displayScale)) };
}

async function captionSvg({ width, height, report, tile, faces, metrics, tier }) {
  const caseLabel = tile.label ?? report.case?.label ?? report.case?.id ?? "case";
  const fontSet = report.case?.fontSet ?? report.case?.candidate ?? report.case?.jobMark?.variant ?? "—";
  const lang = report.case?.nameLang ?? report.case?.locale ?? "—";
  const locale = report.case?.locale ?? "—";
  const iconVariant = report.case?.jobMark?.variant ? ` · mark ${report.case.jobMark.variant}` : "";
  const iconJob = report.case?.jobId ?? report.case?.jobMark?.jobId ?? "";
  const maxChars = Math.max(24, Math.floor((width - 36) / 7));
  const lines = [
    ...wrapWords(`${fontSet}${iconVariant}${iconJob ? ` · ${iconJob}` : ""}`, maxChars),
    ...wrapWords(`Actual platform faces: ${faces}`, maxChars),
    ...wrapWords(`Weight ${metrics.weight} · Tracking ${metrics.tracking}`, maxChars),
    ...wrapWords(`Icon ${metrics.markSize} · strength ${metrics.strength} · ${metrics.placement}`, maxChars),
    ...wrapWords(`Asset ${metrics.sourceDimensions} · ${metrics.fullContainment}`, maxChars),
    ...wrapWords(`Source → fitted visible/alpha bounds ${metrics.visibleBounds}`, maxChars),
    ...wrapWords(`Rendered visible rect (global CSS px): ${metrics.renderedRect}`, maxChars),
    ...wrapWords(`Source tier: ${tier} · card locale ${locale} / name ${lang}`, maxChars),
    ...(tile.note ? wrapWords(`Note: ${tile.note}`, maxChars) : []),
  ];
  const lineHeight = 18;
  const maxLines = Math.floor((height - 38) / lineHeight);
  if (lines.length > maxLines) throw new Error(`Caption overflows its reserved height for ${report.case?.id}; increase captionHeight. lines=${lines.length}, reserved=${maxLines}`);
  const escapedLines = lines.map(escapeXml);
  const caseLabelFontSize = Array.from(caseLabel).length > 36 ? 12 : Array.from(caseLabel).length > 25 ? 14 : 17;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#171a18"/><text x="18" y="28" font-family="Arial,'Malgun Gothic','Yu Gothic',sans-serif" font-size="${caseLabelFontSize}" font-weight="700" fill="#e4dccb">${escapeXml(caseLabel)}</text>${escapedLines.map((line, index) => `<text x="18" y="${50 + index * lineHeight}" font-family="Arial,'Malgun Gothic','Yu Gothic',sans-serif" font-size="12" fill="${index === 0 ? "#d4c6a7" : "#c1c7c2"}">${line}</text>`).join("")}</svg>`);
}

async function buildBoard(board) {
  const prepared = [];
  for (const tile of board.tiles) {
    const report = await reportFor(tile.caseId);
    const detail = tile.displayScale ? await resolveDetailCrop(report, tile) : null;
    prepared.push({ tile, report, detail });
  }
  const detailMode = prepared.some((item) => item.detail);
  if (detailMode && prepared.some((item) => !item.detail)) throw new Error(`${board.file} cannot mix detail crops with scaled card tiles.`);
  const tileWidth = board.tileWidth ?? (detailMode ? Math.max(...prepared.map((item) => item.detail.width)) : 420);
  const imageHeight = board.imageHeight ?? (detailMode ? Math.max(...prepared.map((item) => item.detail.height)) : Math.round(tileWidth * (board.cardAspect ?? 1.25)));
  const captionHeight = board.captionHeight ?? 220;
  const tileHeight = captionHeight + imageHeight;
  const columns = board.columns ?? 3;
  const rows = Math.ceil(board.tiles.length / columns);
  const gap = board.gap ?? 18;
  const margin = board.margin ?? 24;
  const headerHeight = board.headerHeight ?? (board.note ? 84 : 58);
  if (detailMode && prepared.some(({ detail }) => detail.width > tileWidth || detail.height > imageHeight)) throw new Error(`${board.file} detail crop exceeds its unscaled tile bounds.`);
  const boardWidth = margin * 2 + columns * tileWidth + (columns - 1) * gap;
  const boardHeight = margin * 2 + headerHeight + rows * tileHeight + (rows - 1) * gap;
  const composites = [];
  for (let index = 0; index < prepared.length; index++) {
    const { tile, report, detail } = prepared[index];
    const faces = tile.actualFaces ?? caseFaces(report);
    const metrics = caseMetrics(report);
    const tier = caseTier(report);
    const caption = await sharp(await captionSvg({ width: tileWidth, height: captionHeight, report, tile, faces, metrics, tier })).png().toBuffer();
    let card = sharp(detail?.imagePath ?? cardPath(report, tile));
    let cardBuffer;
    if (detail) {
      card = card.extract(detail.crop);
      if (detail.displayScale === 0.5) card = card.resize(detail.width, detail.height, { fit: "fill", kernel: "lanczos3" });
      if (detail.displayScale === 2) card = card.resize(detail.width, detail.height, { fit: "fill", kernel: "nearest" });
      cardBuffer = await card.png().toBuffer();
    } else {
      if (tile.crop) card = card.extract(tile.crop);
      cardBuffer = await card.resize(tileWidth, imageHeight, { fit: "contain", background: { r: 20, g: 23, b: 21, alpha: 1 } }).png().toBuffer();
    }
    const x = margin + (index % columns) * (tileWidth + gap);
    const y = margin + headerHeight + Math.floor(index / columns) * (tileHeight + gap);
    composites.push({ input: caption, left: x, top: y });
    composites.push({ input: cardBuffer, left: x, top: y + captionHeight });
  }
  const boardNote = board.note ?? "Actual CardPreview; captions stay outside the card. No candidate is a production winner.";
  const titleSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${boardHeight}"><rect width="100%" height="100%" fill="#0f1210"/><text x="${margin}" y="${margin + 27}" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#e8dfcd">${escapeXml(board.title)}</text><text x="${margin}" y="${margin + 50}" font-family="Arial,sans-serif" font-size="12" fill="#97a099">Actual CardPreview · captions outside card · ${escapeXml(boardNote)} · no candidate winner selected</text></svg>`);
  composites.unshift({ input: titleSvg, left: 0, top: 0 });
  const filename = board.file;
  if (!allRequiredBoards.includes(filename)) throw new Error(`Unexpected board filename: ${filename}`);
  const output = path.join(evidenceRoot, filename);
  await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: "#0f1210" } }).composite(composites).png().toFile(output);
  return { file: filename, width: boardWidth, height: boardHeight, tileCount: board.tiles.length };
}

const missing = allRequiredBoards.filter((file) => !plan.boards.some((board) => board.file === file));
const duplicated = allRequiredBoards.filter((file) => plan.boards.filter((board) => board.file === file).length > 1);
if (missing.length || duplicated.length) throw new Error(`Board plan incomplete: missing=${missing.join(",")}; duplicated=${duplicated.join(",")}`);
const results = [];
for (const board of plan.boards) results.push(await buildBoard(board));
const report = { schema: "phase302-card-type-job-board-report-v1", generatedAt: new Date().toISOString(), boards: results, winnerSelected: false };
await writeFile(path.join(evidenceRoot, "board-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

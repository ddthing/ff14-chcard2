import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const QA_DIR = "docs/qa/phase216-job-icons";
const AUDIT_PATH = `${QA_DIR}/source-audit.json`;
const FAN_KIT_PATH = "src/lib/ffxiv-assets/job-icon-manifest.json";
const REPRESENTATIVE_JOBS = [
  "paladin",
  "warrior",
  "dark-knight",
  "gunbreaker",
  "white-mage",
  "astrologian",
  "dragoon",
  "black-mage",
  "dancer",
  "red-mage",
];
const TARGET_SIZES = [32, 64, 128, 256, 512];
const SOURCE_COLUMNS = [
  { id: "fan-kit-original", title: "Fan Kit original · 76px" },
  { id: "fan-kit-mask", title: "Fan Kit mask · white" },
  { id: "svg", title: "XIVAPI SVG · white · box matched" },
  { id: "icons-original", title: "XIVAPI icons · original 256px" },
  { id: "icons", title: "XIVAPI icons alpha · white · box matched" },
  { id: "companion", title: "XIVAPI companion original" },
  { id: "risingstones", title: "Rising Stones original" },
];
const SIZE_COLUMNS = [
  { id: "fan-kit-mask", title: "Fan Kit mask · 76px · white" },
  { id: "svg", title: "XIVAPI SVG · white · box matched" },
  { id: "icons-original", title: "XIVAPI icons · original 256px" },
  { id: "icons", title: "XIVAPI icons alpha · white · box matched" },
  { id: "risingstones", title: "Rising Stones · original" },
];

const audit = JSON.parse(await readFile(path.join(ROOT, AUDIT_PATH), "utf8"));
const fanKit = JSON.parse(await readFile(path.join(ROOT, FAN_KIT_PATH), "utf8"));
const jobIds = Object.keys(fanKit.entries);
const SIZE_REVIEW_JOBS = [...jobIds, "beastmaster"];
const sizesByProvider = Object.fromEntries(["svg", "icons", "companion", "risingstones"].map((provider) => {
  const sources = Object.values(audit.entries).map(({ sources }) => sources[provider]).filter((source) => source?.localPath);
  return [provider, [...new Set(sources.map((source) => `${source.width}x${source.height}`))].sort()];
}));

await mkdir(path.join(ROOT, QA_DIR), { recursive: true });

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function titleCase(id) {
  return id.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function svgText(width, height, lines, background = "#15191e") {
  const text = lines.map(({ x, y, value, size = 12, fill = "#dfe5ec", weight = 400 }) => (
    `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="Arial, sans-serif">${xml(value)}</text>`
  )).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/>${text}</svg>`);
}

function sourceFor(jobId, provider) {
  if (provider === "fan-kit-original" || provider === "fan-kit-mask") {
    const entry = fanKit.entries[jobId];
    if (!entry) return null;
    if (provider === "fan-kit-mask") {
      return {
        provider,
        localPath: `public${entry.maskSrc}`,
        width: entry.width,
        height: entry.height,
        sha256: entry.maskSha256,
        whiteInk: true,
      };
    }
    return {
      provider,
      localPath: entry.sourcePath,
      width: entry.width,
      height: entry.height,
      sha256: entry.sourceSha256,
    };
  }
  if (provider === "icons-original") {
    return audit.entries[jobId]?.sources?.icons ?? null;
  }
  const source = audit.entries[jobId]?.sources?.[provider] ?? null;
  if (source && (provider === "svg" || provider === "icons")) return { ...source, whiteInk: true };
  return source;
}

async function sourceBytes(source) {
  if (!source?.localPath || source.status === "absent-upstream") return null;
  const bytes = await readFile(path.join(ROOT, source.localPath));
  if (source.sha256 && createHash("sha256").update(bytes).digest("hex") !== source.sha256) {
    throw new Error(`Source audit SHA-256 mismatch: ${source.localPath}`);
  }
  return bytes;
}

async function renderAt(source, size) {
  let bytes = await sourceBytes(source);
  if (!bytes) return null;
  if (source.whiteInk && source.provider === "svg") {
    const svg = bytes.toString("utf8").replace(/<svg\b([^>]*)>/i, '<svg$1 fill="#ffffff">');
    bytes = Buffer.from(svg, "utf8");
  }
  let image = sharp(bytes, { density: 96 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" });
  if (source.whiteInk && source.provider !== "svg") image = image.tint({ r: 255, g: 255, b: 255 });
  return image.png().toBuffer();
}

function visualAdjustment(jobId, provider, metrics) {
  if (provider === "svg") {
    const source = metrics.jobs[jobId]?.at512;
    return source && {
      scale: source.visualScaleSuggestion,
      offsetXPercent: source.opticalOffsetXPercentSuggestion,
      offsetYPercent: source.opticalOffsetYPercentSuggestion,
    };
  }
  if (provider === "icons" || provider === "icons-original") {
    const source = metrics.jobs[jobId]?.iconsRasterAt256;
    return source && {
      scale: source.visualScaleSuggestion,
      offsetXPercent: source.opticalOffsetXPercentSuggestion,
      offsetYPercent: source.opticalOffsetYPercentSuggestion,
    };
  }
  return null;
}

async function renderAtNormalized(jobId, provider, size, metrics) {
  const source = sourceFor(jobId, provider);
  const adjustment = visualAdjustment(jobId, provider, metrics);
  if (adjustment) {
    return renderWithOpticalScale(source, adjustment.scale, adjustment.offsetXPercent, adjustment.offsetYPercent, size);
  }
  return renderAt(source, size);
}

async function tileBuffer(jobId, provider, size, displaySize, metrics) {
  const rendered = await renderAtNormalized(jobId, provider, size, metrics);
  if (!rendered) return null;
  return sharp(rendered)
    .resize(displaySize, displaySize, { kernel: "nearest" })
    .png()
    .toBuffer();
}

function makeBoardBackground(width, height) {
  return sharp({ create: { width, height, channels: 3, background: "#15191e" } });
}

async function createCoverageBoard(metrics) {
  const left = 156;
  const cellWidth = 174;
  const cellHeight = 158;
  const headerHeight = 74;
  const iconSize = 128;
  const width = left + cellWidth * SOURCE_COLUMNS.length;
  const height = headerHeight + cellHeight * 34;
  const overlays = [
    { x: 18, y: 28, value: "JOB ID", size: 13, fill: "#f2f4f7", weight: 700 },
    { x: 18, y: 56, value: "34 registry entries", size: 12, fill: "#9ea8b4" },
  ];
  SOURCE_COLUMNS.forEach((column, index) => overlays.push({
    x: left + index * cellWidth + 8,
    y: 32,
    value: column.title,
    size: 12,
    fill: "#f2f4f7",
    weight: 700,
  }));
  const composites = [{ input: svgText(width, headerHeight, overlays), left: 0, top: 0 }];
  const rows = [];

  for (const jobId of [...jobIds, "beastmaster"]) {
    const sources = SOURCE_COLUMNS.map(({ id }) => id);
    rows.push({ jobId, sources });
  }

  for (const [rowIndex, row] of rows.entries()) {
    const top = headerHeight + rowIndex * cellHeight;
    const jobLabel = svgText(left, cellHeight, [
      { x: 16, y: 40, value: titleCase(row.jobId), size: 13, fill: "#edf1f5", weight: 700 },
      { x: 16, y: 62, value: row.jobId === "beastmaster" ? "NO SOURCE" : "128px render", size: 10, fill: row.jobId === "beastmaster" ? "#ffb46c" : "#91a0ae" },
    ], rowIndex % 2 ? "#1b2026" : "#191e24");
    composites.push({ input: jobLabel, left: 0, top });
    for (const [columnIndex, provider] of row.sources.entries()) {
      const x = left + columnIndex * cellWidth;
      composites.push({
        input: svgText(cellWidth, cellHeight, [], rowIndex % 2 ? "#20262d" : "#1e242b"),
        left: x,
        top,
      });
      if (row.jobId === "beastmaster") {
        composites.push({
          input: svgText(cellWidth, 26, [
            { x: 10, y: 18, value: "unavailable upstream", size: 10, fill: "#9aa5b0" },
          ], "#20262d"),
          left: x,
          top: top + 62,
        });
        continue;
      }
      const buffer = await tileBuffer(row.jobId, provider, iconSize, iconSize, metrics);
      if (!buffer) {
        composites.push({
          input: svgText(cellWidth, 26, [
            { x: 10, y: 18, value: "not in this folder", size: 10, fill: "#9aa5b0" },
          ], "#20262d"),
          left: x,
          top: top + 62,
        });
        continue;
      }
      composites.push({ input: buffer, left: x + 23, top: top + 26 });
    }
  }
  const filename = "01-fankit-vs-xivapi.png";
  const output = path.join(ROOT, QA_DIR, filename);
  const info = await makeBoardBackground(width, height).composite(composites).png().toFile(output);
  return { filename, width: info.width, height: info.height, bytes: info.size, rows: rows.length, displayedSize: iconSize };
}

async function createSizeComparisonBoard(metrics) {
  const left = 170;
  const cellWidth = 172;
  const cellHeight = 152;
  const headerHeight = 74;
  const iconSize = 128;
  const width = left + cellWidth * SIZE_COLUMNS.length;
  const height = headerHeight + cellHeight * SIZE_REVIEW_JOBS.length * TARGET_SIZES.length;
  const overlays = [
    { x: 16, y: 28, value: "JOB / TARGET", size: 13, fill: "#f2f4f7", weight: 700 },
    { x: 16, y: 56, value: "nearest-upscaled view", size: 11, fill: "#9ea8b4" },
  ];
  SIZE_COLUMNS.forEach((column, index) => overlays.push({
    x: left + index * cellWidth + 6,
    y: 32,
    value: column.title,
    size: 11,
    fill: "#f2f4f7",
    weight: 700,
  }));
  const composites = [{ input: svgText(width, headerHeight, overlays), left: 0, top: 0 }];
  let rowIndex = 0;

  for (const jobId of SIZE_REVIEW_JOBS) {
    for (const targetSize of TARGET_SIZES) {
      const top = headerHeight + rowIndex * cellHeight;
      const label = svgText(left, cellHeight, [
        { x: 14, y: 38, value: titleCase(jobId), size: 13, fill: "#edf1f5", weight: 700 },
        { x: 14, y: 60, value: `${targetSize}px output`, size: 11, fill: "#a7b1bb" },
      ], rowIndex % 2 ? "#1b2026" : "#191e24");
      composites.push({ input: label, left: 0, top });
      for (const [columnIndex, { id: provider }] of SIZE_COLUMNS.entries()) {
        const x = left + columnIndex * cellWidth;
        composites.push({
          input: svgText(cellWidth, cellHeight, [], rowIndex % 2 ? "#20262d" : "#1e242b"),
          left: x,
          top,
        });
        const buffer = await tileBuffer(jobId, provider, targetSize, iconSize, metrics);
        if (!buffer) {
          composites.push({
            input: svgText(cellWidth, 24, [{ x: 10, y: 17, value: "not available", size: 10, fill: "#9aa5b0" }], "#20262d"),
            left: x,
            top: top + 62,
          });
          continue;
        }
        composites.push({ input: buffer, left: x + 22, top: top + 18 });
      }
      rowIndex += 1;
    }
  }
  const filename = "02-svg-vs-512.png";
  const output = path.join(ROOT, QA_DIR, filename);
  const info = await makeBoardBackground(width, height).composite(composites).png().toFile(output);
  return {
    filename,
    width: info.width,
    height: info.height,
    bytes: info.size,
    jobs: SIZE_REVIEW_JOBS,
    targetSizes: TARGET_SIZES,
    displayedSize: iconSize,
    note: "Each source is rendered at the labeled target size, then nearest-neighbor enlarged for side-by-side viewing.",
  };
}

async function detailCrop(jobId, provider, cropWidth, displaySize, metrics) {
  const at512 = await renderAtNormalized(jobId, provider, 512, metrics);
  if (!at512) return null;
  const start = Math.floor((512 - cropWidth) / 2);
  return sharp(at512)
    .extract({ left: start, top: start, width: cropWidth, height: cropWidth })
    .resize(displaySize, displaySize, { kernel: "nearest" })
    .png()
    .toBuffer();
}

async function createDetailBoard(filename, title, jobs, metrics) {
  const labelWidth = 160;
  const tileSize = 520;
  const imageSize = 512;
  const groupGap = 16;
  const headerHeight = 96;
  const rowHeight = tileSize + 28;
  const width = labelWidth + SOURCE_COLUMNS.length * (tileSize * 3 + groupGap);
  const height = headerHeight + jobs.length * rowHeight;
  const overlays = [
    { x: 20, y: 30, value: title, size: 16, fill: "#f2f4f7", weight: 700 },
    { x: 20, y: 58, value: "512px normalized source · 200% crop · 400% crop", size: 11, fill: "#9ea8b4" },
  ];
  SOURCE_COLUMNS.forEach((column, index) => overlays.push({
    x: labelWidth + index * (tileSize * 3 + groupGap) + 6,
    y: 78,
    value: column.title,
    size: 11,
    fill: "#f2f4f7",
    weight: 700,
  }));
  const composites = [{ input: svgText(width, headerHeight, overlays), left: 0, top: 0 }];
  const metadata = [];

  for (const [rowIndex, jobId] of jobs.entries()) {
    const top = headerHeight + rowIndex * rowHeight;
    const label = svgText(labelWidth, rowHeight, [
      { x: 18, y: 34, value: titleCase(jobId), size: 13, fill: "#edf1f5", weight: 700 },
      { x: 18, y: 56, value: "512px render", size: 10, fill: "#9ea8b4" },
    ], rowIndex % 2 ? "#1b2026" : "#191e24");
    composites.push({ input: label, left: 0, top });
    for (const [columnIndex, { id: provider }] of SOURCE_COLUMNS.entries()) {
      const source = sourceFor(jobId, provider);
      const bytes = await sourceBytes(source);
      const groupLeft = labelWidth + columnIndex * (tileSize * 3 + groupGap);
      composites.push({
        input: svgText(tileSize * 3, rowHeight, [
          { x: 8, y: 18, value: "512px source", size: 10, fill: "#aeb8c2" },
          { x: tileSize + 8, y: 18, value: "200% crop", size: 10, fill: "#aeb8c2" },
          { x: tileSize * 2 + 8, y: 18, value: "400% crop", size: 10, fill: "#aeb8c2" },
        ], rowIndex % 2 ? "#20262d" : "#1e242b"),
        left: groupLeft,
        top,
      });
      if (!bytes) continue;
      const at512 = await renderAtNormalized(jobId, provider, imageSize, metrics);
      const crop200 = await detailCrop(jobId, provider, 256, imageSize, metrics);
      const crop400 = await detailCrop(jobId, provider, 128, imageSize, metrics);
      const providerSources = [at512, crop200, crop400];
      for (const [detailIndex, rendered] of providerSources.entries()) {
        if (!rendered) continue;
        const x = groupLeft + detailIndex * tileSize + 4;
        composites.push({ input: rendered, left: x, top: top + 24 });
      }
      metadata.push({ jobId, provider, inputSha256: source?.sha256 ?? source?.sourceSha256 ?? null });
    }
  }

  const output = path.join(ROOT, QA_DIR, filename);
  const info = await makeBoardBackground(width, height).composite(composites).png().toFile(output);
  return { filename, width: info.width, height: info.height, bytes: info.size, jobs, detailSources: metadata };
}

async function alphaSummary(buffer) {
  const { data, info } = await sharp(buffer).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let anyLeft = info.width;
  let anyTop = info.height;
  let anyRight = -1;
  let anyBottom = -1;
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  let pixels = 0;
  let thresholdPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 0) {
        pixels += 1;
        anyLeft = Math.min(anyLeft, x);
        anyTop = Math.min(anyTop, y);
        anyRight = Math.max(anyRight, x);
        anyBottom = Math.max(anyBottom, y);
      }
      if (alpha >= 128) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
        thresholdPixels += 1;
      }
    }
  }
  if (right < left || bottom < top) return { width: info.width, height: info.height, empty: true };
  const bbox = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const anyAlphaBbox = anyRight < anyLeft || anyBottom < anyTop
    ? null
    : { x: anyLeft, y: anyTop, width: anyRight - anyLeft + 1, height: anyBottom - anyTop + 1 };
  return {
    width: info.width,
    height: info.height,
    bbox,
    normalizedBbox: {
      x: bbox.x / info.width,
      y: bbox.y / info.height,
      width: bbox.width / info.width,
      height: bbox.height / info.height,
    },
    anyAlphaBbox,
    alphaCoverage: pixels / (info.width * info.height),
    threshold128Coverage: thresholdPixels / (info.width * info.height),
  };
}

async function renderWithOpticalScale(source, scale, offsetXPercent, offsetYPercent, baseSize = 512) {
  const dimension = Math.max(1, Math.round(baseSize * scale));
  const layer = await renderAt(source, dimension);
  if (!layer) return null;
  const left = Math.round((baseSize - dimension) / 2 + offsetXPercent * baseSize / 100);
  const top = Math.round((baseSize - dimension) / 2 + offsetYPercent * baseSize / 100);
  const visibleLeft = Math.max(0, left);
  const visibleTop = Math.max(0, top);
  const sourceLeft = Math.max(0, -left);
  const sourceTop = Math.max(0, -top);
  const visibleWidth = Math.min(dimension - sourceLeft, baseSize - visibleLeft);
  const visibleHeight = Math.min(dimension - sourceTop, baseSize - visibleTop);
  const visibleLayer = await sharp(layer)
    .extract({ left: sourceLeft, top: sourceTop, width: visibleWidth, height: visibleHeight })
    .png()
    .toBuffer();
  return sharp({ create: { width: baseSize, height: baseSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: visibleLayer, left: visibleLeft, top: visibleTop }])
    .png()
    .toBuffer();
}

function thresholdIoU(first, second) {
  const a = first.data;
  const b = second.data;
  let intersection = 0;
  let union = 0;
  let firstPixels = 0;
  let secondPixels = 0;
  const pixelCount = 512 * 512;
  for (let index = 0; index < pixelCount; index += 1) {
    const left = a[index * 4 + 3] >= 128;
    const right = b[index * 4 + 3] >= 128;
    if (left) firstPixels += 1;
    if (right) secondPixels += 1;
    if (left && right) intersection += 1;
    if (left || right) union += 1;
  }
  return { iou: intersection / union, firstPixels, secondPixels };
}

async function shapeMetrics() {
  const result = {
    schemaVersion: 1,
    baseline: "Existing Fan Kit 76px runtime mask rendered at each vector source's coordinate canvas; alpha threshold 128 for IoU.",
    renderedComparisonSize: 512,
    sizeScaleMethod: "Each source fits its own square viewBox/canvas to the same 512px viewport; no per-source visualScale is applied.",
    bboxRule: "Main glyph bbox uses alpha >=128; anyAlphaBbox records faint edge residues with alpha >0 separately.",
    jobs: {},
  };
  for (const jobId of jobIds) {
    const baseline = sourceFor(jobId, "fan-kit-mask");
    const svg = sourceFor(jobId, "svg");
    const baseline512 = await renderAt(baseline, 512);
    const svg512 = await renderAt(svg, 512);
    if (!baseline512 || !svg512) continue;
    const [baselineGeometry, svgGeometry, baselineView, svgView] = await Promise.all([
      alphaSummary(await renderAt(baseline, baseline.width)),
      alphaSummary(await renderAt(svg, svg.width)),
      alphaSummary(baseline512),
      alphaSummary(svg512),
    ]);
    const baselineRaw = await sharp(baseline512).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const svgRaw = await sharp(svg512).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const originalOverlap = thresholdIoU(baselineRaw, svgRaw);
    const widthScale = baselineView.normalizedBbox.width / svgView.normalizedBbox.width;
    const heightScale = baselineView.normalizedBbox.height / svgView.normalizedBbox.height;
    const visualScale = Math.sqrt(widthScale * heightScale);
    const center = (bounds) => ({
      x: bounds.normalizedBbox.x + bounds.normalizedBbox.width / 2,
      y: bounds.normalizedBbox.y + bounds.normalizedBbox.height / 2,
    });
    const fanCenter = center(baselineView);
    const svgCenter = center(svgView);
    const adjustedSvgCenter = {
      x: 0.5 + (svgCenter.x - 0.5) * visualScale,
      y: 0.5 + (svgCenter.y - 0.5) * visualScale,
    };
    const opticalOffsetXPercent = (fanCenter.x - adjustedSvgCenter.x) * 100;
    const opticalOffsetYPercent = (fanCenter.y - adjustedSvgCenter.y) * 100;
    const alignedSvg = await renderWithOpticalScale(svg, visualScale, opticalOffsetXPercent, opticalOffsetYPercent);
    const alignedRaw = await sharp(alignedSvg).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alignedOverlap = thresholdIoU(baselineRaw, alignedRaw);

    const icon = sourceFor(jobId, "icons");
    const icon512 = await renderAt(icon, 512);
    const iconNative = await alphaSummary(await renderAt(icon, icon.width));
    const iconView = await alphaSummary(icon512);
    const iconRaw = await sharp(icon512).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const iconOverlap = thresholdIoU(baselineRaw, iconRaw);
    const iconWidthScale = baselineView.normalizedBbox.width / iconView.normalizedBbox.width;
    const iconHeightScale = baselineView.normalizedBbox.height / iconView.normalizedBbox.height;
    const iconScale = Math.sqrt(iconWidthScale * iconHeightScale);
    const iconCenter = center(iconView);
    const adjustedIconCenter = {
      x: 0.5 + (iconCenter.x - 0.5) * iconScale,
      y: 0.5 + (iconCenter.y - 0.5) * iconScale,
    };
    const iconOffsetXPercent = (fanCenter.x - adjustedIconCenter.x) * 100;
    const iconOffsetYPercent = (fanCenter.y - adjustedIconCenter.y) * 100;
    const alignedIcon = await renderWithOpticalScale(icon, iconScale, iconOffsetXPercent, iconOffsetYPercent);
    const alignedIconRaw = await sharp(alignedIcon).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alignedIconOverlap = thresholdIoU(baselineRaw, alignedIconRaw);
    result.jobs[jobId] = {
      sources: {
        fanKitMask: {
          sourcePath: fanKit.entries[jobId].sourcePath,
          maskSrc: fanKit.entries[jobId].maskSrc,
          native: baselineGeometry,
        },
        xivapiSvg: {
          sourcePath: audit.entries[jobId].sources.svg.sourcePath,
          viewBoxCanvas: svgGeometry,
        },
      },
      at512: {
        alphaThreshold: 128,
        thresholdBoundingBoxes: { fanKit: baselineView, svg: svgView },
        silhouetteIoUWithoutOpticalAdjustment: originalOverlap.iou,
        silhouetteIoUAfterBoundingBoxAlignment: alignedOverlap.iou,
        fanKitAlphaPixels: originalOverlap.firstPixels,
        svgAlphaPixels: originalOverlap.secondPixels,
        areaRatioSvgToFanKit: originalOverlap.secondPixels / originalOverlap.firstPixels,
        boundingBoxScaleToMatchFanKit: { x: widthScale, y: heightScale },
        boundingBoxCenterOffsetNormalized: {
          x: svgCenter.x - fanCenter.x,
          y: svgCenter.y - fanCenter.y,
        },
        visualScaleSuggestion: visualScale,
        opticalOffsetXPercentSuggestion: opticalOffsetXPercent,
        opticalOffsetYPercentSuggestion: opticalOffsetYPercent,
      },
      iconsRasterAt256: {
        sourcePath: audit.entries[jobId].sources.icons.sourcePath,
        nativeCanvas: iconNative,
        silhouetteIoUWithoutOpticalAdjustment: iconOverlap.iou,
        silhouetteIoUAfterBoundingBoxAlignment: alignedIconOverlap.iou,
        boundingBoxScaleToMatchFanKit: { x: iconWidthScale, y: iconHeightScale },
        visualScaleSuggestion: iconScale,
        opticalOffsetXPercentSuggestion: iconOffsetXPercent,
        opticalOffsetYPercentSuggestion: iconOffsetYPercent,
      },
      interpretation: "Raw IoU compares original viewBox rendering; aligned IoU applies only a uniform scale and translation that match the Fan Kit mask bounding box. Suggestions are measurement evidence, not automatic approval.",
    };
  }
  return result;
}

const boardMetadata = {
  schemaVersion: 1,
  upstreamCommit: audit.upstreamCommit,
  retrievedAtLocalDate: audit.retrievedAtLocalDate,
  requestedRepresentativeJobs: REPRESENTATIVE_JOBS,
  targetSizesReviewed: SIZE_REVIEW_JOBS,
  nativeDimensionsByProvider: sizesByProvider,
  boards: [],
};
if (process.argv.includes("--size-only")) {
  boardMetadata.shapeMetrics = await shapeMetrics();
  const sizeBoard = await createSizeComparisonBoard(boardMetadata.shapeMetrics);
  const metadataPath = path.join(ROOT, QA_DIR, "comparison-metadata.json");
  const existing = await readFile(metadataPath, "utf8").then((text) => JSON.parse(text)).catch(() => ({
    schemaVersion: 1,
    upstreamCommit: audit.upstreamCommit,
    retrievedAtLocalDate: audit.retrievedAtLocalDate,
    boards: [],
  }));
  existing.requestedRepresentativeJobs = REPRESENTATIVE_JOBS;
  existing.targetSizesReviewed = SIZE_REVIEW_JOBS;
  existing.nativeDimensionsByProvider = sizesByProvider;
  existing.shapeMetrics = boardMetadata.shapeMetrics;
  existing.boards = (existing.boards ?? []).filter((board) => board.filename !== sizeBoard.filename);
  existing.boards.splice(Math.min(1, existing.boards.length), 0, sizeBoard);
  for (const board of existing.boards) {
    const filename = path.join(ROOT, QA_DIR, board.filename);
    const imageInfo = await sharp(filename).metadata();
    board.width = imageInfo.width;
    board.height = imageInfo.height;
    board.bytes = (await stat(filename)).size;
  }
  await writeFile(path.join(ROOT, QA_DIR, "svg-vs-fankit-mask-metrics.json"), `${JSON.stringify(boardMetadata.shapeMetrics, null, 2)}\n`);
  await writeFile(metadataPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`${sizeBoard.filename}: ${sizeBoard.width}x${sizeBoard.height}, ${sizeBoard.bytes.toLocaleString()} bytes`);
} else {
  boardMetadata.shapeMetrics = await shapeMetrics();
  boardMetadata.boards.push(await createCoverageBoard(boardMetadata.shapeMetrics));
  boardMetadata.boards.push(await createSizeComparisonBoard(boardMetadata.shapeMetrics));
  boardMetadata.boards.push(await createDetailBoard("03-rdm-detail.png", "Red Mage · detail comparison", ["red-mage"], boardMetadata.shapeMetrics));
  boardMetadata.boards.push(await createDetailBoard("04-tank-details.png", "Tank jobs · detail comparison", ["paladin", "warrior", "dark-knight", "gunbreaker"], boardMetadata.shapeMetrics));
  boardMetadata.boards.push(await createDetailBoard("05-healer-details.png", "Healer jobs · detail comparison", ["white-mage", "scholar", "astrologian", "sage"], boardMetadata.shapeMetrics));
  await writeFile(path.join(ROOT, QA_DIR, "svg-vs-fankit-mask-metrics.json"), `${JSON.stringify(boardMetadata.shapeMetrics, null, 2)}\n`);
  await writeFile(path.join(ROOT, QA_DIR, "comparison-metadata.json"), `${JSON.stringify(boardMetadata, null, 2)}\n`);
  for (const board of boardMetadata.boards) {
    console.log(`${board.filename}: ${board.width}x${board.height}, ${board.bytes.toLocaleString()} bytes`);
  }
}

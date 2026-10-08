import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "src/lib/ffxiv-assets/job-icon-manifest.json");
const SOURCE_PREFIX = "vendor/ffxiv-fankit/class-job-icons/";
const RUNTIME_PREFIX = "/assets/ffxiv/jobs/official/";
const ENTRY_COUNT = 33;
const DIMENSION = 76;
const FRAME_GUARD = 14;
const FRAME_HALO_BAND = 4;
const FRAME_HALO_CORE_DISTANCE = 4;
const FRAME_HALO_MAX_PIXELS = 4;
const FRAME_HALO_ALPHA_LIMIT = 64;

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function isInside(basePath, candidatePath) {
  const relativePath = candidatePath.slice(basePath.length + 1);
  return relativePath.length > 0 && !relativePath.startsWith(`..${sep}`) && relativePath !== "..";
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest.entries !== "object" || Array.isArray(manifest.entries)) {
    throw new Error("The reviewed job icon manifest must contain an entries object.");
  }

  const entries = Object.entries(manifest.entries);
  if (entries.length !== ENTRY_COUNT) {
    throw new Error(`Expected ${ENTRY_COUNT} reviewed job icons; found ${entries.length}.`);
  }

  const sourcePaths = new Set();
  for (const [jobId, entry] of entries) {
    if (!/^[a-z0-9-]+$/.test(jobId)) throw new Error(`Unsafe job id in manifest: ${jobId}`);
    if (!entry || entry.width !== DIMENSION || entry.height !== DIMENSION) {
      throw new Error(`Unexpected dimensions for ${jobId}; expected ${DIMENSION}x${DIMENSION}.`);
    }
    if (!entry.sourcePath?.startsWith(SOURCE_PREFIX) || entry.sourcePath.includes("..")) {
      throw new Error(`Unreviewed source path for ${jobId}: ${entry.sourcePath}`);
    }
    const sourceGroup = entry.sourcePath.split("/")[3];
    const expectedMode = ["01_TANK", "02_HEALER", "03_DPS", "06_LIMITED"].includes(sourceGroup)
      ? "gold-hue"
      : "neutral-luminance";
    if (entry.extractionMode !== expectedMode) {
      throw new Error(`Unexpected extraction mode for ${jobId}; expected ${expectedMode}.`);
    }
    if (entry.src !== `${RUNTIME_PREFIX}${jobId}.png`) {
      throw new Error(`Unexpected original runtime path for ${jobId}: ${entry.src}`);
    }
    if (entry.maskSrc !== `${RUNTIME_PREFIX}masks/${jobId}.png`) {
      throw new Error(`Unexpected mask runtime path for ${jobId}: ${entry.maskSrc}`);
    }
    if (sourcePaths.has(entry.sourcePath)) throw new Error(`Duplicate source path: ${entry.sourcePath}`);
    sourcePaths.add(entry.sourcePath);
  }
}

function connectedComponents(binary, width, height) {
  const visited = new Uint8Array(binary.length);
  const components = [];

  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || visited[start]) continue;
    const pixels = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < pixels.length; cursor += 1) {
      const index = pixels[cursor];
      const x = index % width;
      const y = Math.floor(index / width);

      for (let neighborY = Math.max(0, y - 1); neighborY <= Math.min(height - 1, y + 1); neighborY += 1) {
        for (let neighborX = Math.max(0, x - 1); neighborX <= Math.min(width - 1, x + 1); neighborX += 1) {
          const neighbor = neighborY * width + neighborX;
          if (binary[neighbor] && !visited[neighbor]) {
            visited[neighbor] = 1;
            pixels.push(neighbor);
          }
        }
      }
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (const index of pixels) {
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    components.push({ pixels, minX, minY, maxX, maxY });
  }

  components.sort((left, right) => right.pixels.length - left.pixels.length);
  return components;
}

function findFrameMask(data, width, height) {
  const goldPixels = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];

    goldPixels[pixel] =
      alpha > 20 && red > green + 15 && green > blue + 20 && red > 75 ? 1 : 0;
  }

  const frame = connectedComponents(goldPixels, width, height).find(
    (component) =>
      component.pixels.length > 500 &&
      component.minX <= 9 &&
      component.minY <= 9 &&
      component.maxX >= width - 10 &&
      component.maxY >= height - 10,
  );

  if (!frame) throw new Error("Could not isolate the outer gold frame as a separate connected component.");

  const mask = new Uint8Array(width * height);
  for (const pixel of frame.pixels) mask[pixel] = 1;
  return { mask, pixelCount: frame.pixels.length };
}

function median(values) {
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function estimateBackgroundLuminance(data, width, height) {
  const luminances = [];
  const patches = [
    [12, 12],
    [width - 19, 12],
    [12, height - 19],
    [width - 19, height - 19],
  ];

  for (const [startX, startY] of patches) {
    for (let y = startY; y < startY + 7; y += 1) {
      for (let x = startX; x < startX + 7; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] < 128) continue;
        luminances.push(
          0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2],
        );
      }
    }
  }

  if (luminances.length === 0) throw new Error("Could not estimate the icon background luminance.");
  return median(luminances);
}

function findConnectedWhiteHighlights(data, width, height, frameMask) {
  const candidates = new Uint8Array(width * height);
  const goldSeeds = new Uint8Array(width * height);
  const whiteHighlights = new Uint8Array(width * height);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (frameMask[pixel]) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (
      x < FRAME_GUARD ||
      y < FRAME_GUARD ||
      x >= width - FRAME_GUARD ||
      y >= height - FRAME_GUARD
    ) {
      continue;
    }

    const offset = pixel * 4;
    if (data[offset + 3] < 16) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const goldScore = Math.min(red - green, green - blue);
    const isGoldSeed = red > 75 && goldScore > 8;
    const minChannel = Math.min(red, green, blue);
    const maxChannel = Math.max(red, green, blue);
    const isWhiteHighlight = minChannel >= 140 && maxChannel - minChannel <= 100;

    goldSeeds[pixel] = isGoldSeed ? 1 : 0;
    whiteHighlights[pixel] = isWhiteHighlight ? 1 : 0;
    candidates[pixel] = isGoldSeed || isWhiteHighlight ? 1 : 0;
  }

  const connectedHighlights = new Uint8Array(width * height);
  for (const component of connectedComponents(candidates, width, height)) {
    let hasGoldSeed = false;
    for (const pixel of component.pixels) {
      if (goldSeeds[pixel]) {
        hasGoldSeed = true;
        break;
      }
    }
    if (!hasGoldSeed) continue;
    for (const pixel of component.pixels) {
      if (whiteHighlights[pixel]) connectedHighlights[pixel] = 1;
    }
  }
  return connectedHighlights;
}

function removeFrameHaloComponents(maskData, width, height) {
  const pixelCount = width * height;
  const alphaMap = new Uint8Array(pixelCount);
  const distances = new Uint16Array(pixelCount);
  distances.fill(0xffff);
  const queue = new Uint16Array(pixelCount);
  let queueEnd = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const alpha = maskData[pixel * 4 + 3];
    alphaMap[pixel] = alpha > 0 ? 1 : 0;
    if (alpha >= FRAME_HALO_ALPHA_LIMIT) {
      distances[pixel] = 0;
      queue[queueEnd] = pixel;
      queueEnd += 1;
    }
  }

  for (let cursor = 0; cursor < queueEnd; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nextDistance = distances[pixel] + 1;
    for (let neighborY = Math.max(0, y - 1); neighborY <= Math.min(height - 1, y + 1); neighborY += 1) {
      for (let neighborX = Math.max(0, x - 1); neighborX <= Math.min(width - 1, x + 1); neighborX += 1) {
        const neighbor = neighborY * width + neighborX;
        if (distances[neighbor] <= nextDistance) continue;
        distances[neighbor] = nextDistance;
        queue[queueEnd] = neighbor;
        queueEnd += 1;
      }
    }
  }

  let frameHaloComponentsRemoved = 0;
  let frameHaloPixelsRemoved = 0;
  let remainingFrameHaloComponents = 0;
  for (const component of connectedComponents(alphaMap, width, height)) {
    let maxAlpha = 0;
    let nearestCoreDistance = 0xffff;
    let nearFrame = false;
    for (const pixel of component.pixels) {
      const offset = pixel * 4;
      maxAlpha = Math.max(maxAlpha, maskData[offset + 3]);
      nearestCoreDistance = Math.min(nearestCoreDistance, distances[pixel]);
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      nearFrame ||=
        x < FRAME_GUARD + FRAME_HALO_BAND ||
        y < FRAME_GUARD + FRAME_HALO_BAND ||
        x >= width - FRAME_GUARD - FRAME_HALO_BAND ||
        y >= height - FRAME_GUARD - FRAME_HALO_BAND;
    }

    const isDetachedFrameHalo =
      component.pixels.length <= FRAME_HALO_MAX_PIXELS &&
      maxAlpha < FRAME_HALO_ALPHA_LIMIT &&
      nearFrame &&
      nearestCoreDistance > FRAME_HALO_CORE_DISTANCE;
    if (isDetachedFrameHalo) {
      frameHaloComponentsRemoved += 1;
      frameHaloPixelsRemoved += component.pixels.length;
      for (const pixel of component.pixels) {
        alphaMap[pixel] = 0;
        maskData[pixel * 4 + 3] = 0;
      }
    } else if (
      maxAlpha < FRAME_HALO_ALPHA_LIMIT &&
      nearFrame &&
      nearestCoreDistance > FRAME_HALO_CORE_DISTANCE
    ) {
      remainingFrameHaloComponents += 1;
    }
  }

  return { frameHaloComponentsRemoved, frameHaloPixelsRemoved, remainingFrameHaloComponents };
}

function deriveGlyphMask(data, width, height, extractionMode = "neutral-luminance") {
  if (width !== DIMENSION || height !== DIMENSION) {
    throw new Error(`Expected ${DIMENSION}x${DIMENSION} input; received ${width}x${height}.`);
  }
  if (extractionMode !== "gold-hue" && extractionMode !== "neutral-luminance") {
    throw new Error(`Unsupported glyph mask extraction mode: ${extractionMode}`);
  }

  const { mask: frameMask, pixelCount: framePixelsRemoved } = findFrameMask(data, width, height);
  const connectedWhiteHighlights =
    extractionMode === "gold-hue"
      ? findConnectedWhiteHighlights(data, width, height, frameMask)
      : new Uint8Array(width * height);
  const backgroundLuminance = estimateBackgroundLuminance(data, width, height);
  const low = Math.max(68, backgroundLuminance + 18);
  const high = low + 42;
  const goldHueLow = 8;
  const goldHueHigh = 20;
  const whiteHighlightLow = 110;
  const whiteHighlightHigh = 190;
  const result = Buffer.alloc(width * height * 4, 0);
  let frameGuardPixelsRemoved = 0;
  const winningCoverage = new Uint8Array(width * height);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (frameMask[pixel]) continue;
    const inputOffset = pixel * 4;
    const alpha = data[inputOffset + 3];
    if (alpha === 0) continue;

    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const isFrameGuard =
      x < FRAME_GUARD ||
      y < FRAME_GUARD ||
      x >= width - FRAME_GUARD ||
      y >= height - FRAME_GUARD;

    const luminance =
      0.2126 * data[inputOffset] +
      0.7152 * data[inputOffset + 1] +
      0.0722 * data[inputOffset + 2];
    const luminanceCoverage = Math.max(0, Math.min(1, (luminance - low) / (high - low)));
    const redGreenSeparation = data[inputOffset] - data[inputOffset + 1];
    const greenBlueSeparation = data[inputOffset + 1] - data[inputOffset + 2];
    const goldHueScore = Math.min(redGreenSeparation, greenBlueSeparation);
    const goldHueCoverage = Math.max(
      0,
      Math.min(1, (goldHueScore - goldHueLow) / (goldHueHigh - goldHueLow)),
    );
    const minChannel = Math.min(
      data[inputOffset],
      data[inputOffset + 1],
      data[inputOffset + 2],
    );
    const whiteHighlightCoverage = connectedWhiteHighlights[pixel]
      ? Math.max(0, Math.min(1, (minChannel - whiteHighlightLow) / (whiteHighlightHigh - whiteHighlightLow)))
      : 0;
    const coverage =
      extractionMode === "gold-hue"
        ? Math.max(goldHueCoverage, whiteHighlightCoverage)
        : luminanceCoverage;
    const outputAlpha = Math.round(alpha * coverage);
    if (outputAlpha === 0) continue;

    if (isFrameGuard) {
      frameGuardPixelsRemoved += 1;
      continue;
    }

    const outputOffset = inputOffset;
    result[outputOffset] = 255;
    result[outputOffset + 1] = 255;
    result[outputOffset + 2] = 255;
    result[outputOffset + 3] = outputAlpha;
    if (extractionMode === "gold-hue") {
      winningCoverage[pixel] = goldHueCoverage >= whiteHighlightCoverage ? 1 : 2;
    } else {
      winningCoverage[pixel] = 3;
    }
  }

  const frameHaloMetrics = removeFrameHaloComponents(result, width, height);
  let nonzeroAlphaPixels = 0;
  let goldHuePixels = 0;
  let whiteHighlightPixels = 0;
  let luminancePixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (result[pixel * 4 + 3] === 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    nonzeroAlphaPixels += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (winningCoverage[pixel] === 1) goldHuePixels += 1;
    else if (winningCoverage[pixel] === 2) whiteHighlightPixels += 1;
    else if (winningCoverage[pixel] === 3) luminancePixels += 1;
  }
  if (nonzeroAlphaPixels < 20) throw new Error("Glyph mask is unexpectedly empty or clipped.");
  return {
    data: result,
    metrics: {
      extractionMode,
      backgroundLuminance: Number(backgroundLuminance.toFixed(2)),
      thresholdLuminance: [Number(low.toFixed(2)), Number(high.toFixed(2))],
      thresholdGoldHue: [goldHueLow, goldHueHigh],
      thresholdConnectedWhite: [whiteHighlightLow, whiteHighlightHigh],
      framePixelsRemoved,
      frameGuardPixelsRemoved,
      ...frameHaloMetrics,
      nonzeroAlphaPixels,
      goldHuePixels,
      whiteHighlightPixels,
      luminancePixels,
      glyphBounds: [minX, minY, maxX, maxY],
    },
  };
}

function resolveSafePath(relativePath) {
  const candidate = resolve(ROOT, normalize(relativePath));
  if (isAbsolute(relativePath) || !isInside(ROOT, candidate)) {
    throw new Error(`Path escapes the repository: ${relativePath}`);
  }
  return candidate;
}

function pathFromPublicSrc(src) {
  if (!src.startsWith("/")) throw new Error(`Runtime asset path must start with '/': ${src}`);
  return resolveSafePath(join("public", src.slice(1)));
}

async function prepareEntry(jobId, entry) {
  const sourcePath = resolveSafePath(entry.sourcePath);
  const sourceBytes = await readFile(sourcePath);
  const { data, info } = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== entry.width || info.height !== entry.height || info.channels !== 4) {
    throw new Error(`${jobId} source dimensions/channels did not match its reviewed manifest entry.`);
  }

  const { data: maskData, metrics } = deriveGlyphMask(
    data,
    info.width,
    info.height,
    entry.extractionMode,
  );
  const maskBytes = await sharp(maskData, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  return {
    jobId,
    entry,
    sourceBytes,
    maskBytes,
    metrics,
    sourceSha256: sha256(sourceBytes),
    maskSha256: sha256(maskBytes),
    maskData,
    sourcePath,
    runtimePath: pathFromPublicSrc(entry.src),
    maskPath: pathFromPublicSrc(entry.maskSrc),
  };
}

async function reviewPanel(sourceBytes, background, size) {
  const image = await sharp(sourceBytes)
    .resize(size, size, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: image }])
    .png()
    .toBuffer();
}

async function createReviewSheet(prepared) {
  const scale = 3;
  const panelSize = DIMENSION * scale;
  const headerHeight = 38;
  const cardWidth = panelSize * 3;
  const cardHeight = headerHeight + panelSize;
  const columns = 3;
  const gap = 20;
  const padding = 20;
  const rows = Math.ceil(prepared.length / columns);
  const sheetWidth = padding * 2 + columns * cardWidth + (columns - 1) * gap;
  const sheetHeight = padding * 2 + rows * cardHeight + (rows - 1) * gap;
  const composites = [];

  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index];
    const cardX = padding + (index % columns) * (cardWidth + gap);
    const cardY = padding + Math.floor(index / columns) * (cardHeight + gap);
    const redOverlay = Buffer.alloc(item.maskData.length, 0);
    for (let pixel = 0; pixel < DIMENSION * DIMENSION; pixel += 1) {
      const offset = pixel * 4;
      redOverlay[offset] = 255;
      redOverlay[offset + 3] = item.maskData[offset + 3];
    }

    const redOverlayPng = await sharp(redOverlay, {
      raw: { width: DIMENSION, height: DIMENSION, channels: 4 },
    })
      .png()
      .toBuffer();
    const overlayBytes = await sharp(item.sourceBytes)
      .ensureAlpha()
      .composite([{ input: redOverlayPng }])
      .png()
      .toBuffer();

    const [sourcePanel, maskPanel, overlayPanel] = await Promise.all([
      reviewPanel(item.sourceBytes, "#e8e5df", panelSize),
      reviewPanel(item.maskBytes, "#15181d", panelSize),
      reviewPanel(overlayBytes, "#e8e5df", panelSize),
    ]);

    const headerSvg = Buffer.from(
      `<svg width="${cardWidth}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101216"/><text x="12" y="16" fill="#f0ece4" font-family="Arial,sans-serif" font-size="13" font-weight="700">${item.jobId}</text><text x="${panelSize / 2}" y="32" text-anchor="middle" fill="#aeb4bc" font-family="Arial,sans-serif" font-size="10">ORIGINAL</text><text x="${panelSize + panelSize / 2}" y="32" text-anchor="middle" fill="#aeb4bc" font-family="Arial,sans-serif" font-size="10">WHITE ALPHA MASK</text><text x="${panelSize * 2 + panelSize / 2}" y="32" text-anchor="middle" fill="#ff8383" font-family="Arial,sans-serif" font-size="10">RED OVERLAY CHECK</text></svg>`,
    );
    const card = await sharp({
      create: {
        width: cardWidth,
        height: cardHeight,
        channels: 4,
        background: "#101216",
      },
    })
      .composite([
        { input: headerSvg, top: 0, left: 0 },
        { input: sourcePanel, top: headerHeight, left: 0 },
        { input: maskPanel, top: headerHeight, left: panelSize },
        { input: overlayPanel, top: headerHeight, left: panelSize * 2 },
      ])
      .png({ compressionLevel: 9 })
      .toBuffer();

    composites.push({ input: card, top: cardY, left: cardX });
  }

  const titleHeight = 44;
  const titleSvg = Buffer.from(
    `<svg width="${sheetWidth}" height="${titleHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0a0b0d"/><text x="${padding}" y="29" fill="#f2eee6" font-family="Arial,sans-serif" font-size="19" font-weight="700">FFXIV official job glyph masks — 3× nearest-neighbor review (76×76 source)</text></svg>`,
  );
  const sheetPath = join(ROOT, "docs/ffxiv-assets/job-icon-mask-review.png");
  await mkdir(dirname(sheetPath), { recursive: true });
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight + titleHeight,
      channels: 4,
      background: "#0a0b0d",
    },
  })
    .composite([{ input: titleSvg, left: 0, top: 0 }, ...composites.map((entry) => ({ ...entry, top: entry.top + titleHeight }))])
    .png({ compressionLevel: 9 })
    .toFile(sheetPath);
  return sheetPath;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  validateManifest(manifest);

  const prepared = [];
  for (const [jobId, entry] of Object.entries(manifest.entries)) {
    const item = await prepareEntry(jobId, entry);
    for (const field of ["sourceSha256", "maskSha256"]) {
      const actual = field === "sourceSha256" ? item.sourceSha256 : item.maskSha256;
      if (entry[field] && entry[field] !== actual) {
        throw new Error(`${field} mismatch for ${jobId}; review the source before refreshing hashes.`);
      }
      if (checkOnly && !entry[field]) throw new Error(`Manifest hash ${field} is missing for ${jobId}.`);
    }
    prepared.push(item);
  }

  if (checkOnly) {
    for (const item of prepared) {
      const [original, mask] = await Promise.all([
        readFile(item.runtimePath),
        readFile(item.maskPath),
      ]);
      if (!original.equals(item.sourceBytes)) {
        throw new Error(`Runtime original is not byte-identical to source: ${item.jobId}`);
      }
      if (!mask.equals(item.maskBytes)) {
        throw new Error(`Runtime glyph mask differs from deterministic output: ${item.jobId}`);
      }
    }
    process.stdout.write(`Verified ${prepared.length} official job icon source/runtime pairs and masks.\n`);
    return;
  }

  let hashesChanged = false;
  const metrics = [];
  for (const item of prepared) {
    await Promise.all([
      mkdir(dirname(item.runtimePath), { recursive: true }),
      mkdir(dirname(item.maskPath), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(item.runtimePath, item.sourceBytes),
      writeFile(item.maskPath, item.maskBytes),
    ]);

    if (!item.entry.sourceSha256 || !item.entry.maskSha256) {
      item.entry.sourceSha256 = item.sourceSha256;
      item.entry.maskSha256 = item.maskSha256;
      hashesChanged = true;
    }
    metrics.push({ jobId: item.jobId, ...item.metrics, sourceSha256: item.sourceSha256, maskSha256: item.maskSha256 });
  }

  if (hashesChanged) {
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const metricsPath = join(ROOT, "docs/ffxiv-assets/job-icon-mask-metrics.json");
  await mkdir(dirname(metricsPath), { recursive: true });
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  const reviewPath = await createReviewSheet(prepared);
  process.stdout.write(`Imported ${prepared.length} reviewed originals and generated ${prepared.length} 76x76 glyph masks.\n`);
  process.stdout.write(`Mask metrics: ${metricsPath}\n`);
  process.stdout.write(`Review sheet: ${reviewPath}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();

export { deriveGlyphMask, findFrameMask, validateManifest };

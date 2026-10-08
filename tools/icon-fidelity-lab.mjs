import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "src/lib/ffxiv-assets/job-icon-manifest.json");
const LAB_ROOT = join(ROOT, "docs/qa/icon-fidelity");
const AI_SOURCE_ATLAS = join(ROOT, "docs/qa/award-pass/ai-source-atlas.png");
const AI_SOURCE_LAYOUT = join(ROOT, "docs/qa/award-pass/ai-source-atlas.json");
const AI_CANDIDATE_ATLAS = join(ROOT, "docs/qa/icon-fidelity/ai-generated-atlas.png");
const PUBLIC_DERIVED_ROOT = join(ROOT, "public/assets/ffxiv/jobs/derived");
const SAMPLE_JOBS = [
  "paladin",
  "dark-knight",
  "gunbreaker",
  "white-mage",
  "astrologian",
  "dragoon",
  "black-mage",
  "dancer",
];
const SIZES = [76, 152, 304, 608];
const METHODS = ["mask-baseline", "lanczos", "cubic", "sdf", "svg"];
const GLYPH_SIZE = 76;
const SDF_RANGE = 16;
const COVERAGE_THRESHOLD = 128;
const NUMERIC_GATE = Object.freeze({
  minSilhouetteIoU: 0.985,
  maxHausdorffSourcePx: 0.75,
  maxSourceDownsampleMae255: 5,
  requireComponentAndHoleParity: true,
});

const JOB_LABELS = Object.freeze({
  paladin: "PLD",
  "dark-knight": "DRK",
  gunbreaker: "GNB",
  "white-mage": "WHM",
  astrologian: "AST",
  dragoon: "DRG",
  "black-mage": "BLM",
  dancer: "DNC",
});

function safePath(relativePath) {
  const candidate = resolve(ROOT, normalize(relativePath));
  const relative = candidate.slice(ROOT.length + 1);
  if (isAbsolute(relativePath) || !relative || relative === ".." || relative.startsWith(`..${sep}`)) {
    throw new Error(`Path escapes repository: ${relativePath}`);
  }
  return candidate;
}

function publicPath(src) {
  if (!src.startsWith("/assets/ffxiv/jobs/")) throw new Error(`Unreviewed public asset path: ${src}`);
  return safePath(join("public", src.slice(1)));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesOf(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function rgbaFromAlpha(alpha, width, height, color = [245, 242, 235]) {
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const offset = pixel * 4;
    output[offset] = color[0];
    output[offset + 1] = color[1];
    output[offset + 2] = color[2];
    output[offset + 3] = alpha[pixel];
  }
  return output;
}

async function pngFromAlpha(alpha, width, height, color = [245, 242, 235]) {
  return sharp(rgbaFromAlpha(alpha, width, height, color), {
    raw: { width, height, channels: 4 },
  }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
}

async function alphaFromPng(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = data[pixel * info.channels + 3];
  return { alpha, width: info.width, height: info.height, channels: info.channels };
}

async function readMask(entry) {
  const result = await alphaFromPng(await readFile(publicPath(entry.maskSrc)));
  if (result.width !== GLYPH_SIZE || result.height !== GLYPH_SIZE) {
    throw new Error(`Expected 76x76 mask; received ${result.width}x${result.height} for ${entry.src}`);
  }
  return result.alpha;
}

async function readOriginal(entry) {
  const bytes = await readFile(safePath(entry.sourcePath));
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== GLYPH_SIZE || metadata.height !== GLYPH_SIZE) {
    throw new Error(`Expected a 76x76 official original for ${entry.sourcePath}`);
  }
  return bytes;
}

async function readInputAtlas() {
  const [atlasBytes, layoutBytes] = await Promise.all([
    readFile(AI_SOURCE_ATLAS),
    readFile(AI_SOURCE_LAYOUT),
  ]);
  const layout = JSON.parse(layoutBytes.toString("utf8"));
  const { width, height } = await sharp(atlasBytes).metadata();
  if (width !== layout.width || height !== layout.height) {
    throw new Error(`AI source atlas dimensions ${width}x${height} do not match its layout.`);
  }
  return { path: AI_SOURCE_ATLAS, layoutPath: AI_SOURCE_LAYOUT, layout, bytes: atlasBytes };
}

// Felzenszwalb/Huttenlocher squared Euclidean distance transform.
function edt1d(input, length) {
  const sites = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  const output = new Float64Array(length);
  let k = 0;
  sites[0] = 0;
  boundaries[0] = -Infinity;
  boundaries[1] = Infinity;

  for (let q = 1; q < length; q += 1) {
    let intersection = ((input[q] + q * q) - (input[sites[k]] + sites[k] * sites[k])) / (2 * q - 2 * sites[k]);
    while (intersection <= boundaries[k]) {
      k -= 1;
      intersection = ((input[q] + q * q) - (input[sites[k]] + sites[k] * sites[k])) / (2 * q - 2 * sites[k]);
    }
    k += 1;
    sites[k] = q;
    boundaries[k] = intersection;
    boundaries[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < length; q += 1) {
    while (boundaries[k + 1] < q) k += 1;
    const delta = q - sites[k];
    output[q] = delta * delta + input[sites[k]];
  }
  return output;
}

function squaredDistanceTransform(features, width, height) {
  const infinity = 1e20;
  const vertical = new Float64Array(width * height);
  const rowInput = new Float64Array(height);
  const colInput = new Float64Array(width);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) rowInput[y] = features[y * width + x] ? 0 : infinity;
    const column = edt1d(rowInput, height);
    for (let y = 0; y < height; y += 1) vertical[y * width + x] = column[y];
  }
  const distances = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) colInput[x] = vertical[y * width + x];
    const row = edt1d(colInput, width);
    for (let x = 0; x < width; x += 1) distances[y * width + x] = row[x];
  }
  return distances;
}

function makeSdf(alpha) {
  const total = GLYPH_SIZE * GLYPH_SIZE;
  const inside = new Uint8Array(total);
  const outside = new Uint8Array(total);
  for (let pixel = 0; pixel < total; pixel += 1) {
    const isInside = alpha[pixel] >= COVERAGE_THRESHOLD;
    inside[pixel] = isInside ? 1 : 0;
    outside[pixel] = isInside ? 0 : 1;
  }
  const toInside = squaredDistanceTransform(inside, GLYPH_SIZE, GLYPH_SIZE);
  const toOutside = squaredDistanceTransform(outside, GLYPH_SIZE, GLYPH_SIZE);
  const signed = new Float32Array(total);
  const encoded = Buffer.alloc(total * 4);
  for (let pixel = 0; pixel < total; pixel += 1) {
    const distance = Math.sqrt(inside[pixel] ? toOutside[pixel] : toInside[pixel]) - 0.5;
    const value = clamp(inside[pixel] ? distance : -distance, -SDF_RANGE, SDF_RANGE);
    signed[pixel] = value;
    const channel = Math.round(clamp(128 + (value / SDF_RANGE) * 127, 0, 255));
    const offset = pixel * 4;
    encoded[offset] = channel;
    encoded[offset + 1] = channel;
    encoded[offset + 2] = channel;
    encoded[offset + 3] = 255;
  }
  return { signed, encoded };
}

function bilinear(data, width, height, x, y) {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const top = data[y0 * width + x0] * (1 - tx) + data[y0 * width + x1] * tx;
  const bottom = data[y1 * width + x0] * (1 - tx) + data[y1 * width + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

function renderSdfAlpha(signed, size) {
  const scale = size / GLYPH_SIZE;
  const alpha = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const sourceY = (y + 0.5) / scale - 0.5;
    for (let x = 0; x < size; x += 1) {
      const sourceX = (x + 0.5) / scale - 0.5;
      const distance = bilinear(signed, GLYPH_SIZE, GLYPH_SIZE, sourceX, sourceY);
      alpha[y * size + x] = Math.round(clamp((distance * scale + 0.5) * 255, 0, 255));
    }
  }
  return alpha;
}

function edgeSet(binary, width, height) {
  const edges = new Uint8Array(binary.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!binary[index]) continue;
      if (
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        !binary[index - 1] || !binary[index + 1] || !binary[index - width] || !binary[index + width]
      ) edges[index] = 1;
    }
  }
  return edges;
}

function binaryTopology(binary, width, height) {
  const visited = new Uint8Array(binary.length);
  let components = 0;
  const queue = new Int32Array(binary.length);
  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || visited[start]) continue;
    components += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      for (let nextY = Math.max(0, y - 1); nextY <= Math.min(height - 1, y + 1); nextY += 1) {
        for (let nextX = Math.max(0, x - 1); nextX <= Math.min(width - 1, x + 1); nextX += 1) {
          const next = nextY * width + nextX;
          if (!binary[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }

  const backgroundVisited = new Uint8Array(binary.length);
  let backgroundComponents = 0;
  let exteriorComponents = 0;
  for (let start = 0; start < binary.length; start += 1) {
    if (binary[start] || backgroundVisited[start]) continue;
    backgroundComponents += 1;
    let head = 0;
    let tail = 0;
    let reachesEdge = false;
    queue[tail++] = start;
    backgroundVisited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      reachesEdge ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const next of neighbors) {
        if (next < 0 || next >= binary.length || binary[next] || backgroundVisited[next]) continue;
        if (Math.abs((next % width) - x) + Math.abs(Math.floor(next / width) - y) !== 1) continue;
        backgroundVisited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (reachesEdge) exteriorComponents += 1;
  }
  return { components, holes: Math.max(0, backgroundComponents - exteriorComponents) };
}

function hausdorffBetweenEdges(first, second, width, height) {
  const firstCount = first.reduce((sum, value) => sum + value, 0);
  const secondCount = second.reduce((sum, value) => sum + value, 0);
  if (!firstCount && !secondCount) return { meanPx: 0, maxPx: 0 };
  if (!firstCount || !secondCount) return { meanPx: null, maxPx: null };
  const distanceToFirst = squaredDistanceTransform(first, width, height);
  const distanceToSecond = squaredDistanceTransform(second, width, height);
  let max = 0;
  let sum = 0;
  let samples = 0;
  for (let pixel = 0; pixel < first.length; pixel += 1) {
    if (!first[pixel]) continue;
    const distance = Math.sqrt(distanceToSecond[pixel]);
    max = Math.max(max, distance);
    sum += distance;
    samples += 1;
  }
  for (let pixel = 0; pixel < second.length; pixel += 1) {
    if (!second[pixel]) continue;
    const distance = Math.sqrt(distanceToFirst[pixel]);
    max = Math.max(max, distance);
    sum += distance;
    samples += 1;
  }
  return { meanPx: sum / samples, maxPx: max };
}

function thresholdMask(alpha) {
  return Uint8Array.from(alpha, (value) => value >= COVERAGE_THRESHOLD ? 1 : 0);
}

function intersectionOverUnion(first, second) {
  let intersection = 0;
  let union = 0;
  for (let pixel = 0; pixel < first.length; pixel += 1) {
    intersection += first[pixel] && second[pixel] ? 1 : 0;
    union += first[pixel] || second[pixel] ? 1 : 0;
  }
  return union ? intersection / union : 1;
}

function mae(first, second) {
  let total = 0;
  for (let index = 0; index < first.length; index += 1) total += Math.abs(first[index] - second[index]);
  return total / first.length;
}

async function resizeAlpha(alpha, sourceSize, targetSize, kernel) {
  if (sourceSize === targetSize && kernel === "nearest") return Uint8Array.from(alpha);
  const { data, info } = await sharp(Buffer.from(alpha), {
    raw: { width: sourceSize, height: sourceSize, channels: 1 },
  }).resize(targetSize, targetSize, { kernel }).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== targetSize * targetSize) {
    throw new Error(`Alpha resize must remain single-channel ${targetSize}x${targetSize}; received ${info.channels} channels.`);
  }
  return Uint8Array.from(data);
}

async function compareUpscaleKernelRequests(manifest) {
  const comparisons = [];
  for (const jobId of SAMPLE_JOBS) {
    const sourceAlpha = await readMask(manifest.entries[jobId]);
    for (const size of [152, 304, 608]) {
      const lanczos = await resizeAlpha(sourceAlpha, GLYPH_SIZE, size, "lanczos3");
      const cubic = await resizeAlpha(sourceAlpha, GLYPH_SIZE, size, "cubic");
      comparisons.push({
        jobId,
        size,
        operation: "upscale",
        lanczos3RequestSha256: sha256(Buffer.from(lanczos)),
        cubicRequestSha256: sha256(Buffer.from(cubic)),
        byteIdentical: Buffer.from(lanczos).equals(Buffer.from(cubic)),
      });
    }
  }
  return comparisons;
}

function rasterKernelReport(comparisons) {
  const identicalCount = comparisons.filter((item) => item.byteIdentical).length;
  const allByteIdentical = comparisons.length > 0 && identicalCount === comparisons.length;
  return {
    sharpVersion: sharp.versions.sharp,
    libvipsVersion: sharp.versions.vips,
    requestedKernels: { lanczos: "lanczos3", cubic: "cubic" },
    localDeclaration: "node_modules/sharp/lib/index.d.ts ResizeOptions.kernel: the kernel to use for image reduction",
    resizeBehavior: "All candidates enlarge a 76px source. In Sharp 0.35.5 the kernel option is for reduction; these upscales use the same enlargement path and produce byte-identical alpha buffers for the two requests.",
    comparisonCount: comparisons.length,
    byteIdenticalCount: identicalCount,
    independentUpscaleMethodCount: allByteIdentical ? 1 : 2,
    methodsAreIndependent: !allByteIdentical,
    comparisons,
  };
}

async function appendKernelCaption(path) {
  const imageBytes = await readFile(path);
  const metadata = await sharp(imageBytes).metadata();
  const captionHeight = 26;
  const caption = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${captionHeight}"><rect width="100%" height="100%" fill="#101114"/><text x="16" y="18" fill="#c7ccd3" font-family="Arial,sans-serif" font-size="11">Lanczos3 and cubic kernel requests are byte-identical on these Sharp 0.35.5 upscales; they are not independent render methods.</text></svg>`,
  );
  const output = await sharp(imageBytes)
    .extend({ bottom: captionHeight, background: "#101114" })
    .composite([{ input: caption, left: 0, top: metadata.height }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path, output);
}

function interpOnEdge(first, second) {
  const delta = second.value - first.value;
  const t = Math.abs(delta) < 1e-8 ? 0.5 : clamp((COVERAGE_THRESHOLD - first.value) / delta, 0, 1);
  return { x: first.x + (second.x - first.x) * t, y: first.y + (second.y - first.y) * t };
}

function pointKey(point) {
  return `${Math.round(point.x * 1e5)}:${Math.round(point.y * 1e5)}`;
}

function traceMaskContours(alpha) {
  const width = GLYPH_SIZE;
  const height = GLYPH_SIZE;
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const values = new Uint8Array(paddedWidth * paddedHeight);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) values[(y + 1) * paddedWidth + x + 1] = alpha[y * width + x];
  }

  const segments = [];
  const edgePairs = {
    1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
    6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]],
    11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]],
  };

  for (let y = 0; y < paddedHeight - 1; y += 1) {
    for (let x = 0; x < paddedWidth - 1; x += 1) {
      const corners = [
        { x, y, value: values[y * paddedWidth + x] },
        { x: x + 1, y, value: values[y * paddedWidth + x + 1] },
        { x: x + 1, y: y + 1, value: values[(y + 1) * paddedWidth + x + 1] },
        { x, y: y + 1, value: values[(y + 1) * paddedWidth + x] },
      ];
      let mask = 0;
      for (let corner = 0; corner < 4; corner += 1) {
        if (corners[corner].value >= COVERAGE_THRESHOLD) mask |= 1 << corner;
      }
      if (mask === 0 || mask === 15) continue;
      let pairs = edgePairs[mask];
      if (mask === 5 || mask === 10) {
        const center = corners.reduce((sum, corner) => sum + corner.value, 0) / 4;
        const connectForeground = center >= COVERAGE_THRESHOLD;
        pairs = mask === 5
          ? (connectForeground ? [[3, 2], [0, 1]] : [[3, 0], [2, 1]])
          : (connectForeground ? [[3, 0], [2, 1]] : [[3, 2], [0, 1]]);
      }
      if (!pairs) continue;
      const edges = [
        [corners[0], corners[1]],
        [corners[1], corners[2]],
        [corners[3], corners[2]],
        [corners[0], corners[3]],
      ];
      for (const [startEdge, endEdge] of pairs) {
        const first = interpOnEdge(...edges[startEdge]);
        const second = interpOnEdge(...edges[endEdge]);
        // Shift the padded center-sample grid back onto the original 76px viewBox.
        first.x -= 0.5;
        first.y -= 0.5;
        second.x -= 0.5;
        second.y -= 0.5;
        segments.push([first, second]);
      }
    }
  }

  const adjacency = new Map();
  const nodes = new Map();
  segments.forEach(([first, second], segmentIndex) => {
    const firstKey = pointKey(first);
    const secondKey = pointKey(second);
    nodes.set(firstKey, first);
    nodes.set(secondKey, second);
    const firstList = adjacency.get(firstKey) ?? [];
    const secondList = adjacency.get(secondKey) ?? [];
    firstList.push(segmentIndex);
    secondList.push(segmentIndex);
    adjacency.set(firstKey, firstList);
    adjacency.set(secondKey, secondList);
  });

  const used = new Uint8Array(segments.length);
  const loops = [];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    if (used[segmentIndex]) continue;
    const loop = [];
    const [first, second] = segments[segmentIndex];
    used[segmentIndex] = 1;
    let previousSegment = segmentIndex;
    let currentKey = pointKey(first);
    let nextKey = pointKey(second);
    loop.push(nodes.get(currentKey));
    let guard = 0;
    while (guard <= segments.length + 2) {
      guard += 1;
      const candidateSegment = (adjacency.get(nextKey) ?? []).find((candidate) => candidate !== previousSegment && !used[candidate]);
      if (candidateSegment === undefined) {
        if (nextKey === pointKey(loop[0])) break;
        loop.push(nodes.get(nextKey));
        break;
      }
      used[candidateSegment] = 1;
      loop.push(nodes.get(nextKey));
      previousSegment = candidateSegment;
      const [a, b] = segments[candidateSegment];
      const aKey = pointKey(a);
      const bKey = pointKey(b);
      nextKey = aKey === nextKey ? bKey : aKey;
      if (nextKey === pointKey(loop[0])) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function svgForMask(alpha, title = "Derived FFXIV job glyph trace") {
  const loops = traceMaskContours(alpha);
  if (!loops.length) throw new Error("Vector trace produced no contours.");
  const pathData = loops.map((loop) => {
    const [first, ...rest] = loop;
    const commands = [`M${first.x.toFixed(3)} ${first.y.toFixed(3)}`];
    for (const point of rest) commands.push(`L${point.x.toFixed(3)} ${point.y.toFixed(3)}`);
    commands.push("Z");
    return commands.join(" ");
  }).join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 76 76" role="img" aria-label="${title}"><path d="${pathData}" fill="#fff" fill-rule="evenodd"/></svg>\n`;
}

async function rasterizeSvg(svg, size) {
  const { data, info } = await sharp(Buffer.from(svg)).resize(size, size, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(size * size);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = data[pixel * info.channels + 3];
  return alpha;
}

async function readAiCandidates({ aiDir, aiAtlas }) {
  if (!aiDir && !aiAtlas) return null;
  if (aiAtlas) {
    const atlasBytes = await readFile(isAbsolute(aiAtlas) ? aiAtlas : safePath(aiAtlas));
    const layout = (await readFile(AI_SOURCE_LAYOUT)).toString("utf8");
    const sourceLayout = JSON.parse(layout);
    const { data, info } = await sharp(atlasBytes).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
    if (info.width / 4 !== info.height / 2) throw new Error(`AI atlas must use square 4x2 cells; received ${info.width}x${info.height}`);
    if (info.width * sourceLayout.height !== info.height * sourceLayout.width) {
      throw new Error(`AI atlas aspect ratio changed from 4x2: ${info.width}x${info.height}`);
    }
    const candidates = {};
    for (const jobId of SAMPLE_JOBS) {
      const jobIndex = sourceLayout.jobs.indexOf(jobId);
      if (jobIndex < 0) throw new Error(`AI source layout has no cell coordinates for ${jobId}`);
      const column = jobIndex % sourceLayout.columns;
      const row = Math.floor(jobIndex / sourceLayout.columns);
      const crop = {
        left: Math.floor(column * info.width / sourceLayout.columns),
        top: Math.floor(row * info.height / sourceLayout.rows),
        width: Math.floor((column + 1) * info.width / sourceLayout.columns) - Math.floor(column * info.width / sourceLayout.columns),
        height: Math.floor((row + 1) * info.height / sourceLayout.rows) - Math.floor(row * info.height / sourceLayout.rows),
      };
      const { data: alphaBytes, info: cropInfo } = await sharp(Buffer.from(data), { raw: { width: info.width, height: info.height, channels: 1 } })
        .extract(crop)
        .resize(GLYPH_SIZE, GLYPH_SIZE, { kernel: "lanczos3" })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (cropInfo.channels !== 1 || alphaBytes.length !== GLYPH_SIZE * GLYPH_SIZE) {
        throw new Error(`AI grayscale crop did not produce 76x76 single-channel data: ${jobId}`);
      }
      // Atlas background is black; brightness is the candidate coverage.
      candidates[jobId] = Uint8Array.from(alphaBytes, (value) => Math.round(clamp((value - 6) * 255 / 249, 0, 255)));
    }
    return candidates;
  }

  const absoluteDir = isAbsolute(aiDir) ? aiDir : safePath(aiDir);
  const candidates = {};
  let found = false;
  for (const jobId of SAMPLE_JOBS) {
    const candidatePath = join(absoluteDir, `${jobId}.png`);
    try {
      await access(candidatePath);
    } catch {
      continue;
    }
    const { alpha, width, height } = await alphaFromPng(await readFile(candidatePath));
    if (width !== GLYPH_SIZE || height !== GLYPH_SIZE) {
      throw new Error(`AI candidate must be 76x76 after crop: ${candidatePath} (${width}x${height})`);
    }
    candidates[jobId] = alpha;
    found = true;
  }
  if (!found) return null;
  const missing = SAMPLE_JOBS.filter((jobId) => !candidates[jobId]);
  if (missing.length) throw new Error(`AI comparison requires all eight 76x76 crops; missing ${missing.join(", ")}`);
  return candidates;
}

function maskAreaCentroid(alpha) {
  const binary = thresholdMask(alpha);
  let area = 0;
  let totalX = 0;
  let totalY = 0;
  for (let index = 0; index < binary.length; index += 1) {
    if (!binary[index]) continue;
    area += 1;
    totalX += index % GLYPH_SIZE;
    totalY += Math.floor(index / GLYPH_SIZE);
  }
  return area ? { area, x: totalX / area, y: totalY / area } : { area: 0, x: (GLYPH_SIZE - 1) / 2, y: (GLYPH_SIZE - 1) / 2 };
}

function alignAiAlpha(aiAlpha, sourceAlpha) {
  const source = maskAreaCentroid(sourceAlpha);
  const ai = maskAreaCentroid(aiAlpha);
  if (source.area === 0 || ai.area === 0) {
    return { alpha: Uint8Array.from(aiAlpha), scale: 1, translateX: 0, translateY: 0, method: "identity; empty mask cannot be aligned" };
  }
  // Alignment is a single uniform scale from thresholded foreground area plus centroid translation.
  // It cannot bend the shape, use anisotropic scaling, or change topology.
  const scale = Math.sqrt(source.area / ai.area);
  const translateX = source.x - (ai.x - (GLYPH_SIZE - 1) / 2) * scale - (GLYPH_SIZE - 1) / 2;
  const translateY = source.y - (ai.y - (GLYPH_SIZE - 1) / 2) * scale - (GLYPH_SIZE - 1) / 2;
  const aligned = new Uint8Array(GLYPH_SIZE * GLYPH_SIZE);
  for (let y = 0; y < GLYPH_SIZE; y += 1) {
    for (let x = 0; x < GLYPH_SIZE; x += 1) {
      const sourceX = (x - translateX - (GLYPH_SIZE - 1) / 2) / scale + (GLYPH_SIZE - 1) / 2;
      const sourceY = (y - translateY - (GLYPH_SIZE - 1) / 2) / scale + (GLYPH_SIZE - 1) / 2;
      aligned[y * GLYPH_SIZE + x] = sourceX < 0 || sourceY < 0 || sourceX > GLYPH_SIZE - 1 || sourceY > GLYPH_SIZE - 1
        ? 0
        : Math.round(bilinear(aiAlpha, GLYPH_SIZE, GLYPH_SIZE, sourceX, sourceY));
    }
  }
  return { alpha: aligned, scale, translateX, translateY, method: "foreground-area scale + centroid translation; no rotation or non-uniform warp" };
}

function parseOptions(argv) {
  const options = { check: argv.includes("--check"), atlasOnly: argv.includes("--atlas-only"), decisionOnly: argv.includes("--decision-only"), readmeOnly: argv.includes("--readme-only"), manifestOnly: argv.includes("--manifest-only"), kernelAudit: argv.includes("--kernel-audit"), aiDir: null, aiAtlas: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--ai-dir") options.aiDir = argv[index + 1];
    if (argv[index].startsWith("--ai-dir=")) options.aiDir = argv[index].slice("--ai-dir=".length);
    if (argv[index] === "--ai-atlas") options.aiAtlas = argv[index + 1];
    if (argv[index].startsWith("--ai-atlas=")) options.aiAtlas = argv[index].slice("--ai-atlas=".length);
  }
  return options;
}

function round(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

async function calculateMetrics(candidate, reference, referenceAlpha, sourceAlpha, size) {
  const candidateBinary = thresholdMask(candidate.alpha);
  const referenceBinary = thresholdMask(reference.alpha);
  const candidateEdges = edgeSet(candidateBinary, size, size);
  const referenceEdges = edgeSet(referenceBinary, size, size);
  const topology = binaryTopology(candidateBinary, size, size);
  const referenceTopology = binaryTopology(referenceBinary, size, size);
  const boundaryDistance = hausdorffBetweenEdges(candidateEdges, referenceEdges, size, size);
  const downsampled = await resizeAlpha(candidate.alpha, size, GLYPH_SIZE, "lanczos3");
  return {
    method: candidate.method,
    size,
    silhouetteIoU: round(intersectionOverUnion(candidateBinary, referenceBinary)),
    topology,
    referenceTopology,
    topologyPreserved: topology.components === referenceTopology.components && topology.holes === referenceTopology.holes,
    alphaMaeVsNearestPixels: round(mae(candidate.alpha, referenceAlpha), 2),
    sourceDownsampleMae: round(mae(downsampled, sourceAlpha), 2),
    thresholdHausdorffPx: round(boundaryDistance.maxPx, 3),
    thresholdHausdorffSourcePx: round(boundaryDistance.maxPx === null ? null : boundaryDistance.maxPx / (size / GLYPH_SIZE), 4),
    meanBoundaryDistancePx: round(boundaryDistance.meanPx, 3),
  };
}

function numericGateForMetric(metric) {
  const reasons = [];
  if (NUMERIC_GATE.requireComponentAndHoleParity && !metric.topologyPreserved) reasons.push("component or hole count changed");
  if (metric.silhouetteIoU < NUMERIC_GATE.minSilhouetteIoU) reasons.push(`silhouette IoU ${metric.silhouetteIoU} below ${NUMERIC_GATE.minSilhouetteIoU}`);
  if (metric.thresholdHausdorffSourcePx === null || metric.thresholdHausdorffSourcePx > NUMERIC_GATE.maxHausdorffSourcePx) reasons.push(`threshold Hausdorff exceeds ${NUMERIC_GATE.maxHausdorffSourcePx} source px`);
  if (metric.sourceDownsampleMae > NUMERIC_GATE.maxSourceDownsampleMae255) reasons.push(`source downsample MAE exceeds ${NUMERIC_GATE.maxSourceDownsampleMae255}/255`);
  return { accepted: reasons.length === 0, reasons: reasons.length ? reasons : ["all stated numeric gates passed"] };
}

function acceptCandidate(method, metrics) {
  const complete = metrics.length > 0 && metrics.length === SAMPLE_JOBS.length * SIZES.length;
  if (!complete) return { accepted: false, reasons: ["sample grid is incomplete"] };
  const perPair = metrics.map((metric) => ({ ...metric, numericGate: numericGateForMetric(metric) }));
  const failures = [];
  const topologyFailure = perPair.filter((item) => !item.topologyPreserved);
  const iouFailure = perPair.filter((item) => item.silhouetteIoU < NUMERIC_GATE.minSilhouetteIoU);
  const edgeFailure = perPair.filter((item) => item.thresholdHausdorffSourcePx === null || item.thresholdHausdorffSourcePx > NUMERIC_GATE.maxHausdorffSourcePx);
  const downsampleFailure = perPair.filter((item) => item.sourceDownsampleMae > NUMERIC_GATE.maxSourceDownsampleMae255);
  if (topologyFailure.length) failures.push(`topology changes at ${topologyFailure.length} job/size pairs`);
  if (iouFailure.length) failures.push(`silhouette IoU below ${NUMERIC_GATE.minSilhouetteIoU} at ${iouFailure.length} job/size pairs`);
  if (edgeFailure.length) failures.push(`thresholded edge Hausdorff exceeds ${NUMERIC_GATE.maxHausdorffSourcePx} source px at ${edgeFailure.length} job/size pairs`);
  if (downsampleFailure.length) failures.push(`source downsample MAE exceeds ${NUMERIC_GATE.maxSourceDownsampleMae255}/255 at ${downsampleFailure.length} job/size pairs`);
  if (method === "ai") failures.push("parent visual review rejects production use: DRG fork/spine reinterpretation and lower-hole changes; PLD/AST corners rounded");

  const perJob = Object.fromEntries(SAMPLE_JOBS.map((jobId) => {
    const jobMetrics = perPair.filter((item) => item.jobId === jobId);
    return [jobId, {
      bySize: Object.fromEntries(SIZES.map((size) => {
        const metric = jobMetrics.find((item) => item.size === size);
        return [size, metric ? metric.numericGate : { accepted: false, reasons: ["measurement is missing"] }];
      })),
      allSizesPass: jobMetrics.length === SIZES.length && jobMetrics.every((item) => item.numericGate.accepted),
    }];
  }));

  return {
    accepted: failures.length === 0,
    reasons: failures.length ? failures : ["all numeric gates passed; visual review required"],
    perJob,
    metrics: perPair,
  };
}

function candidateFromMethod(method, alpha, size, sdf, svg, aiAlpha) {
  return (async () => {
    switch (method) {
      case "mask-baseline": return { method, alpha: await resizeAlpha(alpha, GLYPH_SIZE, size, "nearest") };
      case "lanczos": return { method, alpha: await resizeAlpha(alpha, GLYPH_SIZE, size, "lanczos3") };
      case "cubic": return { method, alpha: await resizeAlpha(alpha, GLYPH_SIZE, size, "cubic") };
      case "sdf": return { method, alpha: renderSdfAlpha(sdf.signed, size) };
      case "svg": return { method, alpha: await rasterizeSvg(svg, size) };
      case "ai": return { method, alpha: await resizeAlpha(aiAlpha, GLYPH_SIZE, size, "lanczos3") };
      default: throw new Error(`Unsupported candidate method: ${method}`);
    }
  })();
}

async function buildCandidates(manifest, aiCandidates) {
  const jobData = {};
  const rows = [];
  const allMetrics = [];
  const metricByMethod = Object.fromEntries([...METHODS, ...(aiCandidates ? ["ai"] : [])].map((method) => [method, []]));

  for (const jobId of SAMPLE_JOBS) {
    const entry = manifest.entries[jobId];
    const sourceAlpha = await readMask(entry);
    const originalPng = await readOriginal(entry);
    const sdf = makeSdf(sourceAlpha);
    const svg = svgForMask(sourceAlpha, `${JOB_LABELS[jobId]} derived vector trace candidate`);
    const aiAlignment = aiCandidates?.[jobId] ? alignAiAlpha(aiCandidates[jobId], sourceAlpha) : null;
    jobData[jobId] = { entry, sourceAlpha, originalPng, sdf, svg, aiAlignment, candidates: {} };
    const aiAlpha = aiCandidates?.[jobId] ?? null;

    for (const size of SIZES) {
      const referenceAlpha = await resizeAlpha(sourceAlpha, GLYPH_SIZE, size, "nearest");
      const reference = { alpha: referenceAlpha };
      for (const method of METHODS) {
        const candidate = await candidateFromMethod(method, sourceAlpha, size, sdf, svg, null);
        const metrics = await calculateMetrics(candidate, reference, referenceAlpha, sourceAlpha, size);
        metricByMethod[method].push({ jobId, ...metrics });
        allMetrics.push({ jobId, ...metrics });
        jobData[jobId].candidates[`${method}@${size}`] = candidate;
      }
      if (aiAlpha) {
        const candidate = await candidateFromMethod("ai", sourceAlpha, size, sdf, svg, aiAlpha);
        const metrics = await calculateMetrics(candidate, reference, referenceAlpha, sourceAlpha, size);
        const alignedCandidate = {
          method: "ai-uniform-aligned",
          alpha: await resizeAlpha(aiAlignment.alpha, GLYPH_SIZE, size, "lanczos3"),
        };
        const alignedMetrics = await calculateMetrics(alignedCandidate, reference, referenceAlpha, sourceAlpha, size);
        const metricEntry = {
          jobId,
          ...metrics,
          alignment: {
            method: aiAlignment.method,
            uniformScale: round(aiAlignment.scale, 5),
            translateXSourcePx: round(aiAlignment.translateX, 3),
            translateYSourcePx: round(aiAlignment.translateY, 3),
            noNonUniformWarp: true,
          },
          alignedMetrics,
        };
        metricByMethod.ai.push(metricEntry);
        allMetrics.push(metricEntry);
        jobData[jobId].candidates[`ai@${size}`] = candidate;
      }
    }
    const baselineTopology = binaryTopology(thresholdMask(sourceAlpha), GLYPH_SIZE, GLYPH_SIZE);
    rows.push({
      jobId,
      label: JOB_LABELS[jobId],
      officialSource: entry.sourcePath,
      officialSourceSha256: entry.sourceSha256,
      derivedMask: entry.maskSrc,
      derivedMaskSha256: entry.maskSha256,
      baselineTopology,
      svgCandidate: svg,
      sdfRangeSourcePx: SDF_RANGE,
    });
  }

  const methods = Object.fromEntries(Object.entries(metricByMethod).map(([method, metrics]) => [
    method,
    { ...acceptCandidate(method, metrics), sampleCount: metrics.length },
  ]));
  return { jobData, rows, metrics: allMetrics, methods };
}

function titleSvg({ width, height, title, subtitle = "" }) {
  const safeTitle = String(title).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const safeSubtitle = String(subtitle).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#101114"/><text x="18" y="26" fill="#f1eee7" font-family="Arial,sans-serif" font-weight="700" font-size="17">${safeTitle}</text>${subtitle ? `<text x="18" y="48" fill="#a9b1bc" font-family="Arial,sans-serif" font-size="11">${safeSubtitle}</text>` : ""}</svg>`);
}

async function panelForAlpha(alpha, size, targetSize = size, background = "#17191d") {
  const iconBytes = await pngFromAlpha(alpha, size, size);
  const scaled = targetSize === size
    ? iconBytes
    : await sharp(iconBytes).resize(targetSize, targetSize, { fit: "fill", kernel: "nearest" }).png().toBuffer();
  return sharp({ create: { width: targetSize, height: targetSize, channels: 4, background } })
    .composite([{ input: scaled, left: 0, top: 0 }]).png().toBuffer();
}

async function header(width, height, main, sub) {
  return titleSvg({ width, height, title: main, subtitle: sub });
}

async function createMainGrid(jobData, aiAvailable) {
  const methods = ["official", "mask-baseline", "lanczos", "cubic", "sdf", "svg", ...(aiAvailable ? ["ai"] : [])];
  const columns = methods.length;
  const panelSize = 304;
  const topHeight = 48;
  const cellWidth = panelSize + 24;
  const cellHeight = panelSize + topHeight + 16;
  const padding = 16;
  const gap = 14;
  const width = padding * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = padding * 2 + SAMPLE_JOBS.length * cellHeight + (SAMPLE_JOBS.length - 1) * gap;
  const titleHeight = 68;
  const labels = {
    official: "A · FAN KIT ORIGINAL",
    "mask-baseline": "76PX BORDERLESS BASELINE",
    lanczos: "B · LANCZOS3 REQUEST",
    cubic: "B · CUBIC REQUEST",
    sdf: "C · SDF / CPU BAKED",
    svg: "D · MARCHING SQUARES",
    ai: "E · AI CANDIDATE",
  };
  const composites = [{ input: await header(width, titleHeight, "FFXIV JOB ICON FIDELITY LAB", "304px candidates; Sharp 0.35.5 Lanczos3/Cubic kernel requests produce identical upscales (see caption and README)") , left: 0, top: 0 }];

  for (const [jobIndex, jobId] of SAMPLE_JOBS.entries()) {
    const item = jobData[jobId];
    const rowY = titleHeight + padding + jobIndex * (cellHeight + gap);
    for (const [methodIndex, method] of methods.entries()) {
      const x = padding + methodIndex * (cellWidth + gap);
      const label = await header(panelSize + 24, topHeight, `${JOB_LABELS[jobId]}  ·  ${labels[method]}`, "304px / alpha on common graphite field");
      composites.push({ input: label, left: x, top: rowY });
      let panel;
      if (method === "official") {
        panel = await sharp(item.originalPng).resize(panelSize, panelSize, { kernel: "lanczos3" }).png().toBuffer();
        panel = await sharp({ create: { width: panelSize, height: panelSize, channels: 4, background: "#e5e0d7" } }).composite([{ input: panel }]).png().toBuffer();
      } else {
        const candidate = item.candidates[`${method}@304`];
        panel = await panelForAlpha(candidate.alpha, panelSize, panelSize);
      }
      composites.push({ input: panel, left: x + 12, top: rowY + topHeight });
    }
  }

  const path = join(LAB_ROOT, "icon-fidelity-grid.png");
  await sharp({ create: { width, height: height + titleHeight, channels: 4, background: "#101114" } })
    .composite(composites).png({ compressionLevel: 9 }).toFile(path);
  return path;
}

async function createJobSizeBoards(jobData, aiAvailable) {
  const methods = ["official", "mask-baseline", "lanczos", "cubic", "sdf", "svg", ...(aiAvailable ? ["ai"] : [])];
  const labels = {
    official: "ORIGINAL PNG",
    "mask-baseline": "76PX MASK / NEAREST",
    lanczos: "LANCZOS3 REQUEST",
    cubic: "CUBIC REQUEST",
    sdf: "SIGNED DISTANCE FIELD",
    svg: "MARCHING SQUARES TRACE",
    ai: "AI CANDIDATE",
  };
  const directory = join(LAB_ROOT, "details");
  await mkdir(directory, { recursive: true });
  const outputs = [];

  for (const size of SIZES) {
    for (const zoom of [100, 200]) {
      const padding = 14;
      const gapX = 10;
      const gapY = 10;
      const labelHeight = 30;
      const cellWidth = size + 36;
      const rowHeight = size + labelHeight;
      const boardWidth = padding * 2 + methods.length * cellWidth + (methods.length - 1) * gapX;
      const boardHeight = 64 + SAMPLE_JOBS.length * rowHeight + (SAMPLE_JOBS.length - 1) * gapY;
      const composites = [{
        input: await header(boardWidth, 64, `${size}px OUTPUTS · ${zoom}% REVIEW`, zoom === 100 ? "Each full raster is shown at target pixel dimensions." : "Each centered half-size crop is enlarged exactly 2× with nearest-neighbor display to expose edge samples."),
        left: 0,
        top: 0,
      }];
      for (const [jobIndex, jobId] of SAMPLE_JOBS.entries()) {
        const item = jobData[jobId];
        const y = 64 + jobIndex * (rowHeight + gapY);
        for (const [methodIndex, method] of methods.entries()) {
          const x = padding + methodIndex * (cellWidth + gapX);
          const label = await header(cellWidth, labelHeight, `${JOB_LABELS[jobId]} · ${labels[method]}`, "");
          composites.push({ input: label, left: x, top: y });
          const sourceBytes = method === "official"
            ? await sharp(item.originalPng).resize(size, size, { kernel: "lanczos3" }).png().toBuffer()
            : await pngFromAlpha(item.candidates[`${method}@${size}`].alpha, size, size);
          let shownBytes = sourceBytes;
          if (zoom === 200) {
            const cropSize = Math.max(1, Math.floor(size / 2));
            const inset = Math.floor((size - cropSize) / 2);
            shownBytes = await sharp(sourceBytes).extract({ left: inset, top: inset, width: cropSize, height: cropSize })
              .resize(size, size, { kernel: "nearest" }).png().toBuffer();
          }
          const panel = await sharp({
            create: { width: cellWidth, height: size, channels: 4, background: method === "official" ? "#e3dfd6" : "#17191d" },
          }).composite([{ input: shownBytes, left: Math.floor((cellWidth - size) / 2), top: 0 }]).png().toBuffer();
          composites.push({ input: panel, left: x, top: y + labelHeight });
        }
      }
      const path = join(directory, `${size}px-${zoom}pct.png`);
      await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: "#101114" } })
        .composite(composites).png({ compressionLevel: 9 }).toFile(path);
      outputs.push(path);
    }
  }
  return outputs;
}

async function createHighResolutionDecisionSheet(jobData) {
  const jobs = ["gunbreaker", "dark-knight", "white-mage"];
  const padding = 16;
  const gapX = 12;
  const gapY = 12;
  const tileSize = 608;
  const tileWidth = 628;
  const rowHeight = 646;
  const headerHeight = 70;
  const width = padding * 2 + tileWidth * 4 + gapX * 3;
  const height = headerHeight + padding + rowHeight * jobs.length + gapY * (jobs.length - 1);
  const composites = [{
    input: await header(width, headerHeight, "HIGH-RES SDF REVIEW · GNB / DRK / WHM", "White alpha masks on identical graphite backgrounds · exact 608px outputs and matched central 304px crops enlarged 2×"),
    left: 0,
    top: 0,
  }];

  for (const [jobIndex, jobId] of jobs.entries()) {
    const item = jobData[jobId];
    const y = headerHeight + padding + jobIndex * (rowHeight + gapY);
    const nearest = item.candidates["mask-baseline@608"].alpha;
    const sdf = item.candidates["sdf@608"].alpha;
    const candidates = [nearest, sdf];
    const half = tileSize / 2;
    for (const [candidateIndex, alpha] of candidates.entries()) {
      const image = await pngFromAlpha(alpha, tileSize, tileSize);
      const zoom = await sharp(image)
        .extract({ left: half / 2, top: half / 2, width: half, height: half })
        .resize(tileSize, tileSize, { kernel: "nearest" })
        .png()
        .toBuffer();
      const rowImages = [image, zoom];
      for (const [zoomIndex, bytes] of rowImages.entries()) {
        const column = candidateIndex * 2 + zoomIndex;
        const x = padding + column * (tileWidth + gapX);
        const sourceLabel = candidateIndex === 0 ? "MASK · NEAREST" : "SDF · CPU BAKED";
        const zoomLabel = zoomIndex === 0 ? `${sourceLabel} · 100%` : `${sourceLabel} · CENTER CROP 200%`;
        const label = await header(tileWidth, 30, `${JOB_LABELS[jobId]} · ${zoomLabel}`, "608px render / dark-backed alpha inspection");
        const panel = await sharp({
          create: { width: tileWidth, height: tileSize, channels: 4, background: "#17191d" },
        }).composite([{ input: bytes, left: 10, top: 0 }]).png().toBuffer();
        composites.push({ input: label, left: x, top: y });
        composites.push({ input: panel, left: x, top: y + 30 });
      }
    }
  }
  const path = join(LAB_ROOT, "sdf-closeup-gunbreaker-dark-knight-white-mage.png");
  await sharp({ create: { width, height, channels: 4, background: "#101114" } })
    .composite(composites).png({ compressionLevel: 9 }).toFile(path);
  return path;
}

async function writeSampleCandidates(jobData, aiAvailable) {
  const root = join(LAB_ROOT, "candidates");
  await mkdir(root, { recursive: true });
  const assets = [];
  const methods = ["lanczos", "cubic", "sdf", "svg", ...(aiAvailable ? ["ai"] : [])];
  for (const jobId of SAMPLE_JOBS) {
    const item = jobData[jobId];
    const svgPath = join(root, "svg", `${jobId}.svg`);
    await mkdir(dirname(svgPath), { recursive: true });
    await writeFile(svgPath, item.svg, "utf8");
    assets.push({ jobId, method: "svg", path: svgPath, sha256: sha256(Buffer.from(item.svg)) });
    const sdfPath = join(root, "sdf-field", `${jobId}.png`);
    await mkdir(dirname(sdfPath), { recursive: true });
    const sdfBytes = await sharp(item.sdf.encoded, { raw: { width: GLYPH_SIZE, height: GLYPH_SIZE, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    await writeFile(sdfPath, sdfBytes);
    assets.push({ jobId, method: "sdf-field", path: sdfPath, sha256: sha256(sdfBytes), rangeSourcePx: SDF_RANGE });
    for (const size of [76, 152, 304, 608]) {
      for (const method of methods.filter((candidate) => candidate !== "svg")) {
        const bytes = await pngFromAlpha(item.candidates[`${method}@${size}`].alpha, size, size);
        const outputPath = join(root, method, `${jobId}@${size}.png`);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, bytes);
        assets.push({ jobId, method, size, path: outputPath, sha256: sha256(bytes) });
      }
      const vector = await rasterizeSvg(item.svg, size);
      const vectorBytes = await pngFromAlpha(vector, size, size);
      const vectorPath = join(root, "svg-raster", `${jobId}@${size}.png`);
      await mkdir(dirname(vectorPath), { recursive: true });
      await writeFile(vectorPath, vectorBytes);
      assets.push({ jobId, method: "svg-raster", size, path: vectorPath, sha256: sha256(vectorBytes) });
    }
  }
  return assets;
}

async function writePublicSampleCandidates(jobData) {
  const jobId = "gunbreaker";
  const item = jobData[jobId];
  const relative = `sdf/candidates/${jobId}@2432.png`;
  const path = join(PUBLIC_DERIVED_ROOT, relative);
  const alpha = renderSdfAlpha(item.sdf.signed, 2432);
  const bytes = await pngFromAlpha(alpha, 2432, 2432);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return {
    gunbreaker: {
      sdf: {
        status: "approved-editorial-exception-source",
        bySize: {
          2432: {
            src: `/assets/ffxiv/jobs/derived/${relative}`,
            width: 2432,
            height: 2432,
            sha256: sha256(bytes),
            note: "CPU-baked from the same 76px scalar field; not a separately measured fidelity size and adds no source detail.",
          },
        },
      },
    },
  };
}

function createDerivedManifest(manifest, result, production, publicCandidates) {
  const entries = {};
  for (const [jobId, source] of Object.entries(manifest.entries)) {
    if (jobId !== "gunbreaker") continue;
    const sdfMetrics = result.methods.sdf?.metrics.filter((metric) => metric.jobId === jobId) ?? [];
    const svgMetrics = result.methods.svg?.metrics.filter((metric) => metric.jobId === jobId) ?? [];
    const statusBySize = (metrics) => Object.fromEntries(SIZES.map((size) => {
      const metric = metrics.find((item) => item.size === size);
      return [size, metric ? (metric.numericGate.accepted ? "numeric-pass-visual-review-pending" : "numeric-gate-rejected") : "not-sampled"];
    }));
    const editorialAsset = publicCandidates.gunbreaker?.sdf.bySize[2432] ?? null;
    const gnb608 = result.methods.sdf?.metrics.find((metric) => metric.jobId === "gunbreaker" && metric.size === 608);
    entries[jobId] = {
      source: {
        kind: "official-raster",
        src: source.src,
        maskSrc: source.maskSrc,
        width: source.width,
        height: source.height,
        sourceSha256: source.sourceSha256,
        maskSha256: source.maskSha256,
      },
      candidates: SAMPLE_JOBS.includes(jobId) ? {
        sdf: {
          status: jobId === "gunbreaker" ? "approved-editorial-exception-only" : "sample-candidate-not-approved",
          bySize: statusBySize(sdfMetrics),
          ...(jobId === "gunbreaker" && editorialAsset && gnb608 ? {
            bySizeOverrides: {
              2432: {
                status: "approved-editorial-exception-source",
                productionApproved: true,
                approvedUseCases: ["editorialLarge"],
                asset: editorialAsset,
                measuredAtSize: 608,
                separatelyMeasured: false,
                exactNearestNeighborIoU: gnb608.silhouetteIoU,
                exactNearestNeighborIoUPassed: false,
                topologyPreserved: gnb608.topologyPreserved,
                thresholdHausdorffSourcePx: gnb608.thresholdHausdorffSourcePx,
                sourceDownsampleMae: gnb608.sourceDownsampleMae,
                approvalRationale: "Parent approved after reviewing the dark-backed comparison: GNB silhouette remains intact. Exact NN IoU fails the strict 0.985 gate; topology, subpixel edge distance, source-downsample error, and visual review support this Editorial large-only exception.",
              },
            },
          } : {}),
        },
        svg: { status: "sample-candidate-numeric-rejected", bySize: statusBySize(svgMetrics) },
        ai: { status: "visually-rejected" },
      } : { status: "not-sampled" },
    };
  }
  return {
    schemaVersion: 1,
    generatedBy: "tools/icon-fidelity-lab.mjs",
    sourceManifest: "./job-icon-manifest.json",
    selectedProductionMethod: production.selectedMethod,
    productionAssetCount: production.assetCount,
    productionApproved: production.assetCount === 33,
    approvedPerJobUseExceptions: ["gunbreaker:sdf:editorialLarge"],
    numericGate: NUMERIC_GATE,
    candidateStatusSummary: {
      sampledJobs: SAMPLE_JOBS.length,
      sdf: "strict full-sample IoU gate not passed; per-job numeric measurements are in docs/qa/icon-fidelity/metrics.json",
      svg: "rejected after topology and edge-distance changes; per-job measurements are in docs/qa/icon-fidelity/metrics.json",
      ai: "visually rejected; raw/aligned measurements are in docs/qa/icon-fidelity/metrics.json",
    },
    recommendationByUse: {
      picker: { preferred: "official-raster", candidate: null },
      cinematicSmallMark: { preferred: "official-raster", candidate: null },
      identityMediumEmblem: { preferred: "official-raster", candidate: "76px source/mask reviewed at actual export scale; no derived medium source selected" },
      editorialLargeMotif: { preferred: "derived-sdf-raster for gunbreaker only; official raster fallback for all other jobs", candidate: "gunbreaker@2432 CPU bake from reviewed scalar field" },
    },
    entries,
  };
}

async function writeDerivedManifestFile(derivedManifest) {
  const manifestPath = join(ROOT, "src/lib/ffxiv-assets/derived-job-icon-manifest.json");
  await writeFile(manifestPath, bytesOf(derivedManifest));
  return manifestPath;
}

function safeProductionMethod(methods) {
  for (const method of ["svg", "sdf"]) {
    if (methods[method]?.accepted) return method;
  }
  return null;
}

async function generateAllJobDerivedAssets(manifest, productionMethod) {
  if (!productionMethod) return { selectedMethod: null, assetCount: 0, entries: {} };
  const entries = {};
  const selected = new Set(Object.keys(manifest.entries));
  if (selected.size !== 33) throw new Error(`Expected 33 reviewed icons for production asset generation; found ${selected.size}`);
  for (const [jobId, entry] of Object.entries(manifest.entries)) {
    const alpha = await readMask(entry);
    const directory = join(PUBLIC_DERIVED_ROOT, productionMethod);
    await mkdir(directory, { recursive: true });
    if (productionMethod === "sdf") {
      const sdf = makeSdf(alpha);
      const fieldPath = join(directory, "fields", `${jobId}.png`);
      const fieldBytes = await sharp(sdf.encoded, { raw: { width: GLYPH_SIZE, height: GLYPH_SIZE, channels: 4 } })
        .png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
      await mkdir(dirname(fieldPath), { recursive: true });
      await writeFile(fieldPath, fieldBytes);
      const rasters = {};
      for (const size of SIZES) {
        const alphaAtSize = renderSdfAlpha(sdf.signed, size);
        const bytes = await pngFromAlpha(alphaAtSize, size, size);
        const imagePath = join(directory, `${jobId}@${size}.png`);
        await writeFile(imagePath, bytes);
        rasters[size] = {
          src: `/assets/ffxiv/jobs/derived/sdf/${jobId}@${size}.png`,
          width: size,
          height: size,
          sha256: sha256(bytes),
        };
      }
      entries[jobId] = {
        kind: "derived-sdf",
        sourceMaskSrc: entry.maskSrc,
        field: { src: `/assets/ffxiv/jobs/derived/sdf/fields/${jobId}.png`, width: 76, height: 76, rangeSourcePx: SDF_RANGE, sha256: sha256(fieldBytes) },
        rasters,
      };
    } else {
      const svg = svgForMask(alpha, `${jobId} derived vector trace`);
      const svgPath = join(directory, `${jobId}.svg`);
      const svgBytes = Buffer.from(svg, "utf8");
      await writeFile(svgPath, svgBytes);
      const rasters = {};
      for (const size of SIZES) {
        const alphaAtSize = await rasterizeSvg(svg, size);
        const bytes = await pngFromAlpha(alphaAtSize, size, size);
        const imagePath = join(directory, `${jobId}@${size}.png`);
        await writeFile(imagePath, bytes);
        rasters[size] = {
          src: `/assets/ffxiv/jobs/derived/svg/${jobId}@${size}.png`,
          width: size,
          height: size,
          sha256: sha256(bytes),
        };
      }
      entries[jobId] = {
        kind: "derived-vector",
        sourceMaskSrc: entry.maskSrc,
        svg: { src: `/assets/ffxiv/jobs/derived/svg/${jobId}.svg`, sha256: sha256(svgBytes) },
        rasters,
      };
    }
  }
  return { selectedMethod: productionMethod, assetCount: Object.keys(entries).length, entries };
}

function formatMethodReport(method, result) {
  const displayName = method.toUpperCase();
  const status = result.accepted ? "ACCEPTED FOR DERIVED PRODUCTION SAMPLE" : "REJECTED FOR AUTOMATIC PRODUCTION SELECTION";
  const reasons = result.reasons.map((reason) => `- ${reason}`).join("\n");
  const bySize = SIZES.map((size) => {
    const points = result.metrics.filter((item) => item.size === size);
    if (!points.length) return `  - ${size}px: no candidate supplied`;
    const averageIou = points.reduce((sum, item) => sum + item.silhouetteIoU, 0) / points.length;
    const maxHausdorff = Math.max(...points.map((item) => item.thresholdHausdorffSourcePx ?? Infinity));
    const topologyBreaks = points.filter((item) => !item.topologyPreserved).length;
    const maxDownsampleMae = Math.max(...points.map((item) => item.sourceDownsampleMae ?? Infinity));
    const alignedPoints = points.filter((item) => item.alignedMetrics);
    const alignedIoU = alignedPoints.length
      ? round(alignedPoints.reduce((sum, item) => sum + item.alignedMetrics.silhouetteIoU, 0) / alignedPoints.length, 5)
      : null;
    return `  - ${size}px: mean silhouette IoU ${round(averageIou, 5)}${alignedIoU === null ? "" : `; after centroid translation + uniform scale ${alignedIoU}`}, max threshold Hausdorff ${round(maxHausdorff, 4)} source px, source downsample max MAE ${round(maxDownsampleMae, 2)}/255, topology changes ${topologyBreaks}/${points.length}`;
  }).join("\n");
  return `### ${displayName}\n\n${status}.\n\n${reasons}\n\n${bySize}`;
}

function renderReadme(metricsDocument) {
  const selected = metricsDocument.production.selectedMethod;
  const decisions = Object.entries(metricsDocument.methods)
    .map(([method, value]) => formatMethodReport(method, value))
    .join("\n\n");
  const code = String.fromCharCode(96);
  const fence = code.repeat(3);
  const productionSentence = selected
    ? `The 8-job numeric gate selected **${selected.toUpperCase()}** for the complete 33-icon derived set. It is a derived rendering source and does not replace Fan Kit originals or their 76px masks.`
    : "No derived method passed the full eight-job strict numeric gate. No full 33-icon production asset set was generated.";
  const editorialException = metricsDocument.production.editorialException;
  const exceptionSentence = editorialException
    ? `GNB has an approved Editorial large exception using ${editorialException.src}. Its 608px measured candidate has IoU ${editorialException.measurements.silhouetteIoU} against nearest-neighbor (the 0.985 gate is explicitly failed), with components/holes preserved, edge Hausdorff ${editorialException.measurements.thresholdHausdorffSourcePx} source px, downsample MAE ${editorialException.measurements.sourceDownsampleMae}/255, and parent visual approval. Other jobs and use cases keep official source/mask assets.`
    : "";
  const aiNotes = metricsDocument.aiCandidate.provided
    ? "The AI candidate is included from the generated 1774×887 4×2 atlas. Each 443/444px square is cropped at the same floor-rounded cell boundaries, then resized uniformly to 76px. Metrics show both the unaligned crop and a separate centroid translation plus uniform scale alignment; no non-uniform warping is used. Parent visual review rejected production use after noting DRG fork/spine reinterpretation and lower-hole changes, plus rounded PLD/AST corners."
    : "No AI candidate was provided in this run.";
  return [
    "# FFXIV job icon fidelity lab",
    "",
    "Phase 2.7.2 comparison for eight representative jobs. The Fan Kit source PNGs are byte-preserved. Every comparison starts from the existing 76×76 derived borderless white alpha mask; the color original is shown separately as a visual baseline.",
    "",
    "## Input atlas",
    "",
    "- [Canonical AI source atlas](../award-pass/ai-source-atlas.png), 304×152px: 4 columns × 2 rows of native 76px cells, with white source-mask glyphs over black.",
    "- [Atlas layout](../award-pass/ai-source-atlas.json) records its dimensions and job order. The lab consumes the parent session's atlas and does not write a duplicate.",
    "",
    `The comparison jobs are PLD, DRK, GNB, WHM, AST, DRG, BLM and DNC. Candidates include the original PNG, borderless mask nearest enlargement, Sharp Lanczos3/cubic kernel requests, an alpha-derived signed distance field, an SVG marching-squares trace, and AI from the generated atlas using ${code}--ai-atlas${code}.`,
    "",
    "## Boards and data",
    "",
    "- [Main fidelity grid](./icon-fidelity-grid.png) compares each method at 304px under one background condition and carries a caption explaining the identical Sharp upscaling requests.",
    "- [Size review boards](./details/) show 76/152/304/608px outputs at 100%, plus centered half-size crops enlarged 2× with nearest-neighbor display for edge inspection.",
    "- [GNB/DRK/WHM high-resolution decision sheet](./sdf-closeup-gunbreaker-dark-knight-white-mage.png) compares 608px nearest-neighbor masks and CPU-baked SDF outputs, including matched 200% crops.",
    "- [Metrics](./metrics.json) includes measured silhouette IoU, connected components, holes, alpha MAE, downsample-to-source MAE, edge Hausdorff distance in output and source pixels, source/mask hashes, SDF definition, per-candidate decisions, and per-pair Lanczos3/cubic byte comparisons.",
    "- [Candidate PNG/SVG artifacts](./candidates/) are lab outputs; they are explicitly derived assets, not Fan Kit originals.",
    "",
    "## Method",
    "",
    "- Candidate geometry uses the existing mask PNG alpha channel at a 128/255 threshold. Source colors and frame are not included in silhouette metrics.",
    "- The monochrome 76px mask is the input. The raster baseline is nearest-neighbor enlargement of that mask. This makes the pixel source and expected silhouette explicit.",
    "- Lanczos3 and cubic interpolation resize the same source alpha. They do not add source detail.",
    "- Sharp 0.35.5 documents `ResizeOptions.kernel` as the kernel for image reduction. These candidates enlarge 76px masks to 152/304/608px. I checked all 24 job/size pairs: `kernel:'lanczos3'` and `kernel:'cubic'` produced byte-identical buffers in every pair, so the two board columns are request probes of the same Sharp enlargement result, not independent interpolation methods. The metrics retain each pair's output hashes.",
    `- SDF is a single-channel signed distance field derived from that binary alpha silhouette, stored as RGB with alpha 255. The encoded range is ±${SDF_RANGE} source pixels, with zero at 128. Its 76/152/304/608 PNGs are CPU-baked from bilinear field samples; no WebGL or browser SDF shader is required. SDF smooths a sampled edge but cannot recover detail missing from 76px input.`,
    "- The 2432px GNB Editorial source is a separate CPU bake from the same scalar field for 2×/4× export parity. It was not separately measured for silhouette metrics and contains no extra source detail.",
    "- SVG uses marching squares at the 128 alpha threshold and an even-odd fill rule. No curve smoothing or contour simplification is applied, so it cannot round corners through a smoothing pass; holes are preserved only if measured topology agrees.",
    "- IoU and topology compare each candidate threshold against the nearest-neighbor source silhouette at the same size. Edge Hausdorff is symmetric between foreground boundary pixel sets. Source downsample MAE compares a Lanczos-downsampled candidate alpha to the original 76px mask alpha.",
    "- Numeric acceptance requires 32/32 job/size measurements, identical connected-component and hole counts, silhouette IoU ≥ 0.985, maximum threshold Hausdorff ≤ 0.75 source pixels, and source downsample MAE ≤ 5/255. Passing the numeric gate is necessary; it does not replace visual review for corner, thin-line, and contour character.",
    "",
    "## Measured decision",
    "",
    decisions,
    "",
    aiNotes,
    "",
    productionSentence,
    exceptionSentence,
    "",
    "## Production strategy recommendation",
    "",
    "- Picker and cinematic small mark: official Fan Kit raster.",
    "- Identity medium emblem: official source/mask. The 76px mask was reviewed at actual export scale; no missing marks or halo were found, so no derived medium source is selected.",
    "- Editorial large motif: GNB alone uses the parent-approved 2432px CPU-baked SDF source, derived from the same 76px field. It covers the 2265px motif at 4× (4195×5243 export) and 1166px at 2× (2160×2700 export), with no added detail. Every other job and use case stays on its official source/mask.",
    "- The lab module does not change the existing asset resolver or rendering component.",
    "",
    "## Regeneration",
    "",
    `${fence}sh`,
    "node tools/icon-fidelity-lab.mjs",
    "node tools/icon-fidelity-lab.mjs --ai-atlas <generated-atlas-path>",
    "node tools/icon-fidelity-lab.mjs --ai-dir <directory-of-8-crops>",
    "node tools/icon-fidelity-lab.mjs --kernel-audit",
    "node tools/icon-fidelity-lab.mjs --check",
    fence,
    "",
    "AI candidate atlases are cropped using exact floor-rounded 4×2 cell boundaries, converted from grayscale to coverage, and resized uniformly. Alignment metrics are separate from the candidate's unaligned metrics; neither alignment stage bends the icon.",
  ].join("\n") + "\n";
}

async function writeOutputs(manifest, result, atlas, aiAvailable, check) {
  const productionMethod = safeProductionMethod(result.methods);
  const sampleAssets = await writeSampleCandidates(result.jobData, aiAvailable);
  const production = await generateAllJobDerivedAssets(manifest, productionMethod);
  const rasterKernelComparison = await compareUpscaleKernelRequests(manifest);
  const publicCandidates = await writePublicSampleCandidates(result.jobData);
  const derivedManifest = createDerivedManifest(manifest, result, production, publicCandidates);
  const derivedManifestPath = await writeDerivedManifestFile(derivedManifest);
  const decisionSheetPath = await createHighResolutionDecisionSheet(result.jobData);
  const gnb608 = result.methods.sdf.metrics.find((metric) => metric.jobId === "gunbreaker" && metric.size === 608);
  const gnbHighResolutionSource = publicCandidates.gunbreaker.sdf.bySize[2432];
  const metricsDocument = {
    schemaVersion: 1,
    generatedAt: "deterministic; no wall-clock timestamp",
    jobs: result.rows,
    methods: result.methods,
    metrics: result.metrics,
    comparison: {
      sizes: SIZES,
      baseline: "thresholded 76x76 derived borderless mask, resized with nearest neighbor",
      maskAlphaThreshold: COVERAGE_THRESHOLD,
      distanceTransform: "Felzenszwalb/Huttenlocher exact squared Euclidean distance transform",
      sdf: { encoding: "gray = 128 + signedDistanceSourcePx / 16 * 127", rangeSourcePx: SDF_RANGE, zeroValue: 128, bake: "CPU bilinear field sampling and 1px output coverage ramp; no WebGL" },
      vector: { trace: "linear marching squares on 76x76 alpha samples at 128/255 threshold", smoothing: "none", holes: "evenodd fill; verified against thresholded raster topology" },
      raster: {
        lanczos: "sharp ResizeOptions.kernel='lanczos3' request",
        cubic: "sharp ResizeOptions.kernel='cubic' request",
        ...rasterKernelReport(rasterKernelComparison),
        captionApplied: true,
      },
      acceptance: { fullSamplePairs: SAMPLE_JOBS.length * SIZES.length, ...NUMERIC_GATE },
    },
    atlas: { src: "../award-pass/ai-source-atlas.png", layout: "../award-pass/ai-source-atlas.json", width: atlas.layout.width, height: atlas.layout.height, jobs: SAMPLE_JOBS },
    production: {
      selectedMethod: production.selectedMethod,
      fullSetAssetCount: production.assetCount,
      entries: production.entries,
      editorialException: {
        jobId: "gunbreaker",
        method: "sdf",
        usage: "editorialLarge",
        src: gnbHighResolutionSource.src,
        width: gnbHighResolutionSource.width,
        height: gnbHighResolutionSource.height,
        status: "parent-approved-editorial-only-exception",
        measuredAtSize: 608,
        separatelyMeasuredAtSourceSize: false,
        measurements: {
          silhouetteIoU: gnb608.silhouetteIoU,
          exactIoUGatePassed: gnb608.numericGate.accepted,
          topologyPreserved: gnb608.topologyPreserved,
          topology: gnb608.topology,
          referenceTopology: gnb608.referenceTopology,
          thresholdHausdorffSourcePx: gnb608.thresholdHausdorffSourcePx,
          sourceDownsampleMae: gnb608.sourceDownsampleMae,
        },
        rationale: "Parent reviewed 608px and matched 200% dark-backed comparisons; GNB silhouette, components, and holes remain unchanged. The strict 0.985 nearest-neighbor IoU gate is explicitly not passed.",
        sourceDetail: "76px source mask, CPU-baked from the same scalar field at 2432px; no inferred or added detail.",
        fallback: { src: manifest.entries.gunbreaker.src, maskSrc: manifest.entries.gunbreaker.maskSrc, width: 76, height: 76 },
      },
    },
    labAssets: sampleAssets.map((asset) => ({ ...asset, path: asset.path.slice(ROOT.length + 1) })),
    publicLabCandidates: publicCandidates,
    derivedManifest: { path: derivedManifestPath.slice(ROOT.length + 1), approvedJobs: ["gunbreaker"], approvedUseCases: ["editorialLarge"] },
    highResolutionDecisionSheet: { path: decisionSheetPath.slice(ROOT.length + 1), jobs: ["gunbreaker", "dark-knight", "white-mage"], targetSize: 608, cropScale: "200%" },
    aiCandidate: aiAvailable ? {
      provided: true,
      source: "ai-generated-atlas.png",
      sourceDimensions: { width: 1774, height: 887 },
      crop: "floor-rounded fractional 4x2 cells; each cell uniformly normalized to 76x76",
      visualReview: {
        acceptedForProduction: false,
        findings: [
          "DRG fork/spine was lost or reinterpreted and lower holes changed.",
          "PLD and AST corners rounded.",
          "Candidate remains excluded from production regardless of alignment metrics.",
        ],
      },
      acceptance: result.methods.ai,
    } : { provided: false, reason: "No AI atlas or complete per-job 76x76 crop set was provided." },
  };
  const metricsBytes = bytesOf(metricsDocument);
  const readmeBytes = Buffer.from(renderReadme(metricsDocument), "utf8");
  const gridPath = await createMainGrid(result.jobData, aiAvailable);
  const detailPaths = await createJobSizeBoards(result.jobData, aiAvailable);
  await appendKernelCaption(gridPath);
  const publicCandidateFiles = Object.values(publicCandidates).flatMap((item) => [
    ...Object.values(item.sdf.bySize).map((asset) => publicPath(asset.src)),
  ]);
  const outputFiles = [
    join(LAB_ROOT, "metrics.json"),
    join(LAB_ROOT, "README.md"),
    gridPath,
    decisionSheetPath,
    derivedManifestPath,
    ...detailPaths,
    gridPath,
    ...sampleAssets.map((asset) => asset.path),
    ...publicCandidateFiles,
  ];
  await writeFile(join(LAB_ROOT, "metrics.json"), metricsBytes);
  await writeFile(join(LAB_ROOT, "README.md"), readmeBytes);
  if (check) {
    for (const path of outputFiles) await access(path);
    const storedMetrics = JSON.parse(await readFile(join(LAB_ROOT, "metrics.json"), "utf8"));
    assert.deepEqual(storedMetrics.production.selectedMethod, production.selectedMethod);
    assert.equal(storedMetrics.jobs.length, SAMPLE_JOBS.length);
    assert.equal(Object.keys(storedMetrics.production.entries).length, production.assetCount);
    if (production.selectedMethod) assert.equal(production.assetCount, 33);
    assert.equal(storedMetrics.production.editorialException.jobId, "gunbreaker");
    assert.equal(storedMetrics.production.editorialException.measurements.exactIoUGatePassed, false);
    assert.equal(storedMetrics.production.editorialException.width, 2432);
  }
  return { metricsDocument, gridPath, detailPaths, production };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const atlas = await readInputAtlas();
  if (options.readmeOnly) {
    const metricsPath = join(LAB_ROOT, "metrics.json");
    const metricsDocument = JSON.parse(await readFile(metricsPath, "utf8"));
    await writeFile(join(LAB_ROOT, "README.md"), renderReadme(metricsDocument), "utf8");
    const derivedManifestPath = join(ROOT, "src/lib/ffxiv-assets/derived-job-icon-manifest.json");
    const derivedManifest = JSON.parse(await readFile(derivedManifestPath, "utf8"));
    derivedManifest.recommendationByUse.identityMediumEmblem.candidate = "76px source/mask reviewed at actual export scale; no derived medium source selected";
    await writeFile(derivedManifestPath, bytesOf(derivedManifest));
    process.stdout.write(`Updated lab README and compact recommendation metadata from ${metricsPath}.\n`);
    return;
  }
  if (options.manifestOnly) {
    const metricsDocument = JSON.parse(await readFile(join(LAB_ROOT, "metrics.json"), "utf8"));
    const production = {
      selectedMethod: metricsDocument.production.selectedMethod,
      assetCount: metricsDocument.production.fullSetAssetCount,
      entries: metricsDocument.production.entries,
    };
    const derivedManifest = createDerivedManifest(manifest, metricsDocument, production, metricsDocument.publicLabCandidates);
    const path = await writeDerivedManifestFile(derivedManifest);
    process.stdout.write(`Updated compact runtime manifest: ${path}\n`);
    return;
  }
  if (options.kernelAudit) {
    const metricsPath = join(LAB_ROOT, "metrics.json");
    const metricsDocument = JSON.parse(await readFile(metricsPath, "utf8"));
    const captionAlreadyApplied = metricsDocument.comparison.raster?.captionApplied === true;
    const comparisons = await compareUpscaleKernelRequests(manifest);
    metricsDocument.comparison.raster = {
      lanczos: "sharp ResizeOptions.kernel='lanczos3' request",
      cubic: "sharp ResizeOptions.kernel='cubic' request",
      ...rasterKernelReport(comparisons),
    };
    if (!captionAlreadyApplied) await appendKernelCaption(join(LAB_ROOT, "icon-fidelity-grid.png"));
    metricsDocument.comparison.raster.captionApplied = true;
    await writeFile(metricsPath, bytesOf(metricsDocument));
    await writeFile(join(LAB_ROOT, "README.md"), renderReadme(metricsDocument), "utf8");
    process.stdout.write(`Sharp ${sharp.versions.sharp}/${sharp.versions.vips}: ${metricsDocument.comparison.raster.byteIdenticalCount}/${comparisons.length} Lanczos3/cubic upscale requests byte-identical; updated metrics, README, and grid caption.\n`);
    return;
  }
  if (options.atlasOnly) {
    process.stdout.write(`Using canonical AI atlas: ${atlas.path}\nLayout: ${atlas.layoutPath}\n`);
    return;
  }
  if (!options.aiAtlas && !options.aiDir) {
    try {
      await access(AI_CANDIDATE_ATLAS);
      options.aiAtlas = AI_CANDIDATE_ATLAS;
    } catch {
      // AI is optional until the parent session provides the generated atlas.
    }
  }
  const aiCandidates = await readAiCandidates(options);
  const result = await buildCandidates(manifest, aiCandidates);
  if (options.decisionOnly) {
    const decisionSheet = await createHighResolutionDecisionSheet(result.jobData);
    process.stdout.write(`High-resolution decision sheet: ${decisionSheet}\n`);
    return;
  }
  const outputs = await writeOutputs(manifest, result, atlas, Boolean(aiCandidates), options.check);
  const methods = Object.entries(result.methods).map(([method, value]) => `${method}: ${value.accepted ? "accepted" : "rejected"}`).join("\n");
  process.stdout.write(`Created icon fidelity lab outputs.\n${methods}\n`);
  process.stdout.write(`Production method: ${outputs.production.selectedMethod ?? "official-raster fallback"} (${outputs.production.assetCount} reviewed job entries)\n`);
  process.stdout.write(`Grid: ${outputs.gridPath}\nMetrics: ${join(LAB_ROOT, "metrics.json")}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();

export {
  alignAiAlpha,
  binaryTopology,
  makeSdf,
  renderSdfAlpha,
  svgForMask,
  traceMaskContours,
};

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

// These maps are transparent, full-sheet overlays. At 1280 × 1600 they retain
// fine detail in the 2× exports while staying close to the card's 4:5 ratio.
export const WIDTH = 1280;
export const HEIGHT = 1600;
export const CHANNELS = 4;
export const OUTPUT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/images/materials');
export const MATERIAL_SEEDS = Object.freeze({
  'cinematic-film-grain': 0x1f1a0a11,
  'editorial-paper-surface': 0x4e2c7993,
  'editorial-ink-density': 0x6d928c31,
  'identity-matte-fiber': 0x83a1f50d,
});

const WEBP_OPTIONS = Object.freeze({ quality: 39, alphaQuality: 82, effort: 6, smartSubsample: false });

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoiseGrid(columns, rows, seed) {
  const next = randomSource(seed);
  const values = new Float32Array(columns * rows);
  for (let index = 0; index < values.length; index += 1) values[index] = next() * 2 - 1;
  return { columns, rows, values };
}

function sampleNoise(grid, x, y) {
  const gx = x * (grid.columns - 1);
  const gy = y * (grid.rows - 1);
  const left = Math.floor(gx);
  const top = Math.floor(gy);
  const right = Math.min(left + 1, grid.columns - 1);
  const bottom = Math.min(top + 1, grid.rows - 1);
  const tx = gx - left;
  const ty = gy - top;
  const upperLeft = grid.values[top * grid.columns + left];
  const upperRight = grid.values[top * grid.columns + right];
  const lowerLeft = grid.values[bottom * grid.columns + left];
  const lowerRight = grid.values[bottom * grid.columns + right];
  const upper = upperLeft + (upperRight - upperLeft) * tx;
  const lower = lowerLeft + (lowerRight - lowerLeft) * tx;
  return upper + (lower - upper) * ty;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function writePixel(pixels, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || alpha <= 0) return;
  const offset = (Math.floor(y) * WIDTH + Math.floor(x)) * CHANNELS;
  const existingAlpha = pixels[offset + 3] / 255;
  const nextAlpha = Math.max(0, Math.min(1, alpha / 255));
  const combinedAlpha = nextAlpha + existingAlpha * (1 - nextAlpha);
  if (combinedAlpha <= 0) return;

  for (let channel = 0; channel < 3; channel += 1) {
    const existing = pixels[offset + channel];
    const composite = (color[channel] * nextAlpha + existing * existingAlpha * (1 - nextAlpha)) / combinedAlpha;
    pixels[offset + channel] = clampByte(composite);
  }
  pixels[offset + 3] = clampByte(combinedAlpha * 255);
}

function drawFiber(pixels, startX, startY, length, angle, bend, width, color, alpha) {
  const endX = startX + Math.cos(angle) * length;
  const endY = startY + Math.sin(angle) * length;
  const steps = Math.max(2, Math.ceil(length * 1.65));
  const radius = Math.max(0.45, width / 2);
  const radiusSquared = radius * radius;

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const inverse = 1 - t;
    const x = startX * inverse + endX * t + Math.sin(t * Math.PI) * bend;
    const y = startY * inverse + endY * t + Math.sin(t * Math.PI) * bend * 0.24;
    const minX = Math.floor(x - radius - 0.75);
    const maxX = Math.ceil(x + radius + 0.75);
    const minY = Math.floor(y - radius - 0.75);
    const maxY = Math.ceil(y + radius + 0.75);

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radiusSquared + 0.55) continue;
        const coverage = Math.max(0.36, Math.min(1, radius + 0.5 - Math.sqrt(distanceSquared)));
        writePixel(pixels, px, py, color, alpha * coverage);
      }
    }
  }
}

function setInkSpot(pixels, x, y, luminance, alpha) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const offset = (Math.floor(y) * WIDTH + Math.floor(x)) * CHANNELS;
  // Keep repeated cluster hits at the requested source-alpha ceiling.
  if (pixels[offset + 3] > alpha) return;
  pixels[offset] = luminance;
  pixels[offset + 1] = luminance;
  pixels[offset + 2] = luminance;
  pixels[offset + 3] = alpha;
}

function buildCinematicFilmGrain(seed = MATERIAL_SEEDS['cinematic-film-grain']) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const next = randomSource(seed);

  // Independent, symmetric high-frequency luminance noise; no broad field or
  // opaque mid-gray base that could wash the photograph.
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    if (next() >= 0.08) continue;
    const offset = pixel * CHANNELS;
    const centered = next() + next() + next() - 1.5;
    const luminance = clampByte(128 + Math.round((centered * 74) / 4) * 4);
    const alpha = 24 + Math.floor(next() * 33);
    pixels[offset] = luminance;
    pixels[offset + 1] = luminance;
    pixels[offset + 2] = luminance;
    pixels[offset + 3] = alpha;
  }

  return pixels;
}

function buildEditorialPaperSurface(seed = MATERIAL_SEEDS['editorial-paper-surface']) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const broadMottle = makeNoiseGrid(80, 100, seed ^ 0x72c38d01);
  const fineMottle = makeNoiseGrid(200, 250, seed ^ 0x9a341ec5);

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / (WIDTH - 1);
      const broad = sampleNoise(broadMottle, u, v);
      const fine = sampleNoise(fineMottle, u, v);
      const luminance = clampByte(128 + broad * 3.8 + fine * 2.0);
      const alpha = 2 + Math.round((broad + 1) * 0.8 + (fine + 1) * 0.4);
      const offset = (y * WIDTH + x) * CHANNELS;
      pixels[offset] = luminance;
      pixels[offset + 1] = luminance;
      pixels[offset + 2] = luminance;
      pixels[offset + 3] = alpha;
    }
  }

  const fiber = randomSource(seed ^ 0x6f4d3b21);
  const darkFiber = [91, 91, 91];
  const lightFiber = [170, 170, 170];
  for (let index = 0; index < 22_000; index += 1) {
    const x = fiber() * WIDTH;
    const y = fiber() * HEIGHT;
    const orientationRoll = fiber();
    const orientation = orientationRoll < 0.54 ? 0 : orientationRoll < 0.84 ? Math.PI / 2 : Math.PI / 4;
    const angle = orientation + (fiber() - 0.5) * 0.7;
    const length = 0.9 + fiber() * 2.9;
    const isLight = fiber() < 0.34;
    drawFiber(pixels, x, y, length, angle, (fiber() - 0.5) * 0.42, 0.25 + fiber() * 0.38, isLight ? lightFiber : darkFiber, 7 + fiber() * 13);
  }

  return pixels;
}

function buildEditorialInkDensity(seed = MATERIAL_SEEDS['editorial-ink-density']) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const next = randomSource(seed);

  // Sparse neutral micro-spots sit within the renderer's display-glyph clip.
  // No opaque field or glyph-shaped alpha is encoded in this texture.
  for (let cluster = 0; cluster < 28_000; cluster += 1) {
    const centerX = next() * WIDTH;
    const centerY = next() * HEIGHT;
    const dark = next() < 0.52;
    const luminance = dark ? 78 + Math.floor(next() * 28) : 150 + Math.floor(next() * 28);
    const count = 1 + Math.floor(next() * 3);
    for (let spot = 0; spot < count; spot += 1) {
      const radius = next() * 1.65;
      const angle = next() * Math.PI * 2;
      const x = Math.round(centerX + Math.cos(angle) * radius);
      const y = Math.round(centerY + Math.sin(angle) * radius);
      const alpha = 8 + Math.floor(next() * 48);
      setInkSpot(pixels, x, y, luminance, alpha);
    }
  }

  return pixels;
}

function buildIdentityMatteFiber(seed = MATERIAL_SEEDS['identity-matte-fiber']) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const broadMottle = makeNoiseGrid(48, 60, seed ^ 0x1b6352a9);
  const fineMottle = makeNoiseGrid(160, 200, seed ^ 0x3f9ea16b);

  // A very low-alpha neutral base gives the stock restrained, non-periodic
  // mottling; the short near-vertical fibers remain quieter than paper.
  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / (WIDTH - 1);
      const broad = sampleNoise(broadMottle, u, v);
      const fine = sampleNoise(fineMottle, u, v);
      const luminance = clampByte(128 + broad * 2.0 + fine * 1.0);
      const alpha = 1 + Math.round((broad + 1) * 0.4 + (fine + 1) * 0.3);
      const offset = (y * WIDTH + x) * CHANNELS;
      pixels[offset] = luminance;
      pixels[offset + 1] = luminance;
      pixels[offset + 2] = luminance;
      pixels[offset + 3] = alpha;
    }
  }

  const fiber = randomSource(seed ^ 0x55c84fd3);
  const darkFiber = [108, 108, 108];
  const lightFiber = [151, 151, 151];
  for (let index = 0; index < 7_500; index += 1) {
    const x = fiber() * WIDTH;
    const y = fiber() * HEIGHT;
    const angle = Math.PI / 2 + (fiber() - 0.5) * 0.3;
    const length = 0.7 + fiber() * 1.6;
    const isLight = fiber() < 0.24;
    drawFiber(pixels, x, y, length, angle, (fiber() - 0.5) * 0.16, 0.24 + fiber() * 0.26, isLight ? lightFiber : darkFiber, 6 + fiber() * 11);
  }

  for (let index = 0; index < 100; index += 1) {
    const x = fiber() * WIDTH;
    const y = fiber() * HEIGHT;
    drawFiber(pixels, x, y, 0.7 + fiber() * 0.8, Math.PI / 2 + (fiber() - 0.5) * 0.22, 0, 0.36, darkFiber, 7 + fiber() * 10);
  }

  return pixels;
}

function measureTexture(pixels) {
  let nonTransparentPixels = 0;
  let alphaTotal = 0;
  let maxAlpha = 0;
  let alphaWeightedLuminanceTotal = 0;

  for (let offset = 0; offset < pixels.length; offset += CHANNELS) {
    const alpha = pixels[offset + 3];
    if (alpha === 0) continue;
    nonTransparentPixels += 1;
    alphaTotal += alpha;
    maxAlpha = Math.max(maxAlpha, alpha);
    alphaWeightedLuminanceTotal += alpha * (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722);
  }

  const pixelCount = WIDTH * HEIGHT;
  return {
    nonTransparentPixels,
    nonTransparentFraction: Number((nonTransparentPixels / pixelCount).toFixed(5)),
    meanAlphaIncludingTransparent: Number((alphaTotal / pixelCount).toFixed(3)),
    maxAlpha,
    alphaWeightedMeanLuminance: Number((alphaWeightedLuminanceTotal / alphaTotal).toFixed(2)),
  };
}

async function writeTexture(name, pixels, outputDirectory) {
  const outputPath = path.join(outputDirectory, `${name}.webp`);
  await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
    .webp(WEBP_OPTIONS)
    .toFile(outputPath);
  const { size } = await stat(outputPath);
  const encoded = await readFile(outputPath);
  const decodedPixels = await sharp(encoded).ensureAlpha().raw().toBuffer();
  const sha256 = createHash('sha256').update(pixels).digest('hex');
  const encodedSha256 = createHash('sha256').update(encoded).digest('hex');
  return { outputPath, size, sha256, encodedSha256, ...measureTexture(decodedPixels) };
}

export async function generateCardMaterials({ outputDirectory = OUTPUT_DIRECTORY } = {}) {
  await mkdir(outputDirectory, { recursive: true });

  const materials = [
    ['cinematic-film-grain', buildCinematicFilmGrain],
    ['editorial-paper-surface', buildEditorialPaperSurface],
    ['editorial-ink-density', buildEditorialInkDensity],
    ['identity-matte-fiber', buildIdentityMatteFiber],
  ];
  const assets = {};
  let totalBytes = 0;

  for (const [name, build] of materials) {
    const pixels = build();
    const result = await writeTexture(name, pixels, outputDirectory);
    totalBytes += result.size;
    assets[name] = {
      file: `${name}.webp`,
      seed: `0x${MATERIAL_SEEDS[name].toString(16).padStart(8, '0')}`,
      dimensions: `${WIDTH}x${HEIGHT}`,
      bytes: result.size,
      encodedSha256: result.encodedSha256,
      sourceSha256: result.sha256,
      alpha: {
        nonTransparentPixels: result.nonTransparentPixels,
        nonTransparentFraction: result.nonTransparentFraction,
        meanAlphaIncludingTransparent: result.meanAlphaIncludingTransparent,
        maxAlpha: result.maxAlpha,
        alphaWeightedMeanLuminance: result.alphaWeightedMeanLuminance,
      },
    };
    console.log(`${name}: ${WIDTH} × ${HEIGHT} WebP, ${(result.size / 1024).toFixed(1)} KB; alpha ${result.nonTransparentFraction * 100}% active, mean ${result.meanAlphaIncludingTransparent}, max ${result.maxAlpha}, weighted luma ${result.alphaWeightedMeanLuminance}`);
  }

  const manifest = {
    generator: 'tools/generate-card-materials.mjs',
    provenance: 'Deterministic procedural maps generated in this repository; no external reference pixels, photographs, or AI-generated pixels were used.',
    dimensions: { width: WIDTH, height: HEIGHT, channels: CHANNELS },
    encoding: { format: 'webp', ...WEBP_OPTIONS },
    assets,
    totalBytes,
  };
  await writeFile(path.join(outputDirectory, 'material-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`total: ${(totalBytes / 1024).toFixed(1)} KB across ${materials.length} maps`);
  return manifest;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await generateCardMaterials();
}

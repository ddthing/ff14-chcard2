import {
  CARD_TEXTURE_LAYER_ORDER,
  getCardTextureEffectIntensity,
  type CardTextureEffect,
  type CardTextureEffectIntensity,
} from './card-texture-effects';

/** The small, browser-independent part of ImageData used by the print processor. */
export interface PhotoPrintImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type PhotoPrintPaperRgb = readonly [red: number, green: number, blue: number];

const WHITE_PAPER: PhotoPrintPaperRgb = [255, 255, 255];
const LUMA_RED = 0.2126;
const LUMA_GREEN = 0.7152;
const LUMA_BLUE = 0.0722;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function luminance(red: number, green: number, blue: number): number {
  return (red * LUMA_RED + green * LUMA_GREEN + blue * LUMA_BLUE) / 255;
}

/**
 * Estimates printed-ink coverage from both shadow tone and color. Saturated
 * yellow can be bright in luma while still carrying dense colored ink; near
 * white neutral stock has neither shadow nor enough chroma to count as ink.
 */
function imageInkCoverage(red: number, green: number, blue: number, tone: number): number {
  const lowest = Math.min(red, green, blue) / 255;
  const highest = Math.max(red, green, blue) / 255;
  const chroma = highest - lowest;
  const colorInk = (1 - lowest) * smoothstep(0.055, 0.24, chroma);
  const shadowInk = 1 - smoothstep(0.2, 0.86, tone);
  return Math.max(shadowInk, colorInk);
}

function colorProtection(red: number, green: number, blue: number): number {
  const chroma = (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
  return smoothstep(0.08, 0.34, chroma);
}

function mix(source: number, target: number, amount: number): number {
  return source + (target - source) * amount;
}

function hashNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16) ^ y, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 8) / 0x00ffffff;
}

/** Smooth deterministic value noise, shared by toner mottling and worn ink. */
function createNoiseSampler(width: number, height: number, scale: number, seed: number): (x: number, y: number) => number {
  const columns = Math.ceil(width / scale) + 1;
  const rows = Math.ceil(height / scale) + 1;
  const field = new Float32Array(columns * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      field[y * columns + x] = hashNoise(x, y, seed);
    }
  }

  return (x, y) => {
    const gridX = x / scale;
    const gridY = y / scale;
    const cellX = Math.min(columns - 2, Math.floor(gridX));
    const cellY = Math.min(rows - 2, Math.floor(gridY));
    const fractionX = gridX - cellX;
    const fractionY = gridY - cellY;
    const horizontal = fractionX * fractionX * (3 - 2 * fractionX);
    const vertical = fractionY * fractionY * (3 - 2 * fractionY);
    const topLeft = field[cellY * columns + cellX];
    const topRight = field[cellY * columns + cellX + 1];
    const bottomLeft = field[(cellY + 1) * columns + cellX];
    const bottomRight = field[(cellY + 1) * columns + cellX + 1];
    return mix(
      mix(topLeft, topRight, horizontal),
      mix(bottomLeft, bottomRight, horizontal),
      vertical,
    );
  };
}

function normalizedPaper(paperRgb: PhotoPrintPaperRgb | undefined): PhotoPrintPaperRgb {
  if (!paperRgb || paperRgb.length !== 3 || !paperRgb.every(Number.isFinite)) return WHITE_PAPER;
  return [
    Math.max(0, Math.min(255, paperRgb[0])),
    Math.max(0, Math.min(255, paperRgb[1])),
    Math.max(0, Math.min(255, paperRgb[2])),
  ];
}

function assertImageData(image: PhotoPrintImageData): void {
  if (
    !Number.isSafeInteger(image.width)
    || !Number.isSafeInteger(image.height)
    || image.width <= 0
    || image.height <= 0
    || !(image.data instanceof Uint8ClampedArray)
    || image.data.length !== image.width * image.height * 4
  ) {
    throw new RangeError('Photo print effects require positive dimensions and a matching RGBA buffer.');
  }
}

function applyXerox(
  image: PhotoPrintImageData,
  strength: number,
  paperRgb: PhotoPrintPaperRgb,
): PhotoPrintImageData {
  const { width, height, data } = image;
  const output = new Uint8ClampedArray(data.length);
  const shortEdge = Math.min(width, height);
  const broadNoise = createNoiseSampler(width, height, Math.max(4, shortEdge * 0.035), 0x58524f58);
  const mottledNoise = createNoiseSampler(width, height, Math.max(2, shortEdge * 0.009), 0x544f4e45);
  const amount = strength / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      output[index + 3] = alpha;
      if (alpha === 0) {
        output[index] = data[index];
        output[index + 1] = data[index + 1];
        output[index + 2] = data[index + 2];
        continue;
      }

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const tone = luminance(red, green, blue);
      const inkCoverage = imageInkCoverage(red, green, blue, tone);
      const saturationProtection = colorProtection(red, green, blue);
      const broad = broadNoise(x, y) - 0.5;
      const mottled = mottledNoise(x, y) - 0.5;
      const grain = hashNoise(x, y, 0x47524149) - 0.5;

      // A photocopier pushes highlights toward stock white and concentrates
      // uneven toner in image shadows instead of laying noise over the page.
      const tonerVariation = (broad * 0.16 + mottled * 0.1 + grain * 0.045) * (0.22 + inkCoverage * 0.78);
      const copiedTone = clamp01((tone - 0.5) * 1.9 + 0.5 + tonerVariation);
      const highlightPaper = smoothstep(0.68, 0.96, tone) * (1 - saturationProtection * 0.92);
      const chromaScale = mix(0.76 * (1 - smoothstep(0.68, 0.98, tone) * 0.88), 0.9, saturationProtection);
      const tonerTexture = (broad + 0.5) * 0.52 + (mottled + 0.5) * 0.3 + (grain + 0.5) * 0.18;
      const tonerDropout = (1 - smoothstep(0.39, 0.68, tonerTexture)) * inkCoverage * 0.45;
      const printedRed = clamp01(copiedTone + (red / 255 - tone) * chromaScale) * 255;
      const printedGreen = clamp01(copiedTone + (green / 255 - tone) * chromaScale) * 255;
      const printedBlue = clamp01(copiedTone + (blue / 255 - tone) * chromaScale) * 255;
      const targetRed = mix(mix(printedRed, paperRgb[0], highlightPaper), paperRgb[0], tonerDropout);
      const targetGreen = mix(mix(printedGreen, paperRgb[1], highlightPaper), paperRgb[1], tonerDropout);
      const targetBlue = mix(mix(printedBlue, paperRgb[2], highlightPaper), paperRgb[2], tonerDropout);
      output[index] = mix(red, targetRed, amount);
      output[index + 1] = mix(green, targetGreen, amount);
      output[index + 2] = mix(blue, targetBlue, amount);
    }
  }

  return { width, height, data: output };
}

interface HalftoneCell {
  red: number;
  green: number;
  blue: number;
  tone: number;
}

function applyHalftone(
  image: PhotoPrintImageData,
  strength: number,
  paperRgb: PhotoPrintPaperRgb,
): PhotoPrintImageData {
  const { width, height, data } = image;
  const output = new Uint8ClampedArray(data.length);
  const amount = strength / 100;
  const cellSize = Math.max(4, Math.min(20, Math.min(width, height) / 110));
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cells: HalftoneCell[] = new Array(columns * rows);

  // Average each small screen cell once. The sampled ink therefore follows
  // local image hue and density while the screen stays linear time overall.
  for (let cellY = 0; cellY < rows; cellY++) {
    for (let cellX = 0; cellX < columns; cellX++) {
      const left = Math.floor(cellX * cellSize);
      const top = Math.floor(cellY * cellSize);
      const right = Math.min(width, Math.floor((cellX + 1) * cellSize));
      const bottom = Math.min(height, Math.floor((cellY + 1) * cellSize));
      let red = 0;
      let green = 0;
      let blue = 0;
      let weight = 0;
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const index = (y * width + x) * 4;
          const alpha = data[index + 3] / 255;
          red += data[index] * alpha;
          green += data[index + 1] * alpha;
          blue += data[index + 2] * alpha;
          weight += alpha;
        }
      }
      const safeWeight = Math.max(0.0001, weight);
      red /= safeWeight;
      green /= safeWeight;
      blue /= safeWeight;
      cells[cellY * columns + cellX] = { red, green, blue, tone: luminance(red, green, blue) };
    }
  }

  for (let y = 0; y < height; y++) {
    const cellY = Math.min(rows - 1, Math.floor(y / cellSize));
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      output[index + 3] = alpha;
      if (alpha === 0) {
        output[index] = data[index];
        output[index + 1] = data[index + 1];
        output[index + 2] = data[index + 2];
        continue;
      }

      const cellX = Math.min(columns - 1, Math.floor(x / cellSize));
      const cell = cells[cellY * columns + cellX];
      const sourceTone = luminance(data[index], data[index + 1], data[index + 2]);
      const cellInk = imageInkCoverage(cell.red, cell.green, cell.blue, cell.tone);
      const radius = cellSize * 0.42 * Math.pow(cellInk, 0.86);
      const centerX = Math.min(width - 0.5, (cellX + 0.5) * cellSize);
      const centerY = Math.min(height - 0.5, (cellY + 0.5) * cellSize);
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      const circleCoverage = clamp01(radius + 0.3 - distance);
      // Gate each rasterized dot by its own pixel tone so a dark neighboring
      // cell cannot paint over white letter holes or a clean paper field.
      const localInk = imageInkCoverage(data[index], data[index + 1], data[index + 2], sourceTone);
      const dotCoverage = circleCoverage * localInk * 0.92;
      // At full strength this is a real print screen: sampled image color
      // occupies the dots and the gaps reveal stock paper. Lower settings
      // blend that print back with the unprocessed photo.
      output[index] = mix(data[index], mix(paperRgb[0], cell.red, dotCoverage), amount);
      output[index + 1] = mix(data[index + 1], mix(paperRgb[1], cell.green, dotCoverage), amount);
      output[index + 2] = mix(data[index + 2], mix(paperRgb[2], cell.blue, dotCoverage), amount);
    }
  }

  return { width, height, data: output };
}

function readTone(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  const boundedX = Math.max(0, Math.min(width - 1, x));
  const boundedY = Math.max(0, Math.min(height - 1, y));
  const index = (boundedY * width + boundedX) * 4;
  if (data[index + 3] === 0) return 1;
  return luminance(data[index], data[index + 1], data[index + 2]);
}

function applyDistressed(
  image: PhotoPrintImageData,
  strength: number,
  paperRgb: PhotoPrintPaperRgb,
): PhotoPrintImageData {
  const { width, height, data } = image;
  const output = new Uint8ClampedArray(data.length);
  const amount = strength / 100;
  const shortEdge = Math.min(width, height);
  const broadWear = createNoiseSampler(width, height, Math.max(5, shortEdge * 0.028), 0x57454152);
  const fineWear = createNoiseSampler(width, height, Math.max(2, shortEdge * 0.006), 0x43484950);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      output[index + 3] = alpha;
      if (alpha === 0) {
        output[index] = data[index];
        output[index + 1] = data[index + 1];
        output[index + 2] = data[index + 2];
        continue;
      }

      const tone = luminance(data[index], data[index + 1], data[index + 2]);
      const localInk = imageInkCoverage(data[index], data[index + 1], data[index + 2], tone);
      const left = readTone(data, width, height, x - 1, y);
      const right = readTone(data, width, height, x + 1, y);
      const up = readTone(data, width, height, x, y - 1);
      const down = readTone(data, width, height, x, y + 1);
      const edge = clamp01((Math.abs(right - left) + Math.abs(down - up)) * 0.72);
      const edgeWear = smoothstep(0.1, 0.48, edge) * localInk * 0.86;
      const eligibleRegion = Math.max(localInk, edgeWear);

      const coarse = broadWear(x, y);
      const detail = fineWear(x, y);
      const micro = hashNoise(x, y, 0x4d494352);
      const wearPattern = coarse * 0.58 + detail * 0.34 + micro * 0.08;
      const missingInk = (1 - smoothstep(0.2, 0.61, wearPattern)) * eligibleRegion;
      const damage = missingInk * amount;

      output[index] = mix(data[index], paperRgb[0], damage);
      output[index + 1] = mix(data[index + 1], paperRgb[1], damage);
      output[index + 2] = mix(data[index + 2], paperRgb[2], damage);
    }
  }

  return { width, height, data: output };
}

/**
 * Applies enabled print treatments to a fresh RGBA buffer in Xerox, Halftone,
 * then Distressed order. Each stage reads the preceding stage's pixels, so
 * combined treatments retain their intended noncommutative print layering.
 * The source is never mutated; alpha is copied exactly through every stage.
 */
export function processPhotoPrintEffects(
  source: PhotoPrintImageData,
  effects: readonly string[],
  effectIntensity?: CardTextureEffectIntensity | Record<string, number>,
  paperRgb?: PhotoPrintPaperRgb,
): PhotoPrintImageData {
  assertImageData(source);
  const enabled = new Set(effects);
  const paper = normalizedPaper(paperRgb);
  let current = source;
  let changed = false;

  for (const effect of CARD_TEXTURE_LAYER_ORDER) {
    const strength = getCardTextureEffectIntensity(effectIntensity, effect as CardTextureEffect);
    if (!enabled.has(effect) || strength === 0) continue;
    current = effect === 'xerox'
      ? applyXerox(current, strength, paper)
      : effect === 'halftone'
        ? applyHalftone(current, strength, paper)
        : applyDistressed(current, strength, paper);
    changed = true;
  }

  // An identity pass shares the input bytes and avoids work for disabled or
  // zero-strength effects. Callers still receive the same image-data shape.
  return changed ? current : source;
}

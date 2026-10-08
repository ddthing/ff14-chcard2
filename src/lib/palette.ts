export interface CardPalette {
  /** Image-derived midtone that works well for borders and key accents. */
  primary: string;
  /** A second image-derived hue, or a hue-shifted companion for monochrome art. */
  accent: string;
  /** Warm, high-luminance surface/text token. */
  light: string;
  /** Deep, high-contrast ink/surface token. */
  dark: string;
}

export const DEFAULT_CARD_PALETTE: Readonly<CardPalette> = {
  primary: '#b99b72',
  accent: '#8b9caf',
  light: '#f2eee7',
  dark: '#211f22',
};

interface HslColor {
  h: number;
  s: number;
  l: number;
}

interface ColorBucket {
  r: number;
  g: number;
  b: number;
  weight: number;
  hue: number;
  saturation: number;
  lightness: number;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }

  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: HslColor): [number, number, number] {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hueSection = h / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection < 1) [red, green] = [chroma, secondary];
  else if (hueSection < 2) [red, green] = [secondary, chroma];
  else if (hueSection < 3) [green, blue] = [chroma, secondary];
  else if (hueSection < 4) [green, blue] = [secondary, chroma];
  else if (hueSection < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  const match = l - chroma / 2;
  return [red + match, green + match, blue + match].map((value) => Math.round(value * 255)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeAccentColor(color: HslColor): HslColor {
  return {
    ...color,
    // Keep swatches vivid enough to read, while avoiding neon on a card.
    s: Math.max(0.22, Math.min(0.78, color.s)),
    l: Math.max(0.34, Math.min(0.66, color.l)),
  };
}

function swatchFor(hue: number, saturation: number, lightness: number): string {
  return toHex(hslToRgb({ h: (hue + 360) % 360, s: saturation, l: lightness }));
}

function circularHueDistance(first: number, second: number): number {
  const distance = Math.abs(first - second) % 360;
  return Math.min(distance, 360 - distance);
}

/**
 * Extracts a compact, theme-ready palette from already sampled pixel data.
 * `light` and `dark` are deliberately contrast-safe tints derived from the
 * dominant image hue; `primary` and `accent` retain the image's character.
 */
export function extractPaletteFromImageData(imageData: ImageData): CardPalette {
  const { data, width, height } = imageData;
  if (!width || !height || data.length < 4) return { ...DEFAULT_CARD_PALETTE };

  const buckets = new Map<number, ColorBucket>();
  const sampleStep = Math.max(1, Math.floor((width * height) / 8_000));
  let sampledPixels = 0;

  for (let pixel = 0; pixel < width * height; pixel += sampleStep) {
    const offset = pixel * 4;
    const alpha = data[offset + 3] / 255;
    if (alpha < 0.45) continue;

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    // Slightly de-emphasize shadows/highlights so the palette captures useful
    // detail instead of converging on black or a bright UI background.
    const tonalWeight = 0.58 + 0.42 * (1 - Math.abs(l - 0.5) * 2);
    const weight = alpha * (0.62 + s * 0.9) * tonalWeight;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.r += r * weight;
      bucket.g += g * weight;
      bucket.b += b * weight;
      bucket.weight += weight;
      bucket.hue += h * weight;
      bucket.saturation += s * weight;
      bucket.lightness += l * weight;
    } else {
      buckets.set(key, {
        r: r * weight,
        g: g * weight,
        b: b * weight,
        weight,
        hue: h * weight,
        saturation: s * weight,
        lightness: l * weight,
      });
    }
    sampledPixels++;
  }

  if (!sampledPixels || !buckets.size) return { ...DEFAULT_CARD_PALETTE };

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      r: bucket.r / bucket.weight,
      g: bucket.g / bucket.weight,
      b: bucket.b / bucket.weight,
      hue: bucket.hue / bucket.weight,
      saturation: bucket.saturation / bucket.weight,
      lightness: bucket.lightness / bucket.weight,
      score: bucket.weight * (0.72 + bucket.saturation / bucket.weight * 0.9),
    }))
    .sort((a, b) => b.score - a.score);

  const dominant = ranked.find((bucket) => bucket.lightness > 0.075 && bucket.lightness < 0.93) ?? ranked[0];
  const primaryHsl = normalizeAccentColor({ h: dominant.hue, s: dominant.saturation, l: dominant.lightness });
  const companion = ranked.find((bucket) => (
    circularHueDistance(bucket.hue, primaryHsl.h) >= 32
    && bucket.lightness > 0.08
    && bucket.lightness < 0.92
  ));
  const accentHsl = companion
    ? normalizeAccentColor({ h: companion.hue, s: companion.saturation, l: companion.lightness })
    : normalizeAccentColor({
      h: primaryHsl.h + (primaryHsl.h > 195 ? -34 : 34),
      s: Math.max(0.34, primaryHsl.s),
      l: primaryHsl.l > 0.54 ? primaryHsl.l - 0.08 : primaryHsl.l + 0.11,
    });

  return {
    primary: toHex(hslToRgb(primaryHsl)),
    accent: toHex(hslToRgb(accentHsl)),
    light: swatchFor(primaryHsl.h, Math.min(0.19, primaryHsl.s * 0.45), 0.94),
    dark: swatchFor(primaryHsl.h, Math.min(0.34, Math.max(0.16, primaryHsl.s * 0.5)), 0.12),
  };
}

function getSourceDimensions(source: CanvasImageSource): { width: number; height: number } | null {
  if ('naturalWidth' in source) return { width: source.naturalWidth, height: source.naturalHeight };
  if ('videoWidth' in source) return { width: source.videoWidth, height: source.videoHeight };
  if ('displayWidth' in source) return { width: source.displayWidth, height: source.displayHeight };
  if ('width' in source && 'height' in source) return { width: Number(source.width), height: Number(source.height) };
  return null;
}

/** Samples any same-origin/browser-local canvas image source. */
export function extractPaletteFromImage(source: CanvasImageSource): CardPalette {
  const dimensions = getSourceDimensions(source);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 || typeof document === 'undefined') {
    return { ...DEFAULT_CARD_PALETTE };
  }

  const sampleSize = 72;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sampleSize * Math.min(1, dimensions.width / dimensions.height)));
  canvas.height = Math.max(1, Math.round(sampleSize * Math.min(1, dimensions.height / dimensions.width)));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { ...DEFAULT_CARD_PALETTE };

  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return extractPaletteFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    // A tainted canvas or decoder failure should not block the editing flow.
    return { ...DEFAULT_CARD_PALETTE };
  }
}


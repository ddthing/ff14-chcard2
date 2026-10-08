import {
  detectTypographyScript,
  type TypographyScript,
} from '@/lib/typography-presets';

export type CardNameCategory = 'short' | 'medium' | 'long';

export interface CardNameLayout {
  /** Whitespace-normalized source text for accessible names and copy actions. */
  normalizedName: string;
  script: TypographyScript;
  category: CardNameCategory;
  /** Visual lines. Joining after removing line whitespace preserves all name graphemes. */
  lines: string[];
  /** Suggested proportional display scale; long names need less visual emphasis. */
  scale: number;
  maxLineUnits: number;
}

type NameSegment = { text: string; weight: number };

const CARD_NAME_LAYOUT_CACHE_LIMIT = 64;
const CARD_NAME_LAYOUT_CACHE_MAX_NAME_LENGTH = 256;
const cardNameLayoutCache = new Map<string, CardNameLayout>();

function localeScriptFor(locale: string): TypographyScript {
  return locale.toLowerCase().startsWith('ko')
    ? 'korean'
    : locale.toLowerCase().startsWith('ja')
      ? 'japanese'
      : 'latin';
}

function copyLayout(layout: CardNameLayout): CardNameLayout {
  return { ...layout, lines: [...layout.lines] };
}

function rememberLayout(key: string, layout: CardNameLayout): void {
  if (cardNameLayoutCache.has(key)) cardNameLayoutCache.delete(key);
  else if (cardNameLayoutCache.size >= CARD_NAME_LAYOUT_CACHE_LIMIT) {
    cardNameLayoutCache.delete(cardNameLayoutCache.keys().next().value!);
  }
  cardNameLayoutCache.set(key, layout);
}

function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  }
  // Array.from still keeps surrogate pairs intact in runtimes without Segmenter.
  return Array.from(text);
}

function latinWeight(text: string): number {
  let weight = 0;
  for (const grapheme of graphemes(text)) {
    if (/\s/u.test(grapheme)) continue;
    if (/^[ilI.,'’!:;|]$/u.test(grapheme)) weight += 0.38;
    else if (/^[MW@%&#]$/u.test(grapheme)) weight += 0.95;
    else if (/^[A-Z]$/u.test(grapheme)) weight += 0.74;
    else weight += 0.62;
  }
  return weight;
}

function weightedNameLength(text: string, script: TypographyScript): number {
  if (script !== 'latin') {
    return graphemes(text).filter((part) => !/^\s+$/u.test(part)).length;
  }
  return latinWeight(text);
}

function chooseCategory(length: number, script: TypographyScript): CardNameCategory {
  if (script === 'latin') {
    if (length <= 10.5) return 'short';
    if (length <= 20) return 'medium';
    return 'long';
  }

  const shortLimit = script === 'korean' ? 4 : 6;
  const mediumLimit = script === 'korean' ? 7 : 12;
  if (length <= shortLimit) return 'short';
  if (length <= mediumLimit) return 'medium';
  return 'long';
}

function splitAtWhitespace(text: string): string[] {
  return text.split(/\s+/u).filter(Boolean);
}

/** Keep Japanese name separators with the preceding name segment. */
function splitAtNameBoundaries(text: string, script: TypographyScript): string[] {
  const words = splitAtWhitespace(text);
  if (words.length > 1) return words;
  if (script === 'japanese' && text.includes('・')) {
    return text.split(/(?<=・)/u).filter(Boolean);
  }
  return graphemes(text);
}

function packSegments(segments: NameSegment[], lineCount: number, separator = ''): string[] {
  const count = Math.min(segments.length, Math.max(1, lineCount));
  if (segments.length <= 1 || count === 1) {
    return [segments.map((part) => part.text).join(separator)];
  }

  // Find contiguous groups with the most even visual weight. Dynamic
  // programming keeps word boundaries intact and always produces `count`
  // non-empty lines when enough segments exist.
  const totalWeight = segments.reduce((sum, part) => sum + part.weight, 0);
  const targetWeight = totalWeight / count;
  const prefix = [0];
  for (const segment of segments) prefix.push(prefix[prefix.length - 1] + segment.weight);

  const costs = Array.from({ length: count + 1 }, () => new Array<number>(segments.length + 1).fill(Number.POSITIVE_INFINITY));
  const previous = Array.from({ length: count + 1 }, () => new Array<number>(segments.length + 1).fill(-1));
  costs[0][0] = 0;

  for (let lines = 1; lines <= count; lines += 1) {
    for (let end = lines; end <= segments.length; end += 1) {
      for (let start = lines - 1; start < end; start += 1) {
        const previousCost = costs[lines - 1][start];
        if (!Number.isFinite(previousCost)) continue;
        const groupWeight = prefix[end] - prefix[start];
        const cost = previousCost + (groupWeight - targetWeight) ** 2;
        if (cost < costs[lines][end]) {
          costs[lines][end] = cost;
          previous[lines][end] = start;
        }
      }
    }
  }

  const groups: string[] = [];
  let end = segments.length;
  for (let lines = count; lines > 0; lines -= 1) {
    const start = previous[lines][end];
    groups.unshift(segments.slice(start, end).map((part) => part.text).join(separator));
    end = start;
  }
  return groups;
}

function splitGraphemeText(text: string, lineCount: number): string[] {
  const parts = graphemes(text);
  const count = Math.min(lineCount, parts.length);
  const lines: string[] = [];
  let cursor = 0;
  for (let lineIndex = 0; lineIndex < count; lineIndex += 1) {
    const linesLeft = count - lineIndex;
    const graphemesLeft = parts.length - cursor;
    const take = Math.ceil(graphemesLeft / linesLeft);
    lines.push(parts.slice(cursor, cursor + take).join(''));
    cursor += take;
  }
  return lines;
}

function latinLines(text: string, category: CardNameCategory, weight: number): string[] {
  const lineCount = category === 'short' ? 1 : category === 'medium' ? 2 : weight > 33 ? 4 : 3;
  if (lineCount === 1) return [text];
  const words = splitAtWhitespace(text);
  const segments: NameSegment[] = words.map((word) => ({ text: word, weight: latinWeight(word) }));

  if (segments.length >= lineCount) return packSegments(segments, lineCount, ' ');

  // Keep normal word boundaries. If a name is one exceptionally long token,
  // split only at grapheme boundaries to prevent overflow without dropping text.
  if (segments.length === 1 && category !== 'short') {
    return splitGraphemeText(text, lineCount);
  }

  return packSegments(segments, Math.min(lineCount, segments.length), ' ');
}

function cjkLines(text: string, script: TypographyScript, category: CardNameCategory, length: number): string[] {
  if (category === 'short') return [text];
  const targetLines = category === 'medium'
    ? 2
    : Math.min(4, Math.max(2, Math.ceil(length / (script === 'korean' ? 4 : 5))));
  const boundaries = splitAtNameBoundaries(text, script);
  const segments = boundaries.map((part) => ({ text: part, weight: graphemes(part).length }));

  if (segments.length > 1) {
    return packSegments(segments, Math.min(targetLines, segments.length), /\s/u.test(text) ? ' ' : '');
  }
  return splitGraphemeText(text, targetLines);
}

/**
 * Compose character names for display without changing the stored value.
 * CJK lines favor natural spaces or the Japanese middle dot; Latin names favor
 * word boundaries and only break a single long token at grapheme boundaries.
 */
export function getCardNameLayout(name: string, locale: string): CardNameLayout {
  const normalizedName = name.replace(/\s+/gu, ' ').trim();
  const localeScript = localeScriptFor(locale);
  const cacheKey = normalizedName.length <= CARD_NAME_LAYOUT_CACHE_MAX_NAME_LENGTH
    ? `${localeScript}\u0000${normalizedName}`
    : null;
  if (cacheKey !== null) {
    const cached = cardNameLayoutCache.get(cacheKey);
    if (cached) {
      cardNameLayoutCache.delete(cacheKey);
      cardNameLayoutCache.set(cacheKey, cached);
      return copyLayout(cached);
    }
  }

  const script = detectTypographyScript(normalizedName, localeScript);
  const length = weightedNameLength(normalizedName, script);
  const category = chooseCategory(length, script);
  const lines = script === 'latin'
    ? latinLines(normalizedName, category, length)
    : cjkLines(normalizedName, script, category, length);
  const scale = category === 'short' ? 1 : category === 'medium' ? 0.88 : 0.74;

  const maxLineUnits = Math.max(1, ...lines.map((line) => weightedNameLength(line, script) + (line.match(/\s/gu)?.length ?? 0) * 0.28));
  const layout = { normalizedName, script, category, lines, scale, maxLineUnits };
  if (cacheKey !== null) rememberLayout(cacheKey, layout);
  return copyLayout(layout);
}


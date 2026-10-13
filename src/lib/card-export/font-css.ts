import { profileCount, profileStart, profileTiming } from '@/lib/performance-profile';

type UnicodeRange = readonly [start: number, end: number];
type FontFileFormat = 'woff2' | 'truetype' | 'opentype';
type FontDataUrlResource = { dataUrl: string; bytes: number; format: FontFileFormat };

type SourceItem =
  | { kind: 'local'; cssText: string }
  | { kind: FontFileFormat; url: string; format: string | null; resolvedUrl?: string; dataUrl?: string; bytes?: number }
  | { kind: 'other-url' };

type FontFaceRule = CSSRule & { style: CSSStyleDeclaration; parentStyleSheet?: CSSStyleSheet | null };

export interface PreparedCardFontCss {
  cssText: string;
  consideredFaceCount: number;
  selectedFaceCount: number;
  inlinedBytes: number;
  uniqueFontResourceCount: number;
  glyphCount: number;
}

const MAX_INLINED_FONT_BYTES = 24 * 1024 * 1024;
const FONT_FETCH_CONCURRENCY = 4;
const FONT_DATA_URL_CACHE_MAX_BYTES = 8 * 1024 * 1024;
const fontDataUrlCache = new Map<string, FontDataUrlResource>();
let fontDataUrlCacheBytes = 0;

function getCachedFontDataUrl(url: string, format: FontFileFormat): FontDataUrlResource | undefined {
  const cached = fontDataUrlCache.get(url);
  if (!cached || cached.format !== format) {
    profileCount('export.fontCss.resourceCache.miss');
    return undefined;
  }
  fontDataUrlCache.delete(url);
  fontDataUrlCache.set(url, cached);
  profileCount('export.fontCss.resourceCache.hit');
  return cached;
}

function cacheFontDataUrl(url: string, resource: FontDataUrlResource): void {
  if (resource.bytes > FONT_DATA_URL_CACHE_MAX_BYTES) return;

  const previous = fontDataUrlCache.get(url);
  if (previous) {
    fontDataUrlCacheBytes -= previous.bytes;
    fontDataUrlCache.delete(url);
  }
  while (fontDataUrlCache.size && fontDataUrlCacheBytes + resource.bytes > FONT_DATA_URL_CACHE_MAX_BYTES) {
    const oldestUrl = fontDataUrlCache.keys().next().value;
    if (oldestUrl === undefined) break;
    const oldest = fontDataUrlCache.get(oldestUrl);
    fontDataUrlCache.delete(oldestUrl);
    if (oldest) fontDataUrlCacheBytes -= oldest.bytes;
    profileCount('export.fontCss.resourceCache.evicted');
  }

  fontDataUrlCache.set(url, resource);
  fontDataUrlCacheBytes += resource.bytes;
  profileCount('export.fontCss.resourceCache.stored');
}

function responseHasImmutableCacheControl(response: Response): boolean {
  const cacheControl = response.headers?.get('cache-control') ?? '';
  return /(?:^|,)\s*immutable\s*(?:,|$)/iu.test(cacheControl);
}

function cssWhitespace(character: string | undefined): boolean {
  return character !== undefined && /[\t\n\f\r ]/u.test(character);
}

function splitTopLevel(value: string, delimiter = ','): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth < 0) return null;
    } else if (character === delimiter && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  if (quote || escaped || depth !== 0) return null;
  parts.push(value.slice(start).trim());
  return parts;
}

function readCssString(value: string, start = 0): { text: string; end: number } | null {
  const quote = value[start];
  if (quote !== '"' && quote !== "'") return null;
  let text = '';
  let index = start + 1;

  while (index < value.length) {
    const character = value[index];
    if (character === quote) return { text, end: index + 1 };
    if (character === '\n' || character === '\r' || character === '\f') return null;
    if (character !== '\\') {
      text += character;
      index += 1;
      continue;
    }

    index += 1;
    if (index >= value.length) return null;
    const escaped = value[index];
    if (escaped === '\n' || escaped === '\f') {
      index += 1;
      continue;
    }
    if (escaped === '\r') {
      index += value[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    const hex = value.slice(index).match(/^[\da-f]{1,6}/iu)?.[0];
    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      text += codePoint === 0 || codePoint > 0x10ffff || codePoint >= 0xd800 && codePoint <= 0xdfff
        ? '\ufffd'
        : String.fromCodePoint(codePoint);
      index += hex.length;
      if (cssWhitespace(value[index])) {
        if (value[index] === '\r' && value[index + 1] === '\n') index += 2;
        else index += 1;
      }
      continue;
    }

    text += escaped;
    index += 1;
  }
  return null;
}

/** Decode only literal quoted CSS content; generated counters/URLs remain an explicit fallback. */
export function decodeCssContentText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none' || trimmed === 'normal') return '';

  let index = 0;
  let result = '';
  let tokenCount = 0;
  while (index < trimmed.length) {
    while (cssWhitespace(trimmed[index])) index += 1;
    if (index >= trimmed.length) break;
    const token = readCssString(trimmed, index);
    if (!token) return null;
    result += token.text;
    index = token.end;
    tokenCount += 1;
  }
  return tokenCount ? result : null;
}

export function parseUnicodeRangeDescriptor(value: string): UnicodeRange[] | null {
  const parts = splitTopLevel(value);
  if (!parts?.length || parts.some((part) => !part)) return null;
  const ranges: UnicodeRange[] = [];

  for (const part of parts) {
    const match = part.match(/^U\+([\da-f?]{1,6})(?:-([\da-f]{1,6}))?$/iu);
    if (!match) return null;
    const pattern = match[1].toUpperCase();
    if (pattern.includes('?')) {
      if (match[2] || !/^[0-9A-F]*\?+$/u.test(pattern)) return null;
      const start = Number.parseInt(pattern.replaceAll('?', '0'), 16);
      const end = Number.parseInt(pattern.replaceAll('?', 'F'), 16);
      if (end > 0x10ffff) return null;
      ranges.push([start, end]);
      continue;
    }

    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    if (start > end || end > 0x10ffff) return null;
    ranges.push([start, end]);
  }
  return ranges;
}

export function unicodeRangesIntersectGlyphs(ranges: readonly UnicodeRange[], glyphs: ReadonlySet<number>): boolean {
  for (const codePoint of glyphs) {
    if (ranges.some(([start, end]) => codePoint >= start && codePoint <= end)) return true;
  }
  return false;
}

export function faceUnicodeRangeMatches(value: string, glyphs: ReadonlySet<number>): boolean | null {
  if (!value.trim()) return true;
  const ranges = parseUnicodeRangeDescriptor(value);
  return ranges ? unicodeRangesIntersectGlyphs(ranges, glyphs) : null;
}

function decodeCssName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed[0] === '"' || trimmed[0] === "'") {
    const parsed = readCssString(trimmed);
    return parsed?.end === trimmed.length ? parsed.text.trim().toLowerCase() : null;
  }
  if (/['"()\u0000-\u001f]/u.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function parseFamilyList(value: string): string[] | null {
  const parts = splitTopLevel(value);
  if (!parts?.length) return null;
  const result = parts.map(decodeCssName);
  return result.every((family): family is string => Boolean(family)) ? result : null;
}

function addCodePoints(text: string, glyphs: Set<number>): void {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      glyphs.add(0xfffd);
    } else {
      glyphs.add(codePoint);
    }
  }
}

export function unicodeCodePointsForText(text: string): Set<number> {
  const glyphs = new Set<number>();
  addCodePoints(text, glyphs);
  return glyphs;
}

function transformedText(text: string, textTransform: string): string {
  switch (textTransform) {
    case 'uppercase': return text.toUpperCase();
    case 'lowercase': return text.toLowerCase();
    // Include both the original and an uppercased form for capitalize. This is
    // intentionally conservative around word boundaries and Unicode casing.
    case 'capitalize': return text.toUpperCase();
    default: return '';
  }
}

function addRenderedText(
  text: string,
  fontFamily: string,
  textTransform: string,
  glyphs: Set<number>,
  families: Set<string>,
): boolean {
  if (!text) return true;
  const parsedFamilies = parseFamilyList(fontFamily);
  if (!parsedFamilies) return false;
  addCodePoints(text, glyphs);
  const transformed = transformedText(text, textTransform);
  if (transformed) addCodePoints(transformed, glyphs);
  parsedFamilies.forEach((family) => families.add(family));
  return true;
}

function collectRenderedGlyphs(node: HTMLElement): { glyphs: Set<number>; families: Set<string> } | null {
  const document = node.ownerDocument;
  const view = document.defaultView;
  if (!view) return null;

  const glyphs = new Set<number>();
  const families = new Set<string>();
  const elementStyles = new Map<Element, CSSStyleDeclaration>();
  const styleFor = (element: Element) => {
    const cached = elementStyles.get(element);
    if (cached) return cached;
    const style = view.getComputedStyle(element);
    elementStyles.set(element, style);
    return style;
  };
  const walker = document.createTreeWalker(node, 4);
  let current = walker.nextNode();
  while (current) {
    const parent = current.parentElement;
    if (parent) {
      const style = styleFor(parent);
      if (!addRenderedText(current.nodeValue ?? '', style.fontFamily, style.textTransform, glyphs, families)) return null;
    }
    current = walker.nextNode();
  }

  const elements = [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))];
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') {
      const control = element as HTMLInputElement | HTMLTextAreaElement;
      const text = `${control.value}\n${control.placeholder}`;
      const style = styleFor(element);
      if (!addRenderedText(text, style.fontFamily, style.textTransform, glyphs, families)) return null;
    } else if (tagName === 'select') {
      const selected = Array.from((element as HTMLSelectElement).selectedOptions)
        .map((option) => option.label || option.textContent || '')
        .join('\n');
      const style = styleFor(element);
      if (!addRenderedText(selected, style.fontFamily, style.textTransform, glyphs, families)) return null;
    }

    for (const pseudo of ['::before', '::after'] as const) {
      const pseudoStyle = view.getComputedStyle(element, pseudo);
      const content = decodeCssContentText(pseudoStyle.content);
      if (content === null) return null;
      if (!addRenderedText(content, pseudoStyle.fontFamily, pseudoStyle.textTransform, glyphs, families)) return null;
    }
  }

  return glyphs.size && families.size ? { glyphs, families } : null;
}

function collectFontFaces(document: Document): FontFaceRule[] | null {
  const faces: FontFaceRule[] = [];
  const visited = new Set<CSSStyleSheet>();
  const active = new Set<CSSStyleSheet>();

  const visitSheet = (sheet: CSSStyleSheet, grouped: boolean): boolean => {
    if (active.has(sheet)) return false;
    if (!grouped && visited.has(sheet)) return true;
    if (!grouped) visited.add(sheet);
    active.add(sheet);
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      active.delete(sheet);
      return false;
    }
    const safe = visitRules(rules, grouped);
    active.delete(sheet);
    return safe;
  };

  const visitRules = (rules: CSSRuleList, grouped: boolean): boolean => {
    for (const rule of Array.from(rules)) {
      if (rule.constructor.name === 'CSSFontFaceRule' && 'style' in rule) {
        if (grouped) return false;
        faces.push(rule as FontFaceRule);
        continue;
      }
      if (rule.constructor.name === 'CSSImportRule') {
        const importRule = rule as CSSImportRule;
        const imported = importRule.styleSheet;
        const media = importRule.media?.mediaText.trim();
        const layerName = importRule.layerName;
        const hasLayer = layerName !== null && layerName !== undefined;
        const hasSupports = Boolean(importRule.supportsText?.trim());
        if (!imported || !visitSheet(imported, grouped || Boolean(media) || hasLayer || hasSupports)) return false;
        continue;
      }
      if ('cssRules' in rule) {
        let nested: CSSRuleList;
        try {
          nested = (rule as CSSGroupingRule).cssRules;
        } catch {
          return false;
        }
        if (!visitRules(nested, true)) return false;
      }
    }
    return true;
  };

  for (const sheet of Array.from(document.styleSheets)) {
    if (!visitSheet(sheet, false)) return null;
  }
  return faces;
}

function readFunction(value: string, name: string): { argument: string; rest: string } | null {
  let index = 0;
  while (cssWhitespace(value[index])) index += 1;
  if (value.slice(index, index + name.length).toLowerCase() !== name) return null;
  index += name.length;
  while (cssWhitespace(value[index])) index += 1;
  if (value[index] !== '(') return null;
  const start = index + 1;
  let depth = 1;
  let quote = '';
  let escaped = false;
  index += 1;

  for (; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')' && --depth === 0) {
      return { argument: value.slice(start, index).trim(), rest: value.slice(index + 1).trim() };
    }
  }
  return null;
}

function decodeCssUrlArgument(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const parsed = readCssString(trimmed);
    return parsed?.end === trimmed.length ? parsed.text : null;
  }
  if (!trimmed || /[\s()'"\u0000-\u001f]/u.test(trimmed)) return null;
  return trimmed;
}

function parseSourceItem(value: string): SourceItem | null {
  const local = readFunction(value, 'local');
  if (local && !local.rest) return { kind: 'local', cssText: value.trim() };

  const urlFunction = readFunction(value, 'url');
  if (!urlFunction) return null;
  const url = decodeCssUrlArgument(urlFunction.argument);
  if (!url) return null;

  let format: string | null = null;
  if (urlFunction.rest) {
    const formatFunction = readFunction(urlFunction.rest, 'format');
    if (!formatFunction || formatFunction.rest) return null;
    const formatValue = decodeCssName(formatFunction.argument);
    if (!formatValue) return null;
    format = formatValue;
  }

  const dataMime = url.match(/^data:([^;,]+)/iu)?.[1]?.toLowerCase();
  const formatFromMime: FontFileFormat | null = dataMime === 'font/woff2' || dataMime === 'application/font-woff2'
    ? 'woff2'
    : dataMime === 'font/ttf' || dataMime === 'application/x-font-ttf' || dataMime === 'application/x-truetype-font'
      ? 'truetype'
      : dataMime === 'font/otf' || dataMime === 'application/vnd.ms-opentype'
        ? 'opentype'
        : null;
  const formatFromDescriptor: FontFileFormat | null = format?.startsWith('woff2')
    ? 'woff2'
    : format === 'truetype' || format === 'opentype'
      ? format
      : null;
  const formatFromPath: FontFileFormat | null = /\.woff2(?:[?#]|$)/iu.test(url)
    ? 'woff2'
    : /\.ttf(?:[?#]|$)/iu.test(url)
      ? 'truetype'
      : /\.otf(?:[?#]|$)/iu.test(url)
        ? 'opentype'
        : null;
  const fileFormat = formatFromMime ?? formatFromDescriptor ?? formatFromPath;
  return fileFormat ? { kind: fileFormat, url, format } : { kind: 'other-url' };
}

export function parseCssFontSourceList(value: string): SourceItem[] | null {
  const parts = splitTopLevel(value);
  if (!parts?.length) return null;
  const sources = parts.map(parseSourceItem);
  return sources.every((source): source is SourceItem => source !== null) ? sources : null;
}

function resolveSameOriginFontUrl(url: string, baseHref: string | null, document: Document): string | null {
  if (url.startsWith('data:')) return url;
  try {
    const page = new URL(document.location.href);
    const resolved = new URL(url, baseHref || document.baseURI);
    if (resolved.origin !== page.origin || !/^https?:$/u.test(resolved.protocol)) return null;
    resolved.hash = '';
    return resolved.href;
  } catch {
    return null;
  }
}

function buildDataUrl(bytes: ArrayBuffer, format: FontFileFormat): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, Math.min(offset + 0x8000, view.length)));
  }
  const mime = format === 'woff2' ? 'font/woff2' : format === 'truetype' ? 'font/ttf' : 'font/otf';
  return `data:${mime};base64,${btoa(binary)}`;
}

function fontBytesMatchFormat(bytes: ArrayBuffer, format: FontFileFormat): boolean {
  if (bytes.byteLength < 4) return false;
  const signature = new Uint8Array(bytes, 0, 4);
  if (format === 'woff2') return signature[0] === 0x77 && signature[1] === 0x4f && signature[2] === 0x46 && signature[3] === 0x32;
  if (format === 'truetype') {
    return signature[0] === 0x00 && signature[1] === 0x01 && signature[2] === 0x00 && signature[3] === 0x00
      || signature[0] === 0x74 && signature[1] === 0x72 && signature[2] === 0x75 && signature[3] === 0x65;
  }
  return signature[0] === 0x4f && signature[1] === 0x54 && signature[2] === 0x54 && signature[3] === 0x4f;
}

async function fetchFontData(
  urls: readonly { url: string; format: FontFileFormat }[],
  signal: AbortSignal,
): Promise<Map<string, FontDataUrlResource>> {
  const results = new Map<string, FontDataUrlResource>();
  let next = 0;
  let totalBytes = 0;
  const worker = async () => {
    while (true) {
      if (signal.aborted) throw abortError();
      const index = next;
      next += 1;
      if (index >= urls.length) return;
      const { url, format } = urls[index];
      const cached = getCachedFontDataUrl(url, format);
      if (cached) {
        totalBytes += cached.bytes;
        if (totalBytes > MAX_INLINED_FONT_BYTES) throw new Error('Font resource budget exceeded');
        results.set(url, cached);
        continue;
      }
      const response = await fetch(url, { signal, cache: 'force-cache', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Font resource request failed');
      const bytes = await response.arrayBuffer();
      if (!fontBytesMatchFormat(bytes, format)) throw new Error(`Font resource does not match ${format}`);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_INLINED_FONT_BYTES) throw new Error('Font resource budget exceeded');
      const resource = { dataUrl: buildDataUrl(bytes, format), bytes: bytes.byteLength, format };
      results.set(url, resource);
      if (responseHasImmutableCacheControl(response)) cacheFontDataUrl(url, resource);
    }
  };

  await Promise.all(Array.from({ length: Math.min(FONT_FETCH_CONCURRENCY, urls.length) }, worker));
  return results;
}

function abortError(): Error {
  const error = new Error('Font CSS preparation aborted');
  error.name = 'AbortError';
  return error;
}

function serializeFaceWithSource(rule: FontFaceRule, source: string): string | null {
  const declarations: string[] = [];
  let hasSource = false;
  for (let index = 0; index < rule.style.length; index += 1) {
    const property = rule.style.item(index);
    if (!property) continue;
    const value = property === 'src' ? source : rule.style.getPropertyValue(property);
    const priority = rule.style.getPropertyPriority(property);
    if (property === 'src') hasSource = true;
    declarations.push(`${property}: ${value}${priority ? ` !${priority}` : ''}`);
  }
  return hasSource ? `@font-face { ${declarations.join('; ')}; }` : null;
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/**
 * Builds a per-export copy of the page's existing font-face CSS, retaining only
 * families and unicode ranges that can contribute glyphs to this card. Any
 * uncertain CSS or font resource returns null so the renderer can use its
 * original, complete stylesheet scan.
 */
export async function prepareCardFontCss(
  node: HTMLElement,
  options: { signal?: AbortSignal } = {},
): Promise<PreparedCardFontCss | null> {
  const startedAt = performance.now();
  let consideredFaceCount = 0;
  let selectedFaceCount = 0;
  let inlinedBytes = 0;
  let uniqueFontResourceCount = 0;
  let glyphCount = 0;
  let cssLength = 0;
  let prepared = false;

  const finish = () => {
    profileCount(prepared ? 'export.fontCss.prepared' : 'export.fontCss.fallback');
    profileCount('export.fontCss.faces.considered', consideredFaceCount);
    profileCount('export.fontCss.faces.selected', selectedFaceCount);
    profileCount('export.fontCss.resources.bytes', inlinedBytes);
    profileTiming('export.fontCss.prepare', performance.now() - startedAt, {
      consideredFaceCount,
      selectedFaceCount,
      inlinedBytes,
      uniqueFontResourceCount,
      cssLength,
      glyphCount,
    });
  };

  const fetchController = new AbortController();
  const onAbort = () => fetchController.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) fetchController.abort();

  try {
    abortIfNeeded(options.signal);
    const finishGlyphScanTiming = profileStart('export.fontCss.glyphScan');
    let rendered: ReturnType<typeof collectRenderedGlyphs>;
    try {
      rendered = collectRenderedGlyphs(node);
    } finally {
      finishGlyphScanTiming();
    }
    if (!rendered) return null;
    const { glyphs, families } = rendered;
    glyphCount = glyphs.size;

    const finishRuleScanTiming = profileStart('export.fontCss.ruleScan');
    let faces: FontFaceRule[] | null;
    try {
      faces = collectFontFaces(node.ownerDocument);
    } finally {
      finishRuleScanTiming();
    }
    if (!faces) return null;
    consideredFaceCount = faces.length;

    const selected: Array<{ rule: FontFaceRule; sources: SourceItem[] }> = [];
    const finishFaceSelectionTiming = profileStart('export.fontCss.faceSelection', { consideredFaceCount });
    try {
      for (const rule of faces) {
        abortIfNeeded(options.signal);
        const familyValue = rule.style.getPropertyValue('font-family');
        const faceFamilies = familyValue ? parseFamilyList(familyValue) : null;
        if (!faceFamilies) return null;
        if (!faceFamilies.some((family) => families.has(family))) continue;

        const unicodeRange = rule.style.getPropertyValue('unicode-range').trim();
        if (unicodeRange) {
          const matchesText = faceUnicodeRangeMatches(unicodeRange, glyphs);
          if (matchesText === null) return null;
          if (!matchesText) continue;
        }

        const src = rule.style.getPropertyValue('src');
        const sources = src ? parseCssFontSourceList(src) : null;
        if (!sources) return null;
        if (!sources.some((source) => source.kind !== 'other-url')) return null;
        selected.push({ rule, sources: sources.filter((source) => source.kind !== 'other-url') });
      }
    } finally {
      finishFaceSelectionTiming();
    }

    selectedFaceCount = selected.length;
    if (!selected.length) return null;

    const uniqueUrlFormats = new Map<string, FontFileFormat>();
    for (const face of selected) {
      for (const source of face.sources) {
        if (source.kind === 'local' || source.kind === 'other-url' || source.url.startsWith('data:')) continue;
        const resolvedUrl = resolveSameOriginFontUrl(source.url, face.rule.parentStyleSheet?.href ?? null, node.ownerDocument);
        if (!resolvedUrl) return null;
        const previousFormat = uniqueUrlFormats.get(resolvedUrl);
        if (previousFormat && previousFormat !== source.kind) return null;
        source.resolvedUrl = resolvedUrl;
        uniqueUrlFormats.set(resolvedUrl, source.kind);
      }
    }

    const uniqueUrls = Array.from(uniqueUrlFormats, ([url, format]) => ({ url, format }));
    uniqueFontResourceCount = uniqueUrls.length;
    const finishResourceTiming = profileStart('export.fontCss.resourceLoad', { uniqueFontResourceCount });
    let resources: Map<string, FontDataUrlResource>;
    try {
      resources = uniqueUrls.length ? await fetchFontData(uniqueUrls, fetchController.signal) : new Map();
    } finally {
      finishResourceTiming();
    }
    abortIfNeeded(options.signal);

    const finishSerializationTiming = profileStart('export.fontCss.serialize', { selectedFaceCount });
    let cssText: string;
    try {
      const cssRules: string[] = [];
      for (const face of selected) {
        const outputSources: string[] = [];
        for (const source of face.sources) {
          if (source.kind === 'local') {
            outputSources.push(source.cssText);
            continue;
          }
          if (source.kind === 'other-url') continue;

          if (source.url.startsWith('data:')) {
            const format = source.format ? ` format("${source.format}")` : '';
            outputSources.push(`url("${source.url}")${format}`);
            continue;
          }

          const resource = source.resolvedUrl ? resources.get(source.resolvedUrl) : undefined;
          if (!resource) return null;
          source.dataUrl = resource.dataUrl;
          source.bytes = resource.bytes;
          inlinedBytes += resource.bytes;
          const format = source.format ? ` format("${source.format}")` : '';
          outputSources.push(`url("${resource.dataUrl}")${format}`);
        }
        if (!outputSources.length) return null;
        const serialized = serializeFaceWithSource(face.rule, outputSources.join(', '));
        if (!serialized) return null;
        cssRules.push(serialized);
      }
      cssText = cssRules.join('\n');
    } finally {
      finishSerializationTiming();
    }
    if (!cssText) return null;
    cssLength = cssText.length;
    prepared = true;
    return {
      cssText,
      consideredFaceCount,
      selectedFaceCount,
      inlinedBytes,
      uniqueFontResourceCount,
      glyphCount,
    };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    fetchController.abort();
    return null;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    finish();
  }
}

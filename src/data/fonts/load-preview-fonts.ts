import { TYPOGRAPHY_PREVIEW_FAMILIES, type TypographyPreviewFontId } from './preview-families.generated';
import { createFontPreviewQueue } from './font-preview-queue';
import { TYPOGRAPHY_STYLESHEET_LOADERS, type TypographyStylesheetId } from './stylesheet-loaders.generated';
import { FONT_REGISTRY, type FontRegistryEntry } from './registry';
import type { TypographyScript } from '@/lib/typography-presets';

const PREVIEW_STYLESHEET_TIMEOUT_MS = 20_000;
const PREVIEW_UNICODE_BLOCK_SIZE = 512;

const previewQueues = new WeakMap<FontFaceSet, ReturnType<typeof createFontPreviewQueue>>();
const previewStylesheets = new WeakMap<Document, Map<string, Promise<void>>>();

export function hasTypographyFontPreview(fontId: string): fontId is TypographyPreviewFontId {
  return Object.hasOwn(TYPOGRAPHY_PREVIEW_FAMILIES, fontId);
}

function getPreviewQueue(fontSet: FontFaceSet) {
  let queue = previewQueues.get(fontSet);
  if (!queue) {
    queue = createFontPreviewQueue(2, 96);
    previewQueues.set(fontSet, queue);
  }
  return queue;
}

function getStylesheetCache(documentRef: Document) {
  let cache = previewStylesheets.get(documentRef);
  if (!cache) {
    cache = new Map();
    previewStylesheets.set(documentRef, cache);
  }
  return cache;
}

function createPreviewError(message: string): Error {
  return new Error(message);
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('The font preview request was cancelled.', 'AbortError');
  const error = new Error('The font preview request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function loadStylesheet(fontId: string, href: string, documentRef: Document): Promise<void> {
  const cache = getStylesheetCache(documentRef);
  const cacheKey = `preview:${fontId}`;
  const current = cache.get(cacheKey);
  if (current) return current;

  let link: HTMLLinkElement | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const pending = new Promise<void>((resolve, reject) => {
    link = documentRef.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.typographyPreviewFont = fontId;
    link.onload = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      if (link) link.dataset.typographyPreviewLoaded = 'true';
      resolve();
    };
    link.onerror = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      reject(createPreviewError(`Font preview stylesheet failed: ${fontId}`));
    };
    timeout = setTimeout(() => {
      reject(createPreviewError(`Font preview stylesheet timed out: ${fontId}`));
    }, PREVIEW_STYLESHEET_TIMEOUT_MS);
    documentRef.head.append(link);
  }).catch((error: unknown) => {
    if (timeout !== undefined) clearTimeout(timeout);
    link?.remove();
    if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, pending);
  return pending;
}

function loadPackageStylesheet(fontId: string, scripts: readonly TypographyScript[], documentRef: Document): Promise<void> {
  const entries = Object.entries(FONT_REGISTRY) as Array<[string, FontRegistryEntry]>;
  const matchingEntry = entries.find(([, entry]) => entry.id === fontId);
  const registryEntry = matchingEntry?.[1];
  if (!registryEntry?.package || !registryEntry.supportedScripts.some((script) => scripts.includes(script))) return Promise.resolve();

  const registryKey = matchingEntry?.[0] as TypographyStylesheetId | undefined;
  const loader = registryKey ? TYPOGRAPHY_STYLESHEET_LOADERS[registryKey] : undefined;
  if (!loader) return Promise.reject(createPreviewError(`No stylesheet loader is registered for ${fontId}.`));

  const cache = getStylesheetCache(documentRef);
  const cacheKey = `package:${fontId}`;
  const current = cache.get(cacheKey);
  if (current) return current;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const imported = Promise.resolve().then(loader);
  const pending = new Promise<void>((resolve, reject) => {
    timeout = setTimeout(() => reject(createPreviewError(`Font preview stylesheet timed out: ${fontId}`)), PREVIEW_STYLESHEET_TIMEOUT_MS);
    imported.then(() => resolve(), reject);
  }).catch((error: unknown) => {
    if (timeout !== undefined) clearTimeout(timeout);
    if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
    throw error;
  }).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
  cache.set(cacheKey, pending);
  return pending;
}

function getSampleBlocks(text: string): string[] {
  const blocks = new Map<number, Set<string>>();
  for (const character of text) {
    const codepoint = character.codePointAt(0) ?? 0;
    const blockStart = Math.floor(codepoint / PREVIEW_UNICODE_BLOCK_SIZE) * PREVIEW_UNICODE_BLOCK_SIZE;
    const characters = blocks.get(blockStart) ?? new Set<string>();
    characters.add(character);
    blocks.set(blockStart, characters);
  }
  return [...blocks.keys()].sort((left, right) => left - right)
    .map((blockStart) => [...blocks.get(blockStart)!].join(''));
}

function loadFontBlock(fontSet: FontFaceSet, font: string, text: string): Promise<FontFace[]> {
  // FontFaceSet.load is not abortable. Keep the queue slot until its native
  // promise settles so timed-out UI status cannot start more than two loads.
  return fontSet.load(font, text);
}

/** Load only the preview font shards whose Unicode blocks appear in the real sample text. */
export function loadTypographyFontPreview(
  fontId: string,
  sourceFamily: string,
  weight: number,
  sample: string,
  scripts: readonly TypographyScript[],
  signal?: AbortSignal,
): Promise<string> {
  if (typeof document === 'undefined') return Promise.reject(createPreviewError('Font previews are only available in a browser.'));
  const previewId = fontId as TypographyPreviewFontId;
  const preview = TYPOGRAPHY_PREVIEW_FAMILIES[previewId];
  const registryEntry = Object.values(FONT_REGISTRY).find((entry) => entry.id === fontId);
  if (!preview && !registryEntry) return Promise.reject(createPreviewError(`No font preview is registered for ${fontId}.`));
  if (!sample.trim()) return Promise.reject(createPreviewError('The sample is empty.'));

  const fontSet = document.fonts;
  const queue = getPreviewQueue(fontSet);
  const family = preview?.family ?? sourceFamily;
  const font = `${weight} 22px ${JSON.stringify(family)}`;
  const sampleBlocks = getSampleBlocks(sample);
  const key = `${fontId}\u0000${weight}\u0000${sample}`;

  return queue.load(key, async (hasSubscribers) => {
    if (preview) await loadStylesheet(fontId, preview.stylesheet, document);
    else await loadPackageStylesheet(fontId, scripts, document);
    if (!hasSubscribers()) throw createAbortError();

    let loadedFaceCount = 0;
    for (const blockText of sampleBlocks) {
      if (!hasSubscribers()) throw createAbortError();
      if (blockText.trim().length === 0) continue;
      const faces = await loadFontBlock(fontSet, font, blockText);
      if (faces.length === 0) {
        throw createPreviewError(`No preview face supports a sample block for ${fontId}.`);
      }
      loadedFaceCount += faces.length;
    }
    if (loadedFaceCount === 0) throw createPreviewError(`No preview face supports the sample for ${fontId}.`);
    return family;
  }, signal);
}

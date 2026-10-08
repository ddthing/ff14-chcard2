import type { AdventurerCardData, CardRatio } from '@/components/cards/types';
import type { Locale } from '@/lib/types';
import { PERFORMANCE_PROFILING_ENABLED, profileCount, profileStart, profileTiming } from '@/lib/performance-profile';

export type CardExportFormat = 'png' | 'webp';
export type CardExportScale = 1 | 2 | 4;
export type CardExportStage = 'fonts' | 'image' | 'render' | 'download';
export type CardExportErrorCode =
  | 'cancelled'
  | 'font-timeout'
  | 'font-load-failed'
  | 'image-timeout'
  | 'image-failed'
  | 'optical-timeout'
  | 'asset-timeout'
  | 'renderer-timeout'
  | 'renderer-load-failed'
  | 'render-timeout'
  | 'render-failed'
  | 'webp-unsupported'
  | 'size-mismatch'
  | 'download-failed';

export const CARD_EXPORT_FONT_TIMEOUT_MS = 20_000;
export const CARD_EXPORT_IMAGE_TIMEOUT_MS = 20_000;
export const CARD_EXPORT_OPTICAL_TIMEOUT_MS = 15_000;
export const CARD_EXPORT_PAINT_TIMEOUT_MS = 5_000;
export const CARD_EXPORT_RENDERER_LOAD_TIMEOUT_MS = 15_000;
export const CARD_EXPORT_RENDER_TIMEOUT_MS = 30_000;
export const CARD_EXPORT_RENDERER_TIMEOUT_MS = 30_000;

const CARD_EXPORT_FILENAME_MAX_GRAPHEMES = 64;
const CARD_EXPORT_FILENAME_MAX_UTF8_BYTES = 180;
const CARD_EXPORT_URL_REVOKE_DELAY_MS = 60_000;
let nextProfiledObjectUrlId = 0;
const profiledObjectUrls = new Map<number, { bytes: number; createdAt: number }>();

function trackExportObjectUrl(blob: Blob): () => void {
  if (!PERFORMANCE_PROFILING_ENABLED) return () => undefined;

  const id = ++nextProfiledObjectUrlId;
  const createdAt = performance.now();
  profiledObjectUrls.set(id, { bytes: blob.size, createdAt });
  profileCount('export.objectUrl.created');
  profileCount('export.objectUrl.createdBytes', blob.size);
  profileTiming('export.objectUrl.retained', 0, {
    activeCount: profiledObjectUrls.size,
    activeBytes: [...profiledObjectUrls.values()].reduce((sum, item) => sum + item.bytes, 0),
  });

  return () => {
    const tracked = profiledObjectUrls.get(id);
    if (!tracked) return;
    profiledObjectUrls.delete(id);
    profileCount('export.objectUrl.revoked');
    profileTiming('export.objectUrl.lifetime', performance.now() - tracked.createdAt, {
      bytes: tracked.bytes,
    });
    profileTiming('export.objectUrl.retained', 0, {
      activeCount: profiledObjectUrls.size,
      activeBytes: [...profiledObjectUrls.values()].reduce((sum, item) => sum + item.bytes, 0),
    });
  };
}

export class CardExportError extends Error {
  readonly code: CardExportErrorCode;

  constructor(code: CardExportErrorCode) {
    super(code);
    this.name = 'CardExportError';
    this.code = code;
  }
}

export function withCardExportTimeout<T>(
  operation: PromiseLike<T> | (() => PromiseLike<T>),
  timeoutMs: number,
  timeoutCode: CardExportErrorCode,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CardExportError('cancelled'));
      return;
    }

    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      complete();
    };
    const onAbort = () => finish(() => reject(new CardExportError('cancelled')));
    const timeout = setTimeout(
      () => finish(() => reject(new CardExportError(timeoutCode))),
      Math.max(1, timeoutMs),
    );

    signal?.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve()
      .then(() => typeof operation === 'function' ? operation() : operation)
      .then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
  });
}

export interface CardExportProgress {
  stage: CardExportStage;
  progress: number;
}

export interface CardExportSize {
  width: number;
  height: number;
  scale: number;
  capped: boolean;
}

export interface CardExportSnapshot {
  readonly data: AdventurerCardData;
  readonly locale: Locale;
  readonly format: CardExportFormat;
  readonly scale: CardExportScale;
}

/** Copy the mutable editor inputs once so fonts, preview DOM, render, and filename share one job. */
export function createCardExportSnapshot(
  data: AdventurerCardData,
  locale: Locale,
  format: CardExportFormat,
  scale: CardExportScale,
): CardExportSnapshot {
  const finishTiming = profileStart('export.snapshot');
  try {
    return {
      data: {
        ...data,
        character: {
          ...data.character,
          languages: [...data.character.languages],
          playStyles: [...data.character.playStyles],
        },
        design: {
          ...data.design,
          palette: { ...data.design.palette },
          effects: [...data.design.effects],
        },
        imageAdjustments: { ...data.imageAdjustments },
      },
      locale,
      format,
      scale,
    };
  } finally {
    finishTiming();
  }
}

export const CARD_EXPORT_SCALES: CardExportScale[] = [1, 2, 4];
export const CARD_EXPORT_MAX_PIXELS = 22_000_000;
export const CARD_EXPORT_MAX_EDGE = 8_192;

export const CARD_EXPORT_RATIOS: CardRatio[] = ['1:1', '4:5', '3:4', '9:16', '16:9'];

const BASE_EXPORT_DIMENSIONS: Record<CardRatio, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '3:4': { width: 1080, height: 1440 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
};

export function getCardExportBaseDimensions(ratio: CardRatio) {
  return BASE_EXPORT_DIMENSIONS[ratio];
}

/** Keep card composition at a preview-sized CSS width, then rasterize to the requested pixels. */
export function getCardExportLogicalDimensions(ratio: CardRatio) {
  if (ratio === '16:9') return { width: 640, height: 360 };
  const [width, height] = ratio.split(':').map(Number);
  return { width: 432, height: Math.round(432 * height / width) };
}

export function getCardExportSize(ratio: CardRatio, requestedScale: CardExportScale): CardExportSize {
  const base = BASE_EXPORT_DIMENSIONS[ratio];
  const maxByPixels = Math.sqrt(CARD_EXPORT_MAX_PIXELS / (base.width * base.height));
  const maxByEdge = CARD_EXPORT_MAX_EDGE / Math.max(base.width, base.height);
  const boundedScale = Math.min(requestedScale, maxByPixels, maxByEdge);
  const width = Math.floor(base.width * boundedScale);
  const logical = getCardExportLogicalDimensions(ratio);
  // The rasterizer scales both axes from the integer output width, then
  // truncates canvas dimensions. Match that rule for capped fractional scales.
  const height = Math.floor(logical.height * (width / logical.width));
  const scale = width / base.width;

  return {
    width,
    height,
    scale,
    capped: scale < requestedScale,
  };
}

export function withCardRatio(data: AdventurerCardData, ratio: CardRatio): AdventurerCardData {
  return {
    ...data,
    design: { ...data.design, ratio },
  };
}

export interface CardAssetWaitOptions {
  signal?: AbortSignal;
  fontTimeoutMs?: number;
  imageTimeoutMs?: number;
  opticalTimeoutMs?: number;
  paintTimeoutMs?: number;
}

export async function waitForCardAssets(node: HTMLElement, options: CardAssetWaitOptions = {}): Promise<void> {
  const signal = options.signal;
  profileCount('export.assets.wait.calls');
  const finishTotalTiming = profileStart('export.assets.wait.total');
  const readinessController = new AbortController();
  const abortReadiness = () => readinessController.abort();
  signal?.addEventListener('abort', abortReadiness, { once: true });
  if (signal?.aborted) readinessController.abort();
  try {
    if (typeof document === 'undefined' || !document.fonts) {
      throw new CardExportError('font-load-failed');
    }

    const fontSet = document.fonts;
    if (typeof fontSet.ready?.then !== 'function') {
      throw new CardExportError('font-load-failed');
    }
    profileCount('export.assets.fonts.ready.calls');
    const finishFontTiming = profileStart('export.assets.fonts.ready');
    const fontsReady = withCardExportTimeout(
      () => fontSet.ready,
      options.fontTimeoutMs ?? CARD_EXPORT_FONT_TIMEOUT_MS,
      'font-timeout',
      readinessController.signal,
    ).catch((error: unknown) => {
      if (error instanceof CardExportError) throw error;
      throw new CardExportError('font-load-failed');
    }).finally(finishFontTiming);

    const maxStablePasses = 4;
    for (let pass = 0; pass < maxStablePasses; pass += 1) {
      const sourcesBeforePaint = getCardImageSourceSignature(node);
      const imageCount = node.querySelectorAll('img').length;
      profileCount('export.assets.images.count', imageCount);
      const finishImagesTiming = profileStart('export.assets.images.decode', { imageCount });
      try {
        const imagesReady = waitForCurrentCardImages(
          node,
          options.imageTimeoutMs ?? CARD_EXPORT_IMAGE_TIMEOUT_MS,
          readinessController.signal,
        );
        try {
          // Font fetching and image decoding have no dependency on each other.
          // Start both together so a slow CJK font shard does not hold up the
          // material/photo decodes the renderer needs next.
          await Promise.all([fontsReady, imagesReady]);
        } catch (error) {
          readinessController.abort();
          throw error;
        }
      } finally {
        finishImagesTiming();
      }

      const opticalCount = node.querySelectorAll('[data-optical-name]').length;
      profileCount('export.assets.optical.names.count', opticalCount);
      const finishOpticalTiming = profileStart('export.assets.optical.ready', { opticalCount });
      try {
        await waitForOpticalNames(node, options.opticalTimeoutMs ?? CARD_EXPORT_OPTICAL_TIMEOUT_MS, signal);
      } finally {
        finishOpticalTiming();
      }

      const finishPaintTiming = profileStart('export.assets.paint.frames');
      try {
        await waitForPaintFrames(options.paintTimeoutMs ?? CARD_EXPORT_PAINT_TIMEOUT_MS, signal);
      } finally {
        finishPaintTiming();
      }

      if (getCardImageSourceSignature(node) === sourcesBeforePaint) return;
    }
    throw new CardExportError('image-failed');
  } finally {
    signal?.removeEventListener('abort', abortReadiness);
    readinessController.abort();
    finishTotalTiming();
  }
}

type ImageWaitSnapshot = Readonly<{ image: HTMLImageElement; source: string }>;
type ImageWaitFailure = Readonly<{
  kind: 'image-failed';
  snapshot: ImageWaitSnapshot;
  error: CardExportError;
}>;

function getImageSourceKey(image: HTMLImageElement): string {
  const sourceAttribute = typeof image.getAttribute === 'function' ? image.getAttribute('src') : '';
  return image.currentSrc || image.src || sourceAttribute || '';
}

function getCardImageSourceSignature(node: HTMLElement): string {
  return Array.from(node.querySelectorAll('img'), getImageSourceKey).sort().join('\u0000');
}

function isImageWaitFailure(value: unknown): value is ImageWaitFailure {
  return Boolean(
    value && typeof value === 'object' &&
    'kind' in value && value.kind === 'image-failed' &&
    'snapshot' in value && 'error' in value &&
    value.error instanceof CardExportError && value.error.code === 'image-failed',
  );
}

/**
 * An image error can trigger a React source cascade (SVG → raster → Fan Kit).
 * After that error, allow the card to commit its replacement and wait for the
 * current image set before deciding whether export still has a failed asset.
 */
async function waitForCurrentCardImages(
  node: HTMLElement,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const maxSourceReplacements = 4;

  for (let attempt = 0; attempt <= maxSourceReplacements; attempt += 1) {
    if (signal?.aborted) throw new CardExportError('cancelled');

    const snapshots: ImageWaitSnapshot[] = Array.from(node.querySelectorAll('img'), (image) => ({
      image,
      source: getImageSourceKey(image),
    }));
    if (snapshots.length === 0) return;

    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    signal?.addEventListener('abort', abortAttempt, { once: true });
    if (signal?.aborted) attemptController.abort();

    try {
      await Promise.all(snapshots.map(async (snapshot) => {
        try {
          await waitForImage(snapshot.image, timeoutMs, attemptController.signal);
        } catch (error) {
          if (error instanceof CardExportError && error.code === 'image-failed') {
            const failure: ImageWaitFailure = { kind: 'image-failed', snapshot, error };
            throw failure;
          }
          throw error;
        }
      }));
    } catch (error) {
      attemptController.abort();
      if (!isImageWaitFailure(error)) throw error;

      await waitForPaintFrames(Math.min(timeoutMs, CARD_EXPORT_PAINT_TIMEOUT_MS), signal);
      const currentImages = Array.from(node.querySelectorAll('img'));
      const currentFailedImage = currentImages.find((image) => image === error.snapshot.image);
      if (
        currentFailedImage &&
        getImageSourceKey(currentFailedImage) === error.snapshot.source
      ) {
        throw error.error;
      }

      if (attempt === maxSourceReplacements) throw error.error;
      continue;
    } finally {
      signal?.removeEventListener('abort', abortAttempt);
    }

    const currentImages = Array.from(node.querySelectorAll('img'));
    const previousSources = snapshots.map(({ source }) => source).sort();
    const currentSources = currentImages.map(getImageSourceKey).sort();
    const sourceSetChanged =
      currentSources.length !== previousSources.length ||
      currentSources.some((source, index) => source !== previousSources[index]);
    if (sourceSetChanged) {
      if (attempt === maxSourceReplacements) throw new CardExportError('image-failed');
      continue;
    }
    return;
  }

  throw new CardExportError('image-failed');
}

function waitForPaintFrames(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new CardExportError('cancelled'));
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const usesAnimationFrame = typeof requestAnimationFrame === 'function';
    const scheduleFrame = (callback: FrameRequestCallback) => usesAnimationFrame
      ? requestAnimationFrame(callback)
      : setTimeout(() => callback(0), 0) as unknown as number;
    const cancelFrame = (frame: number) => {
      if (!frame) return;
      if (usesAnimationFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      else clearTimeout(frame);
    };
    const timeout = setTimeout(() => finish(new CardExportError('asset-timeout')), timeoutMs);
    const onAbort = () => finish(new CardExportError('cancelled'));
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      cancelFrame(firstFrame);
      cancelFrame(secondFrame);
    };
    const finish = (error?: CardExportError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    firstFrame = scheduleFrame(() => {
      firstFrame = 0;
      secondFrame = scheduleFrame(() => {
        secondFrame = 0;
        finish();
      });
    });
  });
}

async function waitForImage(image: HTMLImageElement, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => finish(new CardExportError('image-timeout')), timeoutMs);
      const onAbort = () => finish(new CardExportError('cancelled'));
      const onLoad = () => finish();
      const onError = () => finish(new CardExportError('image-failed'));
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      };
      const finish = (error?: CardExportError) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      if (signal?.aborted) onAbort();
      else if (image.complete) onLoad();
    });
  }

  if (image.naturalWidth <= 0) throw new CardExportError('image-failed');
  if (typeof image.decode === 'function') {
    try {
      await withCardExportTimeout(() => image.decode(), timeoutMs, 'image-timeout', signal);
    } catch (error) {
      if (error instanceof CardExportError && (error.code === 'cancelled' || error.code === 'image-timeout')) throw error;
      throw new CardExportError('image-failed');
    }
  }
}

async function waitForOpticalNames(node: HTMLElement, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  const names = Array.from(node.querySelectorAll<HTMLElement>('[data-optical-name]'));
  if (!names.length) return;

  const Observer = node.ownerDocument?.defaultView?.MutationObserver
    ?? (typeof MutationObserver === 'function' ? MutationObserver : undefined);
  await waitForPredicate(
    () => names.every((name) => name.dataset.opticalReady === 'true'),
    timeoutMs,
    'optical-timeout',
    signal,
    Observer ? (check) => {
      const observer = new Observer(() => check());
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['data-optical-ready'],
        subtree: true,
      });
      return () => observer.disconnect();
    } : undefined,
  );
}

type PredicateSubscription = (check: () => void) => () => void;

function waitForPredicate(
  predicate: () => boolean,
  timeoutMs: number,
  timeoutCode: CardExportErrorCode,
  signal?: AbortSignal,
  subscribe?: PredicateSubscription,
): Promise<void> {
  if (predicate()) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new CardExportError('cancelled'));

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const timeout = setTimeout(() => finish(new CardExportError(timeoutCode)), timeoutMs);
    const onAbort = () => finish(new CardExportError('cancelled'));
    const finish = (error?: CardExportError) => {
      if (settled) return;
      settled = true;
      if (interval !== undefined) clearInterval(interval);
      clearTimeout(timeout);
      unsubscribe?.();
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    function check() {
      try {
        if (predicate()) finish();
      } catch {
        finish(new CardExportError(timeoutCode));
      }
    }

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else {
      if (subscribe) {
        try {
          unsubscribe = subscribe(check);
        } catch {
          interval = setInterval(check, 32);
        }
      } else {
        interval = setInterval(check, 32);
      }
      check();
    }
  });
}

type CardExportRenderer = typeof import('modern-screenshot');
type CardExportRendererImport =
  | { ok: true; renderer: CardExportRenderer }
  | { ok: false; error: unknown };

function startCardExportRendererImport(): { promise: Promise<CardExportRendererImport> } {
  const startedAt = performance.now();
  profileCount('export.renderer.import.calls');
  const promise = import('modern-screenshot').then(
    (renderer): CardExportRendererImport => ({ ok: true, renderer }),
    (error: unknown): CardExportRendererImport => ({ ok: false, error }),
  ).then((result) => {
    profileTiming('export.renderer.import', performance.now() - startedAt, { overlappedReadiness: true });
    return result;
  });
  return { promise };
}

export async function renderCardBlob(
  node: HTMLElement,
  data: AdventurerCardData,
  format: CardExportFormat,
  requestedScale: CardExportScale,
  onProgress: (progress: CardExportProgress) => void,
  options: { signal?: AbortSignal; profileDebug?: boolean } = {},
): Promise<{ blob: Blob; size: CardExportSize }> {
  const size = getCardExportSize(data.design.ratio, requestedScale);
  const logical = getCardExportLogicalDimensions(data.design.ratio);
  profileCount('export.renderer.calls');

  onProgress({ stage: 'fonts', progress: 0.08 });
  const rendererImport = startCardExportRendererImport();
  await waitForCardAssets(node, { signal: options.signal });
  onProgress({ stage: 'image', progress: 0.2 });
  assertCardExportCanvasAvailable(node);

  let renderer: CardExportRenderer;
  const finishRendererWaitTiming = profileStart('export.renderer.import.wait');
  try {
    const result = await withCardExportTimeout(
      () => rendererImport.promise,
      CARD_EXPORT_RENDERER_LOAD_TIMEOUT_MS,
      'renderer-timeout',
      options.signal,
    );
    if (!result.ok) throw new CardExportError('renderer-load-failed');
    renderer = result.renderer;
  } catch (error) {
    if (error instanceof CardExportError) throw error;
    throw new CardExportError('renderer-load-failed');
  } finally {
    finishRendererWaitTiming();
  }

  let blob: Blob;
  let lastEmbedProgressAt = 0;
  let recordedEmbedTaskCount = false;
  const finishScreenshotTiming = profileStart('export.renderer.domToBlob', {
    format,
    scale: requestedScale,
    ratio: data.design.ratio,
  });
  try {
    const fontPreparationController = new AbortController();
    const abortFontPreparation = () => fontPreparationController.abort();
    options.signal?.addEventListener('abort', abortFontPreparation, { once: true });
    if (options.signal?.aborted) fontPreparationController.abort();

    const renderWithPreparedFonts = async () => {
      let font: { cssText: string } | undefined;
      try {
        const { prepareCardFontCss } = await import('./font-css');
        const prepared = await prepareCardFontCss(node, { signal: fontPreparationController.signal });
        if (prepared) {
          font = { cssText: prepared.cssText };
          profileCount('export.fontCss.used');
        }
      } catch (error) {
        if (options.signal?.aborted || fontPreparationController.signal.aborted) throw error;
        // CSS inspection and inlining are an optimization only. Let the
        // renderer's original stylesheet scan handle any unsupported case.
        profileCount('export.fontCss.fallback.preparationError');
      }

      if (options.signal?.aborted || fontPreparationController.signal.aborted) {
        throw new CardExportError('cancelled');
      }

      return renderer.domToBlob(node, {
        width: logical.width,
        height: logical.height,
        scale: size.width / logical.width,
        type: format === 'webp' ? 'image/webp' : 'image/png',
        quality: format === 'webp' ? 0.94 : undefined,
        filter: (element) => element.nodeType !== 1 || (element as Element).getAttribute('data-material-preload') !== 'true',
        onCloneEachNode: preserveCardLocalSvgClip,
        maximumCanvasSize: CARD_EXPORT_MAX_EDGE,
        timeout: CARD_EXPORT_RENDERER_TIMEOUT_MS,
        font,
        debug: PERFORMANCE_PROFILING_ENABLED && options.profileDebug === true,
        progress: (current, total) => {
          if (PERFORMANCE_PROFILING_ENABLED) {
            const now = performance.now();
            if (!recordedEmbedTaskCount) {
              recordedEmbedTaskCount = true;
              profileCount('export.renderer.embed.tasks.total', total);
              lastEmbedProgressAt = now;
            } else {
              profileCount('export.renderer.embed.progress.events');
              profileTiming('export.renderer.embed.progress.interval', now - lastEmbedProgressAt, { current, total });
              lastEmbedProgressAt = now;
            }
          }
          onProgress({ stage: 'render', progress: total ? 0.2 + (current / total) * 0.72 : 0.65 });
        },
      });
    };

    try {
      blob = await withCardExportTimeout(
        renderWithPreparedFonts,
        CARD_EXPORT_RENDER_TIMEOUT_MS,
        'render-timeout',
        options.signal,
      );
    } finally {
      options.signal?.removeEventListener('abort', abortFontPreparation);
      fontPreparationController.abort();
    }
  } catch (error) {
    if (error instanceof CardExportError) throw error;
    throw new CardExportError('render-failed');
  } finally {
    finishScreenshotTiming();
  }

  const expectedType = format === 'webp' ? 'image/webp' : 'image/png';
  if (!blob || blob.type !== expectedType) {
    throw new CardExportError(format === 'webp' ? 'webp-unsupported' : 'render-failed');
  }

  let renderedDimensions: { width: number; height: number };
  const finishDimensionTiming = profileStart('export.renderer.dimensionCheck', { format });
  try {
    renderedDimensions = await withCardExportTimeout(
      () => readRenderedDimensions(blob, format),
      5_000,
      'render-timeout',
      options.signal,
    );
  } catch (error) {
    if (error instanceof CardExportError) throw error;
    throw new CardExportError('render-failed');
  } finally {
    finishDimensionTiming();
  }
  if (renderedDimensions.width !== size.width || renderedDimensions.height !== size.height) {
    throw new CardExportError('size-mismatch');
  }

  onProgress({ stage: 'download', progress: 0.96 });
  return { blob, size };
}

function assertCardExportCanvasAvailable(node: HTMLElement): void {
  try {
    const canvas = node.ownerDocument.createElement('canvas');
    if (typeof canvas.getContext !== 'function' || !canvas.getContext('2d')) {
      throw new Error('Canvas 2D context is unavailable');
    }
  } catch {
    throw new CardExportError('render-failed');
  }
}

async function readRenderedDimensions(blob: Blob, format: CardExportFormat): Promise<{ width: number; height: number }> {
  const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));

  if (format === 'png' && ascii(0, 8) === '\x89PNG\r\n\x1a\n' && ascii(12, 4) === 'IHDR') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (format === 'webp' && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (chunk === 'VP8 ' && ascii(23, 3) === '\x9d\x01\x2a') {
      return {
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
    }
  }

  throw new Error(`The browser returned an unreadable ${format.toUpperCase()} image.`);
}

function segmentNameGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

export function sanitizeCardExportName(name: string): string {
  const safe = name
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[\s.-]+|[\s.-]+$/gu, '')
    .replace(/[. ]+$/gu, '');
  const encoder = new TextEncoder();
  const bounded: string[] = [];
  let byteLength = 0;
  for (const grapheme of segmentNameGraphemes(safe)) {
    const graphemeBytes = encoder.encode(grapheme).length;
    if (bounded.length >= CARD_EXPORT_FILENAME_MAX_GRAPHEMES || byteLength + graphemeBytes > CARD_EXPORT_FILENAME_MAX_UTF8_BYTES) break;
    bounded.push(grapheme);
    byteLength += graphemeBytes;
  }
  return bounded.join('').replace(/[\s.-]+$/gu, '') || 'adventurer-card';
}

/** Keep instance-local SVG defs local when computed styles are serialized. */
export function preserveCardLocalSvgClip(cloned: Node): void {
  if (cloned.nodeType !== 1) return;
  const element = cloned as HTMLElement;
  const id = element.getAttribute('data-card-local-clip');
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !element.style) return;
  element.style.setProperty('clip-path', `url("#${id}")`);
  element.style.setProperty('-webkit-clip-path', `url("#${id}")`);
}

export function getCardExportFilename(
  name: string,
  ratio: CardRatio,
  scale: CardExportScale,
  format: CardExportFormat,
): string {
  const safeName = sanitizeCardExportName(name);
  const capLabel = getCardExportSize(ratio, scale).capped ? '-capped' : '';
  return `${safeName}-${ratio.replace(':', 'x')}-${scale}x${capLabel}.${format}`;
}

export function downloadCardBlob(blob: Blob, data: AdventurerCardData, format: CardExportFormat, scale: CardExportScale): void {
  let link: HTMLAnchorElement | undefined;
  let objectUrl: string | undefined;
  let recordRevocation: (() => void) | undefined;

  try {
    link = document.createElement('a');
    objectUrl = URL.createObjectURL(blob);
    recordRevocation = PERFORMANCE_PROFILING_ENABLED ? trackExportObjectUrl(blob) : undefined;
    link.href = objectUrl;
    link.download = getCardExportFilename(data.character.name, data.design.ratio, scale, format);
    document.body.appendChild(link);
    link.click();
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    recordRevocation?.();
    throw new CardExportError('download-failed');
  } finally {
    if (link) {
      try {
        link.remove();
      } catch {
        link.parentNode?.removeChild(link);
      }
    }
  }

  try {
    window.setTimeout(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      recordRevocation?.();
    }, CARD_EXPORT_URL_REVOKE_DELAY_MS);
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    recordRevocation?.();
  }
}

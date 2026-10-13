import type { AdventurerCardDesign } from '@/components/cards/types';
import {
  CARD_TEXTURE_EFFECTS,
  getCardTextureEffectIntensity,
  type CardTextureEffect,
  type CardTextureEffectIntensity,
} from '@/lib/card-texture-effects';
import type { PhotoPrintWorkerRequest, PhotoPrintWorkerResponse } from './photo-print.worker';

export type PhotoPrintRgb = readonly [number, number, number];

export const PHOTO_PRINT_MAX_SOURCE_EDGE = 4_096;
export const PHOTO_PRINT_MAX_SOURCE_PIXELS = 9_000_000;

const MAX_CACHE_ENTRIES = 6;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_QUEUED_JOBS = 8;
const WORKER_RESPONSE_TIMEOUT_MS = 60_000;

type PhotoPrintCacheEntry = {
  source: string;
  effectKey: string;
  blob: Blob;
};

type PhotoPrintConsumer = {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

type PhotoPrintJob = {
  source: string;
  effectKey: string;
  effects: CardTextureEffect[];
  intensity: Record<string, number>;
  paperRgb: PhotoPrintRgb;
  consumers: Set<PhotoPrintConsumer>;
  abortController: AbortController;
  state: 'queued' | 'preparing' | 'worker';
};

type PreparedPhotoPixels = {
  width: number;
  height: number;
  buffer: ArrayBuffer;
};

type ActiveWorkerRequest = {
  id: number;
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const processedPhotos = new Map<string, Map<string, PhotoPrintCacheEntry>>();
const jobsBySource = new Map<string, Map<string, PhotoPrintJob>>();
const leastRecentlyUsed: PhotoPrintCacheEntry[] = [];
const queuedJobs: PhotoPrintJob[] = [];
let cachedBytes = 0;
let activeJob: PhotoPrintJob | null = null;
let photoWorker: Worker | null = null;
let activeWorkerRequest: ActiveWorkerRequest | null = null;
let nextWorkerRequestId = 1;

export function getActivePhotoPrintEffects(
  effects: readonly string[],
  effectIntensity?: CardTextureEffectIntensity | Record<string, number>,
): CardTextureEffect[] {
  return CARD_TEXTURE_EFFECTS.filter((effect) => (
    effects.includes(effect) && getCardTextureEffectIntensity(effectIntensity, effect) > 0
  ));
}

export function getPhotoPrintEffectKey(
  effects: readonly string[],
  effectIntensity: CardTextureEffectIntensity | Record<string, number> | undefined,
  paperRgb: PhotoPrintRgb,
): string {
  const activeEffects = getActivePhotoPrintEffects(effects, effectIntensity);
  const effectStrengths = activeEffects.map((effect) => (
    `${effect}:${getCardTextureEffectIntensity(effectIntensity, effect)}`
  )).join(',');
  return `${effectStrengths || 'none'}|paper:${paperRgb.join(',')}`;
}

export function getPhotoPrintPaperContext(
  design: Pick<AdventurerCardDesign, 'template' | 'layoutVariant' | 'colorMode' | 'palette' | 'accentColor'>,
  jobIdentity = '',
): string {
  return JSON.stringify([
    design.template,
    design.layoutVariant,
    design.colorMode,
    jobIdentity,
    design.palette.primary,
    design.palette.accent,
    design.palette.light,
    design.palette.dark,
    design.accentColor,
  ]);
}

export function getPhotoPrintDimensions(sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  if (
    !Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) ||
    sourceWidth <= 0 || sourceHeight <= 0
  ) {
    throw new Error('The source photo has no usable dimensions.');
  }
  const scale = Math.min(
    1,
    PHOTO_PRINT_MAX_SOURCE_EDGE / Math.max(sourceWidth, sourceHeight),
    Math.sqrt(PHOTO_PRINT_MAX_SOURCE_PIXELS / (sourceWidth * sourceHeight)),
  );
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}

function getNested<T>(map: Map<string, Map<string, T>>, source: string, effectKey: string): T | undefined {
  return map.get(source)?.get(effectKey);
}

function setNested<T>(map: Map<string, Map<string, T>>, source: string, effectKey: string, value: T): void {
  let entries = map.get(source);
  if (!entries) {
    entries = new Map<string, T>();
    map.set(source, entries);
  }
  entries.set(effectKey, value);
}

function deleteNested<T>(map: Map<string, Map<string, T>>, source: string, effectKey: string): void {
  const entries = map.get(source);
  if (!entries) return;
  entries.delete(effectKey);
  if (entries.size === 0) map.delete(source);
}

function removeJobMapping(job: PhotoPrintJob): void {
  if (getNested(jobsBySource, job.source, job.effectKey) === job) {
    deleteNested(jobsBySource, job.source, job.effectKey);
  }
}

function touchCacheEntry(entry: PhotoPrintCacheEntry): void {
  const previousIndex = leastRecentlyUsed.findIndex((candidate) => (
    candidate.source === entry.source && candidate.effectKey === entry.effectKey
  ));
  if (previousIndex >= 0) leastRecentlyUsed.splice(previousIndex, 1);
  leastRecentlyUsed.push(entry);
}

function cachePhoto(source: string, effectKey: string, blob: Blob): void {
  if (blob.size > MAX_CACHE_BYTES) return;

  const previous = getNested(processedPhotos, source, effectKey);
  if (previous) {
    cachedBytes -= previous.blob.size;
    const previousIndex = leastRecentlyUsed.indexOf(previous);
    if (previousIndex >= 0) leastRecentlyUsed.splice(previousIndex, 1);
  }

  const entry: PhotoPrintCacheEntry = { source, effectKey, blob };
  setNested(processedPhotos, source, effectKey, entry);
  leastRecentlyUsed.push(entry);
  cachedBytes += blob.size;

  while (leastRecentlyUsed.length > MAX_CACHE_ENTRIES || cachedBytes > MAX_CACHE_BYTES) {
    const oldest = leastRecentlyUsed.shift();
    if (!oldest) break;
    if (getNested(processedPhotos, oldest.source, oldest.effectKey) !== oldest) continue;
    deleteNested(processedPhotos, oldest.source, oldest.effectKey);
    cachedBytes -= oldest.blob.size;
  }
}

function abortError(): Error {
  const error = new Error('Photo print processing was canceled.');
  error.name = 'AbortError';
  return error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('The photo print image could not be processed.');
}

function settleConsumers(job: PhotoPrintJob, error?: Error, blob?: Blob): void {
  for (const consumer of job.consumers) {
    if (consumer.signal && consumer.onAbort) {
      consumer.signal.removeEventListener('abort', consumer.onAbort);
    }
    if (error) consumer.reject(error);
    else if (blob) consumer.resolve(blob);
    else consumer.reject(new Error('The photo print worker returned no image.'));
  }
  job.consumers.clear();
}

function detachConsumer(job: PhotoPrintJob, consumer: PhotoPrintConsumer): void {
  if (!job.consumers.delete(consumer)) return;
  if (consumer.signal && consumer.onAbort) {
    consumer.signal.removeEventListener('abort', consumer.onAbort);
  }
  consumer.reject(abortError());

  if (job.consumers.size > 0) return;
  if (job.state === 'queued') {
    const queueIndex = queuedJobs.indexOf(job);
    if (queueIndex >= 0) queuedJobs.splice(queueIndex, 1);
    removeJobMapping(job);
    return;
  }
  if (job.state === 'preparing') {
    removeJobMapping(job);
    job.abortController.abort();
  }
  // A worker request cannot be interrupted. Its result is discarded unless
  // another card layer subscribes before it completes.
}

function addConsumer(job: PhotoPrintJob, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise<Blob>((resolve, reject) => {
    const consumer: PhotoPrintConsumer = { resolve, reject, signal };
    consumer.onAbort = () => detachConsumer(job, consumer);
    job.consumers.add(consumer);

    signal?.addEventListener('abort', consumer.onAbort, { once: true });
    if (signal?.aborted) consumer.onAbort();
  });
}

function loadDecodedImage(source: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const image = new Image();
    image.decoding = 'async';
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(image);
    };
    const onAbort = () => {
      image.src = '';
      finish(abortError());
    };
    const onLoad = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        finish(new Error('The source photo has no usable dimensions.'));
        return;
      }
      if (typeof image.decode === 'function') {
        image.decode().then(() => finish(), (error: unknown) => finish(asError(error)));
      } else {
        finish();
      }
    };

    image.onload = onLoad;
    image.onerror = () => finish(new Error('The source photo could not be loaded.'));
    signal.addEventListener('abort', onAbort, { once: true });
    image.src = source;
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) onLoad();
  });
}

async function preparePhotoPixels(job: PhotoPrintJob): Promise<PreparedPhotoPixels> {
  const signal = job.abortController.signal;
  const image = await loadDecodedImage(job.source, signal);
  if (signal.aborted) throw abortError();

  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const { width, height } = getPhotoPrintDimensions(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The browser could not create a photo canvas.');
    context.drawImage(image, 0, 0, width, height);
    if (signal.aborted) throw abortError();

    // A remote image without CORS permission will fail here. Keep the original
    // photo visible and let export report the failed print effect honestly.
    const pixels = context.getImageData(0, 0, width, height).data;
    const pixelBuffer = pixels.buffer;
    const buffer = pixelBuffer instanceof ArrayBuffer &&
      pixels.byteOffset === 0 &&
      pixels.byteLength === pixelBuffer.byteLength
      ? pixelBuffer
      : copyPhotoPixels(pixels);
    return { width, height, buffer };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function copyPhotoPixels(pixels: Uint8ClampedArray): ArrayBuffer {
  const buffer = new ArrayBuffer(pixels.byteLength);
  new Uint8Array(buffer).set(pixels);
  return buffer;
}

function getPhotoWorker(): Worker {
  if (photoWorker) return photoWorker;
  if (typeof Worker !== 'function') {
    const error = new Error('This browser cannot run the photo print worker.');
    failPhotoWorker(error);
    throw error;
  }

  try {
    const worker = new Worker(new URL('./photo-print.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PhotoPrintWorkerResponse>) => {
      const pending = activeWorkerRequest;
      if (!pending || event.data.id !== pending.id) return;
      activeWorkerRequest = null;
      clearTimeout(pending.timeout);

      if ('error' in event.data) {
        pending.reject(new Error(event.data.error || 'The photo print worker could not process this image.'));
        return;
      }
      if (event.data.blob.type !== 'image/png' || event.data.blob.size === 0) {
        pending.reject(new Error('The photo print worker returned an invalid PNG image.'));
        return;
      }
      pending.resolve(event.data.blob);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      failPhotoWorker(new Error('The photo print worker stopped unexpectedly.'));
    };
    worker.onmessageerror = () => failPhotoWorker(new Error('The photo print worker returned an unreadable result.'));
    photoWorker = worker;
    return worker;
  } catch (error) {
    const failure = new Error(error instanceof Error ? error.message : 'The photo print worker could not start.');
    failPhotoWorker(failure);
    throw failure;
  }
}

function failPhotoWorker(error: Error): void {
  const worker = photoWorker;
  photoWorker = null;
  worker?.terminate();
  if (activeJob) {
    removeJobMapping(activeJob);
    if (activeJob.state === 'preparing') activeJob.abortController.abort();
  }

  const pending = activeWorkerRequest;
  activeWorkerRequest = null;
  if (pending) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  for (const job of queuedJobs.splice(0)) {
    removeJobMapping(job);
    settleConsumers(job, error);
  }
}

function processPixelsInWorker(job: PhotoPrintJob, pixels: PreparedPhotoPixels, worker: Worker): Promise<Blob> {
  const id = nextWorkerRequestId++;
  const request: PhotoPrintWorkerRequest = {
    id,
    width: pixels.width,
    height: pixels.height,
    buffer: pixels.buffer,
    effects: [...job.effects],
    intensity: { ...job.intensity },
    paperRgb: [...job.paperRgb] as [number, number, number],
  };

  return new Promise<Blob>((resolve, reject) => {
    const timeout = setTimeout(() => {
      failPhotoWorker(new Error('Photo print processing took too long.'));
    }, WORKER_RESPONSE_TIMEOUT_MS);
    activeWorkerRequest = { id, resolve, reject, timeout };
    try {
      worker.postMessage(request, [request.buffer]);
    } catch (error) {
      failPhotoWorker(asError(error));
    }
  });
}

async function processPhotoJob(job: PhotoPrintJob): Promise<void> {
  try {
    if (job.consumers.size === 0) return;
    const worker = getPhotoWorker();
    const pixels = await preparePhotoPixels(job);
    if (job.consumers.size === 0 || job.abortController.signal.aborted) return;

    job.state = 'worker';
    const blob = await processPixelsInWorker(job, pixels, worker);
    if (job.consumers.size > 0) {
      cachePhoto(job.source, job.effectKey, blob);
      settleConsumers(job, undefined, blob);
    }
  } catch (error) {
    if (job.consumers.size > 0) settleConsumers(job, asError(error));
  } finally {
    removeJobMapping(job);
    if (activeJob === job) activeJob = null;
    pumpPhotoQueue();
  }
}

function pumpPhotoQueue(): void {
  if (activeJob) return;

  let next = queuedJobs.shift();
  while (next && next.consumers.size === 0) {
    removeJobMapping(next);
    next = queuedJobs.shift();
  }
  if (!next) return;

  activeJob = next;
  next.state = 'preparing';
  void processPhotoJob(next);
}

export function loadPhotoPrintBlob(
  source: string,
  effects: readonly string[],
  effectIntensity: CardTextureEffectIntensity | Record<string, number> | undefined,
  paperRgb: PhotoPrintRgb,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(abortError());

  const effectKey = getPhotoPrintEffectKey(effects, effectIntensity, paperRgb);
  const cached = getNested(processedPhotos, source, effectKey);
  if (cached) {
    touchCacheEntry(cached);
    return Promise.resolve(cached.blob);
  }

  const activeEffects = getActivePhotoPrintEffects(effects, effectIntensity);
  if (activeEffects.length === 0) {
    return Promise.reject(new Error('No photo print effects are enabled.'));
  }

  let job = getNested(jobsBySource, source, effectKey);
  if (!job) {
    if (queuedJobs.length >= MAX_QUEUED_JOBS) {
      return Promise.reject(new Error('The photo print queue is full.'));
    }

    const intensity = Object.fromEntries(activeEffects.map((effect) => (
      [effect, getCardTextureEffectIntensity(effectIntensity, effect)]
    )));
    job = {
      source,
      effectKey,
      effects: activeEffects,
      intensity,
      paperRgb,
      consumers: new Set<PhotoPrintConsumer>(),
      abortController: new AbortController(),
      state: 'queued',
    };
    setNested(jobsBySource, source, effectKey, job);
    queuedJobs.push(job);
  }

  const result = addConsumer(job, signal);
  pumpPhotoQueue();
  return result;
}

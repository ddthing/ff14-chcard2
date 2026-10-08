import { DEFAULT_CARD_PALETTE, extractPaletteFromImage, type CardPalette } from './palette';

export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type ImageProcessingTimingStage = 'header' | 'decode' | 'palette' | 'draw' | 'encode-jpeg' | 'encode-png' | 'encode-webp' | 'data-url-convert';

export interface ImageProcessingOptions {
  /** Longest stored source edge. The browser downsizes before saving to local storage. */
  maxDimension?: number;
  /** Maximum accepted input file size. The hard product limit is 24 MiB. */
  maxInputBytes?: number;
  /** Maximum encoded data URL length, to leave room for card data in localStorage. */
  maxDataUrlCharacters?: number;
  /** JPEG/WebP quality in the 0–1 range. PNG is lossless and ignores this. */
  quality?: number;
  /** Smallest permitted longest edge while fitting the localStorage budget. */
  minDimension?: number;
  /** Aborts header reading, decoding, or work between canvas operations. */
  signal?: AbortSignal;
  /** Optional measurement-only callback. Callback failures never change image processing. */
  onTiming?: (stage: ImageProcessingTimingStage, durationMs: number) => void;
}

export interface PreparedImage {
  /** Data URL suitable for immediate preview and simple localStorage persistence. */
  imageUrl: string;
  width: number;
  height: number;
  /** Actual encoded type; browsers may fall back to PNG if an encoder is missing. */
  mimeType: SupportedImageMimeType;
  sourceMimeType: SupportedImageMimeType;
  fileName: string;
  palette: CardPalette;
}

export type ImageProcessingErrorCode =
  | 'unsupported'
  | 'invalid-image'
  | 'input-too-large'
  | 'decode-failed'
  | 'processing-timeout'
  | 'cancelled'
  | 'storage-budget'
  | 'canvas-unavailable';

export class ImageProcessingError extends Error {
  readonly code: ImageProcessingErrorCode;

  constructor(code: ImageProcessingErrorCode, message: string) {
    super(message);
    this.name = 'ImageProcessingError';
    this.code = code;
  }
}

export function isImageProcessingCancelled(error: unknown): boolean {
  return error instanceof ImageProcessingError && error.code === 'cancelled';
}

export const IMAGE_PROCESSING_LIMITS = {
  maxInputBytes: 24 * 1024 * 1024,
  maxHeaderBytes: 512 * 1024,
  maxHeaderReadMs: 5_000,
  maxDecodeMs: 20_000,
  maxEncodeMs: 20_000,
  maxDataUrlReadMs: 10_000,
  maxSourceEdge: 16_384,
  maxSourcePixels: 50_000_000,
  maxOutputEdge: 4_096,
} as const;

const DEFAULT_OPTIONS: Required<Omit<ImageProcessingOptions, 'signal' | 'onTiming'>> = {
  maxDimension: 2560,
  maxInputBytes: IMAGE_PROCESSING_LIMITS.maxInputBytes,
  maxDataUrlCharacters: 1_750_000,
  quality: 0.9,
  minDimension: 640,
};

function beginStageTiming(options: ImageProcessingOptions): number | null {
  if (!options.onTiming) return null;
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function endStageTiming(options: ImageProcessingOptions, stage: ImageProcessingTimingStage, startedAt: number | null): void {
  if (startedAt === null || !options.onTiming) return;
  const endedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
  try { options.onTiming(stage, Math.max(0, endedAt - startedAt)); } catch { /* profiling must not alter processing */ }
}

function encodeStage(mimeType: SupportedImageMimeType): ImageProcessingTimingStage {
  if (mimeType === 'image/jpeg') return 'encode-jpeg';
  if (mimeType === 'image/webp') return 'encode-webp';
  return 'encode-png';
}

export interface ImageHeader {
  mimeType: SupportedImageMimeType;
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const UNSUPPORTED_ISO_BMFF_IMAGE_BRANDS = new Set([
  'avif', 'avis',
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'mif2', 'msf1',
]);
const HEIF_MIME_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

function matchesBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function matchesAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
  return [...expected].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function isUnsupportedIsoBmffImage(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || !matchesAscii(bytes, 4, 'ftyp')) return false;

  const hasKnownBrandAt = (offset: number) => UNSUPPORTED_ISO_BMFF_IMAGE_BRANDS.has(
    String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]),
  );
  if (hasKnownBrandAt(8)) return true;

  // HEIF files can use a generic major brand such as `mif1` and list the
  // HEIC/HEIF codec in the compatible-brand array after the minor version.
  if (bytes.length < 20) return false;
  const boxLength = uint32be(bytes, 0);
  const boxEnd = Math.min(bytes.length, boxLength);
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    if (hasKnownBrandAt(offset)) return true;
  }
  return false;
}

function uint32be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function uint32le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function hasPartialSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length >= signature.length) return false;
  return bytes.every((value, index) => value === signature[index]);
}

function invalidImage(message = 'The selected file is not a valid image.'): never {
  throw new ImageProcessingError('invalid-image', message);
}

/**
 * Reads actual format and dimensions from a bounded file prefix. File names and
 * browser MIME labels are deliberately ignored because both can be inaccurate.
 */
/** Inspect a bounded file prefix while validating container bounds against the full source size. */
export function inspectImageHeader(bytes: Uint8Array, sourceSize = bytes.length): ImageHeader {
  if (bytes.length === 0) invalidImage('The selected image file is empty.');
  if (!Number.isSafeInteger(sourceSize) || sourceSize < bytes.length) invalidImage('The image header is incomplete or damaged.');

  if (matchesBytes(bytes, 0, PNG_SIGNATURE)) {
    if (bytes.length < 24 || uint32be(bytes, 8) !== 13 || !matchesAscii(bytes, 12, 'IHDR')) {
      invalidImage();
    }
    return { mimeType: 'image/png', width: uint32be(bytes, 16), height: uint32be(bytes, 20) };
  }
  if (hasPartialSignature(bytes, PNG_SIGNATURE)) invalidImage();

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return { mimeType: 'image/jpeg', ...readJpegDimensions(bytes) };
  }

  if (matchesAscii(bytes, 0, 'RIFF')) {
    if (bytes.length < 12) invalidImage();
    if (!matchesAscii(bytes, 8, 'WEBP')) {
      throw new ImageProcessingError('unsupported', 'Choose a JPG, PNG, or WebP image.');
    }
    return { mimeType: 'image/webp', ...readWebpDimensions(bytes, sourceSize) };
  }

  if (
    matchesAscii(bytes, 0, 'GIF87a')
    || matchesAscii(bytes, 0, 'GIF89a')
    || matchesAscii(bytes, 0, 'BM')
    || matchesBytes(bytes, 0, [0x49, 0x49, 0x2a, 0x00])
    || matchesBytes(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])
    || isUnsupportedIsoBmffImage(bytes)
  ) {
    throw new ImageProcessingError('unsupported', 'Choose a JPG, PNG, or WebP image.');
  }

  invalidImage();
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) invalidImage();
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) invalidImage();

    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) invalidImage();
    if (offset + 2 > bytes.length) invalidImage();

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) invalidImage();

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) invalidImage();
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }

    offset += segmentLength;
  }
  invalidImage('The image header is incomplete or damaged.');
}

function readWebpDimensions(bytes: Uint8Array, sourceSize: number): { width: number; height: number } {
  if (bytes.length < 12) invalidImage('The image header is incomplete or damaged.');
  const riffEnd = uint32le(bytes, 4) + 8;
  if (riffEnd < 12 || riffEnd > sourceSize) invalidImage('The image header is incomplete or damaged.');

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = uint32le(bytes, offset + 4);
    const data = offset + 8;
    if (chunkLength > riffEnd - data) invalidImage('The image header is incomplete or damaged.');

    if (matchesAscii(bytes, offset, 'VP8X')) {
      if (chunkLength < 10 || data + 10 > bytes.length) invalidImage();
      return {
        width: 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16),
        height: 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16),
      };
    }
    if (matchesAscii(bytes, offset, 'VP8L')) {
      if (chunkLength < 5 || data + 5 > bytes.length || bytes[data] !== 0x2f) invalidImage();
      return {
        width: 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8),
        height: 1 + (bytes[data + 2] >> 6) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 0x0f) << 10),
      };
    }
    if (matchesAscii(bytes, offset, 'VP8 ')) {
      if (chunkLength < 10 || data + 10 > bytes.length || !matchesBytes(bytes, data + 3, [0x9d, 0x01, 0x2a])) invalidImage();
      return {
        width: ((bytes[data + 7] << 8) | bytes[data + 6]) & 0x3fff,
        height: ((bytes[data + 9] << 8) | bytes[data + 8]) & 0x3fff,
      };
    }

    // Dimensions in a recognized frame header need only a short prefix. For
    // unknown chunks, keep the existing bounded-read rule before skipping.
    if (chunkLength > bytes.length - data) invalidImage('The image header is incomplete or damaged.');
    offset = data + chunkLength + (chunkLength % 2);
  }
  invalidImage('The image header is incomplete or damaged.');
}

export function assertSafeImageDimensions(width: number, height: number): void {
  const pixelCount = width * height;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    invalidImage('The image has invalid dimensions.');
  }
  if (
    width > IMAGE_PROCESSING_LIMITS.maxSourceEdge
    || height > IMAGE_PROCESSING_LIMITS.maxSourceEdge
    || !Number.isSafeInteger(pixelCount)
    || pixelCount > IMAGE_PROCESSING_LIMITS.maxSourcePixels
  ) {
    throw new ImageProcessingError('input-too-large', 'The image dimensions are too large to process safely.');
  }
}

function resolveOptions(options: ImageProcessingOptions): Required<Omit<ImageProcessingOptions, 'signal' | 'onTiming'>> {
  const maxDimension = boundedInteger(options.maxDimension, DEFAULT_OPTIONS.maxDimension, 320, IMAGE_PROCESSING_LIMITS.maxOutputEdge);
  return {
    maxDimension,
    maxInputBytes: boundedInteger(options.maxInputBytes, DEFAULT_OPTIONS.maxInputBytes, 1, IMAGE_PROCESSING_LIMITS.maxInputBytes),
    maxDataUrlCharacters: boundedInteger(options.maxDataUrlCharacters, DEFAULT_OPTIONS.maxDataUrlCharacters, 100_000, DEFAULT_OPTIONS.maxDataUrlCharacters),
    quality: Number.isFinite(options.quality)
      ? Math.max(0.5, Math.min(1, options.quality as number))
      : DEFAULT_OPTIONS.quality,
    minDimension: boundedInteger(options.minDimension, DEFAULT_OPTIONS.minDimension, 320, IMAGE_PROCESSING_LIMITS.maxOutputEdge),
  };
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  const number = Number.isFinite(value) ? Math.round(value as number) : fallback;
  return Math.max(min, Math.min(max, number));
}

function createCancelledError(): ImageProcessingError {
  return new ImageProcessingError('cancelled', 'Image preparation was cancelled.');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createCancelledError();
}

function waitForBounded<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  signal?: AbortSignal,
  timeoutCode: ImageProcessingErrorCode = 'decode-failed',
): Promise<T> {
  if (signal?.aborted) return Promise.reject(createCancelledError());

  return new Promise<T>((resolve, reject) => {
    let complete = false;
    const finish = (successful: boolean, value: T | Error) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (successful) resolve(value as T);
      else reject(value);
    };
    const onAbort = () => finish(false, createCancelledError());
    const timer = setTimeout(() => {
      finish(false, new ImageProcessingError(timeoutCode, timeoutMessage));
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => finish(true, value),
      (error: unknown) => finish(false, error instanceof Error ? error : new Error(timeoutMessage)),
    );
  });
}

function readHeaderBytes(file: File, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal);
  const headerBlob = file.slice(0, IMAGE_PROCESSING_LIMITS.maxHeaderBytes);
  if (typeof FileReader === 'undefined') {
    const read = headerBlob.arrayBuffer();
    return waitForBounded(read, IMAGE_PROCESSING_LIMITS.maxHeaderReadMs, 'The image could not be read in time.', signal)
      .then((buffer) => new Uint8Array(buffer));
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    let complete = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reader.removeEventListener('load', onLoad);
      reader.removeEventListener('error', onError);
      reader.removeEventListener('abort', onReaderAbort);
    };
    const finish = (successful: boolean, value: Uint8Array | Error) => {
      if (complete) return;
      complete = true;
      cleanup();
      if (successful) resolve(value as Uint8Array);
      else reject(value);
    };
    const abortReader = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
    const onAbort = () => {
      finish(false, createCancelledError());
      abortReader();
    };
    const onLoad = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        finish(false, new ImageProcessingError('decode-failed', 'The image could not be read.'));
        return;
      }
      finish(true, new Uint8Array(reader.result));
    };
    const onError = () => finish(false, new ImageProcessingError('decode-failed', 'The image could not be read.'));
    const onReaderAbort = () => finish(false, createCancelledError());
    const timer = setTimeout(() => {
      finish(false, new ImageProcessingError('decode-failed', 'The image took too long to read.'));
      abortReader();
    }, IMAGE_PROCESSING_LIMITS.maxHeaderReadMs);

    reader.addEventListener('load', onLoad, { once: true });
    reader.addEventListener('error', onError, { once: true });
    reader.addEventListener('abort', onReaderAbort, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      reader.readAsArrayBuffer(headerBlob);
    } catch {
      finish(false, new ImageProcessingError('decode-failed', 'The image could not be read.'));
    }
  });
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function normalizeDecodeError(error: unknown): ImageProcessingError {
  if (error instanceof ImageProcessingError) return error;
  return new ImageProcessingError('decode-failed', 'The selected image could not be decoded.');
}

async function decodeImage(file: File, signal?: AbortSignal): Promise<DecodedImage> {
  throwIfAborted(signal);
  if (typeof createImageBitmap === 'function') {
    const bitmapPromise = Promise.resolve().then(() => createImageBitmap(file));
    try {
      const bitmap = await waitForBounded(
        bitmapPromise,
        IMAGE_PROCESSING_LIMITS.maxDecodeMs,
        'The image took too long to decode.',
        signal,
      );
      let released = false;
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => {
          if (released) return;
          released = true;
          bitmap.close();
        },
      };
    } catch (error) {
      const normalized = normalizeDecodeError(error);
      if (normalized.code === 'cancelled' || normalized.message === 'The image took too long to decode.') {
        void bitmapPromise.then((bitmap) => bitmap.close(), () => undefined);
        throw normalized;
      }
      // A few browser decoders support Image elements more reliably than ImageBitmap.
    }
  }

  throwIfAborted(signal);
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new ImageProcessingError('decode-failed', 'Image processing requires a browser.');
  }

  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(file);
  } catch {
    throw new ImageProcessingError('decode-failed', 'The selected image could not be decoded.');
  }
  const image = new Image();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    image.onload = null;
    image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(objectUrl);
  };

  try {
    image.decoding = 'async';
    const decodedPromise = typeof image.decode === 'function'
      ? Promise.resolve().then(() => image.decode())
      : new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Could not decode image.'));
      });
    image.src = objectUrl;
    await waitForBounded(decodedPromise, IMAGE_PROCESSING_LIMITS.maxDecodeMs, 'The image took too long to decode.', signal);
    throwIfAborted(signal);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) invalidImage('The image has invalid dimensions.');
    return { source: image, width, height, release };
  } catch (error) {
    release();
    throw normalizeDecodeError(error);
  }
}

function getActualMimeType(dataUrl: string): SupportedImageMimeType | null {
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';')).toLowerCase();
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp'
    ? mimeType
    : null;
}

function getTargetDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: SupportedImageMimeType,
  quality: number,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  if (typeof canvas.toBlob !== 'function') {
    return Promise.reject(new ImageProcessingError('canvas-unavailable', 'Your browser could not encode the image.'));
  }

  return new Promise<Blob>((resolve, reject) => {
    let complete = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (successful: boolean, value: Blob | Error) => {
      if (complete) return;
      complete = true;
      cleanup();
      if (successful) resolve(value as Blob);
      else reject(value);
    };
    const onAbort = () => finish(false, createCancelledError());
    const timer = setTimeout(() => finish(false, new ImageProcessingError('processing-timeout', 'Image processing took too long. Please try again.')), IMAGE_PROCESSING_LIMITS.maxEncodeMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      canvas.toBlob((blob) => {
        // Encoding cannot be cancelled by the browser API. Once this promise
        // has timed out or been aborted, a late callback is deliberately inert.
        if (complete) return;
        if (!blob) {
          finish(false, new ImageProcessingError('canvas-unavailable', 'Your browser could not encode the image.'));
          return;
        }
        finish(true, blob);
      }, mimeType, quality);
    } catch {
      finish(false, new ImageProcessingError('canvas-unavailable', 'Your browser could not encode the image.'));
    }
  });
}

function base64FromBytes(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    encoded += second === undefined ? '=' : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    encoded += third === undefined ? '=' : alphabet[third & 0x3f];
  }
  return encoded;
}

function blobToDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  if (typeof FileReader === 'undefined') {
    const read = blob.arrayBuffer();
    return waitForBounded(read, IMAGE_PROCESSING_LIMITS.maxDataUrlReadMs, 'Image processing took too long. Please try again.', signal, 'processing-timeout')
      .then((buffer) => `data:${blob.type};base64,${base64FromBytes(new Uint8Array(buffer))}`);
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    let complete = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reader.removeEventListener('load', onLoad);
      reader.removeEventListener('error', onError);
      reader.removeEventListener('abort', onReaderAbort);
    };
    const finish = (successful: boolean, value: string | Error) => {
      if (complete) return;
      complete = true;
      cleanup();
      if (successful) resolve(value as string);
      else reject(value);
    };
    const abortReader = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
    const onAbort = () => {
      finish(false, createCancelledError());
      abortReader();
    };
    const onLoad = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
        finish(false, new ImageProcessingError('canvas-unavailable', 'Your browser could not read the encoded image.'));
        return;
      }
      finish(true, reader.result);
    };
    const onError = () => finish(false, new ImageProcessingError('canvas-unavailable', 'Your browser could not read the encoded image.'));
    const onReaderAbort = () => finish(false, createCancelledError());
    const timer = setTimeout(() => {
      finish(false, new ImageProcessingError('processing-timeout', 'Image processing took too long. Please try again.'));
      abortReader();
    }, IMAGE_PROCESSING_LIMITS.maxDataUrlReadMs);

    reader.addEventListener('load', onLoad, { once: true });
    reader.addEventListener('error', onError, { once: true });
    reader.addEventListener('abort', onReaderAbort, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      reader.readAsDataURL(blob);
    } catch {
      finish(false, new ImageProcessingError('canvas-unavailable', 'Your browser could not read the encoded image.'));
    }
  });
}

async function encodeCanvasDataUrl(
  canvas: HTMLCanvasElement,
  mimeType: SupportedImageMimeType,
  quality: number,
  options: ImageProcessingOptions,
): Promise<string> {
  const encodeStartedAt = beginStageTiming(options);
  let blob: Blob;
  try {
    blob = await canvasToBlob(canvas, mimeType, quality, options.signal);
  } finally {
    endStageTiming(options, encodeStage(mimeType), encodeStartedAt);
  }

  const conversionStartedAt = beginStageTiming(options);
  try {
    return await blobToDataUrl(blob, options.signal);
  } finally {
    endStageTiming(options, 'data-url-convert', conversionStartedAt);
  }
}

/**
 * Decodes JPG/PNG/WebP in the browser, caps source and stored dimensions,
 * extracts a card palette, and returns a compact data URL for preview/storage.
 */
export async function prepareImageFile(file: File, options: ImageProcessingOptions = {}): Promise<PreparedImage> {
  const resolvedOptions = resolveOptions(options);
  const { signal } = options;
  throwIfAborted(signal);

  if (file.size === 0) invalidImage('The selected image file is empty.');
  if (file.size > resolvedOptions.maxInputBytes) {
    throw new ImageProcessingError('input-too-large', 'The selected image is larger than the upload limit.');
  }

  const headerStartedAt = beginStageTiming(options);
  let header: ImageHeader;
  try {
    const headerBytes = await readHeaderBytes(file, signal);
    try {
      header = inspectImageHeader(headerBytes, file.size);
    } catch (error) {
      const mimeType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
      if (error instanceof ImageProcessingError && error.code === 'invalid-image' && HEIF_MIME_TYPES.has(mimeType)) {
        throw new ImageProcessingError('unsupported', 'HEIC/HEIF images are not supported. Convert the photo to JPG or choose PNG or WebP.');
      }
      throw error;
    }
    assertSafeImageDimensions(header.width, header.height);
  } finally {
    endStageTiming(options, 'header', headerStartedAt);
  }
  throwIfAborted(signal);
  if (typeof document === 'undefined') {
    throw new ImageProcessingError('decode-failed', 'Image processing requires a browser.');
  }

  const decodeStartedAt = beginStageTiming(options);
  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file, signal);
  } finally {
    endStageTiming(options, 'decode', decodeStartedAt);
  }
  let canvas: HTMLCanvasElement | null = null;
  try {
    assertSafeImageDimensions(decoded.width, decoded.height);
    throwIfAborted(signal);

    let currentMaxDimension = Math.min(resolvedOptions.maxDimension, Math.max(decoded.width, decoded.height));
    const minimumDimension = Math.min(resolvedOptions.minDimension, currentMaxDimension);
    let context: CanvasRenderingContext2D | null;
    try {
      canvas = document.createElement('canvas');
      context = canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      throw new ImageProcessingError('canvas-unavailable', 'Your browser could not prepare the image.');
    }
    if (!context) throw new ImageProcessingError('canvas-unavailable', 'Your browser could not prepare the image.');

    let imageUrl = '';
    let dimensions = getTargetDimensions(decoded.width, decoded.height, currentMaxDimension);
    let mimeType: SupportedImageMimeType = header.mimeType;
    let palette: CardPalette;
    const paletteStartedAt = beginStageTiming(options);
    try {
      palette = extractPaletteFromImage(decoded.source);
    } catch {
      palette = { ...DEFAULT_CARD_PALETTE };
    } finally {
      endStageTiming(options, 'palette', paletteStartedAt);
    }

    while (true) {
      throwIfAborted(signal);
      dimensions = getTargetDimensions(decoded.width, decoded.height, currentMaxDimension);
      try {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const drawStartedAt = beginStageTiming(options);
        try {
          context.clearRect(0, 0, dimensions.width, dimensions.height);
          context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
        } finally {
          endStageTiming(options, 'draw', drawStartedAt);
        }

        imageUrl = await encodeCanvasDataUrl(canvas, header.mimeType, resolvedOptions.quality, options);
        mimeType = getActualMimeType(imageUrl) ?? 'image/png';
        if (imageUrl.length > resolvedOptions.maxDataUrlCharacters && header.mimeType === 'image/png') {
          // WebP keeps transparency and often stores screenshots in less space.
          const webpDataUrl = await encodeCanvasDataUrl(canvas, 'image/webp', resolvedOptions.quality, options);
          if (webpDataUrl.length < imageUrl.length) {
            imageUrl = webpDataUrl;
            mimeType = getActualMimeType(webpDataUrl) ?? 'image/png';
          }
        }
      } catch (error) {
        if (error instanceof ImageProcessingError) throw error;
        throw new ImageProcessingError('canvas-unavailable', 'Your browser could not prepare the image.');
      }

      if (!imageUrl.startsWith('data:image/') || imageUrl.length <= 20) {
        throw new ImageProcessingError('canvas-unavailable', 'Your browser could not prepare the image.');
      }
      if (imageUrl.length <= resolvedOptions.maxDataUrlCharacters) break;
      if (currentMaxDimension <= minimumDimension) {
        throw new ImageProcessingError('storage-budget', 'This image is still too large to save in the current browser storage budget.');
      }
      currentMaxDimension = Math.max(minimumDimension, Math.floor(currentMaxDimension * 0.8));
    }

    throwIfAborted(signal);
    return {
      imageUrl,
      width: dimensions.width,
      height: dimensions.height,
      mimeType,
      sourceMimeType: header.mimeType,
      fileName: file.name,
      palette,
    };
  } finally {
    try {
      decoded.release();
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }
}

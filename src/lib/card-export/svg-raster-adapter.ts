/*
 * PNG density chunk code is adapted from modern-screenshot 4.7.0 (dist/index.mjs).
 * Copyright (c) 2021-present wxm.
 *
 * The MIT License (MIT)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
export interface SvgRasterContext {
  width: number;
  height: number;
  scale: number;
  quality: number;
  type: string;
  backgroundColor: string | null;
  maximumCanvasSize: number;
  timeout: number;
  dpi: number | null;
  drawImageCount: number;
  drawImageInterval: number;
  isEnable: (feature: string) => boolean;
}

export interface SvgRasterAdapterOptions {
  document: Document;
  signal?: AbortSignal;
  timeoutMs: number;
  cancelledError: () => Error;
  timeoutError: () => Error;
  loadMedia?: (image: HTMLImageElement, timeoutMs: number) => Promise<HTMLImageElement>;
  serialize?: (svg: SVGElement) => string;
  createFileReader?: () => FileReader;
  yieldToTask?: () => Promise<void>;
  now?: () => number;
  chunkSize?: number;
  onTiming?: (stage: string, durationMs: number, detail?: Record<string, string | number | boolean | null>) => void;
  isNonFallbackError?: (error: unknown) => boolean;
}

export class SvgRasterAdapterError extends Error {
  readonly canFallback: boolean;

  constructor(cause: unknown, canFallback: boolean) {
    super(
      canFallback
        ? 'The staged SVG raster adapter failed before producing an export Blob'
        : 'The staged SVG raster adapter failed after producing a raster Blob',
      { cause },
    );
    this.name = 'SvgRasterAdapterError';
    this.canFallback = canFallback;
  }
}

const SVG_MIME_TYPE = 'image/svg+xml;charset=utf-8';
const DEFAULT_XML_CHUNK_SIZE = 128 * 1024;
const XML_YIELD_BUDGET_MS = 8;

/** Uses a preflight only so unsupported browsers can keep the renderer's normal path. */
export function canUseSvgRasterAdapter(document: Document): boolean {
  const view = document.defaultView;
  if (!view || typeof view.XMLSerializer !== 'function' || typeof view.FileReader !== 'function') return false;

  try {
    const canvas = document.createElement('canvas');
    return typeof canvas.toBlob === 'function' && typeof canvas.getContext === 'function';
  } catch {
    return false;
  }
}

/** Serializes once, removes the same invalid XML code units as modern-screenshot, then uses native base64 encoding. */
export async function serializeSvgToDataUrl(
  svg: SVGElement,
  options: Pick<SvgRasterAdapterOptions, 'document' | 'signal' | 'cancelledError' | 'timeoutError' | 'serialize' | 'createFileReader' | 'yieldToTask' | 'now' | 'chunkSize' | 'onTiming'> & { timeoutMs: number },
): Promise<string> {
  throwIfAborted(options.signal, options.cancelledError);
  const now = options.now ?? (() => performance.now());
  const serializeStartedAt = now();
  const source = options.serialize
    ? options.serialize(svg)
    : new (options.document.defaultView?.XMLSerializer ?? XMLSerializer)().serializeToString(svg);
  options.onTiming?.('svg.serialize', now() - serializeStartedAt, { characterCount: source.length });
  throwIfAborted(options.signal, options.cancelledError);

  const sanitizeStartedAt = now();
  const parts = await sanitizeXmlChunks(source, options);
  const svgBlob = new Blob(parts, { type: SVG_MIME_TYPE });
  options.onTiming?.('svg.sanitize', now() - sanitizeStartedAt, {
    characterCount: source.length,
    partCount: parts.length,
  });
  throwIfAborted(options.signal, options.cancelledError);

  const readStartedAt = now();
  const dataUrl = await readBlobAsDataUrl(svgBlob, options);
  options.onTiming?.('svg.base64', now() - readStartedAt, { blobBytes: svgBlob.size });
  throwIfAborted(options.signal, options.cancelledError);
  return dataUrl;
}

async function sanitizeXmlChunks(
  source: string,
  options: Pick<SvgRasterAdapterOptions, 'signal' | 'cancelledError' | 'yieldToTask' | 'now' | 'chunkSize'>,
): Promise<string[]> {
  const chunkSize = Math.max(2, Math.floor(options.chunkSize ?? DEFAULT_XML_CHUNK_SIZE));
  const yieldToTask = options.yieldToTask ?? yieldToBrowserTask;
  const now = options.now ?? (() => performance.now());
  let lastYieldAt = now();
  const parts: string[] = [];

  for (let start = 0; start < source.length;) {
    throwIfAborted(options.signal, options.cancelledError);
    let end = Math.min(start + chunkSize, source.length);
    // Keep a valid UTF-16 pair together so a chunk boundary cannot make it look unpaired.
    if (
      end < source.length &&
      isHighSurrogate(source.charCodeAt(end - 1)) &&
      isLowSurrogate(source.charCodeAt(end))
    ) end -= 1;

    let partStart = start;
    let cleaned: string[] | null = null;
    for (let index = start; index < end; index += 1) {
      const code = source.charCodeAt(index);
      if (isHighSurrogate(code)) {
        if (index + 1 < end && isLowSurrogate(source.charCodeAt(index + 1))) {
          index += 1;
          continue;
        }
        cleaned ??= [];
        cleaned.push(source.slice(partStart, index));
        partStart = index + 1;
      } else if (isLowSurrogate(code) || isXmlControlToRemove(code)) {
        cleaned ??= [];
        cleaned.push(source.slice(partStart, index));
        partStart = index + 1;
      }
    }

    if (cleaned) {
      cleaned.push(source.slice(partStart, end));
      parts.push(cleaned.join(''));
    } else {
      parts.push(source.slice(start, end));
    }

    start = end;
    if (start < source.length && now() - lastYieldAt >= XML_YIELD_BUDGET_MS) {
      await yieldToTask();
      lastYieldAt = now();
    }
  }

  throwIfAborted(options.signal, options.cancelledError);
  return parts;
}

function yieldToBrowserTask(): Promise<void> {
  const browserScheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<unknown> } }).scheduler;
  if (typeof browserScheduler?.yield === 'function') return browserScheduler.yield().then(() => undefined);
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function isXmlControlToRemove(code: number): boolean {
  return code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || code === 0xfffe || code === 0xffff;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

type FileReaderFactoryOptions = Pick<SvgRasterAdapterOptions, 'document' | 'signal' | 'cancelledError' | 'timeoutError' | 'createFileReader'> & { timeoutMs: number };

function throwIfAborted(signal: AbortSignal | undefined, cancelledError: () => Error): void {
  if (signal?.aborted) throw cancelledError();
}

export async function rasterizeForeignObjectSvg(
  svg: SVGElement,
  context: SvgRasterContext,
  options: SvgRasterAdapterOptions,
): Promise<Blob> {
  const { document, signal, cancelledError } = options;
  const now = options.now ?? (() => performance.now());
  let canvasBlobCreated = false;
  let image: HTMLImageElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let rasterContext: CanvasRenderingContext2D | null = null;
  let imageAbortListener: (() => void) | undefined;
  try {
    throwIfAborted(signal, cancelledError);
    let dataUrl = await serializeSvgToDataUrl(svg, options);
    // The SVG tree is only needed until its serialized image is ready; it can
    // contain large embedded image/font payloads, so release the clone now.
    if (typeof svg.replaceChildren === 'function') svg.replaceChildren();
    throwIfAborted(signal, cancelledError);

    const createdImage = document.createElement('img');
    image = createdImage;
    createdImage.decoding = 'sync';
    createdImage.loading = 'eager';
    createdImage.src = dataUrl;
    const loadStartedAt = now();
    const loaded = options.loadMedia
      ? await waitForImageWithAbort(createdImage, options.loadMedia, options.timeoutMs, signal, cancelledError, () => createdImage.removeAttribute('src'))
      : await waitForImage(createdImage, options.timeoutMs, signal, cancelledError);
    imageAbortListener = loaded.abortListener;
    options.onTiming?.('svg.imageDecode', now() - loadStartedAt);
    throwIfAborted(signal, cancelledError);

    const canvasStartedAt = now();
    canvas = createCanvas(document, context);
    rasterContext = canvas.getContext('2d');
    if (!rasterContext) throw new Error('Canvas 2D context is unavailable');
    rasterContext.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (context.isEnable('fixSvgXmlDecode')) {
      for (let index = 0; index < context.drawImageCount; index += 1) {
        await waitForRasterTimer(index + context.drawImageInterval, signal, cancelledError);
        throwIfAborted(signal, cancelledError);
        rasterContext.clearRect(0, 0, canvas.width, canvas.height);
        rasterContext.drawImage(image, 0, 0, canvas.width, canvas.height);
      }
    }
    context.drawImageCount = 0;
    if (imageAbortListener) signal?.removeEventListener('abort', imageAbortListener);
    imageAbortListener = undefined;
    image.removeAttribute('src');
    dataUrl = '';

    throwIfAborted(signal, cancelledError);
    let blob = await canvasToBlob(canvas, context.type, context.quality);
    canvasBlobCreated = true;
    if (signal?.aborted) throw cancelledError();
    if (context.type === 'image/png' && context.dpi) {
      blob = await addPngDpiMetadata(blob, context.dpi);
    }
    options.onTiming?.('svg.canvasRaster', now() - canvasStartedAt, {
      width: canvas.width,
      height: canvas.height,
      blobBytes: blob.size,
    });
    throwIfAborted(signal, cancelledError);
    return blob;
  } catch (error) {
    if (signal?.aborted || options.isNonFallbackError?.(error)) throw error;
    if (error instanceof SvgRasterAdapterError) throw error;
    throw new SvgRasterAdapterError(error, !canvasBlobCreated);
  } finally {
    if (imageAbortListener) signal?.removeEventListener('abort', imageAbortListener);
    image?.removeAttribute('src');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    rasterContext = null;
  }
}

type LoadedImage = { image: HTMLImageElement; abortListener?: () => void };

function waitForImageWithAbort(
  image: HTMLImageElement,
  loadMedia: NonNullable<SvgRasterAdapterOptions['loadMedia']>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  cancelledError: () => Error,
  abortImageLoad: () => void,
): Promise<LoadedImage> {
  const abortListener = () => abortImageLoad();
  signal?.addEventListener('abort', abortListener, { once: true });
  if (signal?.aborted) abortListener();
  return loadMedia(image, timeoutMs).then((loaded) => {
    if (signal?.aborted) throw cancelledError();
    return { image: loaded, abortListener };
  }).catch((error: unknown) => {
    signal?.removeEventListener('abort', abortListener);
    if (signal?.aborted) throw cancelledError();
    throw error;
  });
}

function waitForImage(
  image: HTMLImageElement,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  cancelledError: () => Error,
): Promise<LoadedImage> {
  return new Promise<LoadedImage>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve({ image });
    };
    const onLoad = () => finish();
    const onError = () => finish(new Error('The serialized card SVG could not be decoded'));
    const onAbort = () => {
      image.removeAttribute('src');
      finish(cancelledError());
    };
    const timer = setTimeout(() => finish(new Error('The serialized card SVG timed out while decoding')), Math.max(1, timeoutMs));

    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    if (image.complete) {
      if (image.naturalWidth > 0) onLoad();
      else onError();
    }
  });
}

function createCanvas(document: Document, context: SvgRasterContext): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(context.width * context.scale);
  canvas.height = Math.floor(context.height * context.scale);
  canvas.style.width = `${context.width}px`;
  canvas.style.height = `${context.height}px`;
  const max = context.maximumCanvasSize;
  if (max) {
    if (canvas.width > max || canvas.height > max) {
      if (canvas.width > max && canvas.height > max) {
        if (canvas.width > canvas.height) {
          canvas.height *= max / canvas.width;
          canvas.width = max;
        } else {
          canvas.width *= max / canvas.height;
          canvas.height = max;
        }
      } else if (canvas.width > max) {
        canvas.height *= max / canvas.width;
        canvas.width = max;
      } else {
        canvas.width *= max / canvas.height;
        canvas.height = max;
      }
    }
  }
  const canvasContext = canvas.getContext('2d');
  if (canvasContext && context.backgroundColor) {
    canvasContext.fillStyle = context.backgroundColor;
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas encoding returned no Blob'));
      }, type, quality);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Canvas encoding failed'));
    }
  });
}

function waitForRasterTimer(timeoutMs: number, signal: AbortSignal | undefined, cancelledError: () => Error): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(cancelledError());
    const timer = setTimeout(() => finish(), Math.max(0, timeoutMs));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export async function addPngDpiMetadata(blob: Blob, dpi: number): Promise<Blob> {
  if (!Number.isFinite(dpi) || dpi <= 0) return blob;
  const header = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  if (
    header.length !== 33 ||
    header[0] !== 0x89 || header[1] !== 0x50 || header[2] !== 0x4e || header[3] !== 0x47 ||
    header[4] !== 0x0d || header[5] !== 0x0a || header[6] !== 0x1a || header[7] !== 0x0a ||
    header[12] !== 0x49 || header[13] !== 0x48 || header[14] !== 0x44 || header[15] !== 0x52
  ) throw new Error('Cannot add DPI metadata to an invalid PNG');

  const pixelsPerMeter = Math.floor(dpi * 39.3701);
  const pHYs = new Uint8Array(13);
  pHYs.set([0x70, 0x48, 0x59, 0x73], 0);
  writeUint32(pHYs, 4, pixelsPerMeter);
  writeUint32(pHYs, 8, pixelsPerMeter);
  pHYs[12] = 1;
  const crc = crc32(pHYs);
  const prefix = new Uint8Array(54);
  prefix.set(header, 0);
  writeUint32(prefix, 33, 9);
  prefix.set(pHYs, 37);
  writeUint32(prefix, 50, crc);
  return new Blob([prefix, blob.slice(33)], { type: blob.type });
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24;
  target[offset + 1] = value >>> 16;
  target[offset + 2] = value >>> 8;
  target[offset + 3] = value;
}

let crcTable: Int32Array | undefined;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let value = 0; value < 256; value += 1) {
      let current = value;
      for (let bit = 0; bit < 8; bit += 1) {
        current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
      }
      crcTable[value] = current;
    }
  }

  let crc = -1;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function readBlobAsDataUrl(blob: Blob, options: FileReaderFactoryOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const Reader = options.document.defaultView?.FileReader ?? (typeof FileReader === 'undefined' ? undefined : FileReader);
    const reader = options.createFileReader?.() ?? (Reader ? new Reader() : undefined);
    if (!reader) {
      reject(new Error('FileReader is unavailable for SVG data URL encoding'));
      return;
    }
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
    };
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (value) resolve(value);
      else reject(new Error('SVG data URL encoding returned no content'));
    };
    const onAbort = () => {
      try { reader.abort(); } catch { /* The read may already have settled. */ }
      finish(options.cancelledError());
    };
    const timer = setTimeout(() => {
      try { reader.abort(); } catch { /* The read may already have settled. */ }
      finish(options.timeoutError());
    }, Math.max(1, options.timeoutMs));

    reader.onload = () => {
      if (options.signal?.aborted) {
        finish(options.cancelledError());
        return;
      }
      finish(undefined, typeof reader.result === 'string' ? reader.result : undefined);
    };
    reader.onerror = () => finish(reader.error ?? new Error('SVG data URL encoding failed'));
    reader.onabort = () => finish(options.signal?.aborted ? options.cancelledError() : new Error('SVG data URL encoding was aborted'));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    try {
      reader.readAsDataURL(blob);
    } catch (error) {
      finish(error instanceof Error ? error : new Error('SVG data URL encoding failed'));
    }
  });
}

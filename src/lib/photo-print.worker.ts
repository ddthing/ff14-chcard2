import { processPhotoPrintEffects, type PhotoPrintPaperRgb } from './photo-print-effects';

export interface PhotoPrintWorkerRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  effects: readonly string[];
  intensity?: Record<string, number>;
  paperRgb: PhotoPrintPaperRgb;
}

export type PhotoPrintWorkerResponse =
  | { id: number; blob: Blob }
  | { id: number; error: string };

interface PhotoPrintWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: PhotoPrintWorkerResponse): void;
}

const MAX_SOURCE_EDGE = 4_096;
const MAX_SOURCE_PIXELS = 9_000_000;
const WORKER_ERROR = 'The photo print image could not be processed.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRequest(value: unknown): value is PhotoPrintWorkerRequest {
  if (!isRecord(value)) return false;
  const { id, width, height, buffer, effects, intensity, paperRgb } = value;
  if (
    typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0
    || typeof width !== 'number' || !Number.isSafeInteger(width)
    || typeof height !== 'number' || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0
    || width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE
    || !(buffer instanceof ArrayBuffer)
    || !Array.isArray(effects) || !effects.every((effect) => typeof effect === 'string')
    || !Array.isArray(paperRgb) || paperRgb.length !== 3
    || !paperRgb.every((channel) => typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255)
  ) return false;

  if (intensity !== undefined) {
    if (!isRecord(intensity)) return false;
    if (!Object.values(intensity).every((strength) => typeof strength === 'number' && Number.isFinite(strength))) {
      return false;
    }
  }

  const pixels = width * height;
  return Number.isSafeInteger(pixels)
    && pixels <= MAX_SOURCE_PIXELS
    && Number.isSafeInteger(pixels * 4)
    && buffer.byteLength === pixels * 4;
}

function requestId(value: unknown): number {
  if (isRecord(value) && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id >= 0) {
    return value.id;
  }
  return -1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : WORKER_ERROR;
}

async function processRequest(request: PhotoPrintWorkerRequest): Promise<Blob> {
  const canvas = new OffscreenCanvas(request.width, request.height);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The photo print worker could not create a 2D canvas.');

    const result = processPhotoPrintEffects(
      { width: request.width, height: request.height, data: new Uint8ClampedArray(request.buffer) },
      request.effects,
      request.intensity,
      request.paperRgb,
    );
    if (
      result.width !== request.width
      || result.height !== request.height
      || result.data.length !== request.width * request.height * 4
    ) {
      throw new Error('The photo print processor returned an invalid image.');
    }

    const imageData = createImageDataFromPixels(context, result.data, request.width, request.height);
    context.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    if (blob.type !== 'image/png' || blob.size === 0) {
      throw new Error('The photo print worker could not encode a PNG image.');
    }
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function createImageDataFromPixels(
  context: OffscreenCanvasRenderingContext2D,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  const buffer = pixels.buffer;
  if (typeof ImageData === 'function' && buffer instanceof ArrayBuffer) {
    // The new view shares the processor's ArrayBuffer; no RGBA bytes are copied.
    const directPixels = new Uint8ClampedArray(buffer, pixels.byteOffset, pixels.length);
    return new ImageData(directPixels, width, height);
  }
  return copyImageData(context, pixels, width, height);
}

function copyImageData(
  context: OffscreenCanvasRenderingContext2D,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  const imageData = context.createImageData(width, height);
  imageData.data.set(pixels);
  return imageData;
}

const workerScope = globalThis as unknown as PhotoPrintWorkerScope;

workerScope.onmessage = (event) => {
  const input: unknown = event.data;
  const id = requestId(input);
  if (!isValidRequest(input)) {
    workerScope.postMessage({ id, error: 'The photo print worker received invalid image data.' });
    return;
  }

  void processRequest(input).then(
    (blob) => workerScope.postMessage({ id, blob }),
    (error: unknown) => workerScope.postMessage({ id, error: errorMessage(error) }),
  );
};

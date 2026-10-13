import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const previous = {
  offscreenCanvas: globalThis.OffscreenCanvas,
  imageData: Object.getOwnPropertyDescriptor(globalThis, 'ImageData'),
  onmessage: globalThis.onmessage,
  postMessage: globalThis.postMessage,
};

const canvases = [];
let responseListener;

class FakeImageData {
  constructor(data, width, height) {
    assert.ok(data instanceof Uint8ClampedArray);
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

class FakeOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.state = { createImageDataCalls: 0, putCalls: 0, imageData: null };
    canvases.push(this);
  }

  getContext(type) {
    assert.equal(type, '2d');
    const state = this.state;
    return {
      createImageData(width, height) {
        state.createImageDataCalls += 1;
        const data = new Uint8ClampedArray(width * height * 4);
        return { data, width, height };
      },
      putImageData(imageData, x, y) {
        state.putCalls += 1;
        state.imageData = imageData;
        state.position = [x, y];
      },
    };
  }

  async convertToBlob({ type }) {
    return new Blob([new Uint8Array([1, 2, 3])], { type });
  }
}

globalThis.OffscreenCanvas = FakeOffscreenCanvas;
globalThis.ImageData = FakeImageData;
globalThis.postMessage = (message) => responseListener?.(message);

await import('../src/lib/photo-print.worker.ts');
const handlePhotoPrintWorkerMessage = globalThis.onmessage;
const { processPhotoPrintEffects } = await import('../src/lib/photo-print-effects.ts');

function sendRequest(request) {
  return new Promise((resolve) => {
    responseListener = resolve;
    handlePhotoPrintWorkerMessage({ data: request });
  });
}

test('worker wraps the processor output directly and avoids a second ImageData-sized pixel allocation', async () => {
  try {
    const width = 2;
    const height = 1;
    const input = new Uint8ClampedArray([
      80, 112, 144, 255,
      210, 180, 150, 255,
    ]);
    const inputBuffer = input.buffer;
    const response = await sendRequest({
      id: 1,
      width,
      height,
      buffer: inputBuffer,
      effects: [],
      paperRgb: [255, 248, 235],
    });

    assert.equal(response.id, 1);
    assert.ok(response.blob instanceof Blob);
    assert.equal(response.blob.type, 'image/png');
    const canvas = canvases.at(-1);
    assert.equal(canvas.state.createImageDataCalls, 0, 'the supported worker path does not allocate a second pixel buffer');
    assert.equal(canvas.state.putCalls, 1);
    assert.deepEqual(canvas.state.position, [0, 0]);
    assert.strictEqual(canvas.state.imageData.data.buffer, inputBuffer, 'the no-op processor result is wrapped by reference');
    assert.deepEqual([...canvas.state.imageData.data], [...input]);
    assert.equal(canvas.width, 0, 'worker canvas storage is released after encoding');
    assert.equal(canvas.height, 0);
  } finally {
    restoreGlobals();
  }
});

test('worker ImageData wraps the actual photo-print output when effects allocate a result buffer', async () => {
  installGlobals();
  const width = 2;
  const height = 1;
  const input = new Uint8ClampedArray([
    80, 112, 144, 255,
    210, 180, 150, 255,
  ]);
  const paperRgb = [255, 248, 235];
  const expected = processPhotoPrintEffects(
    { width, height, data: new Uint8ClampedArray(input) },
    ['xerox'],
    { xerox: 100 },
    paperRgb,
  );

  try {
    const response = await sendRequest({
      id: 2,
      width,
      height,
      buffer: input.buffer,
      effects: ['xerox'],
      intensity: { xerox: 100 },
      paperRgb,
    });
    const canvas = canvases.at(-1);
    assert.equal(response.id, 2);
    assert.equal(response.blob.type, 'image/png');
    assert.equal(canvas.state.createImageDataCalls, 0);
    assert.equal(canvas.state.imageData.data.length, width * height * 4);
    assert.notStrictEqual(canvas.state.imageData.data.buffer, input.buffer);
    assert.deepEqual([...canvas.state.imageData.data], [...expected.data]);
  } finally {
    restoreGlobals();
  }
});

test('worker retains the image allocation fallback when ImageData is unavailable', async () => {
  installGlobals({ imageData: null });
  try {
    const response = await sendRequest({
      id: 3,
      width: 1,
      height: 1,
      buffer: new Uint8ClampedArray([30, 60, 90, 255]).buffer,
      effects: [],
      paperRgb: [255, 248, 235],
    });
    const canvas = canvases.at(-1);
    assert.equal(response.id, 3);
    assert.equal(response.blob.type, 'image/png');
    assert.equal(canvas.state.createImageDataCalls, 1);
    assert.equal(canvas.state.putCalls, 1);
  } finally {
    restoreGlobals();
  }
});

function installGlobals({ imageData = FakeImageData } = {}) {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas;
  if (imageData) globalThis.ImageData = imageData;
  else delete globalThis.ImageData;
  globalThis.postMessage = (message) => responseListener?.(message);
}

function restoreGlobals() {
  if (previous.offscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas = previous.offscreenCanvas;
  if (previous.imageData) Object.defineProperty(globalThis, 'ImageData', previous.imageData);
  else delete globalThis.ImageData;
  if (previous.onmessage === undefined) delete globalThis.onmessage;
  else globalThis.onmessage = previous.onmessage;
  if (previous.postMessage === undefined) delete globalThis.postMessage;
  else globalThis.postMessage = previous.postMessage;
}

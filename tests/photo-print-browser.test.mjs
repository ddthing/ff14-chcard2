import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const { getPhotoPrintDimensions, loadPhotoPrintBlob } = await import('../src/lib/photo-print-browser.ts');

class FakeImage {
  naturalWidth = 8;
  naturalHeight = 6;
  complete = false;
  onload;
  onerror;

  set src(value) {
    this._src = value;
    queueMicrotask(() => {
      this.complete = true;
      this.onload?.();
    });
  }

  get src() { return this._src; }
}

class FakeWorker {
  static latest;
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.pending = [];
    this.messages = [];
    this.outstanding = 0;
    this.maxOutstanding = 0;
    FakeWorker.instances.push(this);
    FakeWorker.latest = this;
  }

  postMessage(request, transfer) {
    assert.deepEqual(transfer, [request.buffer]);
    this.messages.push(request);
    this.pending.push(request);
    this.outstanding += 1;
    this.maxOutstanding = Math.max(this.maxOutstanding, this.outstanding);
  }

  respondNext() {
    const request = this.pending.shift();
    assert.ok(request, 'a worker request is waiting for its response');
    this.outstanding -= 1;
    this.onmessage?.({ data: { id: request.id, blob: new Blob([`photo-${request.id}`], { type: 'image/png' }) } });
  }

  fail() { this.onerror?.({ preventDefault() {} }); }
  terminate() { this.terminated = true; }
}

function installBrowserStubs() {
  const previous = {
    document: globalThis.document,
    image: Object.getOwnPropertyDescriptor(globalThis, 'Image'),
    worker: Object.getOwnPropertyDescriptor(globalThis, 'Worker'),
  };
  const canvases = [];
  const readbacks = [];
  let pixelViewOffset = 0;
  globalThis.Image = FakeImage;
  globalThis.Worker = FakeWorker;
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      const canvas = { width: 0, height: 0 };
      canvas.getContext = (type, options) => {
        assert.equal(type, '2d');
        assert.deepEqual(options, { willReadFrequently: true });
        return {
          drawImage(_image, _x, _y, width, height) { canvas.drawnSize = [width, height]; },
          getImageData(_x, _y, width, height) {
            const byteLength = width * height * 4;
            const backing = new Uint8ClampedArray(byteLength + pixelViewOffset);
            const data = new Uint8ClampedArray(backing.buffer, pixelViewOffset, byteLength);
            for (let index = 0; index < data.length; index += 4) {
              data[index] = 80;
              data[index + 1] = 112;
              data[index + 2] = 144;
              data[index + 3] = 255;
            }
            readbacks.push(data);
            return { width, height, data };
          },
        };
      };
      canvases.push(canvas);
      return canvas;
    },
  };

  return {
    canvases,
    readbacks,
    setPixelViewOffset(offset) { pixelViewOffset = offset; },
    restore() {
      if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
      if (previous.image) Object.defineProperty(globalThis, 'Image', previous.image); else delete globalThis.Image;
      if (previous.worker) Object.defineProperty(globalThis, 'Worker', previous.worker); else delete globalThis.Worker;
    },
  };
}

async function waitForRequestCount(worker, count) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (worker.messages.length >= count) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail(`worker did not receive ${count} requests`);
}

test('photo print processing uses a bounded worker, deduplicates consumers, and drops canceled queue entries', async () => {
  assert.deepEqual(getPhotoPrintDimensions(3840, 2160), { width: 3840, height: 2160 });
  const large = getPhotoPrintDimensions(7680, 4320);
  assert.ok(large.width <= 4096 && large.height <= 4096);
  assert.ok(large.width * large.height <= 9_000_000);

  const browser = installBrowserStubs();
  const paper = [255, 248, 235];
  try {
    const source = 'blob:photo-print-cache-test';
    const first = loadPhotoPrintBlob(source, ['xerox'], { xerox: 38 }, paper);
    const duplicate = loadPhotoPrintBlob(source, ['xerox'], { xerox: 38 }, paper);
    const worker = FakeWorker.latest;
    await waitForRequestCount(worker, 1);
    assert.equal(worker.options.type, 'module');
    assert.match(String(worker.url), /photo-print\.worker\.ts/u);
    assert.deepEqual([worker.messages[0].width, worker.messages[0].height], [8, 6]);
    assert.strictEqual(worker.messages[0].buffer, browser.readbacks[0].buffer, 'a complete ImageData buffer transfers without a copy');
    assert.equal(worker.messages[0].buffer.byteLength, browser.readbacks[0].byteLength);
    assert.deepEqual(worker.messages[0].effects, ['xerox']);
    assert.deepEqual(worker.messages[0].intensity, { xerox: 38 });
    assert.deepEqual(worker.messages[0].paperRgb, paper);
    assert.equal(browser.canvases.length, 1, 'duplicate photo layers share one raster read');

    worker.respondNext();
    const [firstBlob, duplicateBlob] = await Promise.all([first, duplicate]);
    assert.strictEqual(duplicateBlob, firstBlob, 'both consumers receive the same worker result');

    const cached = await loadPhotoPrintBlob(source, ['xerox'], { xerox: 38 }, paper);
    assert.strictEqual(cached, firstBlob, 'a later request reuses the bounded Blob cache');
    assert.equal(worker.messages.length, 1);

    const changedStrength = loadPhotoPrintBlob(source, ['xerox'], { xerox: 39 }, paper);
    await waitForRequestCount(worker, 2);
    worker.respondNext();
    await changedStrength;
    const changedPaper = loadPhotoPrintBlob(source, ['xerox'], { xerox: 38 }, [255, 250, 240]);
    await waitForRequestCount(worker, 3);
    worker.respondNext();
    await changedPaper;
    assert.equal(worker.messages.length, 3, 'strength and actual paper RGB each produce a distinct worker job');

    const activeController = new AbortController();
    const active = loadPhotoPrintBlob('blob:photo-queue-test', ['xerox'], { xerox: 40 }, paper, activeController.signal);
    await waitForRequestCount(worker, 4);

    const canceledController = new AbortController();
    const canceled = loadPhotoPrintBlob('blob:photo-queue-test', ['xerox'], { xerox: 31 }, paper, canceledController.signal);
    const canceledExpectation = assert.rejects(canceled, error => error.name === 'AbortError');
    const firstQueuedController = new AbortController();
    const secondQueuedController = new AbortController();
    const firstQueued = loadPhotoPrintBlob('blob:photo-queue-test', ['xerox'], { xerox: 32 }, paper, firstQueuedController.signal);
    const secondQueued = loadPhotoPrintBlob('blob:photo-queue-test', ['xerox'], { xerox: 32 }, paper, secondQueuedController.signal);
    const firstQueuedExpectation = assert.rejects(firstQueued, error => error.name === 'AbortError');

    canceledController.abort();
    firstQueuedController.abort();
    await Promise.all([canceledExpectation, firstQueuedExpectation]);
    assert.equal(worker.messages.length, 4, 'canceled metadata does not allocate image pixels or reach the worker');

    worker.respondNext();
    await active;
    await waitForRequestCount(worker, 5);
    assert.deepEqual(worker.messages[4].intensity, { xerox: 32 }, 'the remaining consumer keeps the shared queued job');
    worker.respondNext();
    await secondQueued;
    assert.equal(worker.maxOutstanding, 1, 'the worker processes only one pixel buffer at a time');

    const discardedController = new AbortController();
    const discarded = loadPhotoPrintBlob('blob:photo-print-discard-test', ['xerox'], { xerox: 44 }, paper, discardedController.signal);
    const discardedExpectation = assert.rejects(discarded, error => error.name === 'AbortError');
    await waitForRequestCount(worker, 6);
    discardedController.abort();
    await discardedExpectation;
    worker.respondNext();
    await new Promise(resolve => setImmediate(resolve));

    const retried = loadPhotoPrintBlob('blob:photo-print-discard-test', ['xerox'], { xerox: 44 }, paper);
    await waitForRequestCount(worker, 7);
    worker.respondNext();
    await retried;
    assert.equal(worker.maxOutstanding, 1);

    const failingWorker = FakeWorker.latest;
    const failedRequestCount = failingWorker.messages.length + 1;
    const failedRequest = loadPhotoPrintBlob('blob:worker-retry-test', ['xerox'], { xerox: 51 }, paper);
    const failedExpectation = assert.rejects(failedRequest, /worker stopped unexpectedly/u);
    await waitForRequestCount(failingWorker, failedRequestCount);
    failingWorker.fail();
    await failedExpectation;

    const recovered = loadPhotoPrintBlob('blob:worker-retry-test', ['xerox'], { xerox: 52 }, paper);
    await waitForRequestCount(FakeWorker.latest, 1);
    assert.equal(FakeWorker.instances.length, 2, 'a later explicit request can start a fresh worker after a transient failure');
    FakeWorker.latest.respondNext();
    await recovered;

    browser.setPixelViewOffset(8);
    const offsetSource = loadPhotoPrintBlob('blob:photo-print-offset-view', ['xerox'], { xerox: 53 }, paper);
    const offsetWorker = FakeWorker.latest;
    const offsetRequestCount = offsetWorker.messages.length + 1;
    await waitForRequestCount(offsetWorker, offsetRequestCount);
    const offsetPixels = browser.readbacks.at(-1);
    const offsetBuffer = offsetWorker.messages.at(-1).buffer;
    assert.equal(offsetPixels.byteOffset, 8);
    assert.notStrictEqual(offsetBuffer, offsetPixels.buffer, 'a partial view gets an exact transferable copy');
    assert.equal(offsetBuffer.byteLength, offsetPixels.byteLength);
    assert.deepEqual([...new Uint8Array(offsetBuffer)], [...offsetPixels]);
    offsetWorker.respondNext();
    await offsetSource;
  } finally {
    browser.restore();
  }
});

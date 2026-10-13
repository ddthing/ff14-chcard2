import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const { createCooperativeCloneHook, createSerializedRendererRunner, prepareRendererSandbox } = await import('../src/lib/card-export/renderer-lifecycle.ts');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function waitForTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function errors() {
  return {
    cancelledError: () => Object.assign(new Error('cancelled'), { code: 'cancelled' }),
    timeoutError: () => Object.assign(new Error('timeout'), { code: 'timeout' }),
  };
}

test('cooperative clone checkpoint preserves its callback and stops after abort at a task yield', async () => {
  const controller = new AbortController();
  const visited = [];
  const committed = [];
  const nodes = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  let now = 0;
  let yields = 0;
  const onCloneEachNode = createCooperativeCloneHook((node) => visited.push(node), {
    signal: controller.signal,
    budgetMs: 10,
    now: () => now,
    yieldToTask: async () => {
      yields += 1;
      controller.abort();
    },
    cancelledError: errors().cancelledError,
  });

  await onCloneEachNode(nodes[0]);
  committed.push(nodes[0]);
  now = 11;
  await assert.rejects((async () => {
    for (const node of nodes.slice(1)) {
      await onCloneEachNode(node);
      committed.push(node);
    }
  })(), (error) => error.code === 'cancelled');

  assert.deepEqual(visited, nodes.slice(0, 2));
  assert.deepEqual(committed, nodes.slice(0, 1));
  assert.equal(yields, 1);
});

test('clone checkpoints yield at the default eight millisecond work budget', async () => {
  let now = 0;
  let yields = 0;
  const hook = createCooperativeCloneHook(() => {}, {
    now: () => now,
    yieldToTask: async () => {},
    cancelledError: errors().cancelledError,
    onYield: () => { yields += 1; },
  });

  await hook({});
  now = 7;
  await hook({});
  assert.equal(yields, 0);
  now = 8;
  await hook({});
  assert.equal(yields, 1);
});

test('renderer sandbox waits until the srcdoc body is ready before cloning can start', async () => {
  const listeners = new Map();
  const iframe = {
    width: '',
    height: '',
    get srcdoc() { return this._srcdoc ?? ''; },
    set srcdoc(value) {
      this._srcdoc = value;
      this.contentDocument = { URL: 'about:srcdoc', body: null, readyState: 'loading' };
      setTimeout(() => {
        this.contentDocument = { URL: 'about:srcdoc', body: {}, readyState: 'complete' };
        for (const listener of listeners.get('load') ?? []) listener();
      }, 2);
    },
    contentDocument: null,
    style: {},
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    remove() {},
  };
  const context = {
    ownerDocument: {
      body: {
        appendChild(child) {
          child.contentDocument = { URL: 'about:blank', body: {}, readyState: 'complete' };
        },
      },
      createElement: () => iframe,
    },
  };
  const pending = prepareRendererSandbox(context, {
    timeoutMs: 500,
    cancelledError: errors().cancelledError,
    timeoutError: errors().timeoutError,
    setupError: () => Object.assign(new Error('setup'), { code: 'setup' }),
  });

  assert.equal(context.sandbox, iframe);
  assert.equal(iframe.contentDocument.body, null);
  await pending;
  assert.ok(iframe.contentDocument.body);
});

test('cancelling the renderer wait does not release its slot before underlying work settles', async () => {
  const runRenderer = createSerializedRendererRunner();
  const firstController = new AbortController();
  const firstWork = deferred();
  const firstStarted = deferred();
  let active = 0;
  let maxActive = 0;
  let retryStarted = false;
  let retryWasQueued = false;

  const first = runRenderer((signal) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    firstStarted.resolve();
    assert.equal(signal.aborted, false);
    return firstWork.promise.then((value) => {
      active -= 1;
      return value;
    });
  }, { ...errors(), signal: firstController.signal, timeoutMs: 1_000 });
  await firstStarted.promise;

  const cancelledFirst = assert.rejects(first, (error) => error.code === 'cancelled');
  firstController.abort();
  await cancelledFirst;

  const retry = runRenderer(() => {
    retryStarted = true;
    active += 1;
    maxActive = Math.max(maxActive, active);
    active -= 1;
    return 'retry';
  }, {
    ...errors(),
    timeoutMs: 1_000,
    onQueued: () => { retryWasQueued = true; },
  });

  await waitForTask();
  assert.equal(retryWasQueued, true);
  assert.equal(retryStarted, false);
  assert.equal(active, 1);

  firstWork.resolve('cancelled render settled');
  assert.equal(await retry, 'retry');
  assert.equal(maxActive, 1);
  assert.equal(active, 0);
});

test('cancelling a queued retry removes it without poisoning later renderer jobs', async () => {
  const runRenderer = createSerializedRendererRunner();
  const activeWork = deferred();
  const activeStarted = deferred();
  const queuedController = new AbortController();
  let cancelledJobStarted = false;

  const active = runRenderer(() => {
    activeStarted.resolve();
    return activeWork.promise;
  }, { ...errors(), timeoutMs: 1_000 });
  await activeStarted.promise;

  const queued = runRenderer(() => {
    cancelledJobStarted = true;
    return 'should not run';
  }, { ...errors(), signal: queuedController.signal, timeoutMs: 1_000 });
  const cancelledQueued = assert.rejects(queued, (error) => error.code === 'cancelled');
  queuedController.abort();
  await cancelledQueued;
  assert.equal(cancelledJobStarted, false);

  const next = runRenderer(() => 'next', { ...errors(), timeoutMs: 1_000 });
  activeWork.resolve('active settled');
  assert.equal(await active, 'active settled');
  assert.equal(await next, 'next');
});

test('renderer timeout aborts its cooperative signal but retains the slot until the promise settles', async () => {
  const runRenderer = createSerializedRendererRunner();
  const timedOutWork = deferred();
  const started = deferred();
  let operationSignal;
  let retryStarted = false;

  const timedOut = runRenderer((signal) => {
    operationSignal = signal;
    started.resolve();
    return timedOutWork.promise;
  }, { ...errors(), timeoutMs: 10 });
  await started.promise;
  await assert.rejects(timedOut, (error) => error.code === 'timeout');
  assert.equal(operationSignal.aborted, true);

  const retry = runRenderer(() => {
    retryStarted = true;
    return 'retry';
  }, { ...errors(), timeoutMs: 1_000 });
  await waitForTask();
  assert.equal(retryStarted, false);

  timedOutWork.resolve('late renderer result');
  assert.equal(await retry, 'retry');
});

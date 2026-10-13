export interface SerializedRendererRunOptions {
  signal?: AbortSignal;
  timeoutMs: number;
  cancelledError: () => Error;
  timeoutError: () => Error;
  onQueued?: () => void;
}

export type SerializedRendererOperation<T> = (signal: AbortSignal) => T | PromiseLike<T>;

export interface RendererSandboxContext {
  ownerDocument?: Document;
  sandbox?: HTMLIFrameElement;
}

export interface RendererSandboxOptions {
  signal?: AbortSignal;
  timeoutMs: number;
  cancelledError: () => Error;
  timeoutError: () => Error;
  setupError: () => Error;
}

/** Prepares the renderer's default-style iframe before its clone phase. */
export async function prepareRendererSandbox(
  context: RendererSandboxContext,
  options: RendererSandboxOptions,
): Promise<void> {
  if (options.signal?.aborted) throw options.cancelledError();
  if (isRendererSandboxReady(context.sandbox)) return;

  const ownerDocument = context.ownerDocument;
  if (!ownerDocument?.body) throw options.setupError();

  let sandbox: HTMLIFrameElement;
  try {
    sandbox = ownerDocument.createElement('iframe');
    sandbox.width = '0';
    sandbox.height = '0';
    sandbox.style.visibility = 'hidden';
    sandbox.style.position = 'fixed';
    context.sandbox = sandbox;
  } catch {
    throw options.setupError();
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const timer: { handle?: ReturnType<typeof setTimeout> } = {};
    const cleanup = () => {
      if (poll !== undefined) clearInterval(poll);
      if (timer.handle !== undefined) clearTimeout(timer.handle);
      sandbox.removeEventListener('load', onLoad);
      sandbox.removeEventListener('error', onError);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const checkReady = () => {
      if (isRendererSandboxReady(sandbox)) finish();
    };
    const onLoad = () => checkReady();
    const onError = () => finish(options.setupError());
    const onAbort = () => finish(options.cancelledError());

    sandbox.addEventListener('load', onLoad);
    sandbox.addEventListener('error', onError);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer.handle = setTimeout(() => finish(options.timeoutError()), Math.max(1, options.timeoutMs));
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    try {
      ownerDocument.body.appendChild(sandbox);
      sandbox.srcdoc = '<!DOCTYPE html><meta charset="UTF-8"><title></title><body>';
      checkReady();
      if (!settled) poll = setInterval(checkReady, 16);
    } catch {
      finish(options.setupError());
    }
  });
}

function isRendererSandboxReady(sandbox: HTMLIFrameElement | undefined): boolean {
  const document = sandbox?.contentDocument;
  return document?.URL === 'about:srcdoc' && document.readyState === 'complete' && Boolean(document.body);
}

/**
 * Serializes non-cancellable renderer promises. The caller may stop waiting on
 * abort or timeout, but the next renderer job does not start until the active
 * promise has actually settled.
 */
export function createSerializedRendererRunner() {
  let rendererTail: Promise<void> = Promise.resolve();
  let outstandingJobs = 0;

  return function runSerializedRenderer<T>(
    operation: SerializedRendererOperation<T>,
    options: SerializedRendererRunOptions,
  ): Promise<T> {
    const previousJob = rendererTail;
    const wasQueued = outstandingJobs > 0;
    outstandingJobs += 1;

    let releaseSlot!: () => void;
    const slot = new Promise<void>((resolve) => { releaseSlot = resolve; });
    rendererTail = previousJob.then(() => slot, () => slot);

    let slotReleased = false;
    const release = () => {
      if (slotReleased) return;
      slotReleased = true;
      outstandingJobs = Math.max(0, outstandingJobs - 1);
      releaseSlot();
    };

    const operationController = new AbortController();
    const abortOperation = () => operationController.abort();
    options.signal?.addEventListener('abort', abortOperation, { once: true });
    if (options.signal?.aborted) operationController.abort();

    return (async () => {
      let operationStarted = false;
      try {
        if (wasQueued) options.onQueued?.();
        await waitForRendererTurn(previousJob, options.signal, options.cancelledError);
        if (options.signal?.aborted) throw options.cancelledError();

        operationStarted = true;
        const work = Promise.resolve().then(() => operation(operationController.signal));
        // Keep the renderer slot until the real promise settles, even when the
        // abort or timeout below has already rejected the caller's promise.
        void work.then(release, release);
        return await waitForRendererWork(work, operationController, options);
      } catch (error) {
        if (!operationStarted) release();
        throw error;
      } finally {
        options.signal?.removeEventListener('abort', abortOperation);
      }
    })();
  };
}

function waitForRendererTurn(
  previousJob: Promise<void>,
  signal: AbortSignal | undefined,
  cancelledError: () => Error,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(cancelledError());
  if (!signal) return previousJob;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(cancelledError());

    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    previousJob.then(() => finish(), () => finish());
  });
}

function waitForRendererWork<T>(
  work: Promise<T>,
  operationController: AbortController,
  options: SerializedRendererRunOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const { signal } = options;
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onAbort = () => {
      operationController.abort();
      finish(() => reject(options.cancelledError()));
    };
    const timeout = setTimeout(() => {
      operationController.abort();
      finish(() => reject(options.timeoutError()));
    }, Math.max(1, options.timeoutMs));

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export interface CooperativeCloneHookOptions {
  signal?: AbortSignal;
  budgetMs?: number;
  now?: () => number;
  yieldToTask?: () => Promise<void>;
  cancelledError: () => Error;
  onYield?: () => void;
}

/**
 * Creates an awaitable clone callback that yields to browser input at a bounded
 * cadence and stops recursive cloning at the next checkpoint after abort.
 */
export function createCooperativeCloneHook(
  afterClone: (cloned: Node) => void,
  options: CooperativeCloneHookOptions,
): (cloned: Node) => Promise<void> {
  const budgetMs = Math.max(1, options.budgetMs ?? 8);
  const now = options.now ?? (() => typeof performance === 'undefined' ? Date.now() : performance.now());
  const yieldToTask = options.yieldToTask ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  let lastYieldAt = now();

  return async (cloned) => {
    afterClone(cloned);
    if (options.signal?.aborted) throw options.cancelledError();
    if (now() - lastYieldAt < budgetMs) return;

    await yieldToTask();
    lastYieldAt = now();
    options.onYield?.();
    if (options.signal?.aborted) throw options.cancelledError();
  };
}

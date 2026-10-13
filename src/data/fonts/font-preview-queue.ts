export type FontPreviewQueueOperation<T> = (hasSubscribers: () => boolean) => Promise<T>;

interface QueueTask<T> {
  key: string;
  operation: FontPreviewQueueOperation<T>;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  subscribers: number;
  started: boolean;
  settled: boolean;
  cancelled: boolean;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('The font preview request was cancelled.', 'AbortError');
  const error = new Error('The font preview request was cancelled.');
  error.name = 'AbortError';
  return error;
}

/** A small shared queue for picker previews; active FontFaceSet loads cannot be aborted. */
export function createFontPreviewQueue(maxConcurrent = 2, cacheLimit = 96) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new RangeError('maxConcurrent must be positive');
  if (!Number.isInteger(cacheLimit) || cacheLimit < 1) throw new RangeError('cacheLimit must be positive');

  const cache = new Map<string, QueueTask<unknown>>();
  const pending: Array<QueueTask<unknown>> = [];
  let activeCount = 0;

  function pruneCache() {
    while (cache.size > cacheLimit) {
      const oldestSettled = [...cache].find(([, task]) => task.settled);
      if (!oldestSettled) return;
      cache.delete(oldestSettled[0]);
    }
  }

  function pump() {
    while (activeCount < maxConcurrent && pending.length > 0) {
      const task = pending.shift()!;
      if (task.cancelled || task.subscribers === 0) {
        task.settled = true;
        if (cache.get(task.key) === task) cache.delete(task.key);
        task.reject(createAbortError());
        continue;
      }

      task.started = true;
      activeCount += 1;
      void Promise.resolve()
        .then(() => task.operation(() => !task.cancelled && task.subscribers > 0))
        .then((result) => {
          task.settled = true;
          task.resolve(result);
          pruneCache();
        }, (error: unknown) => {
          task.settled = true;
          if (cache.get(task.key) === task) cache.delete(task.key);
          task.reject(error);
        })
        .finally(() => {
          activeCount -= 1;
          pump();
        });
    }
  }

  function load<T>(key: string, operation: FontPreviewQueueOperation<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(createAbortError());

    let task = cache.get(key) as QueueTask<T> | undefined;
    const isNewTask = !task;
    if (!task) {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      task = {
        key,
        operation,
        promise,
        resolve,
        reject,
        subscribers: 0,
        started: false,
        settled: false,
        cancelled: false,
      };
      cache.set(key, task as QueueTask<unknown>);
      pending.push(task as QueueTask<unknown>);
    } else {
      // Keep the most recently requested key at the end of the bounded cache.
      cache.delete(key);
      cache.set(key, task as QueueTask<unknown>);
    }

    task.subscribers += 1;
    const currentTask = task;
    const result = new Promise<T>((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        currentTask.subscribers -= 1;
        signal?.removeEventListener('abort', onAbort);
        return true;
      };
      const onAbort = () => {
        if (!release()) return;
        reject(createAbortError());
        if (currentTask.subscribers === 0) {
          currentTask.cancelled = true;
          if (cache.get(currentTask.key) === currentTask) cache.delete(currentTask.key);
          if (!currentTask.started) {
            const pendingIndex = pending.indexOf(currentTask as QueueTask<unknown>);
            if (pendingIndex >= 0) pending.splice(pendingIndex, 1);
            currentTask.settled = true;
            currentTask.reject(createAbortError());
            pump();
          }
        }
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      currentTask.promise.then((value) => {
        if (!release()) return;
        resolve(value);
      }, (error: unknown) => {
        if (!release()) return;
        reject(error);
      });
      if (signal?.aborted) onAbort();
    });

    if (isNewTask) {
      pruneCache();
      pump();
    }
    return result;
  }

  return { load };
}

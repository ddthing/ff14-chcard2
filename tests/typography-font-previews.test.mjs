import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../tests/ts-alias-loader.mjs', import.meta.url);

const { createFontPreviewQueue } = await import('../src/data/fonts/font-preview-queue');
const { loadTypographyFontPreview } = await import('../src/data/fonts/load-preview-fonts');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installFakeDocument({ onLink, loadFont }) {
  const links = [];
  const fontSet = {
    load: (font, text) => loadFont(font, text),
  };
  const document = {
    fonts: fontSet,
    head: {
      append(link) {
        links.push(link);
        queueMicrotask(() => onLink(link, links.length));
      },
    },
    createElement() {
      return {
        dataset: {},
        rel: '',
        href: '',
        remove() { this.removed = true; },
      };
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
  return {
    document,
    fontSet,
    links,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else delete globalThis.document;
    },
  };
}

function settleLink(link, event = 'load') {
  if (event === 'error') link.onerror?.(new Event('error'));
  else link.onload?.(new Event('load'));
}

test('preview queue caps active rows at two and removes cancelled queued rows before retry', async () => {
  const queue = createFontPreviewQueue(2, 8);
  const started = [];
  const completions = new Map();
  let active = 0;
  let peak = 0;
  const operation = (key) => queue.load(key, async () => {
    started.push(key);
    active += 1;
    peak = Math.max(peak, active);
    const completion = deferred();
    completions.set(key, completion);
    await completion.promise;
    active -= 1;
    return key;
  });

  const first = operation('first');
  const second = operation('second');
  const controller = new AbortController();
  const cancelled = queue.load('cancelled', async () => {
    started.push('cancelled');
    return 'cancelled';
  }, controller.signal);
  const fourth = operation('fourth');
  await new Promise(setImmediate);
  assert.deepEqual(started, ['first', 'second']);

  controller.abort();
  await assert.rejects(cancelled, (error) => error.name === 'AbortError');
  completions.get('first').resolve();
  assert.equal(await first, 'first');
  await new Promise(setImmediate);
  assert.deepEqual(started, ['first', 'second', 'fourth']);

  completions.get('second').resolve();
  completions.get('fourth').resolve();
  assert.deepEqual(await Promise.all([second, fourth]), ['second', 'fourth']);
  assert.ok(peak <= 2, `preview concurrency reached ${peak}`);

  assert.equal(await queue.load('cancelled', async () => {
    started.push('cancelled');
    return 'cancelled';
  }), 'cancelled');
  assert.equal(started.at(-1), 'cancelled', 'a reopened picker can retry a cancelled queued sample');
});

test('preview loading rejects an empty font match and retries a failed stylesheet without false readiness', async (t) => {
  let fontAttempts = 0;
  const fake = installFakeDocument({
    onLink(link, attempt) { settleLink(link, attempt === 1 ? 'error' : 'load'); },
    loadFont: async () => {
      fontAttempts += 1;
      return fontAttempts === 1 ? [] : [{}];
    },
  });
  t.after(fake.restore);

  await assert.rejects(
    loadTypographyFontPreview('gmarket-sans', 'Gmarket Sans', 400, 'Coner', ['latin']),
    /stylesheet failed/u,
  );
  await assert.rejects(
    loadTypographyFontPreview('gmarket-sans', 'Gmarket Sans', 400, 'Coner', ['latin']),
    /No preview face supports/u,
  );
  assert.equal(await loadTypographyFontPreview('gmarket-sans', 'Gmarket Sans', 400, 'Coner', ['latin']), 'XIV Preview 001');
  assert.equal(fake.links.length, 2, 'the failed stylesheet is removed and retried once');
  assert.equal(fontAttempts, 2, 'an empty FontFaceSet result is rejected and retried');
  assert.equal(fake.links[0].removed, true);
});

test('a mixed-script sample is not ready until every Unicode block has a matching face, then retries', async (t) => {
  const calls = [];
  let missingKana = true;
  const fake = installFakeDocument({
    onLink(link) { settleLink(link); },
    async loadFont(_font, text) {
      calls.push(text);
      return text === 'ガ' && missingKana ? [] : [{}];
    },
  });
  t.after(fake.restore);

  await assert.rejects(
    loadTypographyFontPreview('pretendard-jp', 'Pretendard JP Variable', 500, 'Aガ', ['latin', 'japanese']),
    /No preview face supports a sample block/u,
  );
  assert.deepEqual(calls, ['A', 'ガ'], 'the first block loaded before the unsupported second block failed');

  missingKana = false;
  assert.equal(
    await loadTypographyFontPreview('pretendard-jp', 'Pretendard JP Variable', 500, 'Aガ', ['latin', 'japanese']),
    'XIV Preview 003',
  );
  assert.deepEqual(calls, ['A', 'ガ', 'A', 'ガ'], 'the failed request was evicted and both blocks retried');
  assert.equal(fake.links.length, 1, 'the successful family stylesheet is reused on retry');
});

test('whitespace-only Unicode blocks are skipped while visible blocks still require a face', async (t) => {
  const calls = [];
  const fake = installFakeDocument({
    onLink(link) { settleLink(link); },
    async loadFont(_font, text) {
      calls.push(text);
      return text.trim().length === 0 ? [] : [{}];
    },
  });
  t.after(fake.restore);

  assert.equal(
    await loadTypographyFontPreview('pretendard-jp', 'Pretendard JP Variable', 500, 'とも\n歩', ['japanese']),
    'XIV Preview 003',
  );
  assert.deepEqual(calls, ['とも', '歩'], 'the whitespace-only block is not a face requirement');
});

test('sample blocks load sequentially per font and identical rows share a FontFaceSet promise', async (t) => {
  const calls = [];
  let active = 0;
  let peak = 0;
  const fake = installFakeDocument({
    onLink(link) { settleLink(link); },
    async loadFont(font, text) {
      calls.push({ font, text });
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return [{}];
    },
  });
  t.after(fake.restore);

  const repeated = await Promise.all([
    loadTypographyFontPreview('gmarket-sans', 'Gmarket Sans', 500, 'A가', ['latin', 'korean']),
    loadTypographyFontPreview('gmarket-sans', 'Gmarket Sans', 500, 'A가', ['latin', 'korean']),
  ]);
  assert.deepEqual(repeated, ['XIV Preview 001', 'XIV Preview 001']);
  assert.deepEqual(calls.map(({ text }) => text), ['A', '가']);
  assert.ok(calls.every(({ font }) => font.includes('"XIV Preview 001"')));
  assert.ok(peak <= 1, `one mixed-script sample started ${peak} block loads at once`);
  assert.equal(fake.links.length, 1, 'the family stylesheet is cached for the document');
});

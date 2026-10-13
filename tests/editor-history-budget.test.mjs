import assert from 'node:assert/strict';
import test from 'node:test';

const { MAX_HISTORY_IMAGE_BYTES, trimHistoryByUniqueImageBytes } = await import('../src/store/editor-history-budget.ts');

function snapshot(src) {
  return { image: { src } };
}

test('history image accounting deduplicates shared source strings across current, past, and future', () => {
  const sharedSource = 'data:image/png;base64,shared-photo';
  const past = Array.from({ length: 40 }, () => snapshot(sharedSource));
  const future = [snapshot(sharedSource), snapshot(sharedSource)];
  const result = trimHistoryByUniqueImageBytes(past, future, sharedSource, sharedSource.length * 2);

  assert.equal(MAX_HISTORY_IMAGE_BYTES, 64 * 1024 * 1024);
  assert.equal(result.estimatedImageBytes, sharedSource.length * 2);
  assert.equal(result.past.length, 40, 'repeated undo references are charged once');
  assert.equal(result.future.length, 2);
});

test('history trimming drops oldest undo snapshots before farthest redo snapshots', () => {
  const past = [snapshot('old'), snapshot('mid')];
  const future = [snapshot('near'), snapshot('far')];
  const current = 'cur';
  const result = trimHistoryByUniqueImageBytes(past, future, current, 16);

  assert.deepEqual(result.past, []);
  assert.deepEqual(result.future, [future[0]], 'the nearest redo remains available');
  assert.equal(result.estimatedImageBytes, (current.length + future[0].image.src.length) * 2);
});

test('the next current image source is included when replacement history is budgeted', () => {
  const previous = snapshot('previous-image');
  const nextCurrent = 'next-current-image';
  const result = trimHistoryByUniqueImageBytes([previous], [], nextCurrent, nextCurrent.length * 2);

  assert.deepEqual(result.past, [], 'the previous source is evicted because the next current source uses the budget');
  assert.equal(result.estimatedImageBytes, nextCurrent.length * 2);
});

test('an over-budget current source is preserved after its history references are evicted', () => {
  const current = 'oversized-current-image-source';
  const result = trimHistoryByUniqueImageBytes([snapshot(current), snapshot(current)], [], current, 0);

  assert.deepEqual(result.past, []);
  assert.deepEqual(result.future, []);
  assert.equal(result.estimatedImageBytes, current.length * 2);
  assert.equal(current, 'oversized-current-image-source', 'the budget removes only history references, never the live source');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { getLatestVisibility } from '../src/components/marketing/visibility.ts';

test('a batched stale exit cannot hide a card that has re-entered the viewport', () => {
  const target = {};
  assert.equal(getLatestVisibility([
    { target, time: 10, isIntersecting: false },
    { target, time: 20, isIntersecting: true },
  ], target), true);
  assert.equal(getLatestVisibility([
    { target, time: 20, isIntersecting: true },
    { target, time: 10, isIntersecting: false },
  ], target), true);
});

test('the latest exit releases an offscreen renderer even when an entrance was queued', () => {
  const target = {};
  assert.equal(getLatestVisibility([
    { target, time: 10, isIntersecting: true },
    { target, time: 20, isIntersecting: false },
  ], target), false);
});

test('observations for an old or detached host never overwrite the current host', () => {
  const target = {};
  const oldTarget = {};
  const entries = [
    { target, time: 10, isIntersecting: true },
    { target: oldTarget, time: 20, isIntersecting: false },
  ];
  assert.equal(getLatestVisibility(entries, target), true);
  assert.equal(getLatestVisibility(entries, null), undefined);
  assert.equal(getLatestVisibility(entries, {}), undefined);
});

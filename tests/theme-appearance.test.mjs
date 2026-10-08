import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import {
  APP_APPEARANCE_STORAGE_KEY,
  createAppAppearanceBootstrapScript,
  getStoredAppAppearance,
  isAppAppearance,
  resolveAppAppearance,
  setStoredAppAppearance,
  syncAppAppearanceFromStorageEvent,
} from '../src/lib/app-appearance.ts';

function createTarget({ initial = null, throwOnRead = false, throwOnWrite = false } = {}) {
  let value = initial;
  const target = {
    localStorage: {
      getItem(key) {
        assert.equal(key, APP_APPEARANCE_STORAGE_KEY);
        if (throwOnRead) throw new Error('storage blocked');
        return value;
      },
      setItem(key, next) {
        assert.equal(key, APP_APPEARANCE_STORAGE_KEY);
        if (throwOnWrite) throw new Error('storage blocked');
        value = next;
      },
    },
  };
  return { target, readStoredValue: () => value };
}

test('appearance accepts only system, light, or dark and resolves system at runtime', () => {
  assert.equal(isAppAppearance('system'), true);
  assert.equal(isAppAppearance('light'), true);
  assert.equal(isAppAppearance('dark'), true);
  assert.equal(isAppAppearance('sepia'), false);
  assert.equal(resolveAppAppearance('system', 'dark'), 'dark');
  assert.equal(resolveAppAppearance('system', 'light'), 'light');
  assert.equal(resolveAppAppearance('light', 'dark'), 'light');
  assert.equal(resolveAppAppearance('dark', 'light'), 'dark');
});

test('manual appearance preference persists under an app-specific storage key', () => {
  const { target, readStoredValue } = createTarget();
  assert.equal(setStoredAppAppearance(target, 'light'), true);
  assert.equal(readStoredValue(), 'light');
  assert.equal(getStoredAppAppearance(target), 'light');
  assert.match(APP_APPEARANCE_STORAGE_KEY, /^ff14-adventurer-card:appearance$/);
  assert.notEqual(APP_APPEARANCE_STORAGE_KEY, 'ff14-adventurer-card:draft');
});

test('invalid persisted values fall back to system and cannot be written', () => {
  const { target } = createTarget({ initial: 'violet' });
  assert.equal(getStoredAppAppearance(target), 'system');
  assert.equal(setStoredAppAppearance(target, 'violet'), false);
});

test('blocked storage does not throw and manual choice remains active in this tab', () => {
  const { target } = createTarget({ throwOnRead: true, throwOnWrite: true });
  assert.equal(getStoredAppAppearance(target), 'system');
  assert.equal(setStoredAppAppearance(target, 'dark'), true);
  assert.equal(getStoredAppAppearance(target), 'dark');
});

test('a failed write overrides a stale persisted preference for the current tab', () => {
  const { target } = createTarget({ initial: 'light', throwOnWrite: true });
  assert.equal(setStoredAppAppearance(target, 'dark'), true);
  assert.equal(getStoredAppAppearance(target), 'dark');
});

test('storage events synchronize only the appearance key, with clear resetting to system', () => {
  const { target } = createTarget({ throwOnRead: true, throwOnWrite: true });
  assert.equal(syncAppAppearanceFromStorageEvent(target, 'unrelated', 'dark'), false);
  assert.equal(syncAppAppearanceFromStorageEvent(target, APP_APPEARANCE_STORAGE_KEY, 'light'), true);
  assert.equal(getStoredAppAppearance(target), 'light');
  assert.equal(syncAppAppearanceFromStorageEvent(target, null, null), true);
  assert.equal(getStoredAppAppearance(target), 'system');
});

function runBootstrap({ stored = null, prefersDark = false, storageThrows = false, mediaThrows = false } = {}) {
  const attributes = new Map();
  const document = { documentElement: { setAttribute: (key, value) => attributes.set(key, value) } };
  const window = { matchMedia: (query) => {
    assert.equal(query, '(prefers-color-scheme: dark)');
    if (mediaThrows) throw new Error('matchMedia unavailable');
    return { matches: prefersDark };
  } };
  const localStorage = {
    getItem: (key) => {
      assert.equal(key, APP_APPEARANCE_STORAGE_KEY);
      if (storageThrows) throw new Error('storage blocked');
      return stored;
    },
  };
  runInNewContext(createAppAppearanceBootstrapScript(), { document, window, localStorage });
  return attributes;
}

test('pre-hydration bootstrap writes a stable preference and resolved theme before paint', () => {
  assert.deepEqual([...runBootstrap({ prefersDark: true })], [
    ['data-app-appearance', 'system'],
    ['data-app-theme', 'dark'],
  ]);
  assert.deepEqual([...runBootstrap({ stored: 'light', prefersDark: true })], [
    ['data-app-appearance', 'light'],
    ['data-app-theme', 'light'],
  ]);
  assert.deepEqual([...runBootstrap({ stored: 'dark', prefersDark: false })], [
    ['data-app-appearance', 'dark'],
    ['data-app-theme', 'dark'],
  ]);
});

test('bootstrap safely uses System when local storage is unavailable', () => {
  assert.deepEqual([...runBootstrap({ prefersDark: false, storageThrows: true })], [
    ['data-app-appearance', 'system'],
    ['data-app-theme', 'light'],
  ]);
  assert.deepEqual([...runBootstrap({ mediaThrows: true })], [
    ['data-app-appearance', 'system'],
    ['data-app-theme', 'light'],
  ]);
});

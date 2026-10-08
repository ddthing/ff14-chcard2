import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const { getStoredLocale, LOCALE_STORAGE_KEY, setStoredLocale, syncLocaleFromStorageEvent } = await import('../src/lib/locale-preference.ts');

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function createWindow({ localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage() } = {}) {
  return { localStorage, sessionStorage };
}

function blockedStorage() {
  return {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
  };
}

test('locale selection survives blocked local storage through session storage and stays per window', () => {
  const currentWindow = createWindow({ localStorage: blockedStorage() });
  const anotherWindow = createWindow({ localStorage: blockedStorage() });

  assert.equal(setStoredLocale(currentWindow, 'ja'), true);
  assert.equal(getStoredLocale(currentWindow), 'ja');
  assert.equal(currentWindow.sessionStorage.getItem(LOCALE_STORAGE_KEY), 'ja');
  assert.equal(getStoredLocale(anotherWindow), 'ko');
});

test('locale selection remains active for client navigation when both storage APIs are blocked', () => {
  const currentWindow = createWindow({ localStorage: blockedStorage(), sessionStorage: blockedStorage() });

  assert.equal(setStoredLocale(currentWindow, 'en'), true);
  // The same per-window snapshot is used after a client-side route transition.
  assert.equal(getStoredLocale(currentWindow), 'en');
});

test('external locale storage events update the session fallback and ignore unrelated keys', () => {
  const currentWindow = createWindow({ localStorage: blockedStorage() });

  assert.equal(syncLocaleFromStorageEvent(currentWindow, 'another-setting', 'ja'), false);
  assert.equal(getStoredLocale(currentWindow), 'ko');
  assert.equal(syncLocaleFromStorageEvent(currentWindow, LOCALE_STORAGE_KEY, 'ja'), true);
  assert.equal(getStoredLocale(currentWindow), 'ja');
  assert.equal(currentWindow.sessionStorage.getItem(LOCALE_STORAGE_KEY), 'ja');
});

test('invalid stored values and invalid external updates safely resolve to Korean', () => {
  const currentWindow = createWindow();
  currentWindow.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
  assert.equal(getStoredLocale(currentWindow), 'ko');
  assert.equal(setStoredLocale(currentWindow, 'fr'), false);
  assert.equal(syncLocaleFromStorageEvent(currentWindow, LOCALE_STORAGE_KEY, 'fr'), true);
  assert.equal(getStoredLocale(currentWindow), 'ko');
});

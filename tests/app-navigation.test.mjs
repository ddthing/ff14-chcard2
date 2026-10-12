import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const { getAppNavigationCopy, getAppNavigationItems, isRouteCurrent } = await import('../src/lib/app-navigation.ts');

const routeMessages = {
  'nav.primary': 'Primary navigation',
  'nav.home': 'Home',
  'nav.templates': 'Templates',
  'nav.create': 'Create a card',
  'nav.editor': 'Editor',
  'nav.export': 'Export',
};

const copy = getAppNavigationCopy((key) => routeMessages[key], 'en');

test('route navigation exposes every product route and marks only the current page', () => {
  const items = getAppNavigationItems('/templates', copy);

  assert.deepEqual(items.map(({ href }) => href), ['/', '/templates', '/create', '/editor', '/export']);
  assert.deepEqual(items.filter(({ current }) => current).map(({ href }) => href), ['/templates']);
  assert.equal(items.find(({ href }) => href === '/export')?.label, 'Export');
});

test('editor and export links describe the route action in the current workspace', () => {
  const editorItems = getAppNavigationItems('/editor', copy);
  const exportItems = getAppNavigationItems('/export', copy);

  assert.equal(editorItems.find(({ href }) => href === '/editor')?.current, true);
  assert.equal(editorItems.find(({ href }) => href === '/export')?.label, 'Save image');
  assert.equal(exportItems.find(({ href }) => href === '/editor')?.label, 'Back to editing');
  assert.equal(exportItems.find(({ href }) => href === '/export')?.current, true);
});

test('new cards have a localized title instead of repeating the route label', () => {
  const koreanCopy = getAppNavigationCopy((key) => routeMessages[key], 'ko');
  const japaneseCopy = getAppNavigationCopy((key) => routeMessages[key], 'ja');

  assert.equal(koreanCopy.newCard, '새 카드');
  assert.equal(copy.newCard, 'New card');
  assert.equal(japaneseCopy.newCard, '新しいカード');
});

test('route matching treats the home path as exact and supports nested app paths', () => {
  assert.equal(isRouteCurrent('/editor/details', '/editor'), true);
  assert.equal(isRouteCurrent('/editorial', '/editor'), false);
  assert.equal(isRouteCurrent('/templates', '/'), false);
  assert.equal(isRouteCurrent('/', '/'), true);
});

test('desktop headers can reserve the primary destination for the header action', () => {
  const items = getAppNavigationItems('/editor', copy, { exclude: ['/export'] });

  assert.equal(items.some(({ href }) => href === '/export'), false);
  assert.equal(items.some(({ href, current }) => href === '/editor' && current), true);
});

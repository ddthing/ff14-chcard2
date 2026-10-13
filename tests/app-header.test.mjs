import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const root = new URL('../', import.meta.url);
const styles = postcss.parse(readFileSync(new URL('src/components/app-shell.module.css', root), 'utf8'));
const appTheme = readFileSync(new URL('src/app/app-theme.css', root), 'utf8');
const header = readFileSync(new URL('src/components/app-header.tsx', root), 'utf8');
const navigation = readFileSync(new URL('src/components/route-navigation.tsx', root), 'utf8');

function declarationsFor(selector, mediaQuery) {
  const declarations = new Map();
  styles.walkAtRules('media', media => {
    if (media.params !== mediaQuery) return;
    media.walkRules(selector, rule => rule.walkDecls(decl => declarations.set(decl.prop, decl.value)));
  });
  return declarations;
}

test('mobile app header is one 56px row with 44px primary and menu targets', () => {
  const shell = declarationsFor('.appShell', '(max-width: 640px)');
  const headerRules = declarationsFor('.appHeader', '(max-width: 640px)');
  const action = declarationsFor('.headerExport,\n  .headerReturn', '(max-width: 640px)');
  const menu = declarationsFor('.mobileMenuTrigger', '(max-width: 640px)');
  const desktopStatus = declarationsFor('.desktopHeaderSaveStatus', '(max-width: 640px)');
  const mobileStatus = declarationsFor('.mobileIdentitySaveStatus', '(max-width: 640px)');

  assert.equal(shell.get('--app-header-height'), '56px');
  assert.match(appTheme, /--editor-density-header-height:\s*56px/u);
  assert.match(appTheme, /--editor-density-header-height:\s*48px/u);

  const editorShell = new Map();
  styles.walkRules(".appShell:has(.appHeader[data-editor-header='true'])", rule => {
    rule.walkDecls(decl => editorShell.set(decl.prop, decl.value));
  });
  assert.equal(editorShell.get('--app-header-height'), 'var(--editor-density-header-height)');
  assert.equal(headerRules.get('height'), 'var(--app-header-height)');
  assert.equal(headerRules.has('grid-template-areas'), false, 'the compact header has no second row');
  assert.equal(action.get('height'), '44px');
  assert.equal(action.get('min-height'), '44px');
  assert.equal(menu.get('width'), '44px');
  assert.equal(menu.get('min-width'), '44px');
  assert.equal(menu.get('height'), '44px');
  assert.equal(desktopStatus.get('display'), 'none');
  assert.equal(mobileStatus.get('display'), 'inline-flex');
  assert.doesNotMatch(readFileSync(new URL('src/components/app-shell.module.css', root), 'utf8'), /--app-header-height:\s*107px/u);
});

test('save status stays live and visible in the document identity, with an accessible icon-only menu', () => {
  assert.match(header, /documentIdentity[\s\S]*?HeaderSaveStatus[\s\S]*?editorName/u);
  assert.match(header, /role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"/u);
  assert.match(header, /desktopHeaderSaveStatus/u);
  assert.match(navigation, /aria-label=\{copy\.menu\}/u);
  assert.match(header, /if \(isEditor && href === ROUTES\.export\) persistNow\(\)/u);

  const menuLabel = declarationsFor('.mobileMenuTrigger > span', '(max-width: 640px)');
  assert.equal(menuLabel.get('display'), 'none');
});

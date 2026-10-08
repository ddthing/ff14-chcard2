import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const { isCurrentJobIconRequest, isCurrentJobIconSource, resolveJobIconFallbackMark, shouldRenderJobIconMask } = await import('../src/components/ffxiv/job-icon-fallback.ts');

test('generic DPS roles fall through to the more specific job category', () => {
  assert.equal(resolveJobIconFallbackMark('dps', 'limited', 'BST'), 'L');
  assert.equal(resolveJobIconFallbackMark('dps', 'melee', 'DRG'), 'M');
  assert.equal(resolveJobIconFallbackMark('dps', 'physical ranged', 'BRD'), 'R');
  assert.equal(resolveJobIconFallbackMark('dps', 'magical ranged', 'BLM'), 'C');
});

test('a specific caller role wins before category, then an unknown category uses its abbreviation', () => {
  assert.equal(resolveJobIconFallbackMark('tank', 'melee', 'DRG'), 'T');
  assert.equal(resolveJobIconFallbackMark('support', 'magical ranged', 'BLM'), 'C');
  assert.equal(resolveJobIconFallbackMark('dps', 'unknown', 'XYZ'), 'XYZ');
  assert.equal(resolveJobIconFallbackMark('dps', 'unknown'), '✧');
});

test('display-size icon fallback uses the canonical abbreviation while small marks keep role letters', () => {
  assert.equal(resolveJobIconFallbackMark('tank', 'tank', 'PLD', 'cardDisplay'), 'PLD');
  assert.equal(resolveJobIconFallbackMark('dps', 'limited', 'BST', 'editorialLarge'), 'BST');
  assert.equal(resolveJobIconFallbackMark('tank', 'tank', 'PLD', 'micro'), 'T');
  assert.equal(resolveJobIconFallbackMark('tank', 'tank', 'PLD', 'cardSmall'), 'T');
  assert.equal(resolveJobIconFallbackMark('tank', 'tank', null, 'cardDisplay'), 'T');
});

test('source guards reject stale image events and failed masks stay out until the source changes', () => {
  assert.equal(isCurrentJobIconSource('/mask/pld.png', '/mask/pld.png', '/mask/pld.png'), true);
  assert.equal(isCurrentJobIconSource('/mask/pld.png', '/mask/pld.png', ''), true);
  assert.equal(isCurrentJobIconSource('/mask/pld.png', '/mask/drg.png', '/mask/drg.png'), false);
  assert.equal(isCurrentJobIconSource('/mask/pld.png', '/mask/pld.png', '/mask/drg.png'), false);

  assert.equal(shouldRenderJobIconMask('/mask/pld.png', null), true);
  assert.equal(shouldRenderJobIconMask('/mask/pld.png', '/mask/pld.png'), false);
  assert.equal(shouldRenderJobIconMask('/mask/drg.png', '/mask/pld.png'), true);
  assert.equal(shouldRenderJobIconMask(null, null), false);
});

test('a deferred A decode cannot fail the current A request after an A to B to A switch', async () => {
  const sourceA = '/assets/ffxiv/jobs/xivapi/svg/red-mage.svg';
  const sourceB = '/assets/ffxiv/jobs/xivapi/raster/red-mage-512.png';
  let currentImage = { source: sourceA };
  const firstAImage = currentImage;
  let rejectDecode;
  let currentSourceFailed = false;
  const deferredDecode = new Promise((_, reject) => { rejectDecode = reject; });
  void deferredDecode.catch(() => {
    const sourceIsCurrent = isCurrentJobIconSource(firstAImage.source, firstAImage.source, sourceA);
    if (isCurrentJobIconRequest(firstAImage, currentImage, true, sourceIsCurrent)) {
      currentSourceFailed = true;
    }
  });

  currentImage = { source: sourceB };
  currentImage = { source: sourceA };
  rejectDecode(new Error('stale decode rejected'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(currentSourceFailed, false);

  const componentSource = readFileSync(new URL('../src/components/ffxiv/job-icon.tsx', import.meta.url), 'utf8');
  assert.equal((componentSource.match(/ref=\{sourceImageRef\}/g) ?? []).length, 2);
  assert.match(componentSource, /isCurrentJobIconRequest\(/);
});

const { resolveAvailableJobIconSource } = await import('../src/components/ffxiv/job-icon-fallback.ts');
test('derived load failure falls back to the official mask once, then to the role mark', () => {
  const derived = '/assets/derived/gnb.png';
  const original = '/assets/official/masks/gnb.png';
  assert.equal(resolveAvailableJobIconSource(derived, original, []), derived);
  assert.equal(resolveAvailableJobIconSource(derived, original, [derived]), original);
  assert.equal(resolveAvailableJobIconSource(derived, original, [derived, original]), null);
  assert.equal(resolveAvailableJobIconSource(null, null, []), null);
  assert.equal(resolveAvailableJobIconSource(null, original, [derived]), original);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
const [
  { demoAdventurerData },
  { normalizeCardData },
  { getHomeResumeDraft },
  { MASTER_TEMPLATE_ORDER },
] = await Promise.all([
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
  import('../src/components/home/home-draft.ts'),
  import('../src/lib/master-card-config.ts'),
]);
const homePageSource = await readFile(new URL('../src/components/home/home-page.tsx', import.meta.url), 'utf8');
const homeCssSource = await readFile(new URL('../src/components/home/home.module.css', import.meta.url), 'utf8');

test('Home only offers resume when the local card differs from the untouched starter', () => {
  const starter = normalizeCardData(demoAdventurerData);
  assert.equal(getHomeResumeDraft(starter, starter), null);

  const savedDraft = structuredClone(starter);
  savedDraft.character.name = 'Saved adventurer';
  savedDraft.design.template = 'editorial';
  savedDraft.imageAdjustments.x = 42;

  assert.equal(getHomeResumeDraft(savedDraft, starter), savedDraft);
});

test('Home card stage lets each real master preview select its template', () => {
  const stage = homePageSource.match(/<div className={styles\.cardFan}[\s\S]*?<\/figure>/)?.[0];
  assert.ok(stage, 'Home card stage should remain inside its artwork figure');
  assert.deepEqual(MASTER_TEMPLATE_ORDER, ['cinematic', 'editorial', 'id-card']);
  assert.match(stage, /MASTER_TEMPLATE_ORDER\.map\(\(template\)/);
  assert.match(stage, /<LazyMaster[\s\S]*?template=\{template\}/);
  assert.match(stage, /<button[\s\S]*?aria-pressed=\{isActive\}/);
  assert.match(stage, /aria-label=\{`\$\{styleNames\[template\]\}/);
  assert.match(stage, /onClick=\{\(\) => setActiveTemplate\(template\)\}/);
  assert.doesNotMatch(stage, /aria-hidden=\{position !== 'center'\}/);
});

test('Home reduced-motion mode keeps all three style previews visible', () => {
  const reducedMotion = homeCssSource.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(reducedMotion, 'Home should retain a reduced-motion rule');
  assert.match(reducedMotion, /\.cardSlot\s*\{\s*transition:\s*none;/);
  assert.doesNotMatch(reducedMotion, /visibility:\s*hidden|display:\s*none/);
});

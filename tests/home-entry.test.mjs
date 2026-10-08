import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
const [{ demoAdventurerData }, { normalizeCardData }, { getHomeResumeDraft }] = await Promise.all([
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
  import('../src/components/home/home-draft.ts'),
]);

test('Home only offers resume when the local card differs from the untouched starter', () => {
  const starter = normalizeCardData(demoAdventurerData);
  assert.equal(getHomeResumeDraft(starter, starter), null);

  const savedDraft = structuredClone(starter);
  savedDraft.character.name = 'Saved adventurer';
  savedDraft.design.template = 'editorial';
  savedDraft.imageAdjustments.x = 42;

  assert.equal(getHomeResumeDraft(savedDraft, starter), savedDraft);
});

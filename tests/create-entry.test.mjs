import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
const [{ demoAdventurerData }, { normalizeCardData }, { editorStore }, {
  getSampleConfirmationFocusTarget,
  getUploadConfirmationFocusTarget,
  getTemplatePhotoPath,
  parseTemplateChoice,
  hasNonSampleDraft,
}] = await Promise.all([
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
  import('../src/store/editor-store.ts'),
  import('../src/app/create/create-draft.ts'),
]);

test('the canonical starter state does not ask to replace a saved card', () => {
  const normalizedStarter = normalizeCardData(demoAdventurerData);
  assert.equal(hasNonSampleDraft(normalizedStarter, normalizedStarter), false);
  assert.equal(hasNonSampleDraft(editorStore.getState().toCardData(), normalizedStarter), false);
});

test('create entry protects saved character, design, framing, and image changes', () => {
  const edits = [
    (draft) => { draft.character.name = 'A saved adventurer'; },
    (draft) => { draft.design.template = 'editorial'; },
    (draft) => { draft.imageAdjustments.x = 42; },
    (draft) => { draft.imageUrl = 'data:image/webp;base64,custom'; },
  ];

  for (const edit of edits) {
    const draft = structuredClone(demoAdventurerData);
    edit(draft);
    assert.equal(hasNonSampleDraft(draft, normalizeCardData(demoAdventurerData)), true);
  }
});

test('sample replacement focus opens on confirmation, restores on cancel, and stays still otherwise', () => {
  assert.equal(getSampleConfirmationFocusTarget(false, false), null);
  assert.equal(getSampleConfirmationFocusTarget(true, false), 'confirmation');
  assert.equal(getSampleConfirmationFocusTarget(false, true), 'trigger');
  assert.equal(getSampleConfirmationFocusTarget(true, true), null);
});

test('upload replacement focus opens on confirmation and returns to the picker on cancel', () => {
  assert.equal(getUploadConfirmationFocusTarget(false, false), null);
  assert.equal(getUploadConfirmationFocusTarget(true, false), 'confirmation');
  assert.equal(getUploadConfirmationFocusTarget(false, true, 'cancelled'), 'trigger');
  assert.equal(getUploadConfirmationFocusTarget(false, true, 'accepted'), 'continue');
  assert.equal(getUploadConfirmationFocusTarget(true, true), null);
});

test('each selected master carries into the photo step in the URL', () => {
  assert.equal(getTemplatePhotoPath('cinematic'), '/create?template=cinematic');
  assert.equal(getTemplatePhotoPath('editorial'), '/create?template=editorial');
  assert.equal(getTemplatePhotoPath('id-card'), '/create?template=id-card');
});

test('route template selection accepts only known masters', () => {
  assert.equal(parseTemplateChoice('editorial'), 'editorial');
  assert.equal(parseTemplateChoice(['id-card', 'cinematic']), 'id-card');
  assert.equal(parseTemplateChoice('other'), null);
  assert.equal(parseTemplateChoice(null), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
const [{ demoAdventurerData, getConerSample }, { normalizeCardData }, { editorStore }, {
  getSampleConfirmationFocusTarget,
  getUploadConfirmationFocusTarget,
  canApplyPreparedUpload,
  getTemplatePhotoPath,
  parseTemplateChoice,
  hasNonSampleDraft,
}, { createNewUserCardFromUpload }] = await Promise.all([
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
  import('../src/store/editor-store.ts'),
  import('../src/app/create/create-draft.ts'),
  import('../src/lib/new-user-card.ts'),
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

test('a new uploaded-photo card starts with only its image and selected master', () => {
  const palette = { primary: '#123456', accent: '#abcdef', light: '#ffffff', dark: '#000000' };
  const upload = createNewUserCardFromUpload('editorial', 'data:image/png;base64,QQ==', palette);
  const card = normalizeCardData(upload);

  assert.equal(card.imageUrl, 'data:image/png;base64,QQ==');
  assert.equal(card.design.template, 'editorial');
  assert.deepEqual(card.design.palette, palette);
  assert.equal(card.character.profileOrigin, 'user');
  assert.equal(card.character.name, '');
  assert.equal(card.character.job, '');
  assert.equal(card.character.level, 0);
  assert.equal(card.character.world, '');
  assert.equal(card.character.race, '');
  assert.equal(card.character.freeCompany, '');
  assert.equal(card.character.bio, '');
  assert.deepEqual(card.character.languages, []);
  assert.deepEqual(card.character.playStyles, []);
  assert.equal(card.character.service, null);
});

test('bundled samples stay sample profiles and marker-free legacy defaults remain unchanged', () => {
  const sample = normalizeCardData(getConerSample('cinematic', '4:5'));
  assert.equal(sample.character.profileOrigin, undefined);
  assert.equal(sample.character.name, 'Coner');

  const legacyPartial = normalizeCardData({
    imageUrl: 'data:image/png;base64,QQ==',
    design: { template: 'cinematic' },
    character: { name: '', job: '', bio: '', level: 0 },
  });
  assert.equal(legacyPartial.character.profileOrigin, undefined);
  assert.equal(legacyPartial.character.name, '');
  assert.equal(legacyPartial.character.job, sample.character.job);
  assert.equal(legacyPartial.character.level, 1);
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

test('cancelled or unmounted upload decodes cannot reach the card commit path', () => {
  let commits = 0;
  const commitIfCurrent = (token, currentToken, isMounted) => {
    if (!canApplyPreparedUpload(token, currentToken, isMounted)) return;
    commits += 1;
  };

  commitIfCurrent(4, 4, true);
  commitIfCurrent(5, 6, true);
  commitIfCurrent(7, 7, false);
  assert.equal(commits, 1);
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

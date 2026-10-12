import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ demoAdventurerData }, { editorStore }, {
  applyTemplateToEditorDraft,
  createTemplateComparisonData,
}] = await Promise.all([
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-store.ts'),
  import('../src/app/templates/template-comparison.ts'),
]);

test('template comparison changes only a copied design and preserves the selected ratio', () => {
  const source = structuredClone(demoAdventurerData);
  source.design.ratio = '16:9';
  source.imageAdjustments.x = 37;

  for (const template of ['cinematic', 'editorial', 'id-card']) {
    const preview = createTemplateComparisonData(source, template);

    assert.notStrictEqual(preview, source);
    assert.notStrictEqual(preview.design, source.design);
    assert.equal(preview.design.template, template);
    assert.equal(preview.design.layoutVariant, 'a');
    assert.equal(preview.design.ratio, '16:9');
    assert.strictEqual(preview.character, source.character);
    assert.strictEqual(preview.imageAdjustments, source.imageAdjustments);
    assert.equal(preview.imageUrl, source.imageUrl);
  }

  assert.equal(source.design.template, 'cinematic');
  assert.equal(source.design.ratio, '16:9');
});

test('explicit template editing updates only the master and keeps draft history', () => {
  const beforeStore = editorStore.getState();
  const source = structuredClone(demoAdventurerData);
  source.character.name = 'Saved Adventurer';
  source.design.ratio = '3:4';
  source.imageUrl = 'data:image/png;base64,c2F2ZWQ=';

  editorStore.setState({
    character: source.character,
    design: source.design,
    image: {
      ...source.imageAdjustments,
      src: source.imageUrl,
      fileName: 'saved.png',
      mimeType: 'image/png',
    },
    history: { past: [], future: [], groupId: null, groupHasSnapshot: false, groupScope: null, groupFields: [] },
    isHydrated: true,
  });

  try {
    const before = editorStore.getState();
    const character = before.character;
    const image = before.image;
    const previousHistory = before.history;
    const previousDesign = { ...before.design, palette: { ...before.design.palette }, effects: [...before.design.effects] };

    assert.equal(applyTemplateToEditorDraft('editorial'), true);

    const after = editorStore.getState();
    assert.strictEqual(after.character, character);
    assert.strictEqual(after.image, image);
    assert.equal(after.design.template, 'editorial');
    assert.equal(after.design.layoutVariant, 'a');
    assert.equal(after.design.ratio, '3:4');
    assert.deepEqual(after.design.palette, previousDesign.palette);
    assert.deepEqual(after.design.effects, previousDesign.effects);
    assert.equal(after.design.typographyPreset, previousDesign.typographyPreset);
    assert.equal(after.history.past.length, previousHistory.past.length + 1);
    assert.deepEqual(after.history.past.at(-1).character, character);
    assert.deepEqual(after.history.past.at(-1).image, image);
  } finally {
    editorStore.setState(beforeStore, true);
  }
});

test('a template cannot be applied before the saved draft has hydrated', () => {
  const beforeStore = editorStore.getState();
  editorStore.setState({ isHydrated: false });

  try {
    const beforeDesign = editorStore.getState().design;
    assert.equal(applyTemplateToEditorDraft('id-card'), false);
    assert.strictEqual(editorStore.getState().design, beforeDesign);
  } finally {
    editorStore.setState(beforeStore, true);
  }
});

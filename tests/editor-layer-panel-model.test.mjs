import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const { getEditorLayerPanelModel } = await import('../src/components/editor/editor-layer-panel-model.ts');

function item(id, category, fields = {}) {
  return {
    id,
    label: id,
    category,
    role: 'information',
    value: id,
    defaultValue: id,
    kind: 'text',
    editable: true,
    supportsTextOverride: false,
    visible: true,
    ...fields,
  };
}

const items = [
  item('character.name', 'identity', { field: 'name' }),
  item('character.bio', 'information', { field: 'bio' }),
  item('card.phrase', 'copy', { kind: 'caption', supportsTextOverride: true, visible: false }),
  item('card.label.job', 'copy', { kind: 'label', supportsTextOverride: true }),
  item('character.level', 'information', { field: 'level' }),
  item('character.job', 'information', { field: 'job' }),
];

test('layer panel groups actual name, bio, and editable card phrases separately from aggregate information', () => {
  const model = getEditorLayerPanelModel(items, null);

  assert.deepEqual(model.identityItems.map(({ id }) => id), ['character.name', 'character.bio']);
  assert.deepEqual(model.phraseItems.map(({ id }) => id), ['card.phrase']);
  assert.deepEqual(model.informationItems.map(({ id }) => id), ['character.level', 'character.job']);
  assert.equal(model.informationAnchor?.id, 'character.job');
  assert.equal(model.informationGroupSelected, false);
});

test('the information group keeps one selected real target when an information row is active', () => {
  const model = getEditorLayerPanelModel(items, 'character.level');

  assert.equal(model.informationGroupSelected, true);
  assert.equal(model.informationAnchor?.id, 'character.level');
  assert.equal(model.selectedItem?.id, 'character.level');
});

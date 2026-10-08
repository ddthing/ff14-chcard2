import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ editorStore }, { demoAdventurerData }, { loadEditorDraft, normalizeCardData, persistEditorDraft, EDITOR_STORAGE_KEY }] = await Promise.all([
  import('../src/store/editor-store.ts'),
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
]);

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('legacy and invalid motif settings normalize to visible with the family accent', () => {
  const normalized = normalizeCardData(demoAdventurerData);
  assert.equal(normalized.design.jobMotifVisible, true);
  assert.equal(normalized.design.jobIconColor, null);

  const edited = normalizeCardData({
    ...demoAdventurerData,
    design: { ...demoAdventurerData.design, jobMotifVisible: false, jobIconColor: '#5a2f9c' },
  });
  assert.equal(edited.design.jobMotifVisible, false);
  assert.equal(edited.design.jobIconColor, '#5a2f9c');

  const invalid = normalizeCardData({
    ...demoAdventurerData,
    design: { ...demoAdventurerData.design, jobMotifVisible: 'off', jobIconColor: 'red; background: url(x)' },
  });
  assert.equal(invalid.design.jobMotifVisible, true);
  assert.equal(invalid.design.jobIconColor, null);
});

test('motif visibility and tone participate in design undo, redo, and draft persistence', () => {
  editorStore.getState().replaceCardData(demoAdventurerData, { persist: false, recordHistory: false });
  editorStore.getState().setDesign({ colorMode: 'job' });
  editorStore.getState().updateDesign('jobMotifVisible', false);
  editorStore.getState().updateDesign('jobIconColor', '#7957a7');

  assert.equal(editorStore.getState().design.colorMode, 'job');
  assert.equal(editorStore.getState().design.jobMotifVisible, false);
  assert.equal(editorStore.getState().design.jobIconColor, '#7957a7');

  editorStore.getState().undo();
  assert.equal(editorStore.getState().design.jobIconColor, null);
  assert.equal(editorStore.getState().design.jobMotifVisible, false);
  editorStore.getState().undo();
  assert.equal(editorStore.getState().design.jobMotifVisible, true);
  assert.equal(editorStore.getState().design.colorMode, 'job');
  editorStore.getState().undo();
  assert.equal(editorStore.getState().design.colorMode, 'auto');

  editorStore.getState().redo();
  editorStore.getState().redo();
  editorStore.getState().redo();
  assert.equal(editorStore.getState().design.jobMotifVisible, false);
  assert.equal(editorStore.getState().design.jobIconColor, '#7957a7');
  assert.equal(editorStore.getState().design.colorMode, 'job');

  const storage = new MemoryStorage();
  assert.equal(persistEditorDraft(editorStore.getState().toCardData(), storage), true);
  const saved = JSON.parse(storage.getItem(EDITOR_STORAGE_KEY));
  assert.equal(saved.card.design.jobMotifVisible, false);
  assert.equal(saved.card.design.jobIconColor, '#7957a7');

  const loaded = loadEditorDraft(storage);
  assert.equal(loaded.card.design.jobMotifVisible, false);
  assert.equal(loaded.card.design.jobIconColor, '#7957a7');
  assert.equal(loaded.card.design.colorMode, 'job');
});

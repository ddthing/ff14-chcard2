import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { getTextTargetBounds, placeTextTargets } = await import('../src/components/editor/text-editor/text-target-geometry.ts');
const {
  getCardTextItemOrdinal,
  getEditorTextCategory,
  getTextItemsForCategory,
  resolveSelectedTextItem,
} = await import('../src/components/editor/text-editor/card-text-model.ts');
const { selectTextEditorControl } = await import('../src/components/editor/text-editor/text-editor-focus.ts');
const pickerSource = await readFile(new URL('../src/components/editor/ffxiv-pickers.tsx', import.meta.url), 'utf8');
const workspaceSource = await readFile(new URL('../src/components/editor/editor-workspace.tsx', import.meta.url), 'utf8');

const item = (id, category, fields = {}) => ({
  id,
  label: id,
  category,
  role: 'information',
  kind: 'text',
  field: undefined,
  defaultValue: id,
  value: id,
  editable: true,
  supportsTextOverride: false,
  visible: true,
  ...fields,
});

test('on-card text targets use transformed viewport bounds, expand to 44px, and stay in the stage clip', () => {
  const bounds = getTextTargetBounds(
    { left: 130, top: 85, right: 151, bottom: 103 },
    390,
    844,
    44,
    { left: 100, top: 70, right: 300, bottom: 500 },
  );

  assert.deepEqual(bounds, { left: 118.5, top: 72, width: 44, height: 44 });
  assert.equal(getTextTargetBounds(
    { left: 280, top: 480, right: 310, bottom: 520 },
    390,
    844,
    44,
    { left: 100, top: 70, right: 300, bottom: 500 },
  )?.left, 256);
  assert.equal(getTextTargetBounds({ left: 0, top: 0, right: 0, bottom: 10 }, 390, 844), null);
});

test('dense text keeps non-overlapping 44px targets and uses exact text bounds for collisions', () => {
  const placements = placeTextTargets([
    { left: 20, top: 20, right: 44, bottom: 36 },
    { left: 38, top: 21, right: 62, bottom: 37 },
    { left: 150, top: 150, right: 190, bottom: 170 },
  ], 390, 844, 44, { left: 0, top: 0, right: 390, bottom: 500 });

  assert.equal(placements[0].compact, true);
  assert.equal(placements[1].compact, true);
  assert.deepEqual(placements[0].targetBounds, { left: 20, top: 20, width: 24, height: 16 });
  assert.equal(placements[0].expandedBounds.width, 44);
  assert.equal(placements[0].expandedBounds.height, 44);
  assert.equal(placements[2].compact, false);
  assert.equal(placements[2].targetBounds.width, 44);
});

test('the Name + Bio category includes canonical bio items and keeps hidden items in stable numbering', () => {
  const items = [
    item('character.name', 'identity', { field: 'name' }),
    item('character.bio', 'information', { field: 'bio' }),
    item('character.job', 'information', { field: 'job', visible: false, value: '' }),
    item('character.level', 'information', { field: 'level' }),
    item('identity.banner', 'copy'),
  ];

  assert.equal(getEditorTextCategory(items[1]), 'identity');
  assert.deepEqual(getTextItemsForCategory(items, 'identity').map(({ id }) => id), ['character.name', 'character.bio']);
  assert.equal(getCardTextItemOrdinal(getTextItemsForCategory(items, 'information'), 'character.level'), 2);
  assert.equal(resolveSelectedTextItem(items, 'identity', 'missing')?.id, 'character.name');
  assert.equal(resolveSelectedTextItem(items, 'identity', 'character.bio')?.id, 'character.bio');
});

test('the overlay is rendered through a body portal outside the card/export subtree', async () => {
  const overlay = await readFile(new URL('../src/components/editor/text-editor/card-text-overlay.tsx', import.meta.url), 'utf8');
  const preview = await readFile(new URL('../src/components/editor/card-preview.tsx', import.meta.url), 'utf8');

  assert.match(overlay, /createPortal\([\s\S]*?document\.body/u);
  assert.match(overlay, /data-card-text-target=\{target\.id\}/u);
  assert.match(overlay, /data-compact=\{target\.compact \? 'true' : 'false'\}/u);
  assert.doesNotMatch(overlay, /target\.expandedBounds/u);
  assert.match(overlay, /!target\.compact \|\| isSelected/u);
  assert.doesNotMatch(preview, /CardTextOverlay/u);
});

test('composite card fields focus the exact nested picker selected by its text slot', () => {
  const makeControl = ({ id, tag = 'div', count = 0, parentElement = null }) => ({
    parentElement,
    getAttribute: (name) => name === 'data-card-text-editor-control' ? id : null,
    matches: (selector) => selector.split(', ').includes(tag),
    querySelectorAll: () => ({ length: count }),
  });
  const worldField = makeControl({ id: 'character.dataCenter', count: 8 });
  const worldPicker = makeControl({ id: 'character.dataCenter', count: 2, parentElement: worldField });
  const dataCenterSelect = makeControl({ id: 'character.dataCenter', tag: 'select', parentElement: worldPicker });
  assert.equal(selectTextEditorControl([worldField, worldPicker, dataCenterSelect], 'character.dataCenter'), dataCenterSelect);

  const raceClanGroup = makeControl({ id: 'character.clan', count: 4 });
  const clanPicker = makeControl({ id: 'character.clan', count: 2, parentElement: raceClanGroup });
  assert.equal(selectTextEditorControl([raceClanGroup, clanPicker], 'character.clan'), clanPicker);

  const originGroup = makeControl({ id: 'character.origin', count: 8 });
  const originWorldPicker = makeControl({ id: 'character.origin', count: 2, parentElement: originGroup });
  const serviceSelect = makeControl({ id: 'character.origin', tag: 'select', parentElement: originGroup });
  assert.equal(selectTextEditorControl([originGroup, originWorldPicker, serviceSelect], 'character.origin'), serviceSelect);
  assert.match(pickerSource, /editorControlId="character\.clan"/u);
  assert.match(pickerSource, /data-card-text-editor-control="character\.dataCenter"/u);
  assert.match(workspaceSource, /itemId === 'character\.origin'[\s\S]*?MemoWorldPicker[^>]*editorControlId=\{item\.id\}/u);
  assert.match(pickerSource, /data-card-text-editor-control=\{editorControlId === 'character\.origin' \? editorControlId : undefined\}[\s\S]*?value=\{service\}/u);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const { getTextTargetBounds, placeTextTargets } = await import('../src/components/editor/text-editor/text-target-geometry.ts');
const {
  getCardTextItemOrdinal,
  getEditorTextCategory,
  getIndividualTypographyOrdinal,
  getInformationTypographyItems,
  getTypographyGroupPrimaryScript,
  isIndividualTypographyItem,
  getTextItemsForCategory,
  resolveSelectedTextItem,
} = await import('../src/components/editor/text-editor/card-text-model.ts');
const { getTypographyFontOptions, getTypographyScriptsForText } = await import('../src/lib/typography-presets.ts');
const { selectTextEditorControl } = await import('../src/components/editor/text-editor/text-editor-focus.ts');
const pickerSource = await readFile(new URL('../src/components/editor/ffxiv-pickers.tsx', import.meta.url), 'utf8');
const workspaceSource = await readFile(new URL('../src/components/editor/editor-workspace.tsx', import.meta.url), 'utf8');
const navigationSource = await readFile(new URL('../src/components/editor/text-editor/card-text-editor.tsx', import.meta.url), 'utf8');
const cardTextEditorStyles = await readFile(new URL('../src/components/editor/text-editor/card-text-editor.module.css', import.meta.url), 'utf8');
const typographySource = await readFile(new URL('../src/components/editor/typography-role-editor.tsx', import.meta.url), 'utf8');

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

test('individual typography targets are name, bio, and decorative copy; small information is one group', () => {
  const items = [
    item('character.name', 'identity', { field: 'name' }),
    item('character.bio', 'information', { field: 'bio' }),
    item('character.job', 'information', { field: 'job' }),
    item('character.level', 'information', { field: 'level', visible: false, value: '' }),
    item('cinematic.label.job', 'information', { kind: 'label', supportsTextOverride: true }),
    item('cinematic.promise', 'copy', { supportsTextOverride: true }),
    item('editorial.story', 'copy', { supportsTextOverride: true }),
    item('identity.label.job', 'copy', { kind: 'label', supportsTextOverride: true }),
  ];

  assert.deepEqual(items.filter(isIndividualTypographyItem).map(({ id }) => id), [
    'character.name', 'character.bio', 'cinematic.promise', 'editorial.story',
  ]);
  assert.deepEqual(getInformationTypographyItems(items).map(({ id }) => id), [
    'character.job', 'character.level', 'cinematic.label.job',
  ]);
  assert.ok(getInformationTypographyItems(items).some(({ id, visible }) => id === 'character.level' && !visible));
  assert.match(navigationSource, /TEXT_ITEM_SELECTOR_CATEGORIES:[\s\S]*?= \['identity', 'copy', 'information'\]/u);
  assert.match(navigationSource, /<select[\s\S]*?data-text-item-select="true"[\s\S]*?aria-label=\{copy\.textEditor\.items\}/u);
  assert.match(navigationSource, /<optgroup[\s\S]*?disabled=\{disabledCategories\.includes\(itemCategory\)\}/u);
  assert.match(navigationSource, /getTextItemsForCategory\(items, itemCategory\)\.map\(\(item\) =>/u);
  assert.match(navigationSource, /const nextCategory = getEditorTextCategory\(item\)[\s\S]*?onCategoryChange\(nextCategory\)[\s\S]*?onSelectItem\(item\)/u);
  assert.match(navigationSource, /!item\.value\.trim\(\) \? ` · \$\{copy\.textEditor\.hiddenText\}`/u);
  assert.doesNotMatch(navigationSource, /data-text-navigation|categoryItems\.length > 2/u);
  assert.match(typographySource, /const informationGroup = selectedItem\.category === 'information' && !isIndividualTypographyItem\(selectedItem\)/u);
});

test('text editor fields use shared density tokens and retain readable multiline input', () => {
  assert.match(cardTextEditorStyles, /\.contentEditor\s*\{[^}]*gap:\s*var\(--editor-density-field-gap, 8px\)/u);
  assert.match(cardTextEditorStyles, /\.contentEditor label\s*\{[^}]*gap:\s*var\(--editor-density-label-gap, 4px\)/u);
  assert.match(cardTextEditorStyles, /\.resetContent\s*\{[^}]*min-height:\s*var\(--editor-density-control-height, 44px\)/u);
  assert.match(cardTextEditorStyles, /\.globalTypography select\s*\{[^}]*min-height:\s*var\(--editor-density-control-height, 44px\)/u);
  assert.match(cardTextEditorStyles, /\.defaultCopyButton\s*\{[^}]*min-height:\s*var\(--editor-density-control-height, 44px\)/u);
  assert.match(cardTextEditorStyles, /\.contentEditor input,[\s\S]*?min-height:\s*var\(--editor-density-control-height, 44px\)[\s\S]*?font-size:\s*var\(--editor-density-input-font-size, 16px\)/u);
  assert.match(cardTextEditorStyles, /\.contentEditor textarea\s*\{[^}]*min-height:\s*72px/u);
  assert.match(cardTextEditorStyles, /@media \(max-width: 420px\)[\s\S]*?\.contentEditor textarea \{ min-height: 64px; \}/u);
});

test('creative target ordinals stay unique across Name + Bio and Card phrases', () => {
  const items = [
    item('character.name', 'identity', { field: 'name' }),
    item('character.job', 'information', { field: 'job' }),
    item('character.bio', 'information', { field: 'bio' }),
    item('cinematic.promise', 'copy', { supportsTextOverride: true }),
    item('cinematic.quote', 'copy', { supportsTextOverride: true }),
    item('cinematic.signature', 'copy', { supportsTextOverride: true, visible: false, value: '' }),
    item('cinematic.label.job', 'information', { kind: 'label', supportsTextOverride: true }),
  ];

  assert.deepEqual(items.map(({ id }) => getIndividualTypographyOrdinal(items, id)), [1, 0, 2, 3, 4, 5, 0]);
  assert.match(navigationSource, /getIndividualTypographyOrdinal\(items, item\.id\)/u);
  assert.match(navigationSource, /ordinal > 0 \? `\$\{ordinal\}\. ` : ''/u);
});

test('mixed Japanese and Latin detail values still have a Japanese-primary group font choice', () => {
  const localeFallback = 'japanese';
  const requiredScripts = Array.from(new Set([
    ...getTypographyScriptsForText('Tonberry', localeFallback),
    ...getTypographyScriptsForText('冒険者の紹介', localeFallback),
  ]));
  const primaryScript = getTypographyGroupPrimaryScript(requiredScripts, localeFallback);
  const selectableFonts = getTypographyFontOptions().filter((font) => font.supportedScripts.includes(primaryScript));

  assert.deepEqual(requiredScripts, ['latin', 'japanese']);
  assert.equal(primaryScript, 'japanese');
  assert.equal(getTypographyGroupPrimaryScript(requiredScripts, 'latin'), 'japanese');
  assert.ok(selectableFonts.some((font) => font.id === 'noto-sans-jp'));
  assert.match(typographySource, /getTypographyScriptsForText\(target\.value \|\| target\.defaultValue, localeScript\)/u);
  assert.match(typographySource, /getTypographyGroupPrimaryScript\(requiredScripts, localeScript\)/u);
  assert.match(typographySource, /requiredScripts\.some\(\(requiredScript\) => !selectedEntry\.supportedScripts\.includes\(requiredScript\)\)/u);
});

test('the overlay is rendered through a body portal outside the card/export subtree', async () => {
  const overlay = await readFile(new URL('../src/components/editor/text-editor/card-text-overlay.tsx', import.meta.url), 'utf8');
  const overlayStyles = await readFile(new URL('../src/components/editor/text-editor/card-text-overlay.module.css', import.meta.url), 'utf8');
  const preview = await readFile(new URL('../src/components/editor/card-preview.tsx', import.meta.url), 'utf8');

  assert.match(overlay, /createPortal\([\s\S]*?document\.body/u);
  assert.match(overlay, /data-card-text-target=\{target\.id\}/u);
  assert.match(overlay, /data-information-group=\{isInformationGroup \? 'true' : undefined\}/u);
  assert.match(overlay, /data-card-text-badge-hit="true"[\s\S]*?width: badge\.width[\s\S]*?height: badge\.height/u);
  assert.match(overlayStyles, /\.badgeHit\s*\{[^}]*pointer-events:\s*auto/u);
  assert.match(overlayStyles, /\.badge,\s*\.groupMarker\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/u);
  assert.match(overlay, /onClick=\{\(event\) => \{[\s\S]*?onSelect\(item, event\.detail === 0\)/u);
  assert.match(overlay, /window\.matchMedia\('\(pointer: coarse\)'\)\.matches \? \[44, 24\] : \[24\]/u);
  assert.match(overlay, /neighboringTextTargets[\s\S]*?\[\.\.\.allTextRects, \.\.\.neighboringTextTargets\]/u);
  assert.match(cardTextEditorStyles, /min-height:\s*var\(--editor-density-control-height, 44px\)/u);
  assert.match(cardTextEditorStyles, /font-size:\s*var\(--editor-density-input-font-size, 14px\)/u);
  assert.match(overlay, /informationTargetLabel\?: string/u);
  assert.match(overlay, /currentItems\.filter\(\(item\) => item\.visible && isIndividualTypographyItem\(item\)\)/u);
  assert.match(overlay, /getInformationTypographyItems\(currentItems\)\.filter\(\(item\) => item\.visible\)/u);
  assert.match(overlay, /target\.textOutlines\.map/u);
  assert.match(overlay, /data-compact=\{target\.compact \? 'true' : 'false'\}/u);
  assert.doesNotMatch(overlay, /target\.expandedBounds/u);
  assert.match(overlayStyles, /\.target\s*\{[^}]*border:\s*0/u);
  assert.match(overlayStyles, /\.textOutline\s*\{[^}]*border:\s*1px solid transparent/u);
  assert.match(overlayStyles, /\.badge,\s*\.groupMarker\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/u);
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

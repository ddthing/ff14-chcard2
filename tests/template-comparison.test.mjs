import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const templatePageSource = await readFile(new URL('../src/app/templates/templates-page.tsx', import.meta.url), 'utf8');
const templateStyles = await readFile(new URL('../src/app/templates/templates.module.css', import.meta.url), 'utf8');

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

test('mobile style selectors expose every localized card and stay in sync with the snap gallery', () => {
  const selectorMarkup = templatePageSource.match(/<div className=\{styles\.mobileStyleSelectors\}[^>]*>([\s\S]*?)<\/div>/u)?.[1] ?? '';

  assert.match(selectorMarkup, /MASTER_TEMPLATE_ORDER\.map\(\(template\)/u);
  assert.match(selectorMarkup, /aria-pressed=\{selected === template\}/u);
  assert.match(selectorMarkup, /aria-controls=\{template\}/u);
  assert.match(selectorMarkup, /onClick=\{\(\) => chooseTemplate\(template\)\}/u);
  assert.match(selectorMarkup, /\{names\[template\]\}/u);
  assert.match(templateStyles, /\.galleryCard\[data-selected='true'\] \.visualStage \{[^}]*outline:\s*2px solid var\(--app-accent\)[^}]*box-shadow:\s*0 10px 22px rgb\(0 0 0 \/ 12%\)/u);
  assert.match(templateStyles, /\.masterCopy strong \{[^}]*font-size:\s*1\.125rem/u);
  assert.match(templateStyles, /@media \(max-width: 760px\)[\s\S]*?\.mobileStyleSelectors \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(templateStyles, /\.mobileStyleSelector \{[^}]*min-height: 48px/u);
  assert.match(templateStyles, /\.page :is\(a, button\):focus-visible \{[^}]*outline: 2px solid var\(--app-focus\)/u);
});

test('the unavailable personal comparison explains itself beside the disabled mode control', () => {
  assert.match(templatePageSource, /compareUnavailable: '내 카드 비교는 카드를 만든 뒤 사용할 수 있어요\.'/u);
  assert.match(templatePageSource, /compareUnavailable: 'Create a card to use My card\.'/u);
  assert.match(templatePageSource, /compareUnavailable: '自分のカードを作成すると比較できます。'/u);
  assert.match(templatePageSource, /: !draft\s*\?\s*labels\.compareUnavailable/u);
  assert.match(templatePageSource, /disabled=\{!draftReady \|\| !draft\}/u);
  assert.match(templatePageSource, /aria-describedby=\{comparisonUnavailable \? 'comparison-status' : undefined\}/u);
  assert.match(templatePageSource, /className=\{comparisonUnavailable \? styles\.compareStatus : styles\.srOnly\}[\s\S]*?id="comparison-status"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?\{status\}/u);
  assert.doesNotMatch(templatePageSource, /labels\.noDraft|selectionCopy\.emptyState/u);
});

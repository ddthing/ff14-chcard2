import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import test from 'node:test';
import { getEditorCopy } from '../src/components/editor/copy.ts';
import {
  EDITOR_TASK_FOR_PANEL,
  EDITOR_TASK_IDS,
  EDITOR_TASK_PANEL,
  getEditorTaskForPanel,
  getEditorTaskActivation,
  getEditorEntryPanel,
} from '../src/components/editor/editor-navigation.ts';

register('./ts-alias-loader.mjs', import.meta.url);
const [{ editorStore }, { isCardDecorativeCopy }, { applyDefaultCopySample, applyGlobalTypographyPreset, resetLegacyTypographyRole }] = await Promise.all([
  import('../src/store/editor-store.ts'),
  import('../src/components/cards/types.ts'),
  import('../src/components/editor/text-editor/card-text-actions.ts'),
]);

const workspaceSource = readFileSync(new URL('../src/components/editor/editor-workspace.tsx', import.meta.url), 'utf8');
const editorStyles = readFileSync(new URL('../src/app/editor/editor.module.css', import.meta.url), 'utf8');
const textEditorSource = readFileSync(new URL('../src/components/editor/text-editor/card-text-editor.tsx', import.meta.url), 'utf8');
const typographyEditorSource = readFileSync(new URL('../src/components/editor/typography-role-editor.tsx', import.meta.url), 'utf8');

test('new unnamed user cards enter identity editing without changing existing task choices', () => {
  assert.equal(getEditorEntryPanel({ profileOrigin: 'user', name: '' }, 'screenshot'), 'information');
  assert.equal(getEditorEntryPanel({ profileOrigin: 'user', name: '  ' }, 'screenshot'), 'information');
  assert.equal(getEditorEntryPanel({ profileOrigin: 'user', name: 'My character' }, 'screenshot'), 'screenshot');
  assert.equal(getEditorEntryPanel({ name: 'Coner' }, 'screenshot'), 'screenshot');
  assert.equal(getEditorEntryPanel({ profileOrigin: 'user', name: '' }, 'style'), 'style');
});

test('six existing editor panels remain reachable through the three V3 task tabs', () => {
  assert.deepEqual(EDITOR_TASK_IDS, ['photo', 'information', 'design']);
  assert.deepEqual(EDITOR_TASK_FOR_PANEL, {
    screenshot: 'photo',
    character: 'information',
    information: 'information',
    template: 'design',
    style: 'design',
    effects: 'design',
  });
  assert.deepEqual(EDITOR_TASK_PANEL, {
    photo: 'screenshot',
    information: 'character',
    design: 'template',
  });
  for (const [panel, task] of Object.entries(EDITOR_TASK_FOR_PANEL)) {
    assert.equal(getEditorTaskForPanel(panel), task);
  }
});

test('mobile task controls toggle their sheet and preserve desktop inspector selection', () => {
  assert.deepEqual(getEditorTaskActivation('photo', 'screenshot', false, true), {
    activePanel: 'screenshot',
    inspectorOpen: true,
  });
  assert.deepEqual(getEditorTaskActivation('photo', 'screenshot', true, true), {
    activePanel: 'screenshot',
    inspectorOpen: false,
  });
  assert.deepEqual(getEditorTaskActivation('information', 'information', false, true), {
    activePanel: 'information',
    inspectorOpen: true,
  });
  assert.deepEqual(getEditorTaskActivation('design', 'screenshot', true, true), {
    activePanel: 'template',
    inspectorOpen: true,
  });
  assert.deepEqual(getEditorTaskActivation('information', 'information', true, false), {
    activePanel: 'character',
    inspectorOpen: true,
  });
});

test('V3 task names stay localized across the supported app languages', () => {
  assert.deepEqual(getEditorCopy('ko').tasks, { photo: '사진', information: '내용', design: '디자인' });
  assert.deepEqual(getEditorCopy('en').tasks, { photo: 'Photo', information: 'Content', design: 'Design' });
  assert.deepEqual(getEditorCopy('ja').tasks, { photo: '写真', information: 'コンテンツ', design: 'デザイン' });
  assert.deepEqual(['ko', 'en', 'ja'].map((locale) => getEditorCopy(locale).textEditor.categories), [
    { identity: '이름 + 소개', information: '캐릭터 정보', copy: '카드 문구' },
    { identity: 'Name + Bio', information: 'Character information', copy: 'Card phrases' },
    { identity: '名前・紹介', information: 'キャラクター情報', copy: 'カードの文言' },
  ]);
  assert.deepEqual(['ko', 'en', 'ja'].map((locale) => getEditorCopy(locale).sampleBadge), ['예시', 'Sample', 'サンプル']);
});

test('Card Phrases uses one default-sample action and saved copy modes remain valid', () => {
  const locales = ['ko', 'en', 'ja'];
  assert.deepEqual(locales.map((locale) => getEditorCopy(locale).textEditor.restoreDefaultCopy), ['기본 문구로 복원', 'Restore default phrases', '標準の文言に戻す']);
  assert.deepEqual(['none', 'default', 'adventure', 'companions'].map((mode) => isCardDecorativeCopy(mode)), [true, true, true, true]);
  assert.match(textEditorSource, /export function DefaultCopySampleButton/u);
  assert.match(textEditorSource, /onClick=\{\(\) => applyDefaultCopySample\(copyIds\)\}/u);

  const previousDesign = editorStore.getState().design;
  const historyLength = editorStore.getState().history.past.length;
  const priorOverrides = {
    'cinematic.promise': 'Custom promise',
    'cinematic.label.job': 'Custom job label',
    'editorial.story': 'Other master story',
  };
  const priorTypography = { ...(previousDesign.textTypography ?? {}), 'cinematic.promise': { sizePercent: 112 } };
  try {
    editorStore.getState().setDesign({
      decorativeCopy: 'adventure',
      textOverrides: priorOverrides,
      textTypography: priorTypography,
    }, { recordHistory: false, persist: false });

    applyDefaultCopySample(['cinematic.promise', 'cinematic.quote']);

    assert.equal(editorStore.getState().design.decorativeCopy, 'default');
    assert.deepEqual(editorStore.getState().design.textOverrides, {
      'cinematic.label.job': 'Custom job label',
      'editorial.story': 'Other master story',
    });
    assert.deepEqual(editorStore.getState().design.textTypography, priorTypography);
    assert.equal(editorStore.getState().history.past.length, historyLength + 1);

    editorStore.getState().undo();
    assert.equal(editorStore.getState().design.decorativeCopy, 'adventure');
    assert.deepEqual(editorStore.getState().design.textOverrides, priorOverrides);
    assert.deepEqual(editorStore.getState().design.textTypography, priorTypography);
  } finally {
    editorStore.getState().setDesign({
      decorativeCopy: previousDesign.decorativeCopy,
      textOverrides: previousDesign.textOverrides,
      textTypography: previousDesign.textTypography,
    }, { recordHistory: false, persist: false });
  }
});

test('global card typography preset labels remain localized and the picker updates the saved design', () => {
  const copies = ['ko', 'en', 'ja'].map((locale) => getEditorCopy(locale));
  for (const copy of copies) {
    assert.deepEqual(Object.keys(copy.typographyNames).sort(), ['classic', 'clean', 'condensed', 'editorial', 'modern']);
  }
  assert.match(textEditorSource, /export function GlobalTypographyPresetPicker/u);
  assert.match(textEditorSource, /onChange=\{\(event\) => applyGlobalTypographyPreset\(event\.currentTarget\.value as CardTypographyPreset\)\}/u);
  assert.match(typographyEditorSource, /setTextTypographyOverride\(item\.id, next/u);
  assert.match(typographyEditorSource, /resetTextTypographyOverride\(item\.id/u);
  assert.match(typographyEditorSource, /hasInheritedOverride/u);
  assert.match(typographyEditorSource, /resetLegacyTypographyRole\(item\.role\)/u);
  const advancedTypographyControls = typographyEditorSource.match(/<details className=\{styles\.advanced\}>([\s\S]*?)<\/details>/u)?.[1] ?? '';
  assert.match(advancedTypographyControls, /hasInheritedOverride[\s\S]*?resetLegacyTypographyRole\(item\.role\)/u);

  const priorPreset = editorStore.getState().design.typographyPreset;
  try {
    applyGlobalTypographyPreset('modern');
    assert.equal(editorStore.getState().design.typographyPreset, 'modern');
  } finally {
    editorStore.getState().setDesign({ typographyPreset: priorPreset }, { recordHistory: false, persist: false });
  }
});

test('a saved role style can be reset from the selected text editor with an undoable store change', () => {
  const previousTypography = editorStore.getState().design.typography;
  const historyLength = editorStore.getState().history.past.length;
  try {
    editorStore.getState().setDesign({
      typography: { ...(previousTypography ?? {}), display: { ...(previousTypography?.display ?? {}), sizePercent: 110 } },
    }, { recordHistory: false, persist: false });
    assert.equal(editorStore.getState().design.typography?.display?.sizePercent, 110);
    resetLegacyTypographyRole('display');
    assert.equal(editorStore.getState().design.typography?.display, undefined);
    assert.equal(editorStore.getState().history.past.length, historyLength + 1);
  } finally {
    editorStore.getState().setDesign({ typography: previousTypography }, { recordHistory: false, persist: false });
  }
});

test('experimental layouts keep saved overrides but expose only canonical fields and the global font preset', () => {
  const previousDesign = editorStore.getState().design;
  const textOverrides = { 'cinematic.promise': 'Saved phrase' };
  const textTypography = { 'character.name': { sizePercent: 110 } };
  try {
    editorStore.getState().setDesign({ layoutVariant: 'b', textOverrides, textTypography }, { recordHistory: false, persist: false });
    assert.deepEqual(editorStore.getState().design.textOverrides, textOverrides);
    assert.deepEqual(editorStore.getState().design.textTypography, textTypography);
    editorStore.getState().setDesign({ layoutVariant: 'a' }, { recordHistory: false, persist: false });
    assert.deepEqual(editorStore.getState().design.textOverrides, textOverrides);
    assert.deepEqual(editorStore.getState().design.textTypography, textTypography);
  } finally {
    editorStore.getState().setDesign({
      layoutVariant: previousDesign.layoutVariant,
      textOverrides: previousDesign.textOverrides,
      textTypography: previousDesign.textTypography,
    }, { recordHistory: false, persist: false });
  }

  assert.match(workspaceSource, /supportsPerItemTextEditing \? textItems : textItems\.filter\(\(item\) => item\.field !== undefined\)/u);
  assert.match(workspaceSource, /disabledCategories=\{supportsPerItemTextEditing \? \[\] : \['copy'\]\}/u);
  assert.match(workspaceSource, /!supportsPerItemTextEditing && \([\s\S]*?copy\.textEditor\.globalTypographyOnly/u);
  assert.match(workspaceSource, /supportsPerItemTextEditing\s*\?\s*<TypographyRoleEditor/u);
  assert.match(workspaceSource, /enabled=\{contentTextEditing && !previewOpen && design\.layoutVariant === 'a'\}/u);
  assert.deepEqual(['ko', 'en', 'ja'].map((locale) => getEditorCopy(locale).textEditor.globalTypographyOnly), [
    '현재 스타일에서는 카드 전체 서체를 조절합니다.',
    'This style uses one font for the whole card.',
    '現在のスタイルではカード全体のフォントを調整します。',
  ]);
});

test('V3 tabs keep real editor controls connected to the existing store and preview', () => {
  assert.match(workspaceSource, /role=\{isMobileDock \? 'toolbar' : 'tablist'\}/u);
  assert.match(workspaceSource, /role=\{isMobileViewport \? 'region' : 'tabpanel'\}/u);
  assert.match(workspaceSource, /aria-expanded=\{isMobileDock \? isSelected : undefined\}/u);
  assert.match(workspaceSource, /aria-selected=\{isMobileDock \? undefined : isSelected\}/u);
  assert.match(workspaceSource, /aria-hidden=\{!isOpen\} inert=\{!isOpen\}/u);
  assert.match(workspaceSource, /className=\{styles\.sheetHandle\}[\s\S]*?onPointerDown=\{handleSheetHandlePointerDown\}/u);
  assert.match(workspaceSource, /pendingMobileFocusTask\.current = task/u);
  assert.match(workspaceSource, /\{isSampleArtwork && \([\s\S]*?copy\.sampleBadge/u);
  assert.match(workspaceSource, /<MemoCardPreview data=\{cardData\}/u);
  assert.match(workspaceSource, /prepareImageFile\(file/u);
  assert.match(workspaceSource, /BASIC_IMAGE_CONTROL_KEYS\.map\(renderImageControl\)/u);
  assert.match(workspaceSource, /ADVANCED_IMAGE_CONTROL_KEYS\.map\(renderImageControl\)/u);
  for (const picker of ['MemoJobPicker', 'MemoWorldPicker', 'MemoRaceClanPicker', 'MemoGrandCompanyPicker']) {
    assert.match(workspaceSource, new RegExp(`<${picker}\\b`, 'u'));
  }
  assert.match(workspaceSource, /changeArrayField\('languages'/u);
  assert.match(workspaceSource, /changeArrayField\('playStyles'/u);
  assert.match(workspaceSource, /<RatioPicker[\s\S]*?value=\{design\.ratio\}/u);
  assert.match(workspaceSource, /<CardTextEditorNavigation[\s\S]*?items=\{textEditorItems\}[\s\S]*?category=\{activeTextCategory\}[\s\S]*?selectedId=\{selectedTextItem\?\.id/u);
  assert.match(workspaceSource, /<CardTextOverrideInput[\s\S]*?item=\{selectedTextItem\}/u);
  assert.match(workspaceSource, /<TypographyRoleEditor locale=\{locale\} item=\{selectedTextItem\}/u);
  assert.match(workspaceSource, /<CardTextOverlay[\s\S]*?enabled=\{contentTextEditing && !previewOpen && design\.layoutVariant === 'a'\}/u);
  assert.match(textEditorSource, /data-text-editor="true" data-selected-text-id=/u);
  assert.match(textEditorSource, /categoryItems\.length > 2/u);
  assert.match(workspaceSource, /updateDesign\('colorMode'/u);
  assert.match(workspaceSource, /design\.effects\.includes\(effect\)/u);
  assert.match(workspaceSource, /HistoryButton action="undo"/u);
  assert.match(workspaceSource, /HistoryButton action="redo"/u);
});

test('the mobile sheet starts closed and tracks a bounded stage above a stable tool dock', () => {
  assert.match(editorStyles, /\.page \.workspace\s*\{[^}]*grid-template-columns:\s*84px minmax\(0, 1fr\)/u);
  assert.match(editorStyles, /\.mobileTaskTabs\s*\{[^}]*display:\s*none/u);
  const mobileRules = editorStyles.slice(editorStyles.lastIndexOf('@media (max-width: 900px)'));
  assert.match(mobileRules, /\.page\s*\{[^}]*height:\s*max\(0px, calc\(var\(--editor-viewport-bottom, 100dvh\) - var\(--app-header-height\)\)\)[^}]*overflow:\s*hidden/u);
  assert.match(mobileRules, /\.page \.mobileTaskTabs\s*\{[^}]*flex:\s*0 0 var\(--editor-mobile-dock-height\)/u);
  assert.match(mobileRules, /\.page:not\(\.inspectorClosed\):not\(\.previewMode\) \.canvasColumn\s*\{[^}]*var\(--editor-mobile-sheet-height\)/u);
  assert.match(mobileRules, /\.page \.inspector\s*\{[^}]*position:\s*absolute[^}]*env\(safe-area-inset-bottom\)/u);
  assert.match(mobileRules, /\.page \.inspectorBody\s*\{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/u);
  assert.doesNotMatch(mobileRules, /\.page \.inspector\s*\{[^}]*position:\s*relative[^}]*flex:\s*1 1 0%/u);
  assert.match(workspaceSource, /window\.visualViewport[\s\S]*?--editor-mobile-sheet-height[\s\S]*?data-keyboard-open=/u);
  assert.match(workspaceSource, /focusedElement\.matches\('input, textarea, select'\)[\s\S]*?setInputCompactMode\(useInputCompactMode\)/u);
  assert.match(workspaceSource, /inspectorOpen: !matches/u);
  assert.match(workspaceSource, /spellCheck=\{field !== 'name' && field !== 'freeCompany'\}/u);
  assert.match(workspaceSource, /data-input-compact-mode=/u);
  assert.match(mobileRules, /\.page \.pickerInlineSelect select\s*\{[^}]*font-size:\s*1rem/u);
  assert.match(mobileRules, /\.page \.sheetHandle\s*\{[^}]*min-height:\s*44px/u);
  assert.match(editorStyles, /\.mobileStageSampleBadge\s*\{[^}]*display:\s*none/u);
  assert.match(mobileRules, /\.page \.mobileStageSampleBadge\s*\{[^}]*display:\s*inline-flex/u);
  assert.match(mobileRules, /\.page \.mobileStageSampleBadge\s*\{[^}]*pointer-events:\s*none/u);
  assert.match(mobileRules, /\.page\[data-input-compact-mode='true'\] \.canvasStage\s*\{[^}]*visibility:\s*hidden/u);
  assert.match(editorStyles, /\.page \.choiceChip\s*\{[^}]*min-height:\s*44px/u);
  assert.match(workspaceSource, /className=\{styles\.toolbarPrimary\}/u);
  assert.match(editorStyles, /@media \(max-width: 900px\)[\s\S]*?\.page \.stageUpload\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/u);
  const compactUploadMinimum = editorStyles.match(/\.page \.uploadZoneCompact\s*\{[^}]*min-height:\s*(\d+)px/u)?.[1];
  assert.ok(Number(compactUploadMinimum) >= 56, 'the compact upload row reserves readable file details and a touch target');
  assert.match(editorStyles, /@media \(max-width: 370px\)[\s\S]*?\.page \.historyTools button,[\s\S]*?min-width:\s*44px/u);
});

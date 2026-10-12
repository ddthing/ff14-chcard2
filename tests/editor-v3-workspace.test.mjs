import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const workspaceSource = readFileSync(new URL('../src/components/editor/editor-workspace.tsx', import.meta.url), 'utf8');
const editorStyles = readFileSync(new URL('../src/app/editor/editor.module.css', import.meta.url), 'utf8');

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
  assert.deepEqual(getEditorCopy('ko').tasks, { photo: '사진', information: '정보', design: '디자인' });
  assert.deepEqual(getEditorCopy('en').tasks, { photo: 'Photo', information: 'Information', design: 'Design' });
  assert.deepEqual(getEditorCopy('ja').tasks, { photo: '写真', information: '情報', design: 'デザイン' });
  assert.deepEqual(['ko', 'en', 'ja'].map((locale) => getEditorCopy(locale).sampleBadge), ['예시', 'Sample', 'サンプル']);
});

test('decorative copy selector exposes the same four choices with localized labels', () => {
  const locales = ['ko', 'en', 'ja'];
  const choices = locales.map((locale) => getEditorCopy(locale).decorativeCopyNames);
  assert.deepEqual(choices.map((labels) => Object.keys(labels).sort()), Array(3).fill(['adventure', 'companions', 'default', 'none']));
  assert.deepEqual(choices.map((labels) => labels.none), ['없음', 'None', 'なし']);
  assert.deepEqual(choices.map((labels) => labels.default), ['기본', 'Default', '標準']);
  assert.deepEqual(choices.map((labels) => labels.adventure), ['모험', 'Adventure', '冒険']);
  assert.deepEqual(choices.map((labels) => labels.companions), ['동료', 'Companions', '仲間']);
});

test('master A font family choices are localized and the five legacy preset labels remain available', () => {
  const copies = ['ko', 'en', 'ja'].map((locale) => getEditorCopy(locale));
  assert.deepEqual(copies.map((copy) => copy.typographyFamilyNames.serif), ['세리프', 'Serif', 'セリフ']);
  assert.deepEqual(copies.map((copy) => copy.typographyFamilyNames.sans), ['산세리프', 'Sans serif', 'サンセリフ']);
  for (const copy of copies) {
    assert.deepEqual(Object.keys(copy.typographyNames).sort(), ['classic', 'clean', 'condensed', 'editorial', 'modern']);
  }
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
  assert.match(workspaceSource, /updateDesign\('typographyPreset'/u);
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

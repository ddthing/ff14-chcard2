import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getEditorCopy } from '../src/components/editor/copy.ts';
import {
  EDITOR_TASK_FOR_PANEL,
  EDITOR_TASK_IDS,
  EDITOR_TASK_PANEL,
  getEditorTaskForPanel,
} from '../src/components/editor/editor-navigation.ts';

const workspaceSource = readFileSync(new URL('../src/components/editor/editor-workspace.tsx', import.meta.url), 'utf8');
const editorStyles = readFileSync(new URL('../src/app/editor/editor.module.css', import.meta.url), 'utf8');

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

test('V3 task names stay localized across the supported app languages', () => {
  assert.deepEqual(getEditorCopy('ko').tasks, { photo: '사진', information: '정보', design: '디자인' });
  assert.deepEqual(getEditorCopy('en').tasks, { photo: 'Photo', information: 'Information', design: 'Design' });
  assert.deepEqual(getEditorCopy('ja').tasks, { photo: '写真', information: '情報', design: 'デザイン' });
});

test('V3 tabs keep real editor controls connected to the existing store and preview', () => {
  assert.match(workspaceSource, /role="tablist"/u);
  assert.match(workspaceSource, /role="tabpanel"/u);
  assert.match(workspaceSource, /<MemoCardPreview data=\{cardData\}/u);
  assert.match(workspaceSource, /prepareImageFile\(file/u);
  assert.match(workspaceSource, /BASIC_IMAGE_CONTROL_KEYS\.map\(renderImageControl\)/u);
  assert.match(workspaceSource, /ADVANCED_IMAGE_CONTROL_KEYS\.map\(renderImageControl\)/u);
  for (const picker of ['JobPicker', 'WorldPicker', 'RaceClanPicker', 'GrandCompanyPicker']) {
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

test('the studio dock and mobile inline tools keep the preview reachable with 44px controls', () => {
  assert.match(editorStyles, /\.page \.workspace\s*\{[^}]*grid-template-columns:\s*84px minmax\(0, 1fr\)/u);
  assert.match(editorStyles, /\.mobileTaskTabs\s*\{[^}]*display:\s*none/u);
  assert.match(editorStyles, /@media \(max-width: 900px\)[\s\S]*?\.page \.mobileTaskTabs\s*\{[^}]*display:\s*grid/u);
  assert.match(editorStyles, /@media \(max-width: 900px\)[\s\S]*?\.page \.canvasStage\s*\{[^}]*height:\s*clamp\(230px, 36svh, 320px\)/u);
  assert.match(editorStyles, /@media \(max-width: 900px\)[\s\S]*?\.page \.inspector\s*\{[^}]*position:\s*relative[^}]*top:\s*auto/u);
  assert.match(editorStyles, /\.page \.choiceChip\s*\{[^}]*min-height:\s*44px/u);
  assert.match(workspaceSource, /className=\{styles\.toolbarPrimary\}/u);
  assert.match(editorStyles, /@media \(max-width: 900px\)[\s\S]*?\.page \.stageUpload\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/u);
  const compactUploadMinimum = editorStyles.match(/\.page \.uploadZoneCompact\s*\{[^}]*min-height:\s*(\d+)px/u)?.[1];
  assert.ok(Number(compactUploadMinimum) >= 56, 'the compact upload row reserves readable file details and a touch target');
  assert.match(editorStyles, /@media \(max-width: 370px\)[\s\S]*?\.page \.historyTools button,[\s\S]*?min-width:\s*44px/u);
});

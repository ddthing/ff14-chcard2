import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAccessibleImageControlValue, formatAccessiblePercent } from '../src/components/editor/editor-accessibility.ts';
import { getEditorCopy } from '../src/components/editor/copy.ts';

test('formats image range values with localized units and readable precision', () => {
  assert.equal(formatAccessibleImageControlValue('en', 'x', 42.4), '42 percent');
  assert.equal(formatAccessibleImageControlValue('en', 'scale', 1.25), '1.25 times');
  assert.equal(formatAccessibleImageControlValue('en', 'rotation', -3.5), '-3.5 degrees');
  assert.equal(formatAccessibleImageControlValue('en', 'exposure', 0.7), '+0.7 EV');
  assert.equal(formatAccessibleImageControlValue('ko', 'brightness', 0.83), '83 퍼센트');
  assert.equal(formatAccessibleImageControlValue('ja', 'scale', 1.25), '1.25倍');
  assert.equal(formatAccessibleImageControlValue('ja', 'rotation', 2), '2.0度');
  assert.equal(formatAccessibleImageControlValue('ko', 'exposure', -0.4), '-0.4 EV');
});

test('formats canvas zoom as a localized percentage', () => {
  assert.equal(formatAccessiblePercent('en', 55), '55 percent');
  assert.equal(formatAccessiblePercent('ko', 100), '100 퍼센트');
  assert.equal(formatAccessiblePercent('ja', 150), '150パーセント');
});

test('provides a concise localized summary for the card canvas', () => {
  assert.equal(getEditorCopy('en').cardPreviewSummary('Coner', 'Bard', 'Tonberry'), 'Card preview · Character Coner · Job Bard · World Tonberry');
  assert.equal(getEditorCopy('ko').cardPreviewSummary('코너', '음유시인', '톤베리'), '카드 미리보기 · 캐릭터 코너 · 직업 음유시인 · 월드 톤베리');
  assert.equal(getEditorCopy('ja').cardPreviewSummary('', '', ''), 'カードプレビュー');
});

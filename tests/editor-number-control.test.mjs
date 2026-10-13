import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatEditorNumber,
  getDisplayedEditorRange,
  normalizeEditorNumber,
  parseDisplayedEditorRangeValue,
  parseEditorNumberDraft,
} from '../src/components/editor/editor-number-control-model.ts';

test('number draft parsing keeps percentage input in display units', () => {
  assert.equal(parseEditorNumberDraft('90', 100), 0.9);
  assert.equal(parseEditorNumberDraft('92.5', 100), 0.925);
  assert.equal(parseEditorNumberDraft('9', 100), 0.09);
  assert.equal(parseEditorNumberDraft('1.', 1), 1);
  assert.equal(formatEditorNumber(0.9, 0.05, 100), '90');
  assert.equal(formatEditorNumber(0.925, 0.005, 100), '92.5');
});

test('range DOM values use display units while callbacks return model units', () => {
  assert.deepEqual(getDisplayedEditorRange(22, 0, 100, 1), {
    min: 0, max: 100, step: 1, value: 22,
  });
  assert.deepEqual(getDisplayedEditorRange(0.9, 0.75, 2.5, 0.01, 100), {
    min: 75, max: 250, step: 1, value: 90,
  });
  assert.deepEqual(getDisplayedEditorRange(-0.015, -0.12, 0.2, 0.005), {
    min: -0.12, max: 0.2, step: 0.005, value: -0.015,
  });
  assert.deepEqual(getDisplayedEditorRange(0.875, 0.75, 1.25, 0.005, 100), {
    min: 75, max: 125, step: 0.5, value: 87.5,
  });
  assert.equal(parseDisplayedEditorRangeValue(90, 100), 0.9);
  assert.equal(parseDisplayedEditorRangeValue(89.5, 100), 0.895);
});

test('incomplete and non-finite numeric drafts remain uncommitted', () => {
  for (const draft of ['', '-', '+', '.', '1e2', 'NaN', 'Infinity']) {
    assert.equal(parseEditorNumberDraft(draft), null, `expected ${JSON.stringify(draft)} to remain a draft`);
  }
  assert.equal(parseEditorNumberDraft('12', 0), null);
});

test('numeric commits clamp and snap to the field step without floating-point residue', () => {
  assert.equal(normalizeEditorNumber(parseEditorNumberDraft('9', 100), 0.75, 2.5, 0.01), 0.75);
  assert.equal(normalizeEditorNumber(0.524, 0.55, 1.5, 0.05), 0.55);
  assert.equal(normalizeEditorNumber(0.929, 0.55, 1.5, 0.05), 0.95);
  assert.equal(normalizeEditorNumber(2, 0.55, 1.5, 0.05), 1.5);
  assert.equal(normalizeEditorNumber(0.023, -0.12, 0.2, 0.005), 0.025);
  assert.equal(normalizeEditorNumber(801.4, 100, 900, 1), 801);
  assert.equal(normalizeEditorNumber(10, 0, 10, 3), 9);
});

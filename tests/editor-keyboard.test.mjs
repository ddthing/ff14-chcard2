import assert from 'node:assert/strict';
import test from 'node:test';

const { resolveEditorKeyboardAction } = await import('../src/components/editor/editor-keyboard.ts');

test('maps undo and redo shortcuts for Windows and macOS', () => {
  assert.equal(resolveEditorKeyboardAction({ key: 'z', ctrlKey: true }), 'undo');
  assert.equal(resolveEditorKeyboardAction({ key: 'Z', ctrlKey: true, shiftKey: true }), 'redo');
  assert.equal(resolveEditorKeyboardAction({ key: 'z', metaKey: true }), 'undo');
  assert.equal(resolveEditorKeyboardAction({ key: 'z', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(resolveEditorKeyboardAction({ key: 'y', ctrlKey: true }), null);
});

test('maps canvas zoom, fit, and close shortcuts', () => {
  assert.equal(resolveEditorKeyboardAction({ key: '+', shiftKey: true }), 'zoom-in');
  assert.equal(resolveEditorKeyboardAction({ key: '=', shiftKey: true }), 'zoom-in');
  assert.equal(resolveEditorKeyboardAction({ key: '=' }), 'zoom-in');
  assert.equal(resolveEditorKeyboardAction({ key: '-' }), 'zoom-out');
  assert.equal(resolveEditorKeyboardAction({ key: '0' }), 'fit');
  assert.equal(resolveEditorKeyboardAction({ key: 'Escape' }), 'close');
  assert.equal(resolveEditorKeyboardAction({ key: 'Escape', target: { tagName: 'INPUT', type: 'text' } }), 'close');
});

test('keeps shortcuts out of editable fields and dismissed picker events', () => {
  assert.equal(resolveEditorKeyboardAction({ key: 'z', ctrlKey: true, target: { tagName: 'INPUT', type: 'text' } }), null);
  assert.equal(resolveEditorKeyboardAction({ key: 'z', ctrlKey: true, target: { tagName: 'TEXTAREA' } }), null);
  assert.equal(resolveEditorKeyboardAction({ key: '+', target: { tagName: 'DIV', isContentEditable: true } }), null);
  assert.equal(resolveEditorKeyboardAction({ key: '-', target: { tagName: 'INPUT', type: 'number' } }), null);
  assert.equal(resolveEditorKeyboardAction({ key: '+', target: { tagName: 'INPUT', type: 'text' } }), null);
  assert.equal(resolveEditorKeyboardAction({ key: 'Escape', defaultPrevented: true, target: { getAttribute: (name) => name === 'role' ? 'combobox' : null } }), null);
  assert.equal(resolveEditorKeyboardAction({ key: 'Escape', defaultPrevented: true }), null);
  assert.equal(resolveEditorKeyboardAction({ key: '0', altKey: true }), null);
});

test('allows shortcuts while a non-text control has focus', () => {
  assert.equal(resolveEditorKeyboardAction({ key: '-', target: { tagName: 'INPUT', type: 'range' } }), 'zoom-out');
});

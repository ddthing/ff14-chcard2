import assert from 'node:assert/strict';
import test from 'node:test';

const {
  CARD_RATIO_OPTIONS,
  canBeginCanvasDrag,
  getNextComboboxOptionIndex,
  getInlineConfirmKeyboardAction,
  getNextMenuIndex,
  hasFileTransfer,
  isBrowserZoomWheelGesture,
  isCanvasDragPointer,
  isEditorShortcutSuppressed,
  shouldRetainInspectorForExit,
  tryReleasePointerCapture,
  trySetPointerCapture,
  transitionUploadInteractionState,
  updateFileDragDepth,
} = await import('../src/components/editor/editor-interaction.ts');

test('exposes the five supported card ratios in visual-picker order', () => {
  assert.deepEqual(CARD_RATIO_OPTIONS, ['1:1', '4:5', '3:4', '16:9', '9:16']);
});

test('menu keyboard navigation wraps and supports Home and End', () => {
  assert.equal(getNextMenuIndex(-1, 5, 'ArrowDown', 2), 2);
  assert.equal(getNextMenuIndex(4, 5, 'ArrowDown'), 0);
  assert.equal(getNextMenuIndex(0, 5, 'ArrowUp'), 4);
  assert.equal(getNextMenuIndex(2, 5, 'Home'), 0);
  assert.equal(getNextMenuIndex(2, 5, 'End'), 4);
  assert.equal(getNextMenuIndex(2, 5, 'Enter'), null);
  assert.equal(getNextMenuIndex(0, 0, 'ArrowDown'), null);
});

test('combobox arrow navigation opens at the nearest end and clamps without wrapping', () => {
  assert.equal(getNextComboboxOptionIndex(-1, 4, 'ArrowDown'), 0);
  assert.equal(getNextComboboxOptionIndex(-1, 4, 'ArrowUp'), 3);
  assert.equal(getNextComboboxOptionIndex(0, 4, 'ArrowDown'), 1);
  assert.equal(getNextComboboxOptionIndex(3, 4, 'ArrowDown'), 3);
  assert.equal(getNextComboboxOptionIndex(0, 4, 'ArrowUp'), 0);
  assert.equal(getNextComboboxOptionIndex(1, 4, 'Home'), null);
  assert.equal(getNextComboboxOptionIndex(0, 0, 'ArrowDown'), null);
});

test('file drag depth survives nested enter/leave events and never goes negative', () => {
  const nestedDepth = updateFileDragDepth(updateFileDragDepth(0, 'enter'), 'enter');
  assert.equal(updateFileDragDepth(nestedDepth, 'leave'), 1);
  assert.equal(updateFileDragDepth(updateFileDragDepth(nestedDepth, 'leave'), 'leave'), 0);
  assert.equal(updateFileDragDepth(0, 'leave'), 0);
});

test('only file payloads activate the upload drop state', () => {
  assert.equal(hasFileTransfer(['text/plain', 'Files']), true);
  assert.equal(hasFileTransfer(['files']), true);
  assert.equal(hasFileTransfer(['text/plain']), false);
});

test('canvas wheel zoom leaves Ctrl/Meta browser zoom gestures available', () => {
  assert.equal(isBrowserZoomWheelGesture({ ctrlKey: true, metaKey: false }), true);
  assert.equal(isBrowserZoomWheelGesture({ ctrlKey: false, metaKey: true }), true);
  assert.equal(isBrowserZoomWheelGesture({ ctrlKey: false, metaKey: false }), false);
});

test('one active pointer owns a canvas drag until that same pointer ends', () => {
  let activePointerId = null;
  assert.equal(canBeginCanvasDrag(activePointerId), true);

  activePointerId = 31;
  assert.equal(canBeginCanvasDrag(activePointerId), false);
  assert.equal(isCanvasDragPointer(activePointerId, 31), true);
  assert.equal(isCanvasDragPointer(activePointerId, 32), false);

  if (isCanvasDragPointer(activePointerId, 32)) activePointerId = null;
  assert.equal(activePointerId, 31, 'a second contact cannot cancel or replace the active drag');
  if (isCanvasDragPointer(activePointerId, 31)) activePointerId = null;
  assert.equal(activePointerId, null);
  assert.equal(canBeginCanvasDrag(activePointerId), true);
});

test('pointer capture tolerates unavailable APIs and interrupted capture sequences', () => {
  const captured = new Set();
  const target = {
    setPointerCapture(pointerId) { captured.add(pointerId); },
    hasPointerCapture(pointerId) { return captured.has(pointerId); },
    releasePointerCapture(pointerId) { captured.delete(pointerId); },
  };

  assert.equal(trySetPointerCapture(target, 7), true);
  assert.equal(captured.has(7), true);
  assert.equal(tryReleasePointerCapture(target, 7), true);
  assert.equal(captured.has(7), false);
  assert.equal(trySetPointerCapture({}, 8), false);
  assert.equal(tryReleasePointerCapture({}, 8), false);
  assert.equal(trySetPointerCapture({ setPointerCapture() { throw new Error('pointer already ended'); } }, 9), false);
  assert.equal(tryReleasePointerCapture({
    hasPointerCapture() { return true; },
    releasePointerCapture() { throw new Error('capture already lost'); },
  }, 10), false);
});

test('upload feedback follows the idle, drag, processing, success, and error states', () => {
  const transition = transitionUploadInteractionState;
  assert.equal(transition('idle', 'file-enter'), 'drag-over');
  assert.equal(transition('drag-over', 'file-leave'), 'idle');
  assert.equal(transition('drag-over', 'processing'), 'processing');
  assert.equal(transition('processing', 'success'), 'success');
  assert.equal(transition('success', 'success-timeout'), 'idle');
  assert.equal(transition('processing', 'error'), 'error');
  assert.equal(transition('processing', 'file-enter'), 'processing');
  assert.equal(transition('error', 'cancel'), 'idle');
  assert.equal(transition('idle', 'success-timeout'), 'idle');
});

test('inline confirmation blocks editor shortcuts only while confirming', () => {
  const target = { closest: (selector) => selector === '[data-editor-shortcuts-disabled="true"]' };
  assert.equal(isEditorShortcutSuppressed(target), true);
  assert.equal(isEditorShortcutSuppressed({ closest: () => null }), false);
  assert.equal(isEditorShortcutSuppressed(null), false);
});

test('inline confirmation maps Escape to cancel and armed Enter to confirm', () => {
  assert.equal(getInlineConfirmKeyboardAction('Escape', true), 'cancel');
  assert.equal(getInlineConfirmKeyboardAction('Enter', true), 'confirm');
  assert.equal(getInlineConfirmKeyboardAction('Enter', true, true), null);
  assert.equal(getInlineConfirmKeyboardAction('Escape', false), null);
  assert.equal(getInlineConfirmKeyboardAction('Enter', false), null);
});

test('mobile inspector exit is retained only when motion is allowed and the editor stays visible', () => {
  assert.equal(shouldRetainInspectorForExit({ wasOpen: true, isMobile: true, previewOpen: false, reducedMotion: false }), true);
  assert.equal(shouldRetainInspectorForExit({ wasOpen: true, isMobile: false, previewOpen: false, reducedMotion: false }), false);
  assert.equal(shouldRetainInspectorForExit({ wasOpen: true, isMobile: true, previewOpen: true, reducedMotion: false }), false);
  assert.equal(shouldRetainInspectorForExit({ wasOpen: true, isMobile: true, previewOpen: false, reducedMotion: true }), false);
  assert.equal(shouldRetainInspectorForExit({ wasOpen: false, isMobile: true, previewOpen: false, reducedMotion: false }), false);
});

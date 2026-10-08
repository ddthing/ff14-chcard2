import type { CardRatio } from '@/components/cards/types';

export const CARD_RATIO_OPTIONS: readonly CardRatio[] = ['1:1', '4:5', '3:4', '16:9', '9:16'];
export const INSPECTOR_CLOSE_FALLBACK_MS = 240;

export type UploadInteractionState = 'idle' | 'drag-over' | 'processing' | 'success' | 'error';
export type UploadInteractionEvent = 'file-enter' | 'file-leave' | 'processing' | 'success' | 'error' | 'cancel' | 'success-timeout';

export function transitionUploadInteractionState(
  state: UploadInteractionState,
  event: UploadInteractionEvent,
): UploadInteractionState {
  if (event === 'cancel') return 'idle';
  if (event === 'processing') return 'processing';
  if (event === 'success') return 'success';
  if (event === 'error') return 'error';
  if (event === 'file-enter') return state === 'processing' ? state : 'drag-over';
  if (event === 'file-leave') return state === 'drag-over' ? 'idle' : state;
  return state === 'success' ? 'idle' : state;
}

export function hasFileTransfer(types: ArrayLike<string>): boolean {
  for (let index = 0; index < types.length; index += 1) {
    if (types[index]?.toLowerCase() === 'files') return true;
  }
  return false;
}

interface PointerCaptureTarget {
  setPointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
  releasePointerCapture?: (pointerId: number) => void;
}

/** Pointer capture is optional in restricted browsers and may throw after an interrupted pointer sequence. */
export function trySetPointerCapture(target: PointerCaptureTarget | null, pointerId: number): boolean {
  if (!target || typeof target.setPointerCapture !== 'function') return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

/** Release capture only when available, and keep a lost capture from breaking the active editor. */
export function tryReleasePointerCapture(target: PointerCaptureTarget | null, pointerId: number): boolean {
  if (!target || typeof target.releasePointerCapture !== 'function') return false;
  try {
    if (typeof target.hasPointerCapture === 'function' && !target.hasPointerCapture(pointerId)) return false;
    target.releasePointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

/** Ctrl/Meta wheel gestures belong to browser zoom, not the editor's canvas zoom handler. */
export function isBrowserZoomWheelGesture(event: Pick<WheelEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey;
}

/** Keep additional contacts from replacing the pointer that owns a canvas drag. */
export function canBeginCanvasDrag(activePointerId: number | null): boolean {
  return activePointerId === null;
}

export function isCanvasDragPointer(activePointerId: number | null, pointerId: number): boolean {
  return activePointerId === pointerId;
}

export function updateFileDragDepth(depth: number, action: 'enter' | 'leave'): number {
  return action === 'enter' ? Math.max(0, depth) + 1 : Math.max(0, depth - 1);
}

export function shouldRetainInspectorForExit({
  wasOpen,
  isMobile,
  previewOpen,
  reducedMotion,
}: {
  wasOpen: boolean;
  isMobile: boolean;
  previewOpen: boolean;
  reducedMotion: boolean;
}): boolean {
  return wasOpen && isMobile && !previewOpen && !reducedMotion;
}

export function getNextMenuIndex(currentIndex: number, itemCount: number, key: string, selectedIndex = 0): number | null {
  if (itemCount < 1) return null;
  const current = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : -1;
  const selected = Math.min(itemCount - 1, Math.max(0, selectedIndex));

  if (key === 'ArrowDown') return current < 0 ? selected : (current + 1) % itemCount;
  if (key === 'ArrowUp') return current < 0 ? selected : (current - 1 + itemCount) % itemCount;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  return null;
}

/** Move the active descendant in an editable combobox without wrapping at list ends. */
export function getNextComboboxOptionIndex(currentIndex: number, itemCount: number, key: string): number | null {
  if (itemCount < 1) return null;
  const current = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : -1;

  if (key === 'ArrowDown') return current < 0 ? 0 : Math.min(current + 1, itemCount - 1);
  if (key === 'ArrowUp') return current < 0 ? itemCount - 1 : Math.max(current - 1, 0);
  return null;
}

export function isEditorShortcutSuppressed(target: Pick<Element, 'closest'> | null): boolean {
  return Boolean(target?.closest('[data-editor-shortcuts-disabled="true"]'));
}

export function getInlineConfirmKeyboardAction(
  key: string,
  isConfirming: boolean,
  isCancelFocused = false,
): 'cancel' | 'confirm' | null {
  if (!isConfirming) return null;
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && !isCancelFocused) return 'confirm';
  return null;
}

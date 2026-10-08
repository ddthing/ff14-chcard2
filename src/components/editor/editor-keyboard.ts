export type EditorKeyboardAction = 'undo' | 'redo' | 'zoom-in' | 'zoom-out' | 'fit' | 'close';

interface KeyboardTarget {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

export interface EditorKeyboardEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  target?: KeyboardTarget | null;
}

const TEXT_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
]);

function isTextEntryTarget(target: KeyboardTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName?.toUpperCase();
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName === 'INPUT') return TEXT_INPUT_TYPES.has((target.type || 'text').toLowerCase());
  return target.getAttribute?.('role') === 'combobox';
}

/** Resolve editor shortcuts while preserving native text editing and picker behavior. */
export function resolveEditorKeyboardAction(event: EditorKeyboardEventLike): EditorKeyboardAction | null {
  if (event.defaultPrevented || event.altKey || event.isComposing || event.keyCode === 229) return null;

  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (isTextEntryTarget(event.target)) return null;
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    return null;
  }

  if (key === 'escape') return 'close';
  if (isTextEntryTarget(event.target)) return null;
  if (key === '+' || key === '=') return 'zoom-in';
  if (event.shiftKey) return null;
  if (key === '-') return 'zoom-out';
  if (key === '0') return 'fit';
  return null;
}

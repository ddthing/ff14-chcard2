const FOCUSABLE_SELECTOR = 'input, textarea, select, button';

/** Selects the most specific field matching an on-card text slot. */
export function selectTextEditorControl<T extends {
  getAttribute: (name: string) => string | null;
  matches: (selector: string) => boolean;
  querySelectorAll: (selector: string) => { length: number };
  parentElement?: T | null;
}>(candidates: readonly T[], itemId: string): T | undefined {
  const matches = candidates.filter((candidate) => candidate.getAttribute('data-card-text-editor-control') === itemId);
  const directControl = matches.find((candidate) => candidate.matches(FOCUSABLE_SELECTOR));
  if (directControl) return directControl;
  return [...matches].sort((left, right) => {
    const nestedControlCount = left.querySelectorAll(FOCUSABLE_SELECTOR).length - right.querySelectorAll(FOCUSABLE_SELECTOR).length;
    if (nestedControlCount !== 0) return nestedControlCount;
    const depth = (node: T) => {
      let count = 0;
      let current: T | null | undefined = node;
      while (current) {
        count += 1;
        current = current.parentElement;
      }
      return count;
    };
    return depth(right) - depth(left);
  })[0];
}

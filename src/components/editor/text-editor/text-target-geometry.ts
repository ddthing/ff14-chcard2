export interface TextTargetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextTargetBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TextTargetClip {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextTargetPlacement {
  /** Union of the measured text fragments after clipping to the editor stage. */
  textBounds: TextTargetBounds;
  /** Per-line Range bounds used for the fine visual outline. */
  textFragments: TextTargetBounds[];
  /** Invisible pointer targets; multiple Range lines stay separate when safe. */
  targetFragments: TextTargetBounds[];
  /** Union used only to position the single semantic button and its visuals. */
  targetBounds: TextTargetBounds;
  /** Union of expanded fragment targets before collision fallback. */
  expandedBounds: TextTargetBounds;
  compact: boolean;
}

export type TextTargetRectSet = TextTargetRect | readonly TextTargetRect[];

const DEFAULT_MIN_TARGET_SIZE = 44;
const RECT_EPSILON = 0.5;

function resolveClip(
  viewportWidth: number,
  viewportHeight: number,
  clip: TextTargetClip,
): TextTargetClip | null {
  const resolved = {
    left: Math.max(0, clip.left),
    top: Math.max(0, clip.top),
    right: Math.min(viewportWidth, clip.right),
    bottom: Math.min(viewportHeight, clip.bottom),
  };
  return resolved.right > resolved.left && resolved.bottom > resolved.top ? resolved : null;
}

function clipRect(rect: TextTargetRect, clip: TextTargetClip): TextTargetBounds | null {
  const left = Math.max(rect.left, clip.left);
  const top = Math.max(rect.top, clip.top);
  const right = Math.min(rect.right, clip.right);
  const bottom = Math.min(rect.bottom, clip.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function asRect(rect: TextTargetBounds): TextTargetRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
}

function uniqueBounds(rects: readonly TextTargetBounds[]): TextTargetBounds[] {
  const unique: TextTargetBounds[] = [];
  for (const rect of rects) {
    if (!unique.some((candidate) => (
      Math.abs(candidate.left - rect.left) <= RECT_EPSILON
      && Math.abs(candidate.top - rect.top) <= RECT_EPSILON
      && Math.abs(candidate.width - rect.width) <= RECT_EPSILON
      && Math.abs(candidate.height - rect.height) <= RECT_EPSILON
    ))) unique.push(rect);
  }
  return unique;
}

function unionBounds(rects: readonly TextTargetBounds[]): TextTargetBounds | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map(({ left: value }) => value));
  const top = Math.min(...rects.map(({ top: value }) => value));
  const right = Math.max(...rects.map(({ left: value, width }) => value + width));
  const bottom = Math.max(...rects.map(({ top: value, height }) => value + height));
  return { left, top, width: right - left, height: bottom - top };
}

function rectsOverlap(left: TextTargetRect, right: TextTargetRect): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function rectSet(value: TextTargetRectSet): readonly TextTargetRect[] {
  return Array.isArray(value) ? value as readonly TextTargetRect[] : [value as TextTargetRect];
}

function clipRectSet(value: TextTargetRectSet, clip: TextTargetClip): TextTargetBounds[] {
  return uniqueBounds(rectSet(value)
    .map((rect) => clipRect(rect, clip))
    .filter((rect): rect is TextTargetBounds => rect !== null));
}

/**
 * Returns separate, lightly padded outlines for measured text fragments. The
 * result stays within the editor stage even when a card is panned or zoomed.
 */
export function getTextOutlineBounds(
  rects: readonly TextTargetRect[],
  viewportWidth: number,
  viewportHeight: number,
  clip: TextTargetClip = { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
  padding = 2,
): TextTargetBounds[] {
  const visibleClip = resolveClip(viewportWidth, viewportHeight, clip);
  if (!visibleClip) return [];
  return uniqueBounds(rects
    .map((rect) => clipRect({
      left: rect.left - padding,
      top: rect.top - padding,
      right: rect.right + padding,
      bottom: rect.bottom + padding,
    }, visibleClip))
    .filter((rect): rect is TextTargetBounds => rect !== null));
}

/**
 * Places a small badge next to the first visible line of text. It skips badge
 * positions that would cover text or another badge, leaving the item accessible
 * through its button label when the card has no clear space.
 */
export function placeTextBadge(
  anchorRects: readonly TextTargetRect[],
  occupiedRects: readonly TextTargetRect[],
  viewportWidth: number,
  viewportHeight: number,
  clip: TextTargetClip = { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
  badgeSize = 16,
  gap = 2,
  occupiedBadges: readonly TextTargetRect[] = [],
): TextTargetBounds | null {
  const visibleClip = resolveClip(viewportWidth, viewportHeight, clip);
  if (!visibleClip) return null;
  const anchors = anchorRects
    .map((rect) => clipRect(rect, visibleClip))
    .filter((rect): rect is TextTargetBounds => rect !== null)
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const anchor = anchors[0];
  if (!anchor) return null;

  const anchorRect = asRect(anchor);
  const candidates: TextTargetBounds[] = [
    { left: anchorRect.right + gap, top: anchor.top, width: badgeSize, height: badgeSize },
    { left: anchor.left - badgeSize - gap, top: anchor.top, width: badgeSize, height: badgeSize },
    { left: anchorRect.right - badgeSize, top: anchor.top - badgeSize - gap, width: badgeSize, height: badgeSize },
    { left: anchor.left, top: anchorRect.bottom + gap, width: badgeSize, height: badgeSize },
    { left: anchor.left - badgeSize - gap, top: anchorRect.bottom - badgeSize, width: badgeSize, height: badgeSize },
  ];

  return candidates.find((candidate) => {
    const rect = asRect(candidate);
    const insideClip = rect.left >= visibleClip.left
      && rect.top >= visibleClip.top
      && rect.right <= visibleClip.right
      && rect.bottom <= visibleClip.bottom;
    return insideClip
      && !occupiedRects.some((occupied) => rectsOverlap(rect, occupied))
      && !occupiedBadges.some((occupied) => rectsOverlap(rect, occupied))
      && !rectsOverlap(rect, anchorRect);
  }) ?? null;
}

/**
 * Keeps 44px hit areas apart where the card has room. Dense text groups fall
 * back to the actual measured text bounds. Range fragments remain separate for
 * outlining, while each field still has one semantic button.
 */
export function placeTextTargets(
  rectSets: readonly TextTargetRectSet[],
  viewportWidth: number,
  viewportHeight: number,
  minSize = DEFAULT_MIN_TARGET_SIZE,
  clip: TextTargetClip = { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
): Array<TextTargetPlacement | null> {
  const visibleClip = resolveClip(viewportWidth, viewportHeight, clip);
  if (!visibleClip) return rectSets.map(() => null);

  const candidates = rectSets.map((rectSet) => {
    const textFragments = clipRectSet(rectSet, visibleClip);
    const textBounds = unionBounds(textFragments);
    if (!textBounds) return null;
    const expandedFragments = textFragments
      .map((fragment) => getTextTargetBounds(asRect(fragment), viewportWidth, viewportHeight, minSize, visibleClip))
      .filter((bounds): bounds is TextTargetBounds => bounds !== null);
    const expandedBounds = unionBounds(expandedFragments);
    return expandedBounds ? { textBounds, textFragments, expandedFragments, expandedBounds } : null;
  });

  const compactIndexes = new Set<number>();
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (!right) continue;
      const fragmentsOverlap = left.expandedFragments.some((leftFragment) => (
        right.expandedFragments.some((rightFragment) => rectsOverlap(asRect(leftFragment), asRect(rightFragment)))
      ));
      if (fragmentsOverlap) {
        compactIndexes.add(leftIndex);
        compactIndexes.add(rightIndex);
      }
    }
  }

  return candidates.map((candidate, index) => {
    if (!candidate) return null;
    const compact = compactIndexes.has(index);
    const targetFragments = compact ? candidate.textFragments : candidate.expandedFragments;
    const targetBounds = unionBounds(targetFragments) ?? candidate.textBounds;
    return {
      ...candidate,
      targetFragments,
      targetBounds,
      compact,
    };
  });
}

/**
 * Expands a live, transformed text rectangle to a usable pointer target. The
 * input comes from Range.getClientRects(), so canvas zoom and pan are already
 * reflected in its coordinates.
 */
export function getTextTargetBounds(
  rect: TextTargetRect,
  viewportWidth: number,
  viewportHeight: number,
  minSize = DEFAULT_MIN_TARGET_SIZE,
  clip: TextTargetClip = { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
): TextTargetBounds | null {
  const sourceWidth = Math.max(0, rect.right - rect.left);
  const sourceHeight = Math.max(0, rect.bottom - rect.top);
  if (sourceWidth === 0 || sourceHeight === 0 || viewportWidth <= 0 || viewportHeight <= 0) return null;
  const visibleClip = resolveClip(viewportWidth, viewportHeight, clip);
  if (!visibleClip) return null;
  if (rect.right <= visibleClip.left || rect.bottom <= visibleClip.top || rect.left >= visibleClip.right || rect.top >= visibleClip.bottom) return null;

  const clipWidth = visibleClip.right - visibleClip.left;
  const clipHeight = visibleClip.bottom - visibleClip.top;
  const width = Math.min(clipWidth, Math.max(minSize, sourceWidth));
  const height = Math.min(clipHeight, Math.max(minSize, sourceHeight));
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const left = Math.min(visibleClip.right - width, Math.max(visibleClip.left, centerX - width / 2));
  const top = Math.min(visibleClip.bottom - height, Math.max(visibleClip.top, centerY - height / 2));

  return { left, top, width, height };
}

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
  textBounds: TextTargetBounds;
  targetBounds: TextTargetBounds;
  expandedBounds: TextTargetBounds;
  compact: boolean;
}

/**
 * Keeps 44px hit areas apart where the card has room. Dense text groups fall
 * back to the actual text rectangles, which remain clickable without covering
 * neighboring fields. The item list remains available for every slot.
 */
export function placeTextTargets(
  rects: readonly TextTargetRect[],
  viewportWidth: number,
  viewportHeight: number,
  minSize = 44,
  clip: TextTargetClip = { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
): Array<TextTargetPlacement | null> {
  const clipLeft = Math.max(0, clip.left);
  const clipTop = Math.max(0, clip.top);
  const clipRight = Math.min(viewportWidth, clip.right);
  const clipBottom = Math.min(viewportHeight, clip.bottom);
  const clipWidth = clipRight - clipLeft;
  const clipHeight = clipBottom - clipTop;
  if (clipWidth <= 0 || clipHeight <= 0) return rects.map(() => null);

  const candidates = rects.map((rect) => {
    const left = Math.max(rect.left, clipLeft);
    const top = Math.max(rect.top, clipTop);
    const right = Math.min(rect.right, clipRight);
    const bottom = Math.min(rect.bottom, clipBottom);
    if (right <= left || bottom <= top) return null;
    const textBounds = { left, top, width: right - left, height: bottom - top };
    const targetBounds = getTextTargetBounds(rect, viewportWidth, viewportHeight, minSize, {
      left: clipLeft,
      top: clipTop,
      right: clipRight,
      bottom: clipBottom,
    });
    return targetBounds ? { textBounds, targetBounds, compact: false } : null;
  });

  const compactIndexes = new Set<number>();
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (!right) continue;
      const overlaps = left.targetBounds.left < right.targetBounds.left + right.targetBounds.width
        && left.targetBounds.left + left.targetBounds.width > right.targetBounds.left
        && left.targetBounds.top < right.targetBounds.top + right.targetBounds.height
        && left.targetBounds.top + left.targetBounds.height > right.targetBounds.top;
      if (overlaps) {
        compactIndexes.add(leftIndex);
        compactIndexes.add(rightIndex);
      }
    }
  }

  return candidates.map((candidate, index) => candidate
    ? {
      ...candidate,
      compact: compactIndexes.has(index),
      targetBounds: compactIndexes.has(index) ? candidate.textBounds : candidate.targetBounds,
      expandedBounds: candidate.targetBounds,
    }
    : null);
}

/**
 * Expands a live, transformed card-text rectangle to a usable pointer target.
 * The input is expected to come from getBoundingClientRect(), so existing
 * canvas zoom and pan transforms are already reflected in its coordinates.
 */
export function getTextTargetBounds(
  rect: TextTargetRect,
  viewportWidth: number,
  viewportHeight: number,
  minSize = 44,
  clip: TextTargetClip = { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
): TextTargetBounds | null {
  const sourceWidth = Math.max(0, rect.right - rect.left);
  const sourceHeight = Math.max(0, rect.bottom - rect.top);
  if (sourceWidth === 0 || sourceHeight === 0 || viewportWidth <= 0 || viewportHeight <= 0) return null;
  const clipLeft = Math.max(0, clip.left);
  const clipTop = Math.max(0, clip.top);
  const clipRight = Math.min(viewportWidth, clip.right);
  const clipBottom = Math.min(viewportHeight, clip.bottom);
  const clipWidth = clipRight - clipLeft;
  const clipHeight = clipBottom - clipTop;
  if (clipWidth <= 0 || clipHeight <= 0) return null;
  if (rect.right <= clipLeft || rect.bottom <= clipTop || rect.left >= clipRight || rect.top >= clipBottom) return null;

  const width = Math.min(clipWidth, Math.max(minSize, sourceWidth));
  const height = Math.min(clipHeight, Math.max(minSize, sourceHeight));
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const left = Math.min(clipRight - width, Math.max(clipLeft, centerX - width / 2));
  const top = Math.min(clipBottom - height, Math.max(clipTop, centerY - height / 2));

  return { left, top, width, height };
}

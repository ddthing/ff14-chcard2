export type TooltipPlacementSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipPlacementRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TooltipPlacementSize {
  width: number;
  height: number;
}

export interface TooltipPlacementViewport {
  width: number;
  height: number;
}

export interface ToolbarTooltipPlacement {
  top: number;
  left: number;
  side: TooltipPlacementSide;
}

export interface ToolbarTooltipPlacementOptions {
  preferredSide?: 'top' | 'bottom';
  gap?: number;
  gutter?: number;
}

interface Candidate extends ToolbarTooltipPlacement {
  rank: number;
}

function intersectionArea(a: TooltipPlacementRect, b: TooltipPlacementRect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function uniqueNearest(values: number[], target: number): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
}

/** Place a toolbar tooltip near its anchor while avoiding visible UI rectangles. */
export function getToolbarTooltipPlacement(
  anchor: TooltipPlacementRect,
  size: TooltipPlacementSize,
  viewport: TooltipPlacementViewport,
  obstacles: readonly TooltipPlacementRect[] = [],
  options: ToolbarTooltipPlacementOptions = {},
): ToolbarTooltipPlacement {
  const preferredSide = options.preferredSide ?? 'bottom';
  const gap = options.gap ?? 8;
  const gutter = options.gutter ?? 8;
  const anchorCenterX = (anchor.left + anchor.right) / 2;
  const anchorCenterY = (anchor.top + anchor.bottom) / 2;
  const usableObstacles = obstacles.filter((obstacle) =>
    obstacle.right > obstacle.left && obstacle.bottom > obstacle.top,
  );
  const collisionRects = [anchor, ...usableObstacles];
  const horizontalPositions = uniqueNearest([
    anchorCenterX - size.width / 2,
    anchor.left,
    anchor.right - size.width,
    ...usableObstacles.flatMap((obstacle) => [
      obstacle.left - size.width - gap,
      obstacle.right + gap,
    ]),
  ], anchorCenterX - size.width / 2);
  const verticalPositions = uniqueNearest([
    anchorCenterY - size.height / 2,
    anchor.top,
    anchor.bottom - size.height,
    ...usableObstacles.flatMap((obstacle) => [
      obstacle.top - size.height - gap,
      obstacle.bottom + gap,
    ]),
  ], anchorCenterY - size.height / 2);
  const sideOrder: Array<'top' | 'bottom'> = [preferredSide, preferredSide === 'bottom' ? 'top' : 'bottom'];
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  function addCandidate(side: TooltipPlacementSide, left: number, top: number) {
    const key = `${side}:${left}:${top}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ side, left, top, rank: candidates.length });
  }

  function verticalSideTop(side: 'top' | 'bottom') {
    return side === 'bottom' ? anchor.bottom + gap : anchor.top - size.height - gap;
  }

  // Try the centered preferred side first, then its opposite before shifting laterally.
  for (const side of sideOrder) {
    addCandidate(side, horizontalPositions[0], verticalSideTop(side));
  }
  for (const side of sideOrder) {
    for (const left of horizontalPositions.slice(1)) addCandidate(side, left, verticalSideTop(side));
  }

  // If both vertical positions are blocked, try beside the anchor and align vertically
  // around obstacle edges. These candidates clear compact controls near the stage edge.
  for (const side of ['left', 'right'] as const) {
    const left = side === 'left' ? anchor.left - size.width - gap : anchor.right + gap;
    for (const top of verticalPositions) addCandidate(side, left, top);
  }

  const maxLeft = Math.max(gutter, viewport.width - size.width - gutter);
  const maxTop = Math.max(gutter, viewport.height - size.height - gutter);
  function clampCandidate(candidate: Candidate): ToolbarTooltipPlacement {
    return {
      side: candidate.side,
      left: Math.min(Math.max(gutter, candidate.left), maxLeft),
      top: Math.min(Math.max(gutter, candidate.top), maxTop),
    };
  }
  function isInsideViewport(candidate: Candidate): boolean {
    return candidate.left >= gutter
      && candidate.top >= gutter
      && candidate.left + size.width <= viewport.width - gutter
      && candidate.top + size.height <= viewport.height - gutter;
  }
  function collisionScore(position: ToolbarTooltipPlacement): number {
    const rect = {
      left: position.left,
      right: position.left + size.width,
      top: position.top,
      bottom: position.top + size.height,
    };
    return collisionRects.reduce((score, obstacle) => score + intersectionArea(rect, obstacle), 0);
  }

  const inBoundsClearCandidate = candidates.find((candidate) =>
    isInsideViewport(candidate) && collisionScore(candidate) === 0,
  );
  if (inBoundsClearCandidate) return clampCandidate(inBoundsClearCandidate);

  const evaluated = candidates.map((candidate) => {
    const position = clampCandidate(candidate);
    return { position, score: collisionScore(position), rank: candidate.rank };
  });
  const clampedClearCandidate = evaluated.find((candidate) => candidate.score === 0);
  if (clampedClearCandidate) return clampedClearCandidate.position;

  // Nearby placements can be blocked in both axes even when a farther viewport pocket is clear.
  // Only build and score this Cartesian fallback after the anchor-near candidates fail.
  let leastOverlap = evaluated.sort((a, b) => a.score - b.score || a.rank - b.rank)[0];
  const testedKeys = new Set(candidates.map((candidate) => `${candidate.left}:${candidate.top}`));

  function buildFallbackCandidates(edgeGap: number): Candidate[] {
    const fallbackLefts = uniqueNearest([
      gutter,
      maxLeft,
      anchorCenterX - size.width / 2,
      anchor.left,
      anchor.right - size.width,
      anchor.left - size.width - edgeGap,
      anchor.right + edgeGap,
      ...usableObstacles.flatMap((obstacle) => [
        obstacle.left - size.width - edgeGap,
        obstacle.right + edgeGap,
      ]),
    ], anchorCenterX - size.width / 2).filter((left) => left >= gutter && left <= maxLeft);
    const fallbackTops = uniqueNearest([
      gutter,
      maxTop,
      anchorCenterY - size.height / 2,
      anchor.top,
      anchor.bottom - size.height,
      anchor.top - size.height - edgeGap,
      anchor.bottom + edgeGap,
      ...usableObstacles.flatMap((obstacle) => [
        obstacle.top - size.height - edgeGap,
        obstacle.bottom + edgeGap,
      ]),
    ], anchorCenterY - size.height / 2).filter((top) => top >= gutter && top <= maxTop);
    const fallbackCandidates: Candidate[] = [];
    for (const left of fallbackLefts) {
      for (const top of fallbackTops) {
        const key = `${left}:${top}`;
        if (testedKeys.has(key)) continue;
        testedKeys.add(key);
        const side = left + size.width <= anchor.left
          ? 'left'
          : left >= anchor.right
            ? 'right'
            : top + size.height <= anchor.top ? 'top' : 'bottom';
        fallbackCandidates.push({ side, left, top, rank: fallbackCandidates.length });
      }
    }
    fallbackCandidates.sort((a, b) => {
      const distance = (candidate: Candidate) => {
        const dx = candidate.left + size.width / 2 - anchorCenterX;
        const dy = candidate.top + size.height / 2 - anchorCenterY;
        return dx * dx + dy * dy;
      };
      return distance(a) - distance(b) || a.rank - b.rank;
    });
    return fallbackCandidates;
  }

  function evaluateFallbackCandidates(fallbackCandidates: Candidate[]): ToolbarTooltipPlacement | null {
    for (const candidate of fallbackCandidates) {
      const score = collisionScore(candidate);
      if (score === 0) return { side: candidate.side, left: candidate.left, top: candidate.top };
      if (leastOverlap && score < leastOverlap.score) {
        leastOverlap = {
          position: { side: candidate.side, left: candidate.left, top: candidate.top },
          score,
          rank: candidates.length + candidate.rank,
        };
      }
    }
    return null;
  }

  const paddedClearCandidate = evaluateFallbackCandidates(buildFallbackCandidates(gap));
  if (paddedClearCandidate) return paddedClearCandidate;

  // Prefer the standard gap, but use exact obstacle edges if only a tight zero-overlap pocket remains.
  if (gap > 0) {
    const unpaddedClearCandidate = evaluateFallbackCandidates(buildFallbackCandidates(0));
    if (unpaddedClearCandidate) return unpaddedClearCandidate;
  }

  // Fully clear placement is impossible in a crowded viewport; retain the least-overlapping
  // candidate, with preferred-side order and then proximity as deterministic tie breakers.
  return leastOverlap?.position ?? { side: preferredSide, left: gutter, top: gutter };
}

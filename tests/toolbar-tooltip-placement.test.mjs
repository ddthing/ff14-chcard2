import assert from 'node:assert/strict';
import test from 'node:test';
import { getToolbarTooltipPlacement } from '../src/components/editor/toolbar-tooltip-placement.ts';

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

test('prefers the requested side when it fits without colliding', () => {
  const placement = getToolbarTooltipPlacement(
    rect(100, 100, 140, 140),
    { width: 80, height: 28 },
    { width: 400, height: 400 },
  );

  assert.deepEqual(placement, { side: 'bottom', left: 80, top: 148 });
});

test('flips above when the preferred bottom position collides with a control', () => {
  const placement = getToolbarTooltipPlacement(
    rect(120, 120, 160, 160),
    { width: 80, height: 28 },
    { width: 400, height: 400 },
    [rect(100, 168, 200, 205)],
  );

  assert.deepEqual(placement, { side: 'top', left: 100, top: 84 });
});

test('shifts laterally when both vertical placements are blocked near the stage upload control', () => {
  const placement = getToolbarTooltipPlacement(
    rect(563, 860, 649, 892),
    { width: 86, height: 29 },
    { width: 1280, height: 900 },
    [
      rect(565, 809, 676, 841),
      rect(529, 809, 561, 841),
    ],
  );

  assert.deepEqual(placement, { side: 'top', left: 684, top: 823 });
});

test('keeps an overlay that geometrically covers the anchor as an obstacle', () => {
  const overlay = rect(80, 80, 160, 180);
  const placement = getToolbarTooltipPlacement(
    rect(100, 100, 140, 140),
    { width: 60, height: 24 },
    { width: 400, height: 400 },
    [overlay],
  );

  const placedRect = rect(placement.left, placement.top, placement.left + 60, placement.top + 24);
  const overlapWidth = Math.max(0, Math.min(placedRect.right, overlay.right) - Math.max(placedRect.left, overlay.left));
  const overlapHeight = Math.max(0, Math.min(placedRect.bottom, overlay.bottom) - Math.max(placedRect.top, overlay.top));
  assert.equal(overlapWidth * overlapHeight, 0);
});

test('searches farther Cartesian edge combinations when nearby placements are all blocked', () => {
  const placement = getToolbarTooltipPlacement(
    rect(100, 100, 140, 140),
    { width: 80, height: 28 },
    { width: 400, height: 400 },
    [
      rect(0, 60, 200, 95),
      rect(0, 145, 200, 180),
      rect(45, 0, 93, 200),
      rect(147, 0, 200, 200),
      rect(205, 0, 392, 180),
      rect(147, 205, 240, 400),
      rect(0, 205, 93, 400),
    ],
  );

  assert.deepEqual(placement, { side: 'right', left: 248, top: 188 });
});

test('uses a narrow zero-overlap pocket after padded obstacle clearances fail', () => {
  const obstacles = [
    rect(0, 0, 400, 95),
    rect(0, 145, 400, 205),
    rect(0, 95, 95, 145),
    rect(145, 95, 400, 145),
    rect(0, 205, 245, 400),
    rect(325, 205, 400, 400),
  ];
  const placement = getToolbarTooltipPlacement(
    rect(100, 100, 140, 140),
    { width: 80, height: 28 },
    { width: 400, height: 400 },
    obstacles,
  );
  const placedRect = rect(placement.left, placement.top, placement.left + 80, placement.top + 28);

  for (const obstacle of obstacles) {
    const overlapWidth = Math.max(0, Math.min(placedRect.right, obstacle.right) - Math.max(placedRect.left, obstacle.left));
    const overlapHeight = Math.max(0, Math.min(placedRect.bottom, obstacle.bottom) - Math.max(placedRect.top, obstacle.top));
    assert.equal(overlapWidth * overlapHeight, 0);
  }
  assert.ok(placement.left >= 245 && placement.left + 80 <= 325, 'the tooltip fits the narrow open corridor');
  assert.ok(placement.top >= 205, 'the tooltip clears the horizontal obstacle band');
});

test('keeps a bottom-nav edge clear for the 390px mobile Fit tooltip geometry', () => {
  const nav = rect(0, 788, 390, 844);
  const placement = getToolbarTooltipPlacement(
    rect(290, 725.656, 322, 752.046),
    { width: 139.578, height: 28.296 },
    { width: 390, height: 844 },
    [nav],
  );
  const placedRect = rect(placement.left, placement.top, placement.left + 139.578, placement.top + 28.296);
  const overlapWidth = Math.max(0, Math.min(placedRect.right, nav.right) - Math.max(placedRect.left, nav.left));
  const overlapHeight = Math.max(0, Math.min(placedRect.bottom, nav.bottom) - Math.max(placedRect.top, nav.top));

  assert.equal(overlapWidth * overlapHeight, 0);
  assert.ok(placedRect.left >= 8 && placedRect.right <= 382);
  assert.ok(placedRect.top >= 8 && placedRect.bottom <= 836);
});

test('clamps a crowded fallback inside the viewport with its gutter', () => {
  const placement = getToolbarTooltipPlacement(
    rect(5, 5, 195, 195),
    { width: 100, height: 80 },
    { width: 200, height: 200 },
  );

  assert.ok(placement.left >= 8);
  assert.ok(placement.top >= 8);
  assert.ok(placement.left + 100 <= 192);
  assert.ok(placement.top + 80 <= 192);
});

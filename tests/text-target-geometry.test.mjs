import assert from 'node:assert/strict';
import test from 'node:test';

const {
  getTextOutlineBounds,
  placeTextBadge,
  placeTextTargets,
} = await import('../src/components/editor/text-editor/text-target-geometry.ts');

test('multi-line Range fragments keep fine outlines separate from separate 44px hit areas', () => {
  const fragments = [
    { left: 80, top: 100, right: 150, bottom: 118 },
    { left: 80, top: 122, right: 140, bottom: 140 },
  ];
  const [placement] = placeTextTargets([fragments], 390, 844, 44, { left: 20, top: 50, right: 370, bottom: 600 });

  assert.equal(placement.compact, false);
  assert.deepEqual(placement.textBounds, { left: 80, top: 100, width: 70, height: 40 });
  assert.deepEqual(placement.targetBounds, { left: 80, top: 87, width: 70, height: 66 });
  assert.deepEqual(placement.targetFragments, [
    { left: 80, top: 87, width: 70, height: 44 },
    { left: 80, top: 109, width: 60, height: 44 },
  ]);
  assert.deepEqual(getTextOutlineBounds(fragments, 390, 844, { left: 20, top: 50, right: 370, bottom: 600 }, 2), [
    { left: 78, top: 98, width: 74, height: 22 },
    { left: 78, top: 120, width: 64, height: 22 },
  ]);
});

test('overlapping expanded targets compact to exact text bounds without covering a neighbor', () => {
  const [first, second] = placeTextTargets([
    [{ left: 100, top: 100, right: 120, bottom: 112 }],
    [{ left: 122, top: 100, right: 142, bottom: 112 }],
  ], 390, 844, 44, { left: 20, top: 50, right: 370, bottom: 600 });

  assert.equal(first.compact, true);
  assert.equal(second.compact, true);
  assert.deepEqual(first.targetBounds, { left: 100, top: 100, width: 20, height: 12 });
  assert.deepEqual(second.targetBounds, { left: 122, top: 100, width: 20, height: 12 });
  assert.ok(first.targetBounds.left + first.targetBounds.width <= second.targetBounds.left);
});

test('spatially separate text fragments keep separate hit areas even when their union overlaps a neighbor', () => {
  const firstText = [
    { left: 20, top: 20, right: 40, bottom: 32 },
    { left: 120, top: 20, right: 140, bottom: 32 },
  ];
  const neighborText = [{ left: 70, top: 20, right: 90, bottom: 32 }];
  const [spread, neighbor] = placeTextTargets([firstText, neighborText], 200, 150, 44);

  assert.equal(spread.compact, false);
  assert.equal(neighbor.compact, false);
  assert.deepEqual(spread.targetFragments, [
    { left: 8, top: 4, width: 44, height: 44 },
    { left: 108, top: 4, width: 44, height: 44 },
  ]);
  assert.deepEqual(neighbor.targetFragments, [{ left: 58, top: 4, width: 44, height: 44 }]);
  assert.ok(spread.targetFragments.every((target) => (
    target.left + target.width <= neighborText[0].left
    || target.left >= neighborText[0].right
    || target.top + target.height <= neighborText[0].top
    || target.top >= neighborText[0].bottom
  )));
});

test('badge placement returns no marker when every compact position is occupied', () => {
  const anchor = { left: 45, top: 45, right: 55, bottom: 55 };
  const occupied = [
    anchor,
    { left: 57, top: 45, right: 73, bottom: 61 },
    { left: 27, top: 45, right: 43, bottom: 61 },
    { left: 39, top: 27, right: 55, bottom: 43 },
    { left: 45, top: 57, right: 61, bottom: 73 },
    { left: 27, top: 39, right: 43, bottom: 55 },
  ];

  assert.equal(placeTextBadge([anchor], occupied, 100, 100), null);
});

test('fine outlines and badges stay inside the editor stage and clear of text', () => {
  const clip = { left: 90, top: 80, right: 250, bottom: 360 };
  const text = { left: 94, top: 84, right: 128, bottom: 101 };
  const outlines = getTextOutlineBounds([text], 390, 844, clip, 2);
  const badge = placeTextBadge([text], [text], 390, 844, clip, 16, 2);

  assert.deepEqual(outlines, [{ left: 92, top: 82, width: 38, height: 21 }]);
  assert.ok(badge);
  assert.ok(badge.left >= clip.left && badge.top >= clip.top);
  assert.ok(badge.left + badge.width <= clip.right && badge.top + badge.height <= clip.bottom);
  assert.ok(badge.left >= text.right + 2 || badge.left + badge.width <= text.left - 2);
});

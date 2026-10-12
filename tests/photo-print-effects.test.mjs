import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const { processPhotoPrintEffects } = await import('../src/lib/photo-print-effects.ts');
const { CARD_TEXTURE_LAYER_ORDER, DEFAULT_CARD_TEXTURE_INTENSITY } = await import('../src/lib/card-texture-effects.ts');

function makeImage(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const pixel = paint(x, y);
      data[index] = pixel[0];
      data[index + 1] = pixel[1];
      data[index + 2] = pixel[2];
      data[index + 3] = pixel[3] ?? 255;
    }
  }
  return { width, height, data };
}

function makePhoto(width = 80, height = 64) {
  return makeImage(width, height, (x, y) => {
    const u = x / Math.max(1, width - 1);
    const v = y / Math.max(1, height - 1);
    const onFigure = x > width * 0.28 && x < width * 0.72 && y > height * 0.14 && y < height * 0.9;
    if (onFigure) {
      const light = Math.round(34 + (x % 13) * 2 + v * 14);
      return [light, Math.round(light * 0.76), Math.round(light * 1.3)];
    }
    return [
      Math.round(226 - v * 54 + u * 8),
      Math.round(229 - v * 39 + u * 6),
      Math.round(234 - v * 24),
    ];
  });
}

function makeYellowTulip(width = 120, height = 80) {
  const petals = [
    { x: 0.38, y: 0.37, radiusX: 0.17, radiusY: 0.28 },
    { x: 0.51, y: 0.28, radiusX: 0.15, radiusY: 0.3 },
    { x: 0.64, y: 0.37, radiusX: 0.17, radiusY: 0.28 },
  ];
  return makeImage(width, height, (x, y) => {
    const u = x / width;
    const v = y / height;
    const isPetal = petals.some((petal) => (
      ((u - petal.x) / petal.radiusX) ** 2 + ((v - petal.y) / petal.radiusY) ** 2 <= 1
    ));
    const isStem = u > 0.49 && u < 0.54 && v >= 0.51 && v < 0.92;
    const isLeaf = v > 0.62 && v < 0.79 && u > 0.31 && u < 0.51;
    if (isPetal) return [255, Math.round(222 + ((x + y) % 24)), 22 + ((x * 3 + y) % 18), 255];
    if (isStem || isLeaf) return [44, 118, 57, 255];
    return [255, 255, 255, 255];
  });
}

function assertTransparentPixelsExact(source, result, effect) {
  for (let index = 0; index < source.data.length; index += 4) {
    if (source.data[index + 3] !== 0) continue;
    assert.deepEqual(
      [...result.data.slice(index, index + 4)],
      [...source.data.slice(index, index + 4)],
      `${effect} must preserve transparent pixel ${index / 4} exactly`,
    );
  }
}

function regionChangedCount(source, result, x0, x1, y0, y1) {
  let changed = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * source.width + x) * 4;
      if (
        source.data[index] !== result.data[index]
        || source.data[index + 1] !== result.data[index + 1]
        || source.data[index + 2] !== result.data[index + 2]
      ) changed++;
    }
  }
  return changed;
}

function regionNonPaperCount(image, paper, x0, x1, y0, y1) {
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * image.width + x) * 4;
      if (
        Math.abs(image.data[index] - paper[0]) > 5
        || Math.abs(image.data[index + 1] - paper[1]) > 5
        || Math.abs(image.data[index + 2] - paper[2]) > 5
      ) count++;
    }
  }
  return count;
}

test('disabled and zero-strength print layers are exact identity passes', () => {
  const source = makePhoto(16, 12);
  const originalBytes = source.data.slice();
  assert.equal(processPhotoPrintEffects(source, []), source);
  assert.equal(processPhotoPrintEffects(source, ['xerox'], { xerox: 0 }), source);
  assert.equal(processPhotoPrintEffects(source, ['unknown-effect']), source);
  assert.deepEqual(source.data, originalBytes);
});

test('each treatment is deterministic, leaves source pixels untouched, and preserves alpha', () => {
  const photo = makePhoto(72, 56);
  const source = makeImage(72, 56, (x, y) => {
    const index = (y * 72 + x) * 4;
    const alpha = x < 5 && y < 7 ? 0 : x === 10 && y === 10 ? 96 : 255;
    return [photo.data[index], photo.data[index + 1], photo.data[index + 2], alpha];
  });
  const originalBytes = source.data.slice();

  for (const effect of CARD_TEXTURE_LAYER_ORDER) {
    const first = processPhotoPrintEffects(source, [effect], { [effect]: 100 }, [239, 226, 207]);
    const second = processPhotoPrintEffects(source, [effect], { [effect]: 100 }, [239, 226, 207]);
    assert.deepEqual(first.data, second.data, `${effect} output should be deterministic`);
    assert.deepEqual(source.data, originalBytes, `${effect} must not mutate its input`);
    for (let index = 3; index < source.data.length; index += 4) {
      assert.equal(first.data[index], source.data[index], `${effect} must preserve alpha at pixel ${index / 4}`);
    }
    assertTransparentPixelsExact(source, first, effect);
  }
});

test('Xerox pushes highlights to paper and gives colored shadows a mottled high-contrast print', () => {
  const source = makeImage(64, 40, (x, y) => (
    x >= 16 && x < 48 && y >= 8 && y < 32 ? [152, 39, 30, 255] : [250, 249, 247, 255]
  ));
  const result = processPhotoPrintEffects(source, ['xerox'], { xerox: 100 }, [244, 232, 211]);
  const paperIndex = (3 * source.width + 4) * 4;
  const inkIndex = (18 * source.width + 30) * 4;

  assert.deepEqual([...result.data.slice(paperIndex, paperIndex + 3)], [244, 232, 211]);
  assert.ok(result.data[inkIndex] < source.data[inkIndex], 'dark image shapes should gain contrast');
  assert.ok(result.data[inkIndex] > result.data[inkIndex + 1], 'printed shadows should retain source color');
  const redValues = [];
  for (let y = 8; y < 32; y++) {
    for (let x = 16; x < 48; x++) redValues.push(result.data[(y * source.width + x) * 4]);
  }
  assert.ok(Math.max(...redValues) - Math.min(...redValues) > 20, 'dark shapes should show actual mottled toner dropout');
});

test('Halftone makes sampled-color dots with paper gaps sized by local tone', () => {
  const source = makeImage(156, 40, (x) => {
    if (x < 52) return [255, 255, 255, 255];
    if (x < 104) return [132, 132, 132, 255];
    return [42, 82, 146, 255];
  });
  const paper = [249, 244, 232];
  const result = processPhotoPrintEffects(source, ['halftone'], { halftone: 100 }, paper);
  const whiteDots = regionNonPaperCount(result, paper, 0, 52, 0, 40);
  const midtoneDots = regionNonPaperCount(result, paper, 52, 104, 0, 40);
  const shadowDots = regionNonPaperCount(result, paper, 104, 156, 0, 40);
  const coloredDotIndex = (2 * source.width + 106) * 4;
  const paperGapIndex = (0 * source.width + 104) * 4;

  assert.equal(whiteDots, 0, 'white regions and holes should stay paper without receiving dots');
  assert.ok(shadowDots > midtoneDots, 'darker regions should have larger or denser halftone dots');
  assert.ok(midtoneDots > 0);
  assert.ok(result.data[coloredDotIndex + 2] > result.data[coloredDotIndex], 'dots should carry the sampled blue ink hue');
  assert.ok(result.data[coloredDotIndex] < 80 && result.data[coloredDotIndex + 1] < 120, 'dot interiors should use sampled photo color');
  assert.deepEqual([...result.data.slice(paperGapIndex, paperGapIndex + 3)], paper, 'the gaps between dots should reveal stock paper');
});

test('bright saturated yellow petals print as colored ink while white stays clean', () => {
  const source = makeYellowTulip();
  const paper = [255, 255, 255];
  const yellowPixels = [];
  for (let index = 0; index < source.data.length; index += 4) {
    if (source.data[index] === 255 && source.data[index + 1] < 250 && source.data[index + 2] < 80) {
      yellowPixels.push(index);
    }
  }

  const halftone = processPhotoPrintEffects(source, ['halftone'], { halftone: 100 }, paper);
  const distressed = processPhotoPrintEffects(source, ['distressed'], { distressed: 100 }, paper);
  const xerox = processPhotoPrintEffects(source, ['xerox'], { xerox: 100 }, paper);
  const beforeWear = processPhotoPrintEffects(source, ['xerox', 'halftone'], { xerox: 100, halftone: 100 }, paper);
  const combined = processPhotoPrintEffects(
    source,
    ['xerox', 'halftone', 'distressed'],
    { xerox: 100, halftone: 100, distressed: 100 },
    paper,
  );
  let halftoneDots = 0;
  let coloredDots = 0;
  let distressedChips = 0;
  let intactPetalPixels = 0;
  let retainedYellowInk = 0;
  let combinedColoredPixels = 0;
  let combinedWearPixels = 0;

  for (let index = 0; index < source.data.length; index += 4) {
    const isYellow = source.data[index] === 255 && source.data[index + 1] < 250 && source.data[index + 2] < 80;
    const isWhite = source.data[index] === 255 && source.data[index + 1] === 255 && source.data[index + 2] === 255;
    if (isWhite) {
      assert.deepEqual([...halftone.data.slice(index, index + 3)], paper, 'white should remain a quiet paper gap');
      assert.deepEqual([...distressed.data.slice(index, index + 3)], paper, 'distressing must leave blank white stock clean');
      assert.deepEqual([...xerox.data.slice(index, index + 3)], paper, 'Xerox highlights should remain paper white');
      assert.deepEqual([...combined.data.slice(index, index + 3)], paper, 'the full stack must preserve clean white stock');
    }
    if (!isYellow) continue;

    if (
      halftone.data[index] !== paper[0]
      || halftone.data[index + 1] !== paper[1]
      || halftone.data[index + 2] !== paper[2]
    ) halftoneDots++;
    if (halftone.data[index] > halftone.data[index + 1] && halftone.data[index + 1] > halftone.data[index + 2]) coloredDots++;
    if (
      distressed.data[index] !== source.data[index]
      || distressed.data[index + 1] !== source.data[index + 1]
      || distressed.data[index + 2] !== source.data[index + 2]
    ) distressedChips++;
    else intactPetalPixels++;
    if (xerox.data[index] >= xerox.data[index + 1] && xerox.data[index + 1] > xerox.data[index + 2] + 20) retainedYellowInk++;
    if (combined.data[index + 1] < paper[1] || combined.data[index + 2] < paper[2]) combinedColoredPixels++;
    if (
      combined.data[index] > beforeWear.data[index]
      || combined.data[index + 1] > beforeWear.data[index + 1]
      || combined.data[index + 2] > beforeWear.data[index + 2]
    ) combinedWearPixels++;
  }

  assert.ok(yellowPixels.length > 400, 'synthetic tulip should contain a meaningful bright-yellow region');
  assert.ok(halftoneDots > 0, 'bright yellow should receive halftone dots based on chromatic ink density');
  assert.ok(coloredDots > 0, 'yellow halftone dots should preserve sampled yellow hue');
  assert.ok(distressedChips > 0, 'bright colored petals should receive irregular paper-colored wear');
  assert.ok(intactPetalPixels > 0, 'wear should retain parts of the original petal shape');
  assert.ok(retainedYellowInk > 0, 'Xerox should keep bright yellow as colored ink instead of bleaching it to paper');
  assert.ok(combinedColoredPixels > 0, 'the full print stack should retain sampled yellow dots');
  assert.ok(combinedWearPixels > 0, 'the full stack should apply wear to the colored petal print');
});

test('Distressed makes organic paper knockouts in image tones and leaves blank stock clean', () => {
  const source = makeImage(80, 64, (x, y) => {
    const alpha = x < 8 && y < 8 ? 0 : x === 11 && y === 12 ? 96 : 255;
    const insideInk = x >= 18 && x < 62 && y >= 12 && y < 52;
    return insideInk ? [35, 43, 69, alpha] : [248, 247, 243, alpha];
  });
  const result = processPhotoPrintEffects(source, ['distressed'], { distressed: 100 }, [238, 226, 204]);
  const blankStockChanges = regionChangedCount(source, result, 8, 17, 20, 45);
  const inkChanges = regionChangedCount(source, result, 18, 62, 12, 52);
  const knockoutCount = (() => {
    let count = 0;
    for (let y = 12; y < 52; y++) {
      for (let x = 18; x < 62; x++) {
        const index = (y * source.width + x) * 4;
        if (result.data[index] > source.data[index] + 80) count++;
      }
    }
    return count;
  })();

  assert.equal(blankStockChanges, 0, 'the effect should not place repeated scratches or chips in blank paper');
  assert.ok(inkChanges > 0);
  assert.ok(knockoutCount > 0, 'worn ink should reveal the supplied paper color');
  assert.ok(knockoutCount < 44 * 40, 'wear should remain irregular instead of whitening the whole image shape');
  assert.equal(result.data[(12 * source.width + 11) * 4 + 3], 96, 'partially transparent alpha must remain unchanged');
  assert.deepEqual([...result.data.slice(0, 4)], [...source.data.slice(0, 4)], 'transparent pixels remain exact');
});

test('print layers are distinct and their ordered composition is noncommutative', () => {
  const source = makePhoto();
  const allStrong = { xerox: 100, halftone: 100, distressed: 100 };
  const separate = CARD_TEXTURE_LAYER_ORDER.map((effect) => (
    processPhotoPrintEffects(source, [effect], { [effect]: 100 }, [239, 226, 207])
  ));
  assert.notDeepEqual(separate[0].data, separate[1].data);
  assert.notDeepEqual(separate[1].data, separate[2].data);
  assert.notDeepEqual(separate[0].data, separate[2].data);

  const ordered = processPhotoPrintEffects(source, ['distressed', 'halftone', 'xerox'], allStrong, [239, 226, 207]);
  const reordered = processPhotoPrintEffects(source, ['xerox', 'halftone', 'distressed'], allStrong, [239, 226, 207]);
  assert.deepEqual(ordered.data, reordered.data, 'the processor should enforce Xerox → Halftone → Distressed');

  const xeroxThenHalftone = processPhotoPrintEffects(
    processPhotoPrintEffects(source, ['xerox'], { xerox: 100 }, [239, 226, 207]),
    ['halftone'],
    { halftone: 100 },
    [239, 226, 207],
  );
  const halftoneThenXerox = processPhotoPrintEffects(
    processPhotoPrintEffects(source, ['halftone'], { halftone: 100 }, [239, 226, 207]),
    ['xerox'],
    { xerox: 100 },
    [239, 226, 207],
  );
  assert.notDeepEqual(xeroxThenHalftone.data, halftoneThenXerox.data, 'each stage should transform the preceding pixels');
  assert.notDeepEqual(ordered.data, separate[0].data);
  assert.notDeepEqual(ordered.data, separate[1].data);
  assert.notDeepEqual(ordered.data, separate[2].data);
});

test('the documented default intensities produce restrained but visible treatments', () => {
  const source = makePhoto();
  for (const effect of CARD_TEXTURE_LAYER_ORDER) {
    const result = processPhotoPrintEffects(source, [effect], undefined, [239, 226, 207]);
    assert.ok(DEFAULT_CARD_TEXTURE_INTENSITY[effect] > 0);
    assert.ok(regionChangedCount(source, result, 0, source.width, 0, source.height) > 0, `${effect} default should be visible`);
  }
});

test('malformed RGBA dimensions are rejected before any processing', () => {
  assert.throws(
    () => processPhotoPrintEffects({ width: 2, height: 2, data: new Uint8ClampedArray(12) }, ['xerox']),
    RangeError,
  );
});

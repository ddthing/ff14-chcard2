import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { resolve } from 'node:path';
import sharp from 'sharp';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';

register('./ts-alias-loader.mjs', import.meta.url);

const { getCardMaterialAssets, getCardMaterialStyleProperties, resolveCardMaterial, SAFE_MATERIAL_FALLBACK } = await import('../src/lib/card-materials.ts');
const { getMasterArtProperties } = await import('../src/lib/card-art-tokens.ts');
const { getEditorialBrushShape } = await import('../src/lib/card-graphics/editorial-shape.ts');

const EXPECTED_MATERIALS = {
  cinematic: [['cinematic-film-grain', '/images/materials/cinematic-film-grain.webp', 0.45]],
  editorial: [
    ['editorial-paper-surface', '/images/materials/editorial-paper-surface.webp', 0.3],
    ['editorial-ink-density', '/images/materials/editorial-ink-density.webp', 0.5],
  ],
  'id-card': [['identity-matte-fiber', '/images/materials/identity-matte-fiber.webp', 0.3]],
};

const MATERIAL_MANIFEST = JSON.parse(readFileSync(resolve(process.cwd(), 'public/images/materials/material-manifest.json'), 'utf8'));
const MATERIAL_AFTER = resolve(process.cwd(), 'docs/qa/phase213-material/after');
const evidenceTest = evidenceTests(test, 'phase213-material');
const CAPTURE_VARIANTS = {
  cinematic: {
    default: 'qa213-cinematic-default-png-2x.png',
    strong: 'qa213-cinematic-strong-1_85-png-2x.png',
    off: 'qa213-cinematic-texture-off-png-2x.png',
  },
  editorial: {
    default: 'qa213-editorial-default-png-2x.png',
    strong: 'qa213-editorial-strong-1_85-png-2x.png',
    off: 'qa213-editorial-texture-off-png-2x.png',
  },
  'id-card': {
    default: 'qa213-id-card-default-png-2x.png',
    strong: 'qa213-id-card-strong-1_85-png-2x.png',
    off: 'qa213-id-card-texture-off-png-2x.png',
  },
};

const GLYPH_CONTOUR_CROPS = {
  cinematic: { left: 970, top: 1900, width: 200, height: 200, minIou: 0.995 },
  editorial: { left: 1220, top: 2260, width: 200, height: 200, minIou: 0.995 },
  'id-card': { left: 1290, top: 2380, width: 200, height: 200, minIou: 0.99 },
};

async function decodeCapture(filename) {
  const path = resolve(MATERIAL_AFTER, filename);
  assert.ok(existsSync(path), `capture exists: ${filename}`);
  const { data, info } = await sharp(path).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [2160, 2700, 4], `${filename} dimensions/channels`);
  return { data, width: info.width, height: info.height };
}

function changedPixels(left, right, minimumChannelDelta = 1) {
  assert.equal(left.width, right.width);
  assert.equal(left.height, right.height);
  let changed = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    const delta = Math.max(
      Math.abs(left.data[offset] - right.data[offset]),
      Math.abs(left.data[offset + 1] - right.data[offset + 1]),
      Math.abs(left.data[offset + 2] - right.data[offset + 2]),
    );
    if (delta > minimumChannelDelta) changed++;
  }
  return changed;
}

function luminance(red, green, blue) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function glyphCoverage(family, red, green, blue) {
  if (family === 'cinematic') return luminance(red, green, blue) > 235;
  if (family === 'id-card') return luminance(red, green, blue) < 140;

  const background = [239, 230, 213];
  const ink = [142, 78, 84];
  const direction = ink.map((value, channel) => value - background[channel]);
  const magnitude = direction.reduce((sum, value) => sum + value * value, 0);
  const projection = (
    (red - background[0]) * direction[0]
    + (green - background[1]) * direction[1]
    + (blue - background[2]) * direction[2]
  ) / magnitude;
  return projection > 0.15;
}

function glyphMaskIoU(family, left, right) {
  const crop = GLYPH_CONTOUR_CROPS[family];
  let leftCount = 0;
  let rightCount = 0;
  let intersection = 0;

  for (let y = crop.top; y < crop.top + crop.height; y++) {
    for (let x = crop.left; x < crop.left + crop.width; x++) {
      const offset = (y * left.width + x) * 4;
      const leftMask = glyphCoverage(family, left.data[offset], left.data[offset + 1], left.data[offset + 2]);
      const rightMask = glyphCoverage(family, right.data[offset], right.data[offset + 1], right.data[offset + 2]);
      if (leftMask) leftCount++;
      if (rightMask) rightCount++;
      if (leftMask && rightMask) intersection++;
    }
  }

  const union = leftCount + rightCount - intersection;
  return union === 0 ? 1 : intersection / union;
}

test('each Master family has only its local material roles with explicit low-strength opacity', () => {
  for (const [family, expected] of Object.entries(EXPECTED_MATERIALS)) {
    const actual = getCardMaterialAssets(family).map(({ role, src, opacity }) => [role, src, opacity]);
    assert.deepEqual(actual, expected, `${family} material roles`);

    for (const [, src, opacity] of actual) {
      assert.match(src, /^\/images\/materials\/[a-z0-9-]+\.webp$/);
      assert.ok(opacity > 0 && opacity <= 0.5);
      assert.ok(existsSync(resolve(process.cwd(), 'public', src.slice(1))), `${src} exists under public/`);
    }
  }
});

test('unknown families and missing roles resolve to an inert transparent image', () => {
  assert.deepEqual(resolveCardMaterial('unknown-family', 'cinematic-film-grain'), SAFE_MATERIAL_FALLBACK);
  assert.deepEqual(resolveCardMaterial('cinematic', 'editorial-paper-surface'), SAFE_MATERIAL_FALLBACK);
  assert.deepEqual(resolveCardMaterial('editorial', 'missing-role'), SAFE_MATERIAL_FALLBACK);
  for (const inheritedRole of ['__proto__', 'constructor', 'toString', 'valueOf']) {
    assert.deepEqual(resolveCardMaterial('cinematic', inheritedRole), SAFE_MATERIAL_FALLBACK, inheritedRole);
  }
  assert.deepEqual(resolveCardMaterial(undefined, undefined), SAFE_MATERIAL_FALLBACK);
  assert.match(SAFE_MATERIAL_FALLBACK.src, /^data:image\/svg\+xml,/);
  assert.equal(SAFE_MATERIAL_FALLBACK.opacity, 0);
  assert.deepEqual(getCardMaterialAssets('unknown-family'), []);
});

test('CSS variables use the registry source and zero-opacity fallback for unused roles', () => {
  const props = getCardMaterialStyleProperties('cinematic');
  assert.equal(props['--material-cinematic-film-grain-image'], 'url("/images/materials/cinematic-film-grain.webp")');
  assert.equal(props['--material-cinematic-film-grain-opacity'], '0.45');
  assert.equal(props['--material-editorial-paper-surface-image'], `url("${SAFE_MATERIAL_FALLBACK.src}")`);
  assert.equal(props['--material-editorial-paper-surface-opacity'], '0');

  const familyProperties = getMasterArtProperties('editorial', {
    primary: '#b99b72', accent: '#b99b72', light: '#f3ede3', dark: '#111315',
  });
  assert.equal(familyProperties['--material-editorial-paper-surface-opacity'], '0.3');
  assert.equal(familyProperties['--material-editorial-ink-density-opacity'], '0.5');
  assert.equal('--master-material-opacity' in familyProperties, false);
});

test('editorial brush keeps the supplied SVG clip and chooses a composition for every ratio', () => {
  const expectedCompositions = {
    '1:1': 'side-panel',
    '4:5': 'side-panel',
    '3:4': 'side-panel',
    '9:16': 'stacked',
    '16:9': 'side-panel',
  };
  for (const [ratio, composition] of Object.entries(expectedCompositions)) {
    const shape = getEditorialBrushShape(ratio);
    assert.equal(shape.composition, composition, `${ratio} composition`);
    assert.equal(shape.inkOutline, '/assets/card-materials/v3/editorial-brush-outline.svg');
  }
});

evidenceTest('encoded material files match their manifest and decode as 1280×1600 RGBA alpha maps', async () => {
  const expectedRoles = Object.keys(EXPECTED_MATERIALS).flatMap(family => EXPECTED_MATERIALS[family].map(([role]) => role)).sort();
  assert.deepEqual(Object.keys(MATERIAL_MANIFEST.assets).sort(), expectedRoles);
  assert.deepEqual(MATERIAL_MANIFEST.dimensions, { width: 1280, height: 1600, channels: 4 });

  const hashes = [];
  const alphaMeans = [];
  for (const [role, asset] of Object.entries(MATERIAL_MANIFEST.assets)) {
    const assetPath = resolve(process.cwd(), 'public/images/materials', asset.file);
    assert.ok(existsSync(assetPath), `${role} manifest path exists`);
    const encoded = readFileSync(assetPath);
    assert.equal(encoded.byteLength, asset.bytes, `${role} encoded size`);
    const hash = createHash('sha256').update(encoded).digest('hex');
    assert.equal(hash, asset.encodedSha256, `${role} encoded hash`);
    hashes.push(hash);

    const metadata = await sharp(assetPath).metadata();
    assert.deepEqual([metadata.width, metadata.height, metadata.channels], [1280, 1600, 4], `${role} decoded metadata`);
    assert.equal(metadata.hasAlpha, true, `${role} has alpha`);
    const { data, info } = await sharp(assetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    let maximumAlpha = 0;
    let totalAlpha = 0;
    let nonTransparentPixels = 0;
    for (let offset = 3; offset < data.length; offset += 4) {
      const alpha = data[offset];
      maximumAlpha = Math.max(maximumAlpha, alpha);
      totalAlpha += alpha;
      if (alpha > 0) nonTransparentPixels++;
    }
    const pixelCount = info.width * info.height;
    const meanAlpha = totalAlpha / pixelCount;
    const nonTransparentFraction = nonTransparentPixels / pixelCount;
    assert.equal(maximumAlpha, asset.alpha.maxAlpha, `${role} decoded max alpha`);
    assert.ok(Math.abs(meanAlpha - asset.alpha.meanAlphaIncludingTransparent) < 0.001, `${role} decoded mean alpha`);
    assert.ok(Math.abs(nonTransparentFraction - asset.alpha.nonTransparentFraction) < 0.00001, `${role} decoded coverage`);
    alphaMeans.push(meanAlpha);
  }

  assert.equal(new Set(hashes).size, 4, 'each material role has distinct encoded pixels');
  assert.ok(new Set(alphaMeans).size > 1, 'role maps retain distinct alpha profiles');
});

evidenceTest('real 2× exports show default and strong material signal while preserving glyph coverage', async () => {
  for (const [family, variants] of Object.entries(CAPTURE_VARIANTS)) {
    const defaultCapture = await decodeCapture(variants.default);
    const strongCapture = await decodeCapture(variants.strong);
    const offCapture = await decodeCapture(variants.off);
    const defaultOffChanged = changedPixels(defaultCapture, offCapture);
    const strongDefaultChanged = changedPixels(strongCapture, defaultCapture);
    assert.ok(defaultOffChanged > 10_000, `${family}: default differs from material-off capture (${defaultOffChanged} pixels)`);
    assert.ok(strongDefaultChanged > 5_000, `${family}: 1.85 strength differs from default (${strongDefaultChanged} pixels)`);

    const contourIou = glyphMaskIoU(family, defaultCapture, offCapture);
    assert.ok(contourIou >= GLYPH_CONTOUR_CROPS[family].minIou, `${family}: default/off glyph mask IoU ${contourIou}`);
  }
});

test('cinematic foil-off selector targets the article rather than a hashed CSS Module class', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/cards/masters/cinematic-master.module.css'), 'utf8');
  assert.match(css, /:global\(article\[data-layout='a'\]\[data-material-texture='off'\]\) \.name\s*\{\s*--cinematic-foil-layer:\s*none/);
  assert.match(css, /background-image:\s*var\(--cinematic-foil-layer, none\),/);
  assert.doesNotMatch(css, /:global\(\.card\[data-layout='a'\]/);
});

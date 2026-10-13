import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ FONT_REGISTRY }, fontGenerator] = await Promise.all([
  import('../src/data/fonts/registry.ts'),
  import('../tools/generate-font-registry.mjs'),
]);

test('font registry format metadata validates the source file signatures', async () => {
  await fontGenerator.validateFontRegistry(FONT_REGISTRY);

  const ttfAsset = Object.values(FONT_REGISTRY)
    .flatMap((entry) => entry.localAssets ?? [])
    .find((asset) => asset.format === 'truetype');
  assert.ok(ttfAsset, 'the registry must include a licensed original TrueType asset');
  assert.ok(
    fontGenerator.renderFontsCss(FONT_REGISTRY).includes(`url("${ttfAsset.publicPath}") format("truetype")`),
    'the generated face must preserve the declared TrueType source format',
  );

  const entries = Object.entries(FONT_REGISTRY);
  const woff2 = entries.flatMap(([key, entry]) => (entry.localAssets ?? [])
    .map((asset, index) => ({ key, entry, asset, index })))
    .find(({ asset }) => (asset.format ?? 'woff2') === 'woff2');
  assert.ok(woff2, 'the registry must retain WOFF2 compatibility');

  const wrongFormatRegistry = structuredClone(FONT_REGISTRY);
  wrongFormatRegistry[woff2.key].localAssets[woff2.index].format = 'opentype';
  await assert.rejects(
    fontGenerator.validateFontRegistry(wrongFormatRegistry),
    /signature must match opentype/u,
  );

  const unsupportedFormatRegistry = structuredClone(FONT_REGISTRY);
  unsupportedFormatRegistry[woff2.key].localAssets[woff2.index].format = 'woff';
  await assert.rejects(
    fontGenerator.validateFontRegistry(unsupportedFormatRegistry),
    /format must be woff2, truetype, or opentype/u,
  );
});

test('font CSS renderer preserves legacy WOFF2 defaults and supports safe original formats', () => {
  const asset = Object.values(FONT_REGISTRY).flatMap((entry) => entry.localAssets ?? [])[0];
  const makeRegistry = (format) => ({
    sample: {
      family: 'Format Sample',
      axes: { weight: [400, 400] },
      localAssets: [{ ...asset, ...(format === undefined ? {} : { format }) }],
    },
  });

  assert.match(fontGenerator.renderFontsCss(makeRegistry(undefined)), /format\("woff2"\)/u);
  assert.match(fontGenerator.renderFontsCss(makeRegistry('truetype')), /format\("truetype"\)/u);
  assert.match(fontGenerator.renderFontsCss(makeRegistry('opentype')), /format\("opentype"\)/u);
  assert.throws(() => fontGenerator.renderFontsCss(makeRegistry('woff')), /format must be woff2, truetype, or opentype/u);
});

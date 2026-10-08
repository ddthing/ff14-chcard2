import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ CARD_EXPORT_RATIOS, getCardExportLogicalDimensions, getCardExportSize }, { OFFICIAL_JOB_ICON_ASSETS }, optics] = await Promise.all([
  import('../src/lib/card-export/index.ts'),
  import('../src/lib/ffxiv-assets/job-icons.ts'),
  import('../src/lib/job-identity-optics.ts'),
]);

test('job identity glyphs stay within the smallest Fan Kit source at actual 4x export dimensions', () => {
  const minimumSourceEdge = Math.min(...Object.values(OFFICIAL_JOB_ICON_ASSETS).map((asset) => Math.min(asset.width, asset.height)));
  assert.equal(minimumSourceEdge, optics.JOB_IDENTITY_OPTICAL_METADATA.sourcePixelEdgeAtMaxScale);

  for (const ratio of CARD_EXPORT_RATIOS) {
    const logicalWidth = getCardExportLogicalDimensions(ratio).width;
    const outputWidth = getCardExportSize(ratio, 4).width;
    const actualOutputPixelsPerLogicalPixel = outputWidth / logicalWidth;
    const logicalGlyphSize = optics.getJobIdentityGlyphLogicalSize(ratio);
    const responsiveCqiSize = optics.getJobIdentityGlyphCqiSize(ratio);
    const responsiveLogicalGlyphSize = responsiveCqiSize * logicalWidth / 100;
    const glyphOutputEdge = responsiveLogicalGlyphSize * actualOutputPixelsPerLogicalPixel;

    assert.ok(optics.getJobIdentityGlyphLogicalSize(ratio) > 0, `${ratio} has a positive glyph size`);
    assert.ok(
      glyphOutputEdge <= minimumSourceEdge,
      `${ratio} glyph is ${glyphOutputEdge.toFixed(3)} output px, within ${minimumSourceEdge}px source`,
    );
    assert.ok(
      minimumSourceEdge - glyphOutputEdge < 0.2,
      `${ratio} uses the available source envelope without rounding up`,
    );
    assert.ok(
      logicalGlyphSize - responsiveLogicalGlyphSize < 0.001,
      `${ratio} cqi size preserves its logical export geometry in responsive previews`,
    );
  }
});

test('a hidden or unavailable identity glyph switches to the text-only lockup', () => {
  assert.deepEqual(optics.getJobIdentityMarkState(false, true), { showMark: false, layout: 'text-only' });
  assert.deepEqual(optics.getJobIdentityMarkState(true, false), { showMark: false, layout: 'text-only' });
  assert.deepEqual(optics.getJobIdentityMarkState(true, true), { showMark: true, layout: 'with-mark' });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ CARD_EXPORT_RATIOS, getCardExportLogicalDimensions, getCardExportSize }, { default: iconManifest }, optics] = await Promise.all([
  import('../src/lib/card-export/index.ts'),
  import('../src/lib/ffxiv-assets/xivapi-job-icon-manifest.json', { with: { type: 'json' } }),
  import('../src/lib/job-identity-optics.ts'),
]);

const identityCss = readFileSync(new URL('../src/components/cards/masters/identity-master.module.css', import.meta.url), 'utf8');
const cinematicCss = readFileSync(new URL('../src/components/cards/masters/cinematic-master.module.css', import.meta.url), 'utf8');

function cqiFromRule(css, selector, property) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return null;
  const end = css.indexOf('}', start);
  if (end < 0) return null;
  const declaration = css.slice(start, end).match(new RegExp(`\\b${property}\\s*:\\s*([\\d.]+)cqi`));
  return declaration ? Number(declaration[1]) : null;
}

function cqiFromRatioRule(css, selector, ratio, property) {
  const override = cqiFromRule(css, `.canvas[data-ratio='${ratio}'] ${selector}`, property);
  return override ?? cqiFromRule(css, selector, property);
}

test('job identity glyphs use native XIVAPI source pixels at 4x and scale with export size', () => {
  const sourceEdges = Object.values(iconManifest.entries).flatMap((entry) => [entry.svg, entry.raster])
    .filter(Boolean)
    .map((asset) => Math.min(asset.width, asset.height));
  const minimumSourceEdge = Math.min(...sourceEdges);
  const maxOutputEdge = optics.JOB_IDENTITY_OPTICAL_METADATA.maxOutputGlyphEdgeAtMaxScale;
  assert.equal(minimumSourceEdge, 256);
  assert.equal(maxOutputEdge, minimumSourceEdge);
  assert.equal(optics.JOB_IDENTITY_OPTICAL_METADATA.auditedExportScale, 4);

  for (const ratio of CARD_EXPORT_RATIOS) {
    const logicalWidth = getCardExportLogicalDimensions(ratio).width;
    const outputPixelFactors = [1, 2, 4].map((scale) => getCardExportSize(ratio, scale).width / logicalWidth);
    const outputPixelsPerLogicalPixelAtMaxScale = outputPixelFactors[2];
    const logicalGlyphSize = optics.getJobIdentityGlyphLogicalSize(ratio);
    const nativeOutputEdge = logicalGlyphSize * outputPixelsPerLogicalPixelAtMaxScale;

    assert.ok(
      logicalGlyphSize > 0,
      `${ratio} has a positive native-source glyph size`,
    );
    assert.ok(
      nativeOutputEdge <= maxOutputEdge,
      `${ratio} native raster edge is ${nativeOutputEdge.toFixed(3)} output px, within the ${maxOutputEdge}px source cap`,
    );
    assert.ok(
      maxOutputEdge - nativeOutputEdge < 0.2,
      `${ratio} uses the original 256px source edge at 4x without rounding up`,
    );

    for (const container of ['identityBadge', 'cinematicSeal']) {
      const maxCqiSize = optics.JOB_IDENTITY_GLYPH_CONTAINER_CQI[container][ratio];
      const glyphCqiSize = optics.getJobIdentityGlyphCqiSize(ratio, container);
      const responsiveLogicalGlyphSize = glyphCqiSize * logicalWidth / 100;
      const nativeCqiSize = logicalGlyphSize / logicalWidth * 100;

      assert.ok(glyphCqiSize > 0, `${ratio} ${container} has a positive responsive glyph size`);
      assert.ok(glyphCqiSize <= maxCqiSize, `${ratio} ${container} glyph fits its CSS mark width`);
      assert.equal(
        glyphCqiSize,
        Math.floor((Math.min(nativeCqiSize, maxCqiSize) + Number.EPSILON) * 100) / 100,
        `${ratio} ${container} cqi follows the source and layout caps`,
      );

      let previousOutputEdge = 0;
      for (const [index, scale] of [1, 2, 4].entries()) {
        const glyphOutputEdge = responsiveLogicalGlyphSize * outputPixelFactors[index];
        assert.ok(
          glyphOutputEdge <= maxOutputEdge,
          `${ratio} ${container} at ${scale}x is ${glyphOutputEdge.toFixed(3)}px, within its native source cap`,
        );
        assert.ok(glyphOutputEdge > previousOutputEdge, `${ratio} ${container} grows with the ${scale}x output scale`);
        previousOutputEdge = glyphOutputEdge;
      }
    }
  }
});

test('identity and Cinematic mark caps match their CSS boxes, including wide layouts', () => {
  for (const ratio of CARD_EXPORT_RATIOS) {
    assert.equal(
      optics.JOB_IDENTITY_GLYPH_CONTAINER_CQI.identityBadge[ratio],
      cqiFromRatioRule(identityCss, '.jobBadgeMark', ratio, 'width'),
      `${ratio} identity cap matches the badge width`,
    );
    assert.equal(
      optics.JOB_IDENTITY_GLYPH_CONTAINER_CQI.cinematicSeal[ratio],
      cqiFromRatioRule(cinematicCss, '.jobSeal', ratio, 'width'),
      `${ratio} Cinematic cap matches the seal width`,
    );

    const identityHeight = cqiFromRatioRule(identityCss, '.jobBadgeMark', ratio, 'height');
    const cinematicHeight = cqiFromRatioRule(cinematicCss, '.jobSeal', ratio, 'height');
    assert.ok(optics.getJobIdentityGlyphCqiSize(ratio, 'identityBadge') <= identityHeight);
    assert.ok(optics.getJobIdentityGlyphCqiSize(ratio, 'cinematicSeal') <= cinematicHeight);
  }

  assert.equal(optics.getJobIdentityGlyphCqiSize('4:5', 'identityBadge'), 6);
  assert.equal(optics.getJobIdentityGlyphCqiSize('16:9', 'identityBadge'), 3.2);
  assert.equal(optics.getJobIdentityGlyphCqiSize('16:9', 'cinematicSeal'), 3.4);
});

test('a hidden or unavailable identity glyph switches to the text-only lockup', () => {
  assert.deepEqual(optics.getJobIdentityMarkState(false, true), { showMark: false, layout: 'text-only' });
  assert.deepEqual(optics.getJobIdentityMarkState(true, false), { showMark: false, layout: 'text-only' });
  assert.deepEqual(optics.getJobIdentityMarkState(true, true), { showMark: true, layout: 'with-mark' });
});

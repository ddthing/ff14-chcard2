import type { CardRatio } from '@/components/cards/types';

/**
 * XIVAPI raster originals are 256px square, so a 4x export may use their full
 * native edge. SVG sources remain scalable; this shared output ceiling also
 * keeps their identity marks within the raster source's composition budget.
 * Per-ratio factors mirror getCardExportSize and getCardExportLogicalDimensions.
 *
 * CSS mark boxes add a second, layout-specific bound. The identity badge can
 * use its full 6cqi track while smaller Cinematic and wide marks stay framed.
 */
export const JOB_IDENTITY_OPTICAL_METADATA = Object.freeze({
  maxOutputGlyphEdgeAtMaxScale: 256,
  auditedExportScale: 4,
  logicalWidthByRatio: Object.freeze({
    '1:1': 432,
    '4:5': 432,
    '3:4': 432,
    '9:16': 432,
    '16:9': 640,
  } satisfies Readonly<Record<CardRatio, number>>),
  outputPixelsPerLogicalPixelAtMaxScale: Object.freeze({
    '1:1': 10,
    '4:5': 4195 / 432,
    '3:4': 4062 / 432,
    '9:16': 3517 / 432,
    '16:9': 6253 / 640,
  } satisfies Readonly<Record<CardRatio, number>>),
});

export type JobIdentityGlyphContainer = 'identityBadge' | 'cinematicSeal';

/** Width of each mark's CSS box, mirrored from the master card styles. */
export const JOB_IDENTITY_GLYPH_CONTAINER_CQI = Object.freeze({
  identityBadge: Object.freeze({
    '1:1': 5.1,
    '4:5': 6,
    '3:4': 6,
    '9:16': 5.5,
    '16:9': 3.2,
  } satisfies Readonly<Record<CardRatio, number>>),
  cinematicSeal: Object.freeze({
    '1:1': 4.7,
    '4:5': 4.7,
    '3:4': 4.7,
    '9:16': 4.7,
    '16:9': 3.4,
  } satisfies Readonly<Record<CardRatio, number>>),
});

const roundDownToHundredth = (value: number) => Math.floor((value + Number.EPSILON) * 100) / 100;

/** Logical CSS-pixel glyph size that uses up to the native 256px raster edge at 4x. */
export function getJobIdentityGlyphLogicalSize(ratio: CardRatio): number {
  const outputPixelsPerLogicalPixel = JOB_IDENTITY_OPTICAL_METADATA.outputPixelsPerLogicalPixelAtMaxScale[ratio];
  return roundDownToHundredth(JOB_IDENTITY_OPTICAL_METADATA.maxOutputGlyphEdgeAtMaxScale / outputPixelsPerLogicalPixel);
}

/** Convert the native-source cap to cqi, bounded by the chosen mark's CSS box. */
export function getJobIdentityGlyphCqiSize(
  ratio: CardRatio,
  container: JobIdentityGlyphContainer = 'identityBadge',
): number {
  const logicalWidth = JOB_IDENTITY_OPTICAL_METADATA.logicalWidthByRatio[ratio];
  const logicalSize = getJobIdentityGlyphLogicalSize(ratio);
  const nativeCqiSize = (logicalSize / logicalWidth) * 100;
  const containerCqiSize = JOB_IDENTITY_GLYPH_CONTAINER_CQI[container][ratio];
  return Math.floor((Math.min(nativeCqiSize, containerCqiSize) + Number.EPSILON) * 100) / 100;
}

/** Hidden or unavailable marks use a text-only lockup with no empty icon track. */
export function getJobIdentityMarkState(visible: boolean, hasJob: boolean) {
  const showMark = visible && hasJob;
  return {
    showMark,
    layout: showMark ? 'with-mark' as const : 'text-only' as const,
  };
}

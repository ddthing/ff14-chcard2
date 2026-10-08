import type { CardRatio } from '@/components/cards/types';

/**
 * Shared job glyphs are sized against the smallest reviewed native icon source
 * (the 76px Fan Kit set) at the export pipeline's maximum 4x scale. The
 * per-ratio output factors mirror getCardExportSize/getCardExportLogicalDimensions;
 * the focused test keeps this metadata honest if export geometry changes.
 *
 * The surrounding seal, print frame, or badge stays larger in each Master CSS.
 * This cap is only for the glyph itself, so raster sources remain crisp at 4x.
 */
export const JOB_IDENTITY_OPTICAL_METADATA = Object.freeze({
  sourcePixelEdgeAtMaxScale: 76,
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

const roundDownToHundredth = (value: number) => Math.floor((value + Number.EPSILON) * 100) / 100;

/** Logical CSS-pixel glyph size that stays within the 76px source at 4x. */
export function getJobIdentityGlyphLogicalSize(ratio: CardRatio): number {
  const outputPixelsPerLogicalPixel = JOB_IDENTITY_OPTICAL_METADATA.outputPixelsPerLogicalPixelAtMaxScale[ratio];
  return roundDownToHundredth(JOB_IDENTITY_OPTICAL_METADATA.sourcePixelEdgeAtMaxScale / outputPixelsPerLogicalPixel);
}

/** Convert the 4x-capped logical size to a responsive cqi value for previews. */
export function getJobIdentityGlyphCqiSize(ratio: CardRatio): number {
  const logicalWidth = JOB_IDENTITY_OPTICAL_METADATA.logicalWidthByRatio[ratio];
  const logicalSize = getJobIdentityGlyphLogicalSize(ratio);
  return Math.floor((logicalSize / logicalWidth) * 1_000_000) / 10_000;
}

/** Hidden or unavailable marks use a text-only lockup with no empty icon track. */
export function getJobIdentityMarkState(visible: boolean, hasJob: boolean) {
  const showMark = visible && hasJob;
  return {
    showMark,
    layout: showMark ? 'with-mark' as const : 'text-only' as const,
  };
}

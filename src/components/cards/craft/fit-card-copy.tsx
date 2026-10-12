'use client';

import { useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';
import type { CardRatio, CardTypographyOverride } from '@/components/cards/types';
import type { Locale } from '@/lib/types';
import { detectTypographyScript, getMasterTypographyTreatment, type MasterTypographyFamily } from '@/lib/typography-presets';

const MIN_FIT_SCALE = 0.38;

export function fitCardCopyFontSize(maximum: number, fits: (fontSize: number) => boolean): { fontSize: number; overflow: boolean } {
  const upperBound = Math.max(1, maximum);
  const lowerBound = Math.max(1, upperBound * MIN_FIT_SCALE);
  if (fits(upperBound)) return { fontSize: upperBound, overflow: false };
  if (!fits(lowerBound)) return { fontSize: lowerBound, overflow: true };
  let lower = lowerBound;
  let upper = upperBound;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (fits(middle)) lower = middle;
    else upper = middle;
  }
  return { fontSize: lower, overflow: false };
}

interface FitCardCopyProps extends HTMLAttributes<HTMLDivElement> {
  family: MasterTypographyFamily;
  locale: Locale;
  ratio: CardRatio;
  role: 'caption' | 'secondaryDisplay';
  text: string;
  typography?: CardTypographyOverride;
}

interface FitResult {
  key: string;
  fontSize: number;
  overflow: boolean;
}

function cssPixels(value: string): number {
  const result = Number.parseFloat(value);
  return Number.isFinite(result) ? result : 0;
}

function authoredBoxHeight(node: HTMLElement): number {
  const maxHeight = getComputedStyle(node).maxHeight;
  if (maxHeight === 'none') return node.clientHeight;
  const value = cssPixels(maxHeight);
  if (maxHeight.endsWith('%')) {
    const containingBlock = node.offsetParent as HTMLElement | null;
    const containingHeight = containingBlock?.clientHeight ?? node.parentElement?.clientHeight ?? 0;
    const resolved = containingHeight * value / 100;
    return resolved > 0 ? resolved : node.clientHeight;
  }
  return value > 0 ? value : node.clientHeight;
}

/** Fits user-authored card copy into its designed text box, keeping the full copy visible. */
export function FitCardCopy({ family, locale, ratio, role, text, typography, style, ...attributes }: FitCardCopyProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const fitKey = useMemo(() => JSON.stringify([family, locale, ratio, role, text, typography]), [family, locale, ratio, role, text, typography]);
  const [fitResult, setFitResult] = useState<FitResult | null>(null);
  const fitted = fitResult?.key === fitKey ? fitResult : null;
  const needsLongCopyWrap = Array.from(text).length > 20;
  const fallbackScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const script = detectTypographyScript(text, fallbackScript);
  const treatment = getMasterTypographyTreatment(family, role, script, typography);
  const activeStyle = {
    ...style,
    ...(typography?.fontFamily ? { fontFamily: treatment.fontFamily } : {}),
    ...(typography?.weight !== undefined ? { fontWeight: treatment.weight } : {}),
    ...(typography?.trackingEm !== undefined
      ? { letterSpacing: `calc(${treatment.tracking} + ${typography.trackingEm}em)` }
      : {}),
    ...(needsLongCopyWrap ? { overflowWrap: 'anywhere' as const, wordBreak: 'normal' as const } : {}),
    ...(fitted ? { fontSize: `${fitted.fontSize}px` } : {}),
  };

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    let active = true;
    let measuring = false;
    const measure = () => {
      if (!active || measuring || !node.isConnected) return;
      measuring = true;
      const authoredSize = node.style.fontSize;
      const previousOverflowState = node.getAttribute('data-card-text-fit-overflow');
      try {
        node.removeAttribute('data-card-text-fit-overflow');
        node.style.fontSize = '';
        const baseSize = cssPixels(getComputedStyle(node).fontSize);
        const sizeScale = Math.min(1.25, Math.max(.75, (typography?.sizePercent ?? 100) / 100));
        const maximum = Math.max(1, baseSize * sizeScale);
        const boxHeight = authoredBoxHeight(node);
        const boxWidth = node.clientWidth;
        const fits = (fontSize: number) => {
          node.style.fontSize = `${fontSize}px`;
          return node.scrollHeight <= boxHeight + 1 && node.scrollWidth <= boxWidth + 1;
        };

        const result = fitCardCopyFontSize(maximum, fits);
        if (active) {
          setFitResult((previous) => previous?.key === fitKey &&
              Math.abs(previous.fontSize - result.fontSize) < 0.1 && previous.overflow === result.overflow
            ? previous
            : { key: fitKey, ...result });
        }
      } finally {
        node.style.fontSize = authoredSize;
        if (previousOverflowState !== null) node.setAttribute('data-card-text-fit-overflow', previousOverflowState);
        measuring = false;
      }
    };

    measure();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizeObserver?.observe(node);
    const fonts = node.ownerDocument.fonts;
    fonts?.addEventListener('loadingdone', measure);
    return () => {
      active = false;
      resizeObserver?.disconnect();
      fonts?.removeEventListener('loadingdone', measure);
    };
  }, [fitKey, text, typography]);

  return (
    <div
      {...attributes}
      ref={nodeRef}
      style={activeStyle}
      data-card-typography-managed="true"
      data-card-text-fit-ready={fitted ? 'true' : 'false'}
      data-card-text-fit-overflow={fitted?.overflow ? 'true' : undefined}
    >
      {text}
    </div>
  );
}

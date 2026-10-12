'use client';

import { useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { getTypographyScriptsForCardText, loadProfiledFontFace } from '@/data/fonts/load-fonts';
import type { CardRatio } from '@/components/cards/types';
import type { Locale } from '@/lib/types';

interface FitFactValueProps extends HTMLAttributes<HTMLSpanElement> {
  fontContextKey: string;
  locale: Locale;
  ratio: CardRatio;
  typographyPreset: string;
  sizePercent?: number;
}

interface MeasuredFactValue {
  key: string;
  fontSize: number;
  ready: boolean;
}

export function getFitFactMeasurementKey(
  fontContextKey: string,
  locale: Locale,
  ratio: CardRatio,
  typographyPreset: string,
  sizeScale: number,
  text: string,
): string {
  return JSON.stringify([fontContextKey, locale, ratio, typographyPreset, sizeScale, text]);
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function largestFontThatFits(value: HTMLSpanElement, row: HTMLElement, sizeScale: number): number {
  const authoredSize = value.style.fontSize;
  try {
    value.style.fontSize = '';
    const maximum = pixels(getComputedStyle(value).fontSize) * sizeScale;
    value.style.fontSize = 'var(--master-micro-min, .84cqi)';
    const minimum = Math.min(maximum, pixels(getComputedStyle(value).fontSize) * sizeScale);
    value.style.fontSize = authoredSize;

    const rowStyle = getComputedStyle(row);
    const availableHeight = Math.max(
      0,
      row.clientHeight - pixels(rowStyle.paddingTop) - pixels(rowStyle.paddingBottom),
    );
    const fits = (fontSize: number) => {
      value.style.fontSize = `${fontSize}px`;
      return value.scrollHeight <= availableHeight + 0.5;
    };

    if (fits(maximum)) return maximum;
    if (!fits(minimum)) return minimum;

    let lower = minimum;
    let upper = maximum;
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const middle = (lower + upper) / 2;
      if (fits(middle)) lower = middle;
      else upper = middle;
    }
    return lower;
  } finally {
    value.style.fontSize = authoredSize;
  }
}

export function FitFactValue({ fontContextKey, locale, ratio, typographyPreset, sizePercent = 100, children, style, ...attributes }: FitFactValueProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const text = typeof children === 'string' ? children : '';
  const sizeScale = Math.min(1.25, Math.max(.75, sizePercent / 100));
  const measurementKey = getFitFactMeasurementKey(fontContextKey, locale, ratio, typographyPreset, sizeScale, text);
  const [measurement, setMeasurement] = useState<MeasuredFactValue | null>(null);
  const current = measurement?.key === measurementKey ? measurement : null;

  useLayoutEffect(() => {
    const value = valueRef.current;
    const row = value?.closest<HTMLElement>('[data-editorial-row="free-company"]');
    if (!value || !row) return;

    let active = true;
    let measuring = false;
    let measureAgain = false;
    const documentFonts = value.ownerDocument.fonts;
    const localeScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
    const markPending = () => {
      setMeasurement((previous) => previous?.key === measurementKey && !previous.ready
        ? previous
        : previous?.key === measurementKey ? { ...previous, ready: false } : previous);
    };

    const loadActualFont = async () => {
      const computed = getComputedStyle(value);
      const font = `${computed.fontStyle} ${computed.fontWeight} 100px ${computed.fontFamily}`;
      const scripts = getTypographyScriptsForCardText(text, localeScript);
      await Promise.all(scripts.map((script) => loadProfiledFontFace(font, text, {
        source: 'editorial-fact-fit',
        face: 'editorial-information',
        script,
        weight: pixels(computed.fontWeight) || undefined,
        glyphCount: Array.from(text).length,
      })));
      await documentFonts.ready;
    };

    const recalculate = async () => {
      if (measuring) {
        measureAgain = true;
        return;
      }
      measuring = true;
      do {
        measureAgain = false;
        try {
          await loadActualFont();
        } catch {
          // Keep the full value visible with the active CSS fallback face.
        }
        if (!active) break;
        const fontSize = largestFontThatFits(value, row, sizeScale);
        setMeasurement({ key: measurementKey, fontSize, ready: true });
      } while (measureAgain && active);
      measuring = false;
    };

    setMeasurement({ key: measurementKey, fontSize: largestFontThatFits(value, row, sizeScale), ready: false });
    void recalculate();

    const observer = new ResizeObserver(() => {
      markPending();
      void recalculate();
    });
    observer.observe(row);
    const fontsChanged = () => {
      markPending();
      void recalculate();
    };
    documentFonts.addEventListener('loadingdone', fontsChanged);

    return () => {
      active = false;
      observer.disconnect();
      documentFonts.removeEventListener('loadingdone', fontsChanged);
    };
  }, [fontContextKey, locale, measurementKey, ratio, sizeScale, text, typographyPreset]);

  const script = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  return (
    <span
      {...attributes}
      ref={valueRef}
      style={{ ...style, ...(current ? { fontSize: `${current.fontSize}px` } : {}) }}
      data-optical-name="editorial-free-company"
      data-optical-ratio={ratio}
      data-optical-script={script}
      data-optical-preset={typographyPreset}
      data-optical-ready={current?.ready ? 'true' : 'false'}
      data-optical-size={current?.fontSize}
    >
      {children}
    </span>
  );
}

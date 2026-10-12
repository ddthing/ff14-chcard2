'use client';

import { useLayoutEffect, useRef } from 'react';
import type { CardTextTypographyOverrides, CardTypographyOverrides } from './types';
import { detectTypographyScript, getTypographyFontEntry, getTypographyFontIdForStack, getTypographyFontStackForId, getTypographySupportedWeight } from '@/lib/typography-presets';
import { mergeCardTypographyOverrides } from '@/lib/card-text-editing';

export function observeCardTypographyChanges(article: HTMLElement, onChange: () => void): () => void {
  const resizeObserver = new ResizeObserver(onChange);
  resizeObserver.observe(article);

  const articleAttributesObserver = new MutationObserver(onChange);
  articleAttributesObserver.observe(article, {
    attributes: true,
    attributeFilter: ['lang', 'data-locale', 'data-ratio', 'data-layout', 'data-typography', 'style'],
  });

  const contentObserver = new MutationObserver(onChange);
  contentObserver.observe(article, {
    attributes: true,
    attributeFilter: ['data-card-text-id', 'data-master-typography-role'],
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => {
    resizeObserver.disconnect();
    articleAttributesObserver.disconnect();
    contentObserver.disconnect();
  };
}

/** Applies relative adjustments against each role's authored, ratio-aware CSS size. */
export function CardTypographyOverrideScaler({
  overrides,
  textTypography,
}: {
  overrides?: CardTypographyOverrides;
  textTypography?: CardTextTypographyOverrides;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const overrideKey = JSON.stringify([overrides ?? {}, textTypography ?? {}]);

  useLayoutEffect(() => {
    const article = marker.current?.closest<HTMLElement>('article');
    if (!article) return;

    const applyOverrides = () => {
      const nodes = Array.from(article.querySelectorAll<HTMLElement>('[data-master-typography-role]'));
      for (const node of nodes) {
        node.removeAttribute('data-card-typography-ready');
        node.removeAttribute('data-card-font-override');
        node.removeAttribute('data-card-size-override');
        node.removeAttribute('data-card-weight-override');
        node.removeAttribute('data-card-tracking-override');
      }

      for (const node of nodes) {
        if (node.dataset.cardTypographyManaged === 'true') continue;
        const role = node.dataset.masterTypographyRole;
        const globalOverride = role ? overrides?.[role as keyof CardTypographyOverrides] : undefined;
        const textId = node.dataset.cardTextId;
        const itemOverride = textId ? textTypography?.[textId] : undefined;
        const override = mergeCardTypographyOverrides(globalOverride, itemOverride);
        if (!role || !override) continue;

        const computed = getComputedStyle(node);
        node.style.setProperty('--card-typography-base-size', computed.fontSize);
        const fontSize = Number.parseFloat(computed.fontSize);
        const letterSpacing = Number.parseFloat(computed.letterSpacing);
        const trackingEm = Number.isFinite(fontSize) && fontSize > 0 && Number.isFinite(letterSpacing) ? letterSpacing / fontSize : 0;
        node.style.setProperty('--card-typography-base-tracking', `${trackingEm}em`);
        const fallbackScript = article.dataset.locale === 'ko' ? 'korean' : article.dataset.locale === 'ja' ? 'japanese' : 'latin';
        const script = detectTypographyScript(node.textContent ?? '', fallbackScript);
        const selectedFont = override.fontFamily ? getTypographyFontEntry(override.fontFamily) : undefined;
        if (selectedFont?.supportedScripts.includes(script)) {
          node.style.setProperty('--card-typography-font', getTypographyFontStackForId(override.fontFamily, script, computed.fontFamily));
          node.setAttribute('data-card-font-override', 'true');
        }
        if (override.sizePercent !== undefined) {
          node.style.setProperty('--card-typography-size-scale', String(override.sizePercent / 100));
          node.setAttribute('data-card-size-override', 'true');
        }
        if (override.weight !== undefined) {
          const weightFontId = selectedFont?.supportedScripts.includes(script)
            ? selectedFont.id
            : getTypographyFontIdForStack(computed.fontFamily, script);
          node.style.setProperty('--card-typography-weight', String(getTypographySupportedWeight(weightFontId, override.weight)));
          node.setAttribute('data-card-weight-override', 'true');
        }
        if (override.trackingEm !== undefined) {
          node.style.setProperty('--card-typography-tracking', `${override.trackingEm}em`);
          node.setAttribute('data-card-tracking-override', 'true');
        }
        node.setAttribute('data-card-typography-ready', 'true');
      }
    };

    applyOverrides();
    return observeCardTypographyChanges(article, applyOverrides);
  }, [overrideKey, overrides, textTypography]);

  return <span ref={marker} hidden aria-hidden="true" />;
}

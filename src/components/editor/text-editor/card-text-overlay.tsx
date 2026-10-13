'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CardTextCategory, CardTextItem } from '@/lib/card-text-editing';
import {
  getInformationTypographyItems,
  getIndividualTypographyOrdinal,
  isIndividualTypographyItem,
} from './card-text-model';
import styles from './card-text-overlay.module.css';
import {
  getTextOutlineBounds,
  getTextTargetBounds,
  placeTextBadge,
  placeTextTargets,
  type TextTargetBounds,
  type TextTargetClip,
  type TextTargetRect,
} from './text-target-geometry';

const subscribeToMount = () => () => {};
const getClientMountSnapshot = () => true;
const getServerMountSnapshot = () => false;

interface PositionedTextTarget {
  id: string;
  label: string;
  ordinal: number;
  kind: 'creative' | 'information-group';
  compact: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  hitFragments: TextTargetBounds[];
  textOutlines: TextTargetBounds[];
  badgeBounds: TextTargetBounds | null;
}

interface CardTextOverlayProps {
  enabled: boolean;
  items: readonly CardTextItem[];
  activeCategory: CardTextCategory;
  selectedId: string | null;
  measurementKey: string | number;
  targetLabel: (label: string, ordinal: number) => string;
  informationTargetLabel?: string;
  onSelect: (item: CardTextItem, focusInput: boolean) => void;
}

function boundsToRect(bounds: TextTargetBounds): TextTargetRect {
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.left + bounds.width,
    bottom: bounds.top + bounds.height,
  };
}

function overlapsBounds(bounds: TextTargetBounds, rect: TextTargetRect): boolean {
  return bounds.left < rect.right
    && bounds.left + bounds.width > rect.left
    && bounds.top < rect.bottom
    && bounds.top + bounds.height > rect.top;
}

function isTextNodeRendered(textNode: Text): boolean {
  for (let element = textNode.parentElement; element; element = element.parentElement) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden') return false;
    if (Number.parseFloat(style.opacity) === 0) return false;
    if (element.matches('[data-card-surface]')) break;
  }
  return true;
}

/** Measures rendered text fragments, not the full-width layout box carrying its text ID. */
function getRenderedTextRects(element: Element): TextTargetRect[] {
  const itemId = element.getAttribute('data-card-text-id');
  if (!itemId) return [];

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const rects: TextTargetRect[] = [];
  let textNode = walker.nextNode() as Text | null;
  while (textNode) {
    const content = textNode.textContent ?? '';
    const owner = textNode.parentElement?.closest('[data-card-text-id]');
    const hasDifferentTextOwner = owner && owner !== element && owner.getAttribute('data-card-text-id') !== itemId;
    if (content.trim() && !hasDifferentTextOwner && isTextNodeRendered(textNode)) {
      range.selectNodeContents(textNode);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
      }
    }
    textNode = walker.nextNode() as Text | null;
  }
  return rects;
}

function stopPointerPropagation(event: ReactPointerEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

export function CardTextOverlay({
  enabled,
  items,
  activeCategory,
  selectedId,
  measurementKey,
  targetLabel,
  informationTargetLabel,
  onSelect,
}: CardTextOverlayProps) {
  const hasMounted = useSyncExternalStore(subscribeToMount, getClientMountSnapshot, getServerMountSnapshot);
  const [targets, setTargets] = useState<PositionedTextTarget[]>([]);
  const frameRef = useRef<number | null>(null);
  const itemsById = useMemo<Map<string, CardTextItem>>(() => new Map(items.map((item) => [item.id, item])), [items]);
  const itemsRef = useRef(items);
  const activeCategoryRef = useRef(activeCategory);
  const informationTargetLabelRef = useRef(informationTargetLabel);
  const visibleIdsKey = items.filter((item) => item.visible).map((item) => item.id).join('\u0000');

  const scheduleMeasurement = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const currentItems = itemsRef.current;
      const currentCategory = activeCategoryRef.current;
      const currentInformationLabel = informationTargetLabelRef.current;
      const creativeItems = currentItems.filter((item) => item.visible && isIndividualTypographyItem(item));
      const informationItems = currentCategory === 'information' && currentInformationLabel
        ? getInformationTypographyItems(currentItems).filter((item) => item.visible)
        : [];
      const measurableIds = new Set<string>([...creativeItems, ...informationItems].map((item) => item.id));
      const surface = document.querySelector<HTMLElement>('#editor-canvas-stage [data-card-surface]');
      const stage = document.getElementById('editor-canvas-stage');
      if (!surface || !stage) {
        setTargets([]);
        return;
      }

      const rectsById = new Map<string, TextTargetRect[]>();
      for (const node of surface.querySelectorAll('[data-card-text-id]')) {
        const id = node.getAttribute('data-card-text-id');
        if (!id || !measurableIds.has(id)) continue;
        const rects = getRenderedTextRects(node);
        if (rects.length === 0) continue;
        rectsById.set(id, [...(rectsById.get(id) ?? []), ...rects]);
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const stageRect = stage.getBoundingClientRect();
      const clip: TextTargetClip = {
        left: stageRect.left,
        top: stageRect.top,
        right: stageRect.right,
        bottom: stageRect.bottom,
      };
      const positionedItems = creativeItems.flatMap((item) => {
        const rects = rectsById.get(item.id);
        return rects?.length ? [{ item, rects }] : [];
      });
      const placements = placeTextTargets(positionedItems.map(({ rects }) => rects), viewportWidth, viewportHeight, 44, clip);
      const allTextRects = [...rectsById.values()].flat();
      const usedBadges: TextTargetRect[] = [];
      const badgeHitTargetSizes = window.matchMedia('(pointer: coarse)').matches ? [44, 24] : [24];
      const placeBadge = (anchorRects: readonly TextTargetRect[], occupiedRects: readonly TextTargetRect[]) => {
        for (const hitTargetSize of badgeHitTargetSizes) {
          const placement = placeTextBadge(
            anchorRects,
            occupiedRects,
            viewportWidth,
            viewportHeight,
            clip,
            16,
            2,
            usedBadges,
            hitTargetSize,
          );
          if (placement) return placement;
        }
        return null;
      };
      const nextTargets: PositionedTextTarget[] = [];
      for (let index = 0; index < positionedItems.length; index += 1) {
        const placement = placements[index];
        if (!placement) continue;
        const { item } = positionedItems[index];
        const outlineRects = placement.textFragments.map(boundsToRect);
        const neighboringTextTargets = placements.flatMap((neighborPlacement, neighborIndex) => (
          neighborIndex === index || !neighborPlacement
            ? []
            : neighborPlacement.targetFragments.map(boundsToRect)
        ));
        const badgeBounds = placeBadge(outlineRects, [...allTextRects, ...neighboringTextTargets]);
        if (badgeBounds) usedBadges.push(boundsToRect(badgeBounds));
        const outlineBounds = getTextOutlineBounds(outlineRects, viewportWidth, viewportHeight, clip, 2);
        const bounds = placement.targetBounds;
        nextTargets.push({
          id: item.id,
          label: item.label,
          ordinal: getIndividualTypographyOrdinal(currentItems, item.id),
          kind: 'creative',
          compact: placement.compact,
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          hitFragments: placement.targetFragments,
          textOutlines: outlineBounds,
          badgeBounds,
        });
      }

      if (informationItems.length > 0 && currentInformationLabel) {
        const representative = informationItems.find((item) => item.kind !== 'label' && rectsById.has(item.id));
        const informationRects = informationItems.flatMap((item) => rectsById.get(item.id) ?? []);
        const markerBounds = placeBadge(informationRects, allTextRects);
        const informationHit = markerBounds
          ? getTextTargetBounds(boundsToRect(markerBounds), viewportWidth, viewportHeight, 44, clip)
          : null;
        const overlapsCreativeHit = informationHit && nextTargets.some((target) => (
          target.kind === 'creative' && target.hitFragments.some((hitFragment) => overlapsBounds(informationHit, boundsToRect(hitFragment)))
        ));
        if (representative && markerBounds && informationHit && !overlapsCreativeHit) {
          nextTargets.unshift({
            id: representative.id,
            label: currentInformationLabel,
            ordinal: 0,
            kind: 'information-group',
            compact: false,
            left: informationHit.left,
            top: informationHit.top,
            width: informationHit.width,
            height: informationHit.height,
            hitFragments: [informationHit],
            textOutlines: [],
            badgeBounds: markerBounds,
          });
        }
      }

      setTargets(nextTargets);
    });
  }, []);

  useLayoutEffect(() => {
    itemsRef.current = items;
    activeCategoryRef.current = activeCategory;
    informationTargetLabelRef.current = informationTargetLabel;
    if (enabled && hasMounted) scheduleMeasurement();
  }, [activeCategory, enabled, hasMounted, informationTargetLabel, items, scheduleMeasurement]);

  useLayoutEffect(() => {
    if (!enabled || !hasMounted) return;

    const surface = document.querySelector<HTMLElement>('#editor-canvas-stage [data-card-surface]');
    if (!surface) return;
    const activeIds = new Set<string>(visibleIdsKey.split('\u0000'));
    const observedNodes = Array.from(surface.querySelectorAll('[data-card-text-id]'))
      .filter((node) => activeIds.has(node.getAttribute('data-card-text-id') ?? ''));
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasurement);
    resizeObserver?.observe(surface);
    for (const node of observedNodes) resizeObserver?.observe(node);

    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
      const hasTextMutation = records.some((record) => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest('[data-card-text-id]')) return true;
        if (record.type !== 'childList') return false;
        return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (
          node.matches('[data-card-text-id]') || Boolean(node.querySelector('[data-card-text-id]'))
        ));
      });
      if (hasTextMutation) scheduleMeasurement();
    });
    mutationObserver?.observe(surface, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-card-text-id'],
      characterData: true,
      childList: true,
      subtree: true,
    });

    const schedule = () => scheduleMeasurement();
    let disposed = false;
    const scheduleAfterFonts = () => {
      if (!disposed) scheduleMeasurement();
    };
    const fontSet = document.fonts;
    fontSet?.addEventListener('loadingdone', scheduleAfterFonts);
    void fontSet?.ready.then(scheduleAfterFonts);
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', schedule, { passive: true });
    scheduleMeasurement();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      fontSet?.removeEventListener('loadingdone', scheduleAfterFonts);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      viewport?.removeEventListener('resize', schedule);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [enabled, hasMounted, scheduleMeasurement, visibleIdsKey]);

  useEffect(() => {
    if (enabled && hasMounted) scheduleMeasurement();
  }, [enabled, hasMounted, measurementKey, scheduleMeasurement]);

  if (!enabled || !hasMounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.layer}>
      {targets.map((target) => {
        const item = itemsById.get(target.id);
        if (!item) return null;
        const isInformationGroup = target.kind === 'information-group';
        const isSelected = isInformationGroup ? activeCategory === 'information' : selectedId === target.id;
        const label = isInformationGroup ? target.label : targetLabel(target.label, target.ordinal);
        const badge = target.badgeBounds;
        return (
          <button
            key={`${target.kind}:${target.id}`}
            type="button"
            className={`${styles.target}${isInformationGroup ? ` ${styles.groupTarget}` : ''}`}
            data-card-text-target={target.id}
            data-information-group={isInformationGroup ? 'true' : undefined}
            data-compact={target.compact ? 'true' : 'false'}
            data-selected={isSelected ? 'true' : 'false'}
            aria-label={label}
            aria-pressed={isSelected}
            title={label}
            style={{ left: target.left, top: target.top, width: target.width, height: target.height }}
            onPointerDown={stopPointerPropagation}
            onPointerUp={stopPointerPropagation}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(item, event.detail === 0);
            }}
          >
            {target.hitFragments.map((hitFragment, index) => (
              <span
                key={`hit-${index}`}
                className={styles.hitFragment}
                aria-hidden="true"
                style={{
                  left: hitFragment.left - target.left,
                  top: hitFragment.top - target.top,
                  width: hitFragment.width,
                  height: hitFragment.height,
                }}
              />
            ))}
            {target.textOutlines.map((outline, index) => (
              <span
                key={`outline-${index}`}
                className={styles.textOutline}
                aria-hidden="true"
                style={{
                  left: outline.left - target.left,
                  top: outline.top - target.top,
                  width: outline.width,
                  height: outline.height,
                }}
              />
            ))}
            {badge && (
              <span
                className={styles.badgeHit}
                data-card-text-badge-hit="true"
                aria-hidden="true"
                style={{
                  left: badge.left - target.left,
                  top: badge.top - target.top,
                  width: badge.width,
                  height: badge.height,
                }}
              >
                <span className={isInformationGroup ? styles.groupMarker : styles.badge}>
                  {isInformationGroup ? 'i' : target.ordinal}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

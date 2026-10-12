'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CardTextCategory, CardTextItem } from '@/lib/card-text-editing';
import { getCardTextItemOrdinal, getEditorTextCategory } from './card-text-model';
import styles from './card-text-overlay.module.css';
import { placeTextTargets } from './text-target-geometry';

const subscribeToMount = () => () => {};
const getClientMountSnapshot = () => true;
const getServerMountSnapshot = () => false;

interface PositionedTextTarget {
  id: string;
  label: string;
  ordinal: number;
  compact: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CardTextOverlayProps {
  enabled: boolean;
  items: readonly CardTextItem[];
  activeCategory: CardTextCategory;
  selectedId: string | null;
  measurementKey: string | number;
  targetLabel: (label: string, ordinal: number) => string;
  onSelect: (item: CardTextItem, focusInput: boolean) => void;
}

function stopPointerPropagation(event: ReactPointerEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

export function CardTextOverlay({ enabled, items, activeCategory, selectedId, measurementKey, targetLabel, onSelect }: CardTextOverlayProps) {
  const hasMounted = useSyncExternalStore(subscribeToMount, getClientMountSnapshot, getServerMountSnapshot);
  const [targets, setTargets] = useState<PositionedTextTarget[]>([]);
  const frameRef = useRef<number | null>(null);
  const itemsById = useMemo<Map<string, CardTextItem>>(() => new Map(items.map((item) => [item.id, item])), [items]);
  const itemsRef = useRef(items);
  const visibleIdsKey = items.filter((item) => item.visible).map((item) => item.id).join('\u0000');

  const scheduleMeasurement = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const currentItems = itemsRef.current;
      const activeItems = currentItems.filter((item) => item.visible);
      const surface = document.querySelector<HTMLElement>('#editor-canvas-stage [data-card-surface]');
      const stage = document.getElementById('editor-canvas-stage');
      if (!surface || !stage) {
        setTargets([]);
        return;
      }

      const rectsById = new Map<string, DOMRect>();
      for (const node of surface.querySelectorAll('[data-card-text-id]')) {
        const id = node.getAttribute('data-card-text-id');
        if (!id || !activeItems.some((item) => item.id === id)) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const previous = rectsById.get(id);
        rectsById.set(id, previous
          ? new DOMRect(
            Math.min(previous.left, rect.left),
            Math.min(previous.top, rect.top),
            Math.max(previous.right, rect.right) - Math.min(previous.left, rect.left),
            Math.max(previous.bottom, rect.bottom) - Math.min(previous.top, rect.top),
          )
          : rect);
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const stageRect = stage.getBoundingClientRect();
      const clip = {
        left: stageRect.left,
        top: stageRect.top,
        right: stageRect.right,
        bottom: stageRect.bottom,
      };
      const positionedItems = activeItems.flatMap((item) => {
        const rect = rectsById.get(item.id);
        return rect ? [{ item, rect }] : [];
      });
      const placements = placeTextTargets(positionedItems.map(({ rect }) => rect), viewportWidth, viewportHeight, 44, clip);
      const nextTargets: PositionedTextTarget[] = [];
      for (let index = 0; index < positionedItems.length; index += 1) {
        const placement = placements[index];
        if (!placement) continue;
        const { item } = positionedItems[index];
        nextTargets.push({
          id: item.id,
          label: item.label,
          ordinal: getCardTextItemOrdinal(currentItems.filter((candidate) => getEditorTextCategory(candidate) === getEditorTextCategory(item)), item.id),
          compact: placement.compact,
          left: placement.targetBounds.left,
          top: placement.targetBounds.top,
          width: placement.targetBounds.width,
          height: placement.targetBounds.height,
        });
      }
      setTargets(nextTargets);
    });
  }, []);

  useLayoutEffect(() => {
    itemsRef.current = items;
    if (enabled && hasMounted) scheduleMeasurement();
  }, [activeCategory, enabled, hasMounted, items, scheduleMeasurement]);

  useLayoutEffect(() => {
    if (!enabled || !hasMounted) return;

    const surface = document.querySelector<HTMLElement>('#editor-canvas-stage [data-card-surface]');
    if (!surface) return;
    const activeIds = new Set<string>(visibleIdsKey.split('\u0000'));
    const observedNodes = Array.from(surface.querySelectorAll('[data-card-text-id]'))
      .filter((node) => activeIds.has(node.getAttribute('data-card-text-id') ?? ''));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasurement);
    observer?.observe(surface);
    for (const node of observedNodes) observer?.observe(node);

    const schedule = () => scheduleMeasurement();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', schedule, { passive: true });
    scheduleMeasurement();

    return () => {
      observer?.disconnect();
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
        const isSelected = selectedId === target.id;
        const bounds = target;
        const label = targetLabel(target.label, target.ordinal);
        return (
          <button
            key={target.id}
            type="button"
            className={styles.target}
            data-card-text-target={target.id}
            data-compact={target.compact ? 'true' : 'false'}
            data-selected={isSelected ? 'true' : 'false'}
            aria-label={label}
            aria-pressed={isSelected}
            title={label}
            style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
            onPointerDown={stopPointerPropagation}
            onPointerUp={stopPointerPropagation}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(item, event.detail === 0);
            }}
          >{getEditorTextCategory(item) === activeCategory && (!target.compact || isSelected) && <span className={styles.badge} aria-hidden="true">{target.ordinal}</span>}</button>
        );
      })}
    </div>,
    document.body,
  );
}

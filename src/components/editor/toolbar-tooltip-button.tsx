'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isImeComposing } from './editor-input';
import { getToolbarTooltipPlacement, type TooltipPlacementRect } from './toolbar-tooltip-placement';
import styles from './toolbar-tooltip.module.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & { tooltip: string; children: ReactNode };
type TooltipSource = 'pointer' | 'focus';
type ActiveTooltip = { id: string; source: TooltipSource; deactivate: () => void };

let activeTooltip: ActiveTooltip | null = null;
let pendingHover: ActiveTooltip | null = null;
const activeTooltipListeners = new Set<() => void>();

function notifyActiveTooltip() {
  for (const listener of activeTooltipListeners) listener();
}

function subscribeActiveTooltip(listener: () => void) {
  activeTooltipListeners.add(listener);
  return () => activeTooltipListeners.delete(listener);
}

function getActiveTooltipId() {
  return activeTooltip?.id ?? null;
}

function claimActiveTooltip(id: string, source: TooltipSource, deactivate: () => void): boolean {
  if (activeTooltip?.id === id) {
    activeTooltip = { id, source: source === 'focus' ? 'focus' : activeTooltip.source, deactivate };
    if (source === 'focus') clearPendingHover();
    else clearPendingHover(id);
    return true;
  }

  if (activeTooltip?.source === 'focus' && source === 'pointer') {
    pendingHover = { id, source, deactivate };
    return false;
  }

  if (pendingHover?.id === id) pendingHover = null;
  if (source === 'focus' && activeTooltip?.source === 'pointer') {
    // Keep the live hover state queued while keyboard focus temporarily takes ownership.
    pendingHover = activeTooltip;
  } else {
    activeTooltip?.deactivate();
  }
  activeTooltip = { id, source, deactivate };
  notifyActiveTooltip();
  return true;
}

function clearPendingHover(id?: string) {
  if (!id || pendingHover?.id === id) pendingHover = null;
}

function releaseActiveTooltip(id: string, source?: TooltipSource, promotePending = true) {
  if (activeTooltip?.id !== id || (source && activeTooltip.source !== source)) return;

  const released = activeTooltip;
  activeTooltip = null;
  if (promotePending && released.source === 'focus' && pendingHover) {
    activeTooltip = pendingHover;
    pendingHover = null;
  } else {
    clearPendingHover();
  }
  notifyActiveTooltip();
}

function collectTooltipObstacles(button: HTMLButtonElement, tooltip: HTMLSpanElement): TooltipPlacementRect[] {
  const selector = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="toolbar"]',
    '[role="dialog"]',
    '[role="listbox"]',
    '[role="menu"]',
    '[role="tooltip"]',
    'header',
    'nav',
    'aside',
    '[data-app-header]',
    '[class*="toolbar"]',
    '[class*="Toolbar"]',
    '[class*="inspector"]',
    '[class*="Inspector"]',
    '[class*="picker"]',
    '[class*="Picker"]',
    '[class*="stageUpload"]',
  ].join(',');

  return [...document.querySelectorAll<HTMLElement>(selector)].flatMap((element) => {
    if (element === button || element === tooltip || element.contains(button) || button.contains(element) || element.contains(tooltip)) return [];
    if (element.closest('[aria-hidden="true"]')) return [];

    const computed = window.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden' || computed.visibility === 'collapse' || Number(computed.opacity) === 0) return [];

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return [];
    return [{ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }];
  });
}

export function ToolbarTooltipButton({ tooltip, children, onBlur, onFocus, onKeyDown, onPointerEnter, onPointerLeave, 'aria-describedby': describedBy, ...buttonProps }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [pointerOver, setPointerOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deactivateRef = useRef<() => void>(() => {});
  deactivateRef.current = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
    clearPendingHover(id);
    setPointerOver(false);
    setFocused(false);
    setDismissed(false);
  };
  const activeTooltipId = useSyncExternalStore(subscribeActiveTooltip, getActiveTooltipId, () => null);
  const visible = (pointerOver || focused) && !dismissed && activeTooltipId === id;

  useEffect(() => {
    if (!visible) return;
    let frame: number | null = null;
    const placeTooltip = () => {
      const button = buttonRef.current, tip = tooltipRef.current;
      if (!button || !tip) return;
      const anchor = button.getBoundingClientRect();
      const box = tip.getBoundingClientRect();
      const placement = getToolbarTooltipPlacement(
        { top: anchor.top, right: anchor.right, bottom: anchor.bottom, left: anchor.left },
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
        collectTooltipObstacles(button, tip),
      );
      setPosition((current) => current?.top === placement.top && current.left === placement.left
        ? current
        : { top: placement.top, left: placement.left });
    };

    const schedulePlacement = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        placeTooltip();
      });
    };
    schedulePlacement();
    window.addEventListener('resize', schedulePlacement);
    window.addEventListener('scroll', schedulePlacement, true);
    const layoutRoot = document.querySelector<HTMLElement>('[data-app-main]') ?? buttonRef.current?.closest('main');
    const layoutObserver = layoutRoot ? new MutationObserver(schedulePlacement) : null;
    layoutObserver?.observe(layoutRoot!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state', 'open', 'hidden', 'aria-hidden'],
    });
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      layoutObserver?.disconnect();
      window.removeEventListener('resize', schedulePlacement);
      window.removeEventListener('scroll', schedulePlacement, true);
    };
  }, [visible, tooltip]);

  useEffect(() => {
    if (!visible) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isImeComposing({ isComposing: event.isComposing, keyCode: event.keyCode })) return;
      const target = event.target;
      if (target instanceof Node && buttonRef.current?.contains(target)) return;
      setDismissed(true);
      clearPendingHover();
      releaseActiveTooltip(id, undefined, false);
    };
    document.addEventListener('keydown', dismissOnEscape, true);
    return () => document.removeEventListener('keydown', dismissOnEscape, true);
  }, [id, visible]);

  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    clearPendingHover(id);
    releaseActiveTooltip(id);
  }, [id]);

  function leavePointer(event: PointerEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && (buttonRef.current?.contains(next) || tooltipRef.current?.contains(next))) return;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      setPointerOver(false);
      leaveTimer.current = null;
      clearPendingHover(id);
      releaseActiveTooltip(id, 'pointer');
    }, 150);
  }

  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    onFocus?.(event);
    if (!visible) setPosition(null);
    setDismissed(false);
    setFocused(true);
    claimActiveTooltip(id, 'focus', deactivateRef.current);
  }

  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    onBlur?.(event);
    if (event.relatedTarget instanceof Node && buttonRef.current?.contains(event.relatedTarget)) return;
    setFocused(false);
    setDismissed(false);
    releaseActiveTooltip(id, 'focus');
    if (pointerOver && getActiveTooltipId() === null) claimActiveTooltip(id, 'pointer', deactivateRef.current);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || !visible || event.key !== 'Escape') return;
    if (isImeComposing({ isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode })) return;
    setDismissed(true);
    clearPendingHover();
    releaseActiveTooltip(id, undefined, false);
    event.preventDefault();
    event.stopPropagation();
  }

  const describedByIds = [describedBy, visible ? id : undefined].filter(Boolean).join(' ') || undefined;
  function enterButtonPointer(event: PointerEvent<HTMLButtonElement>) {
    onPointerEnter?.(event);
    enterPointer(event);
  }

  function leaveButtonPointer(event: PointerEvent<HTMLButtonElement>) {
    onPointerLeave?.(event);
    leavePointer(event);
  }

  function enterPointer(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
    if (!visible) setPosition(null);
    setDismissed(false);
    setPointerOver(true);
    const source = document.activeElement === buttonRef.current ? 'focus' : 'pointer';
    claimActiveTooltip(id, source, deactivateRef.current);
  }

  return (
    <>
      <button {...buttonProps} ref={buttonRef} aria-describedby={describedByIds} onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyDown} onPointerEnter={enterButtonPointer} onPointerLeave={leaveButtonPointer}>{children}</button>
      {visible && typeof document !== 'undefined' && createPortal(
        <span ref={tooltipRef} id={id} role="tooltip" className={styles.tooltip}
          style={position ? { top: position.top, left: position.left, visibility: 'visible' } : { top: -10000, left: -10000, visibility: 'hidden' }}
          onPointerEnter={enterPointer} onPointerLeave={leavePointer}>{tooltip}</span>,
        document.body,
      )}
    </>
  );
}

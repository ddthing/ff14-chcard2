'use client';

import { memo, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CardRatio } from '@/components/cards/types';
import styles from '@/app/editor/editor.module.css';
import { profileRender } from '@/lib/performance-profile';
import { useI18n } from '@/lib/i18n';
import { isImeComposing } from './editor-input';
import { CARD_RATIO_OPTIONS, getNextMenuIndex } from './editor-interaction';
import { CARD_RATIO_PURPOSES } from './ratio-purpose';

type RatioPickerProps = {
  label: string;
  value: CardRatio;
  onChange: (ratio: CardRatio) => void;
};

function getMiniatureFrameStyle(ratio: CardRatio): CSSProperties {
  const [rawWidth, rawHeight] = ratio.split(':').map(Number);
  const width = rawWidth || 1;
  const height = rawHeight || 1;
  const longestSide = Math.max(width, height);
  return {
    width: `${(width / longestSide) * 1.5}rem`,
    height: `${(height / longestSide) * 1.5}rem`,
    aspectRatio: `${width} / ${height}`,
  };
}

export const RatioPicker = memo(function RatioPicker({ label, value, onChange }: RatioPickerProps) {
  profileRender('RatioPicker');
  const { locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const returnFocusOnClose = useRef(false);
  const menuId = useId();
  const selectedIndex = Math.max(0, CARD_RATIO_OPTIONS.indexOf(value));

  useEffect(() => {
    if (!isOpen) {
      if (returnFocusOnClose.current) {
        triggerRef.current?.focus();
        returnFocusOnClose.current = false;
      }
      return;
    }
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function closeWhenOutside(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        returnFocusOnClose.current = false;
        setIsOpen(false);
        requestAnimationFrame(() => {
          const activeElement = document.activeElement;
          if (!activeElement || activeElement === document.body || !activeElement.isConnected) {
            triggerRef.current?.focus();
          }
        });
      }
    }
    document.addEventListener('pointerdown', closeWhenOutside);
    return () => document.removeEventListener('pointerdown', closeWhenOutside);
  }, [isOpen]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function closeMenu(restoreFocus: boolean) {
    returnFocusOnClose.current = restoreFocus;
    setIsOpen(false);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (isImeComposing(event.nativeEvent)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const nextIndex = getNextMenuIndex(-1, CARD_RATIO_OPTIONS.length, event.key, selectedIndex);
      if (nextIndex !== null) {
        setActiveIndex(nextIndex);
        setIsOpen(true);
      }
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (isImeComposing(event.nativeEvent)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      moveFocusOutOfPicker(event.shiftKey);
      return;
    }
    const nextIndex = getNextMenuIndex(activeIndex, CARD_RATIO_OPTIONS.length, event.key, selectedIndex);
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
  }

  function moveFocusOutOfPicker(backwards: boolean) {
    const root = rootRef.current;
    if (!root) {
      closeMenu(false);
      return;
    }
    const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
    const focusableElements = Array.from(document.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.tabIndex >= 0 && !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
    const outsideElements = focusableElements.filter((element) => !root.contains(element));
    const beforePicker = outsideElements.filter((element) => Boolean(element.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING));
    const afterPicker = outsideElements.filter((element) => Boolean(root.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    const target = backwards ? beforePicker.at(-1) ?? outsideElements.at(-1) : afterPicker[0] ?? outsideElements[0];
    closeMenu(false);
    if (target) target.focus();
    else triggerRef.current?.focus();
  }

  function selectRatio(ratio: CardRatio) {
    onChange(ratio);
    closeMenu(true);
  }

  return (
    <div ref={rootRef} className={`${styles.bottomRatio} ${styles.ratioPicker ?? ''}`} data-state={isOpen ? 'open' : 'closed'}
      data-editor-shortcuts-disabled={isOpen ? 'true' : undefined}>
      <span className={styles.ratioLabel ?? ''}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.ratioTrigger ?? ''}
        aria-label={`${label}: ${value}, ${CARD_RATIO_PURPOSES[value][locale]}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        data-editor-ratio-trigger="true"
        data-ratio-value={value}
        onClick={() => isOpen ? closeMenu(false) : openMenu()}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={styles.ratioMiniature ?? ''} aria-hidden="true">
          <span className={styles.ratioMiniatureFrame ?? ''} data-ratio={value} style={getMiniatureFrameStyle(value)} />
        </span>
        <span className={styles.ratioTriggerValue ?? ''}>{value}</span>
      </button>
      {isOpen && (
        <div id={menuId} className={styles.ratioMenu ?? ''} role="menu" aria-label={label} onKeyDown={onMenuKeyDown}>
          {CARD_RATIO_OPTIONS.map((ratio, index) => (
            <button
              key={ratio}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              className={styles.ratioOption ?? ''}
              role="menuitemradio"
              aria-checked={value === ratio}
              data-selected={value === ratio ? 'true' : 'false'}
              data-ratio-value={ratio}
              tabIndex={activeIndex === index ? 0 : -1}
              aria-label={`${ratio}, ${CARD_RATIO_PURPOSES[ratio][locale]}`}
              onClick={() => selectRatio(ratio)}
            >
              <span className={styles.ratioMiniature ?? ''} aria-hidden="true">
                <span className={styles.ratioMiniatureFrame ?? ''} data-ratio={ratio} style={getMiniatureFrameStyle(ratio)} />
              </span>
              <span>
                <span className={styles.ratioOptionValue ?? ''}>{ratio}</span>
                <span className={styles.ratioOptionHint ?? ''}>{CARD_RATIO_PURPOSES[ratio][locale]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

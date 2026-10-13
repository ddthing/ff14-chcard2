'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { loadTypographyFonts } from '@/data/fonts/load-fonts';
import { getTypographySupportedWeight, type TypographyScript } from '@/lib/typography-presets';
import type { Locale } from '@/lib/types';
import { isImeComposing } from './editor-input';
import styles from './typography-font-picker.module.css';

type LocalizedFontName = {
  family: string;
  displayNames?: Partial<Record<Locale, string>>;
};

export interface TypographyFontPickerChoice {
  value: string;
  label: string;
  fontId?: string;
  family: string;
  fontStack?: string;
  fallbackStack: string;
  weight: number;
  scripts: readonly TypographyScript[];
  textByScript: Partial<Record<TypographyScript, string>>;
  sample: string;
}

type PopoverPosition = Pick<CSSProperties, 'left' | 'top' | 'width' | 'maxHeight'>;

const COPY = {
  ko: {
    search: '글꼴 검색',
    searchPlaceholder: '글꼴 이름 검색',
    close: '글꼴 선택 닫기',
    options: '글꼴 선택',
    empty: '검색 결과가 없습니다.',
    resultCount: (count: number) => '글꼴 ' + count + '개',
    previewLoading: '미리보기 불러오는 중…',
    previewFailure: '미리보기 불러오기 실패 · 선택해 적용',
  },
  en: {
    search: 'Search fonts',
    searchPlaceholder: 'Search font names',
    close: 'Close font picker',
    options: 'Font choices',
    empty: 'No fonts found.',
    resultCount: (count: number) => count + ' fonts',
    previewLoading: 'Loading sample…',
    previewFailure: 'Preview failed · select to apply',
  },
  ja: {
    search: 'フォントを検索',
    searchPlaceholder: 'フォント名を検索',
    close: 'フォント選択を閉じる',
    options: 'フォント一覧',
    empty: 'フォントが見つかりません。',
    resultCount: (count: number) => count + ' 個のフォント',
    previewLoading: 'プレビューを読み込み中…',
    previewFailure: 'プレビュー失敗 · 選択して適用',
  },
} as const;

export function getTypographyFontLabel(font: LocalizedFontName, locale: Locale): string {
  return font.displayNames?.[locale] ?? font.family.replace(/\s+Variable$/u, '');
}

function normalizeSearchValue(value: string, locale: Locale): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);
}

function getPopoverPosition(trigger: HTMLElement): PopoverPosition {
  const rect = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const rightEdge = viewportLeft + viewportWidth;
  const bottomEdge = viewportTop + viewportHeight;
  const width = Math.min(560, Math.max(rect.width, 288), viewportWidth - 24);
  const left = Math.max(viewportLeft + 12, Math.min(rect.left, rightEdge - width - 12));
  const spaceBelow = Math.max(0, bottomEdge - rect.bottom - 8);
  const spaceAbove = Math.max(0, rect.top - viewportTop - 8);
  const verticalRoom = Math.max(0, viewportHeight - 32);
  const maxHeight = Math.min(
    520,
    verticalRoom,
    Math.max(160, Math.max(spaceBelow, spaceAbove) - 8),
  );
  const openAbove = spaceAbove > spaceBelow;
  const preferredTop = openAbove ? rect.top - maxHeight - 8 : rect.bottom + 8;
  const top = Math.max(viewportTop + 8, Math.min(preferredTop, bottomEdge - maxHeight - 8));

  return { left, top, width, maxHeight };
}

function focusableElements(except: HTMLElement | null): HTMLElement[] {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));

  return candidates.filter((element) => (
    element !== except
    && !except?.contains(element)
    && !element.closest('[inert]')
    && element.getClientRects().length > 0
  ));
}

function moveFocusFromTrigger(trigger: HTMLElement | null, direction: -1 | 1, popup: HTMLElement | null) {
  if (!trigger) return;
  const candidates = focusableElements(popup);
  const triggerIndex = candidates.indexOf(trigger);
  candidates[triggerIndex + direction]?.focus();
}

function FontSample({
  choice,
  index,
  active,
  locale,
  listRootRef,
}: {
  choice: TypographyFontPickerChoice;
  index: number;
  active: boolean;
  locale: Locale;
  listRootRef: RefObject<HTMLDivElement | null>;
}) {
  const sampleRef = useRef<HTMLSpanElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(choice.fontId ? 'loading' : 'ready');
  const copy = COPY[locale];

  useEffect(() => {
    const sample = sampleRef.current;
    if (!sample || !choice.fontId) return;

    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setShouldLoad(index < 8));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { root: listRootRef.current, rootMargin: '120px 0px' });

    observer.observe(sample);
    return () => observer.disconnect();
  }, [choice.fontId, index, listRootRef]);

  useEffect(() => {
    if (!active || typeof IntersectionObserver !== 'undefined') return;
    const frame = requestAnimationFrame(() => setShouldLoad(true));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    if (!shouldLoad || !choice.fontId) return;
    let cancelled = false;

    void loadTypographyFonts(
      'clean',
      choice.scripts,
      choice.textByScript,
      {
        fontRequests: [{
          fontId: choice.fontId,
          weight: getTypographySupportedWeight(choice.fontId, choice.weight),
        }],
        profileSource: 'other',
      },
    ).then(() => {
      if (!cancelled) setLoadState('ready');
    }).catch(() => {
      if (!cancelled) setLoadState('error');
    });

    return () => { cancelled = true; };
  }, [choice, shouldLoad]);

  const fontFamily = choice.fontId
    ? '"' + choice.family + '", ' + choice.fallbackStack
    : choice.fontStack ?? choice.fallbackStack;
  const previewState = choice.fontId ? shouldLoad ? loadState : 'idle' : 'ready';
  const sampleStyle = {
    fontFamily: previewState === 'ready' ? fontFamily : choice.fallbackStack,
    fontWeight: choice.weight,
  };

  return (
    <span
      className={styles.samplePreview}
      data-font-preview-state={previewState}
      data-font-id={choice.fontId}
      aria-busy={previewState === 'loading'}
      onPointerEnter={() => {
        if (typeof IntersectionObserver === 'undefined') setShouldLoad(true);
      }}
    >
      {previewState === 'error' ? (
        <span className={styles.previewFailure}>{copy.previewFailure}</span>
      ) : (
        <>
          <span ref={sampleRef} className={styles.sample} dir="auto" style={sampleStyle}>
            {choice.sample}
          </span>
          {previewState === 'loading' && <span className={styles.previewStatus}>{copy.previewLoading}</span>}
        </>
      )}
    </span>
  );
}

export function TypographyFontPicker({
  locale,
  label,
  value,
  valueLabel,
  dataTextFontFamily,
  choices,
  onValueChange,
  onOpenChange,
}: {
  locale: Locale;
  label: string;
  value: string;
  valueLabel: string;
  dataTextFontFamily?: string;
  choices: readonly TypographyFontPickerChoice[];
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = COPY[locale];
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<string, HTMLDivElement>());
  const openRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  const activeHistoryGroupRef = useRef(onOpenChange);
  const popupId = 'typography-font-picker-' + useId().replace(/:/gu, '');
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const filteredChoices = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query.trim(), locale);
    if (!normalizedQuery) return choices;
    return choices.filter((choice) => (
      normalizeSearchValue(choice.label + ' ' + choice.family + ' ' + choice.value, locale)
        .includes(normalizedQuery)
    ));
  }, [choices, locale, query]);

  const closePicker = useCallback((restoreFocus = true) => {
    if (!openRef.current) return;
    openRef.current = false;
    setIsOpen(false);
    setQuery('');
    setPosition(null);
    activeHistoryGroupRef.current(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
  }, []);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  function openPicker() {
    if (openRef.current) {
      closePicker();
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) return;
    openRef.current = true;
    setQuery('');
    const selectedIndex = choices.findIndex((choice) => choice.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setPosition(getPopoverPosition(trigger));
    setIsOpen(true);
    activeHistoryGroupRef.current = onOpenChangeRef.current;
    activeHistoryGroupRef.current(true);
  }

  function selectChoice(choice: TypographyFontPickerChoice | undefined) {
    if (!choice) return;
    if (choice.value !== value) onValueChange(choice.value);
    closePicker();
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (isImeComposing(event.nativeEvent)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!filteredChoices.length) return;
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (activeIndex + offset + filteredChoices.length) % filteredChoices.length;
      setActiveIndex(nextIndex);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (!filteredChoices.length) return;
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : filteredChoices.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectChoice(filteredChoices[activeIndex]);
      return;
    }
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault();
        closePicker(false);
        triggerRef.current?.focus({ preventScroll: true });
      } else {
        event.preventDefault();
        closeRef.current?.focus({ preventScroll: true });
      }
    }
  }

  function handleCloseKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (event.shiftKey) {
      searchRef.current?.focus({ preventScroll: true });
      return;
    }
    closePicker(false);
    requestAnimationFrame(() => moveFocusFromTrigger(triggerRef.current, 1, popupRef.current));
  }

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let positionFrame = 0;
    const schedulePosition = () => {
      if (positionFrame) return;
      positionFrame = requestAnimationFrame(() => {
        positionFrame = 0;
        const trigger = triggerRef.current;
        if (trigger) setPosition(getPopoverPosition(trigger));
      });
    };
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && popupRef.current?.contains(target)) return;
      schedulePosition();
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      closePicker(false);
    };
    schedulePosition();
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', schedulePosition);
    window.visualViewport?.addEventListener('resize', schedulePosition);
    window.visualViewport?.addEventListener('scroll', schedulePosition);

    return () => {
      if (positionFrame) cancelAnimationFrame(positionFrame);
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', schedulePosition);
      window.visualViewport?.removeEventListener('resize', schedulePosition);
      window.visualViewport?.removeEventListener('scroll', schedulePosition);
    };
  }, [closePicker, isOpen]);

  useEffect(() => {
    const activeChoice = filteredChoices[activeIndex];
    if (!activeChoice) return;
    optionRefs.current.get(activeChoice.value)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filteredChoices]);

  useEffect(() => () => {
    if (!openRef.current) return;
    openRef.current = false;
    activeHistoryGroupRef.current(false);
  }, []);

  const popup = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popupRef}
      id={popupId}
      className={styles.popup}
      data-editor-shortcuts-disabled="true"
      role="dialog"
      aria-label={copy.options + ': ' + label}
      style={position ?? { visibility: 'hidden' }}
      onKeyDown={(event) => {
        if (isImeComposing(event.nativeEvent)) return;
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closePicker();
      }}
    >
      <div className={styles.searchRow}>
        <input
          ref={searchRef}
          className={styles.search}
          type="search"
          data-editor-portal-input="true"
          role="combobox"
          aria-label={copy.search + ': ' + label}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={popupId + '-list'}
          aria-activedescendant={filteredChoices[activeIndex] ? popupId + '-option-' + activeIndex : undefined}
          placeholder={copy.searchPlaceholder}
          value={query}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleSearchKeyDown}
        />
        <button
          ref={closeRef}
          className={styles.close}
          type="button"
          aria-label={copy.close}
          onClick={() => closePicker()}
          onKeyDown={handleCloseKeyDown}
        >
          <AppIcon name="X" size={16} />
        </button>
      </div>
      <div
        ref={listRef}
        id={popupId + '-list'}
        className={styles.optionList}
        role="listbox"
        aria-label={copy.options}
        aria-activedescendant={filteredChoices[activeIndex] ? popupId + '-option-' + activeIndex : undefined}
      >
        {filteredChoices.map((choice, index) => (
          <div
            ref={(node) => {
              if (node) optionRefs.current.set(choice.value, node);
              else optionRefs.current.delete(choice.value);
            }}
            key={choice.value}
            id={popupId + '-option-' + index}
            className={styles.option}
            role="option"
            aria-selected={choice.value === value}
            aria-posinset={index + 1}
            aria-setsize={filteredChoices.length}
            data-active={index === activeIndex}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectChoice(choice)}
          >
            <span className={styles.optionCopy}>
              <span className={styles.fontName}>{choice.label}</span>
              <FontSample choice={choice} index={index} active={index === activeIndex} locale={locale} listRootRef={listRef} />
            </span>
            <span className={styles.selection} aria-hidden="true">
              {choice.value === value ? '✓' : ''}
            </span>
          </div>
        ))}
        {!filteredChoices.length && <p className={styles.empty}>{copy.empty}</p>}
      </div>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {query ? copy.resultCount(filteredChoices.length) : ''}
      </span>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        data-text-font-family={dataTextFontFamily}
        aria-label={label + ': ' + valueLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popupId : undefined}
        onClick={openPicker}
      >
        <span className={styles.triggerName}>{valueLabel}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      {popup}
    </>
  );
}

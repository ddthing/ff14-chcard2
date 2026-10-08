'use client';

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import styles from '@/app/editor/editor.module.css';
import { isImeComposing } from './editor-input';
import { getNextComboboxOptionIndex } from './editor-interaction';

export interface SearchablePickerOption {
  id: string;
  label: string;
  detail?: string;
  abbreviation?: string;
  groupLabel?: string;
  searchText?: string;
  icon?: ReactNode;
  filterKey?: string;
}

export interface SearchablePickerFilter {
  id: string;
  label: string;
}

export interface SearchablePickerFilterGroup {
  id: string;
  label: string;
  filters: SearchablePickerFilter[];
  activeFilter: string;
  onChange: (filterId: string) => void;
}

interface SearchablePickerProps {
  label: string;
  value: string | null;
  selectedLabel?: string;
  placeholder: string;
  searchLabel: string;
  noResultsLabel: string;
  clearLabel: string;
  closeLabel: string;
  options: SearchablePickerOption[];
  disabled?: boolean;
  clearable?: boolean;
  maxResults?: number;
  filterGroups?: SearchablePickerFilterGroup[];
  activeFilter?: string;
  onSelect: (option: SearchablePickerOption | null) => void;
  onFocusField?: () => void;
  onBlurField?: () => void;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

export function SearchablePicker({
  label,
  value,
  selectedLabel,
  placeholder,
  searchLabel,
  noResultsLabel,
  clearLabel,
  closeLabel,
  options,
  disabled = false,
  clearable = true,
  maxResults = 12,
  filterGroups,
  activeFilter = 'all',
  onSelect,
  onFocusField,
  onBlurField,
}: SearchablePickerProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const mobileTriggerValueId = `${generatedId}-mobile-value`;
  const listId = `${generatedId}-list`;
  const labelId = `${generatedId}-label`;
  const panelId = `${generatedId}-panel`;
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  );
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const focusMobileSearchOnOpen = useRef(false);
  const openStateRef = useRef(false);
  const mobileViewportRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedFromMobile = useRef(false);
  const suppressDesktopFocusOpen = useRef(false);
  const onFocusFieldRef = useRef(onFocusField);
  const onBlurFieldRef = useRef(onBlurField);
  const optionRefs = useRef(new Map<string, HTMLLIElement>());
  const selectedOption = value ? options.find((option) => option.id === value) : undefined;
  const displayValue = selectedOption?.label ?? selectedLabel ?? '';

  const restoreTriggerFocus = useCallback((onlyIfUnclaimed = false) => {
    if (!onlyIfUnclaimed && !openedFromMobile.current && document.activeElement === desktopSearchRef.current) return;
    requestAnimationFrame(() => {
      if (onlyIfUnclaimed) {
        const activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body && activeElement.isConnected) return;
      }
      if (openedFromMobile.current) mobileTriggerRef.current?.focus();
      else if (desktopSearchRef.current && document.activeElement !== desktopSearchRef.current) {
        suppressDesktopFocusOpen.current = true;
        desktopSearchRef.current.focus();
        if (document.activeElement === desktopSearchRef.current) onFocusFieldRef.current?.();
      }
    });
  }, []);

  function setPickerOpen(nextOpen: boolean) {
    openStateRef.current = nextOpen;
    setOpen(nextOpen);
  }

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return options
      .filter((option) => activeFilter === 'all' || option.filterKey === activeFilter)
      .filter((option) => {
        if (!normalizedQuery) return true;
        return normalizeSearch(`${option.abbreviation ?? ''} ${option.label} ${option.detail ?? ''} ${option.groupLabel ?? ''} ${option.searchText ?? ''}`).includes(normalizedQuery);
      })
      .slice(0, maxResults);
  }, [activeFilter, maxResults, options, query]);

  const activeOptionId = filteredOptions.some((option) => option.id === activeId)
    ? activeId
    : null;

  useEffect(() => {
    onFocusFieldRef.current = onFocusField;
  }, [onFocusField]);

  useEffect(() => {
    onBlurFieldRef.current = onBlurField;
  }, [onBlurField]);

  useEffect(() => {
    if (!open) return;
    function handleOutsidePointerDown(event: PointerEvent) {
      if (pickerRef.current?.contains(event.target as Node)) return;
      openStateRef.current = false;
      setOpen(false);
      setQuery('');
      setActiveId(null);
      onBlurFieldRef.current?.();
      restoreTriggerFocus(true);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [open, restoreTriggerFocus]);

  useEffect(() => {
    if (open && focusMobileSearchOnOpen.current) {
      focusMobileSearchOnOpen.current = false;
      mobileSearchRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !activeOptionId) return;
    optionRefs.current.get(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId, open]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    mobileViewportRef.current = mediaQuery.matches;

    function handleViewportChange() {
      const isMobile = mediaQuery.matches;
      if (mobileViewportRef.current === isMobile) return;
      mobileViewportRef.current = isMobile;
      setIsMobileViewport(isMobile);
      openedFromMobile.current = isMobile;
      if (!openStateRef.current) return;

      openStateRef.current = false;
      setOpen(false);
      setQuery('');
      setActiveId(null);
      focusMobileSearchOnOpen.current = false;
      requestAnimationFrame(() => {
        if (isMobile) {
          mobileTriggerRef.current?.focus();
        } else if (desktopSearchRef.current) {
          suppressDesktopFocusOpen.current = true;
          desktopSearchRef.current.focus();
          if (document.activeElement !== desktopSearchRef.current) suppressDesktopFocusOpen.current = false;
          else onFocusFieldRef.current?.();
        }
      });
    }

    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, []);

  function choose(option: SearchablePickerOption | null, returnFocus = false) {
    const shouldRestoreFocus = open || returnFocus;
    onSelect(option);
    setPickerOpen(false);
    setQuery('');
    setActiveId(null);
    if (shouldRestoreFocus) restoreTriggerFocus();
  }

  function closePicker(returnFocus = false) {
    setPickerOpen(false);
    setQuery('');
    setActiveId(null);
    if (returnFocus) restoreTriggerFocus();
  }

  function openPickerFromMobile() {
    if (disabled) return;
    if (open) {
      mobileSearchRef.current?.focus();
      return;
    }
    setQuery('');
    setActiveId(null);
    openedFromMobile.current = true;
    focusMobileSearchOnOpen.current = true;
    setPickerOpen(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setPickerOpen(false);
    setQuery('');
    setActiveId(null);
    onBlurField?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isImeComposing(event.nativeEvent)) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const currentIndex = open ? filteredOptions.findIndex((option) => option.id === activeOptionId) : -1;
      const nextIndex = getNextComboboxOptionIndex(currentIndex, filteredOptions.length, event.key);
      setPickerOpen(true);
      setActiveId(nextIndex === null ? null : filteredOptions[nextIndex]?.id ?? null);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const currentIndex = open ? filteredOptions.findIndex((option) => option.id === activeOptionId) : -1;
      const nextIndex = getNextComboboxOptionIndex(currentIndex, filteredOptions.length, event.key);
      setPickerOpen(true);
      setActiveId(nextIndex === null ? null : filteredOptions[nextIndex]?.id ?? null);
    } else if (event.key === 'Enter' && open) {
      const candidate = filteredOptions.find((option) => option.id === activeOptionId);
      if (candidate) {
        event.preventDefault();
        choose(candidate);
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      closePicker(true);
    }
  }

  function handlePickerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isImeComposing(event.nativeEvent)) return;
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePicker(true);
      return;
    }
    if (event.key !== 'Tab' || !openedFromMobile.current) return;

    const panel = panelRef.current;
    if (!panel) return;
    const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    if (focusableElements.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === firstElement || !panel.contains(activeElement))) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && (activeElement === lastElement || !panel.contains(activeElement))) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function renderSearchInput(id: string, inputRef?: RefObject<HTMLInputElement | null>) {
    return (
      <input
        id={id}
        ref={inputRef}
        className={id === inputId ? styles.pickerInput : styles.pickerSearchInput}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={open ? query : displayValue}
        placeholder={placeholder}
        title={searchLabel}
        aria-labelledby={labelId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeOptionId ? `${listId}-${encodeURIComponent(activeOptionId)}` : undefined}
        onFocus={() => {
          if (id === inputId && suppressDesktopFocusOpen.current) {
            suppressDesktopFocusOpen.current = false;
            return;
          }
          if (open) return;
          openedFromMobile.current = false;
          setPickerOpen(true);
          setQuery('');
          onFocusField?.();
        }}
        onChange={(event) => { setQuery(event.currentTarget.value); setActiveId(null); setPickerOpen(true); }}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div ref={pickerRef} className={styles.picker} onBlur={handleBlur} onKeyDown={handlePickerKeyDown}>
      <span id={labelId} className={styles.pickerLabel}>{label}</span>
      <div className={`${styles.pickerInputWrap} ${styles.pickerTriggerDesktop} ${open ? styles.pickerInputOpen : ''}`}>
        {renderSearchInput(inputId, desktopSearchRef)}
        {clearable && value && !disabled && (
          <button
            className={styles.pickerClear}
            type="button"
            aria-label={`${label}: ${clearLabel}`}
            onClick={() => { openedFromMobile.current = false; choose(null, true); }}
          >×</button>
        )}
        <span className={styles.pickerChevron} aria-hidden="true">⌄</span>
      </div>
      <div className={`${styles.pickerInputWrap} ${styles.pickerTriggerMobile}`}>
        <button
          ref={mobileTriggerRef}
          className={styles.pickerTriggerButton}
          type="button"
          disabled={disabled}
          aria-labelledby={`${labelId} ${mobileTriggerValueId}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onFocus={() => { if (!open) onFocusField?.(); }}
          onClick={openPickerFromMobile}
        ><span id={mobileTriggerValueId}>{displayValue || placeholder}</span></button>
        {clearable && value && !disabled && (
          <button
            className={styles.pickerClear}
            type="button"
            aria-label={`${label}: ${clearLabel}`}
            onClick={() => { openedFromMobile.current = true; choose(null, true); }}
          >×</button>
        )}
        <span className={styles.pickerChevron} aria-hidden="true">⌄</span>
      </div>

      {open && (
        <>
          <div className={styles.pickerBackdrop} aria-hidden="true" onClick={() => closePicker(true)} />
          <div ref={panelRef} id={panelId} className={styles.pickerPopover} data-state={open ? 'open' : 'closed'} role="dialog" aria-labelledby={labelId} aria-modal={isMobileViewport ? true : undefined} tabIndex={-1}>
            <div className={styles.pickerSheetHead}>
              <span className={styles.pickerLabel}>{label}</span>
              <button
                className={styles.pickerClose}
                type="button"
                aria-label={closeLabel}
                onClick={() => closePicker(true)}
              >×</button>
            </div>
            <div className={styles.pickerSearchWrap}>
              {renderSearchInput(`${generatedId}-mobile-input`, mobileSearchRef)}
            </div>
            {filterGroups?.map((group) => (
              <div className={styles.pickerFilterGroup} key={group.id} role="group" aria-label={group.label}>
                <span className={styles.pickerFilterLabel}>{group.label}</span>
                <div className={styles.pickerFilters}>
                  {group.filters.map((filter) => (
                    <button
                      className={styles.pickerFilter}
                      key={filter.id}
                      type="button"
                      aria-label={`${group.label}: ${filter.label}`}
                      aria-pressed={group.activeFilter === filter.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => { group.onChange(filter.id); setActiveId(null); }}
                    >{filter.label}</button>
                  ))}
                </div>
              </div>
            ))}
            <ul id={listId} className={styles.pickerList} role="listbox" aria-labelledby={labelId}>
            {filteredOptions.map((option, index) => {
              const optionId = `${listId}-${encodeURIComponent(option.id)}`;
              const active = option.id === activeOptionId;
              const previousGroup = filteredOptions[index - 1]?.groupLabel;
              const needsGroupHeading = option.groupLabel && option.groupLabel !== previousGroup;
              return (
                <Fragment key={option.id}>
                  {needsGroupHeading && <li className={styles.pickerGroupHeading} role="presentation" aria-hidden="true">{option.groupLabel}</li>}
                  <li
                    id={optionId}
                    ref={(element) => {
                      if (element) optionRefs.current.set(option.id, element);
                      else optionRefs.current.delete(option.id);
                    }}
                    className={`${styles.pickerOption} ${active ? styles.pickerOptionActive : ''}`}
                    role="option"
                    aria-label={[option.groupLabel, option.abbreviation, option.label, option.detail].filter(Boolean).join(', ')}
                    aria-selected={option.id === (activeOptionId ?? value)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveId(option.id)}
                    onClick={() => choose(option)}
                  >
                    {option.icon && <span className={styles.pickerOptionIcon}>{option.icon}</span>}
                    {option.abbreviation && <span className={styles.pickerAbbreviation}>{option.abbreviation}</span>}
                    <span className={styles.pickerOptionText}>
                      <span>{option.label}</span>
                      {option.detail && <small>{option.detail}</small>}
                    </span>
                    {option.id === value && <span className={styles.pickerOptionCheck} aria-hidden="true">✓</span>}
                  </li>
                </Fragment>
              );
            })}
            </ul>
            {filteredOptions.length === 0 && <div className={styles.pickerEmpty} role="status" aria-live="polite">{noResultsLabel}</div>}
          </div>
        </>
      )}
    </div>
  );
}

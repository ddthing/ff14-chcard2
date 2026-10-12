'use client';

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
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
  filterGroups?: SearchablePickerFilterGroup[];
  activeFilter?: string;
  onSelect: (option: SearchablePickerOption | null) => void;
  onFocusField?: () => void;
  onBlurField?: () => void;
  editorControlId?: string;
}

type PickerListRow =
  | { kind: 'unset'; domId: string }
  | { kind: 'option'; option: SearchablePickerOption; domId: string };

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
  filterGroups,
  activeFilter = 'all',
  onSelect,
  onFocusField,
  onBlurField,
  editorControlId,
}: SearchablePickerProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const mobileTriggerValueId = `${generatedId}-mobile-value`;
  const listId = `${generatedId}-list`;
  const unsetOptionDomId = `${listId}-unset`;
  const labelId = `${generatedId}-label`;
  const mobileLabelId = `${generatedId}-mobile-label`;
  const mobileSearchLabelId = `${generatedId}-mobile-search-label`;
  const panelId = `${generatedId}-panel`;
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  );
  const [query, setQuery] = useState('');
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const focusMobileSearchOnOpen = useRef(false);
  const openStateRef = useRef(false);
  const mobileViewportRef = useRef(false);
  const optionPointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const openedFromMobile = useRef(false);
  const suppressDesktopFocusOpen = useRef(false);
  const onFocusFieldRef = useRef(onFocusField);
  const onBlurFieldRef = useRef(onBlurField);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
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

  const setPickerOpen = useCallback((nextOpen: boolean) => {
    openStateRef.current = nextOpen;
    if (!nextOpen && mobileDialogRef.current?.open) mobileDialogRef.current.close();
    setOpen(nextOpen);
  }, []);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return options
      .filter((option) => activeFilter === 'all' || option.filterKey === activeFilter)
      .filter((option) => {
        if (!normalizedQuery) return true;
        return normalizeSearch(`${option.abbreviation ?? ''} ${option.label} ${option.detail ?? ''} ${option.groupLabel ?? ''} ${option.searchText ?? ''}`).includes(normalizedQuery);
      });
  }, [activeFilter, options, query]);

  const pickerRows = useMemo<PickerListRow[]>(() => {
    const rows: PickerListRow[] = filteredOptions.map((option) => ({
      kind: 'option',
      option,
      domId: `${listId}-option-${encodeURIComponent(option.id)}`,
    }));
    if (clearable) rows.unshift({ kind: 'unset', domId: unsetOptionDomId });
    return rows;
  }, [clearable, filteredOptions, listId, unsetOptionDomId]);
  const activeRow = activeRowIndex === null ? null : pickerRows[activeRowIndex] ?? null;
  const activeRowId = activeRow?.domId ?? null;

  function handleRowPointerMove(event: ReactPointerEvent<HTMLLIElement>, rowIndex: number) {
    if (event.pointerType === 'touch') return;
    const previousPosition = optionPointerPositionRef.current;
    const moved = event.movementX !== 0
      || event.movementY !== 0
      || (previousPosition !== null && (event.clientX !== previousPosition.x || event.clientY !== previousPosition.y));
    optionPointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (moved) setActiveRowIndex(rowIndex);
  }

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
      setPickerOpen(false);
      setQuery('');
      setActiveRowIndex(null);
      onBlurFieldRef.current?.();
      restoreTriggerFocus(true);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [open, restoreTriggerFocus, setPickerOpen]);

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog || !open || !isMobileViewport) return;

    const updateVisualViewport = () => {
      const viewport = window.visualViewport;
      dialog.style.setProperty('--picker-visual-height', `${Math.max(1, viewport?.height ?? window.innerHeight)}px`);
      dialog.style.setProperty('--picker-visual-top', `${Math.max(0, viewport?.offsetTop ?? 0)}px`);
    };

    updateVisualViewport();
    const viewport = window.visualViewport;
    window.addEventListener('resize', updateVisualViewport);
    viewport?.addEventListener('resize', updateVisualViewport);
    viewport?.addEventListener('scroll', updateVisualViewport);
    return () => {
      window.removeEventListener('resize', updateVisualViewport);
      viewport?.removeEventListener('resize', updateVisualViewport);
      viewport?.removeEventListener('scroll', updateVisualViewport);
    };
  }, [isMobileViewport, open]);

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog || !open || !isMobileViewport || dialog.open) return;
    dialog.showModal();
  }, [isMobileViewport, open]);

  useEffect(() => {
    if (open && focusMobileSearchOnOpen.current) {
      focusMobileSearchOnOpen.current = false;
      mobileSearchRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !activeRowId) return;
    rowRefs.current.get(activeRowId)?.scrollIntoView({ block: 'nearest' });
  }, [activeRowId, open]);

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

      setPickerOpen(false);
      setQuery('');
      setActiveRowIndex(null);
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
  }, [setPickerOpen]);

  function choose(option: SearchablePickerOption | null, returnFocus = false) {
    const shouldRestoreFocus = open || returnFocus;
    onSelect(option);
    setPickerOpen(false);
    setQuery('');
    setActiveRowIndex(null);
    if (shouldRestoreFocus) restoreTriggerFocus();
  }

  function closePicker(returnFocus = false) {
    setPickerOpen(false);
    setQuery('');
    setActiveRowIndex(null);
    if (returnFocus) restoreTriggerFocus();
  }

  function openPickerFromMobile() {
    if (disabled) return;
    if (open) {
      mobileSearchRef.current?.focus();
      return;
    }
    setQuery('');
    setActiveRowIndex(null);
    openedFromMobile.current = true;
    focusMobileSearchOnOpen.current = true;
    setPickerOpen(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setPickerOpen(false);
    setQuery('');
    setActiveRowIndex(null);
    onBlurField?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isImeComposing(event.nativeEvent)) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const currentIndex = open ? activeRowIndex ?? -1 : -1;
      const nextIndex = getNextComboboxOptionIndex(currentIndex, pickerRows.length, event.key);
      setPickerOpen(true);
      setActiveRowIndex(nextIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const currentIndex = open ? activeRowIndex ?? -1 : -1;
      const nextIndex = getNextComboboxOptionIndex(currentIndex, pickerRows.length, event.key);
      setPickerOpen(true);
      setActiveRowIndex(nextIndex);
    } else if (event.key === 'Enter' && open) {
      if (activeRow?.kind === 'unset') {
        event.preventDefault();
        choose(null);
      } else if (activeRow?.kind === 'option') {
        event.preventDefault();
        choose(activeRow.option);
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

    const panel = openedFromMobile.current ? mobileDialogRef.current : panelRef.current;
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

  function openDesktopPicker() {
    if (openStateRef.current) return;
    openedFromMobile.current = false;
    setPickerOpen(true);
    setQuery('');
    setActiveRowIndex(null);
    onFocusField?.();
  }

  function renderSearchInput(id: string, inputRef?: RefObject<HTMLInputElement | null>, labelledBy = labelId) {
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
        aria-labelledby={labelledBy}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? activeRowId ?? undefined : undefined}
        onFocus={() => {
          if (id === inputId && suppressDesktopFocusOpen.current) {
            suppressDesktopFocusOpen.current = false;
            return;
          }
          if (id === inputId) openDesktopPicker();
        }}
        onClick={() => { if (id === inputId) openDesktopPicker(); }}
        onChange={(event) => { setQuery(event.currentTarget.value); setActiveRowIndex(null); setPickerOpen(true); }}
        onKeyDown={handleKeyDown}
      />
    );
  }

  function renderPickerPanelContents(isMobilePanel: boolean) {
    const pickerLabelId = isMobilePanel ? mobileLabelId : labelId;
    const searchInputLabelledBy = isMobilePanel ? `${mobileLabelId} ${mobileSearchLabelId}` : labelId;

    return (
      <>
        <div className={styles.pickerSheetHead}>
          <span id={isMobilePanel ? mobileLabelId : undefined} className={styles.pickerLabel}>{label}</span>
          {isMobilePanel && <span id={mobileSearchLabelId} className={styles.srOnly}>{searchLabel}</span>}
          <button
            className={styles.pickerClose}
            type="button"
            aria-label={closeLabel}
            onClick={() => closePicker(true)}
          >×</button>
        </div>
        <div className={styles.pickerSearchWrap}>
          {renderSearchInput(`${generatedId}-mobile-input`, mobileSearchRef, searchInputLabelledBy)}
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
                  onClick={() => { group.onChange(filter.id); setActiveRowIndex(null); }}
                >{filter.label}</button>
              ))}
            </div>
          </div>
        ))}
        <ul id={listId} className={styles.pickerList} role="listbox" aria-labelledby={pickerLabelId}>
          {pickerRows.map((row, rowIndex) => {
            if (row.kind === 'unset') {
              const active = activeRowIndex === rowIndex;
              return (
                <li
                  id={row.domId}
                  ref={(element) => {
                    if (element) rowRefs.current.set(row.domId, element);
                    else rowRefs.current.delete(row.domId);
                  }}
                  key="row:unset"
                  className={`${styles.pickerOption} ${active ? styles.pickerOptionActive : ''}`}
                  role="option"
                  aria-label={clearLabel}
                  aria-selected={active || (activeRowIndex === null && value === null)}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerMove={(event) => handleRowPointerMove(event, rowIndex)}
                  onClick={() => choose(null)}
                >
                  <span className={styles.pickerOptionText}><span>{clearLabel}</span></span>
                  {value === null && <span className={styles.pickerOptionCheck} aria-hidden="true">✓</span>}
                </li>
              );
            }

            const option = row.option;
            const active = activeRowIndex === rowIndex;
            const optionIndex = rowIndex - (clearable ? 1 : 0);
            const previousGroup = filteredOptions[optionIndex - 1]?.groupLabel;
            const needsGroupHeading = option.groupLabel && option.groupLabel !== previousGroup;
            return (
              <Fragment key={`row:option:${option.id}`}>
                {needsGroupHeading && <li className={styles.pickerGroupHeading} role="presentation" aria-hidden="true">{option.groupLabel}</li>}
                <li
                  id={row.domId}
                  ref={(element) => {
                    if (element) rowRefs.current.set(row.domId, element);
                    else rowRefs.current.delete(row.domId);
                  }}
                  className={`${styles.pickerOption} ${active ? styles.pickerOptionActive : ''}`}
                  role="option"
                  aria-label={[option.groupLabel, option.abbreviation, option.label, option.detail].filter(Boolean).join(', ')}
                  aria-selected={active || (activeRowIndex === null && option.id === value)}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerMove={(event) => handleRowPointerMove(event, rowIndex)}
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
      </>
    );
  }

  return (
    <div ref={pickerRef} className={styles.picker} data-card-text-editor-control={editorControlId} onBlur={handleBlur} onKeyDown={handlePickerKeyDown}>
      <span id={labelId} className={styles.pickerLabel}>{label}</span>
      <div
        className={`${styles.pickerInputWrap} ${styles.pickerTriggerDesktop} ${open ? styles.pickerInputOpen : ''}`}
      >
        {renderSearchInput(inputId, desktopSearchRef)}
        <span className={styles.pickerChevron} aria-hidden="true" />
      </div>
      <div
        className={`${styles.pickerInputWrap} ${styles.pickerTriggerMobile}`}
      >
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
        <span className={styles.pickerChevron} aria-hidden="true" />
      </div>

      {open && !isMobileViewport && (
        <>
          <div className={styles.pickerBackdrop} aria-hidden="true" onClick={() => closePicker(true)} />
          <div ref={panelRef} id={panelId} className={styles.pickerPopover} data-state="open" role="dialog" aria-labelledby={labelId} tabIndex={-1}>
            {renderPickerPanelContents(false)}
          </div>
        </>
      )}
      {open && isMobileViewport && (
        <dialog
          ref={mobileDialogRef}
          id={panelId}
          className={`${styles.pickerPopover} ${styles.pickerMobileDialog}`}
          data-state="open"
          aria-labelledby={mobileLabelId}
          aria-modal="true"
          tabIndex={-1}
          onCancel={(event) => { event.preventDefault(); closePicker(true); }}
          onClick={(event) => { if (event.target === event.currentTarget) closePicker(true); }}
        >
          <div className={styles.pickerMobileDialogContent}>{renderPickerPanelContents(true)}</div>
        </dialog>
      )}
    </div>
  );
}

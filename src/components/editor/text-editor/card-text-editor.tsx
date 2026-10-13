'use client';

import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { CardTypographyPreset } from '@/components/cards/types';
import { normalizeCardTextOverride, type CardTextCategory, type CardTextItem, type CardTextSlotId } from '@/lib/card-text-editing';
import { editorStore } from '@/store/editor-store';
import type { EditorCopy } from '@/components/editor/copy';
import { isImeComposing } from '@/components/editor/editor-input';
import { applyDefaultCopySample, applyGlobalTypographyPreset } from './card-text-actions';
import { CARD_TEXT_CATEGORIES, getIndividualTypographyOrdinal, getTextItemsForCategory, isIndividualTypographyItem, resolveSelectedTextItem } from './card-text-model';
import styles from './card-text-editor.module.css';

const TYPOGRAPHY_PRESETS: readonly CardTypographyPreset[] = ['editorial', 'modern', 'condensed', 'classic', 'clean'];

interface CardTextEditorNavigationProps {
  items: readonly CardTextItem[];
  category: CardTextCategory;
  selectedId: string | null;
  copy: EditorCopy;
  disabledCategories?: readonly CardTextCategory[];
  onCategoryChange: (category: CardTextCategory) => void;
  onSelectItem: (item: CardTextItem) => void;
  children?: ReactNode;
}

export function CardTextEditorNavigation({
  items,
  category,
  selectedId,
  copy,
  disabledCategories = [],
  onCategoryChange,
  onSelectItem,
  children,
}: CardTextEditorNavigationProps) {
  const navigationRef = useRef<HTMLDetailsElement>(null);
  const categoryItems = getTextItemsForCategory(items, category);
  const selectedItem = resolveSelectedTextItem(items, category, selectedId);
  const selectedLabel = selectedItem?.kind === 'label'
    ? `${selectedItem.label} · ${copy.textEditor.labelSuffix}`
    : selectedItem?.label ?? '';
  const selectedOrdinal = selectedItem && isIndividualTypographyItem(selectedItem)
    ? getIndividualTypographyOrdinal(items, selectedItem.id)
    : 0;

  function selectCategory(nextCategory: CardTextCategory) {
    onCategoryChange(nextCategory);
    const nextItems = getTextItemsForCategory(items, nextCategory);
    if (!nextItems.some((item) => item.id === selectedId) && nextItems[0]) onSelectItem(nextItems[0]);
  }

  function selectItem(item: CardTextItem) {
    onSelectItem(item);
    if (navigationRef.current) {
      navigationRef.current.open = false;
      navigationRef.current.querySelector('summary')?.focus({ preventScroll: true });
    }
  }

  return (
    <section className={styles.editor} data-text-editor="true" data-selected-text-id={selectedItem?.id ?? ''}>
      <details ref={navigationRef} className={styles.navigation} data-text-navigation>
        <summary data-selected-text-context={selectedItem?.id ?? ''}>
          {selectedOrdinal > 0 && <small className={styles.itemOrdinal} aria-hidden="true">{selectedOrdinal}.</small>}
          <strong>{selectedLabel || copy.textEditor.items}</strong>
        </summary>
        <div className={styles.navigationBody}>
          <div className={styles.categories} role="group" aria-label={copy.textEditor.categories[category]}>
            {CARD_TEXT_CATEGORIES.map((itemCategory) => {
              const disabled = disabledCategories.includes(itemCategory);
              return (
                <button
                  key={itemCategory}
                  type="button"
                  disabled={disabled}
                  aria-pressed={category === itemCategory}
                  onClick={() => { if (!disabled) selectCategory(itemCategory); }}
                >{copy.textEditor.categories[itemCategory]}</button>
              );
            })}
          </div>

          {categoryItems.length > 2 ? (
            <label className={styles.itemSelect}>
              <span className={styles.visuallyHidden}>{copy.textEditor.items}</span>
              <select
                data-text-item-select="true"
                aria-label={copy.textEditor.items}
                value={selectedItem?.id ?? ''}
                onChange={(event) => {
                  const next = categoryItems.find((item) => item.id === event.currentTarget.value);
                  if (next) selectItem(next);
                }}
              >
                {categoryItems.map((item) => {
                  const ordinal = isIndividualTypographyItem(item) ? getIndividualTypographyOrdinal(items, item.id) : 0;
                  const label = item.kind === 'label' ? `${item.label} · ${copy.textEditor.labelSuffix}` : item.label;
                  return <option key={item.id} value={item.id}>{ordinal > 0 ? `${ordinal}. ` : ''}{label}{!item.value.trim() ? ` · ${copy.textEditor.hiddenText}` : ''}</option>;
                })}
              </select>
            </label>
          ) : (
            <div className={styles.itemGroup}>
              <ul className={styles.itemList} aria-label={copy.textEditor.categories[category]}>
                {categoryItems.map((item) => {
                  const ordinal = isIndividualTypographyItem(item) ? getIndividualTypographyOrdinal(items, item.id) : 0;
                  const label = item.kind === 'label' ? `${item.label} · ${copy.textEditor.labelSuffix}` : item.label;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={styles.itemButton}
                        data-text-item-id={item.id}
                        data-text-item-ordinal={ordinal}
                        aria-pressed={selectedItem?.id === item.id}
                        aria-label={`${label}${!item.value.trim() ? ` · ${copy.textEditor.hiddenText}` : ''}`}
                        onClick={() => selectItem(item)}
                      >
                        {ordinal > 0 && <small className={styles.itemOrdinal} aria-hidden="true">{ordinal}.</small>}
                        <span>{label}</span>
                        {!item.value.trim() && <small>{copy.textEditor.hiddenText}</small>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </details>

      {children}
    </section>
  );
}

interface CardTextOverrideInputProps {
  item: CardTextItem;
  copy: EditorCopy;
  overriddenValue: string | undefined;
}

export function CardTextOverrideInput({ item, copy, overriddenValue }: CardTextOverrideInputProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const composing = useRef(false);
  const groupId = `card-text-content:${item.id}`;
  const value = editingValue ?? item.value;
  const maximum = item.maxLength ?? 500;
  const maximumLines = item.maxLines;

  function limitLineCount(next: string): string {
    return normalizeCardTextOverride(next, item.id) ?? '';
  }

  function beginEdit() {
    editorStore.getState().beginHistoryGroup(groupId, 'design');
  }

  function endEdit() {
    const state = editorStore.getState();
    if (state.history.groupId === groupId) state.endHistoryGroup();
    state.persistNow();
  }

  function commit(next: string) {
    editorStore.getState().setTextOverride(item.id, limitLineCount(next), { groupId });
  }

  function onChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = event.currentTarget.value;
    if (composing.current || (event.nativeEvent as InputEvent).isComposing) {
      setEditingValue(next);
      return;
    }
    commit(limitLineCount(next));
  }

  function onCompositionStart(event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) {
    composing.current = true;
    setEditingValue(event.currentTarget.value);
  }

  function onCompositionEnd(event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) {
    composing.current = false;
    setEditingValue(null);
    commit(limitLineCount(event.currentTarget.value));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (isImeComposing(event.nativeEvent)) event.stopPropagation();
  }

  useEffect(() => () => {
    const state = editorStore.getState();
    if (state.history.groupId === groupId) state.endHistoryGroup();
    if (state.isHydrated) state.persistNow();
  }, [groupId, item.id]);

  const inputProps = {
    'data-text-content-input': '',
    'data-card-text-editor-control': item.id,
    'aria-label': `${copy.textEditor.content}: ${item.label}`,
    value,
    placeholder: copy.textEditor.contentPlaceholder,
    onFocus: beginEdit,
    onBlur: endEdit,
    onChange,
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
  };

  return (
    <div className={styles.contentEditor}>
      <label>
        <span>{copy.textEditor.content}</span>
        {item.kind === 'label' ? <input type="text" {...inputProps} /> : <textarea rows={2} {...inputProps} />}
        <small className={styles.contentCount}>
          {Array.from(value).length} / {maximum}
          {maximumLines !== undefined && ` · ${value.split('\n').length} / ${maximumLines} ${copy.textEditor.lineCountSuffix}`}
        </small>
      </label>
      {overriddenValue !== undefined && (
        <button
          type="button"
          className={styles.resetContent}
          onClick={() => editorStore.getState().resetTextOverride(item.id, { groupId: `card-text-content-reset:${item.id}` })}
        >{copy.textEditor.resetToDefault}</button>
      )}
    </div>
  );
}

export function GlobalTypographyPresetPicker({ copy, value }: { copy: EditorCopy; value: CardTypographyPreset }) {
  return (
    <section className={styles.globalTypography}>
      <label>
        <span>{copy.textEditor.cardTypography}</span>
        <select
          aria-label={copy.textEditor.cardTypography}
          value={value}
          onChange={(event) => applyGlobalTypographyPreset(event.currentTarget.value as CardTypographyPreset)}
        >
          {TYPOGRAPHY_PRESETS.map((preset) => <option key={preset} value={preset}>{copy.typographyNames[preset]}</option>)}
        </select>
      </label>
    </section>
  );
}

export function DefaultCopySampleButton({ copy, copyIds, active }: { copy: EditorCopy; copyIds: readonly CardTextSlotId[]; active: boolean }) {
  return (
    <button
      type="button"
      className={styles.defaultCopyButton}
      aria-pressed={active}
      disabled={active}
      onClick={() => applyDefaultCopySample(copyIds)}
    >{active ? copy.textEditor.defaultCopyActive : copy.textEditor.restoreDefaultCopy}</button>
  );
}

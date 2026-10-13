'use client';

import type { CardTextItem } from '@/lib/card-text-editing';
import type { Locale } from '@/lib/types';
import { getEditorCopy } from '@/components/editor/copy';
import { EditorIcon } from '@/components/editor/editor-icon';
import { getIndividualTypographyOrdinal } from '@/components/editor/text-editor/card-text-model';
import { getEditorLayerPanelModel } from './editor-layer-panel-model';
import type { EditorTaskId } from './editor-navigation';
import styles from './editor-layer-panel.module.css';

const NAVIGATOR_COPY: Record<Locale, { items: string; layers: string; informationSet: string }> = {
  ko: { items: '편집 항목', layers: '카드 레이어', informationSet: '정보 세트' },
  en: { items: 'Items', layers: 'Card layers', informationSet: 'Information set' },
  ja: { items: '編集項目', layers: 'カードのレイヤー', informationSet: '情報セット' },
};

interface EditorLayerPanelProps {
  items: readonly CardTextItem[];
  selectedId: string | null;
  activeTask: EditorTaskId;
  locale: Locale;
  templateLabel: string;
  ratio: string;
  onSelectItem: (item: CardTextItem) => void;
  onSelectTask: (task: EditorTaskId) => void;
}

function getItemContext(item: CardTextItem, hiddenLabel: string): string {
  if (!item.visible || !item.value.trim()) return hiddenLabel;
  return item.value.replace(/\s+/gu, ' ').trim();
}

function getVisibleItemLabel(item: CardTextItem): string {
  if (item.category !== 'copy') return item.label;
  return item.label.replace(/^[^·]+ · /u, '');
}

export function EditorLayerPanel({
  items,
  selectedId,
  activeTask,
  locale,
  templateLabel,
  ratio,
  onSelectItem,
  onSelectTask,
}: EditorLayerPanelProps) {
  const copy = getEditorCopy(locale);
  const model = getEditorLayerPanelModel(items, selectedId);

  function renderTextItem(item: CardTextItem) {
    const ordinal = getIndividualTypographyOrdinal(items, item.id);
    const isSelected = activeTask === 'information' && selectedId === item.id;
    const hidden = !item.visible || !item.value.trim();
    const visibleLabel = getVisibleItemLabel(item);
    const itemLabel = ordinal > 0
      ? copy.textEditor.targetLabel(item.label, ordinal)
      : item.label;

    return (
      <li key={item.id} className={styles.listItem}>
        <button
          type="button"
          className={styles.row}
          data-selected={isSelected ? '' : undefined}
          aria-pressed={isSelected}
          aria-label={`${itemLabel}${hidden ? ` · ${copy.textEditor.hiddenText}` : ''}`}
          title={item.label}
          onClick={() => onSelectItem(item)}
        >
          <span className={styles.rowText}>
            <span className={styles.rowLabel}>
              {ordinal > 0 && <span className={styles.ordinal} aria-hidden="true">{ordinal}.</span>}
              <span className={styles.rowTitle}>{visibleLabel}</span>
            </span>
            <span className={styles.rowContext}>{getItemContext(item, copy.textEditor.hiddenText)}</span>
          </span>
        </button>
      </li>
    );
  }

  const infoSelected = activeTask === 'information' && model.informationGroupSelected;
  const frameSelected = activeTask === 'design';
  const photoSelected = activeTask === 'photo';

  return (
    <section className={styles.panel} data-active-task={activeTask}>
      <h2 className={styles.visuallyHidden}>{NAVIGATOR_COPY[locale].items}</h2>

      <button
        type="button"
        className={styles.cardButton}
        data-selected={frameSelected ? '' : undefined}
        aria-pressed={frameSelected}
        aria-label={`${templateLabel} · ${ratio} · ${copy.tasks.design}`}
        onClick={() => onSelectTask('design')}
      >
        <span className={styles.cardGlyph} aria-hidden="true"><EditorIcon name="template" size={16} /></span>
        <span className={styles.cardDetails}>
          <span className={styles.cardName}>{templateLabel}</span>
          <span className={styles.cardRatio}>{ratio}</span>
        </span>
      </button>

      <nav className={styles.navigation} aria-label={NAVIGATOR_COPY[locale].layers}>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <button
              type="button"
              className={styles.row}
              data-selected={photoSelected ? '' : undefined}
              aria-pressed={photoSelected}
              onClick={() => onSelectTask('photo')}
            >
              <span className={styles.rowIcon} aria-hidden="true"><EditorIcon name="screenshot" size={16} /></span>
              <span className={styles.rowText}><span className={styles.rowLabel}>{copy.sections.screenshot}</span></span>
            </button>
          </li>
        </ul>

        {model.identityItems.length > 0 && (
          <section className={styles.group} aria-label={copy.textEditor.categories.identity}>
            <h3 className={styles.groupHeading}>{copy.textEditor.categories.identity}</h3>
            <ul className={styles.list}>{model.identityItems.map(renderTextItem)}</ul>
          </section>
        )}

        {model.phraseItems.length > 0 && (
          <section className={styles.group} aria-label={copy.textEditor.categories.copy}>
            <h3 className={styles.groupHeading}>{copy.textEditor.categories.copy}</h3>
            <ul className={styles.list}>{model.phraseItems.map(renderTextItem)}</ul>
          </section>
        )}

        {model.informationAnchor && (
          <section className={styles.group} aria-label={NAVIGATOR_COPY[locale].informationSet}>
            <ul className={styles.list}>
              <li className={styles.listItem}>
                <button
                  type="button"
                  className={styles.row}
                  data-selected={infoSelected ? '' : undefined}
                  aria-pressed={infoSelected}
                  aria-label={`${NAVIGATOR_COPY[locale].informationSet} · ${copy.textEditor.informationScope}`}
                  onClick={() => onSelectItem(model.informationAnchor!)}
                >
                  <span className={styles.rowText}>
                    <span className={styles.rowLabel}>{NAVIGATOR_COPY[locale].informationSet}</span>
                    <span className={styles.rowContext}>{copy.textEditor.informationScope}</span>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        )}
      </nav>
    </section>
  );
}

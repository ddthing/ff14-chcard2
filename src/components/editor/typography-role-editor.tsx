'use client';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CardTypographyOverride } from '@/components/cards/types';
import type { CardTextItem } from '@/lib/card-text-editing';
import {
  detectTypographyScript,
  getMasterTypographyFamily,
  getMasterTypographyTreatment,
  getTypographyFontEntry,
  getTypographyFontIdForStack,
  getTypographyFontOptions,
  getTypographySupportedWeight,
  isSelectableTypographyFontId,
} from '@/lib/typography-presets';
import type { Locale } from '@/lib/types';
import { editorStore, useEditorStore } from '@/store/editor-store';
import { resetLegacyTypographyRole } from '@/components/editor/text-editor/card-text-actions';
import styles from './typography-role-editor.module.css';

const COPY = {
  ko: {
    title: '텍스트 스타일', font: '글꼴', size: '크기', weight: '굵기', tracking: '자간', advanced: '세부 조정',
    reset: '이 항목 스타일 초기화', defaultFont: '기본 글꼴', inheritedFont: '저장된 기본 글꼴', unavailableFont: '저장된 글꼴 (사용할 수 없음)',
    resetInheritedRole: (role: string) => `${role} 그룹의 저장 스타일 초기화`,
    sizeHelp: '카드 기본 크기', supports: '지원 문자',
    fallback: '이 글꼴은 선택한 문자를 지원하지 않아 카드 기본 글꼴로 표시됩니다.',
    missing: '저장된 글꼴을 찾을 수 없어 카드 기본 글꼴로 표시됩니다.',
    scripts: { latin: '영문', korean: '한글', japanese: '일본어' },
    roles: { display: '이름', secondaryDisplay: '소개', job: '직업', information: '정보 값', label: '레이블', caption: '캡션', micro: '짧은 문구' },
  },
  en: {
    title: 'Text style', font: 'Font family', size: 'Size', weight: 'Weight', tracking: 'Letter spacing', advanced: 'Advanced',
    reset: 'Reset item style', defaultFont: 'Default font', inheritedFont: 'Saved default font', unavailableFont: 'Saved font (unavailable)',
    resetInheritedRole: (role: string) => `Reset saved ${role.toLowerCase()} group style`,
    sizeHelp: 'Card default', supports: 'Supports',
    fallback: 'This font does not support the selected script; the card uses its fallback font.',
    missing: 'The saved font is unavailable; the card uses its fallback font.',
    scripts: { latin: 'Latin', korean: 'Korean', japanese: 'Japanese' },
    roles: { display: 'Name', secondaryDisplay: 'Bio', job: 'Job', information: 'Information', label: 'Label', caption: 'Caption', micro: 'Short phrase' },
  },
  ja: {
    title: 'テキストスタイル', font: 'フォント', size: 'サイズ', weight: '太さ', tracking: '文字間隔', advanced: '詳細設定',
    reset: 'この項目のスタイルをリセット', defaultFont: '標準フォント', inheritedFont: '保存済み標準フォント', unavailableFont: '保存済みフォント（利用不可）',
    resetInheritedRole: (role: string) => `保存済みの${role}グループスタイルをリセット`,
    sizeHelp: 'カードの標準', supports: '対応文字',
    fallback: 'このフォントは選択した文字に対応していません。カードの代替フォントを使います。',
    missing: '保存済みのフォントが見つからないため、カードの代替フォントを使います。',
    scripts: { latin: 'ラテン', korean: '韓国語', japanese: '日本語' },
    roles: { display: '名前', secondaryDisplay: '紹介文', job: 'ジョブ', information: '情報', label: 'ラベル', caption: 'キャプション', micro: '短い文言' },
  },
} as const;

type EditableField = 'fontFamily' | 'sizePercent' | 'weight' | 'trackingEm';

function copyOverride(current: CardTypographyOverride | undefined, patch: Partial<CardTypographyOverride>): CardTypographyOverride {
  const next = { ...(current ?? {}), ...patch };
  for (const key of Object.keys(next) as Array<keyof CardTypographyOverride>) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

function updateItemOverride(item: CardTextItem, current: CardTypographyOverride | undefined, patch: Partial<CardTypographyOverride>, groupId: string) {
  const next = copyOverride(current, patch);
  const state = editorStore.getState();
  if (Object.keys(next).length > 0) state.setTextTypographyOverride(item.id, next, { groupId });
  else state.resetTextTypographyOverride(item.id, { groupId });
}

function beginGroup(itemId: string, field: EditableField) {
  editorStore.getState().beginHistoryGroup(`text-typography:${itemId}:${field}`, 'design');
}

function endGroup(itemId: string, field: EditableField) {
  const state = editorStore.getState();
  if (state.history.groupId === `text-typography:${itemId}:${field}`) state.endHistoryGroup();
}

function rangeGroupHandlers(item: CardTextItem, field: EditableField) {
  const start = () => beginGroup(item.id, field);
  const finish = () => endGroup(item.id, field);
  const adjustKeys = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp']);
  return {
    onFocus: start,
    onBlur: finish,
    onPointerDown: start,
    onPointerUp: finish,
    onPointerCancel: finish,
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (adjustKeys.has(event.key) && !event.repeat) start();
    },
    onKeyUp: (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (adjustKeys.has(event.key)) finish();
    },
  };
}

export function TypographyRoleEditor({ locale, item }: { locale: Locale; item: CardTextItem | null }) {
  const copy = COPY[locale];
  const template = useEditorStore((state) => state.design.template);
  const itemOverride = useEditorStore((state) => item ? state.design.textTypography?.[item.id] : undefined);
  const inheritedOverride = useEditorStore((state) => item ? state.design.typography?.[item.role] : undefined);
  const options = getTypographyFontOptions();

  if (!item) return null;
  const selectedItem = item;

  const localeScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const script = detectTypographyScript(item.value || item.defaultValue, localeScript);
  const family = getMasterTypographyFamily(template);
  const treatment = getMasterTypographyTreatment(family, item.role, script);
  const defaultFontId = getTypographyFontIdForStack(treatment.fontFamily, script);
  const selectedFontId = itemOverride?.fontFamily ?? inheritedOverride?.fontFamily ?? '';
  const selectedEntry = selectedFontId ? getTypographyFontEntry(selectedFontId) : undefined;
  const defaultEntry = defaultFontId ? getTypographyFontEntry(defaultFontId) : undefined;
  const effectiveEntry = selectedEntry ?? defaultEntry;
  const selectedFontSupportsScript = selectedEntry?.supportedScripts.includes(script) ?? false;
  const effectiveWeightRange = effectiveEntry?.axes.weight ?? [100, 900] as const;
  const supportedWeights = (effectiveEntry as (typeof effectiveEntry & { weights?: readonly number[] }) | undefined)?.weights;
  const requestedWeight = itemOverride?.weight ?? inheritedOverride?.weight ?? treatment.weight;
  const weight = getTypographySupportedWeight(effectiveEntry?.id, requestedWeight);
  const inheritedSizePercent = inheritedOverride?.sizePercent ?? 100;
  const localSizePercent = itemOverride?.sizePercent ?? 100;
  const minimumSizePercent = Math.round(inheritedSizePercent * 0.75);
  const maximumSizePercent = Math.round(inheritedSizePercent * 1.25);
  const sizePercent = Math.min(maximumSizePercent, Math.max(minimumSizePercent, Math.round(inheritedSizePercent * localSizePercent / 100)));
  const inheritedTracking = inheritedOverride?.trackingEm ?? 0;
  const localTracking = itemOverride?.trackingEm ?? 0;
  const minimumTracking = inheritedTracking - 0.12;
  const maximumTracking = inheritedTracking + 0.2;
  const tracking = Math.min(maximumTracking, Math.max(minimumTracking, inheritedTracking + localTracking));
  const hasItemOverride = Boolean(itemOverride && Object.values(itemOverride).some((value) => value !== undefined));
  const hasInheritedOverride = Boolean(inheritedOverride && Object.values(inheritedOverride).some((value) => value !== undefined));
  const selectedEntryIsSelectable = selectedEntry ? isSelectableTypographyFontId(selectedEntry.id) : true;
  const showCurrentFontOption = Boolean(selectedEntry && (!selectedEntryIsSelectable || !selectedFontSupportsScript));

  function storeField(field: EditableField, patch: Partial<CardTypographyOverride>) {
    updateItemOverride(selectedItem, itemOverride, patch, `text-typography:${selectedItem.id}:${field}`);
  }

  function changeSize(nextEffectiveSize: number) {
    const safeInherited = inheritedSizePercent > 0 ? inheritedSizePercent : 100;
    storeField('sizePercent', { sizePercent: nextEffectiveSize / safeInherited * 100 });
  }

  return (
    <section className={styles.panel} data-text-typography-editor={item.id} aria-label={`${copy.title}: ${item.label} · ${copy.roles[item.role]}`}>
      <div className={styles.primaryControls}>
        <label className={styles.field}>
          <span>{copy.font}</span>
          <select
            data-text-font-family={item.id}
            aria-label={copy.font}
            value={selectedFontId}
            onFocus={() => beginGroup(item.id, 'fontFamily')}
            onBlur={() => endGroup(item.id, 'fontFamily')}
            onChange={(event) => {
              const fontFamily = event.currentTarget.value || undefined;
              if (!fontFamily) {
                storeField('fontFamily', { fontFamily: undefined });
                return;
              }
              const nextEntry = getTypographyFontEntry(fontFamily) ?? defaultEntry;
              const nextWeight = getTypographySupportedWeight(nextEntry?.id, requestedWeight);
              storeField('fontFamily', { fontFamily, weight: nextWeight });
            }}
          >
            <option value="">{copy.defaultFont}</option>
            {selectedFontId && !selectedEntry && <option value={selectedFontId} disabled>{copy.unavailableFont}</option>}
            {showCurrentFontOption && selectedEntry && (
              <option value={selectedEntry.id} disabled>
                {selectedEntry.family} · {!itemOverride?.fontFamily && inheritedOverride?.fontFamily ? `${copy.inheritedFont} · ` : ''}{selectedEntry.supportedScripts.map((supported) => copy.scripts[supported]).join(' · ')}
              </option>
            )}
            {options.filter((font) => !showCurrentFontOption || font.id !== selectedFontId).map((font) => (
              <option key={font.id} value={font.id} disabled={!font.supportedScripts.includes(script)}>
                {font.family} · {!itemOverride?.fontFamily && inheritedOverride?.fontFamily === font.id ? `${copy.inheritedFont} · ` : ''}{font.supportedScripts.map((supported) => copy.scripts[supported]).join(' · ')}
              </option>
            ))}
          </select>
          {selectedEntry && (
            <small className={styles.fontSupport}>{copy.supports}: {selectedEntry.supportedScripts.map((supported) => copy.scripts[supported]).join(' · ')}</small>
          )}
          {selectedFontId && !selectedEntry && <small className={styles.fontNotice} role="status">{copy.missing}</small>}
          {selectedFontId && selectedEntry && !selectedFontSupportsScript && <small className={styles.fontNotice} role="status">{copy.fallback}</small>}
        </label>

        <label className={styles.rangeField}>
          <span>{copy.size} <output>{sizePercent}%</output></span>
          <small>{copy.sizeHelp}</small>
          <input
            type="range"
            min={minimumSizePercent}
            max={maximumSizePercent}
            step={1}
            value={sizePercent}
            aria-label={`${item.label}: ${copy.size}`}
            aria-valuetext={`${sizePercent}%`}
            {...rangeGroupHandlers(item, 'sizePercent')}
            onChange={(event) => changeSize(Number(event.currentTarget.value))}
          />
        </label>
      </div>

      <details className={styles.advanced}>
        <summary>{copy.advanced}</summary>
        <div className={styles.advancedBody}>
          <label className={styles.rangeField}>
            <span>{copy.weight} <output>{weight}</output></span>
            {supportedWeights && supportedWeights.length > 1 ? (
              <select
                aria-label={`${item.label}: ${copy.weight}`}
                value={weight}
                onFocus={() => beginGroup(item.id, 'weight')}
                onBlur={() => endGroup(item.id, 'weight')}
                onChange={(event) => storeField('weight', { weight: Number(event.currentTarget.value) })}
              >
                {supportedWeights.map((supported) => <option key={supported} value={supported}>{supported}</option>)}
              </select>
            ) : (
              <input
                type="range"
                min={effectiveWeightRange[0]}
                max={effectiveWeightRange[1]}
                step={1}
                value={weight}
                aria-label={`${item.label}: ${copy.weight}`}
                aria-valuetext={String(weight)}
                disabled={effectiveWeightRange[0] === effectiveWeightRange[1]}
                {...rangeGroupHandlers(item, 'weight')}
                onChange={(event) => storeField('weight', { weight: Number(event.currentTarget.value) })}
              />
            )}
          </label>

          <label className={styles.rangeField}>
            <span>{copy.tracking} <output>{tracking.toFixed(2)}em</output></span>
            <input
              type="range"
              min={minimumTracking}
              max={maximumTracking}
              step={0.005}
              value={tracking}
              aria-label={`${item.label}: ${copy.tracking}`}
              aria-valuetext={`${tracking.toFixed(2)}em`}
              {...rangeGroupHandlers(item, 'trackingEm')}
              onChange={(event) => storeField('trackingEm', { trackingEm: Number(event.currentTarget.value) - inheritedTracking })}
            />
          </label>
          {hasInheritedOverride && (
            <button
              type="button"
              className={styles.reset}
              onClick={() => resetLegacyTypographyRole(item.role)}
            >{copy.resetInheritedRole(copy.roles[item.role])}</button>
          )}
        </div>
      </details>

      {hasItemOverride && (
        <button
          type="button"
          className={styles.reset}
          onClick={() => editorStore.getState().resetTextTypographyOverride(item.id, { groupId: `text-typography-reset:${item.id}` })}
        >{copy.reset}</button>
      )}
    </section>
  );
}

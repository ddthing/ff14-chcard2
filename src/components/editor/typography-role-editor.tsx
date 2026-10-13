'use client';

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { CardTypographyOverride } from '@/components/cards/types';
import type { CardTextItem } from '@/lib/card-text-editing';
import {
  detectTypographyScript,
  getMasterTypographyFamily,
  getMasterTypographyTreatment,
  getTypographyFontEntry,
  getTypographyFontIdForStack,
  getTypographyFontOptions,
  getTypographyScriptsForText,
  getTypographySupportedWeight,
  isSelectableTypographyFontId,
} from '@/lib/typography-presets';
import type { Locale } from '@/lib/types';
import { applyTypographyGroupOverrides, resetLegacyTypographyRole, resetTypographyGroupOverrides } from '@/components/editor/text-editor/card-text-actions';
import { editorStore, useEditorStore } from '@/store/editor-store';
import { getInformationTypographyItems, getTypographyGroupPrimaryScript, isIndividualTypographyItem } from '@/components/editor/text-editor/card-text-model';
import { getEditorCopy } from '@/components/editor/copy';
import styles from './typography-role-editor.module.css';

const COPY = {
  ko: {
    title: '텍스트 스타일', font: '글꼴', size: '크기', weight: '굵기', tracking: '자간', advanced: '세부 조정',
    reset: '이 항목 스타일 초기화', defaultFont: '기본 글꼴', unavailableFont: '저장된 글꼴 (사용할 수 없음)',
    resetInheritedRole: (role: string) => `${role} 그룹의 저장 스타일 초기화`,
    fallback: '이 글꼴은 선택한 문자를 지원하지 않아 카드 기본 글꼴로 표시됩니다.',
    groupFallback: '지원하지 않는 문자는 카드 기본 서체를 사용합니다.',
    missing: '저장된 글꼴을 찾을 수 없어 카드 기본 글꼴로 표시됩니다.',
    hidden: '저장된 글꼴은 새 선택 목록에서 숨겨져 있으며, 바꾸기 전까지 유지됩니다.',
    roles: { display: '이름', secondaryDisplay: '소개', job: '직업', information: '정보 값', label: '레이블', caption: '캡션', micro: '짧은 문구' },
  },
  en: {
    title: 'Text style', font: 'Font family', size: 'Size', weight: 'Weight', tracking: 'Letter spacing', advanced: 'Advanced',
    reset: 'Reset item style', defaultFont: 'Default font', unavailableFont: 'Saved font (unavailable)',
    resetInheritedRole: (role: string) => `Reset saved ${role.toLowerCase()} group style`,
    fallback: 'This font does not support the selected script; the card uses its fallback font.',
    groupFallback: 'Unsupported characters keep the card’s default font.',
    missing: 'The saved font is unavailable; the card uses its fallback font.',
    hidden: 'This saved font is hidden from new choices and remains saved until replaced.',
    roles: { display: 'Name', secondaryDisplay: 'Bio', job: 'Job', information: 'Information', label: 'Label', caption: 'Caption', micro: 'Short phrase' },
  },
  ja: {
    title: 'テキストスタイル', font: 'フォント', size: 'サイズ', weight: '太さ', tracking: '文字間隔', advanced: '詳細設定',
    reset: 'この項目のスタイルをリセット', defaultFont: '標準フォント', unavailableFont: '保存済みフォント（利用不可）',
    resetInheritedRole: (role: string) => `保存済みの${role}グループスタイルをリセット`,
    fallback: 'このフォントは選択した文字に対応していません。カードの代替フォントを使います。',
    groupFallback: '対応していない文字はカードの標準フォントを使います。',
    missing: '保存済みのフォントが見つからないため、カードの代替フォントを使います。',
    hidden: '保存済みフォントは新しい選択肢に表示されず、置き換えるまで保存されます。',
    roles: { display: '名前', secondaryDisplay: '紹介文', job: 'ジョブ', information: '情報', label: 'ラベル', caption: 'キャプション', micro: '短い文言' },
  },
} as const;

type EditableField = 'fontFamily' | 'sizePercent' | 'weight' | 'trackingEm';
const LEGACY_FONT_VALUE = '__saved-font__';
const EXISTING_GROUP_VALUE = '__existing-settings__';
const DEFAULT_FONT_VALUE = '__default-font__';

function getFontLabel(family: string): string {
  return family.replace(/\s+Variable$/u, '');
}

function copyOverride(current: CardTypographyOverride | undefined, patch: Partial<CardTypographyOverride>): CardTypographyOverride {
  const next = { ...(current ?? {}), ...patch };
  for (const key of Object.keys(next) as Array<keyof CardTypographyOverride>) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

function updateItemOverride(item: CardTextItem, current: CardTypographyOverride | undefined, patch: Partial<CardTypographyOverride>, groupId?: string) {
  const next = copyOverride(current, patch);
  const state = editorStore.getState();
  const options = groupId ? { groupId } : undefined;
  if (Object.keys(next).length > 0) state.setTextTypographyOverride(item.id, next, options);
  else state.resetTextTypographyOverride(item.id, options);
}

function beginGroup(targetId: string, field: EditableField) {
  editorStore.getState().beginHistoryGroup(`text-typography:${targetId}:${field}`, 'design');
}

function endGroup(targetId: string, field: EditableField) {
  const state = editorStore.getState();
  if (state.history.groupId === `text-typography:${targetId}:${field}`) state.endHistoryGroup();
}

function rangeGroupHandlers(targetId: string, field: EditableField) {
  const start = () => beginGroup(targetId, field);
  const finish = () => endGroup(targetId, field);
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

export function TypographyRoleEditor({
  locale,
  item,
  informationItems = [],
  children,
}: {
  locale: Locale;
  item: CardTextItem | null;
  informationItems?: readonly CardTextItem[];
  children?: ReactNode;
}) {
  const copy = COPY[locale];
  const editorCopy = getEditorCopy(locale);
  const template = useEditorStore((state) => state.design.template);
  const textTypography = useEditorStore((state) => state.design.textTypography);
  const inheritedTypography = useEditorStore((state) => state.design.typography);
  const options = getTypographyFontOptions();

  if (!item) return null;
  const selectedItem = item;
  const informationGroup = selectedItem.category === 'information' && !isIndividualTypographyItem(selectedItem);
  if (!informationGroup && !isIndividualTypographyItem(selectedItem)) return null;

  const targets = informationGroup
    ? getInformationTypographyItems(informationItems.length > 0 ? informationItems : [selectedItem])
    : [selectedItem];
  const typographyTargetId = informationGroup ? 'information' : selectedItem.id;
  const itemOverride = informationGroup ? undefined : textTypography?.[selectedItem.id];
  const inheritedOverride = informationGroup ? undefined : inheritedTypography?.[selectedItem.role];

  const localeScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const script = detectTypographyScript(item.value || item.defaultValue, localeScript);
  const family = getMasterTypographyFamily(template);
  const treatment = getMasterTypographyTreatment(family, item.role, script);
  const defaultFontId = informationGroup ? undefined : getTypographyFontIdForStack(treatment.fontFamily, script);
  const groupFontIds = informationGroup ? targets.map((target) => textTypography?.[target.id]?.fontFamily ?? '') : [];
  const groupHasExplicitFont = groupFontIds.some(Boolean);
  const groupHasMixedFonts = informationGroup && groupHasExplicitFont && groupFontIds.some((fontId) => fontId !== groupFontIds[0]);
  const groupFontId = informationGroup && !groupHasMixedFonts ? groupFontIds[0] : '';
  const selectedFontId = informationGroup ? groupFontId : itemOverride?.fontFamily ?? inheritedOverride?.fontFamily ?? '';
  const defaultEntry = defaultFontId ? getTypographyFontEntry(defaultFontId) : undefined;
  const requiredScripts = Array.from(new Set((informationGroup ? targets : [selectedItem]).flatMap((target) =>
    getTypographyScriptsForText(target.value || target.defaultValue, localeScript))));
  const groupPrimaryScript = getTypographyGroupPrimaryScript(requiredScripts, localeScript);
  const selectableOptions = options.filter((font) => informationGroup
    ? font.supportedScripts.includes(groupPrimaryScript)
    : requiredScripts.every((requiredScript) => font.supportedScripts.includes(requiredScript)) && font.id !== defaultFontId);
  const selectedEntry = selectedFontId ? getTypographyFontEntry(selectedFontId) : undefined;
  const effectiveEntry = selectedEntry ?? defaultEntry;
  const selectedFontSupportsScript = selectedEntry
    ? informationGroup
      ? selectedEntry.supportedScripts.includes(groupPrimaryScript)
      : requiredScripts.every((requiredScript) => selectedEntry.supportedScripts.includes(requiredScript))
    : false;
  const selectedFontHasScriptFallback = Boolean(selectedEntry && requiredScripts.some((requiredScript) => !selectedEntry.supportedScripts.includes(requiredScript)));
  const effectiveWeightRange = effectiveEntry?.axes.weight ?? [100, 900] as const;
  const supportedWeights = (effectiveEntry as (typeof effectiveEntry & { weights?: readonly number[] }) | undefined)?.weights;
  const requestedWeight = itemOverride?.weight ?? inheritedOverride?.weight ?? treatment.weight;
  const weight = getTypographySupportedWeight(effectiveEntry?.id, requestedWeight);
  const inheritedSizePercent = inheritedOverride?.sizePercent ?? 100;
  const localSizePercent = itemOverride?.sizePercent ?? 100;
  const individualMinimumSizePercent = Math.round(inheritedSizePercent * 0.75);
  const individualMaximumSizePercent = Math.round(inheritedSizePercent * 1.25);
  const groupSizeValues = informationGroup
    ? targets.map((target) => textTypography?.[target.id]?.sizePercent ?? 100)
    : [];
  const groupHasMixedSizes = informationGroup && groupSizeValues.some((size) => size !== groupSizeValues[0]);
  const sizePercent = informationGroup
    ? groupHasMixedSizes ? 100 : groupSizeValues[0] ?? 100
    : Math.min(individualMaximumSizePercent, Math.max(individualMinimumSizePercent, Math.round(inheritedSizePercent * localSizePercent / 100)));
  const minimumSizePercent = informationGroup ? 75 : individualMinimumSizePercent;
  const maximumSizePercent = informationGroup ? 125 : individualMaximumSizePercent;
  const inheritedTracking = inheritedOverride?.trackingEm ?? 0;
  const localTracking = itemOverride?.trackingEm ?? 0;
  const minimumTracking = inheritedTracking - 0.12;
  const maximumTracking = inheritedTracking + 0.2;
  const tracking = Math.min(maximumTracking, Math.max(minimumTracking, inheritedTracking + localTracking));
  const hasItemOverride = Boolean(itemOverride && Object.values(itemOverride).some((value) => value !== undefined));
  const hasInheritedOverride = Boolean(inheritedOverride && Object.values(inheritedOverride).some((value) => value !== undefined));
  const hasInformationOverrides = informationGroup && targets.some((target) => Boolean(textTypography?.[target.id]));
  const selectedEntryIsSelectable = selectedEntry ? isSelectableTypographyFontId(selectedEntry.id) : true;
  const selectedFontIsLegacyUnavailable = Boolean(selectedFontId && selectedFontId !== defaultFontId
    && (!selectedEntry || !selectedEntryIsSelectable || !selectedFontSupportsScript));
  const defaultFontIsSelected = (!selectedFontId || selectedFontId === defaultFontId) && !selectedFontIsLegacyUnavailable;
  const defaultFontValue = defaultFontId ?? DEFAULT_FONT_VALUE;
  const selectValue = selectedFontIsLegacyUnavailable
    ? LEGACY_FONT_VALUE
    : informationGroup
      ? selectedFontId && !groupHasMixedFonts ? selectedFontId : EXISTING_GROUP_VALUE
      : defaultFontIsSelected ? defaultFontValue : selectedFontId;

  function storeField(field: EditableField, patch: Partial<CardTypographyOverride>) {
    updateItemOverride(selectedItem, itemOverride, patch, `text-typography:${typographyTargetId}:${field}`);
  }

  function changeSize(nextSizePercent: number) {
    if (informationGroup) {
      applyTypographyGroupOverrides(
        targets.map((target) => ({ id: target.id, patch: { sizePercent: nextSizePercent } })),
        `text-typography:${typographyTargetId}:sizePercent`,
      );
      return;
    }
    const safeInherited = inheritedSizePercent > 0 ? inheritedSizePercent : 100;
    storeField('sizePercent', { sizePercent: nextSizePercent / safeInherited * 100 });
  }

  function chooseIndividualFont(fontFamily: string | undefined) {
    const shouldOverrideInherited = !fontFamily
      && inheritedOverride?.fontFamily
      && inheritedOverride.fontFamily !== defaultFontId;
    const nextFontFamily = fontFamily ?? (shouldOverrideInherited ? defaultFontId : undefined);
    if ((nextFontFamily ?? '') === selectedFontId) return;

    if (!nextFontFamily) {
      storeField('fontFamily', { fontFamily: undefined });
      return;
    }

    const nextEntry = getTypographyFontEntry(nextFontFamily) ?? defaultEntry;
    const nextWeight = getTypographySupportedWeight(nextEntry?.id, requestedWeight);
    storeField('fontFamily', { fontFamily: nextFontFamily, weight: nextWeight });
  }

  function chooseInformationFont(fontId: string) {
    const nextEntry = getTypographyFontEntry(fontId);
    if (!nextEntry) return;
    const updates = targets.map((target) => {
      const targetScript = detectTypographyScript(target.value || target.defaultValue, localeScript);
      const targetTreatment = getMasterTypographyTreatment(family, target.role, targetScript);
      const inherited = inheritedTypography?.[target.role];
      const currentOverride = textTypography?.[target.id];
      const targetWeight = currentOverride?.weight ?? inherited?.weight ?? targetTreatment.weight;
      return {
        id: target.id,
        patch: {
          fontFamily: fontId,
          weight: getTypographySupportedWeight(nextEntry.id, targetWeight),
        },
      };
    });
    applyTypographyGroupOverrides(updates);
  }

  function handleFontChange(value: string) {
    if (value === LEGACY_FONT_VALUE || value === EXISTING_GROUP_VALUE) return;
    if (informationGroup) chooseInformationFont(value);
    else chooseIndividualFont(value === defaultFontValue ? undefined : value);
  }

  return (
    <section
      className={styles.panel}
      data-text-typography-editor={informationGroup ? 'information-group' : item.id}
      aria-label={informationGroup
        ? `${copy.title}: ${editorCopy.textEditor.informationTypography}`
        : `${copy.title}: ${item.label} · ${copy.roles[item.role]}`}
    >
      {children && <div className={styles.contentControls}>{children}</div>}

      {informationGroup && (
        <div className={styles.groupHeading}>
          <strong>{editorCopy.textEditor.informationTypography}</strong>
          <small>{editorCopy.textEditor.informationScope}</small>
        </div>
      )}

      <div className={styles.primaryControls}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.font}</span>
          <select
            className={styles.fontSelect}
            data-text-font-family={informationGroup ? undefined : item.id}
            aria-label={`${informationGroup ? editorCopy.textEditor.informationTypography : item.label}: ${copy.font}`}
            value={selectValue}
            onFocus={() => beginGroup(typographyTargetId, 'fontFamily')}
            onBlur={() => endGroup(typographyTargetId, 'fontFamily')}
            onChange={(event) => handleFontChange(event.currentTarget.value)}
          >
            {informationGroup ? (
              <option value={EXISTING_GROUP_VALUE} disabled>{editorCopy.textEditor.existingSettings}</option>
            ) : (
              <option value={defaultFontValue}>
                {copy.defaultFont}{defaultEntry ? ` · ${getFontLabel(defaultEntry.family)}` : ''}
              </option>
            )}
            {selectedFontIsLegacyUnavailable && (
              <option value={LEGACY_FONT_VALUE} disabled>
                {selectedEntry ? getFontLabel(selectedEntry.family) : copy.unavailableFont}
              </option>
            )}
            {selectableOptions.map((font) => <option key={font.id} value={font.id}>{getFontLabel(font.family)}</option>)}
          </select>
          {selectedFontId && !selectedEntry && <small className={styles.fontNotice} role="status">{copy.missing}</small>}
          {selectedFontId && selectedEntry && !selectedEntryIsSelectable && <small className={styles.fontNotice} role="status">{copy.hidden}</small>}
          {selectedFontId && selectedEntry && informationGroup && selectedFontHasScriptFallback && <small className={styles.fontNotice} role="status">{copy.groupFallback}</small>}
          {selectedFontId && selectedEntry && !informationGroup && !selectedFontSupportsScript && <small className={styles.fontNotice} role="status">{copy.fallback}</small>}
        </label>

        <label className={`${styles.rangeField} ${styles.sizeField}`}>
          <span>{copy.size} <output>{groupHasMixedSizes ? editorCopy.textEditor.existingSettings : `${sizePercent}%`}</output></span>
          <input
            type="range"
            min={minimumSizePercent}
            max={maximumSizePercent}
            step={1}
            value={sizePercent}
            aria-label={`${informationGroup ? editorCopy.textEditor.informationTypography : item.label}: ${copy.size}`}
            aria-valuetext={groupHasMixedSizes ? editorCopy.textEditor.existingSettings : `${sizePercent}%`}
            {...rangeGroupHandlers(typographyTargetId, 'sizePercent')}
            onChange={(event) => changeSize(Number(event.currentTarget.value))}
          />
        </label>
      </div>

      {!informationGroup && (
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
                  {...rangeGroupHandlers(item.id, 'weight')}
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
                {...rangeGroupHandlers(item.id, 'trackingEm')}
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
      )}

      {informationGroup && hasInformationOverrides && (
        <button
          type="button"
          className={styles.reset}
          onClick={() => resetTypographyGroupOverrides(targets.map((target) => target.id))}
        >{editorCopy.textEditor.resetInformationTypography}</button>
      )}

      {!informationGroup && hasItemOverride && (
        <button
          type="button"
          className={styles.reset}
          onClick={() => editorStore.getState().resetTextTypographyOverride(item.id, { groupId: `text-typography-reset:${item.id}` })}
        >{copy.reset}</button>
      )}
    </section>
  );
}

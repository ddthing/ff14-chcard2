'use client';

import { useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CardTypographyOverride, CardTypographyRole, CardTypographyOverrides } from '@/components/cards/types';
import { getTypographyFontOptions, getTypographyFontIdForStack, getTypographyFontStackForId, getTypographySupportedWeight, getMasterTypographyFamily, getMasterTypographyTreatment } from '@/lib/typography-presets';
import type { Locale } from '@/lib/types';
import { editorStore, useEditorStore } from '@/store/editor-store';
import styles from './typography-role-editor.module.css';

const ROLES: readonly CardTypographyRole[] = [
  'display', 'secondaryDisplay', 'job', 'information', 'label', 'caption', 'micro',
];

const COPY = {
  ko: {
    title: '서체 세부 편집', role: '텍스트 그룹', font: '글꼴', size: '크기', weight: '굵기', spacing: '자간',
    reset: '그룹 초기화', defaultFont: '카드 기본 글꼴', preview: '미리보기', sizeHelp: '카드 기본 크기 기준', fontSupport: '지원 문자',
    roles: { display: '이름', secondaryDisplay: '소개', job: '직업', information: '정보 값', label: '레이블', caption: '캡션', micro: '짧은 문구' },
  },
  en: {
    title: 'Fine tune typography', role: 'Text group', font: 'Font family', size: 'Size', weight: 'Weight', spacing: 'Letter spacing',
    reset: 'Reset group', defaultFont: 'Card default', preview: 'Preview', sizeHelp: 'Relative to the card default', fontSupport: 'Supports',
    roles: { display: 'Name', secondaryDisplay: 'Story', job: 'Job', information: 'Information', label: 'Labels', caption: 'Captions', micro: 'Microcopy' },
  },
  ja: {
    title: '文字を細かく調整', role: 'テキストグループ', font: 'フォント', size: 'サイズ', weight: '太さ', spacing: '文字間隔',
    reset: 'グループをリセット', defaultFont: 'カードの標準', preview: 'プレビュー', sizeHelp: 'カードの標準サイズを基準', fontSupport: '対応文字',
    roles: { display: '名前', secondaryDisplay: '紹介文', job: 'ジョブ', information: '情報', label: 'ラベル', caption: 'キャプション', micro: '短い文言' },
  },
} as const;

const SCRIPT_LABELS = {
  ko: { latin: '영문', korean: '한글', japanese: '일본어' },
  en: { latin: 'Latin', korean: 'Korean', japanese: 'Japanese' },
  ja: { latin: 'ラテン', korean: '韓国語', japanese: '日本語' },
} as const;

function fontOptionLabel(font: ReturnType<typeof getTypographyFontOptions>[number], locale: Locale): string {
  const scripts = font.supportedScripts.map((script) => SCRIPT_LABELS[locale][script]).join(' · ');
  return `${font.family} · ${scripts}`;
}

function getSample(role: CardTypographyRole, name: string, bio: string, job: string, locale: Locale): string {
  const local = {
    ko: { display: '모험가 이름', secondaryDisplay: '여정의 기록', job: '백마도사', information: '초코보 · 달빛회사', label: '월드 · 레벨', caption: '새로운 여정이 시작됩니다', micro: 'XIV · 기록' },
    en: { display: 'Adventurer Name', secondaryDisplay: 'A note from the journey', job: 'White Mage', information: 'Chocobo · Moonlit', label: 'WORLD · LEVEL', caption: 'A new journey begins', micro: 'XIV · RECORD' },
    ja: { display: '冒険者の名前', secondaryDisplay: '旅の記録', job: '白魔道士', information: 'チョコボ · 月影', label: 'ワールド · レベル', caption: '新しい旅が始まる', micro: 'XIV · 記録' },
  }[locale];

  if (role === 'display' && name.trim()) return name;
  if (role === 'secondaryDisplay' && bio.trim()) return bio;
  if (role === 'job' && job.trim()) return job;
  return local[role];
}

function updateOverride(
  current: CardTypographyOverrides | undefined,
  role: CardTypographyRole,
  patch: Partial<CardTypographyOverride>,
) {
  const next = Object.fromEntries(Object.entries(current ?? {}).map(([key, value]) => [key, { ...value }])) as CardTypographyOverrides;
  const roleOverride = { ...(next[role] ?? {}), ...patch };
  for (const key of Object.keys(roleOverride) as Array<keyof CardTypographyOverride>) {
    if (roleOverride[key] === undefined) delete roleOverride[key];
  }
  if (Object.keys(roleOverride).length > 0) next[role] = roleOverride;
  else delete next[role];
  editorStore.getState().setDesign({ typography: Object.keys(next).length > 0 ? next : undefined });
}

function beginGroup(role: CardTypographyRole, field: string) {
  editorStore.getState().beginHistoryGroup(`typography:${role}:${field}`, 'design');
}

function rangeGroupHandlers(role: CardTypographyRole, field: string) {
  const start = () => beginGroup(role, field);
  const finish = () => editorStore.getState().endHistoryGroup();
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

function textValue(event: ChangeEvent<HTMLSelectElement>): string {
  return event.currentTarget.value;
}

export function TypographyRoleEditor({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const template = useEditorStore((state) => state.design.template);
  const layoutVariant = useEditorStore((state) => state.design.layoutVariant);
  const overrides = useEditorStore((state) => state.design.typography);
  const character = useEditorStore((state) => state.character);
  const [activeRole, setActiveRole] = useState<CardTypographyRole>('display');
  const [isOpen, setIsOpen] = useState(false);
  const fonts = getTypographyFontOptions();

  if (layoutVariant !== 'a') return null;

  const roleOverride = overrides?.[activeRole] ?? {};
  const sample = getSample(activeRole, character.name, character.bio, character.job, locale);
  const localeScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const treatmentFamily = getMasterTypographyFamily(template);
  const script = activeRole === 'display' || activeRole === 'job' || activeRole === 'secondaryDisplay'
    ? (/[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(sample) ? 'korean' : /[ぁ-ヿ]/u.test(sample) ? 'japanese' : localeScript)
    : localeScript;
  const treatment = getMasterTypographyTreatment(treatmentFamily, activeRole, script);
  const defaultFontId = getTypographyFontIdForStack(treatment.fontFamily, script);
  const displayedFontId = roleOverride.fontFamily ?? '';
  const selectedFontOption = fonts.find((font) => font.id === displayedFontId);
  const weightFont = selectedFontOption
    ?? fonts.find((font) => font.id === defaultFontId);
  const weightRange = weightFont?.weightRange ?? [100, 900] as const;
  const supportedWeights = weightFont?.weights ?? (weightRange[0] === weightRange[1] ? [weightRange[0]] : undefined);
  const requestedWeight = roleOverride.weight ?? treatment.weight;
  const weight = getTypographySupportedWeight(weightFont?.id, requestedWeight);
  const sizePercent = roleOverride.sizePercent ?? 100;
  const spacing = roleOverride.trackingEm ?? 0;
  const sampleFont = getTypographyFontStackForId(displayedFontId || defaultFontId, script, treatment.fontFamily);
  const hasOverride = Boolean(overrides?.[activeRole] && Object.keys(overrides[activeRole] ?? {}).length);

  return (
    <details
      className={styles.panel}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className={styles.summary}>
        <span>{copy.title}</span>
        <strong>{copy.roles[activeRole]}</strong>
      </summary>
      {isOpen && (
        <div className={styles.body}>
          <div className={styles.rolePicker} role="group" aria-label={copy.role}>
            {ROLES.map((role) => (
              <button
                type="button"
                key={role}
                aria-pressed={activeRole === role}
                onClick={() => setActiveRole(role)}
              >
                {copy.roles[role]}
              </button>
            ))}
          </div>

          <label className={styles.field}>
            <span>{copy.font}</span>
            <span className={styles.selectWrap}>
              <select
                value={displayedFontId}
                onChange={(event) => {
                  const fontFamily = textValue(event) || undefined;
                  const nextFont = fonts.find((font) => font.id === fontFamily);
                  const nextWeightFont = nextFont ?? fonts.find((font) => font.id === defaultFontId);
                  const nextWeight = getTypographySupportedWeight(nextWeightFont?.id, requestedWeight);
                  updateOverride(overrides, activeRole, { fontFamily, weight: nextWeight });
                }}
              >
                <option value="">{copy.defaultFont}</option>
                {fonts.map((font) => <option key={font.id} value={font.id}>{fontOptionLabel(font, locale)}</option>)}
              </select>
              <span className={styles.selectChevron} aria-hidden="true" />
            </span>
            {selectedFontOption && (
              <small className={styles.fontSupport}>
                {copy.fontSupport}: {selectedFontOption.supportedScripts.map((supported) => SCRIPT_LABELS[locale][supported]).join(' · ')}
              </small>
            )}
          </label>

          <div className={styles.preview} aria-label={copy.preview}>
            <span>{copy.preview}</span>
            <strong style={{ fontFamily: sampleFont, fontSize: `${Math.min(125, Math.max(75, sizePercent))}%`, fontWeight: weight, letterSpacing: `${spacing}em` }}>
              {sample}
            </strong>
          </div>

          <label className={styles.rangeField}>
            <span>{copy.size} <output>{Math.round(sizePercent)}%</output></span>
            <small>{copy.sizeHelp}</small>
            <input
              type="range"
              min={75}
              max={125}
              step={1}
              value={sizePercent}
              aria-label={`${copy.roles[activeRole]}: ${copy.size}`}
              aria-valuetext={`${sizePercent}%`}
              {...rangeGroupHandlers(activeRole, 'size')}
              onChange={(event) => updateOverride(overrides, activeRole, { sizePercent: Number(event.currentTarget.value) })}
            />
          </label>

          <label className={styles.rangeField}>
            <span>{copy.weight} <output>{weight}</output></span>
            {supportedWeights && supportedWeights.length > 1 ? (
              <span className={styles.selectWrap}>
                <select
                  value={weight}
                  aria-label={`${copy.roles[activeRole]}: ${copy.weight}`}
                  onChange={(event) => updateOverride(overrides, activeRole, { weight: Number(event.currentTarget.value) })}
                >
                  {supportedWeights.map((supported) => <option key={supported} value={supported}>{supported}</option>)}
                </select>
                <span className={styles.selectChevron} aria-hidden="true" />
              </span>
            ) : (
              <input
                type="range"
                min={weightRange[0]}
                max={weightRange[1]}
                step={1}
                value={weight}
                aria-label={`${copy.roles[activeRole]}: ${copy.weight}`}
                aria-valuetext={String(weight)}
                disabled={weightRange[0] === weightRange[1]}
                {...rangeGroupHandlers(activeRole, 'weight')}
                onChange={(event) => updateOverride(overrides, activeRole, { weight: Number(event.currentTarget.value) })}
              />
            )}
          </label>

          <label className={styles.rangeField}>
            <span>{copy.spacing} <output>{spacing.toFixed(2)}em</output></span>
            <input
              type="range"
              min={-0.12}
              max={0.2}
              step={0.005}
              value={spacing}
              aria-label={`${copy.roles[activeRole]}: ${copy.spacing}`}
              aria-valuetext={`${spacing.toFixed(2)}em`}
              {...rangeGroupHandlers(activeRole, 'spacing')}
              onChange={(event) => updateOverride(overrides, activeRole, { trackingEm: Number(event.currentTarget.value) })}
            />
          </label>

          <button
            type="button"
            className={styles.reset}
            disabled={!hasOverride}
            onClick={() => updateOverride(overrides, activeRole, {
              fontFamily: undefined,
              sizePercent: undefined,
              weight: undefined,
              trackingEm: undefined,
            })}
          >
            {copy.reset}
          </button>
        </div>
      )}
    </details>
  );
}

'use client';

import { useEffect, useId, useRef } from 'react';
import {
  CARD_TEXTURE_EFFECTS,
  getCardTextureEffectIntensity,
  type CardTextureEffect,
  type CardTextureEffectIntensity,
} from '@/lib/card-texture-effects';
import styles from './TextureEffects.module.css';

type TextureEffectsLocale = 'ko' | 'en' | 'ja';

interface TextureEffectCopy {
  group: string;
  strength: string;
  effects: Record<CardTextureEffect, { label: string; detail: string }>;
}

const COPY: Record<TextureEffectsLocale, TextureEffectCopy> = {
  ko: {
    group: '인쇄 질감 효과',
    strength: '강도',
    effects: {
      xerox: { label: '제록스', detail: '사진의 농담을 거친 복사 인쇄로 표현' },
      halftone: { label: '하프톤', detail: '사진의 색과 명암을 크기가 다른 망점으로 표현' },
      distressed: { label: '디스트레스', detail: '사진 속 잉크가 닳고 벗겨진 인쇄 질감' },
    },
  },
  en: {
    group: 'Print textures',
    strength: 'Strength',
    effects: {
      xerox: { label: 'Xerox', detail: 'Rough toner and broken ink density from the photo' },
      halftone: { label: 'Halftone', detail: 'Colored dots sized by the photo’s tones' },
      distressed: { label: 'Distressed', detail: 'Worn ink and irregular paper breaks in the image' },
    },
  },
  ja: {
    group: '印刷の質感',
    strength: '強さ',
    effects: {
      xerox: { label: 'ゼロックス', detail: '写真の濃淡を粗いトナーで表現' },
      halftone: { label: '網点', detail: '写真の色と濃淡を大きさの違う網点で表現' },
      distressed: { label: 'ディストレス', detail: '写真のインクが摩耗し、かすれた印刷の質感' },
    },
  },
};

const RANGE_ADJUSTMENT_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

export interface TextureEffectsProps {
  locale: TextureEffectsLocale;
  effects: readonly string[];
  effectIntensity?: CardTextureEffectIntensity | Record<string, number>;
  onToggle: (effect: CardTextureEffect) => void;
  onIntensityChange: (effect: CardTextureEffect, intensity: number) => void;
  onInteractionStart: (effect: CardTextureEffect) => void;
  onInteractionEnd: (effect: CardTextureEffect) => void;
}

export function TextureEffects({
  locale,
  effects,
  effectIntensity,
  onToggle,
  onIntensityChange,
  onInteractionStart,
  onInteractionEnd,
}: TextureEffectsProps) {
  const copy = COPY[locale];
  const idPrefix = useId();
  const activeInteraction = useRef<CardTextureEffect | null>(null);
  const interactionEnd = useRef(onInteractionEnd);

  useEffect(() => {
    interactionEnd.current = onInteractionEnd;
  }, [onInteractionEnd]);

  const beginInteraction = (effect: CardTextureEffect) => {
    if (activeInteraction.current === effect) return;
    if (activeInteraction.current) interactionEnd.current(activeInteraction.current);
    activeInteraction.current = effect;
    onInteractionStart(effect);
  };

  const endInteraction = (effect: CardTextureEffect) => {
    if (activeInteraction.current !== effect) return;
    activeInteraction.current = null;
    interactionEnd.current(effect);
  };

  useEffect(() => () => {
    if (activeInteraction.current) interactionEnd.current(activeInteraction.current);
    activeInteraction.current = null;
  }, []);

  return (
    <div className={styles.group} role="group" aria-label={copy.group}>
      <div className={styles.effects}>
        {CARD_TEXTURE_EFFECTS.map((effect) => {
          const selected = effects.includes(effect);
          const labelId = `${idPrefix}-${effect}-label`;
          const descriptionId = `${idPrefix}-${effect}-description`;
          const rangeId = `${idPrefix}-${effect}-strength`;
          const intensity = getCardTextureEffectIntensity(effectIntensity, effect);
          const label = copy.effects[effect].label;

          return (
            <div className={styles.effectControl} key={effect}>
              <button
                type="button"
                className={styles.toggleRow}
                role="switch"
                aria-checked={selected}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                onClick={() => onToggle(effect)}
              >
                <span className={`${styles.sample} ${styles[effect]}`} aria-hidden="true" />
                <span className={styles.effectCopy}>
                  <strong id={labelId}>{label}</strong>
                  <small id={descriptionId}>{copy.effects[effect].detail}</small>
                </span>
                <span className={styles.switchTrack} data-state={selected ? 'on' : 'off'} aria-hidden="true">
                  <span />
                </span>
              </button>
              <div className={styles.strength}>
                <label htmlFor={rangeId}>
                  <span>{copy.strength}</span>
                  <output htmlFor={rangeId}>{intensity}%</output>
                </label>
                <input
                  id={rangeId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={intensity}
                  disabled={!selected}
                  aria-label={`${label}: ${copy.strength}`}
                  aria-valuetext={`${intensity}%`}
                  onPointerDown={() => beginInteraction(effect)}
                  onPointerUp={() => endInteraction(effect)}
                  onPointerCancel={() => endInteraction(effect)}
                  onKeyDown={(event) => {
                    if (RANGE_ADJUSTMENT_KEYS.has(event.key) && !event.repeat) beginInteraction(effect);
                  }}
                  onKeyUp={(event) => {
                    if (RANGE_ADJUSTMENT_KEYS.has(event.key)) endInteraction(effect);
                  }}
                  onBlur={() => endInteraction(effect)}
                  onChange={(event) => onIntensityChange(effect, Number(event.currentTarget.value))}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

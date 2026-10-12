export const CARD_TEXTURE_EFFECTS = ['xerox', 'halftone', 'distressed'] as const;

/** Paint order runs from broad photocopy grain to the small worn print defects. */
export const CARD_TEXTURE_LAYER_ORDER = CARD_TEXTURE_EFFECTS;

export type CardTextureEffect = (typeof CARD_TEXTURE_EFFECTS)[number];

export type CardTextureEffectIntensity = Partial<Record<CardTextureEffect, number>>;

export const DEFAULT_CARD_TEXTURE_INTENSITY: Record<CardTextureEffect, number> = {
  xerox: 22,
  halftone: 18,
  distressed: 15,
};

const MIN_INTENSITY = 0;
const MAX_INTENSITY = 100;

export function normalizeCardTextureIntensity(value: unknown, effect: CardTextureEffect): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CARD_TEXTURE_INTENSITY[effect];
  }

  return Math.max(MIN_INTENSITY, Math.min(MAX_INTENSITY, Math.round(value)));
}

export function getCardTextureEffectIntensity(
  intensity: CardTextureEffectIntensity | Record<string, number> | undefined,
  effect: CardTextureEffect,
): number {
  return normalizeCardTextureIntensity(intensity?.[effect], effect);
}

export function toggleCardTextureEffect(
  effects: readonly string[],
  effect: CardTextureEffect,
): string[] {
  if (effects.includes(effect)) {
    return effects.filter((item) => item !== effect);
  }

  return [...effects, effect];
}

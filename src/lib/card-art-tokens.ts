import type { CardPalette } from '@/lib/palette';
import type { AdventurerCardTemplate, CardRatio } from '@/components/cards/types';
import { getCardMaterialStyleProperties, type CardMaterialStyleProperty } from '@/lib/card-materials';

export type CardArtFamily = AdventurerCardTemplate;
export type CardArtTone = 'light' | 'dark';

export interface MasterArtFamilyToken {
  /** Tonal base for the material surface; the actual color is palette-derived. */
  surfaceTone: CardArtTone;
  /** Palette channel that carries primary surface tint. */
  surfaceTint: keyof Pick<CardPalette, 'primary' | 'accent'>;
  surfaceTintStrength: number;
  inkTone: keyof Pick<CardPalette, 'light' | 'dark'>;
  accentTone: keyof Pick<CardPalette, 'light' | 'dark'>;
  mutedInkStrength: number;
  accentInkStrength: number;
  ruleStrength: number;
  /** Outer card corner value retained for the legacy layout A shell. */
  photoRadius: string;
  /** Fixed outer frame width; the identity stock keeps a one-pixel keyline. */
  frameRuleWidth: string;
  /** Safe inset used by the authored composition, expressed as a percentage. */
  margin: string;
  ruleWeight: string;
  metadataGap: string;
}

/** Palette and retained shell/material inputs shared by the Master families. */
export const MASTER_ART_TOKENS: Readonly<Record<CardArtFamily, Readonly<MasterArtFamilyToken>>> = {
  cinematic: {
    surfaceTone: 'dark',
    surfaceTint: 'primary',
    surfaceTintStrength: 8,
    inkTone: 'light',
    accentTone: 'light',
    mutedInkStrength: 73,
    accentInkStrength: 50,
    ruleStrength: 28,
    margin: '5.5%',
    photoRadius: '0',
    frameRuleWidth: '0',
    ruleWeight: 'calc(100cqi / 1080)',
    metadataGap: '1.4cqi',
  },
  editorial: {
    surfaceTone: 'light',
    surfaceTint: 'primary',
    surfaceTintStrength: 7,
    inkTone: 'dark',
    accentTone: 'dark',
    mutedInkStrength: 67,
    accentInkStrength: 54,
    ruleStrength: 25,
    margin: '6%',
    photoRadius: '0',
    frameRuleWidth: '0',
    ruleWeight: 'calc(100cqi / 1080)',
    metadataGap: '1.5cqi',
  },
  'id-card': {
    surfaceTone: 'light',
    surfaceTint: 'accent',
    surfaceTintStrength: 5,
    inkTone: 'dark',
    accentTone: 'dark',
    mutedInkStrength: 69,
    accentInkStrength: 44,
    ruleStrength: 31,
    margin: '5.8%',
    photoRadius: '0',
    frameRuleWidth: '1px',
    ruleWeight: 'calc(100cqi / 1080)',
    metadataGap: '1.6cqi',
  },
};

export type MasterArtProperty =
  | '--master-surface-tone'
  | '--master-ink'
  | '--master-muted-ink'
  | '--master-accent'
  | '--master-rule'
  | '--master-rule-weight'
  | '--master-margin'
  | '--master-metadata-gap'
  | '--master-photo-radius'
  | '--master-frame-rule-width';

export type MasterArtProperties = Record<MasterArtProperty, string> & Record<CardMaterialStyleProperty, string>;

function safeHex(value: string, fallback: string): string {
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/iu.test(value.trim()) ? value.trim() : fallback;
}

function mix(color: string, weight: number, other: string): string {
  return `color-mix(in srgb, ${color} ${weight}%, ${other})`;
}

/**
 * Resolve Master A surface, ink, line, spacing, and material properties from
 * the selected family and current user palette. No browser state is read or
 * changed, so previews and exports receive the same values.
 */
export function getMasterArtProperties(family: CardArtFamily, palette: CardPalette, ratio: CardRatio = '4:5'): MasterArtProperties {
  const token = MASTER_ART_TOKENS[family];
  const light = safeHex(palette.light, '#f2eee7');
  const dark = safeHex(palette.dark, '#211f22');
  const primary = safeHex(palette.primary, '#b99b72');
  const accent = safeHex(palette.accent, primary);
  const ink = token.inkTone === 'light' ? light : dark;
  const surface = token.surfaceTone === 'light' ? light : dark;
  const accentNeutral = token.accentTone === 'light' ? light : dark;

  return {
    '--master-surface-tone': mix(surface, 100 - token.surfaceTintStrength, paletteColor(token.surfaceTint, primary, accent)),
    '--master-ink': ink,
    '--master-muted-ink': mix(ink, token.mutedInkStrength, 'transparent'),
    '--master-accent': mix(accent, token.accentInkStrength, accentNeutral),
    '--master-rule': mix(ink, token.ruleStrength, 'transparent'),
    // One output pixel at 1x, two at 2x, four at 4x. The composition may
    // be previewed at any CSS width without changing the print weight.
    '--master-rule-weight': ratio === '16:9' ? 'calc(100cqi / 1920)' : token.ruleWeight,
    '--master-margin': token.margin,
    '--master-metadata-gap': token.metadataGap,
    '--master-photo-radius': token.photoRadius,
    '--master-frame-rule-width': token.frameRuleWidth,
    ...getCardMaterialStyleProperties(family),
  };
}

function paletteColor(
  channel: MasterArtFamilyToken['surfaceTint'],
  primary: string,
  accent: string,
): string {
  return channel === 'primary' ? primary : accent;
}

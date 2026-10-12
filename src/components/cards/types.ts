import type { CardPalette } from '@/lib/palette';
import type { FfxivServiceId, PhysicalRegionId } from '@/data/ffxiv';
import { conerSample, getConerScreenshotPresentation, type ConerScreenshotRole } from '@/data/samples/coner';

export type CardRatio = '1:1' | '4:5' | '3:4' | '9:16' | '16:9';

export type AdventurerCardTemplate = 'cinematic' | 'editorial' | 'id-card';
export type CardLayoutVariant = 'a' | 'b' | 'c';
export type CardTypographyPreset = 'editorial' | 'modern' | 'condensed' | 'classic' | 'clean';
export type CardColorMode = 'auto' | 'job' | 'custom';
export type CardDecorativeCopy = 'none' | 'default' | 'adventure' | 'companions';

export const CARD_TYPOGRAPHY_ROLES = [
  'display',
  'secondaryDisplay',
  'job',
  'information',
  'label',
  'caption',
  'micro',
] as const;

export type CardTypographyRole = (typeof CARD_TYPOGRAPHY_ROLES)[number];

/** Optional per-role overrides layered over the selected card typography preset. */
export interface CardTypographyOverride {
  /** Stable ID from the local font registry. */
  fontFamily?: string;
  /** Relative size in percent; 100 keeps the master’s designed size. */
  sizePercent?: number;
  weight?: number;
  /** Spacing adjustment in em, added to the master’s designed tracking. */
  trackingEm?: number;
}

export type CardTypographyOverrides = Partial<Record<CardTypographyRole, CardTypographyOverride>>;

export function isCardDecorativeCopy(value: unknown): value is CardDecorativeCopy {
  return value === 'none' || value === 'default' || value === 'adventure' || value === 'companions';
}

export interface AdventurerCardImageAdjustments {
  /** CSS object-position percentages. 50, 50 is centered. */
  x: number;
  y: number;
  /** Image scale multiplier. */
  scale: number;
  /** Rotation in degrees. */
  rotation: number;
  /** Brightness multiplier; 1 is neutral. */
  brightness: number;
  /** Contrast multiplier; 1 is neutral. */
  contrast: number;
  /** Saturation multiplier; 1 is neutral. */
  saturation: number;
  /** Exposure in EV; 0 is neutral. */
  exposure: number;
}

export interface AdventurerCardCharacter {
  /** Marks cards created from a user's own photo with intentionally blank profile data. */
  profileOrigin?: 'user';
  name: string;
  world: string;
  dataCenter: string;
  freeCompany: string;
  job: string;
  level: number;
  race: string;
  clan: string;
  grandCompany: string;
  languages: string[];
  playStyles: string[];
  bio: string;
  /** Canonical IDs are additive so Phase 2 display strings remain readable. */
  service?: FfxivServiceId | null;
  physicalRegionId?: PhysicalRegionId | null;
  dataCenterId?: string | null;
  worldId?: string | null;
  jobId?: string | null;
  raceId?: string | null;
  clanId?: string | null;
  grandCompanyId?: string | null;
}

export interface AdventurerCardDesign {
  template: AdventurerCardTemplate;
  ratio: CardRatio;
  layoutVariant: CardLayoutVariant;
  colorMode: CardColorMode;
  /** Show the selected job's standalone glyph on the card. Missing means visible for older drafts. */
  jobMotifVisible?: boolean;
  /** Explicit glyph tone; null inherits the card's family accent. */
  jobIconColor?: string | null;
  /** Optional localized decorative copy set; older data resolves to the default set. */
  decorativeCopy?: CardDecorativeCopy;
  palette: CardPalette;
  accentColor: string;
  typographyPreset: CardTypographyPreset;
  /** Optional editable typography overrides; older cards continue using typographyPreset. */
  typography?: CardTypographyOverrides;
  /** Kept for older card renderers and saved drafts. */
  imagePosition: string;
  /** Kept for older card renderers and saved drafts. */
  imageScale: number;
  effects: string[];
  /** Per-effect strength values, keyed by registered card texture effect ID. */
  effectIntensity?: Record<string, number>;
}

export interface AdventurerCardData {
  character: AdventurerCardCharacter;
  design: AdventurerCardDesign;
  imageUrl: string;
  imageAdjustments: AdventurerCardImageAdjustments;
}

const conerCardDesigns: Record<AdventurerCardTemplate, AdventurerCardDesign> = {
  cinematic: {
    template: 'cinematic',
    ratio: '4:5',
    layoutVariant: 'a',
    colorMode: 'auto',
    decorativeCopy: 'default',
    palette: { primary: '#1d2831', accent: '#c5a474', light: '#eee4d3', dark: '#101519' },
    accentColor: '#c5a474',
    typographyPreset: 'editorial',
    imagePosition: '50% 50%',
    imageScale: 1,
    effects: ['vignette', 'grain', 'xerox', 'halftone', 'distressed'],
  },
  editorial: {
    template: 'editorial',
    ratio: '4:5',
    layoutVariant: 'a',
    colorMode: 'auto',
    decorativeCopy: 'default',
    palette: { primary: '#ece0ca', accent: '#9a7652', light: '#fff8eb', dark: '#28211b' },
    accentColor: '#9a7652',
    typographyPreset: 'editorial',
    imagePosition: '50% 50%',
    imageScale: 1,
    effects: ['grain', 'xerox', 'halftone', 'distressed'],
  },
  'id-card': {
    template: 'id-card',
    ratio: '4:5',
    layoutVariant: 'a',
    colorMode: 'auto',
    decorativeCopy: 'default',
    palette: { primary: '#ece4d7', accent: '#8a7259', light: '#fffaf0', dark: '#332b23' },
    accentColor: '#8a7259',
    typographyPreset: 'condensed',
    imagePosition: '50% 50%',
    imageScale: 1,
    effects: ['xerox', 'halftone', 'distressed'],
  },
};

function copyConerCharacter(): AdventurerCardCharacter {
  return {
    ...conerSample.character,
    languages: [...conerSample.character.languages],
    playStyles: [...conerSample.character.playStyles],
  };
}

export function getConerSample(
  template: AdventurerCardTemplate,
  ratio: CardRatio,
  roleOverride?: ConerScreenshotRole,
): AdventurerCardData {
  const presentation = getConerScreenshotPresentation(template, ratio, roleOverride);
  return {
    character: copyConerCharacter(),
    design: {
      ...conerCardDesigns[template],
      ratio,
      palette: presentation.palette,
      accentColor: presentation.palette.accent,
      imagePosition: `${presentation.imageAdjustments.x}% ${presentation.imageAdjustments.y}%`,
      imageScale: presentation.imageAdjustments.scale,
    },
    imageUrl: presentation.imageUrl,
    imageAdjustments: presentation.imageAdjustments,
  };
}

export const demoAdventurerCards: Record<AdventurerCardTemplate, AdventurerCardData> = {
  cinematic: getConerSample('cinematic', '4:5'),
  editorial: getConerSample('editorial', '4:5'),
  'id-card': getConerSample('id-card', '4:5'),
};

export const demoAdventurerData = getConerSample('cinematic', '4:5', 'portrait');

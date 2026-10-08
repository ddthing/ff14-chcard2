import type { AdventurerCardTemplate } from '@/components/cards/types';

export type CardMaterialRole =
  | 'cinematic-film-grain'
  | 'editorial-paper-surface'
  | 'editorial-ink-density'
  | 'identity-matte-fiber';

export type CardMaterialStyleProperty =
  | `--material-${CardMaterialRole}-image`
  | `--material-${CardMaterialRole}-opacity`;

export interface CardMaterialAsset {
  readonly src: string;
  readonly opacity: number;
}

const SAFE_MATERIAL_FALLBACK: CardMaterialAsset = {
  src: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%201%201%22%3E%3C/svg%3E',
  opacity: 0,
};

const MATERIALS_BY_FAMILY: Readonly<Record<AdventurerCardTemplate, Partial<Record<CardMaterialRole, CardMaterialAsset>>>> = {
  cinematic: {
    'cinematic-film-grain': { src: '/images/materials/cinematic-film-grain.webp', opacity: 0.45 },
  },
  editorial: {
    'editorial-paper-surface': { src: '/images/materials/editorial-paper-surface.webp', opacity: 0.3 },
    'editorial-ink-density': { src: '/images/materials/editorial-ink-density.webp', opacity: 0.5 },
  },
  'id-card': {
    'identity-matte-fiber': { src: '/images/materials/identity-matte-fiber.webp', opacity: 0.3 },
  },
};

const MATERIAL_ROLES: readonly CardMaterialRole[] = [
  'cinematic-film-grain',
  'editorial-paper-surface',
  'editorial-ink-density',
  'identity-matte-fiber',
];

export interface ResolvedCardMaterial extends CardMaterialAsset {
  readonly role: CardMaterialRole;
}

/** Return one family's actual preloadable material roles. Unknown families are inert. */
export function getCardMaterialAssets(family: unknown): readonly ResolvedCardMaterial[] {
  if (typeof family !== 'string' || !Object.prototype.hasOwnProperty.call(MATERIALS_BY_FAMILY, family)) return [];

  const familyMaterials = MATERIALS_BY_FAMILY[family as AdventurerCardTemplate];
  return MATERIAL_ROLES.flatMap((role) => {
    const asset = familyMaterials[role];
    return asset ? [{ role, ...asset }] : [];
  });
}

/** Missing family/role combinations resolve to a transparent data image. */
export function resolveCardMaterial(family: unknown, role: unknown): CardMaterialAsset {
  if (typeof family !== 'string' || typeof role !== 'string') return SAFE_MATERIAL_FALLBACK;
  if (!Object.prototype.hasOwnProperty.call(MATERIALS_BY_FAMILY, family)) return SAFE_MATERIAL_FALLBACK;
  const familyMaterials = MATERIALS_BY_FAMILY[family as AdventurerCardTemplate];
  if (!Object.prototype.hasOwnProperty.call(familyMaterials, role)) return SAFE_MATERIAL_FALLBACK;
  const asset = familyMaterials[role as CardMaterialRole];
  return asset ?? SAFE_MATERIAL_FALLBACK;
}

/** CSS variables keep browser rendering and the matching decoded preload on one registry path. */
export function getCardMaterialStyleProperties(family: unknown): Record<CardMaterialStyleProperty, string> {
  return Object.fromEntries(MATERIAL_ROLES.flatMap((role) => {
    const asset = resolveCardMaterial(family, role);
    return [
      [`--material-${role}-image`, `url("${asset.src}")`],
      [`--material-${role}-opacity`, String(asset.opacity)],
    ];
  })) as Record<CardMaterialStyleProperty, string>;
}

export { SAFE_MATERIAL_FALLBACK };

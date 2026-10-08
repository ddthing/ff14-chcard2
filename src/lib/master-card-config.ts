import type { AdventurerCardTemplate } from '@/components/cards/types';

export type MasterField = 'name' | 'job' | 'level' | 'world' | 'dataCenter' | 'freeCompany' | 'race' | 'clan' | 'grandCompany' | 'languages' | 'playStyles' | 'bio' | 'origin' | 'jobAbbreviation' | 'masthead';
export type InformationPriority = 'primary' | 'secondary' | 'optional' | 'supporting';
type MasterDefinition = {
  id: 'cinematic-master' | 'editorial-master' | 'identity-master';
  direction: 'c2' | 'e2' | 'i3'; directionName: string;
  layout: 'a'; status: 'locked';
  material: 'film-photographic' | 'warm-uncoated-paper' | 'matte-premium-stock';
  information: Readonly<Record<'primary' | 'secondary' | 'optional', readonly MasterField[]>>;
  /** Priority does not require every retained field to be printed. The
   * approved composition has a separate, explicit visibility contract. */
  defaultFields: readonly MasterField[];
  typography: Readonly<Record<string, readonly MasterField[]>>;
};

export const MASTER_DESIGN_VERSION = '2.6.4';
/** The stable identity contract above is separate from the authorized visual pass. */
export const MASTER_VISUAL_VERSION = '2.7.8';
export const MASTER_TEMPLATE_ORDER = ['cinematic', 'editorial', 'id-card'] as const;

/** Frozen identity/information contract. Geometry tokens live in each Master
 * stylesheet; update only against an explicit art-direction change request. */
export const MASTER_CARD_CONFIG = {
  cinematic: {
    id: 'cinematic-master', direction: 'c2', directionName: 'Editorial Cinema', layout: 'a', status: 'locked', material: 'film-photographic',
    information: { primary: ['name', 'job', 'level', 'world'], secondary: ['freeCompany', 'dataCenter'], optional: ['race', 'clan', 'languages', 'playStyles'] },
    defaultFields: ['name', 'job', 'level', 'world', 'dataCenter', 'freeCompany', 'jobAbbreviation', 'origin', 'bio'],
    typography: { display: ['name'], 'secondary-display': ['jobAbbreviation'], meta: ['job', 'level', 'world', 'dataCenter', 'freeCompany'], micro: ['origin'], caption: ['bio'] },
  },
  editorial: {
    id: 'editorial-master', direction: 'e2', directionName: 'Image Collision', layout: 'a', status: 'locked', material: 'warm-uncoated-paper',
    information: { primary: ['name', 'job', 'race', 'clan'], secondary: ['world', 'dataCenter'], optional: ['freeCompany', 'playStyles'] },
    defaultFields: ['name', 'job', 'level', 'race', 'clan', 'world', 'dataCenter', 'freeCompany', 'jobAbbreviation', 'origin', 'masthead', 'bio'],
    typography: { display: ['name'], 'secondary-display': ['jobAbbreviation', 'level'], masthead: ['masthead'], caption: ['job', 'race', 'clan', 'bio'], meta: ['world', 'dataCenter', 'freeCompany'], micro: ['origin', 'playStyles'] },
  },
  'id-card': {
    id: 'identity-master', direction: 'i3', directionName: 'Premium Card', layout: 'a', status: 'locked', material: 'matte-premium-stock',
    information: { primary: ['name', 'job', 'world', 'dataCenter', 'race', 'clan', 'freeCompany'], secondary: ['languages', 'playStyles', 'bio'], optional: [] },
    defaultFields: ['name', 'job', 'level', 'world', 'dataCenter', 'race', 'clan', 'freeCompany', 'grandCompany', 'languages', 'playStyles', 'origin', 'jobAbbreviation', 'masthead'],
    typography: { primary: ['name'], header: ['masthead'], label: [], value: ['job', 'world', 'dataCenter', 'race', 'clan', 'freeCompany', 'grandCompany'], micro: ['level', 'jobAbbreviation', 'origin', 'languages', 'playStyles'], caption: ['bio'] },
  },
} as const satisfies Readonly<Record<AdventurerCardTemplate, MasterDefinition>>;

export function masterFieldProps(family: AdventurerCardTemplate, field: MasterField) {
  const spec: MasterDefinition = MASTER_CARD_CONFIG[family];
  const priority: InformationPriority = (['primary', 'secondary', 'optional'] as const).find(tier => spec.information[tier].includes(field)) ?? 'supporting';
  const role = Object.entries(spec.typography).find(([, fields]) => fields.includes(field))?.[0];
  return { 'data-field': field, 'data-information-priority': priority, 'data-typography-role': role };
}

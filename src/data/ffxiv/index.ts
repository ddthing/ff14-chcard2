import { GRAND_COMPANIES } from './grand-companies';
import { JOBS } from './jobs';
import { LANGUAGES } from './languages';
import { PLAY_STYLES } from './play-styles';
import { CLANS, RACES } from './races';
import { JOB_CATEGORIES, JOB_ROLES } from './roles';
import type {
  FfxivDataCenter,
  FfxivJob,
  FfxivLabelKind,
  FfxivLocale,
  FfxivPhysicalRegion,
  FfxivServiceId,
  FfxivWorld,
  PhysicalRegionId,
} from './types';
import { GLOBAL_DATA_CENTERS, GLOBAL_WORLDS, PHYSICAL_REGIONS } from './worlds/global';
import { KOREA_WORLDS } from './worlds/korea';

export * from './types';
export { JOBS, JOB_CATEGORIES, JOB_ROLES, GLOBAL_DATA_CENTERS, GLOBAL_WORLDS, KOREA_WORLDS, PHYSICAL_REGIONS, RACES, CLANS, GRAND_COMPANIES, LANGUAGES, PLAY_STYLES };

export const SERVICES = [
  { id: 'global', localizedName: { ko: '글로벌', en: 'Global', ja: 'グローバル' }, sortOrder: 0 },
  { id: 'korea', localizedName: { ko: '한국 서비스', en: 'Korean Service', ja: '韓国サービス' }, sortOrder: 1 },
] as const;

export const DATA_CENTERS: readonly FfxivDataCenter[] = GLOBAL_DATA_CENTERS;
export const WORLDS: readonly FfxivWorld[] = [...GLOBAL_WORLDS, ...KOREA_WORLDS];

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[’']/g, '').replace(/[\s_-]+/g, ' ');
}

type Matchable = {
  readonly id: string;
  readonly localizedName?: Readonly<Record<string, string>>;
  readonly aliases?: readonly string[];
  readonly abbreviation?: string;
};

function findByLabel<T extends Matchable>(items: readonly T[], value: string | null | undefined): T | undefined {
  if (!value?.trim()) return undefined;
  const key = normalizeKey(value);
  const matches = items.filter((item) => {
    const labels = [item.id, item.abbreviation, ...Object.values(item.localizedName ?? {}), ...(item.aliases ?? [])]
      .filter((label): label is string => Boolean(label));
    return labels.some((label) => normalizeKey(label) === key);
  });
  const unique = new Map(matches.map((item) => [item.id, item]));
  return unique.size === 1 ? unique.values().next().value : undefined;
}

export function getJob(value: string | null | undefined): FfxivJob | undefined {
  return findByLabel(JOBS, value);
}

export function localizeJob(value: string | null | undefined, locale: FfxivLocale): string {
  return getJob(value)?.localizedName[locale] ?? value ?? '';
}

export function getWorld(value: string | null | undefined): FfxivWorld | undefined {
  return value ? WORLDS.find((world) => world.id === value) : undefined;
}

export function findWorld(
  value: string | null | undefined,
  context: { service?: FfxivServiceId | null; physicalRegionId?: PhysicalRegionId | null; dataCenterId?: string | null } = {},
): FfxivWorld | undefined {
  if (!value?.trim()) return undefined;
  const byId = getWorld(value);
  if (byId) return byId;

  const key = normalizeKey(value);
  let matches = WORLDS.filter((world) => {
    const labels = [world.localizedName.ko, world.localizedName.en, world.localizedName.ja, ...(world.aliases ?? [])];
    return labels.some((label) => normalizeKey(label) === key);
  });
  if (context.service) matches = matches.filter((world) => world.service === context.service);
  if (context.physicalRegionId) matches = matches.filter((world) => world.physicalRegionId === context.physicalRegionId);
  if (context.dataCenterId) matches = matches.filter((world) => world.dataCenterId === context.dataCenterId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function getDataCenter(value: string | null | undefined): FfxivDataCenter | undefined {
  return findByLabel(DATA_CENTERS, value);
}

export function findDataCenter(value: string | null | undefined, service?: FfxivServiceId | null): FfxivDataCenter | undefined {
  const center = getDataCenter(value);
  return center && (!service || center.service === service) ? center : undefined;
}

export function getPhysicalRegion(value: string | null | undefined): FfxivPhysicalRegion | undefined {
  return findByLabel(PHYSICAL_REGIONS, value);
}

export function getWorldsByService(
  service: FfxivServiceId,
  filters: { regionId?: PhysicalRegionId | null; dataCenterId?: string | null } = {},
): FfxivWorld[] {
  return WORLDS
    .filter((world) => world.service === service)
    .filter((world) => !filters.regionId || world.physicalRegionId === filters.regionId)
    .filter((world) => !filters.dataCenterId || world.dataCenterId === filters.dataCenterId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getWorldsByPhysicalRegion(regionId: PhysicalRegionId): FfxivWorld[] {
  return getWorldsByService('global', { regionId });
}

export function getWorldsByDataCenter(dataCenterId: string): FfxivWorld[] {
  return getWorldsByService('global', { dataCenterId });
}

export function normalizeServiceId(value: unknown): FfxivServiceId | null {
  if (typeof value !== 'string') return null;
  const key = normalizeKey(value);
  if (key === 'global' || key === 'global service' || key === 'グローバル') return 'global';
  if (key === 'korea' || key === 'korean service' || key === '한국' || key === '한국 서비스' || key === '韓国サービス') return 'korea';
  return value.trim() ? value.trim() as FfxivServiceId : null;
}

export function getRace(value: string | null | undefined) {
  return findByLabel(RACES, value);
}

export function getClan(value: string | null | undefined) {
  return findByLabel(CLANS, value);
}

export function getClansByRace(raceId: string): typeof CLANS[number][] {
  const race = getRace(raceId);
  return race ? CLANS.filter((clan) => clan.raceId === race.id).slice().sort((a, b) => a.sortOrder - b.sortOrder) : [];
}

export function getGrandCompany(value: string | null | undefined) {
  return findByLabel(GRAND_COMPANIES, value);
}

export function getLanguage(value: string | null | undefined) {
  return findByLabel(LANGUAGES, value);
}

export function getPlayStyle(value: string | null | undefined) {
  return findByLabel(PLAY_STYLES, value);
}

export function normalizeLanguageId(value: string): string {
  return getLanguage(value)?.id ?? value;
}

export function normalizePlayStyleId(value: string): string {
  return getPlayStyle(value)?.id ?? value;
}

type AnyLabelRecord = Matchable & { readonly localizedName?: Readonly<Record<FfxivLocale, string>> };

function recordsFor(kind: FfxivLabelKind): readonly AnyLabelRecord[] {
  switch (kind) {
    case 'job': return JOBS;
    case 'world': return WORLDS;
    case 'dataCenter': return DATA_CENTERS;
    case 'physicalRegion': return PHYSICAL_REGIONS;
    case 'race': return RACES;
    case 'clan': return CLANS;
    case 'grandCompany': return GRAND_COMPANIES;
    case 'language': return LANGUAGES;
    case 'playStyle': return PLAY_STYLES;
    case 'service': return SERVICES;
  }
}

/** Resolve stable IDs and old Phase 2 display strings. Unknown/ambiguous labels are preserved verbatim. */
export function localizeFfxivLabel(kind: FfxivLabelKind, idOrLegacyLabel: string | null | undefined, locale: FfxivLocale): string {
  if (!idOrLegacyLabel) return '';
  const record = findByLabel(recordsFor(kind), idOrLegacyLabel);
  return record?.localizedName?.[locale] ?? idOrLegacyLabel;
}

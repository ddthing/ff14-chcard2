import {
  demoAdventurerCards,
  demoAdventurerData,
  type AdventurerCardCharacter,
  type AdventurerCardData,
  type AdventurerCardDesign,
  type AdventurerCardImageAdjustments,
  type AdventurerCardTemplate,
  type CardColorMode,
  type CardLayoutVariant,
  type CardRatio,
  type CardTypographyPreset,
} from '@/components/cards/types';
import type { CardPalette } from '@/lib/palette';
import {
  DATA_CENTERS,
  SERVICES,
  getDataCenter,
  findDataCenter,
  findWorld,
  getWorld,
  getClan,
  getGrandCompany,
  getJob,
  getPhysicalRegion,
  getRace,
  normalizeLanguageId,
  normalizePlayStyleId,
  normalizeServiceId,
  type FfxivServiceId,
} from '@/data/ffxiv';
import { profileCount, profileStart, profileTiming } from '@/lib/performance-profile';

export const EDITOR_STORAGE_KEY = 'ff14-adventurer-card:draft:v3';
export const PREVIOUS_DRAFT_STORAGE_KEY = 'ff14-adventurer-card:draft:v2';
export const LEGACY_DRAFT_STORAGE_KEY = 'ff14-adventurer-card:draft:v1';
export const RECOVERY_DRAFT_STORAGE_KEY = 'ff14-adventurer-card:draft:recovery';
export const EDITOR_STORAGE_VERSION = 3;

const MIN_IMAGE_SCALE = 0.75;
const MAX_IMAGE_SCALE = 2.5;

type UnknownRecord = Record<string, unknown>;
type StorageSlot = 'current' | 'previous' | 'legacy' | 'recovery';
type StorageContext = 'load' | 'persist';

function readStorageItem(target: Storage, key: string, slot: StorageSlot, context: StorageContext): string | null {
  profileCount(`draft.storage.get.${context}.${slot}.calls`);
  const finish = profileStart(`draft.storage.get.${context}.${slot}`);
  try {
    return target.getItem(key);
  } catch (error) {
    profileCount(`draft.storage.get.${context}.${slot}.failure`);
    throw error;
  } finally {
    finish();
  }
}

function writeStorageItem(target: Storage, key: string, value: string, slot: 'primary' | 'recovery'): void {
  profileCount(`draft.storage.set.${slot}.calls`);
  const finish = profileStart(`draft.storage.set.${slot}`, slot === 'primary'
    ? { serializedLength: value.length }
    : { recoveryValueLength: value.length });
  try {
    target.setItem(key, value);
    profileCount(`draft.storage.set.${slot}.success`);
  } catch (error) {
    profileCount(`draft.storage.set.${slot}.failure`);
    throw error;
  } finally {
    finish();
  }
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : {};
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeTemplate(value: unknown): AdventurerCardTemplate | null {
  if (value === 'cinematic' || value === 'cinematic-master') return 'cinematic';
  if (value === 'editorial' || value === 'editorial-master') return 'editorial';
  if (value === 'id-card' || value === 'identity-master') return 'id-card';
  return null;
}

function isRatio(value: unknown): value is CardRatio {
  return value === '1:1' || value === '4:5' || value === '3:4' || value === '9:16' || value === '16:9';
}

function isLayoutVariant(value: unknown): value is CardLayoutVariant {
  return value === 'a' || value === 'b' || value === 'c';
}

function isTypographyPreset(value: unknown): value is CardTypographyPreset {
  return value === 'editorial' || value === 'modern' || value === 'condensed' || value === 'classic' || value === 'clean';
}

function normalizeTypographyPreset(value: unknown): CardTypographyPreset | null {
  if (isTypographyPreset(value)) return value;
  if (value === 'serif') return 'editorial';
  if (value === 'sans') return 'modern';
  return null;
}

function isColorMode(value: unknown): value is CardColorMode {
  return value === 'auto' || value === 'job' || value === 'custom';
}

function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(candidate) ? candidate : fallback;
}

function parsePosition(position: unknown, fallback: { x: number; y: number }) {
  if (typeof position !== 'string') return fallback;
  const match = position.match(/^\s*(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?\s*$/);
  if (!match) return fallback;
  return {
    x: clamp(Number(match[1]), fallback.x, 0, 100),
    y: clamp(Number(match[2]), fallback.y, 0, 100),
  };
}

function safeImageUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const candidate = value.trim();
  // Object URLs belong to one page lifetime and are dead after a reload.
  if (/^(data:image\/(png|jpe?g|webp);base64,|https?:\/\/|\/)/i.test(candidate)) return candidate;
  return fallback;
}

function supportedService(value: unknown): FfxivServiceId | null {
  const service = normalizeServiceId(value);
  return service && SERVICES.some((candidate) => candidate.id === service) ? service : null;
}

function localizedOrEnglish(
  value: unknown,
  recordValue: { id: string; localizedName: Readonly<Record<string, string>> } | undefined,
  resolver: (label: string) => { id: string } | undefined,
  fallback: string,
): string {
  if (!recordValue) return typeof value === 'string' ? value : fallback;
  if (typeof value === 'string' && resolver(value)?.id === recordValue.id) return value;
  return recordValue.localizedName.en ?? fallback;
}

function normalizeCharacter(
  value: unknown,
  fallback: AdventurerCardCharacter,
  changedKeys?: ReadonlySet<string>,
): AdventurerCardCharacter {
  const input = record(value);
  const strings = ['name', 'world', 'dataCenter', 'freeCompany', 'job', 'race', 'clan', 'grandCompany', 'bio'] as const;
  const character: AdventurerCardCharacter = {
    ...fallback,
    languages: [...fallback.languages],
    playStyles: [...fallback.playStyles],
  };
  for (const key of strings) {
    if (typeof input[key] === 'string') character[key] = input[key] as never;
  }
  const changed = (...keys: string[]) => keys.some((key) => changedKeys?.has(key));
  const hasField = (key: string) => Object.hasOwn(input, key);

  const requestedService = supportedService(input.service);
  const fallbackService = supportedService(fallback.service);
  const requestedCenter = getDataCenter(typeof input.dataCenterId === 'string' ? input.dataCenterId : null) ??
    getDataCenter(character.dataCenter);
  const centerForService = requestedCenter && (!requestedService || requestedCenter.service === requestedService)
    ? requestedCenter
    : undefined;
  let service = requestedService ?? centerForService?.service ?? fallbackService ?? 'global';
  const inputRegion = typeof input.physicalRegionId === 'string'
    ? getPhysicalRegion(input.physicalRegionId)?.id ?? null
    : null;
  const regionInput = inputRegion ?? centerForService?.physicalRegionId ??
    (!hasField('physicalRegionId') || input.physicalRegionId === undefined
      ? getPhysicalRegion(fallback.physicalRegionId)?.id ?? null
      : null);
  let physicalRegionId = regionInput;
  let dataCenter = centerForService && centerForService.service === service ? centerForService : undefined;
  if (dataCenter && physicalRegionId && dataCenter.physicalRegionId !== physicalRegionId) {
    dataCenter = undefined;
    character.dataCenter = '';
  }

  const rawWorldId = typeof input.worldId === 'string' ? input.worldId : null;
  const worldById = getWorld(rawWorldId);
  const worldContext = {
    service: requestedService ?? dataCenter?.service ?? service,
    physicalRegionId,
    dataCenterId: dataCenter?.id ?? null,
  };
  const worldByLabel = findWorld(character.world, worldContext) ?? findWorld(character.world, {
    service: requestedService ?? dataCenter?.service ?? service,
  }) ?? findWorld(character.world);
  const selectedWorld = worldById ?? worldByLabel;
  if (selectedWorld) {
    service = selectedWorld.service;
    physicalRegionId = selectedWorld.physicalRegionId;
    dataCenter = selectedWorld.dataCenterId ? findDataCenter(selectedWorld.dataCenterId) : undefined;
    character.world = localizedOrEnglish(character.world, selectedWorld, (label) =>
      findWorld(label, { service: selectedWorld.service, dataCenterId: selectedWorld.dataCenterId }), character.world);
  } else {
    if (service === 'korea') {
      physicalRegionId = null;
      dataCenter = undefined;
    }
    if (dataCenter && dataCenter.service === service &&
      (!physicalRegionId || dataCenter.physicalRegionId === physicalRegionId)) {
      physicalRegionId = dataCenter.physicalRegionId;
    } else {
      dataCenter = undefined;
    }
  }
  character.service = service;
  character.physicalRegionId = physicalRegionId;
  character.dataCenterId = selectedWorld?.dataCenterId ?? dataCenter?.id ?? null;
  character.worldId = selectedWorld?.id ?? null;
  if (dataCenter) {
    character.dataCenter = localizedOrEnglish(character.dataCenter, dataCenter, (label) => findDataCenter(label), character.dataCenter);
  } else if (selectedWorld?.dataCenterId) {
    const selectedCenter = DATA_CENTERS.find((candidate) => candidate.id === selectedWorld.dataCenterId);
    if (selectedCenter) character.dataCenter = selectedCenter.localizedName.en;
  } else if (service === 'korea') {
    character.dataCenter = '';
  }

  const rawJobId = typeof input.jobId === 'string' ? input.jobId : null;
  const job = getJob(rawJobId) ?? getJob(character.job) ??
    (!changed('job', 'jobId') ? getJob(fallback.jobId ?? fallback.job) : undefined);
  character.jobId = job?.id ?? null;
  character.job = localizedOrEnglish(character.job, job, (label) => getJob(label), character.job);

  const rawRaceId = typeof input.raceId === 'string' ? input.raceId : null;
  let race = getRace(rawRaceId) ?? getRace(character.race) ??
    (!changed('race', 'raceId') ? getRace(fallback.raceId ?? fallback.race) : undefined);
  const rawClanId = typeof input.clanId === 'string' ? input.clanId : null;
  let clan = getClan(rawClanId) ?? getClan(character.clan) ??
    (!changed('clan', 'clanId') ? getClan(fallback.clanId ?? fallback.clan) : undefined);
  if (clan && !hasField('race') && !hasField('raceId')) race = getRace(clan.raceId);
  let clanClearedForRace = false;
  if (race && clan && clan.raceId !== race.id) {
    if (changed('clan', 'clanId')) race = getRace(clan.raceId);
    else {
      clan = undefined;
      clanClearedForRace = true;
    }
  }
  character.raceId = race?.id ?? null;
  character.race = localizedOrEnglish(character.race, race, (label) => getRace(label), character.race);
  character.clanId = clan?.id ?? null;
  character.clan = clan
    ? localizedOrEnglish(character.clan, clan, (label) => getClan(label), character.clan)
    : clanClearedForRace || changed('race', 'raceId') ? '' : character.clan;

  const rawGrandCompanyId = typeof input.grandCompanyId === 'string' ? input.grandCompanyId : null;
  const grandCompany = getGrandCompany(rawGrandCompanyId) ?? getGrandCompany(character.grandCompany) ??
    (!changed('grandCompany', 'grandCompanyId') ? getGrandCompany(fallback.grandCompanyId ?? fallback.grandCompany) : undefined);
  character.grandCompanyId = grandCompany?.id ?? null;
  character.grandCompany = localizedOrEnglish(character.grandCompany, grandCompany, (label) => getGrandCompany(label), character.grandCompany);

  character.level = Math.round(clamp(input.level, fallback.level, 1, 100));
  character.languages = Array.isArray(input.languages)
    ? [...new Set(input.languages.filter((entry): entry is string => typeof entry === 'string').map(normalizeLanguageId))]
    : [...fallback.languages];
  character.playStyles = Array.isArray(input.playStyles)
    ? [...new Set(input.playStyles.filter((entry): entry is string => typeof entry === 'string').map(normalizePlayStyleId))]
    : [...fallback.playStyles];
  return character;
}

/** Canonicalizes a direct editor update while preserving the selected dimension as its source of truth. */
export function normalizeCharacterUpdate(
  current: AdventurerCardCharacter,
  partial: Partial<AdventurerCardCharacter>,
): AdventurerCardCharacter {
  const patch: Partial<AdventurerCardCharacter> = { ...partial };
  const merged: AdventurerCardCharacter = { ...current, ...patch };
  const keys = new Set(Object.keys(partial));

  const intentService = supportedService(patch.service) ?? supportedService(current.service);
  const invalidWorldIdOnly = typeof patch.worldId === 'string' && !getWorld(patch.worldId) && !keys.has('world');
  if (invalidWorldIdOnly) {
    merged.worldId = current.worldId ?? null;
    merged.world = current.world;
  }
  const explicitWorld = getWorld(typeof patch.worldId === 'string' ? patch.worldId : null) ??
    (typeof patch.world === 'string' ? findWorld(patch.world, {
      service: intentService,
      physicalRegionId: keys.has('physicalRegionId')
        ? getPhysicalRegion(patch.physicalRegionId)?.id ?? null
        : getPhysicalRegion(current.physicalRegionId)?.id ?? null,
      dataCenterId: keys.has('dataCenterId')
        ? typeof patch.dataCenterId === 'string' ? getDataCenter(patch.dataCenterId)?.id ?? null : null
        : current.dataCenterId ?? null,
    }) : undefined);
  if (!invalidWorldIdOnly && (keys.has('world') || keys.has('worldId')) && explicitWorld) {
    merged.worldId = explicitWorld.id;
    merged.service = explicitWorld.service;
    merged.physicalRegionId = explicitWorld.physicalRegionId;
    merged.dataCenterId = explicitWorld.dataCenterId;
    if (explicitWorld.dataCenterId) {
      const center = getDataCenter(explicitWorld.dataCenterId);
      merged.dataCenter = center && typeof patch.dataCenter === 'string' &&
        getDataCenter(patch.dataCenter)?.id === center.id
        ? patch.dataCenter
        : center?.localizedName.en ?? '';
    } else {
      merged.dataCenter = '';
    }
  } else if (!invalidWorldIdOnly && (keys.has('world') || keys.has('worldId')) && !explicitWorld) {
    if (typeof patch.world === 'string') merged.world = patch.world;
    else merged.world = '';
    merged.worldId = null;
  }

  const rawServiceChange = keys.has('service');
  const requestedService = rawServiceChange ? supportedService(patch.service) : supportedService(current.service);
  if (rawServiceChange && requestedService) merged.service = requestedService;
  else if (rawServiceChange) merged.service = supportedService(current.service) ?? 'global';

  if (keys.has('physicalRegionId')) {
    merged.physicalRegionId = typeof patch.physicalRegionId === 'string'
      ? getPhysicalRegion(patch.physicalRegionId)?.id ?? current.physicalRegionId ?? null
      : null;
    const currentCenter = merged.dataCenterId ? getDataCenter(merged.dataCenterId) : undefined;
    if (currentCenter && merged.physicalRegionId && currentCenter.physicalRegionId !== merged.physicalRegionId) {
      merged.dataCenterId = null;
      merged.dataCenter = '';
    }
  }
  if (keys.has('dataCenterId')) {
    const requestedCenter = typeof patch.dataCenterId === 'string' ? getDataCenter(patch.dataCenterId) : undefined;
    if (requestedCenter && (!keys.has('service') || requestedCenter.service === merged.service) &&
      (!merged.physicalRegionId || requestedCenter.physicalRegionId === merged.physicalRegionId)) {
      merged.dataCenterId = requestedCenter.id;
      merged.dataCenter = typeof patch.dataCenter === 'string' && getDataCenter(patch.dataCenter)?.id === requestedCenter.id
        ? patch.dataCenter
        : requestedCenter.localizedName.en;
      if (!keys.has('service')) merged.service = requestedCenter.service;
      if (!keys.has('physicalRegionId')) merged.physicalRegionId = requestedCenter.physicalRegionId;
    } else if (patch.dataCenterId === null) {
      merged.dataCenterId = null;
      merged.dataCenter = typeof patch.dataCenter === 'string' ? patch.dataCenter : '';
      merged.worldId = null;
      merged.world = '';
    } else {
      merged.dataCenterId = null;
      merged.dataCenter = typeof patch.dataCenter === 'string' ? patch.dataCenter : '';
    }
  }

  if (!explicitWorld && (rawServiceChange || keys.has('physicalRegionId') || keys.has('dataCenterId'))) {
    const selectedWorld = getWorld(current.worldId) ?? findWorld(current.world, {
      service: supportedService(current.service),
      physicalRegionId: getPhysicalRegion(current.physicalRegionId)?.id ?? null,
      dataCenterId: current.dataCenterId ?? null,
    });
    const center = merged.dataCenterId ? getDataCenter(merged.dataCenterId) : undefined;
    const service = supportedService(merged.service);
    const region = getPhysicalRegion(merged.physicalRegionId)?.id ?? null;
    const worldCompatible = selectedWorld && selectedWorld.service === service &&
      (!region || selectedWorld.physicalRegionId === region) &&
      (!center || selectedWorld.dataCenterId === center.id);
    if (selectedWorld && !worldCompatible) {
      merged.worldId = null;
      merged.world = '';
    }
    if (service === 'korea') {
      merged.physicalRegionId = null;
      merged.dataCenterId = null;
      merged.dataCenter = '';
    } else if (center && center.service === service) {
      merged.physicalRegionId = center.physicalRegionId;
      merged.dataCenterId = center.id;
    }
  }

  for (const [idKey, labelKey, lookup] of [
    ['jobId', 'job', getJob],
    ['raceId', 'race', getRace],
    ['clanId', 'clan', getClan],
    ['grandCompanyId', 'grandCompany', getGrandCompany],
  ] as const) {
    if (!keys.has(idKey) || patch[idKey] == null) continue;
    const recordValue = typeof patch[idKey] === 'string' ? lookup(patch[idKey]) : undefined;
    if (!recordValue) {
      (merged as unknown as Record<string, unknown>)[idKey] = current[idKey];
      (merged as unknown as Record<string, unknown>)[labelKey] = current[labelKey];
    }
  }

  if (keys.has('race') && !getRace(patch.race) && !keys.has('raceId')) {
    merged.raceId = null;
    merged.clan = '';
    merged.clanId = null;
  }
  if (keys.has('raceId') && patch.raceId === null && !keys.has('race')) {
    merged.race = '';
    merged.clan = '';
    merged.clanId = null;
  }
  if (keys.has('clan') && !getClan(patch.clan) && !keys.has('clanId')) merged.clanId = null;
  if (keys.has('clanId') && patch.clanId === null && !keys.has('clan')) merged.clan = '';

  return normalizeCharacter(merged, current, keys);
}

function hasCanonicalCharacterIds(value: unknown): boolean {
  profileCount('draft.canonicalCharacterCheck.calls');
  const finishCheck = profileStart('draft.canonicalCharacterCheck.total');
  try {
  const input = record(value);
  const ids = ['service', 'physicalRegionId', 'dataCenterId', 'worldId', 'jobId', 'raceId', 'clanId', 'grandCompanyId'] as const;
  if (ids.some((key) => !Object.hasOwn(input, key))) return false;
  const normalized = normalizeCharacter(value, demoAdventurerData.character);
  if (ids.some((key) => input[key] !== normalized[key])) return false;
  const strings = (key: 'languages' | 'playStyles') => {
    if (!Array.isArray(input[key])) return false;
    profileCount('draft.canonicalCharacterCheck.stringify.calls');
    const finishStringify = profileStart('draft.canonicalCharacterCheck.stringify');
    const same = JSON.stringify(input[key]) === JSON.stringify(normalized[key]);
    finishStringify();
    return same;
  };
  return strings('languages') && strings('playStyles');
  } finally {
    finishCheck();
  }
}

function normalizePalette(value: unknown, accentFallback: string, fallback: CardPalette): CardPalette {
  const input = record(value);
  return {
    primary: safeColor(input.primary, fallback.primary),
    accent: safeColor(input.accent, accentFallback || fallback.accent),
    light: safeColor(input.light, fallback.light),
    dark: safeColor(input.dark, fallback.dark),
  };
}

function normalizeAdjustments(
  value: unknown,
  legacyPosition: unknown,
  legacyScale: unknown,
  fallback: AdventurerCardImageAdjustments,
): AdventurerCardImageAdjustments {
  const input = record(value);
  const position = parsePosition(legacyPosition, { x: fallback.x, y: fallback.y });
  return {
    x: clamp(input.x, position.x, 0, 100),
    y: clamp(input.y, position.y, 0, 100),
    scale: clamp(input.scale, clamp(legacyScale, fallback.scale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE), MIN_IMAGE_SCALE, MAX_IMAGE_SCALE),
    rotation: clamp(input.rotation, fallback.rotation, -10, 10),
    brightness: clamp(input.brightness, fallback.brightness, 0, 2),
    contrast: clamp(input.contrast, fallback.contrast, 0, 2),
    saturation: clamp(input.saturation, fallback.saturation, 0, 2),
    exposure: clamp(input.exposure, fallback.exposure, -2, 2),
  };
}

/** Converts v1/v2 and partial browser drafts to the current ID-backed card shape. */
export function normalizeCardData(value: unknown): AdventurerCardData {
  profileCount('draft.normalizeCardData.calls');
  const input = record(value);
  const srcUrlLength = typeof input.imageUrl === 'string' ? input.imageUrl.length : 0;
  const finishNormalize = profileStart('draft.normalizeCardData.total', { srcUrlLength });
  try {
  const designInput = record(input.design);
  const template = normalizeTemplate(designInput.template) ?? demoAdventurerData.design.template;
  const base = demoAdventurerCards[template];
  const accentFallback = safeColor(designInput.accentColor, base.design.palette.accent);
  const palette = normalizePalette(designInput.palette, accentFallback, base.design.palette);
  const adjustments = normalizeAdjustments(
    input.imageAdjustments,
    designInput.imagePosition,
    designInput.imageScale,
    base.imageAdjustments,
  );
  const design: AdventurerCardDesign = {
    template,
    ratio: isRatio(designInput.ratio) ? designInput.ratio : base.design.ratio,
    layoutVariant: isLayoutVariant(designInput.layoutVariant) ? designInput.layoutVariant : 'a',
    colorMode: isColorMode(designInput.colorMode) ? designInput.colorMode : 'auto',
    jobMotifVisible: typeof designInput.jobMotifVisible === 'boolean' ? designInput.jobMotifVisible : true,
    jobIconColor: safeColor(designInput.jobIconColor, '') || null,
    palette,
    accentColor: palette.accent,
    typographyPreset: normalizeTypographyPreset(designInput.typographyPreset) ?? base.design.typographyPreset,
    imagePosition: `${adjustments.x}% ${adjustments.y}%`,
    imageScale: adjustments.scale,
    effects: Array.isArray(designInput.effects)
      ? [...new Set(designInput.effects.filter((effect): effect is string => typeof effect === 'string'))].slice(0, 12)
      : [...base.design.effects],
  };

  return {
    character: normalizeCharacter(input.character, base.character),
    design,
    imageUrl: safeImageUrl(input.imageUrl, base.imageUrl),
    imageAdjustments: adjustments,
  };
  } finally {
    finishNormalize();
  }
}

export interface LoadedEditorDraft {
  card: AdventurerCardData;
  imageMetadata: { fileName: string | null; mimeType: string | null };
  migrated: boolean;
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

type ParsePhase = 'load-current' | 'load-previous' | 'load-legacy' | 'persist-existing' | 'storage-event';

function parseEnvelope(raw: string | null, phase: ParsePhase): LoadedEditorDraft | null {
  profileCount(`draft.parseEnvelope.${phase}.calls`);
  const finishEnvelope = profileStart(`draft.parseEnvelope.${phase}`, { rawLength: raw?.length ?? 0 });
  if (!raw) {
    profileCount(`draft.parseEnvelope.${phase}.empty`);
    finishEnvelope();
    return null;
  }
  try {
    profileCount('draft.parseEnvelope.jsonParse.calls');
    const finishJsonParse = profileStart('draft.parseEnvelope.jsonParse', { rawLength: raw.length });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } finally {
      finishJsonParse();
    }
    const envelope = record(parsed);
    const hasCardEnvelope = Object.hasOwn(envelope, 'card');
    if (hasCardEnvelope) {
      const version = typeof envelope.version === 'number' ? envelope.version : 1;
      if (!Number.isInteger(version) || version < 1 || version > EDITOR_STORAGE_VERSION || !looksLikeCard(envelope.card)) {
        profileCount(`draft.parseEnvelope.${phase}.rejected`);
        return null;
      }
      const imageMetadata = record(envelope.imageMetadata);
      const card = normalizeCardData(envelope.card);
      return {
        card,
        imageMetadata: {
          fileName: typeof imageMetadata.fileName === 'string' ? imageMetadata.fileName : null,
          mimeType: typeof imageMetadata.mimeType === 'string' ? imageMetadata.mimeType : null,
        },
        migrated: version !== EDITOR_STORAGE_VERSION || !hasCanonicalCharacterIds(record(envelope.card).character),
      };
    }
    // v1 stored AdventurerCardData directly under the previous draft key.
    if (!looksLikeCard(parsed)) {
      profileCount(`draft.parseEnvelope.${phase}.rejected`);
      return null;
    }
    return { card: normalizeCardData(parsed), imageMetadata: { fileName: null, mimeType: null }, migrated: true };
  } catch {
    profileCount(`draft.parseEnvelope.${phase}.failure`);
    return null;
  } finally {
    finishEnvelope();
  }
}

/** Parses one storage event or storage value without replacing malformed user data. */
export function parseStoredEditorDraft(raw: string | null): LoadedEditorDraft | null {
  return parseEnvelope(raw, 'storage-event');
}

function looksLikeCard(value: unknown): boolean {
  const input = record(value);
  return ['character', 'design', 'imageUrl', 'imageAdjustments'].some((key) => Object.hasOwn(input, key));
}

export function loadEditorDraft(storage?: Storage): LoadedEditorDraft {
  profileCount('draft.loadEditorDraft.calls');
  const finishLoad = profileStart('draft.loadEditorDraft.total');
  const target = resolveStorage(storage);
  if (!target) {
    profileCount('draft.loadEditorDraft.noStorage');
    finishLoad();
    return { card: demoAdventurerData, imageMetadata: { fileName: null, mimeType: null }, migrated: false };
  }

  try {
    const current = parseEnvelope(readStorageItem(target, EDITOR_STORAGE_KEY, 'current', 'load'), 'load-current');
    if (current) return current;
    const previous = parseEnvelope(readStorageItem(target, PREVIOUS_DRAFT_STORAGE_KEY, 'previous', 'load'), 'load-previous');
    if (previous) return { card: previous.card, imageMetadata: previous.imageMetadata, migrated: true };
    const legacy = parseEnvelope(readStorageItem(target, LEGACY_DRAFT_STORAGE_KEY, 'legacy', 'load'), 'load-legacy');
    if (legacy) return { card: legacy.card, imageMetadata: legacy.imageMetadata, migrated: true };
    return current ?? { card: demoAdventurerData, imageMetadata: { fileName: null, mimeType: null }, migrated: false };
  } catch {
    profileCount('draft.loadEditorDraft.failure');
    return { card: demoAdventurerData, imageMetadata: { fileName: null, mimeType: null }, migrated: false };
  } finally {
    finishLoad();
  }
}

export function persistEditorDraft(
  card: AdventurerCardData,
  storage?: Storage,
  imageMetadata: { fileName: string | null; mimeType: string | null } = { fileName: null, mimeType: null },
): boolean {
  profileCount('draft.persistEditorDraft.calls');
  const finishPersist = profileStart('draft.persistEditorDraft.total');
  try {
    const target = resolveStorage(storage);
    if (!target) {
      profileCount('draft.persistEditorDraft.noStorage');
      return false;
    }

    const finishNormalize = profileStart('draft.persistEditorDraft.normalize');
    const safeCard = normalizeCardData(card);
    finishNormalize();
    const safeMetadata = {
      fileName: typeof imageMetadata.fileName === 'string' ? imageMetadata.fileName : null,
      mimeType: typeof imageMetadata.mimeType === 'string' ? imageMetadata.mimeType : null,
    };
    profileCount('draft.persistEditorDraft.stringify.calls');
    const finishStringify = profileStart('draft.persistEditorDraft.stringify', { srcUrlLength: safeCard.imageUrl.length });
    const serialized = JSON.stringify({ version: EDITOR_STORAGE_VERSION, card: safeCard, imageMetadata: safeMetadata });
    finishStringify();
    profileTiming('draft.persistEditorDraft.payloadLengths', 0, {
      srcUrlLength: safeCard.imageUrl.length,
      serializedLength: serialized.length,
    });
    const existing = readStorageItem(target, EDITOR_STORAGE_KEY, 'current', 'persist');
    if (existing === serialized) {
      profileCount('draft.persistEditorDraft.noopSkips');
      return true;
    }
    if (existing !== null) {
      profileCount('draft.persistEditorDraft.parseExisting.calls');
      const existingDraft = parseEnvelope(existing, 'persist-existing');
      if (!existingDraft) {
        profileCount('draft.persistEditorDraft.recoveryNeeded');
        // Keep malformed or newer-schema user data intact before an explicit save replaces it.
        try {
          if (readStorageItem(target, RECOVERY_DRAFT_STORAGE_KEY, 'recovery', 'persist') === null) {
            writeStorageItem(target, RECOVERY_DRAFT_STORAGE_KEY, existing, 'recovery');
            profileCount('draft.persistEditorDraft.recoveryCopies');
          } else {
            profileCount('draft.persistEditorDraft.recoveryAlreadyPresent');
          }
        } catch {
          // The primary write below remains useful when a recovery copy does not fit.
          profileCount('draft.persistEditorDraft.recoveryFailure');
        }
      }
    }
    writeStorageItem(target, EDITOR_STORAGE_KEY, serialized, 'primary');
    profileCount('draft.persistEditorDraft.writes');
    return true;
  } catch {
    profileCount('draft.persistEditorDraft.failure');
    return false;
  } finally {
    finishPersist();
  }
}

import {
  DATA_CENTERS,
  PHYSICAL_REGIONS,
  SERVICES,
  WORLDS,
  getWorld,
  getWorldsByService,
} from '../../data/ffxiv/index';
import type {
  FfxivLocale,
  FfxivServiceId,
  FfxivWorld,
  PhysicalRegionId,
} from '../../data/ffxiv/types';
import type { AdventurerCardCharacter } from '../cards/types';
import type { SearchablePickerOption } from './searchable-picker';

export interface WorldPickerOptionState {
  filtersOpen: boolean;
  service: FfxivServiceId;
  regionId: PhysicalRegionId | null;
  dataCenterId: string | null;
}

export type WorldSelectionPatch = Pick<
  AdventurerCardCharacter,
  'world' | 'worldId' | 'service' | 'physicalRegionId' | 'dataCenter' | 'dataCenterId'
>;

type SearchableRecord = {
  id: string;
  localizedName: Readonly<Record<string, string>>;
  aliases?: readonly string[];
};

function localName(record: SearchableRecord, locale: FfxivLocale): string {
  return record.localizedName[locale] || record.localizedName.en;
}

function searchNames(record: SearchableRecord): string {
  return [record.id, ...Object.values(record.localizedName), ...(record.aliases ?? [])].join(' ');
}

export function toWorldPickerOption(world: FfxivWorld, locale: FfxivLocale): SearchablePickerOption {
  const dataCenter = world.dataCenterId ? DATA_CENTERS.find((candidate) => candidate.id === world.dataCenterId) : undefined;
  const region = world.physicalRegionId ? PHYSICAL_REGIONS.find((candidate) => candidate.id === world.physicalRegionId) : undefined;
  const service = SERVICES.find((candidate) => candidate.id === world.service);
  const detail = [dataCenter && localName(dataCenter, locale), region && localName(region, locale), service && localName(service, locale)]
    .filter(Boolean).join(' · ');
  const searchText = [
    searchNames(world),
    dataCenter && searchNames(dataCenter),
    region && searchNames(region),
    service && searchNames(service),
  ].filter(Boolean).join(' ');

  return { id: world.id, label: localName(world, locale), detail, searchText };
}

/** Closed World search always offers the complete canonical registry; open filters narrow it. */
export function getWorldPickerOptions(
  locale: FfxivLocale,
  state: WorldPickerOptionState,
): SearchablePickerOption[] {
  const worlds = state.filtersOpen
    ? getWorldsByService(state.service, { regionId: state.regionId, dataCenterId: state.dataCenterId })
    : WORLDS;

  return worlds.map((world) => toWorldPickerOption(world, locale));
}

/** Keep the editor's denormalized labels and canonical IDs aligned on World selection. */
export function getWorldSelectionPatch(worldId: string, locale: FfxivLocale): WorldSelectionPatch | null {
  const world = getWorld(worldId);
  if (!world) return null;

  const dataCenter = world.dataCenterId ? DATA_CENTERS.find((candidate) => candidate.id === world.dataCenterId) : undefined;
  return {
    world: localName(world, locale),
    worldId: world.id,
    service: world.service,
    physicalRegionId: world.physicalRegionId,
    dataCenter: dataCenter ? localName(dataCenter, locale) : '',
    dataCenterId: world.dataCenterId,
  };
}

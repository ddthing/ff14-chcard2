export type FfxivLocale = 'ko' | 'en' | 'ja';

export type FfxivLocalizedName = Readonly<Record<FfxivLocale, string>>;

/** Services are account/product regions, distinct from physical game regions. */
/** The current registry exposes Global and Korea; additional service IDs stay forward-compatible. */
export type FfxivServiceId = 'global' | 'korea' | (string & {});

/** Physical region values are published for Global worlds only. */
export type PhysicalRegionId = 'japan' | 'north-america' | 'europe' | 'oceania';

export type JobRoleId = 'tank' | 'healer' | 'dps' | 'crafter' | 'gatherer';
export type JobCategoryId =
  | 'tank'
  | 'healer'
  | 'melee-dps'
  | 'physical-ranged-dps'
  | 'magical-ranged-dps'
  | 'limited'
  | 'crafter'
  | 'gatherer';

export interface LocalizedRegistryOption {
  readonly id: string;
  readonly localizedName: FfxivLocalizedName;
  readonly sortOrder: number;
  readonly aliases?: readonly string[];
}

export interface JobRole extends LocalizedRegistryOption {
  readonly id: JobRoleId;
}

export interface JobCategory extends LocalizedRegistryOption {
  readonly id: JobCategoryId;
  readonly roleId: JobRoleId;
}

export interface FfxivJob {
  readonly id: string;
  readonly abbreviation: string;
  readonly localizedName: FfxivLocalizedName;
  readonly role: JobRoleId;
  readonly category: JobCategoryId;
  /** Stable icon key. The key is independent of whether official artwork is enabled. */
  readonly icon: string;
  readonly themeAccent: string;
  readonly themeSecondary: string;
  readonly sortOrder: number;
  readonly aliases?: readonly string[];
}

export interface FfxivService extends LocalizedRegistryOption {
  readonly id: FfxivServiceId;
}

export interface FfxivPhysicalRegion extends LocalizedRegistryOption {
  readonly id: PhysicalRegionId;
}

export interface FfxivDataCenter extends LocalizedRegistryOption {
  readonly service: FfxivServiceId;
  readonly physicalRegionId: PhysicalRegionId;
}

export interface FfxivWorld {
  /** Service-scoped id, e.g. `global.elemental.tonberry` or `korea.tonberry`. */
  readonly id: string;
  readonly service: FfxivServiceId;
  /** Unknown for Korea: no official physical-region grouping is published. */
  readonly physicalRegionId: PhysicalRegionId | null;
  /** Unknown for Korea: no official logical-DC grouping is published. */
  readonly dataCenterId: string | null;
  readonly localizedName: FfxivLocalizedName;
  readonly sortOrder: number;
  readonly aliases: readonly string[];
}

export interface FfxivRace extends LocalizedRegistryOption {
  readonly id: string;
}

export interface FfxivClan extends LocalizedRegistryOption {
  readonly id: string;
  readonly raceId: string;
}

export interface FfxivGrandCompany extends LocalizedRegistryOption {
  readonly id: 'maelstrom' | 'twin-adder' | 'immortal-flames';
  readonly abbreviation: string;
}

export interface FfxivLanguage extends LocalizedRegistryOption {
  readonly abbreviation: string;
}

export interface FfxivPlayStyle extends LocalizedRegistryOption {
  readonly abbreviation: string;
}

export type FfxivLabelKind =
  | 'job'
  | 'world'
  | 'dataCenter'
  | 'physicalRegion'
  | 'race'
  | 'clan'
  | 'grandCompany'
  | 'language'
  | 'playStyle'
  | 'service';

import type { FfxivDataCenter, FfxivPhysicalRegion, FfxivWorld } from '../types';

/**
 * Global World-to-DC mapping is copied from the live official Lodestone World Status roster.
 * The Lodestone lists World names in Latin script in both English and Japanese interfaces.
 * Korean labels use an established Korean form when one is available; otherwise the
 * canonical Lodestone spelling is retained.
 * Source: https://na.finalfantasyxiv.com/lodestone/worldstatus/
 * Service/physical-region relationship: https://na.finalfantasyxiv.com/lodestone/playguide/contentsguide/datacentertravel/
 * Verified 2026-09-29. Mutable world classifications/status are deliberately not stored.
 */
export const PHYSICAL_REGIONS = [
  { id: 'japan', localizedName: { ko: '일본', en: 'Japan', ja: '日本' }, sortOrder: 0 },
  { id: 'north-america', localizedName: { ko: '북미', en: 'North America', ja: '北米' }, sortOrder: 1 },
  { id: 'europe', localizedName: { ko: '유럽', en: 'Europe', ja: '欧州' }, sortOrder: 2 },
  { id: 'oceania', localizedName: { ko: '오세아니아', en: 'Oceania', ja: 'オセアニア' }, sortOrder: 3 },
] as const satisfies readonly FfxivPhysicalRegion[];

const dc = (id: string, region: FfxivDataCenter['physicalRegionId'], sortOrder: number): FfxivDataCenter => ({
  id: `global.${id}`,
  service: 'global',
  physicalRegionId: region,
  localizedName: {
    ko: id === 'chaos' ? '카오스' : id[0].toUpperCase() + id.slice(1),
    en: id[0].toUpperCase() + id.slice(1),
    ja: id[0].toUpperCase() + id.slice(1),
  },
  sortOrder,
});

export const GLOBAL_DATA_CENTERS = [
  dc('elemental', 'japan', 0), dc('gaia', 'japan', 1), dc('mana', 'japan', 2), dc('meteor', 'japan', 3),
  dc('aether', 'north-america', 4), dc('crystal', 'north-america', 5), dc('dynamis', 'north-america', 6), dc('primal', 'north-america', 7),
  dc('chaos', 'europe', 8), dc('light', 'europe', 9), dc('materia', 'oceania', 10),
] as const satisfies readonly FfxivDataCenter[];

type DcKey = 'elemental' | 'gaia' | 'mana' | 'meteor' | 'aether' | 'crystal' | 'dynamis' | 'primal' | 'chaos' | 'light' | 'materia';
const namesByDc: Record<DcKey, readonly string[]> = {
  elemental: ['Aegis', 'Atomos', 'Carbuncle', 'Garuda', 'Gungnir', 'Kujata', 'Tonberry', 'Typhon'],
  gaia: ['Alexander', 'Bahamut', 'Durandal', 'Fenrir', 'Ifrit', 'Ridill', 'Tiamat', 'Ultima'],
  mana: ['Anima', 'Asura', 'Chocobo', 'Hades', 'Ixion', 'Masamune', 'Pandaemonium', 'Titan'],
  meteor: ['Belias', 'Mandragora', 'Ramuh', 'Shinryu', 'Unicorn', 'Valefor', 'Yojimbo', 'Zeromus'],
  aether: ['Adamantoise', 'Cactuar', 'Faerie', 'Gilgamesh', 'Jenova', 'Midgardsormr', 'Sargatanas', 'Siren'],
  crystal: ['Balmung', 'Brynhildr', 'Coeurl', 'Diabolos', 'Goblin', 'Malboro', 'Mateus', 'Zalera'],
  dynamis: ['Cuchulainn', 'Golem', 'Halicarnassus', 'Kraken', 'Maduin', 'Marilith', 'Rafflesia', 'Seraph'],
  primal: ['Behemoth', 'Excalibur', 'Exodus', 'Famfrit', 'Hyperion', 'Lamia', 'Leviathan', 'Ultros'],
  chaos: ['Cerberus', 'Louisoix', 'Moogle', 'Omega', 'Phantom', 'Ragnarok', 'Sagittarius', 'Spriggan'],
  light: ['Alpha', 'Lich', 'Odin', 'Phoenix', 'Raiden', 'Shiva', 'Twintania', 'Zodiark'],
  materia: ['Bismarck', 'Ravana', 'Sephirot', 'Sophia', 'Zurvan'],
};

// This small display map uses forms already present in the Korean World roster,
// plus Bahamut's established Korean rendering. Unmapped names keep their
// canonical Latin spelling; these display labels do not alter IDs or English names.
const koreanWorldNames: Readonly<Record<string, string>> = {
  Moogle: '모그리',
  Chocobo: '초코보',
  Carbuncle: '카벙클',
  Tonberry: '톤베리',
  Fenrir: '펜리르',
  Bahamut: '바하무트',
};

const dcRegions: Record<DcKey, FfxivDataCenter['physicalRegionId']> = {
  elemental: 'japan', gaia: 'japan', mana: 'japan', meteor: 'japan',
  aether: 'north-america', crystal: 'north-america', dynamis: 'north-america', primal: 'north-america',
  chaos: 'europe', light: 'europe', materia: 'oceania',
};

export const GLOBAL_WORLDS: readonly FfxivWorld[] = (Object.keys(namesByDc) as DcKey[]).flatMap((dcKey) =>
  namesByDc[dcKey].map((name, index) => ({
    id: `global.${dcKey}.${name.toLowerCase()}`,
    service: 'global' as const,
    physicalRegionId: dcRegions[dcKey],
    dataCenterId: `global.${dcKey}`,
    localizedName: { ko: koreanWorldNames[name] ?? name, en: name, ja: name },
    aliases: [],
    sortOrder: GLOBAL_DATA_CENTERS.find((center) => center.id === `global.${dcKey}`)!.sortOrder * 100 + index,
  })),
);

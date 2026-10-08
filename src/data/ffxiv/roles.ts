import type { JobCategory, JobRole } from './types';

export const JOB_ROLES = [
  { id: 'tank', localizedName: { ko: '방어 역할', en: 'Tank', ja: 'タンク' }, sortOrder: 0 },
  { id: 'healer', localizedName: { ko: '회복 역할', en: 'Healer', ja: 'ヒーラー' }, sortOrder: 1 },
  { id: 'dps', localizedName: { ko: '공격 역할', en: 'DPS', ja: 'DPS' }, sortOrder: 2 },
  { id: 'crafter', localizedName: { ko: '제작 역할', en: 'Crafter', ja: 'クラフター' }, sortOrder: 3 },
  { id: 'gatherer', localizedName: { ko: '채집 역할', en: 'Gatherer', ja: 'ギャザラー' }, sortOrder: 4 },
] as const satisfies readonly JobRole[];

export const JOB_CATEGORIES = [
  { id: 'tank', roleId: 'tank', localizedName: { ko: '방어 역할', en: 'Tank', ja: 'タンク' }, sortOrder: 0 },
  { id: 'healer', roleId: 'healer', localizedName: { ko: '회복 역할', en: 'Healer', ja: 'ヒーラー' }, sortOrder: 1 },
  { id: 'melee-dps', roleId: 'dps', localizedName: { ko: '근접 물리 DPS', en: 'Melee DPS', ja: '近接物理DPS' }, sortOrder: 2 },
  { id: 'physical-ranged-dps', roleId: 'dps', localizedName: { ko: '원거리 물리 DPS', en: 'Physical Ranged DPS', ja: '遠隔物理DPS' }, sortOrder: 3 },
  { id: 'magical-ranged-dps', roleId: 'dps', localizedName: { ko: '원거리 마법 DPS', en: 'Magical Ranged DPS', ja: '遠隔魔法DPS' }, sortOrder: 4 },
  { id: 'limited', roleId: 'dps', localizedName: { ko: '한정 직업', en: 'Limited Job', ja: 'リミテッドジョブ' }, sortOrder: 5 },
  { id: 'crafter', roleId: 'crafter', localizedName: { ko: '제작', en: 'Crafter', ja: 'クラフター' }, sortOrder: 6 },
  { id: 'gatherer', roleId: 'gatherer', localizedName: { ko: '채집', en: 'Gatherer', ja: 'ギャザラー' }, sortOrder: 7 },
] as const satisfies readonly JobCategory[];

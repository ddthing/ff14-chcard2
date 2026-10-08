import type { FfxivClan, FfxivRace } from './types';

/** Korean labels follow Square Enix Korea's official race guide: https://www.ff14.co.kr/pr/tribe */
export const RACES = [
  { id: 'hyur', localizedName: { ko: '휴런', en: 'Hyur', ja: 'ヒューラン' }, sortOrder: 0, aliases: ['Hyur'] },
  { id: 'elezen', localizedName: { ko: '엘레젠', en: 'Elezen', ja: 'エレゼン' }, sortOrder: 1 },
  { id: 'lalafell', localizedName: { ko: '라라펠', en: 'Lalafell', ja: 'ララフェル' }, sortOrder: 2 },
  { id: 'miqote', localizedName: { ko: '미코테', en: "Miqo'te", ja: 'ミコッテ' }, sortOrder: 3, aliases: ['Miqo’te', 'Miqote'] },
  { id: 'roegadyn', localizedName: { ko: '루가딘', en: 'Roegadyn', ja: 'ルガディン' }, sortOrder: 4 },
  { id: 'au-ra', localizedName: { ko: '아우라', en: 'Au Ra', ja: 'アウラ' }, sortOrder: 5, aliases: ['Aura'] },
  { id: 'hrothgar', localizedName: { ko: '로스가르', en: 'Hrothgar', ja: 'ロスガル' }, sortOrder: 6 },
  { id: 'viera', localizedName: { ko: '비에라', en: 'Viera', ja: 'ヴィエラ' }, sortOrder: 7 },
] as const satisfies readonly FfxivRace[];

/** Race/clan labels follow the official FFXIV Korea tribe guide and global naming: https://www.ff14.co.kr/pr/tribe */
export const CLANS = [
  { id: 'midlander', raceId: 'hyur', localizedName: { ko: '중원 부족', en: 'Midlander', ja: 'ミッドランダー' }, sortOrder: 0 },
  { id: 'highlander', raceId: 'hyur', localizedName: { ko: '고원 부족', en: 'Highlander', ja: 'ハイランダー' }, sortOrder: 1 },
  { id: 'wildwood', raceId: 'elezen', localizedName: { ko: '숲 부족', en: 'Wildwood', ja: 'フォレスター' }, sortOrder: 2 },
  { id: 'duskwight', raceId: 'elezen', localizedName: { ko: '황혼 부족', en: 'Duskwight', ja: 'シェーダー' }, sortOrder: 3 },
  { id: 'plainsfolk', raceId: 'lalafell', localizedName: { ko: '평원 부족', en: 'Plainsfolk', ja: 'プレーンフォーク' }, sortOrder: 4 },
  { id: 'dunesfolk', raceId: 'lalafell', localizedName: { ko: '사막 부족', en: 'Dunesfolk', ja: 'デューンフォーク' }, sortOrder: 5 },
  { id: 'seeker-of-the-sun', raceId: 'miqote', localizedName: { ko: '태양의 추종자', en: 'Seeker of the Sun', ja: 'サンシーカー' }, sortOrder: 6 },
  { id: 'keeper-of-the-moon', raceId: 'miqote', localizedName: { ko: '달의 수호자', en: 'Keeper of the Moon', ja: 'ムーンキーパー' }, sortOrder: 7 },
  { id: 'sea-wolf', raceId: 'roegadyn', localizedName: { ko: '바다 늑대', en: 'Sea Wolf', ja: 'ゼーヴォルフ' }, sortOrder: 8 },
  { id: 'hellsguard', raceId: 'roegadyn', localizedName: { ko: '불꽃지킴이', en: 'Hellsguard', ja: 'ローエンガルデ' }, sortOrder: 9 },
  { id: 'raen', raceId: 'au-ra', localizedName: { ko: '아우라 렌', en: 'Raen', ja: 'アウラ・レン' }, sortOrder: 10 },
  { id: 'xaela', raceId: 'au-ra', localizedName: { ko: '아우라 젤라', en: 'Xaela', ja: 'アウラ・ゼラ' }, sortOrder: 11 },
  { id: 'helions', raceId: 'hrothgar', localizedName: { ko: '맴도는 별', en: 'Helions', ja: 'ヘリオン' }, sortOrder: 12 },
  { id: 'the-lost', raceId: 'hrothgar', localizedName: { ko: '떠도는 별', en: 'The Lost', ja: 'ロスト' }, sortOrder: 13 },
  { id: 'rava', raceId: 'viera', localizedName: { ko: '라바 비에라', en: 'Rava', ja: 'ラヴァ・ヴィエラ' }, sortOrder: 14 },
  { id: 'veena', raceId: 'viera', localizedName: { ko: '비나 비에라', en: 'Veena', ja: 'ヴィナ・ヴィエラ' }, sortOrder: 15 },
] as const satisfies readonly FfxivClan[];

export type FfxivRaceId = (typeof RACES)[number]['id'];
export type FfxivClanId = (typeof CLANS)[number]['id'];

import type { FfxivPlayStyle } from './types';

export const PLAY_STYLES = [
  { id: 'casual', abbreviation: 'CAS', localizedName: { ko: '캐주얼', en: 'Casual', ja: 'カジュアル' }, sortOrder: 0 },
  { id: 'raid', abbreviation: 'RAID', localizedName: { ko: '레이드', en: 'Raid', ja: 'レイド' }, sortOrder: 1, aliases: ['Raids'] },
  { id: 'high-end-raid', abbreviation: 'HE', localizedName: { ko: '고난도 레이드', en: 'High-end Raid', ja: '高難易度レイド' }, sortOrder: 2 },
  { id: 'pvp', abbreviation: 'PvP', localizedName: { ko: 'PvP', en: 'PvP', ja: 'PvP' }, sortOrder: 3, aliases: ['Player versus Player'] },
  { id: 'frontline', abbreviation: 'FL', localizedName: { ko: '전장', en: 'Frontline', ja: 'フロントライン' }, sortOrder: 4 },
  { id: 'roleplay', abbreviation: 'RP', localizedName: { ko: '롤플레이', en: 'Roleplay', ja: 'ロールプレイ' }, sortOrder: 5 },
  { id: 'crafting', abbreviation: 'CRAFT', localizedName: { ko: '제작', en: 'Crafting', ja: 'クラフター' }, sortOrder: 6 },
  { id: 'gathering', abbreviation: 'GATHER', localizedName: { ko: '채집', en: 'Gathering', ja: 'ギャザラー' }, sortOrder: 7 },
  { id: 'housing', abbreviation: 'HOME', localizedName: { ko: '하우징', en: 'Housing', ja: 'ハウジング' }, sortOrder: 8 },
  { id: 'glamour', abbreviation: 'GLAM', localizedName: { ko: '코디', en: 'Glamour', ja: 'ミラプリ' }, sortOrder: 9 },
  { id: 'gpose', abbreviation: 'GP', localizedName: { ko: '포토 모드', en: 'Gpose', ja: 'グルポ' }, sortOrder: 10, aliases: ['Group Pose', 'G-Pose'] },
  { id: 'story', abbreviation: 'MSQ', localizedName: { ko: '스토리', en: 'Story', ja: 'ストーリー' }, sortOrder: 11 },
  { id: 'social', abbreviation: 'SOC', localizedName: { ko: '소셜', en: 'Social', ja: 'ソーシャル' }, sortOrder: 12 },
  { id: 'achievement', abbreviation: 'ACH', localizedName: { ko: '업적', en: 'Achievement', ja: 'アチーブメント' }, sortOrder: 13, aliases: ['Achievements'] },
  { id: 'duty-finder', abbreviation: 'DF', localizedName: { ko: '임무 찾기', en: 'Duty Finder', ja: 'コンテンツファインダー' }, sortOrder: 14 },
  { id: 'exploration', abbreviation: 'EXP', localizedName: { ko: '탐험', en: 'Exploration', ja: '探索' }, sortOrder: 15 },
  { id: 'questing', abbreviation: 'QUEST', localizedName: { ko: '퀘스트', en: 'Questing', ja: 'クエスト' }, sortOrder: 16 },
] as const satisfies readonly FfxivPlayStyle[];

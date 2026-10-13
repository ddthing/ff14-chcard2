import type { FfxivPlayStyle } from './types';

/**
 * Korean-first community labels with localized names for the other supported
 * services. Existing IDs remain stable because drafts and shared card data
 * store these values. Aliases keep older localized display strings readable.
 */
export const PLAY_STYLES = [
  { id: 'casual', abbreviation: 'CAS', localizedName: { ko: '라이트', en: 'Casual', ja: 'カジュアル' }, sortOrder: 0, aliases: ['캐주얼'] },
  { id: 'raid', abbreviation: 'RAID', localizedName: { ko: '레이드', en: 'Raid', ja: 'レイド' }, sortOrder: 1, aliases: ['Raids'] },
  { id: 'high-end-raid', abbreviation: 'HE', localizedName: { ko: '하드컨텐츠', en: 'High-end Content', ja: 'ハイエンドコンテンツ' }, sortOrder: 2, aliases: ['고난도 레이드', 'High-end Raid', '高難易度レイド'] },
  { id: 'pvp', abbreviation: 'PvP', localizedName: { ko: 'PvP', en: 'PvP', ja: 'PvP' }, sortOrder: 3, aliases: ['Player versus Player'] },
  { id: 'frontline', abbreviation: 'FL', localizedName: { ko: '전장', en: 'Frontline', ja: 'フロントライン' }, sortOrder: 4 },
  { id: 'roleplay', abbreviation: 'RP', localizedName: { ko: 'RP', en: 'Roleplay', ja: 'ロールプレイ' }, sortOrder: 5, aliases: ['롤플레이'] },
  { id: 'crafting', abbreviation: 'CRAFT', localizedName: { ko: '제작', en: 'Crafting', ja: 'クラフター' }, sortOrder: 6 },
  { id: 'gathering', abbreviation: 'GATHER', localizedName: { ko: '채집', en: 'Gathering', ja: 'ギャザラー' }, sortOrder: 7 },
  { id: 'housing', abbreviation: 'HOME', localizedName: { ko: '하우징', en: 'Housing', ja: 'ハウジング' }, sortOrder: 8 },
  { id: 'glamour', abbreviation: 'GLAM', localizedName: { ko: '코디', en: 'Glamour', ja: 'ミラプリ' }, sortOrder: 9 },
  { id: 'gpose', abbreviation: 'GP', localizedName: { ko: '스샷', en: 'Screenshots', ja: 'スクリーンショット' }, sortOrder: 10, aliases: ['포토 모드', 'Gpose', 'G-Pose', 'Group Pose', 'グルポ'] },
  { id: 'story', abbreviation: 'MSQ', localizedName: { ko: '스토리', en: 'Story', ja: 'ストーリー' }, sortOrder: 11 },
  { id: 'social', abbreviation: 'SOC', localizedName: { ko: '교류', en: 'Social', ja: '交流' }, sortOrder: 12, aliases: ['소셜', 'ソーシャル'] },
  { id: 'achievement', abbreviation: 'ACH', localizedName: { ko: '업적', en: 'Achievement', ja: 'アチーブメント' }, sortOrder: 13, aliases: ['Achievements'] },
  { id: 'duty-finder', abbreviation: 'DF', localizedName: { ko: '임무 찾기', en: 'Duty Finder', ja: 'コンテンツファインダー' }, sortOrder: 14 },
  { id: 'exploration', abbreviation: 'EXP', localizedName: { ko: '탐험', en: 'Exploration', ja: '探索' }, sortOrder: 15 },
  { id: 'questing', abbreviation: 'QUEST', localizedName: { ko: '퀘스트', en: 'Questing', ja: 'クエスト' }, sortOrder: 16 },
  { id: 'pve', abbreviation: 'PvE', localizedName: { ko: 'PvE', en: 'PvE', ja: 'PvE' }, sortOrder: 17, aliases: ['Player versus Environment'] },
  { id: 'big-fishing', abbreviation: 'FISH', localizedName: { ko: '터주', en: 'Big Fishing', ja: 'ヌシ釣り' }, sortOrder: 18 },
  { id: 'mahjong', abbreviation: 'MJ', localizedName: { ko: '마작', en: 'Mahjong', ja: 'ドマ式麻雀' }, sortOrder: 19 },
  { id: 'treasure-maps', abbreviation: 'MAP', localizedName: { ko: '지도&보물고', en: 'Treasure Maps & Dungeons', ja: '宝の地図・宝物庫' }, sortOrder: 20 },
  { id: 'for-fun', abbreviation: 'FUN', localizedName: { ko: '즐겜', en: 'For Fun', ja: 'エンジョイ' }, sortOrder: 21 },
  { id: 'beginner', abbreviation: 'NEW', localizedName: { ko: '초보', en: 'Beginner', ja: '初心者' }, sortOrder: 22 },
  { id: 'sprout', abbreviation: 'SPROUT', localizedName: { ko: '새싹', en: 'Sprout', ja: '若葉' }, sortOrder: 23 },
  { id: 'ultimate', abbreviation: 'ULT', localizedName: { ko: '절', en: 'Ultimate Raid', ja: '絶レイド' }, sortOrder: 24 },
  { id: 'returning-player', abbreviation: 'RETURN', localizedName: { ko: '복귀', en: 'Returning Player', ja: '復帰プレイヤー' }, sortOrder: 25 },
  { id: 'gold-saucer', abbreviation: 'GS', localizedName: { ko: '골드소서', en: 'Gold Saucer', ja: 'ゴールドソーサー' }, sortOrder: 26 },
  { id: 'discord', abbreviation: 'DC', localizedName: { ko: '디스코드', en: 'Discord', ja: 'Discord' }, sortOrder: 27 },
  { id: 'in-game-focused', abbreviation: 'INGAME', localizedName: { ko: '인게임 위주', en: 'Mostly in-game', ja: 'ゲーム内中心' }, sortOrder: 28, aliases: ['In-game'] },
  { id: 'twitter', abbreviation: 'X', localizedName: { ko: '트위터 교류', en: 'X / Twitter', ja: 'Xで交流' }, sortOrder: 29, aliases: ['Twitter', 'X', 'Twitter Interaction', 'X Interaction'] },
] as const satisfies readonly FfxivPlayStyle[];

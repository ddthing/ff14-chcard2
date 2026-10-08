import type { FfxivJob } from './types';

/**
 * Names and current role groupings follow the official Job Guide pages.
 * Icon values are stable identifiers only; no scraped or unverified artwork is bundled here.
 * Sources: https://na.finalfantasyxiv.com/jobguide/battle
 *          https://www.ff14.co.kr/pr/jobs
 *          https://jp.finalfantasyxiv.com/jobguide/battle
 */
export const JOBS = [
  { id: 'paladin', abbreviation: 'PLD', localizedName: { ko: '나이트', en: 'Paladin', ja: 'ナイト' }, role: 'tank', category: 'tank', icon: 'paladin', themeAccent: '#8d9daf', themeSecondary: '#c7a772', sortOrder: 0 },
  { id: 'warrior', abbreviation: 'WAR', localizedName: { ko: '전사', en: 'Warrior', ja: '戦士' }, role: 'tank', category: 'tank', icon: 'warrior', themeAccent: '#a96c53', themeSecondary: '#c39c6b', sortOrder: 1 },
  { id: 'dark-knight', abbreviation: 'DRK', localizedName: { ko: '암흑기사', en: 'Dark Knight', ja: '暗黒騎士' }, role: 'tank', category: 'tank', icon: 'dark-knight', themeAccent: '#a64f5d', themeSecondary: '#d3a0a2', sortOrder: 2 },
  { id: 'gunbreaker', abbreviation: 'GNB', localizedName: { ko: '건브레이커', en: 'Gunbreaker', ja: 'ガンブレイカー' }, role: 'tank', category: 'tank', icon: 'gunbreaker', themeAccent: '#aa7950', themeSecondary: '#92a0a4', sortOrder: 3, aliases: ['Gun Breaker'] },
  { id: 'white-mage', abbreviation: 'WHM', localizedName: { ko: '백마도사', en: 'White Mage', ja: '白魔道士' }, role: 'healer', category: 'healer', icon: 'white-mage', themeAccent: '#b9a16c', themeSecondary: '#d6d0b8', sortOrder: 4 },
  { id: 'scholar', abbreviation: 'SCH', localizedName: { ko: '학자', en: 'Scholar', ja: '学者' }, role: 'healer', category: 'healer', icon: 'scholar', themeAccent: '#788c78', themeSecondary: '#c0a36e', sortOrder: 5 },
  { id: 'astrologian', abbreviation: 'AST', localizedName: { ko: '점성술사', en: 'Astrologian', ja: '占星術師' }, role: 'healer', category: 'healer', icon: 'astrologian', themeAccent: '#7792ac', themeSecondary: '#c6a779', sortOrder: 6 },
  { id: 'sage', abbreviation: 'SGE', localizedName: { ko: '현자', en: 'Sage', ja: '賢者' }, role: 'healer', category: 'healer', icon: 'sage', themeAccent: '#7f9b9c', themeSecondary: '#bea474', sortOrder: 7 },
  { id: 'monk', abbreviation: 'MNK', localizedName: { ko: '몽크', en: 'Monk', ja: 'モンク' }, role: 'dps', category: 'melee-dps', icon: 'monk', themeAccent: '#ae765f', themeSecondary: '#bf9b73', sortOrder: 8 },
  { id: 'dragoon', abbreviation: 'DRG', localizedName: { ko: '용기사', en: 'Dragoon', ja: '竜騎士' }, role: 'dps', category: 'melee-dps', icon: 'dragoon', themeAccent: '#687d9f', themeSecondary: '#bd8b72', sortOrder: 9 },
  { id: 'ninja', abbreviation: 'NIN', localizedName: { ko: '닌자', en: 'Ninja', ja: '忍者' }, role: 'dps', category: 'melee-dps', icon: 'ninja', themeAccent: '#9b5865', themeSecondary: '#94a49e', sortOrder: 10 },
  { id: 'samurai', abbreviation: 'SAM', localizedName: { ko: '사무라이', en: 'Samurai', ja: '侍' }, role: 'dps', category: 'melee-dps', icon: 'samurai', themeAccent: '#b26c62', themeSecondary: '#bd9a6c', sortOrder: 11 },
  { id: 'reaper', abbreviation: 'RPR', localizedName: { ko: '리퍼', en: 'Reaper', ja: 'リーパー' }, role: 'dps', category: 'melee-dps', icon: 'reaper', themeAccent: '#765b83', themeSecondary: '#a87677', sortOrder: 12 },
  { id: 'viper', abbreviation: 'VPR', localizedName: { ko: '바이퍼', en: 'Viper', ja: 'ヴァイパー' }, role: 'dps', category: 'melee-dps', icon: 'viper', themeAccent: '#71836b', themeSecondary: '#b98770', sortOrder: 13 },
  { id: 'beastmaster', abbreviation: 'BST', localizedName: { ko: '마수조련사', en: 'Beastmaster', ja: '魔獣使い' }, role: 'dps', category: 'limited', icon: 'beastmaster', themeAccent: '#8d775c', themeSecondary: '#a79575', sortOrder: 14, aliases: ['Beast Master'] },
  { id: 'bard', abbreviation: 'BRD', localizedName: { ko: '음유시인', en: 'Bard', ja: '吟遊詩人' }, role: 'dps', category: 'physical-ranged-dps', icon: 'bard', themeAccent: '#879968', themeSecondary: '#c5a474', sortOrder: 15 },
  { id: 'machinist', abbreviation: 'MCH', localizedName: { ko: '기공사', en: 'Machinist', ja: '機工士' }, role: 'dps', category: 'physical-ranged-dps', icon: 'machinist', themeAccent: '#78848d', themeSecondary: '#c09166', sortOrder: 16, aliases: ['MCN'] },
  { id: 'dancer', abbreviation: 'DNC', localizedName: { ko: '무도가', en: 'Dancer', ja: '踊り子' }, role: 'dps', category: 'physical-ranged-dps', icon: 'dancer', themeAccent: '#b56e83', themeSecondary: '#d1b282', sortOrder: 17 },
  { id: 'black-mage', abbreviation: 'BLM', localizedName: { ko: '흑마도사', en: 'Black Mage', ja: '黒魔道士' }, role: 'dps', category: 'magical-ranged-dps', icon: 'black-mage', themeAccent: '#84709e', themeSecondary: '#c08b69', sortOrder: 18 },
  { id: 'summoner', abbreviation: 'SMN', localizedName: { ko: '소환사', en: 'Summoner', ja: '召喚士' }, role: 'dps', category: 'magical-ranged-dps', icon: 'summoner', themeAccent: '#6e98a1', themeSecondary: '#a5ad82', sortOrder: 19 },
  { id: 'red-mage', abbreviation: 'RDM', localizedName: { ko: '적마도사', en: 'Red Mage', ja: '赤魔道士' }, role: 'dps', category: 'magical-ranged-dps', icon: 'red-mage', themeAccent: '#a34f5a', themeSecondary: '#ddd0b4', sortOrder: 20 },
  { id: 'pictomancer', abbreviation: 'PCT', localizedName: { ko: '픽토맨서', en: 'Pictomancer', ja: 'ピクトマンサー' }, role: 'dps', category: 'magical-ranged-dps', icon: 'pictomancer', themeAccent: '#ad758b', themeSecondary: '#d0aa78', sortOrder: 21 },
  { id: 'blue-mage', abbreviation: 'BLU', localizedName: { ko: '청마도사', en: 'Blue Mage', ja: '青魔道士' }, role: 'dps', category: 'limited', icon: 'blue-mage', themeAccent: '#648da4', themeSecondary: '#c29b69', sortOrder: 22 },
  { id: 'carpenter', abbreviation: 'CRP', localizedName: { ko: '목수', en: 'Carpenter', ja: '木工師' }, role: 'crafter', category: 'crafter', icon: 'carpenter', themeAccent: '#9a8065', themeSecondary: '#c3ab83', sortOrder: 23 },
  { id: 'blacksmith', abbreviation: 'BSM', localizedName: { ko: '대장장이', en: 'Blacksmith', ja: '鍛冶師' }, role: 'crafter', category: 'crafter', icon: 'blacksmith', themeAccent: '#817777', themeSecondary: '#c29b74', sortOrder: 24 },
  { id: 'armorer', abbreviation: 'ARM', localizedName: { ko: '갑주제작사', en: 'Armorer', ja: '甲冑師' }, role: 'crafter', category: 'crafter', icon: 'armorer', themeAccent: '#77818b', themeSecondary: '#b49b76', sortOrder: 25 },
  { id: 'goldsmith', abbreviation: 'GSM', localizedName: { ko: '보석공예가', en: 'Goldsmith', ja: '彫金師' }, role: 'crafter', category: 'crafter', icon: 'goldsmith', themeAccent: '#ab925c', themeSecondary: '#d1bd8e', sortOrder: 26 },
  { id: 'leatherworker', abbreviation: 'LTW', localizedName: { ko: '가죽공예가', en: 'Leatherworker', ja: '革細工師' }, role: 'crafter', category: 'crafter', icon: 'leatherworker', themeAccent: '#906b56', themeSecondary: '#c0a17c', sortOrder: 27 },
  { id: 'weaver', abbreviation: 'WVR', localizedName: { ko: '재봉사', en: 'Weaver', ja: '裁縫師' }, role: 'crafter', category: 'crafter', icon: 'weaver', themeAccent: '#a77b8a', themeSecondary: '#d0b590', sortOrder: 28 },
  { id: 'alchemist', abbreviation: 'ALC', localizedName: { ko: '연금술사', en: 'Alchemist', ja: '錬金術師' }, role: 'crafter', category: 'crafter', icon: 'alchemist', themeAccent: '#7d8b7b', themeSecondary: '#bdab76', sortOrder: 29 },
  { id: 'culinarian', abbreviation: 'CUL', localizedName: { ko: '요리사', en: 'Culinarian', ja: '調理師' }, role: 'crafter', category: 'crafter', icon: 'culinarian', themeAccent: '#b17d63', themeSecondary: '#d2ae7e', sortOrder: 30 },
  { id: 'miner', abbreviation: 'MIN', localizedName: { ko: '광부', en: 'Miner', ja: '採掘師' }, role: 'gatherer', category: 'gatherer', icon: 'miner', themeAccent: '#7c8586', themeSecondary: '#c1a47e', sortOrder: 31 },
  { id: 'botanist', abbreviation: 'BTN', localizedName: { ko: '원예가', en: 'Botanist', ja: '園芸師' }, role: 'gatherer', category: 'gatherer', icon: 'botanist', themeAccent: '#82916d', themeSecondary: '#c3aa7e', sortOrder: 32 },
  { id: 'fisher', abbreviation: 'FSH', localizedName: { ko: '어부', en: 'Fisher', ja: '漁師' }, role: 'gatherer', category: 'gatherer', icon: 'fisher', themeAccent: '#6d8a97', themeSecondary: '#bfa47b', sortOrder: 33 },
] as const satisfies readonly FfxivJob[];

export type FfxivJobId = (typeof JOBS)[number]['id'];

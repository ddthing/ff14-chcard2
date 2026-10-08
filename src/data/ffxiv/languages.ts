import type { FfxivLanguage } from './types';

export const LANGUAGES = [
  { id: 'ko', abbreviation: 'KO', localizedName: { ko: '한국어', en: 'Korean', ja: '韓国語' }, sortOrder: 0, aliases: ['Korean', '한국어', '한국말'] },
  { id: 'en', abbreviation: 'EN', localizedName: { ko: '영어', en: 'English', ja: '英語' }, sortOrder: 1, aliases: ['English', '영어'] },
  { id: 'ja', abbreviation: 'JP', localizedName: { ko: '일본어', en: 'Japanese', ja: '日本語' }, sortOrder: 2, aliases: ['JA', 'Japanese', '일본어'] },
  { id: 'fr', abbreviation: 'FR', localizedName: { ko: '프랑스어', en: 'French', ja: 'フランス語' }, sortOrder: 3, aliases: ['French', '프랑스어'] },
  { id: 'de', abbreviation: 'DE', localizedName: { ko: '독일어', en: 'German', ja: 'ドイツ語' }, sortOrder: 4, aliases: ['German', '독일어'] },
  { id: 'zh', abbreviation: 'CN', localizedName: { ko: '중국어', en: 'Chinese', ja: '中国語' }, sortOrder: 5, aliases: ['ZH', 'Chinese', '中文', '중국어'] },
] as const satisfies readonly FfxivLanguage[];

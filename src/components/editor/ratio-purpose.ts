import type { CardRatio } from '@/components/cards/types';
import type { Locale } from '@/lib/types';

export const CARD_RATIO_PURPOSES: Readonly<Record<CardRatio, Readonly<Record<Locale, string>>>> = {
  '1:1': { ko: '정사각형', en: 'Square', ja: '正方形' },
  '4:5': { ko: '세로형', en: 'Portrait', ja: '縦長' },
  '3:4': { ko: '포스터', en: 'Poster', ja: 'ポスター' },
  '9:16': { ko: '스토리', en: 'Story', ja: 'ストーリー' },
  '16:9': { ko: '와이드', en: 'Wide', ja: '横長' },
};


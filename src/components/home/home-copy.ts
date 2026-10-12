import type { Locale } from '@/lib/types';

type HomeCopy = {
  eyebrow: string;
  title: string;
  create: string;
  explore: string;
  exploreDraft: string;
  sampleLabel: string;
  styleSelector: string;
  styleHeading: string;
  selected: string;
  draftHeading: string;
  resumeDraft: string;
  draftDetails: (job: string, world: string) => string;
  saved: string;
  saving: string;
  saveError: string;
};

export const homeCopy = {
  ko: {
    eyebrow: 'FINAL FANTASY XIV',
    title: '모험가 카드',
    create: '카드 만들기',
    explore: '스타일 비교',
    exploreDraft: '내 카드로 비교',
    sampleLabel: '예시 카드',
    styleSelector: '카드 스타일',
    styleHeading: '스타일',
    selected: '선택됨',
    draftHeading: '이어서 만들기',
    resumeDraft: '편집 계속하기',
    draftDetails: (job, world) => [job, world].filter(Boolean).join(' · '),
    saved: '자동 저장됨',
    saving: '자동 저장 중',
    saveError: '자동 저장 실패',
  },
  en: {
    eyebrow: 'FINAL FANTASY XIV',
    title: 'Adventurer Card',
    create: 'Create a card',
    explore: 'Compare styles',
    exploreDraft: 'Compare my card',
    sampleLabel: 'Sample card',
    styleSelector: 'Card styles',
    styleHeading: 'Styles',
    selected: 'Selected',
    draftHeading: 'Resume draft',
    resumeDraft: 'Continue editing',
    draftDetails: (job, world) => [job, world].filter(Boolean).join(' · '),
    saved: 'Auto-saved',
    saving: 'Saving draft',
    saveError: 'Auto-save failed',
  },
  ja: {
    eyebrow: 'FINAL FANTASY XIV',
    title: '冒険者カード',
    create: 'カードを作る',
    explore: 'スタイルを比較',
    exploreDraft: '自分のカードで比較',
    sampleLabel: 'サンプルカード',
    styleSelector: 'カードスタイル',
    styleHeading: 'スタイル',
    selected: '選択中',
    draftHeading: '下書きから続ける',
    resumeDraft: '編集を続ける',
    draftDetails: (job, world) => [job, world].filter(Boolean).join(' · '),
    saved: '自動保存済み',
    saving: '自動保存中',
    saveError: '自動保存に失敗しました',
  },
} satisfies Record<Locale, HomeCopy>;

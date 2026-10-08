import type { AdventurerCardTemplate } from '@/components/cards/types';
import type { Locale } from '@/lib/types';

type HomeCopy = {
  steps: readonly [string, string, string];
  eyebrow: string;
  title: string;
  description: string;
  create: string;
  explore: string;
  productNote: string;
  privacyNote: string;
  sampleLabel: string;
  styleSelector: string;
  styleHeading: string;
  stylePrompt: string;
  stylePrefix: string;
  selectStyle: string;
  selected: string;
  previewStyle: string;
  draftHeading: string;
  resumeDraft: string;
  draftDetails: (name: string, job: string, world: string) => string;
  draftStyle: (style: string, ratio: string) => string;
  saved: string;
  saving: string;
  saveError: string;
  footer: string;
  featurePoints: Record<AdventurerCardTemplate, readonly [string, string]>;
};

export const homeCopy = {
  ko: {
    steps: ['사진 선택', '카드 편집', '이미지 저장'],
    eyebrow: 'FFXIV 모험가 카드 스튜디오',
    title: '당신의 모험,\n한 장으로.',
    description: '사진을 고르고, 이름을 더하고. 간직하고 싶은 모험가 카드를 만들어 보세요.',
    create: '내 사진으로 시작하기',
    explore: '스타일 크게 비교하기',
    productNote: '사진 · 캐릭터 정보 · 세 가지 카드 스타일',
    privacyNote: '사진은 이 기기에서 불러와 시작합니다.',
    sampleLabel: '디자인 예시 · 샘플 캐릭터',
    styleSelector: '카드 스타일 선택',
    styleHeading: '세 가지 방식으로 모험을 기록하세요',
    stylePrompt: '편집 중에도 바꿀 수 있어요.',
    stylePrefix: '스타일',
    selectStyle: '이 스타일 선택',
    selected: '선택됨',
    previewStyle: '미리보기',
    draftHeading: '이어서 만들기',
    resumeDraft: '편집 계속하기',
    draftDetails: (name, job, world) => [name, job, world].filter(Boolean).join(' · '),
    draftStyle: (style, ratio) => `${style} · ${ratio}`,
    saved: '이 기기에 저장됨',
    saving: '저장 중',
    saveError: '저장하지 못함',
    footer: '캐릭터의 순간을, 당신의 기록으로.',
    featurePoints: {
      cinematic: ['황혼빛 장면과 얇은 금박 프레임', '넓은 사진 · 절제된 정보'],
      editorial: ['붓결을 따라 이어지는 비대칭 사진', '직업 문양 · 종이 위 타이포'],
      'id-card': ['모험을 기록하는 길드 인물 카드', '정돈된 프로필 · XIV 깃발'],
    },
  },
  en: {
    steps: ['Choose a photo', 'Edit your card', 'Save an image'],
    eyebrow: 'FFXIV ADVENTURER CARD STUDIO',
    title: 'Your adventure.\nYours to keep.',
    description: 'Start with a screenshot and make an adventurer card worth keeping.',
    create: 'Start with my photo',
    explore: 'Compare full-size styles',
    productNote: 'Photo · character details · three card styles',
    privacyNote: 'Your photo stays on this device while you create.',
    sampleLabel: 'Design example · Sample character',
    styleSelector: 'Choose a card style',
    styleHeading: 'Three ways to keep your adventure',
    stylePrompt: 'You can change it while editing.',
    stylePrefix: 'STYLE',
    selectStyle: 'Choose this style',
    selected: 'Selected',
    previewStyle: 'Preview style',
    draftHeading: 'Continue your draft',
    resumeDraft: 'Continue editing',
    draftDetails: (name, job, world) => [name, job, world].filter(Boolean).join(' · '),
    draftStyle: (style, ratio) => `${style} · ${ratio}`,
    saved: 'Saved on this device',
    saving: 'Saving',
    saveError: 'Could not save',
    footer: 'A moment from your character, kept as your own.',
    featurePoints: {
      cinematic: ['A twilight scene in a fine gold frame', 'Wide photo · quiet details'],
      editorial: ['A brushworked, asymmetric portrait', 'Job emblem · ink on warm paper'],
      'id-card': ['A guild record for the moments you keep', 'Ordered profile · XIV pennant'],
    },
  },
  ja: {
    steps: ['写真を選ぶ', 'カードを編集', '画像を保存'],
    eyebrow: 'FFXIV 冒険者カードスタジオ',
    title: 'あなたの冒険を、\n一枚に。',
    description: 'スクリーンショットから、ずっと残しておきたい冒険者カードをつくりましょう。',
    create: '自分の写真から始める',
    explore: 'スタイルを大きく比較',
    productNote: '写真 · キャラクター情報 · 三つのカードスタイル',
    privacyNote: '写真はこの端末で読み込んで作成します。',
    sampleLabel: 'デザイン例 · サンプルキャラクター',
    styleSelector: 'カードスタイルを選択',
    styleHeading: '三つのかたちで冒険を残す',
    stylePrompt: '編集中でも変更できます。',
    stylePrefix: 'スタイル',
    selectStyle: 'このスタイルを選ぶ',
    selected: '選択中',
    previewStyle: 'プレビュー',
    draftHeading: '下書きから続ける',
    resumeDraft: '編集を続ける',
    draftDetails: (name, job, world) => [name, job, world].filter(Boolean).join(' · '),
    draftStyle: (style, ratio) => `${style} · ${ratio}`,
    saved: 'この端末に保存済み',
    saving: '保存中',
    saveError: '保存できませんでした',
    footer: 'キャラクターの瞬間を、あなたの記録に。',
    featurePoints: {
      cinematic: ['夕景を細い金のフレームに収める一枚', '広い写真 · 控えめな情報'],
      editorial: ['筆の輪郭に沿う非対称のポートレート', 'ジョブの紋章 · 温かな紙の文字'],
      'id-card': ['冒険の瞬間を残すギルドの記録', '整ったプロフィール · XIVの旗'],
    },
  },
} satisfies Record<Locale, HomeCopy>;

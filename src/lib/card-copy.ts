import type { Locale } from './types';
import type { AdventurerCardCharacter } from '@/components/cards/types';
import { conerSample } from '@/data/samples/coner';

export const CARD_UI_LABELS = {
  ko: {
    level: '레벨', world: '서버', dataCenter: '데이터 센터', freeCompany: '자유부대', grandCompany: '총사령부',
    race: '종족', clan: '부족', languages: '언어', playStyles: '플레이 스타일', serviceRegion: '서비스 · 지역',
    unofficial: '비공식 · 팬메이드', photoAltSuffix: '모험가 초상', cardAltSuffix: '모험가 카드',
  },
  en: {
    level: 'LEVEL', world: 'WORLD', dataCenter: 'DATA CENTER', freeCompany: 'FREE COMPANY', grandCompany: 'GRAND COMPANY',
    race: 'RACE', clan: 'CLAN', languages: 'LANGUAGES', playStyles: 'PLAY STYLE', serviceRegion: 'SERVICE / REGION',
    unofficial: 'UNOFFICIAL / FAN-MADE', photoAltSuffix: 'adventurer portrait', cardAltSuffix: 'adventurer card',
  },
  ja: {
    level: 'レベル', world: 'ワールド', dataCenter: 'データセンター', freeCompany: 'フリーカンパニー', grandCompany: 'グランドカンパニー',
    race: '種族', clan: '部族', languages: '言語', playStyles: 'プレイスタイル', serviceRegion: 'サービス・地域',
    unofficial: '非公式・ファンメイド', photoAltSuffix: '冒険者の肖像', cardAltSuffix: '冒険者カード',
  },
} as const satisfies Record<Locale, Record<string, string>>;

/** The single source for printed, locale-specific master and legacy card copy. */
export const CARD_STOCK_COPY = {
  cinematic: {
    ko: { job: '직업', worldDc: '서버 / 데이터 센터', details: '모험가 정보', promise: ['더 밝은', '내일을', '함께'], quote: ['작은 걸음이', '큰 기적을 만듭니다.'], signature: ['모험은', '좋은 동료와 함께'], place: '에오르제아' },
    en: { job: 'JOB', worldDc: 'WORLD / DATA CENTER', details: 'Adventurer details', promise: ['A BRIGHTER', 'TOMORROW', 'TOGETHER'], quote: ['Small steps,', 'great wonders.'], signature: ['Adventures', 'in good company'], place: 'EORZEA' },
    ja: { job: 'ジョブ', worldDc: 'ワールド / データセンター', details: '冒険者情報', promise: ['ともに歩む', '輝く明日へ', 'エオルゼアで'], quote: ['小さな一歩が', '大きな奇跡に。'], signature: ['冒険は', '仲間とともに'], place: 'エオルゼア' },
  },
  editorial: {
    ko: { job: '직업', service: '서비스 · 지역', masthead: '모험가 카드', details: '모험가 정보', story: '이야기는 계속됩니다.', warriorOfLight: '빛의 전사' },
    en: { job: 'JOB', service: 'SERVICE / REGION', masthead: 'ADVENTURER CARD', details: 'Adventurer details', story: 'More stories ahead.', warriorOfLight: 'Warrior of Light' },
    ja: { job: 'ジョブ', service: 'サービス・地域', masthead: '冒険者カード', details: '冒険者情報', story: '物語は、これからも続く。', warriorOfLight: '光の戦士' },
  },
  identity: {
    ko: { masthead: '모험가', mastheadCaption: '기록', banner: ['사람', '장소', '이야기'], location: '에오르제아', photoQuote: ['작은 걸음이 모여', '긴 여정이 됩니다.'], photoStamp: ['오늘도', '에오르제아에서'], job: '직업', record: '모험가 기록', origin: '출신과 여정', lineage: '종족 계보', affiliation: '소속' },
    en: { masthead: 'ADVENTURER', mastheadCaption: 'RECORD', banner: ['PEOPLE', 'PLACES', 'STORIES'], location: 'EORZEA', photoQuote: ['Small steps lead to', 'grand journeys.'], photoStamp: ['ANOTHER DAY', 'IN EORZEA'], job: 'JOB', record: 'Adventurer record', origin: 'ORIGIN & ROUTE', lineage: 'LINEAGE', affiliation: 'AFFILIATION' },
    ja: { masthead: '冒険者', mastheadCaption: '記録', banner: ['人々', '場所', '物語'], location: 'エオルゼア', photoQuote: ['小さな一歩が', '大きな旅へ。'], photoStamp: ['今日も', 'エオルゼアで'], job: 'ジョブ', record: '冒険者の記録', origin: '出身・旅路', lineage: '種族・部族', affiliation: '所属' },
  },
  legacy: {
    cinematic: {
      ko: { title: '모험가 기록', location: '하이델린 / 에오르제아' },
      en: { title: 'ADVENTURER RECORD', location: 'HYDAELYN / EORZEA' },
      ja: { title: '冒険者の記録', location: 'ハイデリン / エオルゼア' },
    },
    editorial: {
      ko: { title: '모험가', location: '여행 기록 / 에오르제아' },
      en: { title: 'ADVENTURER', location: 'FIELD NOTES / EORZEA' },
      ja: { title: '冒険者', location: '旅の記録 / エオルゼア' },
    },
    identity: {
      ko: { title: '모험가', subtitle: '신원 기록', fullTitle: '모험가 신원 기록', profile: '에오르제아 모험가 프로필' },
      en: { title: 'ADVENTURER', subtitle: 'IDENTIFICATION', fullTitle: 'ADVENTURER IDENTIFICATION', profile: 'EORZEAN CHARACTER PROFILE' },
      ja: { title: '冒険者', subtitle: '身元記録', fullTitle: '冒険者の身元記録', profile: 'エオルゼア冒険者プロフィール' },
    },
  },
  brand: { finalFantasy: 'FINAL FANTASY XIV', recordMark: 'XIV' },
  sample: { bio: { ko: '작은 걸음이 모여 긴 여정으로 이어집니다.', en: 'Small steps, long journeys.', ja: '小さな一歩から、長い旅へ。' } },
} as const;

export const CARD_LEGACY_COPY = CARD_STOCK_COPY.legacy;

const BUILT_IN_SAMPLE_IMAGE_URLS: ReadonlySet<string> = new Set(
  Object.values(conerSample.screenshots).flatMap(({ original, optimized }) => [original, optimized]),
);

/** Localize only the untouched built-in sample quote for its known image files. */
export function getCardDisplayBio(character: AdventurerCardCharacter, imageUrl: string, locale: Locale): string {
  if (character.bio !== conerSample.character.bio || !BUILT_IN_SAMPLE_IMAGE_URLS.has(imageUrl)) return character.bio;
  return CARD_STOCK_COPY.sample.bio[locale];
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenStrings);
  return [];
}

/** All fixed glyphs rendered by cards in this locale, used before preview/export capture. */
export function getCardStaticText(locale: Locale, template?: 'cinematic' | 'editorial' | 'id-card'): string[] {
  const family = template === 'id-card' ? 'identity' : template;
  const copy = family ? {
    master: CARD_STOCK_COPY[family][locale],
    legacy: CARD_STOCK_COPY.legacy[family][locale],
  } : {
    master: {
      cinematic: CARD_STOCK_COPY.cinematic[locale],
      editorial: CARD_STOCK_COPY.editorial[locale],
      identity: CARD_STOCK_COPY.identity[locale],
    },
    legacy: {
      cinematic: CARD_STOCK_COPY.legacy.cinematic[locale],
      editorial: CARD_STOCK_COPY.legacy.editorial[locale],
      identity: CARD_STOCK_COPY.legacy.identity[locale],
    },
  };

  return flattenStrings({ labels: CARD_UI_LABELS[locale], copy, brand: CARD_STOCK_COPY.brand });
}

export function getCardPhotoAlt(name: string, locale: Locale): string {
  const separator = locale === 'ja' ? '' : ' ';
  return `${name}${separator}${CARD_UI_LABELS[locale].photoAltSuffix}`;
}

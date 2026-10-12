import type { Locale } from './types';
import { isCardDecorativeCopy, type AdventurerCardCharacter, type AdventurerCardTemplate, type CardDecorativeCopy } from '@/components/cards/types';
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

type CardCopyFamily = 'cinematic' | 'editorial' | 'identity';

export interface CinematicMasterCopy {
  readonly job: string;
  readonly worldDc: string;
  readonly details: string;
  readonly promise: readonly string[];
  readonly quote: readonly string[];
  readonly signature: readonly string[];
  readonly place: string;
}

export interface EditorialMasterCopy {
  readonly job: string;
  readonly service: string;
  readonly masthead: string;
  readonly details: string;
  readonly story: string;
  readonly warriorOfLight: string;
}

export interface IdentityMasterCopy {
  readonly masthead: string;
  readonly mastheadCaption: string;
  readonly banner: readonly string[];
  readonly location: string;
  readonly photoQuote: readonly string[];
  readonly photoStamp: readonly string[];
  readonly job: string;
  readonly record: string;
  readonly origin: string;
  readonly lineage: string;
  readonly affiliation: string;
}

export type CardMasterCopy = CinematicMasterCopy | EditorialMasterCopy | IdentityMasterCopy;

const ALTERNATE_CARD_COPY = {
  adventure: {
    cinematic: {
      ko: {
        promise: ['새로운 여정', '그 너머로', '나아가다'],
        quote: ['모든 길에는', '이야기가 있습니다.'],
        signature: ['한 걸음의 용기', '먼 여정을 엽니다'],
        place: '에오르제아',
      },
      en: {
        promise: ['PAST THE', 'NEXT HORIZON', 'AHEAD'],
        quote: ['Every horizon', 'starts with a step.'],
        signature: ['A path becomes', 'an adventure.'],
        place: 'EORZEA',
      },
      ja: {
        promise: ['その先の', '新たな冒険へ', '踏み出す'],
        quote: ['道の一歩が', '物語をひらく。'],
        signature: ['今日の一歩が', '明日へつながる'],
        place: 'エオルゼア',
      },
    },
    editorial: {
      ko: { story: '다음 장을 향해.', warriorOfLight: '길잡이' },
      en: { story: 'A new story unfolds.', warriorOfLight: 'WAYFINDER' },
      ja: { story: '新たな物語が始まる。', warriorOfLight: '旅の導き手' },
    },
    identity: {
      ko: {
        banner: ['모험', '여정', '기록'],
        location: '에오르제아',
        photoQuote: ['새로운 길에서', '모험이 시작됩니다.'],
        photoStamp: ['새로운 길을 향해', '오늘도 나아가다'],
      },
      en: {
        banner: ['QUEST', 'PATH', 'STORY'],
        location: 'EORZEA',
        photoQuote: ['Every horizon', 'opens a story.'],
        photoStamp: ['BEYOND THIS', 'HORIZON'],
      },
      ja: {
        banner: ['冒険', '旅路', '記録'],
        location: 'エオルゼア',
        photoQuote: ['その先の景色が', '物語をひらく。'],
        photoStamp: ['新たな旅路へ', '今日も一歩'],
      },
    },
  },
  companions: {
    cinematic: {
      ko: {
        promise: ['함께 걷는', '모험의', '기억'],
        quote: ['동료와 걷는 길', '더 멀리 이어집니다.'],
        signature: ['같이 나눈 하루가', '오래 남습니다'],
        place: '에오르제아',
      },
      en: {
        promise: ['BETTER', 'ADVENTURES', 'TOGETHER'],
        quote: ['Good company,', 'greater journeys.'],
        signature: ['Shared steps make', 'lasting stories.'],
        place: 'EORZEA',
      },
      ja: {
        promise: ['仲間とともに', '歩む旅路', 'その先へ'],
        quote: ['仲間と歩けば', '旅はもっと遠くへ。'],
        signature: ['ともに過ごした日々', '心に残る物語'],
        place: 'エオルゼア',
      },
    },
    editorial: {
      ko: { story: '좋은 동료와 이야기는 계속됩니다.', warriorOfLight: '동료' },
      en: { story: 'Good company, good stories.', warriorOfLight: 'ALLY' },
      ja: { story: '仲間とともに、物語は続く。', warriorOfLight: '仲間' },
    },
    identity: {
      ko: {
        banner: ['동료', '인연', '함께'],
        location: '에오르제아',
        photoQuote: ['함께한 걸음이', '긴 여정이 됩니다.'],
        photoStamp: ['나란히 걷는 하루', '오래 남는 이야기'],
      },
      en: {
        banner: ['ALLIES', 'BONDS', 'TOGETHER'],
        location: 'EORZEA',
        photoQuote: ['Good company', 'makes a great journey.'],
        photoStamp: ['SIDE BY SIDE', 'ALONG THE WAY'],
      },
      ja: {
        banner: ['仲間', '絆', 'ともに'],
        location: 'エオルゼア',
        photoQuote: ['仲間と歩む', '長い旅路へ。'],
        photoStamp: ['隣り合う一日', 'ともに歩む旅'],
      },
    },
  },
} as const;

const EMPTY_DECORATIVE_COPY = {
  cinematic: { promise: [], quote: [], signature: [], place: '' },
  editorial: { story: '', warriorOfLight: '' },
  identity: { banner: [], location: '', photoQuote: [], photoStamp: [] },
} as const;

const DECORATIVE_SAMPLE_BIO = {
  adventure: {
    ko: '새로운 여정이 시작됩니다.',
    en: 'A new journey begins.',
    ja: '新たな旅路が始まる。',
  },
  companions: {
    ko: '동료와 함께라면 더 멀리.',
    en: 'Better journeys together.',
    ja: '仲間と進む、遠い旅。',
  },
} as const;

/** Preserve each master's required labels while replacing only its optional localized copy slots. */
export function getCardMasterCopy(family: 'cinematic', locale: Locale, mode?: CardDecorativeCopy): CinematicMasterCopy;
export function getCardMasterCopy(family: 'editorial', locale: Locale, mode?: CardDecorativeCopy): EditorialMasterCopy;
export function getCardMasterCopy(family: 'identity', locale: Locale, mode?: CardDecorativeCopy): IdentityMasterCopy;
export function getCardMasterCopy(family: CardCopyFamily, locale: Locale, mode?: CardDecorativeCopy): CardMasterCopy;
export function getCardMasterCopy(
  family: CardCopyFamily,
  locale: Locale,
  mode?: CardDecorativeCopy,
): CardMasterCopy {
  const selectedMode = isCardDecorativeCopy(mode) ? mode : 'default';
  switch (family) {
    case 'cinematic': {
      const stock = CARD_STOCK_COPY.cinematic[locale];
      if (selectedMode === 'default') return stock;
      const decorative = selectedMode === 'none'
        ? EMPTY_DECORATIVE_COPY.cinematic
        : ALTERNATE_CARD_COPY[selectedMode].cinematic[locale];
      return { ...stock, ...decorative };
    }
    case 'editorial': {
      const stock = CARD_STOCK_COPY.editorial[locale];
      if (selectedMode === 'default') return stock;
      const decorative = selectedMode === 'none'
        ? EMPTY_DECORATIVE_COPY.editorial
        : ALTERNATE_CARD_COPY[selectedMode].editorial[locale];
      return { ...stock, ...decorative };
    }
    case 'identity': {
      const stock = CARD_STOCK_COPY.identity[locale];
      if (selectedMode === 'default') return stock;
      const decorative = selectedMode === 'none'
        ? EMPTY_DECORATIVE_COPY.identity
        : ALTERNATE_CARD_COPY[selectedMode].identity[locale];
      return { ...stock, ...decorative };
    }
  }
}

export function getCardCopyFamily(template: AdventurerCardTemplate): CardCopyFamily {
  return template === 'id-card' ? 'identity' : template;
}

export const CARD_LEGACY_COPY = CARD_STOCK_COPY.legacy;

const BUILT_IN_SAMPLE_IMAGE_URLS: ReadonlySet<string> = new Set(
  Object.values(conerSample.screenshots).flatMap(({ original, optimized }) => [original, optimized]),
);

/** Localize only the untouched built-in sample quote for its known image files. */
export function getCardDisplayBio(
  character: AdventurerCardCharacter,
  imageUrl: string,
  locale: Locale,
  mode: CardDecorativeCopy = 'default',
): string {
  const isUntouchedSampleBio = character.profileOrigin !== 'user' &&
    character.bio === conerSample.character.bio && BUILT_IN_SAMPLE_IMAGE_URLS.has(imageUrl);
  if (!isUntouchedSampleBio) return character.bio;
  if (mode === 'none') return '';
  if (mode === 'adventure' || mode === 'companions') return DECORATIVE_SAMPLE_BIO[mode][locale];
  return CARD_STOCK_COPY.sample.bio[locale];
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenStrings);
  return [];
}

/** All fixed glyphs rendered by cards in this locale, used before preview/export capture. */
export function getCardStaticText(
  locale: Locale,
  template?: AdventurerCardTemplate,
  mode: CardDecorativeCopy = 'default',
  layoutVariant: 'a' | 'b' | 'c' = 'a',
): string[] {
  const families: CardCopyFamily[] = template
    ? [getCardCopyFamily(template)]
    : ['cinematic', 'editorial', 'identity'];
  const master = layoutVariant === 'a'
    ? Object.fromEntries(families.map((family) => [family, getCardMasterCopy(family, locale, mode)]))
    : {};
  const legacy = layoutVariant !== 'a'
    ? Object.fromEntries(families.map((family) => [family, CARD_STOCK_COPY.legacy[family][locale]]))
    : {};

  return flattenStrings({ labels: CARD_UI_LABELS[locale], master, legacy, brand: CARD_STOCK_COPY.brand });
}

export function getCardPhotoAlt(name: string, locale: Locale): string {
  const separator = locale === 'ja' ? '' : ' ';
  return `${name}${separator}${CARD_UI_LABELS[locale].photoAltSuffix}`;
}

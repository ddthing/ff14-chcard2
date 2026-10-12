import type {
  AdventurerCardCharacter,
  AdventurerCardData,
  AdventurerCardDesign,
  AdventurerCardTemplate,
  CardTypographyOverride,
  CardTypographyRole,
} from '@/components/cards/types';
import {
  CARD_UI_LABELS,
  getCardCopyFamily,
  getCardDisplayBio,
  getCardMasterCopy,
  type CardMasterCopy,
  type CinematicMasterCopy,
  type EditorialMasterCopy,
  type IdentityMasterCopy,
} from '@/lib/card-copy';
import { getCardMicrocopy, localizeCardWorld } from '@/lib/card-microcopy';
import { localizeFfxivLabel } from '@/data/ffxiv';
import type { Locale } from '@/lib/types';

export type CardTextCategory = 'identity' | 'information' | 'copy';
export type CardTextItemKind =
  | 'text'
  | 'number'
  | 'job'
  | 'world'
  | 'dataCenter'
  | 'race'
  | 'clan'
  | 'grandCompany'
  | 'languages'
  | 'playStyles'
  | 'serviceRegion'
  | 'label';

export type CardTextSlotId =
  | `character.${keyof AdventurerCardCharacter & string}`
  | 'cinematic.promise'
  | 'cinematic.quote'
  | 'cinematic.signature'
  | 'cinematic.place'
  | `cinematic.label.${'job' | 'level' | 'worldDc' | 'freeCompany'}`
  | 'editorial.masthead'
  | 'editorial.story'
  | 'editorial.warriorOfLight'
  | `editorial.label.${'job' | 'service' | 'level' | 'world' | 'dataCenter' | 'lineage' | 'freeCompany'}`
  | 'identity.banner'
  | 'identity.location'
  | 'identity.photoQuote'
  | 'identity.photoStamp'
  | `identity.label.${'job' | 'level' | 'world' | 'dataCenter' | 'serviceRegion' | 'race' | 'clan' | 'freeCompany' | 'grandCompany' | 'languages' | 'playStyles'}`;

export interface CardTextItem {
  id: CardTextSlotId;
  label: string;
  category: CardTextCategory;
  role: CardTypographyRole;
  value: string;
  defaultValue: string;
  kind: CardTextItemKind;
  /** Canonical character fields keep using the existing normalized editor controls. */
  field?: keyof AdventurerCardCharacter;
  /** False for derived values such as a localized job abbreviation. */
  editable: boolean;
  /** False means the value comes from the character/data model rather than textOverrides. */
  supportsTextOverride: boolean;
  maxLength?: number;
  maxLines?: number;
  visible: boolean;
}

export type CardTextData = Pick<AdventurerCardData, 'character'> & {
  design: Pick<AdventurerCardDesign, 'template' | 'layoutVariant' | 'decorativeCopy'> &
    Partial<Pick<AdventurerCardDesign, 'textOverrides' | 'textTypography'>>;
  imageUrl?: string;
};

type ItemDefinition = Pick<CardTextItem, 'id' | 'label' | 'category' | 'role' | 'kind' | 'editable' | 'supportsTextOverride' | 'maxLength' | 'maxLines'> & {
  field?: keyof AdventurerCardCharacter;
  defaultValue: string;
};

const CHARACTER_LABELS = {
  ko: {
    name: '이름', job: '직업', level: '레벨', world: '서버', dataCenter: '데이터 센터', freeCompany: '자유부대',
    race: '종족', clan: '부족', grandCompany: '총사령부', languages: '언어', playStyles: '플레이 스타일', bio: '한 줄 소개',
    jobAbbreviation: '직업 약칭', origin: '서비스 · 지역',
  },
  en: {
    name: 'Name', job: 'Job', level: 'Level', world: 'World', dataCenter: 'Data center', freeCompany: 'Free company',
    race: 'Race', clan: 'Clan', grandCompany: 'Grand company', languages: 'Languages', playStyles: 'Play style', bio: 'Bio',
    jobAbbreviation: 'Job abbreviation', origin: 'Service / region',
  },
  ja: {
    name: '名前', job: 'ジョブ', level: 'レベル', world: 'ワールド', dataCenter: 'データセンター', freeCompany: 'フリーカンパニー',
    race: '種族', clan: '部族', grandCompany: 'グランドカンパニー', languages: '言語', playStyles: 'プレイスタイル', bio: '紹介文',
    jobAbbreviation: 'ジョブ略称', origin: 'サービス・地域',
  },
} as const satisfies Record<Locale, Record<string, string>>;

const SLOT_LABELS = {
  ko: {
    'cinematic.promise': '시네마틱 · 약속', 'cinematic.quote': '시네마틱 · 인용문', 'cinematic.signature': '시네마틱 · 서명', 'cinematic.place': '시네마틱 · 장소',
    'editorial.masthead': '에디토리얼 · 제호', 'editorial.story': '에디토리얼 · 이야기', 'editorial.warriorOfLight': '에디토리얼 · 빛의 전사',
    'identity.banner': '기록 카드 · 배너',
    'identity.location': '기록 카드 · 장소', 'identity.photoQuote': '기록 카드 · 사진 문구', 'identity.photoStamp': '기록 카드 · 사진 스탬프',
  },
  en: {
    'cinematic.promise': 'Cinematic · promise', 'cinematic.quote': 'Cinematic · quote', 'cinematic.signature': 'Cinematic · signature', 'cinematic.place': 'Cinematic · place',
    'editorial.masthead': 'Editorial · masthead', 'editorial.story': 'Editorial · story', 'editorial.warriorOfLight': 'Editorial · Warrior of Light',
    'identity.banner': 'Record · banner',
    'identity.location': 'Record · place', 'identity.photoQuote': 'Record · photo quote', 'identity.photoStamp': 'Record · photo stamp',
  },
  ja: {
    'cinematic.promise': 'シネマティック · メッセージ', 'cinematic.quote': 'シネマティック · 引用', 'cinematic.signature': 'シネマティック · サイン', 'cinematic.place': 'シネマティック · 場所',
    'editorial.masthead': 'エディトリアル · 題字', 'editorial.story': 'エディトリアル · 物語', 'editorial.warriorOfLight': 'エディトリアル · 光の戦士',
    'identity.banner': '記録カード · バナー',
    'identity.location': '記録カード · 場所', 'identity.photoQuote': '記録カード · 写真の文', 'identity.photoStamp': '記録カード · 写真のスタンプ',
  },
} as const satisfies Record<Locale, Record<string, string>>;

const LABEL_SLOT_NAMES = {
  ko: {
    job: '직업', level: '레벨', world: '서버', worldDc: '서버 · 데이터 센터', dataCenter: '데이터 센터',
    freeCompany: '자유부대', race: '종족', clan: '부족', grandCompany: '총사령부', languages: '언어',
    playStyles: '플레이 스타일', service: '서비스 · 지역', serviceRegion: '서비스 · 지역', lineage: '종족 · 부족',
  },
  en: {
    job: 'Job', level: 'Level', world: 'World', worldDc: 'World / data center', dataCenter: 'Data center',
    freeCompany: 'Free company', race: 'Race', clan: 'Clan', grandCompany: 'Grand company', languages: 'Languages',
    playStyles: 'Play style', service: 'Service / region', serviceRegion: 'Service / region', lineage: 'Race / clan',
  },
  ja: {
    job: 'ジョブ', level: 'レベル', world: 'ワールド', worldDc: 'ワールド・データセンター', dataCenter: 'データセンター',
    freeCompany: 'フリーカンパニー', race: '種族', clan: '部族', grandCompany: 'グランドカンパニー', languages: '言語',
    playStyles: 'プレイスタイル', service: 'サービス・地域', serviceRegion: 'サービス・地域', lineage: '種族・部族',
  },
} as const satisfies Record<Locale, Record<string, string>>;

const KNOWN_CHARACTER_FIELDS = [
  'name', 'job', 'level', 'world', 'dataCenter', 'freeCompany', 'race', 'clan', 'grandCompany',
  'languages', 'playStyles', 'bio', 'origin', 'jobAbbreviation',
] as const;

const COPY_SLOT_IDS: readonly CardTextSlotId[] = [
  'cinematic.promise', 'cinematic.quote', 'cinematic.signature', 'cinematic.place',
  'cinematic.label.job', 'cinematic.label.level', 'cinematic.label.worldDc', 'cinematic.label.freeCompany',
  'editorial.masthead', 'editorial.story', 'editorial.warriorOfLight',
  'editorial.label.job', 'editorial.label.service', 'editorial.label.level', 'editorial.label.world',
  'editorial.label.dataCenter', 'editorial.label.lineage', 'editorial.label.freeCompany',
  'identity.banner', 'identity.location', 'identity.photoQuote', 'identity.photoStamp',
  'identity.label.job', 'identity.label.level', 'identity.label.world', 'identity.label.dataCenter',
  'identity.label.serviceRegion', 'identity.label.race', 'identity.label.clan', 'identity.label.freeCompany',
  'identity.label.grandCompany', 'identity.label.languages', 'identity.label.playStyles',
];

const CHARACTER_TEXT_IDS: readonly CardTextSlotId[] = KNOWN_CHARACTER_FIELDS.map((field) => `character.${field}` as CardTextSlotId);
const KNOWN_TEXT_IDS = new Set<string>([...CHARACTER_TEXT_IDS, ...COPY_SLOT_IDS]);
const TEXT_OVERRIDE_IDS = new Set<string>(COPY_SLOT_IDS);

export function getCardTextMaxLength(id: string): number {
  if (id.includes('.label.')) return 48;
  if (id === 'cinematic.promise' || id === 'cinematic.quote' || id === 'cinematic.signature' ||
      id === 'identity.banner' || id === 'identity.photoQuote' || id === 'identity.photoStamp') return 160;
  return 96;
}

export function getCardTextMaxLines(id: string): number | undefined {
  switch (id) {
    case 'cinematic.promise': return 3;
    case 'cinematic.quote':
    case 'cinematic.signature':
    case 'identity.photoQuote':
    case 'identity.photoStamp': return 2;
    case 'cinematic.place':
    case 'editorial.masthead':
    case 'editorial.warriorOfLight':
    case 'identity.location': return 1;
    case 'editorial.story': return 6;
    case 'identity.banner': return 3;
    default: return id.includes('.label.') ? 2 : undefined;
  }
}

export function isKnownCardTextId(id: string): id is CardTextSlotId {
  return KNOWN_TEXT_IDS.has(id);
}

export function isCardTextOverrideId(id: string): id is CardTextSlotId {
  return TEXT_OVERRIDE_IDS.has(id);
}

/** Normalize persisted/editor text consistently without deleting intentional line breaks. */
export function normalizeCardTextOverride(value: unknown, id: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const maximum = getCardTextMaxLength(id);
  const normalizedLength = Array.from(value.replace(/\r\n?/gu, '\n')).slice(0, maximum).join('');
  const maximumLines = getCardTextMaxLines(id);
  const normalized = maximumLines === undefined ? normalizedLength : normalizedLength.split('\n').slice(0, maximumLines).join('\n');
  return normalized.trim().length === 0 ? '' : normalized;
}

export function resolveCardText(data: Pick<CardTextData, 'design'>, id: string, defaultValue: string): string {
  if (!isCardTextOverrideId(id)) return defaultValue;
  const override = data.design.textOverrides?.[id];
  return typeof override === 'string' ? normalizeCardTextOverride(override, id) ?? defaultValue : defaultValue;
}

export function resolveCardTextLines(data: Pick<CardTextData, 'design'>, id: string, defaultLines: readonly string[]): string[] {
  const text = resolveCardText(data, id, defaultLines.join('\n'));
  return text === '' ? [] : text.split('\n');
}

function copyOverride(data: CardTextData, id: string, defaultValue: string): string {
  return resolveCardText(data, id, defaultValue);
}

function getLabelDefault(locale: Locale, field: keyof typeof CHARACTER_LABELS.en): string {
  return CHARACTER_LABELS[locale][field];
}

function getSlotLabel(locale: Locale, id: string): string {
  const label = (SLOT_LABELS[locale] as Record<string, string>)[id];
  if (label) return label;
  const [, family, field] = id.match(/^(cinematic|editorial|identity)\.label\.(.+)$/u) ?? [];
  const fieldLabel = field ? (LABEL_SLOT_NAMES[locale] as Record<string, string>)[field] : undefined;
  if (fieldLabel) return `${familyLabel(locale, family)} · ${fieldLabel}`;
  return locale === 'ko'
    ? `${familyLabel(locale, family ?? 'cinematic')} · 카드 문구`
    : locale === 'ja'
      ? `${familyLabel(locale, family ?? 'cinematic')} · カード文言`
      : `${familyLabel(locale, family ?? 'cinematic')} · Card text`;
}

function familyLabel(locale: Locale, family: string): string {
  if (locale === 'ko') return family === 'identity' ? '기록 카드' : family === 'editorial' ? '에디토리얼' : '시네마틱';
  if (locale === 'ja') return family === 'identity' ? '記録カード' : family === 'editorial' ? 'エディトリアル' : 'シネマティック';
  return family === 'identity' ? 'Record' : family === 'editorial' ? 'Editorial' : 'Cinematic';
}

function item(
  data: CardTextData,
  locale: Locale,
  definition: ItemDefinition,
): CardTextItem {
  const value = definition.supportsTextOverride
    ? copyOverride(data, definition.id, definition.defaultValue)
    : definition.defaultValue;
  return {
    ...definition,
    label: definition.label || getSlotLabel(locale, definition.id),
    defaultValue: definition.defaultValue,
    value,
    visible: value.trim().length > 0,
  };
}

function characterItem(
  data: CardTextData,
  locale: Locale,
  field: keyof AdventurerCardCharacter,
  defaultValue: string,
  kind: CardTextItemKind,
  role: CardTypographyRole,
  category: CardTextCategory = field === 'name' ? 'identity' : 'information',
): CardTextItem {
  const id = `character.${field}` as CardTextSlotId;
  return item(data, locale, {
    id,
    label: getLabelDefault(locale, field as keyof typeof CHARACTER_LABELS.en),
    category,
    role,
    kind,
    field,
    editable: true,
    supportsTextOverride: false,
    defaultValue,
  });
}

function copyItem(data: CardTextData, locale: Locale, id: CardTextSlotId, defaultValue: string, role: CardTypographyRole, kind: CardTextItemKind = 'text'): CardTextItem {
  return item(data, locale, {
    id,
    label: getSlotLabel(locale, id),
    category: 'copy',
    role,
    kind,
    editable: true,
    supportsTextOverride: true,
    maxLength: getCardTextMaxLength(id),
    maxLines: getCardTextMaxLines(id),
    defaultValue,
  });
}

function labelItem(data: CardTextData, locale: Locale, id: CardTextSlotId, defaultValue: string): CardTextItem {
  return item(data, locale, {
    id,
    label: getSlotLabel(locale, id),
    category: 'information',
    role: 'label',
    kind: 'label',
    editable: true,
    supportsTextOverride: true,
    maxLength: getCardTextMaxLength(id),
    maxLines: getCardTextMaxLines(id),
    defaultValue,
  });
}

function derivedItem(data: CardTextData, locale: Locale, field: 'origin' | 'jobAbbreviation', value: string, role: CardTypographyRole): CardTextItem {
  const id = `character.${field}` as CardTextSlotId;
  return item(data, locale, {
    id,
    label: getLabelDefault(locale, field),
    category: 'information',
    role,
    kind: field === 'origin' ? 'serviceRegion' : 'job',
    editable: false,
    supportsTextOverride: false,
    defaultValue: value,
  });
}

/**
 * Returns the stable text slots for the active V3 master. Hidden and empty slots
 * remain in the list so the editor can restore them or add the first custom text.
 */
export function getCardTextItems(data: CardTextData, locale: Locale): CardTextItem[] {
  const { character } = data;
  const template: AdventurerCardTemplate = data.design.template;
  const family = getCardCopyFamily(template);
  const mode = data.design.layoutVariant === 'a' ? data.design.decorativeCopy : 'default';
  const labels = {
    job: localizeFfxivLabel('job', character.jobId ?? character.job, locale),
    world: localizeCardWorld(character, locale),
    dataCenter: localizeFfxivLabel('dataCenter', character.dataCenterId ?? character.dataCenter, locale),
    race: localizeFfxivLabel('race', character.raceId ?? character.race, locale),
    clan: localizeFfxivLabel('clan', character.clanId ?? character.clan, locale),
    grandCompany: localizeFfxivLabel('grandCompany', character.grandCompanyId ?? character.grandCompany, locale),
    languages: character.languages.map(value => localizeFfxivLabel('language', value, locale)),
    playStyles: character.playStyles.map(value => localizeFfxivLabel('playStyle', value, locale)),
  };
  const microcopy = getCardMicrocopy(character, locale);
  const bio = getCardDisplayBio(character, data.imageUrl ?? '', locale, mode);
  const ui = CARD_UI_LABELS[locale];
  const values = [
    characterItem(data, locale, 'name', character.name, 'text', 'display'),
  ];

  if (family === 'cinematic') {
    const copy = getCardMasterCopy('cinematic', locale, mode);
    values.push(
      characterItem(data, locale, 'job', labels.job, 'job', 'information'),
      characterItem(data, locale, 'level', character.level > 0 ? String(character.level) : '', 'number', 'information'),
      characterItem(data, locale, 'world', labels.world, 'world', 'information'),
      characterItem(data, locale, 'dataCenter', labels.dataCenter, 'dataCenter', 'information'),
      characterItem(data, locale, 'freeCompany', character.freeCompany, 'text', 'information'),
      characterItem(data, locale, 'bio', bio, 'text', 'secondaryDisplay'),
      copyItem(data, locale, 'cinematic.promise', copy.promise.join('\n'), 'micro'),
      copyItem(data, locale, 'cinematic.quote', copy.quote.join('\n'), 'caption'),
      copyItem(data, locale, 'cinematic.signature', copy.signature.join('\n'), 'caption'),
      copyItem(data, locale, 'cinematic.place', copy.place, 'micro'),
      labelItem(data, locale, 'cinematic.label.job', copy.job),
      labelItem(data, locale, 'cinematic.label.level', ui.level),
      labelItem(data, locale, 'cinematic.label.worldDc', copy.worldDc),
      labelItem(data, locale, 'cinematic.label.freeCompany', ui.freeCompany),
    );
  } else if (family === 'editorial') {
    const copy = getCardMasterCopy('editorial', locale, mode);
    const lineage = labels.race && labels.clan ? `${ui.race} / ${ui.clan}` : labels.race ? ui.race : ui.clan;
    values.push(
      characterItem(data, locale, 'job', labels.job, 'job', 'job'),
      characterItem(data, locale, 'level', character.level > 0 ? String(character.level) : '', 'number', 'information'),
      characterItem(data, locale, 'world', labels.world, 'world', 'information'),
      characterItem(data, locale, 'dataCenter', labels.dataCenter, 'dataCenter', 'information'),
      characterItem(data, locale, 'race', labels.race, 'race', 'information'),
      characterItem(data, locale, 'clan', labels.clan, 'clan', 'information'),
      characterItem(data, locale, 'freeCompany', character.freeCompany, 'text', 'information'),
      characterItem(data, locale, 'bio', bio, 'text', 'secondaryDisplay'),
      derivedItem(data, locale, 'jobAbbreviation', microcopy.jobAbbreviation, 'micro'),
      derivedItem(data, locale, 'origin', microcopy.origin, 'information'),
      copyItem(data, locale, 'editorial.masthead', copy.masthead, 'micro'),
      copyItem(data, locale, 'editorial.story', copy.story, 'caption'),
      copyItem(data, locale, 'editorial.warriorOfLight', copy.warriorOfLight, 'caption'),
      labelItem(data, locale, 'editorial.label.job', copy.job),
      labelItem(data, locale, 'editorial.label.service', copy.service),
      labelItem(data, locale, 'editorial.label.level', ui.level),
      labelItem(data, locale, 'editorial.label.world', ui.world),
      labelItem(data, locale, 'editorial.label.dataCenter', ui.dataCenter),
      labelItem(data, locale, 'editorial.label.lineage', lineage),
      labelItem(data, locale, 'editorial.label.freeCompany', ui.freeCompany),
    );
  } else {
    const copy = getCardMasterCopy('identity', locale, mode);
    values.push(
      characterItem(data, locale, 'job', labels.job, 'job', 'job'),
      characterItem(data, locale, 'level', character.level > 0 ? String(character.level) : '', 'number', 'display'),
      characterItem(data, locale, 'world', labels.world, 'world', 'information'),
      characterItem(data, locale, 'dataCenter', labels.dataCenter, 'dataCenter', 'information'),
      characterItem(data, locale, 'race', labels.race, 'race', 'information'),
      characterItem(data, locale, 'clan', labels.clan, 'clan', 'information'),
      characterItem(data, locale, 'freeCompany', character.freeCompany, 'text', 'information'),
      characterItem(data, locale, 'grandCompany', labels.grandCompany, 'grandCompany', 'information'),
      characterItem(data, locale, 'languages', labels.languages.join(' / '), 'languages', 'information'),
      characterItem(data, locale, 'playStyles', labels.playStyles.join(' · '), 'playStyles', 'information'),
      characterItem(data, locale, 'bio', bio, 'text', 'secondaryDisplay'),
      derivedItem(data, locale, 'jobAbbreviation', microcopy.jobAbbreviation, 'micro'),
      derivedItem(data, locale, 'origin', microcopy.origin, 'micro'),
      copyItem(data, locale, 'identity.banner', copy.banner.join('\n'), 'caption'),
      copyItem(data, locale, 'identity.location', copy.location, 'micro'),
      copyItem(data, locale, 'identity.photoQuote', copy.photoQuote.join('\n'), 'secondaryDisplay'),
      copyItem(data, locale, 'identity.photoStamp', copy.photoStamp.join('\n'), 'caption'),
      labelItem(data, locale, 'identity.label.job', copy.job),
      labelItem(data, locale, 'identity.label.level', ui.level),
      labelItem(data, locale, 'identity.label.world', ui.world),
      labelItem(data, locale, 'identity.label.dataCenter', ui.dataCenter),
      labelItem(data, locale, 'identity.label.serviceRegion', ui.serviceRegion),
      labelItem(data, locale, 'identity.label.race', ui.race),
      labelItem(data, locale, 'identity.label.clan', ui.clan),
      labelItem(data, locale, 'identity.label.freeCompany', ui.freeCompany),
      labelItem(data, locale, 'identity.label.grandCompany', ui.grandCompany),
      labelItem(data, locale, 'identity.label.languages', ui.languages),
      labelItem(data, locale, 'identity.label.playStyles', ui.playStyles),
    );
  }

  return values;
}

export function getCardTextValue(data: CardTextData, locale: Locale, id: CardTextSlotId): string {
  return getCardTextItems(data, locale).find((candidate) => candidate.id === id)?.value ?? '';
}

export function getCardTextDefault(data: CardTextData, locale: Locale, id: CardTextSlotId): string {
  return getCardTextItems(data, locale).find((candidate) => candidate.id === id)?.defaultValue ?? '';
}

/** Copy defaults plus supported saved overrides for a specific master. */
export function getCardMasterCopyForData(data: CardTextData, locale: Locale, family: 'cinematic'): CinematicMasterCopy;
export function getCardMasterCopyForData(data: CardTextData, locale: Locale, family: 'editorial'): EditorialMasterCopy;
export function getCardMasterCopyForData(data: CardTextData, locale: Locale, family: 'identity'): IdentityMasterCopy;
export function getCardMasterCopyForData(
  data: CardTextData,
  locale: Locale,
  family: 'cinematic' | 'editorial' | 'identity',
): CardMasterCopy;
export function getCardMasterCopyForData(
  data: CardTextData,
  locale: Locale,
  family: 'cinematic' | 'editorial' | 'identity',
): CardMasterCopy {
  const mode = data.design.layoutVariant === 'a' ? data.design.decorativeCopy : 'default';
  if (family === 'cinematic') {
    const copy = getCardMasterCopy('cinematic', locale, mode);
    return {
      ...copy,
      job: resolveCardText(data, 'cinematic.label.job', copy.job),
      worldDc: resolveCardText(data, 'cinematic.label.worldDc', copy.worldDc),
      promise: resolveCardTextLines(data, 'cinematic.promise', copy.promise),
      quote: resolveCardTextLines(data, 'cinematic.quote', copy.quote),
      signature: resolveCardTextLines(data, 'cinematic.signature', copy.signature),
      place: resolveCardText(data, 'cinematic.place', copy.place),
    };
  }
  if (family === 'editorial') {
    const copy = getCardMasterCopy('editorial', locale, mode);
    return {
      ...copy,
      job: resolveCardText(data, 'editorial.label.job', copy.job),
      service: resolveCardText(data, 'editorial.label.service', copy.service),
      masthead: resolveCardText(data, 'editorial.masthead', copy.masthead),
      story: resolveCardText(data, 'editorial.story', copy.story),
      warriorOfLight: resolveCardText(data, 'editorial.warriorOfLight', copy.warriorOfLight),
    };
  }
  const copy = getCardMasterCopy('identity', locale, mode);
  return {
    ...copy,
    banner: resolveCardTextLines(data, 'identity.banner', copy.banner),
    location: resolveCardText(data, 'identity.location', copy.location),
    photoQuote: resolveCardTextLines(data, 'identity.photoQuote', copy.photoQuote),
    photoStamp: resolveCardTextLines(data, 'identity.photoStamp', copy.photoStamp),
    job: resolveCardText(data, 'identity.label.job', copy.job),
  };
}

export function getCardTextTypographyOverride(
  design: Pick<AdventurerCardDesign, 'typography' | 'textTypography'>,
  id: CardTextSlotId,
  role: CardTypographyRole,
): CardTypographyOverride | undefined {
  return mergeCardTypographyOverrides(design.typography?.[role], design.textTypography?.[id]);
}

export function mergeCardTypographyOverrides(
  globalOverride: CardTypographyOverride | undefined,
  itemOverride: CardTypographyOverride | undefined,
): CardTypographyOverride | undefined {
  if (!globalOverride && !itemOverride) return undefined;
  const globalSize = globalOverride?.sizePercent ?? 100;
  const itemSize = itemOverride?.sizePercent ?? 100;
  const tracking = (globalOverride?.trackingEm ?? 0) + (itemOverride?.trackingEm ?? 0);
  return {
    ...(itemOverride?.fontFamily ?? globalOverride?.fontFamily
      ? { fontFamily: itemOverride?.fontFamily ?? globalOverride?.fontFamily }
      : {}),
    ...(globalOverride?.sizePercent !== undefined || itemOverride?.sizePercent !== undefined
      ? { sizePercent: globalSize * itemSize / 100 }
      : {}),
    ...(itemOverride?.weight ?? globalOverride?.weight) !== undefined
      ? { weight: itemOverride?.weight ?? globalOverride?.weight }
      : {},
    ...(tracking !== 0 ? { trackingEm: tracking } : {}),
  };
}

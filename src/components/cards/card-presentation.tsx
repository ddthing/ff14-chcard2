import Image from 'next/image';
import type { AdventurerCardData, CardRatio } from './types';
import type { Locale } from '@/lib/types';
import { getLanguage, localizeFfxivLabel } from '@/data/ffxiv';
import { getCardMicrocopy } from '@/lib/card-microcopy';
import { getCardNameLayout } from '@/lib/card-name-layout';
import styles from './CardPhoto.module.css';

export type MasterArtProps = { data: AdventurerCardData; locale: Locale; ratio?: CardRatio };

const UI = {
  ko: { level: '레벨', world: '월드', dataCenter: '데이터 센터', freeCompany: '자유부대', grandCompany: '총사령부', race: '종족', clan: '부족', unofficial: '비공식 · 팬메이드' },
  en: { level: 'LEVEL', world: 'WORLD', dataCenter: 'DATA CENTER', freeCompany: 'FREE COMPANY', grandCompany: 'GRAND COMPANY', race: 'RACE', clan: 'CLAN', unofficial: 'UNOFFICIAL / FAN-MADE' },
  ja: { level: 'レベル', world: 'ワールド', dataCenter: 'データセンター', freeCompany: 'フリーカンパニー', grandCompany: 'グランドカンパニー', race: '種族', clan: '部族', unofficial: '非公式・ファンメイド' },
};

/** Art-direction presentation uses the same canonical data and name resolver. */
export function getArtContext(data: AdventurerCardData, locale: Locale) {
  const character = data.character;
  const labels = {
    job: localizeFfxivLabel('job', character.jobId ?? character.job, locale),
    world: localizeFfxivLabel('world', character.worldId ?? character.world, locale),
    dataCenter: localizeFfxivLabel('dataCenter', character.dataCenterId ?? character.dataCenter, locale),
    race: localizeFfxivLabel('race', character.raceId ?? character.race, locale),
    clan: localizeFfxivLabel('clan', character.clanId ?? character.clan, locale),
    grandCompany: localizeFfxivLabel('grandCompany', character.grandCompanyId ?? character.grandCompany, locale),
    languages: character.languages.map(value => getLanguage(value)?.abbreviation ?? value.toUpperCase()),
    languageNames: character.languages.map(value => localizeFfxivLabel('language', value, locale)),
    playStyles: character.playStyles.map(value => localizeFfxivLabel('playStyle', value, locale)),
  };
  return { character, labels, ui: UI[locale], microcopy: getCardMicrocopy(character), nameLayout: getCardNameLayout(character.name, locale) };
}

/** Existing transform variables include the live editor override; no transform
 * is read or reset here. The production export waits for this same image. */
export function ArtPhoto({ data, className }: { data: AdventurerCardData; className: string }) {
  return <div className={`${styles.photo} ${className}`}>
    {data.imageUrl && <Image src={data.imageUrl} alt={`${data.character.name} adventurer portrait`} fill sizes="560px" loading="eager" unoptimized draggable={false} />}
  </div>;
}

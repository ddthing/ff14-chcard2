import Image from 'next/image';
import type { AdventurerCardData, CardRatio } from './types';
import type { Locale } from '@/lib/types';
import { CARD_STOCK_COPY, CARD_UI_LABELS, getCardDisplayBio, getCardPhotoAlt } from '@/lib/card-copy';
import { localizeFfxivLabel } from '@/data/ffxiv';
import { getCardMicrocopy, localizeCardWorld } from '@/lib/card-microcopy';
import { getCardNameLayout } from '@/lib/card-name-layout';
import styles from './CardPhoto.module.css';

export type MasterArtProps = { data: AdventurerCardData; locale: Locale; ratio?: CardRatio };

/** Art-direction presentation uses the same canonical data and name resolver. */
export function getArtContext(data: AdventurerCardData, locale: Locale) {
  const character = data.character;
  const labels = {
    job: localizeFfxivLabel('job', character.jobId ?? character.job, locale),
    world: localizeCardWorld(character, locale),
    dataCenter: localizeFfxivLabel('dataCenter', character.dataCenterId ?? character.dataCenter, locale),
    race: localizeFfxivLabel('race', character.raceId ?? character.race, locale),
    clan: localizeFfxivLabel('clan', character.clanId ?? character.clan, locale),
    grandCompany: localizeFfxivLabel('grandCompany', character.grandCompanyId ?? character.grandCompany, locale),
    languages: character.languages.map(value => localizeFfxivLabel('language', value, locale)),
    languageNames: character.languages.map(value => localizeFfxivLabel('language', value, locale)),
    playStyles: character.playStyles.map(value => localizeFfxivLabel('playStyle', value, locale)),
  };
  return {
    character,
    bio: getCardDisplayBio(character, data.imageUrl, locale),
    labels,
    ui: CARD_UI_LABELS[locale],
    copy: {
      cinematic: CARD_STOCK_COPY.cinematic[locale],
      editorial: CARD_STOCK_COPY.editorial[locale],
      identity: CARD_STOCK_COPY.identity[locale],
    },
    microcopy: getCardMicrocopy(character, locale),
    nameLayout: getCardNameLayout(character.name, locale),
  };
}

/** Existing transform variables include the live editor override; no transform
 * is read or reset here. The production export waits for this same image. */
export function ArtPhoto({ data, locale, className }: { data: AdventurerCardData; locale: Locale; className: string }) {
  return <div className={`${styles.photo} ${className}`}>
    {data.imageUrl && <Image src={data.imageUrl} alt={getCardPhotoAlt(data.character.name, locale)} fill sizes="560px" loading="eager" unoptimized draggable={false} />}
  </div>;
}

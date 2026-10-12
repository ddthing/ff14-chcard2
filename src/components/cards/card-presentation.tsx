import type { AdventurerCardData, CardRatio } from './types';
import type { Locale } from '@/lib/types';
import { CARD_UI_LABELS, getCardDisplayBio, getCardPhotoAlt } from '@/lib/card-copy';
import { getCardMasterCopyForData } from '@/lib/card-text-editing';
import { localizeFfxivLabel } from '@/data/ffxiv';
import { getCardMicrocopy, localizeCardWorld } from '@/lib/card-microcopy';
import { getCardNameLayout } from '@/lib/card-name-layout';
import { getPhotoPrintPaperContext } from '@/lib/photo-print-browser';
import { PhotoPrintImage } from './PhotoPrintImage';
import styles from './CardPhoto.module.css';

export type MasterArtProps = { data: AdventurerCardData; locale: Locale; ratio?: CardRatio };

/** Art-direction presentation uses the same canonical data and name resolver. */
export function getArtContext(data: AdventurerCardData, locale: Locale) {
  const character = data.character;
  const decorativeCopy = (data.design.layoutVariant ?? 'a') === 'a'
    ? data.design.decorativeCopy
    : 'default';
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
    bio: getCardDisplayBio(character, data.imageUrl, locale, decorativeCopy),
    labels,
    ui: CARD_UI_LABELS[locale],
    copy: {
      cinematic: getCardMasterCopyForData(data, locale, 'cinematic'),
      editorial: getCardMasterCopyForData(data, locale, 'editorial'),
      identity: getCardMasterCopyForData(data, locale, 'identity'),
    },
    microcopy: getCardMicrocopy(character, locale),
    nameLayout: getCardNameLayout(character.name, locale),
  };
}

/** Existing transform variables include the live editor override; no transform
 * is read or reset here. The production export waits for this same image. */
export function ArtPhoto({ data, locale, className, decorative = false }: { data: AdventurerCardData; locale: Locale; className: string; decorative?: boolean }) {
  return <div className={`${styles.photo} ${className}`} aria-hidden={decorative ? true : undefined}>
    {data.imageUrl && <PhotoPrintImage
      source={data.imageUrl}
      alt={decorative ? '' : getCardPhotoAlt(data.character.name, locale)}
      effects={data.design.effects}
      effectIntensity={data.design.effectIntensity}
      paperColor={data.design.palette.light}
      paperContext={getPhotoPrintPaperContext(data.design, data.character.jobId ?? data.character.job)}
    />}
  </div>;
}

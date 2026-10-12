import { demoAdventurerCards, type AdventurerCardCharacter, type AdventurerCardData, type AdventurerCardTemplate } from '@/components/cards/types';
import type { CardPalette } from '@/lib/palette';

/** Empty fallback for explicitly user-created profiles; legacy cards keep their sample-backed defaults. */
export function createEmptyUserCharacter(): AdventurerCardCharacter {
  return {
    profileOrigin: 'user',
    name: '',
    world: '',
    dataCenter: '',
    freeCompany: '',
    job: '',
    level: 0,
    race: '',
    clan: '',
    grandCompany: '',
    languages: [],
    playStyles: [],
    bio: '',
    service: null,
    physicalRegionId: null,
    dataCenterId: null,
    worldId: null,
    jobId: null,
    raceId: null,
    clanId: null,
    grandCompanyId: null,
  };
}

/** Builds a sparse user card from an uploaded image without borrowing the bundled sample identity. */
export function createNewUserCardFromUpload(
  template: AdventurerCardTemplate,
  imageUrl: string,
  palette: CardPalette,
): AdventurerCardData {
  const base = demoAdventurerCards[template];
  const imageAdjustments = {
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    exposure: 0,
  };
  const safePalette = { ...palette };

  return {
    character: createEmptyUserCharacter(),
    design: {
      ...base.design,
      colorMode: 'auto',
      decorativeCopy: 'none',
      palette: safePalette,
      accentColor: safePalette.accent,
      imagePosition: `${imageAdjustments.x}% ${imageAdjustments.y}%`,
      imageScale: imageAdjustments.scale,
      effects: [...base.design.effects],
    },
    imageUrl,
    imageAdjustments,
  };
}

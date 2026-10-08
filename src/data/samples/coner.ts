import type {
  AdventurerCardCharacter,
  AdventurerCardImageAdjustments,
  AdventurerCardTemplate,
  CardRatio,
} from '@/components/cards/types';

export type ConerScreenshotRole = 'landscape' | 'portrait';

type ConerSampleImageAdjustments = Pick<AdventurerCardImageAdjustments, 'x' | 'y' | 'scale'>;

export const conerSample = {
  character: {
    name: 'Coner',
    world: 'Moogle',
    dataCenter: 'Chaos',
    freeCompany: 'Ember Bloom',
    job: 'Red Mage',
    level: 100,
    race: 'Lalafell',
    clan: 'Dunesfolk',
    grandCompany: 'Immortal Flames',
    languages: ['ko', 'en'],
    playStyles: ['exploration', 'questing'],
    bio: 'Small steps, long journeys.',
    service: 'global',
    physicalRegionId: 'europe',
    dataCenterId: 'global.chaos',
    worldId: 'global.chaos.moogle',
    jobId: 'red-mage',
    raceId: 'lalafell',
    clanId: 'dunesfolk',
    grandCompanyId: 'immortal-flames',
  } satisfies AdventurerCardCharacter,
  screenshots: {
    landscape: {
      original: '/assets/samples/coner/original/landscape.png',
      optimized: '/assets/samples/coner/optimized/landscape.webp',
      width: 3840,
      height: 2160,
      // Existing browser Auto Color extractor, measured against this WebP.
      palette: { primary: '#757736', accent: '#53703e', light: '#f2f2ed', dark: '#242419' },
    },
    portrait: {
      original: '/assets/samples/coner/original/portrait.png',
      optimized: '/assets/samples/coner/optimized/portrait.webp',
      width: 2160,
      height: 3840,
      palette: { primary: '#8f561e', accent: '#609915', light: '#f3f0ed', dark: '#291f15' },
    },
  },
} as const;

const landscapeAdjustments: Record<CardRatio, ConerSampleImageAdjustments> = {
  '1:1': { x: 55, y: 50, scale: 1 },
  '4:5': { x: 60, y: 50, scale: 1 },
  '3:4': { x: 60, y: 50, scale: 1 },
  '9:16': { x: 75, y: 50, scale: 1 },
  '16:9': { x: 50, y: 50, scale: 1 },
};

const portraitAdjustments: Record<CardRatio, ConerSampleImageAdjustments> = {
  '1:1': { x: 50, y: 20, scale: 1 },
  '4:5': { x: 50, y: 20, scale: 1 },
  '3:4': { x: 50, y: 20, scale: 1 },
  '9:16': { x: 50, y: 50, scale: 1 },
  '16:9': { x: 50, y: 8, scale: 1 },
};

const neutralAdjustments = {
  rotation: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  exposure: 0,
} as const;

export function getConerScreenshotPresentation(
  template: AdventurerCardTemplate,
  ratio: CardRatio,
  roleOverride?: ConerScreenshotRole,
) {
  const role = roleOverride ?? (template === 'cinematic' ? 'landscape' : 'portrait');
  const source = conerSample.screenshots[role];
  const framing = { ...(role === 'landscape' ? landscapeAdjustments : portraitAdjustments)[ratio] };
  // The ID portrait window is shorter than the full card. Keep the hood and
  // raised hand above its name seam; this only applies to the supplied sample.
  if (template === 'id-card' && role === 'portrait') framing.y = 8;
  // Editorial's 9:16 brush is a short upper photo field. Bias the sample crop
  // upward so the face remains inside that silhouette; uploaded photos keep
  // the editor's stored image adjustments.
  if (template === 'editorial' && role === 'portrait' && ratio === '9:16') framing.y = 20;

  return {
    role,
    imageUrl: source.optimized,
    palette: { ...source.palette },
    imageAdjustments: { ...framing, ...neutralAdjustments } satisfies AdventurerCardImageAdjustments,
  };
}


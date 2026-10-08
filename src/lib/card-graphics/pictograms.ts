/** Original 32-unit printing glyphs; no game UI or third-party icon paths. */
// All marks share a 32-unit field. Offsets balance uneven visual mass while
// keeping each pictogram's established meaning and geometry intact.
export type CardPictogramKind =
  | 'world'
  | 'dataCenter'
  | 'service'
  | 'race'
  | 'clan'
  | 'grandCompany'
  | 'languages'
  | 'playStyles'
  | 'freeCompany';

type CardPictogramDefinition = {
  purpose: string;
  path: string;
  opticalOffset?: readonly [number, number];
};

export const CARD_PICTOGRAMS: Readonly<Record<CardPictogramKind, CardPictogramDefinition>> = {
 world: { purpose:'World', path:'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26ZM3 16h26M6 9h20M6 23h20M16 3c-8 7-8 19 0 26M16 3c8 7 8 19 0 26' },
 dataCenter: { purpose:'Data Center', path:'M5 27V13l4-3 4 3v14M19 27V13l4-3 4 3v14M13 27V6l3-3 3 3v21M3 27h26M9 10V6M23 10V6M13 18h6', opticalOffset:[0,.35] },
 service: { purpose:'Service and Region', path:'M16 2v5M16 25v5M2 16h5M25 16h5M16 6 26 16 16 26 6 16ZM16 10l3 6-3 6-3-6ZM8 8l3 3M21 21l3 3' },
 race: { purpose:'Race', path:'M11 8c0-7 10-7 10 0v4c0 7-10 7-10 0ZM6 28v-4c0-8 20-8 20 0v4M11 20l5 7 5-7M3 28h26', opticalOffset:[0,1.2] },
 clan: { purpose:'Clan', path:'M16 29V10M16 18C6 18 4 12 5 6c8 0 11 5 11 12ZM16 23c10 0 12-6 11-12-8 0-11 5-11 12ZM16 10c-4-4-3-8 0-9 3 1 4 5 0 9', opticalOffset:[0,.55] },
 grandCompany: { purpose:'Grand Company', path:'M6 30V3M6 5h20v17l-10-4-10 4M11 9h10M16 9v6M3 30h7M4 3h4', opticalOffset:[1.1,0] },
 languages: { purpose:'Languages', path:'M3 5h21v15H12l-6 6v-6H3ZM10 24h14l5 5V12h-3M7 10h13M7 15h9', opticalOffset:[0,-.85] },
 playStyles: { purpose:'Play Style', path:'M3 8 11 4l10 4 8-4v23l-8 4-10-4-8 4ZM11 4v23M21 8v23M6 21c4-9 8-7 11-3s6 1 9-5M5 13l3 1', opticalOffset:[-.7,-.9] },
 freeCompany: { purpose:'Free Company', path:'M13 9c-7-4-13 4-9 10l4 4c5 5 14-2 10-7M19 23c7 4 13-4 9-10l-4-4c-5-5-14 2-10 7M11 21l10-10', opticalOffset:[0,-.8] },
} as const;

/** XXD UI Kit icon names mapped to the adventure-record information fields. */
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
  iconName: 'Globe' | 'Network' | 'Navigation' | 'UserRound' | 'Users' | 'Shield' | 'Languages' | 'Activity' | 'Building';
};

export const CARD_PICTOGRAMS: Readonly<Record<CardPictogramKind, CardPictogramDefinition>> = {
  world: { purpose: 'World', iconName: 'Globe' },
  dataCenter: { purpose: 'Data Center', iconName: 'Network' },
  service: { purpose: 'Service and Region', iconName: 'Navigation' },
  race: { purpose: 'Race', iconName: 'UserRound' },
  clan: { purpose: 'Clan', iconName: 'Users' },
  grandCompany: { purpose: 'Grand Company', iconName: 'Shield' },
  languages: { purpose: 'Languages', iconName: 'Languages' },
  playStyles: { purpose: 'Play Style', iconName: 'Activity' },
  freeCompany: { purpose: 'Free Company', iconName: 'Building' },
} as const;

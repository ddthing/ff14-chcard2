export type JobIconTreatment = 'crest' | 'laurel' | 'ribbon' | 'compass' | 'sigil' | 'star' | 'technical';
export type JobMetadataTreatment = 'engraved' | 'ornate' | 'rhythmic' | 'technical' | 'classic' | 'minimal';

export interface JobTheme {
  /** Normalized key useful for data attributes and saved design state. */
  readonly id: string;
  /** User-facing job name as selected from the character form. */
  readonly label: string;
  /** Limited accent colors for the selected card family's existing components. */
  readonly accent: string;
  readonly secondary: string;
  readonly light: string;
  readonly dark: string;
  /** Hints for small icon/metadata flourishes; no layout changes are implied. */
  readonly iconTreatment: JobIconTreatment;
  readonly metadataTreatment: JobMetadataTreatment;
}

const FALLBACK_THEME: JobTheme = {
  id: 'adventurer',
  label: 'Adventurer',
  accent: '#b99b72',
  secondary: '#8795a1',
  light: '#f2eee7',
  dark: '#211f22',
  iconTreatment: 'star',
  metadataTreatment: 'classic',
};

/** A restrained accent treatment per job. Template geometry remains shared. */
export const JOB_THEMES: Readonly<Record<string, JobTheme>> = {
  'dark knight': {
    id: 'dark-knight', label: 'Dark Knight', accent: '#a64f5d', secondary: '#d3a0a2',
    light: '#f0e8e5', dark: '#251d22', iconTreatment: 'sigil', metadataTreatment: 'engraved',
  },
  'white mage': {
    id: 'white-mage', label: 'White Mage', accent: '#b9a16c', secondary: '#d6d0b8',
    light: '#f5f0e4', dark: '#282722', iconTreatment: 'laurel', metadataTreatment: 'ornate',
  },
  dancer: {
    id: 'dancer', label: 'Dancer', accent: '#b56e83', secondary: '#d1b282',
    light: '#f3e9e9', dark: '#30242b', iconTreatment: 'ribbon', metadataTreatment: 'rhythmic',
  },
  paladin: {
    id: 'paladin', label: 'Paladin', accent: '#8d9daf', secondary: '#c7a772',
    light: '#edf0f1', dark: '#20252c', iconTreatment: 'crest', metadataTreatment: 'classic',
  },
  warrior: {
    id: 'warrior', label: 'Warrior', accent: '#a96c53', secondary: '#c39c6b',
    light: '#f0e8df', dark: '#29211f', iconTreatment: 'crest', metadataTreatment: 'engraved',
  },
  gunbreaker: {
    id: 'gunbreaker', label: 'Gunbreaker', accent: '#aa7950', secondary: '#92a0a4',
    light: '#f0ebe4', dark: '#252422', iconTreatment: 'technical', metadataTreatment: 'technical',
  },
  dragoon: {
    id: 'dragoon', label: 'Dragoon', accent: '#687d9f', secondary: '#bd8b72',
    light: '#ececf0', dark: '#20232b', iconTreatment: 'crest', metadataTreatment: 'classic',
  },
  ninja: {
    id: 'ninja', label: 'Ninja', accent: '#9b5865', secondary: '#94a49e',
    light: '#efe7e8', dark: '#231f25', iconTreatment: 'sigil', metadataTreatment: 'minimal',
  },
  samurai: {
    id: 'samurai', label: 'Samurai', accent: '#b26c62', secondary: '#bd9a6c',
    light: '#f1e9e4', dark: '#2a2020', iconTreatment: 'sigil', metadataTreatment: 'classic',
  },
  reaper: {
    id: 'reaper', label: 'Reaper', accent: '#765b83', secondary: '#a87677',
    light: '#eee9ef', dark: '#241f28', iconTreatment: 'sigil', metadataTreatment: 'engraved',
  },
  bard: {
    id: 'bard', label: 'Bard', accent: '#879968', secondary: '#c5a474',
    light: '#edf0e7', dark: '#22271f', iconTreatment: 'ribbon', metadataTreatment: 'classic',
  },
  blackmage: {
    id: 'black-mage', label: 'Black Mage', accent: '#84709e', secondary: '#c08b69',
    light: '#eeeaf1', dark: '#211f28', iconTreatment: 'sigil', metadataTreatment: 'engraved',
  },
  'black mage': {
    id: 'black-mage', label: 'Black Mage', accent: '#84709e', secondary: '#c08b69',
    light: '#eeeaf1', dark: '#211f28', iconTreatment: 'sigil', metadataTreatment: 'engraved',
  },
  summoner: {
    id: 'summoner', label: 'Summoner', accent: '#6e98a1', secondary: '#a5ad82',
    light: '#e8f0ef', dark: '#202729', iconTreatment: 'star', metadataTreatment: 'classic',
  },
  redmage: {
    id: 'red-mage', label: 'Red Mage', accent: '#a34f5a', secondary: '#ddd0b4',
    light: '#f1e8e5', dark: '#292023', iconTreatment: 'ribbon', metadataTreatment: 'ornate',
  },
  'red mage': {
    id: 'red-mage', label: 'Red Mage', accent: '#a34f5a', secondary: '#ddd0b4',
    light: '#f1e8e5', dark: '#292023', iconTreatment: 'ribbon', metadataTreatment: 'ornate',
  },
  astrologian: {
    id: 'astrologian', label: 'Astrologian', accent: '#7792ac', secondary: '#c6a779',
    light: '#eaf0f4', dark: '#20262d', iconTreatment: 'star', metadataTreatment: 'ornate',
  },
  scholar: {
    id: 'scholar', label: 'Scholar', accent: '#788c78', secondary: '#c0a36e',
    light: '#ebefe7', dark: '#222720', iconTreatment: 'laurel', metadataTreatment: 'classic',
  },
  sage: {
    id: 'sage', label: 'Sage', accent: '#7f9b9c', secondary: '#bea474',
    light: '#eaf0ee', dark: '#212828', iconTreatment: 'technical', metadataTreatment: 'technical',
  },
  machinist: {
    id: 'machinist', label: 'Machinist', accent: '#78848d', secondary: '#c09166',
    light: '#e9edef', dark: '#22272a', iconTreatment: 'technical', metadataTreatment: 'technical',
  },
  monk: {
    id: 'monk', label: 'Monk', accent: '#ae765f', secondary: '#bf9b73',
    light: '#f0e9e1', dark: '#2b2420', iconTreatment: 'crest', metadataTreatment: 'classic',
  },
  viper: {
    id: 'viper', label: 'Viper', accent: '#71836b', secondary: '#b98770',
    light: '#ebeee7', dark: '#222620', iconTreatment: 'sigil', metadataTreatment: 'minimal',
  },
  pictomancer: {
    id: 'pictomancer', label: 'Pictomancer', accent: '#ad758b', secondary: '#d0aa78',
    light: '#f1e9ed', dark: '#2b2228', iconTreatment: 'ribbon', metadataTreatment: 'rhythmic',
  },
  'blue mage': {
    id: 'blue-mage', label: 'Blue Mage', accent: '#648da4', secondary: '#c29b69',
    light: '#e7eef2', dark: '#20272b', iconTreatment: 'star', metadataTreatment: 'classic',
  },
};

function normalizeJob(job: string): string {
  return job.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Resolve the selected job to small theme tokens, with a safe generic fallback. */
export function getJobTheme(job: string | null | undefined): JobTheme {
  if (!job?.trim()) return FALLBACK_THEME;
  return JOB_THEMES[normalizeJob(job)] ?? FALLBACK_THEME;
}


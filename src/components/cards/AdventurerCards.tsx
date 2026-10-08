import type { CSSProperties, ReactNode } from 'react';
import { profileRender } from '@/lib/performance-profile';
import Image from 'next/image';
import { getJobTheme } from '@/lib/job-themes';
import type { Locale } from '@/lib/types';
import { JobIcon } from '@/components/ffxiv/job-icon';
import { FFXIVAttribution } from '@/components/ffxiv/ffxiv-attribution';
import { getJob, localizeFfxivLabel } from '@/data/ffxiv';
import {
  detectTypographyScript,
  getMasterTypographyFamily,
  getMasterTypographyTreatment,
  getTypographyFontFamily,
  getTypographyPreset,
  type MasterTypographyRole,
  type TypographyScript,
} from '@/lib/typography-presets';
import { resolveJobIcon } from '@/lib/ffxiv-assets';
import { getCardNameLayout } from '@/lib/card-name-layout';
import { getCardMicrocopy, localizeCardWorld } from '@/lib/card-microcopy';
import { CARD_LEGACY_COPY, CARD_UI_LABELS, getCardDisplayBio, getCardPhotoAlt } from '@/lib/card-copy';
import { getMasterArtProperties } from '@/lib/card-art-tokens';
import { getCardMaterialAssets } from '@/lib/card-materials';
import { getCraftMaterialProperties } from '@/lib/card-graphics/materials';
import { MASTER_CARD_CONFIG, MASTER_DESIGN_VERSION, MASTER_VISUAL_VERSION } from '@/lib/master-card-config';
import { CinematicMaster } from './masters/cinematic-master';
import { EditorialMaster } from './masters/editorial-master';
import { IdentityMaster } from './masters/identity-master';
import styles from './Cards.module.css';
import renderScopeStyles from './card-render-scope.module.css';
import type { AdventurerCardCharacter, AdventurerCardData, CardRatio } from './types';

type CardCustomProperties = CSSProperties & Record<string, string | number>;

export interface CardImageAdjustment {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
}

type ExtendedCardData = AdventurerCardData & {
  imageAdjustments?: Partial<CardImageAdjustment>;
};

type ExtendedDesign = AdventurerCardData['design'] & {
  layoutVariant?: 'a' | 'b' | 'c';
  colorMode?: 'auto' | 'job' | 'custom';
  palette?: Partial<Record<'primary' | 'accent' | 'light' | 'dark', string>>;
};

type CharacterWithDomainIds = AdventurerCardCharacter & {
  jobId?: string;
  service?: string;
  physicalRegionId?: string;
  dataCenterId?: string;
  worldId?: string;
  raceId?: string;
  clanId?: string;
  grandCompanyId?: string;
};

type LocalizedCharacterFields = {
  job: string;
  world: string;
  dataCenter: string;
  race: string;
  clan: string;
  grandCompany: string;
  languages: string[];
  languageNames: string[];
  playStyles: string[];
};

export interface AdventurerCardProps {
  data: AdventurerCardData;
  ratio?: CardRatio;
  className?: string;
  highlightField?: string;
  imageAdjustment?: Partial<CardImageAdjustment>;
  locale?: Locale;
}

/* Keep the persisted image transform optional while older demo data and drafts migrate. */
type LegacyCardImageAdjustment = {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    exposure?: number;
};

const MASTER_TYPOGRAPHY_ROLES: readonly MasterTypographyRole[] = [
  'display', 'secondaryDisplay', 'job', 'information', 'label', 'caption', 'micro',
];

function getMasterTypographyProperties(
  template: AdventurerCardData['design']['template'],
  scriptByRole: Readonly<Record<MasterTypographyRole, TypographyScript>>,
): CardCustomProperties {
  const family = getMasterTypographyFamily(template);
  const properties: CardCustomProperties = {};

  for (const role of MASTER_TYPOGRAPHY_ROLES) {
    const script = scriptByRole[role];
    if (script === 'latin' && role !== 'display') continue;

    const treatment = getMasterTypographyTreatment(family, role, script);
    const cssRole = role.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
    properties[`--master-font-${cssRole}`] = treatment.fontFamily;

    // Master display families are fixed across scripts and presets. Preserve
    // each approved Latin role's weight, tracking, and leading selectors.
    if (script === 'latin') continue;

    properties[`--master-${cssRole}-weight`] = treatment.weight;
    properties[`--master-${cssRole}-tracking`] = treatment.tracking;
    properties[`--master-${cssRole}-leading`] = treatment.lineHeight;
  }

  return properties;
}

const DEFAULT_PALETTE = { primary: '#c5a474', accent: '#c5a474', light: '#f3ede3', dark: '#111315' };

function getLocalizedCharacterFields(character: AdventurerCardCharacter, locale: Locale): LocalizedCharacterFields {
  const domainCharacter = character as CharacterWithDomainIds;
  return {
    job: localizeFfxivLabel('job', domainCharacter.jobId ?? character.job, locale),
    world: localizeCardWorld(character, locale),
    dataCenter: localizeFfxivLabel('dataCenter', domainCharacter.dataCenterId ?? character.dataCenter, locale),
    race: localizeFfxivLabel('race', domainCharacter.raceId ?? character.race, locale),
    clan: localizeFfxivLabel('clan', domainCharacter.clanId ?? character.clan, locale),
    grandCompany: localizeFfxivLabel('grandCompany', domainCharacter.grandCompanyId ?? character.grandCompany, locale),
    languages: character.languages.map((language) => localizeFfxivLabel('language', language, locale)),
    languageNames: character.languages.map((language) => localizeFfxivLabel('language', language, locale)),
    playStyles: character.playStyles.map((playStyle) => localizeFfxivLabel('playStyle', playStyle, locale)),
  };
}

function getJobVisuals(character: AdventurerCardCharacter) {
  const domainCharacter = character as CharacterWithDomainIds;
  const record = getJob(domainCharacter.jobId ?? character.job);
  const legacyTheme = getJobTheme(record?.localizedName.en ?? character.job);
  return {
    id: domainCharacter.jobId ?? record?.id ?? '',
    role: record?.category ?? record?.role ?? '',
    label: localizeFfxivLabel('job', domainCharacter.jobId ?? character.job, 'en'),
    known: Boolean(record),
    accent: record?.themeAccent ?? legacyTheme.accent,
    secondary: record?.themeSecondary ?? legacyTheme.secondary,
    light: legacyTheme.light,
    dark: legacyTheme.dark,
    iconTreatment: legacyTheme.iconTreatment,
    metadataTreatment: legacyTheme.metadataTreatment,
  };
}

function blendHexColors(base: string, accent: string, accentWeight = 0.22): string {
  const toRgb = (value: string): [number, number, number] | null => {
    const hex = value.trim().replace(/^#/, '');
    if (/^[\da-f]{3}$/i.test(hex)) {
      return hex.split('').map((part) => Number.parseInt(part + part, 16)) as [number, number, number];
    }
    if (/^[\da-f]{6}$/i.test(hex)) {
      return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
    }
    return null;
  };
  const baseRgb = toRgb(base);
  const accentRgb = toRgb(accent);
  if (!baseRgb || !accentRgb) return base;
  const mixed = baseRgb.map((channel, index) => Math.round(channel * (1 - accentWeight) + accentRgb[index] * accentWeight));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function estimateNameWidth(name: string): number {
  return Array.from(name.trim()).reduce((width, character) => {
    if (/\s/u.test(character)) return width + 0.28;
    if (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef\u3040-\u30ff]/u.test(character)) return width + 1;
    if (/[MW@#%&]/iu.test(character)) return width + 0.76;
    return width + 0.55;
  }, 0);
}

function getJobIconColor(value: string | null | undefined): string | null {
  const color = value?.trim();
  return color && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.test(color) ? color : null;
}

function CardAssetAttribution({ locale }: { character: AdventurerCardCharacter; jobId: string; locale: Locale; visible?: boolean }) {
  return <FFXIVAttribution className={styles.cardAttribution} locale={locale} variant="card" />;
}

function getCardProperties(
  data: AdventurerCardData,
  ratio: CardRatio | undefined,
  adjustmentOverride: Partial<CardImageAdjustment> | undefined,
  locale: Locale,
): CardCustomProperties {
  const extended = data as ExtendedCardData;
  const design = data.design as ExtendedDesign;
  const resolvedRatio = ratio ?? data.design.ratio ?? '4:5';
  const [width, height] = resolvedRatio.split(':');
  const adjustments: LegacyCardImageAdjustment = { ...extended.imageAdjustments, ...adjustmentOverride };
  const legacyPosition = data.design.imagePosition?.match(/([\d.]+)%\s+([\d.]+)%/);
  const imageX = adjustments.x ?? Number(legacyPosition?.[1] ?? 50);
  const imageY = adjustments.y ?? Number(legacyPosition?.[2] ?? 50);
  const exposure = adjustments.exposure ?? 0;
  const palette = { ...DEFAULT_PALETTE, ...design.palette };
  if (!design.palette?.accent) palette.accent = data.design.accentColor || DEFAULT_PALETTE.accent;
  const jobTheme = getJobVisuals(data.character);
  const colors = design.colorMode === 'job'
    ? (design.layoutVariant ?? 'a') === 'a'
      ? { ...palette, accent: jobTheme.accent }
      : { primary: jobTheme.secondary, accent: jobTheme.accent, light: jobTheme.light, dark: jobTheme.dark }
    : design.colorMode === 'auto' && jobTheme.known
      ? { ...palette, accent: blendHexColors(palette.accent, jobTheme.accent) }
      : palette;
  const scale = adjustments.scale ?? data.design.imageScale ?? 1;
  const brightness = (adjustments.brightness ?? 1) * 2 ** exposure;
  const localized = getLocalizedCharacterFields(data.character, locale);
  const displayBio = getCardDisplayBio(data.character, data.imageUrl, locale);
  const typography = data.design.typographyPreset as string;
  const localeScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const displayScript = detectTypographyScript(data.character.name, localeScript);
  const bodyScript = detectTypographyScript(displayBio, localeScript);
  const metadataScript = detectTypographyScript(`${localized.job} ${localized.world} ${localized.dataCenter}`, localeScript);
  const informationScript = detectTypographyScript(
    `${localized.job} ${localized.world} ${localized.dataCenter} ${data.character.freeCompany} ${localized.grandCompany}`,
    localeScript,
  );
  const typePreset = getTypographyPreset(typography);
  const nameWidth = estimateNameWidth(data.character.name);
  const nameScale = Math.max(0.54, Math.min(1, 20 / Math.max(1, nameWidth)));
  const nameLayout = getCardNameLayout(data.character.name, locale);
  const cjk = nameLayout.script !== 'latin';
  const nameBase = nameLayout.category === 'short' ? cjk ? 18 : 16 : nameLayout.category === 'medium' ? 15.2 : 11.5;
  const nameSize = Math.min(nameBase, 72 / nameLayout.maxLineUnits);
  const nameLeading = cjk ? 1.03 : 0.91;
  const jobIconColor = getJobIconColor(design.jobIconColor);
  const microcopy = getCardMicrocopy(data.character, locale);
  const isMaster = (design.layoutVariant ?? 'a') === 'a';
  const masterTypographyProperties = isMaster
    ? getMasterTypographyProperties(data.design.template, {
      display: displayScript,
      secondaryDisplay: detectTypographyScript(displayBio, localeScript),
      job: detectTypographyScript(`${localized.job} ${microcopy.jobAbbreviation ?? ''}`, localeScript),
      information: informationScript,
      label: localeScript,
      caption: detectTypographyScript(
        `${microcopy.origin ?? ''} ${CARD_UI_LABELS[locale].unofficial} ${displayBio} ${data.character.freeCompany} ${localized.playStyles.join(' ')}`,
        localeScript,
      ),
      micro: localeScript,
    })
    : {};

  return {
    aspectRatio: `${width} / ${height}`,
    '--card-primary': colors.primary || '#b79a72',
    '--card-accent': colors.accent || data.design.accentColor || '#b79a72',
    '--card-light': colors.light,
    '--card-dark': colors.dark,
    ...(jobIconColor ? { '--job-motif-color': jobIconColor, '--job-icon-color': jobIconColor } : {}),
    '--card-image-position': `${imageX}% ${imageY}%`,
    '--card-image-scale': scale,
    '--card-image-rotation': `${adjustments.rotation ?? 0}deg`,
    '--card-image-brightness': brightness,
    '--card-image-contrast': adjustments.contrast ?? 1,
    '--card-image-saturation': adjustments.saturation ?? 1,
    '--card-font-display': getTypographyFontFamily(typography, 'display', displayScript),
    '--card-font-body': getTypographyFontFamily(typography, 'body', bodyScript),
    '--card-font-metadata': getTypographyFontFamily(typography, 'metadata', metadataScript),
    '--card-font-information': getTypographyFontFamily('modern', 'display', displayScript),
    '--card-font-caption': getTypographyFontFamily('modern', 'body', metadataScript),
    '--card-font-story': getTypographyFontFamily(bodyScript === 'latin' ? 'classic' : typography, bodyScript === 'latin' ? 'display' : 'body', bodyScript),
    '--card-font-world': getTypographyFontFamily(typography, 'display', detectTypographyScript(localized.world, localeScript)),
    '--card-display-weight': typePreset.displayWeight,
    '--card-display-tracking': typePreset.displayTracking,
    '--card-metadata-tracking': typePreset.metadataTracking,
    '--card-display-transform': typePreset.displayTransform,
    '--card-name-scale': nameScale,
    '--editorial-name-size': `${nameSize}cqi`,
    '--editorial-name-wide': `${Math.min(nameLayout.category === 'short' ? 9.5 : 8.3, 39 / nameLayout.maxLineUnits)}cqi`,
    '--editorial-name-leading': nameLeading,
    '--editorial-photo-offset': `${3.4 + (Math.max(0, nameLayout.lines.length - 1) + 0.65) * nameSize * nameLeading}cqi`,
    ...((design.layoutVariant ?? 'a') === 'a' ? getMasterArtProperties(data.design.template, colors, resolvedRatio) : {}),
    ...((design.layoutVariant ?? 'a') === 'a' ? getCraftMaterialProperties(data.design.template, colors, design.colorMode, jobTheme.accent) : {}),
    ...masterTypographyProperties,
  };
}

/** Family-local material images are decoded in Preview and Export before paint. */
function MasterMaterial({ family }: { family: AdventurerCardData['design']['template'] }) {
  return (
    <div className={styles.masterMaterial} aria-hidden="true" data-material-preload="true">
      {getCardMaterialAssets(family).map(({ role, src }) => (
        <Image key={role} src={src} alt="" width={1280} height={1600} unoptimized loading="eager" />
      ))}
    </div>
  );
}

function CardImage({ data, locale, className }: { data: AdventurerCardData; locale: Locale; className: string }) {
  const { character, imageUrl } = data;

  return (
    <div className={className}>
      {imageUrl ? (
        <Image
          fill
          src={imageUrl}
          alt={getCardPhotoAlt(character.name, locale)}
          sizes="(max-width: 640px) 90vw, (max-width: 1200px) 42vw, 560px"
          loading="eager"
          decoding="async"
          unoptimized={imageUrl.startsWith('/images/') || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')}
          draggable={false}
        />
      ) : (
        <div className={styles.imageFallback} aria-hidden="true" />
      )}
    </div>
  );
}

function CardRoot({
  data,
  ratio,
  className,
  children,
  template,
  highlightField,
  imageAdjustment,
  locale,
}: {
  data: AdventurerCardData;
  ratio?: CardRatio;
  className?: string;
  children: ReactNode;
  template: AdventurerCardData['design']['template'];
  highlightField?: string;
  imageAdjustment?: Partial<CardImageAdjustment>;
  locale?: Locale;
}) {
  const resolvedRatio = ratio ?? data.design.ratio ?? '4:5';
  const effects = data.design.effects.join(' ');
  const rootClass = [styles.card, renderScopeStyles.root, className].filter(Boolean).join(' ');
  const extendedDesign = data.design as ExtendedDesign;
  const job = getJobVisuals(data.character);
  const layoutVariant = extendedDesign.layoutVariant ?? 'a';
  const nameWidth = estimateNameWidth(data.character.name);
  const resolvedLocale = locale ?? 'en';
  const nameLayout = getCardNameLayout(data.character.name, resolvedLocale);

  return (
    <article
      className={rootClass}
      style={getCardProperties(data, resolvedRatio, imageAdjustment, resolvedLocale)}
      data-template={template}
      data-ratio={resolvedRatio}
      data-material-texture={layoutVariant === 'a' ? 'on' : undefined}
      data-effects={effects}
      data-typography={data.design.typographyPreset}
      data-layout={layoutVariant}
      data-master-direction={layoutVariant === 'a' ? MASTER_CARD_CONFIG[template].direction : undefined}
      data-master-id={layoutVariant === 'a' ? MASTER_CARD_CONFIG[template].id : undefined}
      data-master-visual-version={layoutVariant === 'a' ? MASTER_VISUAL_VERSION : undefined}
      data-design-version={layoutVariant === 'a' ? MASTER_DESIGN_VERSION : undefined}
      data-card-render-scope="true"
      data-name-length={nameWidth >= 15 ? 'long' : 'regular'}
      data-name-script={nameLayout.script}
      data-name-composition={nameLayout.category}
      data-name-lines={nameLayout.lines.length}
      data-color-mode={extendedDesign.colorMode ?? 'auto'}
      data-job={job.label}
      data-job-id={job.id || undefined}
      data-job-role={job.role || undefined}
      data-job-known={job.known ? 'true' : undefined}
      data-job-icon={extendedDesign.colorMode === 'job' ? job.iconTreatment : undefined}
      data-job-metadata={extendedDesign.colorMode === 'job' ? job.metadataTreatment : undefined}
      data-highlight-field={highlightField}
      data-locale={resolvedLocale}
      lang={resolvedLocale}
      aria-label={`${data.character.name}, ${getLocalizedCharacterFields(data.character, resolvedLocale).job} ${CARD_UI_LABELS[resolvedLocale].cardAltSuffix}`}
    >
      {children}
      {layoutVariant === 'a' && <MasterMaterial family={data.design.template} />}
    </article>
  );
}

export function CinematicCard({ data, ratio, className, highlightField, imageAdjustment, locale = 'en' }: AdventurerCardProps) {
  profileRender('CinematicCard');
  const { character } = data;
  const displayBio = getCardDisplayBio(character, data.imageUrl, locale);
  const labels = getLocalizedCharacterFields(character, locale);
  const ui = CARD_UI_LABELS[locale];
  const job = getJobVisuals(character);
  const master = (data.design.layoutVariant ?? 'a') === 'a';
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const microcopy = getCardMicrocopy(character, locale);
  const copy = CARD_LEGACY_COPY.cinematic[locale];

  if (master) return <CardRoot data={data} ratio={ratio} className={className} template="cinematic" highlightField={highlightField} imageAdjustment={imageAdjustment} locale={locale}>
    <CinematicMaster data={data} locale={locale} ratio={ratio} />
    <CardAssetAttribution character={character} jobId={job.id} locale={locale} visible={jobMotifVisible} />
  </CardRoot>;

  return (
    <CardRoot data={data} ratio={ratio} className={className} template="cinematic" highlightField={highlightField} imageAdjustment={imageAdjustment} locale={locale}>
      <CardImage data={data} locale={locale} className={styles.cinematicArt} />
      <div className={styles.cinematicShade} aria-hidden="true" />
      <div className={styles.cinematicFrame} aria-hidden="true" />
      {jobMotifVisible && (!master || resolveJobIcon({ jobId: job.id, usage: 'cardSmall' })) && <div className={styles.cinematicJobEmblem}>
        <JobIcon jobId={job.id || null} role={job.role || null} label={labels.job} size={34} usage="cardSmall" decorative />
      </div>}
      <CardAssetAttribution character={character} jobId={job.id} locale={locale} visible={jobMotifVisible} />
      <div className={styles.cinematicContent}>
        <div className={styles.cinematicMasthead}>
          <span>{master && microcopy.jobAbbreviation && <b className={styles.cinematicIndex}>{microcopy.jobAbbreviation}</b>}{copy.title}</span>
          {master ? microcopy.origin && <span>{microcopy.origin}</span> : <span>{copy.location}</span>}
        </div>

        <div className={styles.cinematicBase}>
          <div className={styles.cinematicIdentity}>
            {labels.grandCompany.trim() && <p className={styles.cinematicEyebrow} data-field="grandCompany">{labels.grandCompany}</p>}
            <h2 data-field="name">{character.name}</h2>
            <p className={styles.cinematicJobline}>
              <span data-field="job">{labels.job}</span>
              <span aria-hidden="true">/</span>
              <span>{ui.level} <span data-field="level">{character.level}</span></span>
            </p>
            {master && (labels.race || labels.clan) && <p className={styles.cinematicLineage}><span data-field="race">{labels.race}</span>{labels.race && labels.clan && <span aria-hidden="true"> / </span>}<span data-field="clan">{labels.clan}</span></p>}
          </div>

          <div className={styles.cinematicDetails}>
            {displayBio.trim() && <p className={styles.cinematicBio} data-field="bio">{displayBio}</p>}
            <dl className={styles.cinematicFacts}>
              <div>
                <dt>{ui.world}</dt>
                <dd data-field="world">{labels.world}</dd>
              </div>
              {labels.dataCenter && <div>
                <dt>{ui.dataCenter}</dt>
                <dd data-field="dataCenter">{labels.dataCenter}</dd>
              </div>}
              {character.freeCompany.trim() && <div className={styles.cinematicCompany}>
                <dt>{ui.freeCompany}</dt>
                <dd data-field="freeCompany">{character.freeCompany}</dd>
              </div>}
            </dl>
          </div>
        </div>
        {(labels.languages.length > 0 || labels.playStyles.length > 0) && <footer className={styles.cinematicFootnote}>
          {labels.playStyles.length > 0 && <span data-field="playStyles">{labels.playStyles.join(' · ')}</span>}
          {labels.languages.length > 0 && <span data-field="languages" aria-label={labels.languageNames.join(', ')}>{labels.languages.join(' / ')}</span>}
        </footer>}
      </div>
    </CardRoot>
  );
}

export function EditorialCard({ data, ratio, className, highlightField, imageAdjustment, locale = 'en' }: AdventurerCardProps) {
  profileRender('EditorialCard');
  const { character } = data;
  const displayBio = getCardDisplayBio(character, data.imageUrl, locale);
  const labels = getLocalizedCharacterFields(character, locale);
  const ui = CARD_UI_LABELS[locale];
  const job = getJobVisuals(character);
  const master = (data.design.layoutVariant ?? 'a') === 'a';
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const microcopy = getCardMicrocopy(character, locale);
  const copy = CARD_LEGACY_COPY.editorial[locale];
  const nameLayout = getCardNameLayout(character.name, locale);

  if (master) return <CardRoot data={data} ratio={ratio} className={className} template="editorial" highlightField={highlightField} imageAdjustment={imageAdjustment} locale={locale}>
    <EditorialMaster data={data} locale={locale} ratio={ratio} />
    <CardAssetAttribution character={character} jobId={job.id} locale={locale} visible={jobMotifVisible} />
  </CardRoot>;

  return (
    <CardRoot data={data} ratio={ratio} className={className} template="editorial" highlightField={highlightField} imageAdjustment={imageAdjustment} locale={locale}>
      <CardImage data={data} locale={locale} className={styles.editorialArt} />
      {jobMotifVisible && (!master || resolveJobIcon({ jobId: job.id, usage: 'cardDisplay' })) && <div className={styles.editorialJobAnchor}>
        <JobIcon jobId={job.id || null} role={job.role || null} label={labels.job} size={112} usage="cardDisplay" decorative />
      </div>}
      <CardAssetAttribution character={character} jobId={job.id} locale={locale} visible={jobMotifVisible} />
      <header className={styles.editorialMasthead}>
          <span>{copy.title}</span>
          {master ? microcopy.origin && <span>{microcopy.origin}</span> : <span>{copy.location}</span>}
      </header>

      <div className={styles.editorialBody}>
        <div className={styles.editorialIdentity}>
          {(labels.race || labels.clan) && <p className={styles.editorialEyebrow}><span data-field="race">{labels.race}</span>{labels.race && labels.clan && ' · '}<span data-field="clan">{labels.clan}</span></p>}
          <h2 data-field="name" aria-label={master ? nameLayout.normalizedName : undefined}>{master ? nameLayout.lines.map((line,index) => <span className={styles.nameLine} key={index}>{line}</span>) : character.name}</h2>
          {!master && <p className={styles.editorialRole}>
            <span data-field="job">{labels.job}</span>{!master && <><span aria-hidden="true"> / </span>{ui.level} <span data-field="level">{character.level}</span></>}
          </p>}
        </div>

        {master && <aside className={styles.editorialJobStudy}>
          {microcopy.jobAbbreviation && <strong className={styles.editorialJobCode}>{microcopy.jobAbbreviation}</strong>}
          <p className={styles.editorialRole} data-field="job">{labels.job}</p>
          <span className={styles.editorialLevel}>{ui.level} <b data-field="level">{character.level}</b></span>
        </aside>}

        <dl className={styles.editorialFacts}>
          <div>
            <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">01</span>}{ui.world}</dt>
            <dd data-field="world">{labels.world}</dd>
          </div>
          {labels.dataCenter && <div>
            <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">02</span>}{ui.dataCenter}</dt>
            <dd data-field="dataCenter">{labels.dataCenter}</dd>
          </div>}
          {character.freeCompany.trim() && <div>
            <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">03</span>}{ui.freeCompany}</dt>
            <dd data-field="freeCompany">{character.freeCompany}</dd>
          </div>}
          {labels.grandCompany.trim() && <div>
            <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">04</span>}{ui.grandCompany}</dt>
            <dd data-field="grandCompany">{labels.grandCompany}</dd>
          </div>}
        </dl>

        {displayBio.trim() && <p className={styles.editorialBio} data-field="bio">{displayBio}</p>}
        {(labels.playStyles.length > 0 || labels.languages.length > 0) && <footer className={styles.editorialFooter}>
          {labels.playStyles.length > 0 && <span data-field="playStyles">{((data.design.layoutVariant ?? 'a') === 'a' ? labels.playStyles : labels.playStyles.slice(0, 2)).join('  ·  ')}</span>}
          {labels.languages.length > 0 && <span data-field="languages" aria-label={labels.languageNames.join(', ')}>{labels.languages.join(' / ')}</span>}
        </footer>}
      </div>
    </CardRoot>
  );
}

export function AdventurerIdCard({ data, ratio, className, highlightField, imageAdjustment, locale = 'en' }: AdventurerCardProps) {
  profileRender('IdentityCard');
  const { character } = data;
  const displayBio = getCardDisplayBio(character, data.imageUrl, locale);
  const labels = getLocalizedCharacterFields(character, locale);
  const ui = CARD_UI_LABELS[locale];
  const job = getJobVisuals(character);
  const master = (data.design.layoutVariant ?? 'a') === 'a';
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const microcopy = getCardMicrocopy(character, locale);
  const copy = CARD_LEGACY_COPY.identity[locale];

  if (master) return <CardRoot data={data} ratio={ratio} className={className} template="id-card" highlightField={highlightField} imageAdjustment={imageAdjustment} locale={locale}>
    <IdentityMaster data={data} locale={locale} ratio={ratio} />
    <CardAssetAttribution character={character} jobId={job.id} locale={locale} visible={jobMotifVisible} />
  </CardRoot>;

  return (
    <CardRoot data={data} ratio={ratio} className={className} template="id-card" highlightField={highlightField} imageAdjustment={imageAdjustment} locale={locale}>
      <CardAssetAttribution character={character} jobId={job.id} locale={locale} visible={jobMotifVisible} />
      <header className={styles.idMasthead}>
        <span>{master ? <><b className={styles.idPublication}>{copy.title}</b><small className={styles.idPublicationCaption}>{copy.subtitle}</small></> : copy.fullTitle}</span>
        <span className={styles.idUnofficial}>{ui.unofficial}</span>
        {jobMotifVisible && (master && !resolveJobIcon({ jobId: job.id, usage: 'micro' }) ? microcopy.jobAbbreviation && <span className={styles.idJobCode} title={labels.job}>{microcopy.jobAbbreviation}</span> : <span className={styles.idSeal} aria-hidden="true"><JobIcon jobId={job.id || null} role={job.role || null} label={labels.job} size={22} usage="micro" decorative /></span>)}
      </header>

      <div className={styles.idBody}>
        <CardImage data={data} locale={locale} className={styles.idPortrait} />

        <div className={styles.idInformation}>
          {master ? microcopy.origin && <p className={styles.idEyebrow}>{microcopy.origin}</p> : <p className={styles.idEyebrow}>{copy.profile}</p>}
          <h2 data-field="name">{character.name}</h2>
          <p className={styles.idRole}>
            <span data-field="job">{labels.job}</span><span aria-hidden="true"> / </span>{ui.level} <span data-field="level">{character.level}</span>
          </p>

          <dl className={styles.idFacts}>
            <div>
              <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">01</span>}{ui.race}</dt>
              <dd data-field="race">{labels.race}</dd>
            </div>
            <div>
              <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">02</span>}{ui.clan}</dt>
              <dd data-field="clan">{labels.clan}</dd>
            </div>
            <div>
              <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">03</span>}{ui.world}</dt>
              <dd data-field="world">{labels.world}</dd>
            </div>
            {labels.dataCenter && <div>
              <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">04</span>}{ui.dataCenter}</dt>
              <dd data-field="dataCenter">{labels.dataCenter}</dd>
            </div>}
            {character.freeCompany.trim() && <div>
              <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">05</span>}{ui.freeCompany}</dt>
              <dd data-field="freeCompany">{character.freeCompany}</dd>
            </div>}
            {labels.grandCompany.trim() && <div>
              <dt>{master && <span className={styles.fieldIndex} aria-hidden="true">06</span>}{ui.grandCompany}</dt>
              <dd data-field="grandCompany">{labels.grandCompany}</dd>
            </div>}
          </dl>
        </div>
      </div>

      {(displayBio.trim() || labels.playStyles.length > 0 || labels.languages.length > 0) && <footer className={styles.idFooter}>
        {displayBio.trim() && <p data-field="bio">{displayBio}</p>}
        {(labels.playStyles.length > 0 || labels.languages.length > 0) && <div className={styles.idFooterMeta}>
          {labels.playStyles.length > 0 && <span data-field="playStyles">{((data.design.layoutVariant ?? 'a') === 'a' ? labels.playStyles : labels.playStyles.slice(0, 2)).join('  ·  ')}</span>}
          {labels.languages.length > 0 && <span data-field="languages" aria-label={labels.languageNames.join(', ')}>{labels.languages.join(' / ')}</span>}
        </div>}
      </footer>}
    </CardRoot>
  );
}

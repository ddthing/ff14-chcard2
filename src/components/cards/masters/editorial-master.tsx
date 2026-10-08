import Image from 'next/image';
import { Fragment, useId, type CSSProperties } from 'react';
import { getJob, JOB_CATEGORIES } from '@/data/ffxiv';
import { masterFieldProps, type MasterField } from '@/lib/master-card-config';
import { getEditorialBrushShape } from '@/lib/card-graphics/editorial-shape';
import { EDITORIAL_BRUSH_PATH } from '@/lib/card-graphics/editorial-brush-path';
import { resolveCardMaterial } from '@/lib/card-materials';
import { JobIcon } from '@/components/ffxiv/job-icon';
import { OpticalName } from '@/components/cards/craft/optical-name';
import { CARD_STOCK_COPY } from '@/lib/card-copy';
import { ArtPhoto, getArtContext, type MasterArtProps } from '../card-presentation';
import styles from './editorial-master.module.css';

type EditorialBrushStyle = CSSProperties & {
  '--editorial-brush-clip': string;
};

type EditorialFactPart = {
  field: MasterField;
  value: string;
  role: 'job' | 'information' | 'micro' | 'caption';
  separator?: string;
};

const EDITORIAL_PAPER_SURFACE = resolveCardMaterial('editorial', 'editorial-paper-surface').src;
const EDITORIAL_INK_DENSITY = resolveCardMaterial('editorial', 'editorial-ink-density').src;

export function EditorialMaster({ data, locale, ratio }: MasterArtProps) {
  const { character, bio: localizedBio, labels, ui, microcopy, nameLayout } = getArtContext(data, locale);
  const copy = CARD_STOCK_COPY.editorial[locale];
  const nameLines = nameLayout.lines.length > 0 ? nameLayout.lines : [nameLayout.normalizedName];
  const resolvedRatio = ratio ?? data.design.ratio;
  const brushShape = getEditorialBrushShape(resolvedRatio);
  const brushClipId = `editorial-brush-clip-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const brushStyle: EditorialBrushStyle = {
    '--editorial-brush-clip': `url(#${brushClipId})`,
  };
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const hasLevel = Number.isFinite(character.level) && character.level > 0;
  const bio = localizedBio.trim();
  const bioUnits = Array.from(bio).length;
  const paperBio = bio.length > 0 && bioUnits <= (nameLayout.script === 'latin' ? 70 : 34) && nameLayout.category === 'short' && nameLines.length === 1;
  const photoBio = bio.length > 0 && !paperBio;
  const selectedJob = getJob(character.jobId ?? character.job);
  const jobCategory = JOB_CATEGORIES.find(({ id }) => id === selectedJob?.category);
  const jobRoleLabel = jobCategory?.id === 'magical-ranged-dps' && locale === 'en'
    ? 'CASTER'
    : jobCategory?.localizedName[locale] ?? '';
  const lineageLabel = labels.race && labels.clan
    ? `${ui.race} / ${ui.clan}`
    : labels.race ? ui.race : ui.clan;

  const facts: Array<{ id: string; label: string; parts: EditorialFactPart[] }> = [
    {
      id: 'job',
      label: copy.job,
      parts: [
        ...(labels.job ? [{ field: 'job' as const, value: labels.job, role: 'job' as const }] : []),
        ...(microcopy.jobAbbreviation ? [{ field: 'jobAbbreviation' as const, value: microcopy.jobAbbreviation, role: 'micro' as const, separator: ' / ' }] : []),
      ],
    },
    { id: 'level', label: ui.level, parts: hasLevel ? [{ field: 'level', value: String(character.level), role: 'information' }] : [] },
    { id: 'world', label: ui.world, parts: labels.world ? [{ field: 'world', value: labels.world, role: 'information' }] : [] },
    { id: 'data-center', label: ui.dataCenter, parts: labels.dataCenter ? [{ field: 'dataCenter', value: labels.dataCenter, role: 'information' }] : [] },
    {
      id: 'lineage',
      label: lineageLabel,
      parts: [
        ...(labels.race ? [{ field: 'race' as const, value: labels.race, role: 'information' as const }] : []),
        ...(labels.clan ? [{ field: 'clan' as const, value: labels.clan, role: 'information' as const, separator: ' · ' }] : []),
      ],
    },
    { id: 'free-company', label: ui.freeCompany, parts: character.freeCompany.trim() ? [{ field: 'freeCompany', value: character.freeCompany, role: 'information' }] : [] },
    { id: 'service', label: copy.service, parts: microcopy.origin ? [{ field: 'origin', value: microcopy.origin, role: 'caption' }] : [] },
  ];

  return (
    <div
      className={styles.canvas}
      data-ratio={resolvedRatio}
      data-brush-shape={brushShape.id}
      data-brush-composition={brushShape.composition}
      data-brush-source={brushShape.inkOutline}
      data-brush-clip-id={brushClipId}
      data-name-script={nameLayout.script}
      data-name-category={nameLayout.category}
      data-name-lines={nameLines.length}
      lang={locale}
      style={brushStyle}
    >
      <div className={styles.paperGround} aria-hidden="true" />
      <Image
        className={styles.paperMaterial}
        src={EDITORIAL_PAPER_SURFACE}
        alt=""
        width={1280}
        height={1600}
        unoptimized
        loading="eager"
        aria-hidden="true"
        data-material-layer="editorial-paper-surface"
      />
      <Image
        className={styles.inkDensity}
        src={EDITORIAL_INK_DENSITY}
        alt=""
        width={1280}
        height={1600}
        unoptimized
        loading="eager"
        aria-hidden="true"
        data-material-layer="editorial-ink-density"
      />
      <svg className={styles.clipDefinitions} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={brushClipId} clipPathUnits="objectBoundingBox">
            <path
              d={EDITORIAL_BRUSH_PATH}
              fillRule="evenodd"
              clipRule="evenodd"
              transform="scale(0.0009765625 0.0006510416666666666)"
            />
          </clipPath>
        </defs>
      </svg>
      <div className={styles.brushUnderlay} data-card-local-clip={brushClipId} aria-hidden="true" />
      <div className={styles.photoClip} data-card-local-clip={brushClipId}>
        <ArtPhoto data={data} className={styles.photoArt} locale={locale} />
      </div>

      <header className={styles.masthead} aria-label={copy.masthead}>
        <span className={styles.mastheadTitle} data-master-typography-role="micro">{copy.masthead}</span>
        <span className={styles.mastheadMeta} data-master-typography-role="caption" lang="en">{CARD_STOCK_COPY.brand.finalFantasy}</span>
      </header>

      <div className={styles.identityStack}>
        <OpticalName
          family="editorial"
          ratio={resolvedRatio}
          name={nameLayout.normalizedName}
          lines={nameLines}
          script={nameLayout.script}
          typographyPreset={data.design.typographyPreset}
          className={styles.name}
          {...masterFieldProps('editorial', 'name')}
          lineClassName={styles.nameLine}
          data-name-script={nameLayout.script}
          data-name-category={nameLayout.category}
        />
        {paperBio && <p className={styles.quote} data-master-typography-role="secondaryDisplay" {...masterFieldProps('editorial', 'bio')}>{bio}</p>}
      </div>

      <div
        className={styles.photoStory}
        data-photo-story={photoBio ? 'bio' : 'copy'}
        data-master-typography-role={photoBio ? 'secondaryDisplay' : 'caption'}
        {...(photoBio ? masterFieldProps('editorial', 'bio') : {})}
      >
        {photoBio ? bio : copy.story}
      </div>

      <dl className={styles.facts} aria-label={copy.details}>
        {facts.filter((fact) => fact.parts.length > 0).map((fact) => (
          <div className={styles.fact} data-editorial-row={fact.id} key={fact.id}>
            <dt className={styles.factLabel} data-master-typography-role="label">{fact.label}</dt>
            <dd className={styles.factValue}>
              {fact.parts.map((part) => (
                <Fragment key={part.field}>
                  {part.separator && <span className={styles.factSeparator} aria-hidden="true">{part.separator}</span>}
                  <span data-master-typography-role={part.role} {...masterFieldProps('editorial', part.field)}>
                    {part.value}
                  </span>
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      {jobMotifVisible && labels.job && (
        <section className={styles.jobInsignia} data-job-identity-mark="editorial" aria-label={labels.job}>
          <JobIcon
            className={styles.jobGlyph}
            jobId={character.jobId ?? character.job}
            label={labels.job}
            size={108}
            usage="cardDisplay"
            decorative
          />
          <span className={styles.insigniaJob} data-master-typography-role="job" {...masterFieldProps('editorial', 'job')}>
            {labels.job}
          </span>
          {microcopy.jobAbbreviation && (
            <span className={styles.insigniaCode} data-master-typography-role="micro" {...masterFieldProps('editorial', 'jobAbbreviation')}>
              {[jobRoleLabel, microcopy.jobAbbreviation].filter(Boolean).join(' · ')}
            </span>
          )}
          <span className={styles.insigniaCaption} data-master-typography-role="caption">{copy.warriorOfLight}</span>
        </section>
      )}

    </div>
  );
}

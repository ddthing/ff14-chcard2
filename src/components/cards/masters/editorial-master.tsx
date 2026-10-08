import { useId } from 'react';
import { masterFieldProps } from '@/lib/master-card-config';
import { getEditorialPaperShape } from '@/lib/card-graphics/editorial-shape';
import { resolveCardMaterial } from '@/lib/card-materials';
import { JobIcon } from '@/components/ffxiv/job-icon';
import { getJobIdentityGlyphCqiSize, getJobIdentityGlyphLogicalSize } from '@/lib/job-identity-optics';
import { OpticalName } from '@/components/cards/craft/optical-name';
import { ArtPhoto, getArtContext, type MasterArtProps } from '../card-presentation';
import styles from './editorial-master.module.css';

const EDITORIAL_COPY = {
  ko: { job: '직업', service: '서비스 · 지역' },
  en: { job: 'JOB', service: 'SERVICE / REGION' },
  ja: { job: 'ジョブ', service: 'サービス・地域' },
} as const;

const EDITORIAL_PAPER_SURFACE = resolveCardMaterial('editorial', 'editorial-paper-surface').src;
const EDITORIAL_INK_DENSITY = resolveCardMaterial('editorial', 'editorial-ink-density').src;

function EditorialBio({ bio, className, placement }: { bio: string; className: string; placement: 'paper' | 'lower' }) {
  return (
    <blockquote className={className} data-bio-placement={placement}>
      <p className={styles.bio} data-master-typography-role="secondaryDisplay" {...masterFieldProps('editorial', 'bio')}>
        {bio}
      </p>
    </blockquote>
  );
}

export function EditorialMaster({ data, locale, ratio }: MasterArtProps) {
  const paperTextureId = `editorial-paper-texture-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const { character, labels, ui, microcopy, nameLayout } = getArtContext(data, locale);
  const copy = EDITORIAL_COPY[locale];
  const nameLines = nameLayout.lines.length > 0 ? nameLayout.lines : [nameLayout.normalizedName];
  const resolvedRatio = ratio ?? data.design.ratio;
  const paperShape = getEditorialPaperShape(resolvedRatio);
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const jobGlyphSize = getJobIdentityGlyphLogicalSize(resolvedRatio);
  const jobGlyphCqiSize = getJobIdentityGlyphCqiSize(resolvedRatio);
  const bio = character.bio.trim();
  const bioUnits = Array.from(bio).length;
  const paperBio =
    bio.length > 0 &&
    bioUnits <= (nameLayout.script === 'latin' ? 70 : 34) &&
    nameLayout.category === 'short' &&
    nameLines.length === 1;

  return (
    <div
      className={styles.canvas}
      data-ratio={resolvedRatio}
      data-paper-shape={paperShape.id}
      data-name-script={nameLayout.script}
      data-name-category={nameLayout.category}
      data-name-lines={nameLines.length}
      lang={locale}
    >
      <div className={styles.paperGround} aria-hidden="true" />
      <ArtPhoto data={data} className={styles.photo} />
      <svg
        className={styles.paperEdge}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        data-paper-shape={paperShape.id}
      >
        <defs>
          <pattern id={paperTextureId} patternUnits="userSpaceOnUse" width="1000" height="1000">
            <image href={EDITORIAL_PAPER_SURFACE} x="0" y="0" width="1000" height="1000" preserveAspectRatio="none" />
          </pattern>
        </defs>
        <path className={styles.paperShape} d={paperShape.path} data-paper-path={paperShape.path} />
        <path className={styles.paperTexture} d={paperShape.path} fill={`url(#${paperTextureId})`} />
      </svg>

      {jobMotifVisible && microcopy.jobAbbreviation && (
        <div className={styles.motifLayer} aria-hidden="true">
          <span
            className={styles.customMotif}
            data-master-typography-role="job"
            {...masterFieldProps('editorial', 'jobAbbreviation')}
          >
            {microcopy.jobAbbreviation}
            <span
              className={styles.inkDensity}
              aria-hidden="true"
              data-material-layer="editorial-ink-density"
              style={{ backgroundImage: `url("${EDITORIAL_INK_DENSITY}")` }}
            >
              {microcopy.jobAbbreviation}
            </span>
          </span>
        </div>
      )}

      <header className={styles.masthead} aria-label="ADVENTURER" {...masterFieldProps('editorial', 'masthead')}>
        <span className={styles.mastheadTitle} data-master-typography-role="micro">ADVENTURER</span>
        <span className={styles.mastheadMeta} data-master-typography-role="caption">{ui.unofficial}</span>
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
        {paperBio && <EditorialBio bio={bio} className={styles.bioPaperNote} placement="paper" />}
      </div>

      {bio && !paperBio && <EditorialBio bio={bio} className={styles.bioNote} placement="lower" />}

      <section className={styles.facts}>
        <div className={styles.jobColumn}>
          <div className={`${styles.jobAnchor} ${jobMotifVisible ? '' : styles.jobAnchorWithoutMark}`} data-job-identity="editorial">
            {jobMotifVisible && (
              <span className={styles.jobPrint} style={{ fontSize: `${jobGlyphCqiSize}cqi` }} aria-hidden="true" data-job-identity-mark="editorial">
                <JobIcon
                  className={styles.jobGlyph}
                  jobId={character.jobId ?? character.job}
                  label={labels.job}
                  size={jobGlyphSize}
                  usage="cardMedium"
                />
              </span>
            )}
            <div className={styles.jobIdentity}>
              <span className={styles.jobLabel} data-master-typography-role="label">{copy.job}</span>
              <span className={styles.jobName} data-master-typography-role="job" {...masterFieldProps('editorial', 'job')}>
                {labels.job}
              </span>
            </div>
            <div className={styles.levelFact}>
                <span className={styles.factLabel} data-master-typography-role="label">{ui.level}</span>
                <b className={styles.levelValue} data-master-typography-role="information" {...masterFieldProps('editorial', 'level')}>
                {character.level}
              </b>
            </div>
          </div>

          {(labels.race || labels.clan) && (
            <div className={`${styles.fact} ${styles.lineage}`}>
              <span className={styles.factLabel} data-master-typography-role="label">
                {labels.race && ui.race}
                {labels.race && labels.clan && <span aria-hidden="true"> / </span>}
                {labels.clan && ui.clan}
              </span>
              <span className={styles.lineageValue} data-master-typography-role="information">
                {labels.race && <span {...masterFieldProps('editorial', 'race')}>{labels.race}</span>}
                {labels.race && labels.clan && <span aria-hidden="true"> · </span>}
                {labels.clan && <span {...masterFieldProps('editorial', 'clan')}>{labels.clan}</span>}
              </span>
            </div>
          )}
        </div>

        <div className={styles.placeColumn}>
          {labels.world && (
            <div className={`${styles.fact} ${styles.worldFact}`}>
              <span className={styles.factLabel} data-master-typography-role="label">{ui.world}</span>
              <span className={styles.worldValue} data-master-typography-role="information" {...masterFieldProps('editorial', 'world')}>
                {labels.world}
              </span>
            </div>
          )}
          <div className={styles.secondaryFacts}>
            {labels.dataCenter && (
              <div className={`${styles.fact} ${styles.dataCenterFact}`}>
                <span className={styles.factLabel} data-master-typography-role="label">{ui.dataCenter}</span>
                <span className={styles.factValue} data-master-typography-role="information" {...masterFieldProps('editorial', 'dataCenter')}>
                  {labels.dataCenter}
                </span>
              </div>
            )}
            {character.freeCompany.trim() && (
              <div className={`${styles.fact} ${styles.companyFact}`}>
                <span className={styles.factLabel} data-master-typography-role="label">{ui.freeCompany}</span>
                <span className={styles.factValue} data-master-typography-role="information" {...masterFieldProps('editorial', 'freeCompany')}>
                  {character.freeCompany}
                </span>
              </div>
            )}
            {microcopy.origin && (
              <div className={`${styles.fact} ${styles.originFact}`}>
                <span className={styles.factLabel} data-master-typography-role="label">{copy.service}</span>
                <span className={styles.factValue} data-master-typography-role="caption" {...masterFieldProps('editorial', 'origin')}>
                  {microcopy.origin}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

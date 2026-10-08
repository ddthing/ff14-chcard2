import Image from 'next/image';
import { masterFieldProps } from '@/lib/master-card-config';
import { resolveCardMaterial } from '@/lib/card-materials';
import { getJobIdentityGlyphCqiSize, getJobIdentityGlyphLogicalSize } from '@/lib/job-identity-optics';
import { JobIcon } from '@/components/ffxiv/job-icon';
import { EngravingMark } from '../craft/engraving-mark';
import { OpticalName } from '../craft/optical-name';
import { PrintFrame } from '../craft/print-frame';
import { ArtPhoto, getArtContext, type MasterArtProps } from '../card-presentation';
import styles from './cinematic-master.module.css';

const CINEMATIC_COPY = {
  ko: { job: '직업', service: '서비스', details: '모험가 정보' },
  en: { job: 'JOB', service: 'SERVICE', details: 'Adventurer details' },
  ja: { job: 'ジョブ', service: 'サービス', details: '冒険者情報' },
} as const;

const CINEMATIC_FILM_GRAIN = resolveCardMaterial('cinematic', 'cinematic-film-grain').src;

export function CinematicMaster({ data, locale, ratio }: MasterArtProps) {
  const { character, labels, ui, microcopy, nameLayout } = getArtContext(data, locale);
  const nameLines = nameLayout.lines.length > 0 ? nameLayout.lines : [character.name];
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const hasLevel = Number.isFinite(character.level) && character.level > 0;
  const hasBio = character.bio.trim().length > 0;
  const copy = CINEMATIC_COPY[locale];
  const jobGlyphSize = getJobIdentityGlyphLogicalSize(ratio ?? data.design.ratio);
  const jobGlyphCqiSize = getJobIdentityGlyphCqiSize(ratio ?? data.design.ratio);

  return (
    <div className={styles.canvas} data-ratio={ratio ?? data.design.ratio}>
      <ArtPhoto data={data} className={styles.photo} />
      <Image
        className={styles.photoMaterial}
        src={CINEMATIC_FILM_GRAIN}
        alt=""
        width={1280}
        height={1600}
        unoptimized
        loading="eager"
        aria-hidden="true"
        data-material-layer="cinematic-film-grain"
      />
      <div className={styles.veil} aria-hidden="true" />

      {hasBio && <p className={styles.bio} data-master-typography-role="secondaryDisplay" {...masterFieldProps('cinematic', 'bio')}>{character.bio}</p>}

      <section className={styles.identity} aria-label={copy.details}>
        <OpticalName
          family="cinematic"
          ratio={ratio ?? data.design.ratio}
          name={nameLayout.normalizedName}
          lines={nameLines}
          script={nameLayout.script}
          typographyPreset={data.design.typographyPreset}
          className={styles.name}
          lineClassName={styles.nameLine}
          {...masterFieldProps('cinematic', 'name')}
          data-name-script={nameLayout.script}
          data-name-composition={nameLayout.category}
        />

        <EngravingMark kind="divider" className={styles.nameDivider} />

        <dl className={styles.metadata}>
          {labels.job && (
            <div className={styles.metaCell} data-cinema-fact="job">
              <dt className={styles.metaLabel} data-master-typography-role="label">{copy.job}</dt>
              <dd className={styles.jobLockup} data-job-identity="cinematic">
                {jobMotifVisible && (
                  <span className={styles.jobSeal} style={{ fontSize: `${jobGlyphCqiSize}cqi` }} aria-hidden="true" data-job-identity-mark="cinematic">
                    <JobIcon
                      className={styles.jobGlyph}
                      jobId={character.jobId ?? character.job}
                      label={labels.job}
                      size={jobGlyphSize}
                      usage="cardSmall"
                    />
                  </span>
                )}
                <span className={styles.jobLockupText}>
                  <span className={styles.metaValue} data-master-typography-role="job" {...masterFieldProps('cinematic', 'job')}>
                    {labels.job}
                  </span>
                  {microcopy.jobAbbreviation && (
                    <span className={styles.jobAbbreviation} data-master-typography-role="job" {...masterFieldProps('cinematic', 'jobAbbreviation')}>
                      {microcopy.jobAbbreviation}
                    </span>
                  )}
                </span>
              </dd>
            </div>
          )}
          {hasLevel && (
            <div className={styles.metaCell} data-cinema-fact="level">
              <dt className={styles.metaLabel} data-master-typography-role="label">{ui.level}</dt>
              <dd className={`${styles.metaValue} ${styles.levelValue}`} data-master-typography-role="information" {...masterFieldProps('cinematic', 'level')}>{character.level}</dd>
            </div>
          )}
          {labels.world && (
            <div className={styles.metaCell} data-cinema-fact="world">
              <dt className={styles.metaLabel} data-master-typography-role="label">{ui.world}</dt>
              <dd className={styles.metaValue} data-master-typography-role="information" {...masterFieldProps('cinematic', 'world')}>{labels.world}</dd>
            </div>
          )}
          {labels.dataCenter && (
            <div className={styles.metaCell} data-cinema-fact="data-center">
              <dt className={styles.metaLabel} data-master-typography-role="label">{ui.dataCenter}</dt>
              <dd className={styles.metaValue} data-master-typography-role="information" {...masterFieldProps('cinematic', 'dataCenter')}>{labels.dataCenter}</dd>
            </div>
          )}
          {character.freeCompany.trim() && (
            <div className={styles.metaCell} data-cinema-fact="free-company">
              <dt className={styles.metaLabel} data-master-typography-role="label">{ui.freeCompany}</dt>
              <dd className={styles.metaValue} data-master-typography-role="information" {...masterFieldProps('cinematic', 'freeCompany')}>{character.freeCompany}</dd>
            </div>
          )}
          {microcopy.origin && (
            <div className={styles.metaCell} data-cinema-fact="service">
              <dt className={styles.metaLabel} data-master-typography-role="label">{copy.service}</dt>
              <dd className={`${styles.metaValue} ${styles.origin}`} data-master-typography-role="micro" {...masterFieldProps('cinematic', 'origin')}>{microcopy.origin}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className={styles.frame} aria-hidden="true">
        <PrintFrame family="cinematic" />
      </div>
    </div>
  );
}

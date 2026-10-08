import Image from 'next/image';
import { masterFieldProps } from '@/lib/master-card-config';
import { resolveCardMaterial } from '@/lib/card-materials';
import { getJobIdentityGlyphCqiSize, getJobIdentityGlyphLogicalSize } from '@/lib/job-identity-optics';
import { JobIcon } from '@/components/ffxiv/job-icon';
import { EngravingMark } from '../craft/engraving-mark';
import { OpticalName } from '../craft/optical-name';
import { PrintFrame } from '../craft/print-frame';
import { CARD_STOCK_COPY } from '@/lib/card-copy';
import { ArtPhoto, getArtContext, type MasterArtProps } from '../card-presentation';
import styles from './cinematic-master.module.css';

const CINEMATIC_FILM_GRAIN = resolveCardMaterial('cinematic', 'cinematic-film-grain').src;

export function CinematicMaster({ data, locale, ratio }: MasterArtProps) {
  const { character, bio, labels, ui, microcopy, nameLayout } = getArtContext(data, locale);
  const nameLines = nameLayout.lines.length > 0 ? nameLayout.lines : [character.name];
  const resolvedRatio = ratio ?? data.design.ratio;
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const hasLevel = Number.isFinite(character.level) && character.level > 0;
  const hasBio = bio.trim().length > 0;
  const copy = CARD_STOCK_COPY.cinematic[locale];
  const jobGlyphSize = getJobIdentityGlyphLogicalSize(resolvedRatio);
  const jobGlyphCqiSize = getJobIdentityGlyphCqiSize(resolvedRatio, 'cinematicSeal');
  const hasWorldFacts = Boolean(labels.world || labels.dataCenter);

  return (
    <div className={styles.canvas} data-ratio={resolvedRatio} lang={locale}>
      <ArtPhoto data={data} locale={locale} className={styles.photo} />
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

      <div className={styles.topPromise} aria-hidden="true">
        <p data-master-typography-role="micro">{copy.promise.map((line) => <span key={line}>{line}</span>)}</p>
        <span className={styles.promiseRule} />
        <p className={styles.topQuote} data-master-typography-role="caption">{copy.quote.map((line) => <span key={line}>{line}</span>)}</p>
      </div>

      <div className={styles.topSignature} aria-hidden="true">
        <p data-master-typography-role="caption">{copy.signature.map((line) => <span key={line}>{line}</span>)}</p>
        <span className={styles.signaturePlace} data-master-typography-role="micro">{copy.place}</span>
      </div>

      {hasBio && <p className={styles.bio} data-master-typography-role="secondaryDisplay" {...masterFieldProps('cinematic', 'bio')}>{bio}</p>}

      <section className={styles.identity} aria-label={copy.details}>
        <OpticalName
          family="cinematic"
          ratio={resolvedRatio}
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

        <div className={styles.nameDivider} aria-hidden="true">
          <span />
          <EngravingMark kind="divider" className={styles.nameDiamond} />
          <span />
        </div>

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
          {hasWorldFacts && (
            <div className={styles.metaCell} data-cinema-fact="world-data-center">
              <dt className={styles.metaLabel} data-master-typography-role="label">{copy.worldDc}</dt>
              <dd className={styles.metaValue}>
                {labels.world && <span {...masterFieldProps('cinematic', 'world')}>{labels.world}</span>}
                {labels.world && labels.dataCenter && <span aria-hidden="true"> / </span>}
                {labels.dataCenter && <span {...masterFieldProps('cinematic', 'dataCenter')}>{labels.dataCenter}</span>}
              </dd>
            </div>
          )}
          {character.freeCompany.trim() && (
            <div className={styles.metaCell} data-cinema-fact="free-company">
              <dt className={styles.metaLabel} data-master-typography-role="label">{ui.freeCompany}</dt>
              <dd className={styles.metaValue} data-master-typography-role="information" {...masterFieldProps('cinematic', 'freeCompany')}>
                {character.freeCompany}
              </dd>
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

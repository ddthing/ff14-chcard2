import Image from 'next/image';
import { JobIcon } from '@/components/ffxiv/job-icon';
import { masterFieldProps, type MasterField } from '@/lib/master-card-config';
import { getJobIdentityGlyphCqiSize, getJobIdentityGlyphLogicalSize, getJobIdentityMarkState } from '@/lib/job-identity-optics';
import { resolveCardMaterial } from '@/lib/card-materials';
import { CardPictogram } from '../craft/card-pictogram';
import { EngravingMark } from '../craft/engraving-mark';
import { OpticalName } from '../craft/optical-name';
import { PrintFrame } from '../craft/print-frame';
import { ArtPhoto, getArtContext, type MasterArtProps } from '../card-presentation';
import type { CardPictogramKind } from '@/lib/card-graphics/pictograms';
import styles from './identity-master.module.css';

type RecordFact = {
  label: string;
  value: string;
  field: MasterField;
  pictogram: CardPictogramKind;
  ariaLabel?: string;
};

const COPY = {
  ko: {
    masthead: '모험가',
    mastheadCaption: '기록',
    job: '직업',
    origin: '출신과 여정',
    lineage: '종족 계보',
    affiliation: '소속',
    community: '모험가의 기록',
  },
  en: {
    masthead: 'ADVENTURER',
    mastheadCaption: 'RECORD',
    job: 'JOB',
    origin: 'ORIGIN & ROUTE',
    lineage: 'LINEAGE',
    affiliation: 'AFFILIATION',
    community: 'FIELD NOTES',
  },
  ja: {
    masthead: '冒険者',
    mastheadCaption: '記録',
    job: 'ジョブ',
    origin: '出身・旅路',
    lineage: '種族・部族',
    affiliation: '所属',
    community: '冒険者の記録',
  },
} as const;

const IDENTITY_MATTE_FIBER = resolveCardMaterial('id-card', 'identity-matte-fiber').src;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function RecordEntry({ label, value, field, pictogram, ariaLabel }: RecordFact) {
  if (!nonEmpty(value)) return null;

  return (
    <div className={styles.recordEntry} data-record-field={field}>
      <span className={styles.recordPictogram} aria-hidden="true">
        <CardPictogram kind={pictogram} className={styles.pictogram} />
      </span>
      <dl className={styles.recordCopy}>
        <dt className={styles.recordLabel} data-typography-role="label" data-master-typography-role="label">{label}</dt>
        <dd data-master-typography-role="information" {...masterFieldProps('id-card', field)} aria-label={ariaLabel}>{value}</dd>
      </dl>
    </div>
  );
}

function RecordGroup({
  title,
  facts,
  className,
}: {
  title: string;
  facts: RecordFact[];
  className?: string;
}) {
  const visibleFacts = facts.filter((fact) => nonEmpty(fact.value));
  if (visibleFacts.length === 0) return null;

  return (
    <section className={[styles.recordGroup, className].filter(Boolean).join(' ')} aria-label={title}>
      <h3 className={styles.groupTitle} data-typography-role="micro" data-master-typography-role="micro">{title}</h3>
      <div className={styles.recordList}>
        {visibleFacts.map((fact) => <RecordEntry key={fact.field} {...fact} />)}
      </div>
    </section>
  );
}

export function IdentityMaster({ data, locale, ratio }: MasterArtProps) {
  const { character, labels, ui, microcopy, nameLayout } = getArtContext(data, locale);
  const copy = COPY[locale];
  const nameLines = nameLayout.lines.length > 0 ? nameLayout.lines : [nameLayout.normalizedName];
  const fitNameTight = nameLayout.category === 'long'
    || nameLines.length >= 3;
  const isCjkName = nameLayout.script === 'korean' || nameLayout.script === 'japanese';
  const jobMotifVisible = data.design.jobMotifVisible !== false;
  const jobGlyphSize = getJobIdentityGlyphLogicalSize(ratio ?? data.design.ratio);
  const jobGlyphCqiSize = getJobIdentityGlyphCqiSize(ratio ?? data.design.ratio);
  const hasJob = nonEmpty(labels.job);
  const jobMarkState = getJobIdentityMarkState(jobMotifVisible, hasJob);
  const bio = character.bio.trim();
  const showBio = nonEmpty(bio)
    && Array.from(bio).length <= 120
    && !(isCjkName && fitNameTight);
  const hasLevel = Number.isFinite(character.level) && character.level > 0;

  const originFacts: RecordFact[] = [
    { label: ui.world, value: labels.world, field: 'world', pictogram: 'world' },
    { label: ui.dataCenter, value: labels.dataCenter, field: 'dataCenter', pictogram: 'dataCenter' },
    { label: locale === 'ko' ? '서비스 · 지역' : locale === 'ja' ? 'サービス・地域' : 'SERVICE · REGION', value: microcopy.origin, field: 'origin', pictogram: 'service' },
  ];
  const lineageFacts: RecordFact[] = [
    { label: ui.race, value: labels.race, field: 'race', pictogram: 'race' },
    { label: ui.clan, value: labels.clan, field: 'clan', pictogram: 'clan' },
  ];
  const affiliationFacts: RecordFact[] = [
    { label: ui.freeCompany, value: character.freeCompany, field: 'freeCompany', pictogram: 'freeCompany' },
    { label: ui.grandCompany, value: labels.grandCompany, field: 'grandCompany', pictogram: 'grandCompany' },
  ];
  const languageFacts: RecordFact[] = labels.languages.length > 0
    ? [{
      label: locale === 'ko' ? '언어' : locale === 'ja' ? '言語' : 'LANGUAGES',
      value: labels.languages.join(' / '),
      field: 'languages',
      pictogram: 'languages',
      ariaLabel: labels.languageNames.join(', '),
    }]
    : [];
  const playStyleFacts: RecordFact[] = labels.playStyles.length > 0
    ? [{
      label: locale === 'ko' ? '플레이 스타일' : locale === 'ja' ? 'プレイスタイル' : 'PLAY STYLE',
      value: labels.playStyles.join(' · '),
      field: 'playStyles',
      pictogram: 'playStyles',
    }]
    : [];

  return (
    <div className={styles.canvas} data-ratio={ratio ?? data.design.ratio} data-locale={locale} lang={locale}>
      <ArtPhoto data={data} className={styles.photo} />
      <div className={styles.stock} aria-hidden="true">
        <Image
          className={styles.stockMaterial}
          src={IDENTITY_MATTE_FIBER}
          alt=""
          width={1280}
          height={1600}
          unoptimized
          loading="eager"
          data-material-layer="identity-matte-fiber"
        />
      </div>
      <PrintFrame family="id-card" />

      <header
        className={styles.masthead}
        aria-label={`${copy.masthead} ${copy.mastheadCaption}`}
        {...masterFieldProps('id-card', 'masthead')}
      >
        <Image
          className={styles.ribbonMaterial}
          src={IDENTITY_MATTE_FIBER}
          alt=""
          width={1280}
          height={1600}
          unoptimized
          loading="eager"
          aria-hidden="true"
          data-material-layer="identity-matte-fiber"
        />
        <EngravingMark kind="compass" className={styles.ribbonCompass} />
        <svg
          className={styles.ribbonRule}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          stroke="currentColor"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeMiterlimit="2"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M3 2H97V82L50 94 3 82Z" strokeWidth=".42" />
          <path d="M6 5H94V80L50 90 6 80Z" strokeWidth=".28" opacity=".58" />
        </svg>
        <span className={styles.mastheadTitle} data-master-typography-role="micro">{copy.masthead}</span>
        <span className={styles.mastheadNote} data-master-typography-role="caption">{copy.mastheadCaption}</span>
      </header>
      <span className={styles.unofficialNote} data-master-typography-role="micro">{ui.unofficial}</span>

      <EngravingMark kind="divider" className={styles.seamDivider} />

      <section className={styles.paper} aria-label={copy.masthead}>
        <section className={styles.heroIdentity} aria-label={copy.job}>
          <div className={styles.nameBlock}>
            {nonEmpty(nameLayout.normalizedName) && (
              <OpticalName
                family="id-card"
                ratio={ratio ?? data.design.ratio}
                name={nameLayout.normalizedName}
                lines={nameLines}
                script={nameLayout.script}
                typographyPreset={data.design.typographyPreset}
                className={styles.name}
                lineClassName={styles.nameLine}
                {...masterFieldProps('id-card', 'name')}
                data-name-script={nameLayout.script}
                data-name-category={nameLayout.category}
                data-name-lines={nameLines.length}
                data-name-fit={fitNameTight ? 'tight' : undefined}
              />
            )}
            {showBio && <p className={styles.bio} data-master-typography-role="secondaryDisplay" {...masterFieldProps('id-card', 'bio')}>{bio}</p>}
          </div>

          {(hasJob || nonEmpty(microcopy.jobAbbreviation)) && (
            <div className={styles.jobPanel}>
              <div className={`${styles.jobBadge} ${jobMarkState.layout === 'text-only' ? styles.jobBadgeWithoutMark : ''}`} data-job-identity="id-card">
                {jobMarkState.showMark && (
                  <span className={styles.jobBadgeMark} style={{ fontSize: `${jobGlyphCqiSize}cqi` }} aria-hidden="true" data-job-identity-mark="id-card">
                    <JobIcon
                      className={styles.jobGlyph}
                      jobId={character.jobId ?? character.job}
                      label={labels.job}
                      size={jobGlyphSize}
                      usage="cardMedium"
                    />
                  </span>
                )}
                <div className={styles.jobCopy}>
                  <span className={styles.jobLabel} data-typography-role="label" data-master-typography-role="label">{copy.job}</span>
                  {hasJob && <span className={styles.jobName} data-master-typography-role="job" {...masterFieldProps('id-card', 'job')}>{labels.job}</span>}
                  {nonEmpty(microcopy.jobAbbreviation) && (
                    <span className={styles.jobAbbreviation} data-master-typography-role="micro" {...masterFieldProps('id-card', 'jobAbbreviation')}>
                      {microcopy.jobAbbreviation}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {hasLevel && (
            <dl className={styles.levelPanel}>
              <dt data-typography-role="label" data-master-typography-role="label">{ui.level}</dt>
              <dd data-master-typography-role="information" {...masterFieldProps('id-card', 'level')}>{character.level}</dd>
            </dl>
          )}
        </section>

        <div className={styles.records}>
          <RecordGroup title={copy.origin} facts={originFacts} className={styles.originGroup} />

          {(lineageFacts.some((fact) => nonEmpty(fact.value)) || affiliationFacts.some((fact) => nonEmpty(fact.value))) && (
            <div className={styles.associations}>
              <RecordGroup title={copy.lineage} facts={lineageFacts} className={styles.lineageGroup} />
              <RecordGroup title={copy.affiliation} facts={affiliationFacts} className={styles.affiliationGroup} />
            </div>
          )}

          <RecordGroup
            title={copy.community}
            facts={[...languageFacts, ...playStyleFacts]}
            className={styles.personalNotes}
          />
        </div>
      </section>
    </div>
  );
}

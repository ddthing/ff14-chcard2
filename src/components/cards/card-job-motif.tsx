import type { CSSProperties } from 'react';
import { getJob } from '@/data/ffxiv';
import { JobIcon } from '@/components/ffxiv/job-icon';
import { JOB_MOTIF_TOKENS, type JobMotifFamily } from '@/lib/job-motif-tokens';
import styles from './card-job-motif.module.css';

type MotifStyle = CSSProperties & Record<string, string | number>;

export type CardJobMotifProps = {
  family: JobMotifFamily;
  jobId: string;
  label: string;
  visible?: boolean;
};

/** Decorative mark shared by the three approved master compositions. */
export function CardJobMotif({ family, jobId, label, visible = true }: CardJobMotifProps) {
  if (!visible) return null;

  const tokens = JOB_MOTIF_TOKENS.families[family];
  const job = getJob(jobId);
  const style: MotifStyle = {
    '--job-motif-size': tokens.size,
    '--job-motif-opacity': tokens.opacity,
  };
  if (tokens.position) {
    style['--job-motif-top'] = tokens.position.top;
    style['--job-motif-left'] = tokens.position.left;
  }
  if (tokens.landscapePosition) {
    style['--job-motif-landscape-top'] = tokens.landscapePosition.top;
    style['--job-motif-landscape-left'] = tokens.landscapePosition.left;
  }

  return (
    <span
      className={styles.motif}
      data-job-motif={family}
      style={style}
      aria-hidden="true"
    >
      <JobIcon
        jobId={job?.id ?? jobId}
        role={job?.category ?? job?.role ?? null}
        label={label}
        size={JOB_MOTIF_TOKENS.sourceSize}
        usage={family === 'editorial' ? 'cardDisplay' : family === 'id-card' ? 'cardMedium' : 'cardSmall'}
        className={styles.glyph}
      />
    </span>
  );
}

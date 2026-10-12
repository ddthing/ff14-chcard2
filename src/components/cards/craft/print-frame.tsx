import type {AdventurerCardTemplate} from '../types';
import {EngravingMark} from './engraving-mark';
import styles from './print-frame.module.css';
function Corner() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="butt"
      strokeLinejoin="round"
      strokeMiterlimit={2}
      aria-hidden="true"
    >
      <path d="M.5 45V17C.5 7.886 7.886.5 17 .5H45" />
      <path d="M5 37V18C5 10.82 10.82 5 18 5H37" opacity=".5" strokeWidth=".65" />
      <path d="M4 27C7 20 13 14 24 8M11 18C7 13 7 8 10 5C16 8 17 13 11 18ZM18 12C19 5 24 3 29 5C27 10 23 13 18 12ZM7 24C2 24 1 20 2 16C6 17 9 20 7 24Z" strokeWidth=".85" />
      <path d="M11 18 10 9M18 12l7-5M7 24l-3-5" opacity=".6" strokeWidth=".55" />
      <path d="M9 15 7 12M13 14l-1-4M22 10l4-1M23 12l4 1M5 21l-2-.5" opacity=".48" strokeWidth=".45" />
    </svg>
  );
}

/** Project-authored botanical engraving; no official seals or logo artwork. */
export function PrintFrame({
  family,
  className,
  geometry = 'legacy',
}: {
  family: AdventurerCardTemplate;
  className?: string;
  geometry?: 'legacy' | 'card';
}) {
  return (
    <div
      className={[styles.frame, className].filter(Boolean).join(' ')}
      data-print-frame={family}
      data-frame-geometry={geometry === 'card' ? 'card' : undefined}
      aria-hidden="true"
    >
      {geometry === 'card' && (
        <>
          <span className={styles.innerTopRule} />
          <span className={styles.innerBottomRule} />
          <span className={styles.innerLeftRule} />
          <span className={styles.innerRightRule} />
        </>
      )}
      <span className={styles.topRule} />
      <span className={styles.bottomRule} />
      <span className={styles.leftRule} />
      <span className={styles.rightRule} />
      {(['tl', 'tr', 'br', 'bl'] as const).map(position => (
        <span key={position} className={`${styles.corner} ${styles[position]}`}>
          <Corner />
        </span>
      ))}
      <span className={styles.topMark}>
        <EngravingMark />
      </span>
    </div>
  );
}

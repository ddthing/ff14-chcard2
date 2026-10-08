import { CARD_PICTOGRAMS, type CardPictogramKind } from '@/lib/card-graphics/pictograms';
import styles from './card-pictogram.module.css';

export type { CardPictogramKind } from '@/lib/card-graphics/pictograms';

export function CardPictogram({ kind, className }: { kind: CardPictogramKind; className?: string }) {
  const { path, opticalOffset = [0, 0] } = CARD_PICTOGRAMS[kind];
  const [offsetX, offsetY] = opticalOffset;

  return (
    <svg
      className={[styles.pictogram, className].filter(Boolean).join(' ')}
      data-card-pictogram={kind}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="miter"
      strokeMiterlimit={2}
      shapeRendering="geometricPrecision"
      focusable="false"
      aria-hidden="true"
    >
      <g transform={`translate(${offsetX} ${offsetY})`}>
        <path d={path} />
      </g>
    </svg>
  );
}

import { CARD_PICTOGRAMS, type CardPictogramKind } from '@/lib/card-graphics/pictograms';
import { AppIcon } from '@/components/app-icon';
import styles from './card-pictogram.module.css';

export type { CardPictogramKind } from '@/lib/card-graphics/pictograms';

export function CardPictogram({ kind, className }: { kind: CardPictogramKind; className?: string }) {
  return (
    <AppIcon
      name={CARD_PICTOGRAMS[kind].iconName}
      size={32}
      className={[styles.pictogram, className].filter(Boolean).join(' ')}
      data-card-pictogram={kind}
    />
  );
}

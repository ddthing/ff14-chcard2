import type { AdventurerCardTemplate } from '@/components/cards/types';

export type JobMotifFamily = Extract<AdventurerCardTemplate, 'cinematic' | 'editorial' | 'id-card'>;

type JobMotifFamilyToken = {
  size: string;
  opacity: number;
  position?: Readonly<{ top: string; left: string }>;
  landscapePosition?: Readonly<{ top: string; left: string }>;
};

/**
 * Shared icon boxes; Master CSS supplies its composition-specific size.
 * The fidelity resolver chooses a reviewed derivative only for the large
 * Editorial GNB mark. Other marks retain their original-resolution mask.
 */
export const JOB_MOTIF_TOKENS: Readonly<{
  sourceSize: number;
  families: Readonly<Record<JobMotifFamily, Readonly<JobMotifFamilyToken>>>;
}> = {
  sourceSize: 76,
  families: {
    cinematic: { size: '4.4cqi', opacity: 0.88 },
    editorial: {
      size: '18cqi',
      opacity: 0.38,
      position: { top: '13%', left: '12.5%' },
      landscapePosition: { top: '13%', left: '36%' },
    },
    'id-card': { size: '3.2cqi', opacity: 0.9 },
  },
};

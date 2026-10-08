import type { AdventurerCardData } from '@/components/cards/types';
import { hasNonSampleDraft } from '@/app/create/create-draft';

/** Return a draft for the Home resume card only when it contains saved work. */
export function getHomeResumeDraft(
  data: AdventurerCardData,
  starter: AdventurerCardData,
): AdventurerCardData | null {
  return hasNonSampleDraft(data, starter) ? data : null;
}

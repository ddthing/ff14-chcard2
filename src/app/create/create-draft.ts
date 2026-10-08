import type { AdventurerCardData } from '@/components/cards/types';

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(rightRecord, key) && sameValue(leftRecord[key], rightRecord[key]));
}

/** True when choosing the canonical starter card would replace saved, non-sample work. */
export function hasNonSampleDraft(data: AdventurerCardData, sample: AdventurerCardData): boolean {
  return data.imageUrl !== sample.imageUrl ||
    !sameValue(data.character, sample.character) ||
    !sameValue(data.design, sample.design) ||
    !sameValue(data.imageAdjustments, sample.imageAdjustments);
}

export type SampleConfirmationFocusTarget = 'confirmation' | 'trigger' | null;

/** Focus the newly shown confirmation, then return to its trigger only on cancel. */
export function getSampleConfirmationFocusTarget(
  isConfirming: boolean,
  wasConfirming: boolean,
): SampleConfirmationFocusTarget {
  if (isConfirming && !wasConfirming) return 'confirmation';
  if (!isConfirming && wasConfirming) return 'trigger';
  return null;
}

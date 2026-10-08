import type { AdventurerCardData, AdventurerCardTemplate } from '@/components/cards/types';

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

/** Carry the chosen master to photo selection without touching the saved draft. */
export function getTemplatePhotoPath(template: AdventurerCardTemplate): string {
  return `/create?template=${encodeURIComponent(template)}`;
}

/** Accept only a real master ID from a route query. */
export function parseTemplateChoice(value: string | string[] | null | undefined): AdventurerCardTemplate | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'cinematic' || candidate === 'editorial' || candidate === 'id-card' ? candidate : null;
}

/** Focus the newly shown confirmation, then return to its trigger only on cancel. */
export function getSampleConfirmationFocusTarget(
  isConfirming: boolean,
  wasConfirming: boolean,
): SampleConfirmationFocusTarget {
  if (isConfirming && !wasConfirming) return 'confirmation';
  if (!isConfirming && wasConfirming) return 'trigger';
  return null;
}

/** Move focus into the overwrite choice and restore it to the photo picker on cancel. */
export type UploadConfirmationExit = 'accepted' | 'cancelled';
export type UploadConfirmationFocusTarget = 'confirmation' | 'trigger' | 'continue' | null;

export function getUploadConfirmationFocusTarget(
  isConfirming: boolean,
  wasConfirming: boolean,
  exit?: UploadConfirmationExit | null,
): UploadConfirmationFocusTarget {
  if (isConfirming && !wasConfirming) return 'confirmation';
  if (!isConfirming && wasConfirming) return exit === 'accepted' ? 'continue' : 'trigger';
  return null;
}

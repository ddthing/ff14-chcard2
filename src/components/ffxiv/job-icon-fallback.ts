import type { JobIconUsage } from '@/lib/ffxiv-assets/job-icon-resolver';

function roleMark(value?: string | null): string | null {
  const normalized = value?.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ') ?? '';
  if (!normalized || normalized === 'dps' || normalized === 'damage' || normalized === 'damage dealer') return null;

  if (normalized.includes('limited')) return 'L';
  if (normalized.includes('tank')) return 'T';
  if (normalized.includes('heal')) return 'H';
  if (normalized.includes('melee')) return 'M';
  if (normalized.includes('magic') || normalized.includes('caster')) return 'C';
  if (normalized.includes('physical') || normalized.includes('ranged')) return 'R';
  if (normalized.includes('craft')) return 'Cr';
  if (normalized.includes('gather')) return 'G';

  return null;
}

/** Display-size motifs prefer the canonical job abbreviation; other sizes prefer role/category marks. */
export function resolveJobIconFallbackMark(
  role?: string | null,
  category?: string | null,
  abbreviation?: string | null,
  usage?: JobIconUsage,
): string {
  const canonicalAbbreviation = abbreviation?.trim();
  if ((usage === 'cardDisplay' || usage === 'editorialLarge') && canonicalAbbreviation) {
    return canonicalAbbreviation;
  }

  return roleMark(role) ?? roleMark(category) ?? canonicalAbbreviation ?? '✧';
}

/** Keep load/error events tied to the source that created their image element. */
export function isCurrentJobIconSource(
  expectedSource: string,
  imageSource: string,
  currentSource: string,
): boolean {
  return imageSource === expectedSource && (!currentSource || currentSource === expectedSource);
}

/** Reject events from a previous request even when a later request reuses its URL. */
export function isCurrentJobIconRequest<TImage extends object>(
  requestImage: TImage,
  currentImage: TImage | null,
  imageIsConnected: boolean,
  sourceIsCurrent: boolean,
): boolean {
  return requestImage === currentImage && imageIsConnected && sourceIsCurrent;
}

/** A failed mask stays out of the DOM until a different source is selected. */
export function shouldRenderJobIconMask(maskSrc: string | null, failedMaskSrc: string | null): boolean {
  return Boolean(maskSrc && maskSrc !== failedMaskSrc);
}

/** Failed derived assets fall back once to the original mask, then to text. */
export function resolveAvailableJobIconSource(
  derived: string | null,
  original: string | null,
  failedSources: readonly string[],
): string | null {
  return [derived, original].find((source): source is string => Boolean(source && !failedSources.includes(source))) ?? null;
}

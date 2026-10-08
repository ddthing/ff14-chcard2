import type { AdventurerCardCharacter } from '@/components/cards/types';
import type { Locale } from '@/lib/types';
import { findWorld, getJob, getPhysicalRegion, localizeFfxivLabel, normalizeServiceId } from '@/data/ffxiv';

const REGION_CODES: Record<string, string> = { japan: 'JP', 'north-america': 'NA', europe: 'EU', oceania: 'OC' };

/** Only known character metadata becomes a printed marker. Missing data stays absent. */
export function getCardMicrocopy(character: AdventurerCardCharacter, locale?: Locale) {
  const jobAbbreviation = getJob(character.jobId ?? character.job)?.abbreviation ?? '';

  // Preserve the original compact code form for callers that predate card locales.
  // Rendered cards always pass their locale and receive readable localized labels.
  if (!locale) {
    const service = character.service === 'global' ? 'GLOBAL' : character.service === 'korea' ? 'KOREA' : '';
    const region = character.service === 'global' ? REGION_CODES[character.physicalRegionId ?? ''] ?? '' : '';
    return { jobAbbreviation, origin: [service, region].filter(Boolean).join(' / ') };
  }

  const service = character.service === 'global' || character.service === 'korea'
    ? localizeFfxivLabel('service', character.service, locale)
    : '';
  const regionRecord = character.service === 'global' ? getPhysicalRegion(character.physicalRegionId) : undefined;
  const region = regionRecord ? localizeFfxivLabel('physicalRegion', regionRecord.id, locale) : '';
  const separator = locale === 'ja' ? ' ・ ' : ' · ';

  return {
    jobAbbreviation,
    origin: [service, region].filter(Boolean).join(separator),
  };
}

/** Resolve legacy World labels against their known service/DC before localizing. */
export function localizeCardWorld(character: AdventurerCardCharacter, locale: Locale): string {
  const candidate = character.worldId ?? character.world;
  const world = findWorld(candidate, {
    service: normalizeServiceId(character.service),
    physicalRegionId: character.physicalRegionId,
    dataCenterId: character.dataCenterId,
  });
  return localizeFfxivLabel('world', world?.id ?? candidate, locale);
}

import type { AdventurerCardCharacter } from '@/components/cards/types';
import { getJob } from '@/data/ffxiv';

const REGION_CODES: Record<string, string> = { japan: 'JP', 'north-america': 'NA', europe: 'EU', oceania: 'OC' };

/** Only known character metadata becomes a printed marker. Missing data stays absent. */
export function getCardMicrocopy(character: AdventurerCardCharacter) {
  const jobAbbreviation = getJob(character.jobId ?? character.job)?.abbreviation ?? '';
  const service = character.service === 'global' ? 'GLOBAL' : character.service === 'korea' ? 'KOREA' : '';
  const region = character.service === 'global' ? REGION_CODES[character.physicalRegionId ?? ''] ?? '' : '';
  return { jobAbbreviation, origin: [service, region].filter(Boolean).join(' / ') };
}

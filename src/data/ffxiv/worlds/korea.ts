import type { FfxivWorld } from '../types';

/**
 * Korean-service Worlds are kept in a separate service dataset. Public official material
 * verifies each World name, but does not publish a physical-region/logical-DC mapping;
 * those relationships therefore remain null. No server status is retained.
 * Sources are official Korean-service posts with active character/world labels (2026):
 * Mogri: https://www.ff14.co.kr/community/freecompany/view/21892
 * Chocobo: https://www.ff14.co.kr/community/freecompany/view/21789
 * Carbuncle: https://www.ff14.co.kr/community/event/fashioncontest2026/view/1148?category=1&page=9
 * Tonberry: https://www.ff14.co.kr/community/freecompany/view/22384?page=4
 * Fenrir: https://www.ff14.co.kr/community/freecompany/view/21753
 * Official server-opening notice also identifies the legacy worlds:
 * https://www.ff14.co.kr/news/notice/view/1962
 * Verified 2026-09-29; roster is limited to these officially evidenced names.
 */
export const KOREA_WORLDS = [
  { id: 'korea.mogri', service: 'korea', physicalRegionId: null, dataCenterId: null, localizedName: { ko: '모그리', en: 'Mogri', ja: 'Mogri' }, aliases: [], sortOrder: 0 },
  { id: 'korea.chocobo', service: 'korea', physicalRegionId: null, dataCenterId: null, localizedName: { ko: '초코보', en: 'Chocobo', ja: 'Chocobo' }, aliases: [], sortOrder: 1 },
  { id: 'korea.carbuncle', service: 'korea', physicalRegionId: null, dataCenterId: null, localizedName: { ko: '카벙클', en: 'Carbuncle', ja: 'Carbuncle' }, aliases: [], sortOrder: 2 },
  { id: 'korea.tonberry', service: 'korea', physicalRegionId: null, dataCenterId: null, localizedName: { ko: '톤베리', en: 'Tonberry', ja: 'Tonberry' }, aliases: [], sortOrder: 3 },
  { id: 'korea.fenrir', service: 'korea', physicalRegionId: null, dataCenterId: null, localizedName: { ko: '펜리르', en: 'Fenrir', ja: 'Fenrir' }, aliases: [], sortOrder: 4 },
] as const satisfies readonly FfxivWorld[];

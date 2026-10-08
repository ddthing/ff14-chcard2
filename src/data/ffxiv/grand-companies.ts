import type { FfxivGrandCompany } from './types';

/** Korean names follow the official in-game guide: https://guide.ff14.co.kr/lodestone/playguide/view/130 */
export const GRAND_COMPANIES = [
  { id: 'maelstrom', abbreviation: 'MS', localizedName: { ko: '흑와단', en: 'Maelstrom', ja: '黒渦団' }, sortOrder: 0, aliases: ['The Maelstrom'] },
  { id: 'twin-adder', abbreviation: 'TA', localizedName: { ko: '쌍사당', en: 'Order of the Twin Adder', ja: '双蛇党' }, sortOrder: 1, aliases: ['Twin Adder', 'Order of the Twin Adder'] },
  { id: 'immortal-flames', abbreviation: 'IF', localizedName: { ko: '불멸대', en: 'Immortal Flames', ja: '不滅隊' }, sortOrder: 2 },
] as const satisfies readonly FfxivGrandCompany[];

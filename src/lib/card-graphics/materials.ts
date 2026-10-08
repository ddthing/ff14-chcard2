import type {AdventurerCardTemplate,CardColorMode} from '@/components/cards/types';
import type {CardPalette} from '@/lib/palette';
const MATERIAL_SEEDS = {
 cinematic:{paper:'#ede4d1',brass:'#b6a179'},
 editorial:{paper:'#eee4d0',brass:'#9b8060'},
 'id-card':{paper:'#f1e9d9',brass:'#a58c64'},
} as const;
function hex(value:string,fallback:string){return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim())?value.trim():fallback;}
function mix(a:string,n:number,b:string){return `color-mix(in srgb, ${a} ${n}%, ${b})`;}
/** Ink/material roles use the existing palette without modifying photograph pixels. */
export function getCraftMaterialProperties(family:AdventurerCardTemplate,palette:CardPalette,mode:CardColorMode|undefined,jobAccent:string):Record<string,string>{
 const seed=MATERIAL_SEEDS[family];const light=hex(palette.light,'#f2eee5'),dark=hex(palette.dark,'#29251d'),primary=hex(palette.primary,'#8b7756'),accent=hex(palette.accent,'#8d7563');
 const custom=mode==='custom';
 return {
  '--craft-paper':custom?light:mix(seed.paper,84,light),
  '--craft-ivory':light,
  '--craft-ink':dark,
  '--craft-brass':custom?mix(accent,76,light):mix(seed.brass,82,primary),
  '--craft-red':mix(custom?accent:hex(jobAccent,'#a34f5a'),78,dark),
  '--craft-muted-ink':mix(dark,72,'transparent'),
 };
}

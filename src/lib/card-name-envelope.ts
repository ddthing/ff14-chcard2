import type {AdventurerCardTemplate,CardRatio} from '../components/cards/types';
import type {TypographyScript} from './typography-presets';

export interface NameEnvelope {
 width:number;
 height:number;
 referenceSize:number;
 caps:Readonly<Record<TypographyScript,number>>;
}
const envelope=(width:number,height:number,referenceSize:number,korean:number,japanese:number):NameEnvelope=>({width,height,referenceSize,caps:{latin:referenceSize,korean,japanese}});

/** CQI measures describe visual ink, not a requirement to fill the box.
 * Script caps limit dense glyphs; the actual font's measured ink/width/height
 * decides the final size within them. Short names are never enlarged past cap. */
export const CARD_NAME_ENVELOPES:Readonly<Record<AdventurerCardTemplate,Readonly<Record<CardRatio,NameEnvelope>>>>={
 cinematic:{
  '4:5':envelope(72,28,32,22.4,24),
  '1:1':envelope(70,25,28,20,21.6),
  '3:4':envelope(72,28,32,22.4,24),
  '9:16':envelope(72,30,28,20.2,21.8),
  '16:9':envelope(56,15,10,7.2,7.8),
 },
 editorial:{
  '4:5':envelope(35,19,14.4,10.4,11.2),
  '1:1':envelope(42,18,15.4,11.1,12),
  '3:4':envelope(29,18,12.2,8.8,9.5),
  '9:16':envelope(84,20,19,13.6,14.8),
  '16:9':envelope(58,14,12.3,8.9,9.7),
 },
 'id-card':{
  '4:5':envelope(27,9.2,8.8,6,6.8),
  '1:1':envelope(29,8.6,8,5.6,6.2),
  '3:4':envelope(27,9.2,8.8,6,6.8),
  '9:16':envelope(25,9.4,8.5,5.9,6.5),
  '16:9':envelope(16,8,3.9,2.8,3.1),
 },
};

export interface NameInkMetrics {
 /** Width and ink height at the 100px measuring size. */
 width:number;
 height:number;
 ink:number;
 lines:number;
}
export interface OpticalNameFit {
 size:number;
 width:number;
 height:number;
 ink:number;
 limiting:'cap'|'width'|'height'|'ink';
}

/** Pure solver; all typeface differences enter as real measured metrics. */
export function fitOpticalName({family,ratio,script,metrics,reference,lineHeight,availableWidth}:{family:AdventurerCardTemplate;ratio:CardRatio;script:TypographyScript;metrics:NameInkMetrics;reference:NameInkMetrics;lineHeight:number;availableWidth:number}):OpticalNameFit{
 const box=CARD_NAME_ENVELOPES[family][ratio];
 const width=Math.max(.1,Math.min(box.width,availableWidth));
 const heightUnits=Math.max(.01,metrics.height/100+Math.max(0,metrics.lines-1)*lineHeight);
 const heightLimit=metrics.lines===1?Math.min(box.height,reference.height/100*box.referenceSize):box.height;
 const inkSize=box.referenceSize*Math.sqrt(Math.max(1,reference.ink)/Math.max(1,metrics.ink));
 const limits={cap:box.caps[script],width:width*100/Math.max(1,metrics.width),height:heightLimit/heightUnits,ink:inkSize};
 const limiting=(Object.keys(limits) as Array<keyof typeof limits>).reduce((a,b)=>limits[a]<=limits[b]?a:b);
 const size=Math.max(.1,Math.floor(limits[limiting]*1000)/1000);
 return {size,width:metrics.width*size/100,height:heightUnits*size,ink:metrics.ink*(size/100)**2,limiting};
}

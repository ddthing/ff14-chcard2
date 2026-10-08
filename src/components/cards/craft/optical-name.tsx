'use client';

import {memo,useLayoutEffect,useRef,useState,type HTMLAttributes} from 'react';
import type { AdventurerCardTemplate, CardRatio } from '../types';
import {getMasterTypographyFamily,getMasterTypographyTreatment,getTypographyPreset,type TypographyScript} from '@/lib/typography-presets';
import {getTypographyScriptsForCardText,loadProfiledFontFace,loadTypographyFonts} from '@/data/fonts/load-fonts';
import {profileCount,profileRender,profileStart} from '@/lib/performance-profile';
import {CARD_NAME_ENVELOPES,fitOpticalName,type NameInkMetrics,type OpticalNameFit} from '@/lib/card-name-envelope';

export interface OpticalNameProps extends HTMLAttributes<HTMLHeadingElement> {
  family: AdventurerCardTemplate;
  ratio: CardRatio;
  name: string;
  lines: readonly string[];
  script: TypographyScript;
  typographyPreset: string;
  lineClassName?: string;
}

const measuredFonts=new Map<string,NameInkMetrics>();
const MEASURE_SIZE=100;

function getProfileFontId(font:string,script:TypographyScript):string{
 const familyList=font.toLowerCase();
 if(script==='korean')return familyList.includes('noto serif kr')?'noto-serif-kr':familyList.includes('noto sans kr')?'noto-sans-kr':'fallback';
 if(script==='japanese')return familyList.includes('noto serif jp')?'noto-serif-jp':familyList.includes('noto sans jp')?'noto-sans-jp':'fallback';
 if(familyList.includes('cormorant garamond'))return 'cormorant-garamond';
 if(familyList.includes('dm sans'))return 'dm-sans';
 return 'fallback';
}

/** Font-only raster measurement. No screenshot/image pixels are read or edited. */
function measureInk(
 lines:readonly string[],
 font:string,
 tracking:number,
 profile:{family:string;ratio:CardRatio;script:TypographyScript;role:'name'|'reference'},
):NameInkMetrics{
 tracking=Math.round(tracking*10000)/10000;
 const key=JSON.stringify([font,tracking,lines]);
 const cached=measuredFonts.get(key);
 if(cached){profileCount(`optical.measureInk.cache.hit.${profile.script}`);return cached;}
 profileCount(`optical.measureInk.cache.miss.${profile.script}`);
 const graphemeCount=lines.reduce((sum,line)=>sum+(typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(line)).length:Array.from(line).length),0);
 const finishTiming=profileStart('optical.measureInk.compute',{
  family:profile.family,
  ratio:profile.ratio,
  script:profile.script,
  role:profile.role,
  fontId:getProfileFontId(font,profile.script),
  glyphCount:graphemeCount,
  lineCount:lines.length,
  tracking,
 });
 try{
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Text measurement unavailable');
  let width=0,height=0,ink=0;
  for(const line of lines){
   ctx.font=font;
   const metrics=ctx.measureText(line);
   const ascent=metrics.actualBoundingBoxAscent||80,descent=metrics.actualBoundingBoxDescent||20;
   const glyphCount=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(line)).length:Array.from(line).length;
   const trackingWidth=Math.max(0,glyphCount-1)*tracking*MEASURE_SIZE;
   width=Math.max(width,metrics.width+trackingWidth);
   height=Math.max(height,ascent+descent);
   canvas.width=Math.max(1,Math.ceil(metrics.width+Math.abs(metrics.actualBoundingBoxLeft)+32));
   canvas.height=Math.max(1,Math.ceil(ascent+descent+32));
   ctx.font=font;ctx.fillStyle='#000';ctx.textBaseline='alphabetic';ctx.fontKerning='normal';
   ctx.fillText(line,16+Math.max(0,metrics.actualBoundingBoxLeft),16+ascent);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   for(let i=3;i<pixels.length;i+=4)ink+=pixels[i]/255;
  }
  const result={width,height,ink,lines:lines.length};
  if(measuredFonts.size>=256){measuredFonts.delete(measuredFonts.keys().next().value!);profileCount('optical.measureInk.cache.eviction');}
  measuredFonts.set(key,result);return result;
 }finally{
  finishTiming();
 }
}

type MeasuredFit={key:string;fit:OpticalNameFit;metrics:NameInkMetrics;reference:NameInkMetrics};

export const OpticalName=memo(function OpticalName({family,ratio,name,lines,script,typographyPreset,lineClassName,style,...props}:OpticalNameProps){
 profileRender('OpticalName');
 const heading=useRef<HTMLHeadingElement>(null);
 const [measured,setMeasured]=useState<MeasuredFit|null>(null);
 const textKey=lines.join('\n');
 const key=JSON.stringify([family,ratio,name,textKey,script,typographyPreset]);
 const box=CARD_NAME_ENVELOPES[family][ratio];
 const current=measured?.key===key?measured:null;
 const fallback=Math.min(box.caps[script],box.height/Math.max(1,lines.length*1.05));

 useLayoutEffect(()=>{
  const node=heading.current!;if(!node)return;
  let disposed=false,metricsReady=false,preparing=false;
  const masterFamily=getMasterTypographyFamily(family);
  const referenceFamily=getMasterTypographyTreatment(masterFamily,'display','latin').fontFamily;
  const referenceWeight=family==='id-card'?600:family==='editorial'?650:getTypographyPreset(typographyPreset).displayWeight;
  function calculate(){
   if(disposed||!heading.current)return;
   profileCount('optical.calculate.calls');
   const finishCalculate=profileStart('optical.calculate.total',{family,ratio,script});
   try{
   const computed=getComputedStyle(node),size=parseFloat(computed.fontSize)||1;
   const tracking=(parseFloat(computed.letterSpacing)||0)/size;
   const transform=(text:string)=>computed.textTransform==='uppercase'?text.toUpperCase():computed.textTransform==='lowercase'?text.toLowerCase():text;
   const renderedLines=textKey.split('\n').map(transform);
   const metrics=measureInk(renderedLines,`${computed.fontStyle} ${computed.fontWeight} ${MEASURE_SIZE}px ${computed.fontFamily}`,tracking,{family,ratio,script,role:'name'});
   const reference=measureInk([transform('Coner')],`${referenceWeight} ${MEASURE_SIZE}px ${referenceFamily}`,family==='id-card'?-.028:family==='editorial'?-.035:-.029,{family,ratio,script:'latin',role:'reference'});
   const card=node.closest('article');
   if(!card)return;
   const cardWidth=card.clientWidth||432;
   // Computed CSS widths are unaffected by the canvas zoom/pan transform.
   const available=(parseFloat(computed.width)||cardWidth)/cardWidth*100*.96;
   const lineHeight=(parseFloat(computed.lineHeight)||size*1.03)/size;
   const fit=fitOpticalName({family,ratio,script,metrics,reference,lineHeight,availableWidth:available});
   setMeasured(previous=>previous?.key===key&&Math.abs(previous.fit.size-fit.size)<.001?previous:{key,fit,metrics,reference});
   }finally{
    finishCalculate();
   }
  }
  async function ready(){
   if(preparing||disposed)return;preparing=true;
   profileCount(`optical.fontReady.calls.${script}`);
   const finishFontReady=profileStart('optical.fontReady.total',{family,script});
   try{
    // Start the Latin reference load alongside the existing script-subset loader.
    const scripts=getTypographyScriptsForCardText(name,script);
    const textByScript=Object.fromEntries(scripts.map(activeScript=>[activeScript,name])) as Partial<Record<TypographyScript,string>>;
    const serifWeightByScript=Object.fromEntries(scripts.map(activeScript=>[
     activeScript,
     getMasterTypographyTreatment(masterFamily,'display',activeScript).weight,
    ])) as Partial<Record<TypographyScript,number>>;
    await Promise.all([
     loadTypographyFonts(typographyPreset,scripts,textByScript,{masterFamily,serifWeightByScript,profileSource:'optical'}),
     loadProfiledFontFace(`${referenceWeight} ${MEASURE_SIZE}px ${referenceFamily}`,'Coner',{
      source:'optical-reference',face:`${masterFamily}-display-latin`,script:'latin',weight:referenceWeight,glyphCount:5,
     }),
    ]);
    const finishDocumentFonts=profileStart('optical.documentFonts.ready',{family,script});
    try{await document.fonts.ready;}finally{finishDocumentFonts();}
    const computed=getComputedStyle(node);
    await loadProfiledFontFace(`${computed.fontWeight} ${MEASURE_SIZE}px ${computed.fontFamily}`,name,{
     source:'optical-actual',face:`${masterFamily}-display-${script}`,script,weight:Number(computed.fontWeight)||0,glyphCount:Array.from(name).length,
    });
    metricsReady=true;if(!disposed)calculate();
   }catch{if(!disposed)calculate();}finally{preparing=false;finishFontReady();}
  }
  void ready();
  const fontsChanged=()=>{profileCount('optical.fonts.loadingdone');void ready();};
  document.fonts.addEventListener('loadingdone',fontsChanged);
  const observer=new ResizeObserver(()=>{if(!disposed&&metricsReady&&document.fonts.status==='loaded'){profileCount('optical.resizeObserver.callbacks');calculate();}});
  const card=node.closest('article');if(card)observer.observe(card);
  return()=>{disposed=true;observer.disconnect();document.fonts.removeEventListener('loadingdone',fontsChanged);};
 },[family,ratio,name,textKey,script,typographyPreset,key]);

 return <h2 {...props} ref={heading} style={{...style,fontSize:`${current?.fit.size??fallback}cqi`}} aria-label={name} data-master-typography-role="display"
  data-optical-name={family} data-optical-ratio={ratio} data-optical-script={script} data-optical-preset={typographyPreset}
  data-optical-ready={current?'true':'false'} data-optical-size={current?.fit.size??fallback}
  data-optical-width={current?.fit.width} data-optical-height={current?.fit.height} data-optical-ink={current?.fit.ink}
  data-optical-reference-ink={current?current.reference.ink*(box.referenceSize/100)**2:undefined}
  data-optical-limiting={current?.fit.limiting}>
  {lines.map((line,index)=><span className={lineClassName} key={`${index}-${line}`} aria-hidden="true">{line}</span>)}
 </h2>;
});

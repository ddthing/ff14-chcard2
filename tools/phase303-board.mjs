import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadPhase303Cases, qaRoot as phase303Root, writePhase303Viewer } from './phase303-viewer.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previousRoot=path.join(root,'docs','qa','phase302-jobmark-correction');
const familyLabels={cinematic:'C2',editorial:'E2','id-card':'I3'};
const familyOrder=['cinematic','editorial','id-card'];
const hashCache=new Map();

function escapeXml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;")}
function caseFamily(c){const v=String(c.family??c.master??c.template??'').toLowerCase();if(v==='c2'||v.includes('cinematic'))return 'cinematic';if(v==='e2'||v.includes('editorial'))return 'editorial';if(v==='i3'||v==='identity'||v.includes('id-card'))return 'id-card';return v}
function caseJob(c){return String(c.jobId??c.job??'')}
function caseLocale(c){return String(c.locale??'').toLowerCase()}
function caseRatio(c){return String(c.ratio??c.cardRatio??'').replaceAll('x',':').replaceAll('/',':')}
function caseName(c){return String(c.name??c.characterName??'').replace(/\s+/gu,' ').trim()}
function sourceClass(report){const pc=report.productionCard??{},rawMarks=pc.marks??pc.iconResolver?.sources??[],marks=Array.isArray(rawMarks)?rawMarks:Object.values(rawMarks),mark=marks.find(item=>item?.visible!==false)??marks[0];const value=pc.source??pc.sourceKind??pc.resolverSource??pc.jobIconSource??mark?.source??report.case?.sourceClass??report.case?.source;return typeof value==='string'?value:(value?.kind??value?.sourceKind??value?.actualSource??'not recorded')}
function displayText(value){if(typeof value==='string'||typeof value==='number')return String(value);if(value&&typeof value==='object')return String(value.visibleText??value.text??value.name??'');return ''}
function inside(parent,target){const rel=path.relative(parent,target);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel))}
function expectedHashValue(value){return typeof value==='string'?value.replace(/^sha256:/iu,'').toLowerCase():''}
async function hashFile(file){if(!hashCache.has(file)){hashCache.set(file,new Promise((resolve,reject)=>{const hash=createHash('sha256'),stream=createReadStream(file);stream.on('data',chunk=>hash.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')))}))}return hashCache.get(file)}
async function inspectAsset(file,hashValue,pixels,label,allowedRoot=phase303Root){
  if(!inside(allowedRoot,file))throw new Error(label+' path escaped its evidence root.');
  const info=await stat(file);if(!info.isFile())throw new Error(label+' is not a file.');
  const hash=await hashFile(file),expected=expectedHashValue(hashValue);
  if(!expected)throw new Error(label+' has no recorded SHA-256.');
  if(hash!==expected)throw new Error(label+' SHA-256 mismatch: '+path.relative(allowedRoot,file));
  const image=await sharp(file,{failOn:'error'}).metadata();
  if(!image.width||!image.height)throw new Error(label+' has no image dimensions.');
  if(pixels?.width&&pixels?.height&&(image.width!==Number(pixels.width)||image.height!==Number(pixels.height)))throw new Error(label+' dimensions differ from the raw report.');
  return {path:file,hash,bytes:info.size,width:image.width,height:image.height,format:image.format};
}
async function preparePreview(record,label,note=''){
  const report=record.report,p=report.preview??{};
  const asset=await inspectAsset(record.previewFile,p.hash??p.sha256,p.pixels??p.pixelDimensions,label);
  return {case:record.case,report,kind:'preview',asset,assetData:p,label,note};
}
function exportsForIdentity(cases,record){
  return cases.filter(item=>caseFamily(item.case)===caseFamily(record.case)&&caseJob(item.case)===caseJob(record.case)&&caseLocale(item.case)===caseLocale(record.case)&&caseRatio(item.case)===caseRatio(record.case)&&caseName(item.case)===caseName(record.case)).flatMap(item=>item.exportFiles.map(file=>({file,report:item.report})));
}
async function prepareExport(record,cases,format,scale,label){
  const candidates=exportsForIdentity(cases,record).filter(item=>item.file.format===format&&Number(item.file.requestedScale??item.file.scale)===scale);
  if(!candidates.length)throw new Error('Missing '+format+' '+scale+'× export for '+record.id);
  const {file,report}=candidates[0],pixels=file.blobDims??file.actualCapsizes??file.actualSize??file.dimensions??null;
  const asset=await inspectAsset(file.file,file.hash??file.sha256,pixels,label);
  return {case:record.case,report:record.report,kind:'export',asset,assetData:file,label,note:'Actual output record from '+(report.case?.id??report.case?.caseId??record.id)};
}
function findCase(cases,filter){
  const matches=cases.filter(record=>{const c=record.case??{};return(!filter.family||caseFamily(c)===filter.family)&&(!filter.job||caseJob(c)===filter.job)&&(!filter.locale||caseLocale(c)===filter.locale)&&(!filter.ratio||caseRatio(c)===filter.ratio)&&(!filter.name||caseName(c)===filter.name)});
  const priority=name=>name.includes('qa-cases-core')?0:name.includes('qa-cases-ratios')?1:name.includes('qa-cases-locales')?2:name.includes('qa-cases-longnames')?3:4;
  matches.sort((a,b)=>priority(a.manifest)-priority(b.manifest)||a.id.localeCompare(b.id));
  if(!matches.length)throw new Error('No captured case matches '+JSON.stringify(filter));
  return matches[0];
}
async function coreTile(cases,family,job='red-mage',locale='en',ratio='4:5',name='Coner',label=''){
  const record=findCase(cases,{family,job,locale,ratio,name});
  return preparePreview(record,label||((familyLabels[family]||family)+' · '+job));
}
async function previousPhase302Tile(master,variant,label){
  const manifest=JSON.parse(await readFile(path.join(previousRoot,'job-matrix-results.json'),'utf8'));
  const row=manifest.cases.find(item=>item.master===master&&item.jobMark?.jobId==='red-mage'&&item.jobMark?.variant===variant);
  if(!row)throw new Error('Missing Phase302 comparison case for '+master+' mark '+variant);
  const reportPath=path.join(previousRoot,'raw',row.id+'.json');
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  const preview=report.previewScreenshot;if(!preview?.path||!preview?.sha256)throw new Error('Missing previous preview evidence for '+row.id);
  const file=path.resolve(previousRoot,preview.path);
  const pixels=preview.pixelDimensions??preview.expectedPixelDimensions;
  const asset=await inspectAsset(file,preview.sha256,pixels,label,previousRoot);
  return {case:{id:row.id,family:master,job:'red-mage',jobId:'red-mage',locale:report.case?.locale??row.nameLang??'ko',ratio:'4:5',name:report.case?.name??row.name??'Coner'},report,kind:'preview',asset,assetData:preview,label,note:'Previous Phase 3.0.2 QA capture; typography/font controls differ from current production.'};
}
function productionLines(tile){
  const report=tile.report??{},pc=report.productionCard??{};
  const rawMarks=pc.marks??pc.iconResolver?.sources??[],marks=Array.isArray(rawMarks)?rawMarks:Object.values(rawMarks),mark=marks.find(item=>item?.visible!==false)??marks[0];
  const iconRect=pc.rects?.glyph??pc.rects?.icon??pc.glyphRect??pc.iconRect??mark?.rect??null;
  const size=pc.glyphSizeLogicalPx??pc.jobGlyphSizeLogicalPx??pc.glyphSize??null;
  const details=['Source: '+sourceClass(report)];
  const abbreviation=displayText(pc.abbreviation??tile.report?.expected?.canonicalAbbreviation??pc.jobAbbreviation??tile.case?.abbreviation);
  if(abbreviation)details.push('Abbr: '+abbreviation);
  if(size!=null)details.push('Glyph: '+String(size)+' logical px');
  if(iconRect)details.push('Glyph rect: '+Number(iconRect.width??0).toFixed(1)+'×'+Number(iconRect.height??0).toFixed(1)+' CSS px');
  const geo=pc.geometryAudit??pc.jobGeometryAudit;
  const duplicates=geo?.duplicateVisibleEmblemCount??geo?.duplicateMarkCount??pc.duplicateVisibleMarkCount??pc.duplicateMarkCount;
  if(duplicates!=null)details.push('Visible duplicate marks: '+duplicates);
  return details;
}
function assetLines(tile){
  if(tile.kind==='preview')return ['Preview '+tile.asset.width+'×'+tile.asset.height+'px · SHA-256 '+tile.asset.hash.slice(0,12)+'…'];
  const data=tile.assetData??{},dims=data.blobDims??data.actualCapsizes??data.actualSize??data.dimensions??null;
  return [String(data.format??tile.asset.format??'export').toUpperCase()+' requested '+String(data.requestedScale??'?')+'× · actual '+tile.asset.width+'×'+tile.asset.height+'px · capped '+String(dims?.capped??data.capped??'unreported'), 'SHA-256 '+tile.asset.hash.slice(0,12)+'…'];
}
function wrapText(input,maxChars){const output=[];let line='';for(const word of String(input??'').split(/\s+/u).filter(Boolean)){const next=line?line+' '+word:word;if(Array.from(next).length>maxChars&&line){output.push(line);line=word}else line=next}if(line)output.push(line);return output}
function captionSvg(tile,width,height){
  const c=tile.case??{},pc=tile.report?.productionCard??{},family=caseFamily(c),jobName=displayText(pc.localizedJobName??tile.report?.expected?.localizedJobName??pc.jobName)||caseJob(c),abbr=displayText(pc.abbreviation??tile.report?.expected?.canonicalAbbreviation??pc.jobAbbreviation??c.abbreviation);
  const title=tile.label??((familyLabels[family]||family)+' · '+jobName+(abbr?' ('+abbr+')':''));
  const lines=[
    (familyLabels[family]||family)+' · '+jobName+(abbr?' / '+abbr:''),
    caseLocale(c).toUpperCase()+' · '+caseRatio(c)+' · '+caseName(c)+' · layout '+String(c.layoutVariant??c.layout??'—'),
    ...productionLines(tile),
    ...assetLines(tile),
    ...(tile.note?[tile.note]:[]),
  ].flatMap(value=>wrapText(value,Math.max(23,Math.floor((width-28)/6.4))));
  const lineHeight=15,limit=Math.floor((height-38)/lineHeight);
  if(lines.length>limit)throw new Error('Caption overflow for '+String(c.id??title)+' ('+lines.length+'/'+limit+'); increase captionHeight. Lines: '+lines.join(' | '));
  const titleSize=Array.from(title).length>36?12:15;
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" fill="#171b18"/><text x="14" y="22" font-family="Arial, sans-serif" font-size="'+titleSize+'" font-weight="700" fill="#eee6d6">'+escapeXml(title)+'</text>'+lines.map((line,index)=>'<text x="14" y="'+(42+index*lineHeight)+'" font-family="Arial, sans-serif" font-size="10.5" fill="'+(index<2?'#d8c6a8':'#bac4bc')+'">'+escapeXml(line)+'</text>').join('')+'</svg>');
}
async function composeBoard(spec){
  const margin=spec.margin??22,gap=spec.gap??14,header=spec.headerHeight??68,captionHeight=spec.captionHeight??174;
  const columns=spec.columns,tileWidth=spec.tileWidth,imageHeight=spec.imageHeight;
  const tileHeight=captionHeight+imageHeight,rows=Math.ceil(spec.tiles.length/columns);
  const width=margin*2+columns*tileWidth+(columns-1)*gap,height=margin+header+rows*tileHeight+(rows-1)*gap+margin;
  const composites=[];
  for(let i=0;i<spec.tiles.length;i++){
    const tile=spec.tiles[i],x=margin+(i%columns)*(tileWidth+gap),y=margin+header+Math.floor(i/columns)*(tileHeight+gap);
    const captionImage=captionSvg(tile,tileWidth,captionHeight);
    const card=await sharp(tile.asset.path,{failOn:'error'}).resize(tileWidth,imageHeight,{fit:'contain',background:{r:236,g:233,b:225,alpha:1}}).png().toBuffer();
    composites.push({input:captionImage,left:x,top:y},{input:card,left:x,top:y+captionHeight});
  }
  const titleSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+header+'"><rect width="100%" height="100%" fill="#111512"/><text x="'+margin+'" y="25" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#eee6d6">'+escapeXml(spec.title)+'</text><text x="'+margin+'" y="47" font-family="Arial,sans-serif" font-size="11" fill="#aab5ac">'+escapeXml(spec.note??'Actual card captures · captions outside artwork · no crop applied')+'</text></svg>');
  composites.unshift({input:titleSvg,left:0,top:0});
  const file=path.join(phase303Root,spec.file);
  if(!inside(phase303Root,file))throw new Error('Board output escaped Phase303 folder.');
  await sharp({create:{width,height,channels:3,background:'#111512'}}).composite(composites).png().toFile(file);
  return {file:spec.file,width,height,tileCount:spec.tiles.length};
}
async function makeBoards(cases){
  const specs=[];
  for(const [family,file,title] of [['cinematic','01-c2-final.png','C2 · Final Job Identity'],['editorial','02-e2-final.png','E2 · Final Job Identity'],['id-card','03-i3-final.png','I3 · Final Job Identity']]){
    const tile=await coreTile(cases,family);
    tile.label=title;
    specs.push({file,title,note:'Current production renderer · Red Mage · EN · 4:5 · complete card',tiles:[tile],columns:1,tileWidth:800,imageHeight:1000,captionHeight:145,gap:18,margin:26,headerHeight:78});
  }
  for(const [job,file,title] of [['red-mage','04-rdm-all.png','RDM · Red Mage'],['dragoon','05-drg-all.png','DRG · Dragoon'],['gunbreaker','06-gnb-all.png','GNB · Gunbreaker'],['white-mage','07-whm-all.png','WHM · White Mage'],['black-mage','08-blm-all.png','BLM · Black Mage']]){
    const tiles=[];for(const family of familyOrder){const t=await coreTile(cases,family,job);t.label=(familyLabels[family]||family)+' · '+title;tiles.push(t)}
    specs.push({file,title,note:'Same job, name, locale and ratio; actual cards from the three family renderers.',tiles,columns:3,tileWidth:360,imageHeight:450,captionHeight:145});
  }
  const sourceTiles=[];
  for(const [job,src] of [['red-mage','SVG'],['reaper','HQ raster'],['astrologian','Fan Kit'],['beastmaster','Generic fallback']]){
    for(const family of familyOrder){const t=await coreTile(cases,family,job);t.label=src+' · '+(familyLabels[family]||family)+' · '+job;t.note='Resolver source: '+sourceClass(t.report);sourceTiles.push(t)}
  }
  specs.push({file:'09-source-classes.png',title:'Source classes · shared Job Identity blocks',note:'Source names come from productionCard evidence; cards are full and uncropped.',tiles:sourceTiles,columns:4,tileWidth:270,imageHeight:338,captionHeight:190});
  const ratioTiles=[];for(const family of familyOrder){for(const ratio of ['1:1','4:5','3:4','9:16','16:9']){const t=await coreTile(cases,family,'red-mage','en',ratio,'Coner');t.label=(familyLabels[family]||family)+' · '+ratio;ratioTiles.push(t)}}
  specs.push({file:'10-ratios.png',title:'Responsive ratios · Red Mage',note:'All supported card ratios from the actual production renderer; full card images are contain-fit in the board.',tiles:ratioTiles,columns:5,tileWidth:224,imageHeight:398,captionHeight:196,gap:12,margin:18});
  const scaleTiles=[];for(const family of familyOrder){const base=await coreTile(cases,family,'astrologian','en','4:5','Coner');for(const [format,scale] of [['png',1],['png',2],['png',4],['webp',2]]){scaleTiles.push(await prepareExport(base,cases,format,scale,(familyLabels[family]||family)+' · AST Fan Kit · '+format.toUpperCase()+' '+scale+'×'))}}
  specs.push({file:'11-export-scales.png',title:'Export scales · Fan Kit source',note:'Same captured AST card; captions show requested format/scale and actual output dimensions.',tiles:scaleTiles,columns:4,tileWidth:286,imageHeight:358,captionHeight:205,gap:12,margin:18});
  const localeTiles=[];for(const family of familyOrder){for(const [locale,name] of [['ko','코너'],['en','Coner'],['ja','コナー']]){const t=await coreTile(cases,family,'red-mage',locale,'4:5',name);t.label=(familyLabels[family]||family)+' · '+locale.toUpperCase();localeTiles.push(t)}}
  specs.push({file:'12-ko-en-ja.png',title:'Localization · Red Mage',note:'Three locales, three production Master families; complete captures only.',tiles:localeTiles,columns:3,tileWidth:360,imageHeight:450,captionHeight:166});
  const beforeAfter=[];for(const [family,variant,label] of [['cinematic','C','C2 previous QA C'],['editorial','B','E2 previous QA B'],['id-card','C','I3 previous QA C']]){
    const old=await previousPhase302Tile(family,variant,label);beforeAfter.push(old);
    const current=await coreTile(cases,family,'red-mage','ko','4:5','코너');current.label=(familyLabels[family]||family)+' · current production';current.note='Previous QA card used “Coner 코너”; this is the localized production name “코너”. Typography also differs, so this is not a font comparison.';beforeAfter.push(current);
  }
  specs.push({file:'13-before-after.png',title:'Previous QA composition vs current production',note:'C2-C / E2-B / I3-C Phase302 images beside current production captures. Typography differs; do not treat this as a font comparison.',tiles:beforeAfter,columns:2,tileWidth:420,imageHeight:525,captionHeight:204,gap:14,margin:18,headerHeight:80});
  const finalTiles=[];for(const family of familyOrder){const t=await coreTile(cases,family);t.label=(familyLabels[family]||family)+' · Red Mage · EN · 4:5';finalTiles.push(t)}
  specs.push({file:'14-final-master-board.png',title:'Final Job Identity · three Masters',note:'Native 1080px export-resolution cards from the production renderer; current production typography; no crop.',tiles:finalTiles,columns:3,tileWidth:1080,imageHeight:1350,captionHeight:166,gap:18,margin:24,headerHeight:80});
  return specs;
}

const detailCropLogical={width:64,height:56};
const detailScales=[1,2,4];
const detailSourceJobs=[
  {job:'red-mage',label:'SVG · Red Mage'},
  {job:'reaper',label:'HQ raster · Reaper'},
  {job:'astrologian',label:'Fan Kit · Astrologian'},
  {job:'beastmaster',label:'Generic · Beastmaster'},
];

async function extractNativeJobCrop(tile){
  const report=tile.report??{},preview=report.preview??{},pc=report.productionCard??{};
  const cardRect=pc.rect??preview.cardRectCss??preview.cardRect;
  if(!cardRect||!Number(cardRect.width)||!Number(cardRect.height))throw new Error('Missing production preview card rectangle for detail crop: '+tile.case?.id);
  const rawMarks=pc.marks??pc.iconResolver?.sources??[];
  const marks=Array.isArray(rawMarks)?rawMarks:Object.values(rawMarks);
  const mark=marks.find(item=>item?.visible!==false&&item?.rect)??marks.find(item=>item?.rect);
  if(!mark?.rect)throw new Error('Missing measured Job mark rectangle for detail crop: '+tile.case?.id);
  const logical=tile.assetData?.logicalDimensions??{width:Number(cardRect.width),height:Number(cardRect.height)};
  const scaleX=tile.asset.width/Number(logical.width),scaleY=tile.asset.height/Number(logical.height);
  if(!Number.isFinite(scaleX)||!Number.isFinite(scaleY)||scaleX<=0||scaleY<=0)throw new Error('Invalid native export scale for detail crop: '+tile.case?.id);
  const markRect=mark.rect;
  const cardX=Number(cardRect.x??0),cardY=Number(cardRect.y??0);
  const markLeft=(Number(markRect.x)-cardX),markTop=(Number(markRect.y)-cardY);
  const markRight=markLeft+Number(markRect.width),markBottom=markTop+Number(markRect.height);
  const cx=(markLeft+markRight)/2,cy=(markTop+markBottom)/2;
  if(!Number.isFinite(cx)||!Number.isFinite(cy)||cx<0||cy<0||cx>Number(logical.width)||cy>Number(logical.height)||cx*scaleX>tile.asset.width||cy*scaleY>tile.asset.height)throw new Error('Measured Job mark falls outside native export: '+tile.case?.id);
  const logicalLeft=cx-detailCropLogical.width/2,logicalRight=cx+detailCropLogical.width/2;
  const logicalTop=cy-detailCropLogical.height/2,logicalBottom=cy+detailCropLogical.height/2;
  const left=Math.max(0,Math.min(tile.asset.width-1,Math.floor(logicalLeft*scaleX)));
  const top=Math.max(0,Math.min(tile.asset.height-1,Math.floor(logicalTop*scaleY)));
  const right=Math.max(left+1,Math.min(tile.asset.width,Math.ceil(logicalRight*scaleX)));
  const bottom=Math.max(top+1,Math.min(tile.asset.height,Math.ceil(logicalBottom*scaleY)));
  const width=right-left,height=bottom-top;
  const crop={left,top,width,height};
  const image=await sharp(tile.asset.path,{failOn:'error'}).extract(crop).png().toBuffer();
  const markPad={left:(markLeft-left/scaleX),right:(right/scaleX-markRight),top:(markTop-top/scaleY),bottom:(bottom/scaleY-markBottom)};
  return {...tile,nativeCrop:{image,...crop,scaleX,scaleY,markPad,source:mark.source??sourceClass(report)}};
}

function detailLabelSvg(width,height,line1,line2){
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" fill="#252b26"/><text x="7" y="13" font-family="Arial,sans-serif" font-size="8.5" font-weight="700" fill="#eee6d6">'+escapeXml(line1)+'</text><text x="7" y="26" font-family="Arial,sans-serif" font-size="8" fill="#bbc5bc">'+escapeXml(line2)+'</text></svg>');
}

function detailSectionTitle(width,text){
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="36"><text x="0" y="24" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#eee6d6">'+escapeXml(text)+'</text></svg>');
}

function detailCellBg(width,height){
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect x="0.5" y="0.5" width="'+(width-1)+'" height="'+(height-1)+'" rx="7" fill="#191f1a" stroke="#3c463e"/></svg>');
}

function detailRowLabel(width,height,primary,secondary){
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" rx="7" fill="#202721"/><text x="12" y="24" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#eee6d6">'+escapeXml(primary)+'</text><text x="12" y="43" font-family="Arial,sans-serif" font-size="10" fill="#bbc5bc">'+escapeXml(secondary)+'</text></svg>');
}

function familyHeadingSvg(width,text){
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="30"><text x="8" y="20" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#d6bd96">'+escapeXml(text)+'</text></svg>');
}

function nativeExportLabel(tile){
  const data=tile.assetData??{},requested=Number(data.requestedScale??data.scale??0),actual=Number(data.actualScale??requested);
  const actualText=Number.isFinite(actual)?actual.toFixed(3):'unreported';
  const capped=data.capped===true?' · capped':data.capped===false?' · uncapped':'';
  const pad=tile.nativeCrop?.markPad;
  const effective=pad?Math.min(pad.left,pad.right,pad.top,pad.bottom).toFixed(1):'—';
  return {
    line1:'PNG '+requested+'× · engine scale '+actualText+'×'+capped,
    line2:'export '+tile.asset.width+'×'+tile.asset.height+'px · crop '+tile.nativeCrop.width+'×'+tile.nativeCrop.height+'px · glyph inset ≥'+effective+' logical px',
  };
}

async function prepareDetailCrop(cases,family,job,ratio,scale,label){
  const record=findCase(cases,{family,job,locale:'en',ratio,name:'Coner'});
  const base=await preparePreview(record,label);
  const exportTile=await prepareExport(base,cases,'png',scale,label);
  return extractNativeJobCrop(exportTile);
}

async function composeSourceDetailBoard(cases){
  const sourceRows=[];
  for(const source of detailSourceJobs){
    const familyCells=[];
    for(const family of familyOrder){
      const scales=[];
      for(const scale of detailScales)scales.push(await prepareDetailCrop(cases,family,source.job,'4:5',scale,(familyLabels[family]||family)+' · '+source.job+' · PNG '+scale+'×'));
      familyCells.push(scales);
    }
    sourceRows.push({source,familyCells});
  }
  const ratioRows=[];
  for(const ratio of ['1:1','4:5','3:4','9:16','16:9']){
    const familyCells=[];
    for(const family of familyOrder)familyCells.push(await prepareDetailCrop(cases,family,'astrologian',ratio,4,(familyLabels[family]||family)+' · AST · '+ratio+' · PNG 4×'));
    ratioRows.push({ratio,familyCells});
  }

  const margin=24,rowLabelWidth=190,familyGap=18,labelHeight=34,cellPadding=10,miniGap=8;
  const scaleWidths=detailScales.map((_,index)=>Math.max(...sourceRows.flatMap(row=>row.familyCells.map(cell=>cell[index].nativeCrop.width))));
  const scaleHeights=detailScales.map((_,index)=>Math.max(...sourceRows.flatMap(row=>row.familyCells.map(cell=>cell[index].nativeCrop.height))));
  const sourceCellWidth=cellPadding*2+scaleWidths.reduce((sum,value)=>sum+value,0)+miniGap*(detailScales.length-1);
  const ratioCellWidth=cellPadding*2+Math.max(...ratioRows.flatMap(row=>row.familyCells.map(tile=>tile.nativeCrop.width)));
  const cellWidth=Math.max(sourceCellWidth,ratioCellWidth);
  const ratioCropHeight=Math.max(...ratioRows.flatMap(row=>row.familyCells.map(tile=>tile.nativeCrop.height)));
  const sourceRowHeight=labelHeight+Math.max(...scaleHeights)+cellPadding*2;
  const ratioRowHeight=labelHeight+ratioCropHeight+cellPadding*2;
  const gridX=margin+rowLabelWidth+familyGap;
  const width=gridX+cellWidth*familyOrder.length+familyGap*(familyOrder.length-1)+margin;
  const headerHeight=82,sectionGap=24,sectionTitleHeight=36,familyHeaderHeight=30,rowGap=10;
  const sourceHeadingY=headerHeight;
  const sourceFamilyY=sourceHeadingY+sectionTitleHeight;
  const sourceRowsY=sourceFamilyY+familyHeaderHeight;
  const ratioHeadingY=sourceRowsY+sourceRows.length*(sourceRowHeight+rowGap)-rowGap+sectionGap;
  const ratioFamilyY=ratioHeadingY+sectionTitleHeight;
  const ratioRowsY=ratioFamilyY+familyHeaderHeight;
  const height=ratioRowsY+ratioRows.length*(ratioRowHeight+rowGap)-rowGap+margin;
  const composites=[];
  const title=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+headerHeight+'"><rect width="100%" height="100%" fill="#111512"/><text x="'+margin+'" y="29" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#eee6d6">15 · Source detail · native production PNG crops</text><text x="'+margin+'" y="52" font-family="Arial,sans-serif" font-size="11" fill="#b9c3ba">Measured mark geometry centers 64×56 logical-pixel crops (±32 horizontally); pixels are placed 1:1 without upscaling.</text><text x="'+margin+'" y="69" font-family="Arial,sans-serif" font-size="10" fill="#9fac9f">Labels report requested scale, engine scale, export dimensions, cap status, crop size, and measured glyph inset.</text></svg>');
  composites.push({input:title,left:0,top:0});
  composites.push({input:detailSectionTitle(width-2*margin,'Four resolver source classes · PNG 1× / 2× / 4×'),left:margin,top:sourceHeadingY});
  composites.push({input:detailSectionTitle(width-2*margin,'AST Fan Kit · all five ratios at PNG 4×'),left:margin,top:ratioHeadingY});

  for(let column=0;column<familyOrder.length;column++){
    const family=familyOrder[column],x=gridX+column*(cellWidth+familyGap),heading=(familyLabels[family]||family)+' · '+family.toUpperCase();
    composites.push({input:familyHeadingSvg(cellWidth,heading),left:x,top:sourceFamilyY});
    composites.push({input:familyHeadingSvg(cellWidth,heading),left:x,top:ratioFamilyY});
  }

  for(let rowIndex=0;rowIndex<sourceRows.length;rowIndex++){
    const {source,familyCells}=sourceRows[rowIndex],y=sourceRowsY+rowIndex*(sourceRowHeight+rowGap);
    const sample=familyCells[0][0],actualSource=sourceClass(sample.report),jobName=displayText(sample.report.productionCard?.localizedJobName??sample.report.expected?.localizedJobName??sample.report.productionCard?.jobName)||source.job,abbreviation=displayText(sample.report.expected?.canonicalAbbreviation??sample.report.productionCard?.jobAbbreviation);
    composites.push({input:detailRowLabel(rowLabelWidth,sourceRowHeight,jobName,actualSource+(abbreviation?' · '+abbreviation:'')),left:margin,top:y});
    for(let familyIndex=0;familyIndex<familyOrder.length;familyIndex++){
      const x=gridX+familyIndex*(cellWidth+familyGap),scales=familyCells[familyIndex];
      composites.push({input:detailCellBg(cellWidth,sourceRowHeight),left:x,top:y});
      let slotX=x+cellPadding;
      for(let scaleIndex=0;scaleIndex<scales.length;scaleIndex++){
        const tile=scales[scaleIndex],slotWidth=scaleWidths[scaleIndex],labels=nativeExportLabel(tile),labelSvg=detailLabelSvg(slotWidth,labelHeight,labels.line1,labels.line2);
        composites.push({input:labelSvg,left:slotX,top:y+cellPadding});
        composites.push({input:tile.nativeCrop.image,left:slotX+Math.floor((slotWidth-tile.nativeCrop.width)/2),top:y+cellPadding+labelHeight});
        slotX+=slotWidth+miniGap;
      }
    }
  }

  for(let rowIndex=0;rowIndex<ratioRows.length;rowIndex++){
    const {ratio,familyCells}=ratioRows[rowIndex],y=ratioRowsY+rowIndex*(ratioRowHeight+rowGap);
    composites.push({input:detailRowLabel(rowLabelWidth,ratioRowHeight,'AST · '+ratio,'Fan Kit · requested PNG 4×'),left:margin,top:y});
    for(let familyIndex=0;familyIndex<familyOrder.length;familyIndex++){
      const x=gridX+familyIndex*(cellWidth+familyGap),tile=familyCells[familyIndex],labels=nativeExportLabel(tile);
      composites.push({input:detailCellBg(cellWidth,ratioRowHeight),left:x,top:y});
      composites.push({input:detailLabelSvg(cellWidth-2*cellPadding,labelHeight,labels.line1,labels.line2),left:x+cellPadding,top:y+cellPadding});
      composites.push({input:tile.nativeCrop.image,left:x+Math.floor((cellWidth-tile.nativeCrop.width)/2),top:y+cellPadding+labelHeight});
    }
  }

  const file=path.join(phase303Root,'15-source-detail.png');
  if(!inside(phase303Root,file))throw new Error('Source-detail board output escaped Phase303 folder.');
  await sharp({create:{width,height,channels:3,background:'#111512'}}).composite(composites).png().toFile(file);
  return {file:'15-source-detail.png',width,height,tileCount:sourceRows.length*familyOrder.length*detailScales.length+ratioRows.length*familyOrder.length,nativePixelCrops:true};
}

async function main(){
  const cases=await loadPhase303Cases();
  const specs=await makeBoards(cases);
  const required=['01-c2-final.png','02-e2-final.png','03-i3-final.png','04-rdm-all.png','05-drg-all.png','06-gnb-all.png','07-whm-all.png','08-blm-all.png','09-source-classes.png','10-ratios.png','11-export-scales.png','12-ko-en-ja.png','13-before-after.png','14-final-master-board.png'];
  if(specs.length!==required.length||required.some(file=>!specs.some(spec=>spec.file===file)))throw new Error('The Phase303 board set is incomplete.');
  for(const spec of specs)for(const tile of spec.tiles)captionSvg(tile,spec.tileWidth,spec.captionHeight??174);
  const results=[];for(const spec of specs)results.push(await composeBoard(spec));
  results.push(await composeSourceDetailBoard(cases));
  if(results.length!==15||results.at(-1).file!=='15-source-detail.png')throw new Error('The supplemental Phase303 source-detail board is missing.');
  const viewer=await writePhase303Viewer(cases);
  console.log(JSON.stringify({boards:results,viewer},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

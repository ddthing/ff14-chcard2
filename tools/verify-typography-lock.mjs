import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {register} from 'node:module';
register('../tests/ts-alias-loader.mjs',import.meta.url);
const {getMasterTypographyFamily,getMasterTypographyTreatment,detectTypographyScript}=await import('../src/lib/typography-presets.ts');

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/typography-lock');
const families=['cinematic','editorial','id-card'],ratios=['1x1','4x5','3x4','9x16','16x9'];
const cases=['latin','ko','ja','latin-long','ko-long','kanji','mixed-ko','mixed-han','mixed-ja'];
const expected=families.flatMap(family=>ratios.flatMap(ratio=>cases.map(name=>`${family}-${name}-${ratio}-2x`)));
const failures=[], records=[];
const overlap=(a,b)=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
for(const stem of expected){
 try{
  const data=JSON.parse(await fs.readFile(path.join(out,'exports',stem+'.json'),'utf8'));
  const issues=[];
  if(data.fonts!=='loaded'||data.images.some(image=>!image.loaded))issues.push('assets');
  if(data.optical?.opticalReady!=='true'||data.assetOpticalSnapshots[0]?.ready!=='true'||data.assetOpticalSnapshots[0]?.size!==data.optical.opticalSize)issues.push('optical asset-wait readiness');
  if(data.credit!=='© SQUARE ENIX')issues.push('copyright');
  if(data.shadows.some(style=>style.shadow!=='none'))issues.push('shadow');
  const fields=data.fields.filter(field=>['primary','secondary'].includes(field.priority)&&field.width>0);
  for(const field of fields)if(!field.inside||!field.inkInside)issues.push(`bounds:${field.field}`);
  for(let a=0;a<fields.length;a++)for(let b=a+1;b<fields.length;b++)if(overlap(fields[a],fields[b]))issues.push(`collision:${fields[a].field}/${fields[b].field}`);
  if(data.family==='id-card')for(const header of data.headers)for(const field of fields)if(overlap(header,field))issues.push(`header collision:${header.text}/${field.field}`);
  const nameStyle=data.optical;
  if(!nameStyle?.font.includes('Cormorant Garamond Variable'))issues.push('missing Latin display family');
  if(data.case!=='latin'&&data.case!=='latin-long'&&(!nameStyle?.font.includes('Noto Serif KR Variable')||!nameStyle.font.includes('Noto Serif JP Variable')))issues.push('incomplete CJK display stack');
  if(data.case!=='latin'&&data.case!=='latin-long'){
   const face=data.locale==='ko'?'Noto Serif KR Variable':'Noto Serif JP Variable';
   if(!data.loadedFaces.some(font=>font.family.replaceAll('"','')===face))issues.push(`missing loaded face:${face}`);
   const expectedStyle=getMasterTypographyTreatment(getMasterTypographyFamily(data.family),'display',data.optical.opticalScript);
   if(Number(nameStyle.weight)!==expectedStyle.weight)issues.push('display weight bypasses role map');
   const actualTracking=(parseFloat(nameStyle.tracking)||0)/parseFloat(nameStyle.fontSize);
   if(Math.abs(actualTracking-parseFloat(expectedStyle.tracking))>.0001)issues.push('display tracking bypasses role map');
  }
  for(const style of data.roleStyles.filter(style=>style.masterRole&&/[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(style.text))){
   const script=detectTypographyScript(style.text,data.locale==='ko'?'korean':'japanese');
   const role=style.masterRole.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
   const treatment=getMasterTypographyTreatment(getMasterTypographyFamily(data.family),role,script);
   const face=script==='korean'?'KR':'JP';
   const isSerif=treatment.fontFamily.includes('Noto Serif');
   if(!style.font.includes(`Noto ${isSerif?'Serif':'Sans'} ${face} Variable`))issues.push(`role font:${role}/${style.text}`);
  }
  const metadata=await sharp(path.join(out,'exports',stem+'.png')).metadata();
  if(metadata.width!==data.size.width||metadata.height!==data.size.height||data.size.scale!==2)issues.push('2x dimensions');
  failures.push(...issues.map(issue=>`${stem}: ${issue}`));records.push({stem,family:data.family,locale:data.locale,case:data.case,ratio:data.ratio,size:data.size,optical:data.optical,issues});
 }catch(error){failures.push(`${stem}: ${error.message}`);}
}
for(const family of families){
 for(const name of ['locale-ko','locale-ja']){
  try{const data=JSON.parse(await fs.readFile(path.join(out,'exports',`${family}-${name}-4x5-2x.json`),'utf8'));if(data.character.name!=='Coner')failures.push(`${family}/${name}: changed comparison name`);}catch(error){failures.push(error.message);}
 }
 try{
  const png=JSON.parse(await fs.readFile(path.join(out,'exports',`${family}-latin-4x5-2x.json`),'utf8'));
  const webp=JSON.parse(await fs.readFile(path.join(out,'exports',`${family}-latin-4x5-2x-webp.json`),'utf8'));
  for(const key of ['fields','optical','shapes','pictograms','frame','size'])if(JSON.stringify(png[key])!==JSON.stringify(webp[key]))failures.push(`${family}: PNG/WebP ${key} parity`);
 }catch(error){failures.push(error.message);}
}
const protectedFiles=JSON.parse(await fs.readFile(path.join(out,'protected-files.json'),'utf8'));
for(const entry of protectedFiles){const hash=createHash('sha256').update(await fs.readFile(path.join(root,entry.file))).digest('hex');if(hash!==entry.sha256)failures.push(`Protected file changed:${entry.file}`);}
const presetRecords=[];
for(const family of families)for(const preset of ['editorial','modern','condensed','classic','clean'])for(const script of ['latin','ko','ja']){
 const stem=`${family}-preset-${preset}-${script}-4x5-2x`;
 try{
  const data=JSON.parse(await fs.readFile(path.join(out,'exports',stem+'.json'),'utf8'));
  const issues=[];
  if(!data.optical.font.startsWith('"Cormorant Garamond Variable"'))issues.push('Master display changed to a sans face');
  if(data.fonts!=='loaded'||data.assetOpticalSnapshots[0]?.ready!=='true'||data.images.some(image=>!image.loaded))issues.push('assets');
  for(const field of data.fields.filter(field=>['primary','secondary'].includes(field.priority)&&field.width>0))if(!field.inside||!field.inkInside)issues.push(`bounds:${field.field}`);
  const name=data.fields.find(field=>field.field==='name'),job=data.fields.find(field=>field.field==='job');
  if(overlap(name,job))issues.push('name/job collision');
  const metadata=await sharp(path.join(out,'exports',stem+'.png')).metadata();
  if(metadata.width!==data.size.width||metadata.height!==data.size.height||data.size.scale!==2)issues.push('2x dimensions');
  presetRecords.push({stem,family,preset,script,optical:data.optical,issues});failures.push(...issues.map(issue=>`${stem}: ${issue}`));
 }catch(error){failures.push(`${stem}: ${error.message}`);}
}
const report={phase:'2.7.8',baseCases:45,stressCases:90,sameNameLocaleCases:6,webpCases:3,presetCases:45,totalExports:189,verifiedMatrix:records.length,verifiedPresets:presetRecords.length,protectedFiles:protectedFiles.length,failures,records,presetRecords};
await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({verified:records.length,presets:presetRecords.length,failures,protectedFiles:protectedFiles.length},null,2));
if(failures.length)process.exitCode=1;

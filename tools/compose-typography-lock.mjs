import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/typography-lock');
const families=['cinematic','editorial','id-card'];
const label=(text,width,height=40)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="12" y="26" fill="#dedbd5" font-family="sans-serif" font-size="16">${text}</text></svg>`);
async function board(file,cells,columns,cellWidth,cellHeight,title){
 const rows=Math.ceil(cells.length/columns),width=columns*(cellWidth+20)+20,height=rows*(cellHeight+55)+70;
 const layers=[{input:label(title,width),left:10,top:10}];
 for(let index=0;index<cells.length;index++){
  const cell=cells[index],left=20+(index%columns)*(cellWidth+20),top=65+Math.floor(index/columns)*(cellHeight+55);
  layers.push({input:label(cell.label,cellWidth),left,top});
  layers.push({input:await sharp(path.join(out,'exports',cell.stem+'.png')).resize(cellWidth,cellHeight,{fit:'contain',background:'#171a1d'}).png().toBuffer(),left,top:top+40});
 }
 await sharp({create:{width,height,channels:3,background:'#171a1d'}}).composite(layers).png().toFile(path.join(out,file));
}
for(let i=0;i<families.length;i++)await board(`0${i+1}-${i===2?'identity':families[i]}-ko-en-ja.png`,['locale-ko','latin','locale-ja'].map((name,index)=>({stem:`${families[i]}-${name}-4x5-2x`,label:`${families[i].toUpperCase()} / ${['KO','EN','JA'][index]} / Coner`})),3,540,675,'SAME PROFILE / SAME NAME / SAME 4:5 / ONLY LOCALE CHANGES');
await board('04-short-long-names.png',families.flatMap(family=>['latin','latin-long','ko','ko-long','ja','kanji'].map(name=>({stem:`${family}-${name}-4x5-2x`,label:`${family} / ${name}`}))),6,360,450,'SHORT / LONG / KANA / KANJI / MEASURED VISUAL ENVELOPE');
await board('05-mixed-script.png',families.flatMap(family=>['mixed-ko','mixed-han','mixed-ja'].map(name=>({stem:`${family}-${name}-4x5-2x`,label:`${family} / ${name}`}))),3,480,600,'MIXED SCRIPT / COMPLETE REGISTERED SERIF STACK');
await board('06-ratio-matrix.png',families.flatMap(family=>['latin','ko','ja'].flatMap(name=>['1x1','4x5','3x4','9x16','16x9'].map(ratio=>({stem:`${family}-${name}-${ratio}-2x`,label:`${family} / ${name} / ${ratio}`})))),5,320,425,'45 BASIC COMBINATIONS / ACTUAL 2x EXPORTS');
await board('07-final-master-triptych.png',families.map(family=>({stem:`${family}-latin-4x5-2x`,label:family.toUpperCase()})),3,600,750,'C2 / E2 / I3 / MASTER CARD VISUAL DESIGN FROZEN');
console.log('Wrote seven typography comparison boards from actual exports.');

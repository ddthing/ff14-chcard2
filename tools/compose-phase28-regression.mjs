import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/phase28');
const labels=text=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="660" height="44"><text x="12" y="27" fill="#dedbd5" font-family="sans-serif" font-size="16">${text}</text></svg>`);
const layers=[];
for(const [column,family] of ['cinematic','editorial','id-card'].entries())for(const [row,locale] of ['latin','ko','ja'].entries()){
 const left=20+column*680,top=20+row*470;
 layers.push({input:labels(`${family} / ${locale} / FROZEN 2.7.8 → PHASE 2.8`),left,top});
 for(const [offset,file] of [[0,path.join(root,'docs/qa/typography-lock/exports',`${family}-${locale}-4x5-2x.png`)],[330,path.join(out,`qa-lab-${family}-${locale}-4x5-2x.png`)]])layers.push({input:await sharp(file).resize(320,400).png().toBuffer(),left:left+offset,top:top+44});
}
await sharp({create:{width:2060,height:1430,channels:3,background:'#171a1d'}}).composite(layers).png().toFile(path.join(out,'08-regression-master.png'));
console.log('Wrote actual before/after 9-case Master comparison.');

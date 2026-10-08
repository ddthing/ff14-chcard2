import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const base='docs/qa/phase301-card-type-job/';
for (const master of ['cinematic','editorial','id-card']) {
  const sets=master==='id-card'?['s1','s2','s3','s4','n1','n2']:['s1','s2','s3','s4'];
  const names=['korean-ko','katakana-ja','mixed-korean'];
  const parts=[];
  for (let r=0;r<sets.length;r++) for(let c=0;c<names.length;c++) {
    const id=`stage1-${sets[r]}-${master}-${names[c]}`;
    const label=Buffer.from(`<svg width="360" height="32"><rect width="100%" height="100%" fill="#20231f"/><text x="12" y="23" font-size="17" font-family="Arial" fill="#eee5d0">${sets[r].toUpperCase()} · ${names[c]}</text></svg>`);
    parts.push({input:await sharp(label).png().toBuffer(),left:c*370,top:r*490});
    parts.push({input:await sharp(base+'raw/'+id+'.png').resize(360,450).png().toBuffer(),left:c*370,top:r*490+32});
  }
  await writeFile(base+`quicklook-${master}.png`,await sharp({create:{width:1100,height:sets.length*490,channels:4,background:'#131613'}}).composite(parts).png().toBuffer());
}

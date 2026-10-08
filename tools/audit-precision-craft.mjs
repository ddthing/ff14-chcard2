import sharp from 'sharp';
import fs from 'node:fs/promises';
const out='docs/qa/precision-craft';
await fs.mkdir(out,{recursive:true});
const areas=[
 {id:'editorial-edge',family:'editorial',x:1200,y:60,w:150,h:200},
 {id:'editorial-name',family:'editorial',x:1210,y:320,w:300,h:140},
 {id:'editorial-rdm',family:'editorial',x:1240,y:2100,w:260,h:170},
 {id:'cinematic-corner',family:'cinematic',x:35,y:35,w:180,h:180},
 {id:'identity-glyph',family:'id-card',x:110,y:1990,w:200,h:140},
];
for(const area of areas){
 const source=`docs/qa/coner-art-direction/exports/${area.family}-en-4x5-2x.png`;
 const crop=await sharp(source).extract({left:area.x,top:area.y,width:area.w,height:area.h}).png().toBuffer();
 for(const scale of [1,2,4])await sharp(crop).resize(area.w*scale,area.h*scale,{kernel:'nearest'}).png().toFile(`${out}/before-${area.id}-${scale*100}.png`);
}
console.log('Native, 200% and 400% crops written; nearest-neighbour review enlargement.');

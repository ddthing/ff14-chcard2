import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
const rows=[
 ['Cinematic','docs/qa/real-samples/02-cinematic-coner.png','C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_49-1.png'],
 ['Editorial','docs/qa/real-samples/03-editorial-coner.png','C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_50-2.png'],
 ['Identity','docs/qa/real-samples/04-identity-coner.png','C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_51-3.png'],
];
const items=[];
for(const [row,[family,before,concept]] of rows.entries()){
 const title=Buffer.from(`<svg width="1040" height="48"><rect width="100%" height="100%" fill="#171a1c"/><text x="16" y="30" font-family="Arial" fill="#ede6d8" font-size="18">${family} / CURRENT 2.7.4 (left) / CONCEPT (right)</text></svg>`);
 items.push({input:title,left:0,top:row*696});
 for(const [col,path] of [before,concept].entries())items.push({input:await sharp(path).resize({width:500,height:625,fit:'contain',background:'#171a1c'}).toBuffer(),left:16+col*516,top:row*696+56});
}
await sharp({create:{width:1048,height:2088,channels:3,background:'#171a1c'}}).composite(items).png().toFile('docs/qa/coner-art-direction/00-current-vs-concepts.png');
await writeFile('docs/qa/coner-art-direction/design-audit.md',`# Before implementation: comparison and direction\n\nThe retained Phase 2.7.4 actual exports are compared against the three supplied concepts in 00-current-vs-concepts.png. These are reference images, never runtime portraits.\n\n- Cinematic: current name/photo pairing is clean, but border craft, typographic counterpoints, service/DC/FC storytelling and physical print rhythm are sparse. Add a bespoke interrupted brass frame, authored corners, restrained real metadata, a stronger name/bio relationship; keep the photo first.\n- Editorial: current diagonal and slanted abbreviation are recognizable, but most facts sit in an ordinary footer and the name reads as a title. Develop a cover-scale initial, multiple paper/photo/ink layers, an asymmetrical printed information block, and one limited authored scribble. The red costume is the visual anchor; do not modify its pixels.\n- Identity: current white stock and repeated facts feel like a profile panel. Build a strong name/job/level hero block, a neutral custom pictogram vocabulary, grouped archival information, brass corner rules and a framed portrait.\n\nCredit has no dedicated bar. It is overprinted with a thin glyph outline. Other text has no shadow; contrast comes from ink, paper, photograph placement and local photographic support. All current data, fonts, editor controls, draft behavior and source image bytes are protected.\n`);

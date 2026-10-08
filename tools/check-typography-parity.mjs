import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const out=path.resolve(import.meta.dirname,'../docs/qa/typography-lock');
const captures=JSON.parse(await fs.readFile(path.join(out,'preview-captures.json'),'utf8'));
const records=[];
for(const capture of captures){
 const sidecar=JSON.parse(await fs.readFile(path.join(out,'exports',`${capture.stem}-2x.json`),'utf8'));
 const {rect}=capture;
 const screenshot=path.join(out,`preview-${capture.stem}.png`);
 const metadata=await sharp(screenshot).metadata();
 // Browser screenshot delivery can rescale the emulated viewport raster.
 const screenshotScale=metadata.width/capture.viewportWidth;
 const width=Math.round(rect.width*screenshotScale),height=Math.round(rect.height*screenshotScale);
 const preview=await sharp(screenshot).extract({left:Math.round(rect.x*screenshotScale),top:Math.round(rect.y*screenshotScale),width,height}).removeAlpha().png().toBuffer();
 await fs.writeFile(path.join(out,`preview-card-${capture.stem}.png`),preview);
 const a=await sharp(preview).raw().toBuffer();
 const b=await sharp(path.join(out,'exports',`${capture.stem}-2x.png`)).resize(width,height).removeAlpha().raw().toBuffer();
 let diff=0;for(let index=0;index<a.length;index++)diff+=Math.abs(a[index]-b[index]);
 const geometryMatches=rect.width===sidecar.logical.width&&rect.height===sidecar.logical.height;
 const typographyMatches=capture.opticalReady==='true'&&capture.opticalSize===sidecar.optical.opticalSize;
 const meanAbsoluteRgbDifference=Number((diff/a.length).toFixed(3));
 records.push({stem:capture.stem,screenshotScale,geometryMatches,typographyMatches,fontsLoaded:capture.fonts==='loaded',meanAbsoluteRgbDifference});
}
// Delivery resampling and subpixel antialiasing preclude byte equality.
// Keep geometry/type readiness exact and allow at most 8/255 mean RGB noise.
const failures=records.filter(record=>!record.geometryMatches||!record.typographyMatches||!record.fontsLoaded||record.meanAbsoluteRgbDifference>8);
await fs.writeFile(path.join(out,'preview-parity.json'),JSON.stringify({records,failures},null,2));
console.log(JSON.stringify({records,failures},null,2));if(failures.length)process.exitCode=1;

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { extractPaletteFromImageData } from '../src/lib/palette.ts';
const result = {};
for (const role of ['landscape','portrait']) {
  const source = `public/assets/samples/coner/original/${role}.png`;
  const width = role === 'landscape' ? 72 : 41;
  const height = role === 'landscape' ? 41 : 72;
  const pixels = await sharp(source).resize(width,height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
  result[role] = { source, sampleWidth:width, sampleHeight:height, palette:extractPaletteFromImageData({data:new Uint8ClampedArray(pixels),width,height}) };
}
await writeFile('docs/qa/real-samples/palette-node-check.json',JSON.stringify(result,null,2)+'\n');
console.log(result);


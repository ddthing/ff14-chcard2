import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { connectPhase303, evaluate, setViewportAndMedia } from './phase303-qa-cdp.mjs';
const { client } = await connectPhase303(9329);
const results = [];
try {
  for (const [width, height] of [[661, 802], [390, 844]]) {
    await setViewportAndMedia(client, { width, height, deviceScaleFactor: 1 });
    await client.send('Page.navigate', { url: pathToFileURL(path.resolve('docs/qa/phase303-job-lock/comparison.html')).href });
    await client.send('Page.bringToFront');
    await new Promise(r => setTimeout(r, 350));
    await evaluate(client, "Promise.all(Array.from(document.images).filter(x=>x.closest('.stage')).map(x=>x.decode()))");
    const result = await evaluate(client, "(()=>{const img=document.querySelector('.stage img');const r=img.getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,imageLoaded:img.complete&&img.naturalWidth>0,image:{width:r.width,height:r.height,naturalWidth:img.naturalWidth},caseCount:document.querySelector('#case').options.length,boardLinks:document.querySelectorAll('.boardGallery a').length}})()");
    result.pass = result.scrollWidth <= result.clientWidth && result.imageLoaded && result.image.width >= width - 65;
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`docs/qa/phase303-job-lock/viewer-${width}.png`, Buffer.from(screenshot.data, 'base64'));
    results.push(result);
  }
  await writeFile('docs/qa/phase303-job-lock/viewer-responsive-qa.json', JSON.stringify({ results, pass: results.every(x => x.pass) }, null, 2));
  console.log(JSON.stringify(results));
  if (results.some(x => !x.pass)) process.exitCode = 1;
} finally { client.close(); }

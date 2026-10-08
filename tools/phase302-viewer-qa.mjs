import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { connectLab, evaluate, setViewportAndMedia, navigateAndAssert } from './phase302-qa-cdp.mjs';
const root='docs/qa/phase302-jobmark-correction/';
const { client }=await connectLab(9328);
const results=[];
try{
  for(const viewport of [{width:661,height:802,deviceScaleFactor:1},{width:390,height:844,deviceScaleFactor:1}]){
    await setViewportAndMedia(client,{...viewport,mobile:false,colorScheme:'dark',reducedMotion:'no-preference'});
    await navigateAndAssert(client,pathToFileURL(path.resolve(root+'comparison.html')).href,viewport);
    await evaluate(client,"Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))");
    const result=await evaluate(client,"(()=>({width:innerWidth,clientWidth:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector('main')).gridTemplateColumns,images:[...document.images].map(i=>({width:i.getBoundingClientRect().width,naturalWidth:i.naturalWidth,loaded:i.complete&&i.naturalWidth===1080})),figureCount:document.querySelectorAll('figure').length}))()");
    result.pass=result.documentWidth<=result.clientWidth&&result.figureCount===3&&result.images.every(x=>x.loaded&&x.width<=result.clientWidth&&x.width>=result.clientWidth-40);
    results.push(result);
    if(viewport.width===661){const screenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(root+'viewer-661.png',Buffer.from(screenshot.data,'base64'));}
  }
  await writeFile(root+'viewer-responsive-qa.json',JSON.stringify({results},null,2));
  console.log(JSON.stringify({cases:results.length,pass:results.every(x=>x.pass),results}));
  if(results.some(x=>!x.pass))process.exitCode=1;
}finally{client.close();}

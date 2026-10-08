import { mkdir, writeFile } from 'node:fs/promises';
const pages = await (await fetch('http://127.0.0.1:9329/json/list')).json();
const ws = new WebSocket(pages.find(x => x.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const data = JSON.parse(e.data); const p = pending.get(data.id); if (p) { pending.delete(data.id); if(data.error) p.reject(new Error(JSON.stringify(data.error))); else p.resolve(data.result); } };
function send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:3334/phase303-qa' }); await send('Page.bringToFront');
  for (let n = 0; n < 150; n++) { if (await evaluate('Boolean(window.__PHASE303_QA__?.ready)')) break; await new Promise(r => setTimeout(r, 100)); }
  await mkdir('docs/qa/phase303-job-lock/pilot', { recursive: true });
  for (const master of ['cinematic', 'editorial', 'id-card']) {
    const input = { caseId: `pilot-${master}`, master, jobId: 'red-mage', ratio: '4:5', locale: 'en', characterName: 'Coner' };
    const ready = await evaluate(`window.__PHASE303_QA__.apply(${JSON.stringify(input)})`);
    const rect = await evaluate("(()=>{const r=document.querySelector('article[data-master-id]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...rect, scale: 2.5 } });
    await writeFile(`docs/qa/phase303-job-lock/pilot/${master}.png`, Buffer.from(screenshot.data, 'base64'));
    await writeFile(`docs/qa/phase303-job-lock/pilot/${master}.json`, JSON.stringify(ready, null, 2));
    console.log(`${master} captured ${rect.width}x${rect.height}`);
  }
} finally { ws.close(); }

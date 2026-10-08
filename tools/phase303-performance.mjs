import { writeFile, readFile } from 'node:fs/promises';
const arg = (key, fallback) => process.argv.find(x => x.startsWith(`--${key}=`))?.split('=').slice(1).join('=') ?? fallback;
const stage = arg('stage', 'baseline');
const url = arg('url', 'http://127.0.0.1:3333/phase303-qa');
const port = arg('port', '9329');
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find(x => x.type === 'page');
if (!page) throw new Error('No QA Chrome page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map();
ws.onmessage = event => { const data = JSON.parse(event.data); const p = pending.get(data.id); if (p) { pending.delete(data.id); clearTimeout(p.timer); if(data.error) p.reject(new Error(JSON.stringify(data.error))); else p.resolve(data.result); } };
function send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout ${method}`)); }, 120000); pending.set(key, { resolve, reject, timer }); ws.send(JSON.stringify({ id: key, method, params })); }); }
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url }); await send('Page.bringToFront');
  for (let n = 0; n < 150; n++) { if (await evaluate('Boolean(window.__PHASE303_QA__?.ready)')) break; await new Promise(r => setTimeout(r, 100)); if (n === 149) throw new Error('QA API unavailable'); }
  const environment = await evaluate('({visibility:document.visibilityState,focus:document.hasFocus(),width:innerWidth,height:innerHeight,userAgent:navigator.userAgent})');
  if (environment.visibility !== 'visible' || !environment.focus) throw new Error('Performance page must be visible/focused');
  const samples = [];
  for (let round = 0; round < 6; round++) {
    for (const master of ['cinematic', 'editorial', 'id-card']) {
      const input = { caseId: `perf-${stage}-${master}-${round}`, master, jobId: 'red-mage', ratio: '4:5', locale: 'en', characterName: 'Coner' };
      const result = await evaluate(`(async()=>{const ready=await window.__PHASE303_QA__.apply(${JSON.stringify(input)});const rendered=await window.__PHASE303_QA__.render({format:'png',scale:2});window.__PHASE303_QA__.releaseBlob(rendered.blobId);return {ready,rendered};})()`);
      samples.push({ round, master, warmup: round === 0, ...result });
      console.log(`${stage} ${round} ${master} ${Math.round(result.rendered.rasterWallMs)}ms`);
    }
  }
  const resources = await evaluate("performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/ffxiv/jobs/')).map(x=>({url:new URL(x.name).pathname,transferSize:x.transferSize,decodedBodySize:x.decodedBodySize}))");
  const summary = Object.fromEntries(['cinematic', 'editorial', 'id-card'].map(master => { const rows = samples.filter(x => x.master === master && !x.warmup); return [master, { png2xMedianMs: median(rows.map(x => x.rendered.rasterWallMs)), previewMedianMs: median(rows.map(x => x.ready.readiness.previewReadyMs)), sampleCount: rows.length }]; }));
  const report = { recordedAt: new Date().toISOString(), stage, url, environment, protocol: 'Same isolated production route, 1 warm-up and 5 warm samples per family, alternating family each sample; production font loader/export renderer unchanged.', resources, summary, samples };
  if (stage.startsWith('final')) {
    const baseline = JSON.parse(await readFile('docs/qa/phase303-job-lock/performance-baseline.json', 'utf8'));
    report.comparison = Object.fromEntries(Object.entries(summary).map(([family, current]) => [family, { png2xChangePercent: (current.png2xMedianMs / baseline.summary[family].png2xMedianMs - 1) * 100, previewChangePercent: (current.previewMedianMs / baseline.summary[family].previewMedianMs - 1) * 100 }]));
    const baseUrls = new Set(baseline.resources.map(x => x.url));
    report.newJobAssetUrls = [...new Set(resources.map(x => x.url))].filter(x => !baseUrls.has(x));
  }
  await writeFile(`docs/qa/phase303-job-lock/performance-${stage}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary, comparison: report.comparison, newJobAssetUrls: report.newJobAssetUrls }));
} finally { ws.close(); }

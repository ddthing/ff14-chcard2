import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "qa", "phase300", "home-scroll-cadence.json");
const baseUrl = (process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=").slice(1).join("=") ?? "http://localhost:3318").replace(/\/$/, "");
const debugPort = Number(process.argv.find((arg) => arg.startsWith("--debug-port="))?.split("=")[1] ?? 9322);
const viewport = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };

function clientFor(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result ?? {});
    } else if (message.method && listeners.has(message.method)) {
      for (const listener of [...listeners.get(message.method)]) listener(message.params ?? {});
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    ready,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("Timed out: " + method)); }, 30000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitEvent(method) {
      return new Promise((resolve, reject) => {
        const set = listeners.get(method) ?? new Set();
        const listener = (params) => { set.delete(listener); resolve(params); };
        set.add(listener);
        listeners.set(method, set);
        setTimeout(() => { set.delete(listener); reject(new Error("Timed out waiting for " + method)); }, 30000);
      });
    },
    close() { socket.close(); },
  };
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}

async function load(client, url) {
  const loaded = client.waitEvent("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
}

const versionResponse = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
if (!versionResponse.ok) throw new Error(`Chrome CDP not ready on ${debugPort}`);
const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`);
const target = await targetResponse.json();
const client = clientFor(target.webSocketDebuggerUrl);
await client.ready;
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Emulation.setDeviceMetricsOverride", viewport);
await load(client, baseUrl + "/");
await evaluate(client, "localStorage.setItem('ff14-adventurer-card:appearance','dark'); localStorage.setItem('ff14-adventurer-card:locale','ko'); true");
await load(client, baseUrl + "/?phase300-scroll-cadence=" + Date.now());
await evaluate(client, "new Promise((resolve) => (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(resolve, 1500)))");
await evaluate(client, [
  "window.__phase300ScrollStorySeen = false;",
  "window.__phase300MountChanges = [];",
  "window.__phase300ScrollListener = () => { const story=document.querySelector('[data-scroll-story]'); const r=story?.getBoundingClientRect(); if(r && r.top<innerHeight && r.bottom>0) window.__phase300ScrollStorySeen=true; };",
  "window.addEventListener('scroll', window.__phase300ScrollListener, { passive:true });",
  "new MutationObserver((records) => { for (const record of records) if (record.target.matches?.('[data-marketing-card]')) { const r=record.target.getBoundingClientRect(); window.__phase300MountChanges.push({ template:record.target.getAttribute('data-marketing-card'), mounted:record.target.getAttribute('data-mounted'), scrollY, top:Math.round(r.top), bottom:Math.round(r.bottom) }); } }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-mounted']});",
  "window.__phase300ScrollFrames = { active:true, intervals:[], previous:null };",
  "const tick = (now) => { const state=window.__phase300ScrollFrames; if(!state.active) return; if(state.previous!==null) state.intervals.push(now-state.previous); state.previous=now; requestAnimationFrame(tick); }; requestAnimationFrame(tick);",
  "true",
].join("\n"));
const initial = await evaluate(client, "(() => ({ y:scrollY, max:document.documentElement.scrollHeight-innerHeight, height:document.documentElement.scrollHeight, cards:[...document.querySelectorAll('[data-marketing-card]')].map((e)=>({template:e.getAttribute('data-marketing-card'),mounted:e.getAttribute('data-mounted'),top:Math.round(e.getBoundingClientRect().top),bottom:Math.round(e.getBoundingClientRect().bottom)})) }))()");
const steps = Math.min(30, Math.ceil(initial.max / 680) + 2);
for (let index = 0; index < steps; index += 1) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 650, deltaY: 680, deltaX: 0 });
  await new Promise((resolve) => setTimeout(resolve, 140));
}
await new Promise((resolve) => setTimeout(resolve, 300));
const bottom = await evaluate(client, "(() => ({ y:scrollY,max:document.documentElement.scrollHeight-innerHeight,height:document.documentElement.scrollHeight,cards:[...document.querySelectorAll('[data-marketing-card]')].map((e)=>({template:e.getAttribute('data-marketing-card'),mounted:e.getAttribute('data-mounted'),top:Math.round(e.getBoundingClientRect().top),bottom:Math.round(e.getBoundingClientRect().bottom)})) }))()");
const reachedBottom = bottom.y >= bottom.max - 4;
for (let index = 0; index < steps; index += 1) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 250, deltaY: -680, deltaX: 0 });
  await new Promise((resolve) => setTimeout(resolve, 140));
}
await new Promise((resolve) => setTimeout(resolve, 300));
const afterUp = await evaluate(client, "(() => ({ y:scrollY,max:document.documentElement.scrollHeight-innerHeight,height:document.documentElement.scrollHeight,cards:[...document.querySelectorAll('[data-marketing-card]')].map((e)=>({template:e.getAttribute('data-marketing-card'),mounted:e.getAttribute('data-mounted'),top:Math.round(e.getBoundingClientRect().top),bottom:Math.round(e.getBoundingClientRect().bottom)})) }))()");
const intervals = await evaluate(client, "window.__phase300ScrollFrames.active=false; window.removeEventListener('scroll',window.__phase300ScrollListener); window.__phase300ScrollFrames.intervals");
const transitions = await evaluate(client, "window.__phase300MountChanges");
const storySeen = await evaluate(client, "window.__phase300ScrollStorySeen");
const sorted = intervals.filter(Number.isFinite).sort((a,b)=>a-b);
const quantile = (p) => { if (!sorted.length) return null; const pos=(sorted.length-1)*p, lo=Math.floor(pos), hi=Math.ceil(pos); return Math.round((sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo))*100)/100; };
const report = {
  capturedAt: new Date().toISOString(), baseUrl, browser: (await versionResponse.json()).Browser,
  viewport, protocol: "Dark KO Home, settled 1500 ms after fonts, 680 CSS px wheel increments with 140 ms between inputs; full down then up. requestAnimationFrame intervals sampled continuously during both directions.",
  initial, bottom, afterUp,
  reachedBottom, returnedToTop: afterUp.y <= 4, storyObservedDuringDown: storySeen,
  mountTransitions: transitions,
  frameIntervals: { samples: intervals.length, p50Ms: quantile(0.5), p95Ms: quantile(0.95), over16_7ms: intervals.filter((value)=>value>16.7).length, over50ms: intervals.filter((value)=>value>50).length, limitation: "requestAnimationFrame intervals are a cadence proxy, not compositor/GPU presentation timing or an FPS guarantee." },
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: path.relative(root, output), reachedBottom, returnedToTop: report.returnedToTop, storyObservedDuringDown: storySeen, frameIntervals: report.frameIntervals, transitionCount: transitions.length, unmountedVisibleHostsAtEnd: afterUp.cards.filter((card)=>card.top<viewport.height&&card.bottom>0&&card.mounted!=="true").map((card)=>card.template) }, null, 2));
client.close();

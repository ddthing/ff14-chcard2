import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "qa", "phase300", "identity-world-observer-trace.json");
const baseUrl = (process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=").slice(1).join("=") ?? "http://localhost:3318").replace(/\/$/, "");
const debugPort = Number(process.argv.find((arg) => arg.startsWith("--debug-port="))?.split("=")[1] ?? 9322);

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
        const timer = setTimeout(() => { set.delete(listener); reject(new Error("Timed out waiting for " + method)); }, 30000);
        const listener = (params) => { set.delete(listener); clearTimeout(timer); resolve(params); };
        set.add(listener);
        listeners.set(method, set);
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

async function navigate(client, url) {
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(result.errorText);
  await loaded;
  await client.send("Page.bringToFront");
}

const versionResponse = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
if (!versionResponse.ok) throw new Error(`Chrome CDP not ready on ${debugPort}`);
const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
if (!targetResponse.ok) throw new Error(`Could not create Chrome target: ${targetResponse.status}`);
const target = await targetResponse.json();
const client = clientFor(target.webSocketDebuggerUrl);
await client.ready;
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await client.send("Page.bringToFront");
await client.send("Page.addScriptToEvaluateOnNewDocument", { source: [
  "(() => {",
  "const NativeObserver=window.IntersectionObserver;",
  "window.__phase300AppIO={registrations:[],callbacks:[]};",
  "window.IntersectionObserver=class TracedIntersectionObserver extends NativeObserver {",
  "constructor(callback,options){const observerId=window.__phase300AppIO.registrations.length+1;const normalized={rootMargin:options?.rootMargin??'0px',threshold:options?.threshold??0,hasRoot:!!options?.root};window.__phase300AppIO.registrations.push({observerId,...normalized});super((entries,observer)=>{window.__phase300AppIO.callbacks.push({observerId,time:performance.now(),scrollY,entries:entries.map((entry)=>{const r=entry.boundingClientRect,i=entry.intersectionRect,b=entry.rootBounds;return {template:entry.target.getAttribute('data-marketing-card'),mounted:entry.target.getAttribute('data-mounted'),connected:entry.target.isConnected,isIntersecting:entry.isIntersecting,intersectionRatio:entry.intersectionRatio,boundingClientRect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},rootBounds:b?{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}:null,intersectionRect:{left:i.left,right:i.right,top:i.top,bottom:i.bottom,width:i.width,height:i.height}}})});callback(entries,observer);},options);this.__phase300ObserverId=observerId;}",
  "observe(target){window.__phase300AppIO.registrations[this.__phase300ObserverId-1].target={template:target.getAttribute?.('data-marketing-card'),tag:target.tagName,connected:target.isConnected};return super.observe(target);}",
  "};",
  "})();",
].join("\n") });
await navigate(client, baseUrl + "/");
await evaluate(client, "localStorage.setItem('ff14-adventurer-card:appearance','dark');localStorage.setItem('ff14-adventurer-card:locale','ko');true");
await navigate(client, baseUrl + "/?phase300-observer-trace=" + Date.now());
await evaluate(client, "new Promise((resolve)=>(document.fonts?.ready??Promise.resolve()).then(()=>setTimeout(resolve,1200)))");
const initial = await evaluate(client, "({visibility:document.visibilityState,focused:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight,scrollY},identity:(()=>{const e=document.querySelector('section[aria-labelledby=worlds-title] [data-marketing-card=id-card]');if(!e)return null;const r=e.getBoundingClientRect();return{mounted:e.getAttribute('data-mounted'),left:r.left,right:r.right,top:r.top,bottom:r.bottom}})(),registrations:window.__phase300AppIO?.registrations??[],callbacks:window.__phase300AppIO?.callbacks??[]})");
const states = [];
for (const [template, selector] of [
  ["cinematic", "section[aria-labelledby=worlds-title] article:has([data-marketing-card=cinematic])"],
  ["editorial", "section[aria-labelledby=worlds-title] article:has([data-marketing-card=editorial])"],
  ["id-card", "section[aria-labelledby=worlds-title] article:has([data-marketing-card=id-card])"],
]) {
  const state = await evaluate(client, "(async()=>{const selector=" + JSON.stringify(selector) + ";const article=document.querySelector(selector);const host=article?.querySelector('[data-marketing-card]');if(!article||!host)return{template:" + JSON.stringify(template) + ",error:'missing host'};article.scrollIntoView({behavior:'instant',block:'center'});await new Promise(r=>setTimeout(r,700));const h=host.getBoundingClientRect();return{template:" + JSON.stringify(template) + ",documentVisibility:document.visibilityState,focused:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight,scrollY},host:{mounted:host.getAttribute('data-mounted'),hasArticle:!!host.querySelector('article[data-template]'),rect:{left:h.left,right:h.right,top:h.top,bottom:h.bottom,width:h.width,height:h.height}},matchingCallbacks:window.__phase300AppIO.callbacks.filter(row=>row.entries.some(entry=>entry.template===" + JSON.stringify(template) + ")),observerRegistrations:window.__phase300AppIO.registrations.filter(row=>row.target?.template===" + JSON.stringify(template) + ")}})()");
  states.push(state);
}
const logs = await evaluate(client, "window.__phase300AppIO");
const report = { capturedAt: new Date().toISOString(), browser: (await versionResponse.json()).Browser, baseUrl, target: { id: target.id, url: target.url }, initial, states, observerLogs: logs, interpretation: "This script wraps native IntersectionObserver on a fresh Home page and forwards the original entries unchanged. Use its callbacks and per-target mount state to distinguish missing delivery from state/render behavior." };
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: path.relative(root, output), initial: { visibility: initial.visibility, focused: initial.focused, viewport: initial.viewport }, states: states.map((row) => ({ template: row.template, host: row.host, registrations: row.observerRegistrations, callbacks: row.matchingCallbacks })) }, null, 2));
client.close();

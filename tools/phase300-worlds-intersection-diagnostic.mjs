import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "qa", "phase300", "identity-world-intersection.json");
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

const versionResponse = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
if (!versionResponse.ok) throw new Error(`Chrome CDP not ready on ${debugPort}`);
const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
if (!targetResponse.ok) throw new Error(`Could not enumerate browser targets: ${targetResponse.status}`);
const pages = (await targetResponse.json()).filter((item) => item.type === "page" && item.url.startsWith(baseUrl));
if (!pages.length) throw new Error("No already-loaded application target exists; wait for the production server before retrying.");
const targetId = process.argv.find((arg) => arg.startsWith("--target-id="))?.split("=").slice(1).join("=");
if (process.argv.includes("--list-targets")) {
  const summaries = [];
  for (const page of pages) {
    const inspect = clientFor(page.webSocketDebuggerUrl);
    try {
      await inspect.ready;
      await inspect.send("Runtime.enable");
      const state = await evaluate(inspect, "(() => {const host=document.querySelector('section[aria-labelledby=worlds-title] [data-marketing-card=id-card]');const r=host?.getBoundingClientRect();return {visibility:document.visibilityState,focused:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight,scrollY},host:host?{mounted:host.getAttribute('data-mounted'),rect:r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null}:null}})()");
      summaries.push({ id: page.id, url: page.url, title: page.title, state });
    } finally { inspect.close(); }
  }
  console.log(JSON.stringify(summaries, null, 2));
  process.exit(0);
}
const target = targetId ? pages.find((page) => page.id === targetId) : pages.at(-1);
if (!target) throw new Error("Requested target id not found among loaded app targets.");
const client = clientFor(target.webSocketDebuggerUrl);
await client.ready;
await client.send("Page.enable");
await client.send("Runtime.enable");
const beforeActivation = await evaluate(client, "(() => {const host=document.querySelector('section[aria-labelledby=worlds-title] [data-marketing-card=id-card]');const r=host?.getBoundingClientRect();return {documentVisibility:document.visibilityState,hasFocus:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight,scrollY},host:host?{mounted:host.getAttribute('data-mounted'),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}:null}})()");
await client.send("Page.bringToFront");
await evaluate(client, "new Promise((resolve) => (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(resolve, 200)))");
const probe = await evaluate(client, [
  "(async () => {",
  "const selector='section[aria-labelledby=worlds-title] article:has([data-marketing-card=id-card])';",
  "const article=document.querySelector(selector); const host=article?.querySelector('[data-marketing-card=id-card]');",
  "if(!article||!host) return { error:'Identity article or LazyMaster host missing' };",
  "article.scrollIntoView({behavior:'instant',block:'center'});",
  "await new Promise((resolve)=>setTimeout(resolve,100));",
  "const observe=(rootMargin)=>new Promise((resolve)=>{ const entries=[]; const observer=new IntersectionObserver((batch)=>{ for(const e of batch) entries.push({ time:e.time, isIntersecting:e.isIntersecting, intersectionRatio:e.intersectionRatio, boundingClientRect:{x:e.boundingClientRect.x,y:e.boundingClientRect.y,left:e.boundingClientRect.left,right:e.boundingClientRect.right,top:e.boundingClientRect.top,bottom:e.boundingClientRect.bottom,width:e.boundingClientRect.width,height:e.boundingClientRect.height}, rootBounds:e.rootBounds?{x:e.rootBounds.x,y:e.rootBounds.y,left:e.rootBounds.left,right:e.rootBounds.right,top:e.rootBounds.top,bottom:e.rootBounds.bottom,width:e.rootBounds.width,height:e.rootBounds.height}:null, intersectionRect:{x:e.intersectionRect.x,y:e.intersectionRect.y,left:e.intersectionRect.left,right:e.intersectionRect.right,top:e.intersectionRect.top,bottom:e.intersectionRect.bottom,width:e.intersectionRect.width,height:e.intersectionRect.height} }); if(entries.length) { observer.disconnect(); resolve({rootMargin,entries}); } }); observer.observe(host); setTimeout(()=>{observer.disconnect();resolve({rootMargin,entries,timeout:true});},2500); });",
  "const [appMargin, viewportMargin]=await Promise.all([observe('360px'),observe('0px')]);",
  "const rect=(e)=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};",
  "const hostRect=rect(host); const ancestors=[]; let ancestor=host.parentElement; while(ancestor&&ancestors.length<10){const s=getComputedStyle(ancestor); const r=rect(ancestor); ancestors.push({tag:ancestor.tagName,id:ancestor.id,className:typeof ancestor.className==='string'?ancestor.className:null,rect:r,overflowX:s.overflowX,overflowY:s.overflowY,clipPath:s.clipPath,contain:s.contain,visibility:s.visibility,display:s.display,clipsX:/hidden|clip|scroll|auto/.test(s.overflowX),clipsY:/hidden|clip|scroll|auto/.test(s.overflowY)}); ancestor=ancestor.parentElement;} const viewportIntersection={left:Math.max(0,hostRect.left),right:Math.min(innerWidth,hostRect.right),top:Math.max(0,hostRect.top),bottom:Math.min(innerHeight,hostRect.bottom)}; viewportIntersection.width=Math.max(0,viewportIntersection.right-viewportIntersection.left); viewportIntersection.height=Math.max(0,viewportIntersection.bottom-viewportIntersection.top);",
  "return {url:location.href,documentLang:document.documentElement.lang,documentVisibility:document.visibilityState,hasFocus:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY},host:{template:host.getAttribute('data-marketing-card'),mounted:host.getAttribute('data-mounted'),rect:hostRect,visibility:getComputedStyle(host).visibility,display:getComputedStyle(host).display,opacity:getComputedStyle(host).opacity,hasArticle:!!host.querySelector('article[data-template]')},article:rect(article),viewportIntersection,appMarginObserver:appMargin,viewportObserver:viewportMargin,ancestors};",
  "})()",
].join("\n"));
const report = { capturedAt: new Date().toISOString(), browser: (await versionResponse.json()).Browser, baseUrl, inspectedTarget: { id: target.id, url: target.url, title: target.title }, beforeActivation, probe };
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: path.relative(root, output), host: probe.host, viewportIntersection: probe.viewportIntersection, appMarginObserver: probe.appMarginObserver, viewportObserver: probe.viewportObserver, ancestors: probe.ancestors }, null, 2));
client.close();

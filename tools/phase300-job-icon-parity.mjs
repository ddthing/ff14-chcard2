import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "qa", "phase300", "job-icon-build-parity.json");
const debugPort = Number(process.argv.find((arg) => arg.startsWith("--debug-port="))?.split("=")[1] ?? 9324);
const builds = [
  { stage: "before", baseUrl: "http://localhost:3317" },
  { stage: "after", baseUrl: (process.argv.find((arg) => arg.startsWith("--after-base-url="))?.split("=").slice(1).join("=") ?? "http://localhost:3318").replace(/\/$/, "") },
];

function clientFor(url) {
  const socket = new WebSocket(url);
  let id = 0;
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
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("CDP timeout: " + method)); }, 30000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    waitEvent(method) {
      return new Promise((resolve, reject) => {
        const set = listeners.get(method) ?? new Set();
        const timer = setTimeout(() => { set.delete(listener); reject(new Error("CDP event timeout: " + method)); }, 30000);
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
  await client.send("Page.bringToFront");
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(result.errorText);
  await loaded;
  await client.send("Page.bringToFront");
}

const versionResponse = await fetch("http://127.0.0.1:" + debugPort + "/json/version");
if (!versionResponse.ok) throw new Error("Chrome CDP unavailable at port " + debugPort);
const targetResponse = await fetch("http://127.0.0.1:" + debugPort + "/json/new?about:blank", { method: "PUT" });
if (!targetResponse.ok) throw new Error("Could not create QA page: " + targetResponse.status);
const target = await targetResponse.json();
const client = clientFor(target.webSocketDebuggerUrl);
await client.ready;
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });

const samples = [];
for (const build of builds) {
  await navigate(client, build.baseUrl + "/");
  await evaluate(client, "localStorage.setItem('ff14-adventurer-card:appearance','dark');localStorage.setItem('ff14-adventurer-card:locale','ko');true");
  await navigate(client, build.baseUrl + "/");
  await evaluate(client, "new Promise((resolve)=>(document.fonts?.ready??Promise.resolve()).then(()=>setTimeout(resolve,1300)))");
  const state = await evaluate(client, "(() => {const icons=[...document.querySelectorAll('[data-icon-source]')].map((el)=>{const image=el.querySelector('img');return{source:el.getAttribute('data-icon-source'),src:image?.currentSrc||image?.src||null,complete:image?.complete??null,naturalWidth:image?.naturalWidth??null,naturalHeight:image?.naturalHeight??null,maskImage:getComputedStyle(el).getPropertyValue('--job-icon-mask-image')||getComputedStyle(el.querySelector('.officialGlyph')||el).getPropertyValue('--job-icon-mask-image')||null,accessibleLabel:el.getAttribute('aria-label'),title:el.getAttribute('title')}});return{url:location.pathname,lang:document.documentElement.lang,theme:document.documentElement.getAttribute('data-app-theme'),visibility:document.visibilityState,hasFocus:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight},icons,officialIconCount:icons.filter((item)=>item.source&&item.source!=='fallback').length,loadedOfficialIconCount:icons.filter((item)=>item.source&&item.source!=='fallback'&&item.naturalWidth>0).length,officialSources:[...new Set(icons.filter((item)=>item.source&&item.source!=='fallback').map((item)=>item.source))],officialFiles:[...new Set(icons.filter((item)=>item.src?.includes('/assets/ffxiv/jobs/official/')).map((item)=>item.src))]}})()");
  if (state.visibility !== "visible" || !state.hasFocus || state.viewport.width !== 1440 || state.viewport.height !== 900) throw new Error("Job-icon verification page is hidden, unfocused, or at wrong viewport: " + JSON.stringify({ stage: build.stage, state }));
  const buildIdPath = build.stage === "before"
    ? path.join(root, "docs", "qa", "phase300", "baseline-build", ".next", "BUILD_ID")
    : path.join(root, ".next", "BUILD_ID");
  const buildId = await readFile(buildIdPath, "utf8").then((value) => value.trim()).catch(() => null);
  samples.push({ stage: build.stage, baseUrl: build.baseUrl, buildId, ...state });
}

const report = {
  schema: "phase300-job-icon-build-parity-v1",
  capturedAt: new Date().toISOString(),
  browser: (await versionResponse.json()).Browser,
  browserTargetId: target.id,
  buildFlag: "NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED=true was set on both build processes; the before server was also started with that process environment.",
  samples,
  pass: samples.length === 2 && samples.every((sample) => sample.visibility === "visible" && sample.hasFocus && sample.officialIconCount > 0 && sample.loadedOfficialIconCount > 0),
  limitation: "This probes actual rendered Home job-icon metadata and image decode in each local production build; it does not certify every job/ratio asset.",
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: "docs/qa/phase300/job-icon-build-parity.json", samples: samples.map(({ stage, buildId, officialIconCount, loadedOfficialIconCount, officialSources }) => ({ stage, buildId, officialIconCount, loadedOfficialIconCount, officialSources })), pass: report.pass }, null, 2));
client.close();
if (!report.pass) process.exitCode = 1;

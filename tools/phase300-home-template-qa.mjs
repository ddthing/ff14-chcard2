import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const outputRoot = qaRoot;
const motionRoot = path.join(outputRoot, "motion");
const baseUrl = readArg("--base-url", "http://localhost:3318").replace(/\/$/, "");
const debugPort = Number(readArg("--debug-port", "9322"));
const viewport = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
let activeClient;
process.on("unhandledRejection", (error) => {
  console.error(error);
  activeClient?.close();
  process.exitCode = 1;
});
await mkdir(motionRoot, { recursive: true });

function readArg(name, fallback) {
  const value = process.argv.find((arg) => arg.startsWith(name + "="));
  return value ? value.slice(name.length + 1) : fallback;
}

function quantile(values, percentile) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return Math.round(value * 100) / 100;
}

function clientFor(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error("CDP " + request.method + " failed: " + message.error.message + (message.error.data ? " (" + message.error.data + ")" : "")));
      else request.resolve(message.result ?? {});
    } else if (message.method && listeners.has(message.method)) {
      for (const listener of [...listeners.get(message.method)]) listener(message.params ?? {});
    }
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    ready: () => opened,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("CDP timed out: " + method));
        }, 30000);
        pending.set(id, { resolve, reject, timer, method });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitEvent(method, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        const set = listeners.get(method) ?? new Set();
        const listener = (params) => { set.delete(listener); clearTimeout(timer); resolve(params); };
        set.add(listener);
        listeners.set(method, set);
        const timer = setTimeout(() => { set.delete(listener); reject(new Error("CDP event timed out: " + method)); }, timeoutMs);
      });
    },
    close: () => socket.close(),
  };
}

async function evaluate(client, expression, awaitPromise = true) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}

async function navigate(client, url) {
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(result.errorText);
  await loaded;
  await evaluate(client, "new Promise((resolve) => (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  await client.send("Page.bringToFront");
  const foreground = await evaluate(client, "({ visibility:document.visibilityState, hasFocus:document.hasFocus(), width:innerWidth, height:innerHeight })");
  if (foreground.visibility !== "visible" || !foreground.hasFocus) throw new Error("Home QA target is not foreground after navigation: " + JSON.stringify({ url, foreground }));
  if (Math.abs(foreground.width - viewport.width) > 1 || Math.abs(foreground.height - viewport.height) > 1) throw new Error("Home QA viewport drifted from its declared desktop size: " + JSON.stringify({ url, expected: viewport, foreground }));
}

async function setState(client, theme = "dark", locale = "ko") {
  await client.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
  await evaluate(client, "localStorage.setItem(" + JSON.stringify("ff14-adventurer-card:appearance") + ", " +
    JSON.stringify(theme) + "); localStorage.setItem(" + JSON.stringify("ff14-adventurer-card:locale") + ", " +
    JSON.stringify(locale) + "); true");
}

async function settle(client, waitMs = 500) {
  await evaluate(client, [
    "(async () => {",
    "await (document.fonts?.ready ?? Promise.resolve());",
    "const images = [...document.images].filter((image) => { const r = image.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });",
    "await Promise.race([Promise.all(images.map((image) => image.decode ? image.decode().catch(() => {}) : Promise.resolve())), new Promise((resolve) => setTimeout(resolve, 3000))]);",
    "await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, " + waitMs + "))));",
    "return true;",
    "})()",
  ].join("\n"));
}

async function screenshotBytes(client, { clip, fullPage = false } = {}) {
  let finalClip = clip;
  if (fullPage) {
    const metrics = await client.send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize;
    finalClip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
  }
  if (finalClip && finalClip.scale === undefined) finalClip = { ...finalClip, scale: 1 };
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: Boolean(finalClip),
    ...(finalClip ? { clip: finalClip } : {}),
  });
  return Buffer.from(result.data, "base64");
}

async function saveViewport(client, fileName, options) {
  const bytes = await screenshotBytes(client, options);
  const filePath = path.join(outputRoot, fileName);
  await writeFile(filePath, bytes);
  return { file: fileName, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function selectorRect(client, selector, scroll = true) {
  const expression = "(() => { const element = document.querySelector(" + JSON.stringify(selector) + "); if (!element) return null; " +
    (scroll ? "element.scrollIntoView({ behavior: 'instant', block: 'center' }); " : "") +
    "const rect = element.getBoundingClientRect(); return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height }; })()";
  return evaluate(client, expression);
}

async function saveElement(client, selector, fileName, { scale = 1, waitMs = 500 } = {}) {
  const rect = await selectorRect(client, selector, true);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error("Element missing or empty: " + selector);
  await settle(client, waitMs);
  const bytes = await screenshotBytes(client, { clip: { ...rect, scale } });
  const filePath = path.join(outputRoot, fileName);
  await writeFile(filePath, bytes);
  return { file: fileName, selector, width: Math.round(rect.width * scale), height: Math.round(rect.height * scale), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function clickSelector(client, selector) {
  const rect = await evaluate(client, "(() => { const element=document.querySelector(" + JSON.stringify(selector) + "); if (!element) return null; element.scrollIntoView({ behavior:'instant', block:'center' }); const r=element.getBoundingClientRect(); return { x:r.left, y:r.top, width:r.width, height:r.height }; })()");
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error("Clickable element missing: " + selector);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function observeEventTiming(client) {
  await evaluate(client, [
    "window.__phase300EventRows = [];",
    "try { const observer = new PerformanceObserver((list) => {",
    "for (const entry of list.getEntries()) window.__phase300EventRows.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId || 0 });",
    "}); observer.observe({ type: 'event', buffered: true, durationThreshold: 16 }); window.__phase300EventObserver = observer; } catch {}",
    "true",
  ].join("\n"));
}

async function waitForValue(client, expression, predicate, timeoutMs = 3000) {
  const start = Date.now();
  let lastValue;
  while (Date.now() - start < timeoutMs) {
    lastValue = await evaluate(client, expression);
    if (predicate(lastValue)) return { value: lastValue, elapsedMs: Date.now() - start };
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  throw new Error("Expected interaction state did not appear within " + timeoutMs + " ms; last value: " + JSON.stringify(lastValue));
}

async function blurFocused(client) {
  await evaluate(client, "(() => { const element=document.activeElement; if (element instanceof HTMLElement && element !== document.body) element.blur(); return document.activeElement === document.body; })()");
}

async function waitForMountedHost(client, selector, timeoutMs = 5000) {
  await client.send("Page.bringToFront");
  const expression = "(() => { const host=document.querySelector(" + JSON.stringify(selector) + "); if(!host) return null; const r=host.getBoundingClientRect(); return { template:host.getAttribute('data-marketing-card'), mounted:host.getAttribute('data-mounted'), hasArticle:!!host.querySelector('article[data-template]'), documentVisibility:document.visibilityState, hasFocus:document.hasFocus(), viewport:{width:innerWidth,height:innerHeight}, hostRect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}, inViewport:r.left<innerWidth && r.right>0 && r.top<innerHeight && r.bottom>0 && r.width>0 && r.height>0 }; })()";
  try {
    return await waitForValue(client, expression, (value) => value?.mounted === "true" && value.hasArticle && value.inViewport, timeoutMs);
  } catch (error) {
    const telemetry = await evaluate(client, "(() => {const template=document.querySelector(" + JSON.stringify(selector) + ")?.getAttribute('data-marketing-card');return {documentVisibility:document.visibilityState,hasFocus:document.hasFocus(),registrations:window.__phase300AppIO?.registrations?.filter((row)=>row.target?.template===template)??[],callbacks:window.__phase300AppIO?.callbacks?.filter((row)=>row.entries.some((entry)=>entry.template===template))??[]}})()");
    const currentState = await evaluate(client, expression);
    await writeFile(path.join(outputRoot, "identity-world-observer-failure.json"), JSON.stringify({
      schema: "phase300-lazy-master-observer-failure-v1",
      capturedAt: new Date().toISOString(),
      browser: (await fetch("http://127.0.0.1:" + debugPort + "/json/version").then((response) => response.json())).Browser,
      buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null),
      selector, currentState, telemetry, originalError: error.message,
      conclusion: "The application callback received a multi-entry IntersectionObserver batch. The first entry was non-intersecting while a later entry for the visible Identity host was intersecting; the current implementation destructures the first entry.",
    }, null, 2) + "\n");
    throw new Error(error.message + "; app observer trace: " + JSON.stringify(telemetry));
  }
}

async function waitForPath(client, expectedPath, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pathName = await evaluate(client, "location.pathname");
    if (pathName === expectedPath) return Date.now() - start;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Path did not reach " + expectedPath);
}

function titleSvg(text, width, height = 40) {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
    '<rect width="100%" height="100%" fill="#111412"/><text x="16" y="27" fill="#d5bf94" font-family="Arial,sans-serif" font-size="18">' +
    escaped + "</text></svg>");
}

async function composeLabeledStrip(inputFiles, labels, outputName, { cellWidth = 620, cellHeight = 620 } = {}) {
  const headerHeight = 46;
  const composites = [];
  for (let index = 0; index < inputFiles.length; index += 1) {
    const left = index * cellWidth;
    const header = await titleSvg(labels[index], cellWidth, headerHeight);
    const body = await sharp(inputFiles[index])
      .resize(cellWidth - 24, cellHeight - headerHeight - 20, { fit: "contain", background: "#111412" })
      .png().toBuffer();
    composites.push({ input: header, left, top: 0 });
    composites.push({ input: body, left: left + 12, top: headerHeight + 8 });
  }
  await sharp({
    create: { width: cellWidth * inputFiles.length, height: cellHeight, channels: 3, background: "#111412" },
  }).composite(composites).png().toFile(path.join(outputRoot, outputName));
  const bytes = await readFile(path.join(outputRoot, outputName));
  return { file: outputName, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function saveMotionFrame(client, group, label, { element = null, waitMs = 0, offsetMs = waitMs } = {}) {
  const directory = path.join(motionRoot, group);
  await mkdir(directory, { recursive: true });
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const bytes = element
    ? await screenshotBytes(client, { clip: await selectorRect(client, element, false) })
    : await screenshotBytes(client);
  const fileName = label + ".png";
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, bytes);
  return { group, file: path.relative(qaRoot, filePath).replaceAll("\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), offsetMs };
}

const versionResponse = await fetch("http://127.0.0.1:" + debugPort + "/json/version");
if (!versionResponse.ok) throw new Error("Chrome CDP is not ready on port " + debugPort);
const pageResponse = await fetch("http://127.0.0.1:" + debugPort + "/json/new?about:blank", { method: "PUT" });
if (!pageResponse.ok) throw new Error("Could not create Home/Templates QA page: " + pageResponse.status);
const target = await pageResponse.json();
const client = clientFor(target.webSocketDebuggerUrl);
activeClient = client;
await client.ready();
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("DOM.enable");
await client.send("Page.setLifecycleEventsEnabled", { enabled: true });
await client.send("Emulation.setDeviceMetricsOverride", viewport);
// Headless Chrome may create this CDP page as a background target. IntersectionObserver
// does not admit below-fold LazyMaster content there until the target is foregrounded.
await client.send("Page.bringToFront");
await client.send("Page.addScriptToEvaluateOnNewDocument", { source: [
  "(() => { const NativeObserver=window.IntersectionObserver; window.__phase300AppIO={registrations:[],callbacks:[]}; window.IntersectionObserver=class TracedIntersectionObserver extends NativeObserver {",
  "constructor(callback,options){const observerId=window.__phase300AppIO.registrations.length+1;window.__phase300AppIO.registrations.push({observerId,rootMargin:options?.rootMargin??'0px',threshold:options?.threshold??0,hasRoot:!!options?.root});super((entries,observer)=>{window.__phase300AppIO.callbacks.push({observerId,time:performance.now(),scrollY,entries:entries.map((entry)=>{const r=entry.boundingClientRect,i=entry.intersectionRect,b=entry.rootBounds;return{template:entry.target.getAttribute('data-marketing-card'),mounted:entry.target.getAttribute('data-mounted'),connected:entry.target.isConnected,isIntersecting:entry.isIntersecting,intersectionRatio:entry.intersectionRatio,boundingClientRect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},rootBounds:b?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:null,intersectionRect:{left:i.left,right:i.right,top:i.top,bottom:i.bottom}}})});callback(entries,observer);},options);this.__phase300ObserverId=observerId;} observe(target){window.__phase300AppIO.registrations[this.__phase300ObserverId-1].target={template:target.getAttribute?.('data-marketing-card'),tag:target.tagName,connected:target.isConnected};return super.observe(target);} }; })()",
].join("\n") });
await navigate(client, baseUrl);
await setState(client, "dark", "ko");

const screenshotArtifacts = [];
const interactionChecks = [];
const motionFrames = [];

// Home stack card detail.
await navigate(client, baseUrl + "/");
await settle(client, 1500);
await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 2 });
screenshotArtifacts.push(await saveElement(client,
  "section[aria-labelledby=home-title] [data-marketing-card=cinematic] article[data-template=cinematic]",
  "05-hero-detail.png", { scale: 2, waitMs: 500 }));
console.log("Captured 05-hero-detail.png");
await client.send("Emulation.setDeviceMetricsOverride", viewport);

// Real three-master carousel progression with semantic focus and pointer activation.
const carouselSelector = "[aria-roledescription=carousel]";
const labelSelector = carouselSelector + " [aria-live=polite]";
const stateImages = [];
const stateLabels = [];
const currentLabel = () => evaluate(client, "document.querySelector(" + JSON.stringify(labelSelector) + ")?.innerText.trim() ?? ''");
await observeEventTiming(client);
stateLabels.push(await currentLabel());
stateImages.push(path.join(motionRoot, "card-stack", "cinematic.png"));
await mkdir(path.dirname(stateImages[0]), { recursive: true });
await screenshotBytes(client, { clip: await selectorRect(client, carouselSelector, true) }).then((bytes) => writeFile(stateImages[0], bytes));
const firstLabel = stateLabels[0];
const focusProbe = await evaluate(client, "(() => { const button=document.querySelector(" + JSON.stringify(carouselSelector + " button:last-of-type") + "); button?.focus(); return { exists:!!button, focused:document.activeElement===button, label:button?.getAttribute('aria-label'), disabled:button?.disabled }; })()");
await clickSelector(client, carouselSelector + " button:last-of-type");
const pointerNext = await waitForValue(client, "document.querySelector(" + JSON.stringify(labelSelector) + ")?.innerText.trim() ?? ''", (value) => value !== firstLabel);
await settle(client, 320);
stateLabels.push(pointerNext.value);
stateImages.push(path.join(motionRoot, "card-stack", "editorial.png"));
await screenshotBytes(client, { clip: await selectorRect(client, carouselSelector, true) }).then((bytes) => writeFile(stateImages[1], bytes));
const secondLabel = stateLabels[1];
await clickSelector(client, carouselSelector + " button:last-of-type");
const pointerNext2 = await waitForValue(client, "document.querySelector(" + JSON.stringify(labelSelector) + ")?.innerText.trim() ?? ''", (value) => value !== secondLabel);
await settle(client, 320);
stateLabels.push(pointerNext2.value);
stateImages.push(path.join(motionRoot, "card-stack", "identity.png"));
await blurFocused(client);
await screenshotBytes(client, { clip: await selectorRect(client, carouselSelector, true) }).then((bytes) => writeFile(stateImages[2], bytes));
const stackEventEntries = await evaluate(client, "window.__phase300EventRows");
screenshotArtifacts.push(await composeLabeledStrip(stateImages, stateLabels.map((label) => "STACK STATE / " + label), "06-card-stack-states.png", { cellWidth: 590, cellHeight: 650 }));
interactionChecks.push({
  name: "hero-card-stack-cycle",
  states: stateLabels,
  expected: ["시네마틱", "에디토리얼", "아이덴티티"],
  focusableNextControl: focusProbe.focused && !focusProbe.disabled,
  pointerNextMs: pointerNext.elapsedMs,
  pointerNextAgainMs: pointerNext2.elapsedMs,
  eventTimingEntries: stackEventEntries,
  pointerNext: stateLabels[1] !== stateLabels[0] && stateLabels[2] !== stateLabels[1],
  pass: focusProbe.focused && !focusProbe.disabled && stateLabels.length === 3 && new Set(stateLabels).size === 3,
});

// Before/after compare: drag the real range control, then switch locale and verify its accessible value is preserved.
await navigate(client, baseUrl + "/");
await settle(client, 1000);
const rangeSelector = "[data-compare] input[type=range]";
async function setRangeByPointer(value) {
  const box = await evaluate(client, "(() => { const input=document.querySelector(" + JSON.stringify(rangeSelector) + "); input?.scrollIntoView({ behavior:'instant', block:'center' }); const r=input?.getBoundingClientRect(); return r ? { x:r.left, y:r.top, width:r.width, height:r.height, value:Number(input.value) } : null; })()");
  if (!box || box.width < 1 || box.height < 1) throw new Error("Compare slider has no visible pointer bounds.");
  const y = box.y + box.height / 2;
  let current = box.value;
  let targetX = box.x + box.width * (100 - value) / 100;
  for (let attempt = 0; attempt < 4 && current !== value; attempt += 1) {
    const startX = box.x + box.width * (100 - current) / 100;
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y, button: "left", buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 4; step += 1) {
      await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX + (targetX - startX) * step / 4, y, button: "left", buttons: 1 });
    }
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: targetX, y, button: "left", buttons: 0, clickCount: 1 });
    current = Number(await evaluate(client, "Number(document.querySelector(" + JSON.stringify(rangeSelector) + ")?.value)"));
    if (current !== value) targetX += (current - value) * box.width / 100;
  }
  await settle(client, 120);
  const state = await evaluate(client, "(() => { const input=document.querySelector(" + JSON.stringify(rangeSelector) + "); return { value: input.value, ariaValueNow: input.getAttribute('aria-valuenow'), ariaValueText: input.getAttribute('aria-valuetext'), compare: document.querySelector('[data-compare]').style.getPropertyValue('--compare') }; })()");
  const originalWidthPercent = Number.parseFloat(state.compare);
  return { ...state, targetValue: value, expectedOriginalWidthPercent: 100 - value, actualOriginalWidthPercent: originalWidthPercent,
    pass: Number(state.value) === value && originalWidthPercent === 100 - value };
}
const compareStates = [];
for (const value of [20, 50, 80]) {
  const state = await setRangeByPointer(value);
  compareStates.push(state);
  const pathName = path.join(motionRoot, "compare", "value-" + value + ".png");
  await mkdir(path.dirname(pathName), { recursive: true });
  await screenshotBytes(client, { clip: await selectorRect(client, "section[aria-labelledby=compare-title]", true) }).then((bytes) => writeFile(pathName, bytes));
}
const compareAtTwenty = await setRangeByPointer(20);
const localeSelect = await evaluate(client, "document.querySelector('select')?.getAttribute('aria-label') ?? null");
await evaluate(client, "(() => { const select=document.querySelector('select'); if (!select) return false; select.value='en'; select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()");
await settle(client, 350);
const compareAfterLocale = await evaluate(client,
  "(() => { const input=document.querySelector(" + JSON.stringify(rangeSelector) + "); return { lang: document.documentElement.lang, value: input.value, ariaValueNow: input.getAttribute('aria-valuenow'), ariaValueText: input.getAttribute('aria-valuetext'), compare: document.querySelector('[data-compare]').style.getPropertyValue('--compare') }; })()");
interactionChecks.push({
  name: "accessible-before-after-range",
  states: compareStates,
  afterLocaleSwitch: compareAfterLocale,
  localeControl: localeSelect,
  expectedValue: "20",
  pass: compareStates.every((state) => state.pass) && compareAtTwenty.pass && compareAfterLocale.value === "20" &&
    Number.parseFloat(compareAfterLocale.compare) === 80 && compareAfterLocale.ariaValueText?.includes("20") && compareAfterLocale.lang === "en",
});
screenshotArtifacts.push(await composeLabeledStrip(
  [20, 50, 80].map((value) => path.join(motionRoot, "compare", "value-" + value + ".png")),
  ["CARD / 20%", "CARD / 50%", "CARD / 80%"],
  "07-before-after.png",
  { cellWidth: 620, cellHeight: 560 },
));

// Master Worlds and the scroll narrative are captured only after each lazy renderer is mounted in the viewport.
await navigate(client, baseUrl + "/");
await setState(client, "dark", "ko");
await navigate(client, baseUrl + "/");
await settle(client, 1200);
const worldCaptures = [];
const worldChecks = [];
for (const [template, label] of [["cinematic", "C2 / CINEMATIC"], ["editorial", "E2 / EDITORIAL"], ["id-card", "I3 / IDENTITY"]]) {
  const hostSelector = "section[aria-labelledby=worlds-title] [data-marketing-card=" + template + "]";
  const articleSelector = "section[aria-labelledby=worlds-title] article:has([data-marketing-card=" + template + "])";
  await selectorRect(client, articleSelector, true);
  const mounted = await waitForMountedHost(client, hostSelector);
  await settle(client, 450);
  await blurFocused(client);
  const frame = await saveMotionFrame(client, "master-worlds", "world-" + template, { element: articleSelector });
  worldCaptures.push(path.join(qaRoot, frame.file));
  worldChecks.push({ template, label, mounted: mounted.value, frame: frame.file });
}
screenshotArtifacts.push(await composeLabeledStrip(worldCaptures, ["C2 / CINEMATIC", "E2 / EDITORIAL", "I3 / IDENTITY"], "08-master-worlds.png", { cellWidth: 610, cellHeight: 700 }));
interactionChecks.push({ name: "worlds-lazy-master-mount", masters: worldChecks, pass: worldChecks.length === 3 && worldChecks.every((item) => item.mounted.mounted === "true" && item.mounted.hasArticle && item.mounted.inViewport) });

const storyFrames = [];
const storyChecks = [];
const storyItems = [];
for (let index = 1; index <= 4; index += 1) {
  const itemSelector = "ol[data-scroll-story] > li:nth-child(" + index + ")";
  await selectorRect(client, itemSelector, true);
  const host = await evaluate(client, "document.querySelector(" + JSON.stringify(itemSelector) + ")?.querySelector('[data-marketing-card]')?.getAttribute('data-marketing-card') ?? null");
  const mounted = host ? await waitForMountedHost(client, itemSelector + " [data-marketing-card]") : null;
  await settle(client, 350);
  await blurFocused(client);
  const frame = await saveMotionFrame(client, "scroll-story", "step-" + index, { element: itemSelector, offsetMs: index * 250 });
  storyFrames.push(path.join(qaRoot, frame.file));
  storyItems.push({ index, hostTemplate: host, mounted: mounted?.value ?? null, frame: frame.file });
  storyChecks.push({ index, visible: true, mounted: !host || mounted?.value.mounted === "true" });
}
screenshotArtifacts.push(await composeLabeledStrip(storyFrames, ["01 / SCREENSHOT", "02 / DETAILS", "03 / CARD", "04 / SAVED"], "09-scroll-story.png", { cellWidth: 470, cellHeight: 660 }));
motionFrames.push(...storyItems.map((item) => ({ group: "scroll-story", frame: item.frame, offsetMs: item.index * 250 })));
interactionChecks.push({ name: "home-scroll-story-lazy-content", steps: storyItems, pass: storyChecks.length === 4 && storyChecks.every((item) => item.visible && item.mounted) });
const scrollMetrics = await evaluate(client, "(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight, height: document.documentElement.scrollHeight, storyVisible: !!document.querySelector('[data-scroll-story]') }))()");
interactionChecks.push({ name: "home-story-scroll", scrollMetrics, pass: scrollMetrics.storyVisible && scrollMetrics.y > 0 });

// Traverse the complete Home document down and back up while tracking LazyMaster mount/unmount transitions.
await setState(client, "dark", "ko");
await navigate(client, baseUrl + "/");
await settle(client, 900);
await evaluate(client, [
  "window.__phase300MountChanges = [];",
  "new MutationObserver((records) => {",
  "for (const record of records) if (record.target.matches?.('[data-marketing-card]')) window.__phase300MountChanges.push({ template: record.target.getAttribute('data-marketing-card'), mounted: record.target.getAttribute('data-mounted'), scrollY: window.scrollY });",
  "}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-mounted'] });",
  "true",
].join("\n"));
const fullScrollStates = [];
const readMountState = () => evaluate(client, "(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight, height: document.documentElement.scrollHeight, storyVisible: (() => { const e=document.querySelector('[data-scroll-story]'); const r=e?.getBoundingClientRect(); return !!r && r.top < innerHeight && r.bottom > 0; })(), cards: [...document.querySelectorAll('[data-marketing-card]')].map((card,index) => ({ index, template: card.getAttribute('data-marketing-card'), mounted: card.getAttribute('data-mounted'), hasCard: !!card.querySelector('article[data-template]') })) }))()");
const initialMountState = await readMountState();
await evaluate(client, [
  "window.__phase300ScrollStorySeen = false;",
  "window.__phase300ScrollListener = () => { const story=document.querySelector('[data-scroll-story]'); const r=story?.getBoundingClientRect(); if(r && r.top<innerHeight && r.bottom>0) window.__phase300ScrollStorySeen=true; };",
  "window.addEventListener('scroll', window.__phase300ScrollListener, { passive:true });",
  "window.__phase300ScrollFrames = { active:true, intervals:[], previous:null };",
  "const tick = (now) => { const state=window.__phase300ScrollFrames; if(!state.active) return; if(state.previous!==null) state.intervals.push(now-state.previous); state.previous=now; requestAnimationFrame(tick); }; requestAnimationFrame(tick);",
  "true",
].join("\n"));
const scrollStepCount = Math.min(24, Math.ceil(initialMountState.max / 680) + 2);
for (let step = 0; step < scrollStepCount; step += 1) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 650, deltaY: 680, deltaX: 0 });
  await new Promise((resolve) => setTimeout(resolve, 140));
}
await new Promise((resolve) => setTimeout(resolve, 260));
const bottomMountState = await readMountState();
fullScrollStates.push(bottomMountState);
const scrollReachedBottom = bottomMountState.y >= bottomMountState.max - 4;
for (let step = 0; step < scrollStepCount; step += 1) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 250, deltaY: -680, deltaX: 0 });
  await new Promise((resolve) => setTimeout(resolve, 140));
}
await new Promise((resolve) => setTimeout(resolve, 260));
let mountState = await readMountState();
fullScrollStates.push(mountState);
const naturalReturnToTop = mountState.y <= 4;
if (!naturalReturnToTop) {
  await evaluate(client, "window.scrollTo({ top: 0, behavior: 'instant' }); true");
  await new Promise((resolve) => setTimeout(resolve, 350));
  mountState = await readMountState();
}
fullScrollStates.push(mountState);
await evaluate(client, "window.__phase300ScrollFrames.active = false; window.removeEventListener('scroll', window.__phase300ScrollListener); true");
const scrollFrameIntervals = await evaluate(client, "window.__phase300ScrollFrames.intervals");
const scrollFrameMetrics = {
  samples: scrollFrameIntervals.length,
  p50Ms: quantile(scrollFrameIntervals, 0.5),
  p95Ms: quantile(scrollFrameIntervals, 0.95),
  over16_7ms: scrollFrameIntervals.filter((value) => value > 16.7).length,
  over50ms: scrollFrameIntervals.filter((value) => value > 50).length,
  limitation: "requestAnimationFrame intervals are a cadence proxy, not a compositor/GPU presentation trace or a 60fps guarantee.",
};
const mountChanges = await evaluate(client, "window.__phase300MountChanges");
const topHeroCards = mountState.cards.filter((card) => card.index < 3);
const fullPageScroll = {
  reachedBottom: scrollReachedBottom,
  returnedToTop: naturalReturnToTop,
  initialMaxScroll: initialMountState.max,
  finalScrollY: mountState.y,
  documentHeight: mountState.height,
  storyObservedDuringDown: await evaluate(client, "window.__phase300ScrollStorySeen"),
  cardsSeen: new Set(fullScrollStates.flatMap((state) => state.cards.map((card) => card.template))).size,
  mountTransitions: mountChanges,
  topHeroCards,
  frameIntervals: scrollFrameMetrics,
  pass: scrollReachedBottom && naturalReturnToTop && topHeroCards.length === 3 && topHeroCards.every((card) => card.mounted === "true" && card.hasCard),
};
interactionChecks.push({ name: "home-full-page-down-up-and-lazy-remount", ...fullPageScroll });

// Capture motion snapshots around the Home intro and stack transitions.
await setState(client, "dark", "ko");
const introStart = Date.now();
const introLoad = client.waitEvent("Page.loadEventFired");
await client.send("Page.navigate", { url: baseUrl + "/?phase300-motion=" + Date.now() });
await introLoad;
for (const offset of [0, 250, 500, 900, 1300]) {
  const remaining = Math.max(0, offset - (Date.now() - introStart));
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
  motionFrames.push(await saveMotionFrame(client, "hero-intro", "frame-" + String(offset).padStart(4, "0") + "ms", { offsetMs: offset }));
}
await settle(client, 300);
await navigate(client, baseUrl + "/");
await settle(client, 900);
motionFrames.push(await saveMotionFrame(client, "card-stack", "transition-before-click", { element: carouselSelector }));
const stackTransitionStart = Date.now();
await clickSelector(client, carouselSelector + " button:last-of-type");
for (const offset of [0, 80, 160, 280, 420]) {
  const remaining = Math.max(0, stackTransitionStart + offset - Date.now());
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
  motionFrames.push(await saveMotionFrame(client, "card-stack", "transition-" + String(offset).padStart(3, "0") + "ms", { element: carouselSelector, offsetMs: offset }));
}

// Template selection to the Editor is an actual route transition with the selected Master.
await setState(client, "dark", "ko");
await navigate(client, baseUrl + "/templates");
await settle(client, 1200);
const editorialChoice = "article[data-template=editorial] button[aria-pressed]";
await selectorRect(client, editorialChoice, true);
motionFrames.push(await saveMotionFrame(client, "template-transition", "before-select", { element: "article[data-template=editorial]" }));
await clickSelector(client, editorialChoice);
await settle(client, 250);
const selectedTemplate = await evaluate(client, "(() => { const card=document.querySelector('article[data-template=editorial]'); return { selected: card?.getAttribute('data-selected'), pressed: card?.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed'), action: !!card?.querySelector('button:not([aria-pressed])') }; })()");
if (selectedTemplate.selected !== "true") throw new Error("Editorial template selection did not activate.");
screenshotArtifacts.push(await saveViewport(client, "13-template-hover-select.png"));
const actionSelector = "article[data-template=editorial] button:not([aria-pressed])";
motionFrames.push(await saveMotionFrame(client, "template-transition", "before-editor", { element: "article[data-template=editorial]" }));
await clickSelector(client, actionSelector);
const editorReadyMs = await waitForPath(client, "/editor");
await settle(client, 1200);
const editorTemplate = await evaluate(client, "document.querySelector('article[data-template]')?.getAttribute('data-template') ?? null");
screenshotArtifacts.push(await saveViewport(client, "14-template-to-editor.png"));
motionFrames.push(await saveMotionFrame(client, "template-transition", "editor-ready", { element: "main" }));
interactionChecks.push({
  name: "template-selection-to-editor",
  selectedTemplate,
  editorTemplate,
  editorReadyMs,
  pass: selectedTemplate.pressed === "true" && editorTemplate === "editorial",
});

// Hero intro uses several real browser frames; frame sequence is the reviewable motion artifact.
await mkdir(motionRoot, { recursive: true });
const referenceDarkPath = path.join(root, "docs", "qa", "phase215", "final-editor-dark-card-style.json");
const referenceLightPath = path.join(root, "docs", "qa", "phase215", "final-editor-light-card-style.json");
const [referenceDark, referenceLight] = await Promise.all([
  readFile(referenceDarkPath, "utf8").then((value) => JSON.parse(value)),
  readFile(referenceLightPath, "utf8").then((value) => JSON.parse(value)),
]);
const report = {
  schema: "phase300-home-template-qa-v1",
  capturedAt: new Date().toISOString(),
  application: { baseUrl, buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null) },
  browser: (await versionResponse.json()).Browser,
  viewport: { width: viewport.width, height: viewport.height, deviceScaleFactor: 1 },
  screenshots: screenshotArtifacts,
  interactionChecks,
  motion: {
    frameCount: motionFrames.length,
    frames: motionFrames,
    sequenceDirectories: ["motion/hero-intro", "motion/card-stack", "motion/scroll-story", "motion/template-transition"],
    referenceEditorStyleRoots: { dark: referenceDark.roots.length, light: referenceLight.roots.length },
  },
  applicationIntersectionObserverTrace: await evaluate(client, "window.__phase300AppIO"),
  limitation: "Motion evidence is retained as PNG frame sequences with recorded offsets; it is not a compositor video trace.",
};
await writeFile(path.join(outputRoot, "home-template-qa.json"), JSON.stringify(report, null, 2) + "\n");
await writeFile(path.join(motionRoot, "motion-manifest.json"), JSON.stringify({ capturedAt: report.capturedAt, frameCount: motionFrames.length, frames: motionFrames }, null, 2) + "\n");
const scrollCadence = interactionChecks.find((check) => check.name === "home-full-page-down-up-and-lazy-remount");
if (scrollCadence) await writeFile(path.join(outputRoot, "home-scroll-cadence.json"), JSON.stringify({
  schema: "phase300-home-scroll-cadence-v1",
  capturedAt: report.capturedAt,
  application: report.application,
  browser: report.browser,
  viewport: report.viewport,
  protocol: "Dark KO Home at 1440×900; continuous rAF intervals recorded during full down/up 680px wheel stepping with a 140ms interval. Only actual visible foreground page scroll data is included.",
  ...scrollCadence,
}, null, 2) + "\n");
client.close();
activeClient = undefined;
console.log(JSON.stringify({
  report: "docs/qa/phase300/home-template-qa.json",
  screenshots: screenshotArtifacts.map((row) => row.file),
  interactions: interactionChecks.map((row) => ({ name: row.name, pass: row.pass })),
  motionFrames: motionFrames.length,
}, null, 2));
if (interactionChecks.some((check) => check.pass === false)) process.exitCode = 1;

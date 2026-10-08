import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const evidenceRoot = path.join(root, "docs", "qa", "phase303-job-lock");
export const rawRoot = path.join(evidenceRoot, "raw");

export class CdpSession {
  #socket;
  #nextId = 0;
  #pending = new Map();
  #listeners = new Map();

  constructor(webSocketUrl) {
    this.#socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.#socket.addEventListener("open", resolve, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
    });
    this.#socket.addEventListener("message", (event) => this.#onMessage(event));
  }

  #onMessage(event) {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method && this.#listeners.has(message.method)) {
      for (const listener of [...this.#listeners.get(message.method)]) listener(message.params ?? {});
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const listeners = this.#listeners.get(method) ?? new Set();
      const listener = (params) => {
        listeners.delete(listener);
        clearTimeout(timer);
        resolve(params);
      };
      listeners.add(listener);
      this.#listeners.set(method, listeners);
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`CDP event timed out: ${method}`));
      }, timeoutMs);
    });
  }

  close() { this.#socket.close(); }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectPhase303(debugPort, { timeoutMs = 12000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (target) {
        const client = new CdpSession(target.webSocketDebuggerUrl);
        await client.ready;
        await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("DOM.enable")]);
        return { client, version, target };
      }
    } catch {}
    await sleep(120);
  }
  throw new Error(`No page target became available on Chrome CDP port ${debugPort}.`);
}

export async function evaluate(client, expression, timeoutMs = 30000) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}

export async function setViewportAndMedia(client, {
  width = 1440,
  height = 1120,
  deviceScaleFactor = 1,
  mobile = false,
  colorScheme = "dark",
  reducedMotion = "no-preference",
} = {}) {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile });
  await client.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: colorScheme },
      { name: "prefers-reduced-motion", value: reducedMotion },
    ],
  });
  return { width, height, deviceScaleFactor, mobile, colorScheme, reducedMotion };
}

export async function assertForeground(client, expectedViewport) {
  await client.send("Page.bringToFront");
  const actual = await evaluate(client, "({visibility:document.visibilityState,hasFocus:document.hasFocus(),width:innerWidth,height:innerHeight,scrollX,scrollY})");
  if (actual.visibility !== "visible" || actual.hasFocus !== true) throw new Error(`CDP page is not foreground: ${JSON.stringify(actual)}`);
  if (expectedViewport && (actual.width !== expectedViewport.width || actual.height !== expectedViewport.height)) {
    throw new Error(`CDP viewport mismatch: expected ${expectedViewport.width}x${expectedViewport.height}; got ${actual.width}x${actual.height}`);
  }
  return actual;
}

export async function waitForPageSettle(client, { minimumMs = 250, timeoutMs = 20000 } = {}) {
  const expression = `(async()=>{const start=performance.now();await(document.fonts?.ready??Promise.resolve());const imgs=[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0});await Promise.race([Promise.all(imgs.map(i=>i.decode?.().catch(()=>{})??Promise.resolve())),new Promise(r=>setTimeout(r,10000))]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,${minimumMs}))));return {elapsedMs:performance.now()-start,fontStatus:document.fonts?.status??'unsupported',images:imgs.length}})()`;
  return evaluate(client, expression, timeoutMs);
}

export async function navigateAndAssert(client, url, viewport) {
  await client.send("Page.bringToFront");
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(`Navigation failed for ${url}: ${result.errorText}`);
  await loaded;
  const settled = await waitForPageSettle(client);
  const foreground = await assertForeground(client, viewport);
  return { settled, foreground };
}

export async function waitForPhase303Api(client, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(client, `(()=>{const api=window.__PHASE303_QA__;return api?{version:api.version,ready:api.ready===true,methods:['apply','render','readBlob','releaseBlob','snapshot'].filter(k=>typeof api[k]==='function')} : null})()`);
    if (last?.version === 1 && last.ready && ['apply','render','readBlob','releaseBlob','snapshot'].every((method) => last.methods.includes(method))) return last;
    await sleep(100);
  }
  throw new Error(`Phase303 production renderer harness did not become ready: ${JSON.stringify(last)}`);
}

export async function applyProductionCase(client, caseInput, timeoutMs = 60000) {
  const startedAt = performance.now();
  const report = await evaluate(client, `(async()=>await window.__PHASE303_QA__.apply(${JSON.stringify(caseInput)}))()`, timeoutMs);
  return { ...report, apiWallMs: performance.now() - startedAt };
}

export async function captureProductionPreview(client, caseId, { outputRoot = rawRoot, scale = 1 } = {}) {
  const rect = await evaluate(client, `(()=>{const el=document.querySelector('article[data-card-render-scope="true"]');if(!el)return null;el.scrollIntoView({behavior:'instant',block:'center',inline:'center'});const r=el.getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()`);
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error(`Missing actual production card for ${caseId}.`);
  await waitForPageSettle(client, { minimumMs: 80 });
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale },
  }, 60000);
  const bytes = Buffer.from(screenshot.data, "base64");
  const dimensions = await sharp(bytes).metadata();
  const expected = { width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) };
  if (dimensions.width !== expected.width || dimensions.height !== expected.height) {
    throw new Error(`Preview raster mismatch for ${caseId}: expected ${expected.width}x${expected.height}, got ${dimensions.width}x${dimensions.height}.`);
  }
  await mkdir(outputRoot, { recursive: true });
  const filename = `${safeFileName(caseId)}-preview-1x.png`;
  const output = path.join(outputRoot, filename);
  await writeFile(output, bytes);
  return {
    path: path.posix.join("raw", filename),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    cardRectCss: rect,
    screenshotScale: scale,
    pixelDimensions: { width: dimensions.width, height: dimensions.height },
  };
}

export async function renderProductionExport(client, { caseId, format, scale, outputRoot = rawRoot }) {
  const startedAt = performance.now();
  const rendered = await evaluate(client, `(async()=>await window.__PHASE303_QA__.render(${JSON.stringify({ format, scale })}))()`, 120000);
  const byteChunks = [];
  let offset = 0;
  while (true) {
    const chunk = await evaluate(client, `(async()=>await window.__PHASE303_QA__.readBlob(${JSON.stringify(rendered.blobId)},${offset},49152))()`, 30000);
    if (!chunk?.base64 || chunk.bytes <= 0) throw new Error(`Empty Phase303 export chunk for ${caseId}/${format}/${scale} at ${offset}.`);
    const bytes = Buffer.from(chunk.base64, "base64");
    if (bytes.length !== chunk.bytes) throw new Error(`Phase303 export chunk byte mismatch for ${caseId}/${format}/${scale}.`);
    byteChunks.push(bytes);
    offset += bytes.length;
    if (chunk.done) break;
  }
  const bytes = Buffer.concat(byteChunks);
  const metadata = await sharp(bytes).metadata();
  const actualPixelDimensions = { width: metadata.width, height: metadata.height };
  const expectedPixelDimensions = rendered.actualPixelDimensions;
  if (actualPixelDimensions.width !== expectedPixelDimensions.width || actualPixelDimensions.height !== expectedPixelDimensions.height) {
    throw new Error(`Export blob dimensions differ from production renderer output for ${caseId}/${format}/${scale}: ${JSON.stringify({ actualPixelDimensions, expectedPixelDimensions })}`);
  }
  if (bytes.length !== rendered.byteLength) throw new Error(`Export blob bytes differ from production renderer output for ${caseId}/${format}/${scale}.`);
  const suffix = format === "webp" ? "webp" : "png";
  const filename = `${safeFileName(caseId)}-${format}-${scale}x.${suffix}`;
  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, filename), bytes);
  const release = await evaluate(client, `(async()=>window.__PHASE303_QA__.releaseBlob(${JSON.stringify(rendered.blobId)}))()`);
  if (!release) throw new Error(`Production export blob was not released for ${caseId}/${format}/${scale}.`);
  return {
    path: path.posix.join("raw", filename),
    format,
    requestedScale: scale,
    actualScale: rendered.scaleActual,
    capped: rendered.capped,
    dimensions: actualPixelDimensions,
    logicalDimensions: rendered.logicalDimensions,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rendererWallMs: rendered.rasterWallMs,
    captureWallMs: performance.now() - startedAt,
    fontStatus: rendered.fontStatus,
    loadedFontFaceCount: rendered.loadedFontFaceCount,
    progress: rendered.progress,
  };
}

export async function writeProductionCaseReport(caseId, report) {
  await mkdir(rawRoot, { recursive: true });
  const filename = `${safeFileName(caseId)}.json`;
  const output = path.join(rawRoot, filename);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  return path.posix.join("raw", filename);
}

export function safeFileName(value) {
  const filename = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  if (!filename) throw new Error(`Invalid Phase303 artifact name: ${String(value)}`);
  return filename;
}

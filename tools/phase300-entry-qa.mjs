import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = getArg("--base-url", "http://localhost:3318").replace(/\/$/, "");
const debugPort = Number(getArg("--debug-port", "9322"));
const qaRoot = path.join(root, "docs", "qa", "phase300", "after");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const downloadDir = path.join(root, "docs", "qa", "phase300", "downloads", runId);
const invalidImagePath = path.join(downloadDir, "invalid-upload-test.txt");
const sampleWebpPath = path.join(root, "public", "assets", "samples", "coner", "optimized", "landscape.webp");
const samplePngPath = path.join(root, "public", "assets", "samples", "coner", "original", "landscape.png");
const editorStorageKey = "ff14-adventurer-card:draft:v3";
const localeStorageKey = "ff14-adventurer-card:locale";
const localeChangeEvent = "ff14-adventurer-card:locale-change";
const appearanceStorageKey = "ff14-adventurer-card:appearance";
const desktop = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
const mobile = { width: 390, height: 844, deviceScaleFactor: 1, mobile: true };
const functionalOnly = process.argv.includes("--functional-only");
const recaptureFinal = process.argv.includes("--recapture-final");
const recaptureCreateOnly = process.argv.includes("--recapture-create-only");
const useDefaultContext = process.argv.includes("--use-default-context");
const report = {
  schema: "phase300-entry-export-functional-v1",
  runId,
  capturedAt: new Date().toISOString(),
  application: { baseUrl, productionBuildId: null },
  browser: null,
  isolation: { browserContext: "ephemeral CDP BrowserContext", sharedProfileStorageChanged: false },
  screenshots: [],
  upload: { stateEvents: [], screenshots: {} },
  savedDraftConfirmation: {},
  editorToExport: {},
  ratios: [],
  downloads: [],
  print: {},
  limitations: [],
};

function getArg(name, fallback) {
  const entry = process.argv.find((arg) => arg.startsWith(name + "="));
  return entry ? entry.slice(name.length + 1) : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function clientFor(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  const backlog = [];

  function dispatch(method, params) {
    const event = { method, params, receivedAt: Date.now() };
    backlog.push(event);
    if (backlog.length > 200) backlog.shift();
    const registered = listeners.get(method);
    if (!registered) return;
    let consumed = false;
    for (const waiter of [...registered]) {
      if (!waiter.predicate(params)) continue;
      registered.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(params);
      consumed = true;
    }
    if (consumed) backlog.splice(backlog.indexOf(event), 1);
  }

  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result ?? {});
      return;
    }
    if (message.method) dispatch(message.method, message.params ?? {});
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
          reject(new Error("CDP request timed out: " + method));
        }, 120000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitEvent(method, predicate = () => true, timeoutMs = 30000) {
      const existingIndex = backlog.findIndex((event) => event.method === method && predicate(event.params));
      if (existingIndex >= 0) return Promise.resolve(backlog.splice(existingIndex, 1)[0].params);
      return new Promise((resolve, reject) => {
        const registered = listeners.get(method) ?? new Set();
        const waiter = {
          predicate,
          resolve,
          reject,
          timer: setTimeout(() => {
            registered.delete(waiter);
            reject(new Error("CDP event timed out: " + method));
          }, timeoutMs),
        };
        registered.add(waiter);
        listeners.set(method, registered);
      });
    },
    close() { socket.close(); },
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
  return response.json();
}

async function waitForBrowserVersion(port) {
  const endpoint = "http://127.0.0.1:" + port + "/json/version";
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { return await fetchJson(endpoint); }
    catch (error) { lastError = error; await delay(100); }
  }
  throw new Error("Chrome DevTools endpoint was not ready: " + String(lastError));
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitForValue(client, expression, predicate, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await evaluate(client, expression);
    if (predicate(lastValue)) return lastValue;
    await delay(60);
  }
  throw new Error("Timed out waiting for " + label + "; last value was " + JSON.stringify(lastValue));
}

async function waitForPath(client, pathname, timeoutMs = 30000) {
  return waitForValue(client, "location.pathname", (value) => value === pathname, "route " + pathname, timeoutMs);
}

async function waitForApplication(client) {
  await evaluate(client, "new Promise((resolve) => (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
}

async function bringPageToFront(client, label) {
  await client.send("Page.bringToFront");
  const state = await waitForValue(
    client,
    "({ visibility: document.visibilityState, focus: document.hasFocus() })",
    (value) => value.visibility === "visible" && value.focus,
    label + " foreground state",
    10000,
  );
  return state;
}

async function navigate(client, url) {
  const loaded = client.waitEvent("Page.loadEventFired", () => true, 60000);
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(result.errorText);
  await loaded;
  await bringPageToFront(client, new URL(url).pathname);
  await waitForApplication(client);
}

async function setViewport(client, size, theme = "dark") {
  await client.send("Emulation.setDeviceMetricsOverride", size);
  await client.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
}

async function setLocale(client, locale) {
  await evaluate(client, [
    "localStorage.setItem(" + JSON.stringify(localeStorageKey) + ", " + JSON.stringify(locale) + ");",
    "window.dispatchEvent(new Event(" + JSON.stringify(localeChangeEvent) + "));",
    "true",
  ].join("\n"));
  await waitForValue(client, "document.documentElement.lang", (value) => value === locale, "locale " + locale);
}

async function capture(client, file) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(result.data, "base64");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  const entry = { file: path.relative(root, file), bytes: bytes.length, sha256: sha256(bytes) };
  report.screenshots.push(entry);
  return entry;
}

async function clickExpression(client, nodeExpression) {
  const rect = await evaluate(client, [
    "(() => {",
    "const node = (" + nodeExpression + ");",
    "if (!node) return null;",
    "document.documentElement.style.scrollBehavior = 'auto';",
    "let r = node.getBoundingClientRect();",
    "if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });",
    "r = node.getBoundingClientRect();",
    "return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };",
    "})()",
  ].join("\n"));
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error("Could not click visible node: " + nodeExpression);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}

async function clickButtonText(client, text, exact = true) {
  const literal = JSON.stringify(text);
  const compare = exact
    ? "button.innerText.trim() === " + literal
    : "button.innerText.trim().includes(" + literal + ")";
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((button) => " + compare + ")");
}

async function clickEditorLink(client) {
  await clickExpression(client, "document.querySelector('a[href=\"/editor\"]')");
  await waitForPath(client, "/editor");
  await waitForApplication(client);
}

async function pressKey(client, key, code, virtualKeyCode, shiftKey = false) {
  const payload = { key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, shiftKey };
  if (key === "Enter") {
    await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...payload });
    await client.send("Input.dispatchKeyEvent", { type: "char", ...payload, text: "\r", unmodifiedText: "\r" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...payload });
    return;
  }
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...payload });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...payload });
}

async function installUploadStateObserver(client) {
  await client.send("Runtime.addBinding", { name: "phase300UploadState" });
  await evaluate(client, [
    "(() => {",
    "const input = document.querySelector('input[type=file]');",
    "const zone = input?.closest('[data-state]');",
    "if (!zone) throw new Error('Create upload target has no data-state element.');",
    "const report = () => window.phase300UploadState(zone.getAttribute('data-state') || '');",
    "const observer = new MutationObserver((records) => {",
    "if (records.some((record) => record.attributeName === 'data-state')) report();",
    "});",
    "observer.observe(zone, { attributes: true, attributeFilter: ['data-state'] });",
    "window.__phase300UploadObserver = observer;",
    "report();",
    "return true;",
    "})()",
  ].join("\n"));
}

async function installImageDiagnostics(client) {
  await evaluate(client, [
    "(() => {",
    "const events = window.__phase300ImageDiagnostics = [];",
    "window.__phase300SelectedFiles = [];",
    "document.addEventListener('change', (event) => {",
    "const file = event.target?.type === 'file' ? event.target.files?.[0] : null;",
    "if (!file) return;",
    "const metadata = { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified };",
    "window.__phase300SelectedFiles.push(metadata);",
    "file.slice(0, 32).arrayBuffer().then((bytes) => events.push({ stage: 'selected-file-prefix', status: 'ok', bytes: bytes.byteLength })).catch((error) => events.push({ stage: 'selected-file-prefix', status: 'error', message: String(error?.message || error) }));",
    "}, true);",
    "for (const method of ['readAsArrayBuffer', 'readAsDataURL']) {",
    "const original = FileReader.prototype[method];",
    "if (!original) continue;",
    "FileReader.prototype[method] = function(blob) {",
    "const reader = this;",
    "const stage = method;",
    "reader.addEventListener('load', () => events.push({ stage, status: 'ok', resultType: typeof reader.result, resultLength: reader.result?.byteLength || reader.result?.length || null }), { once: true });",
    "reader.addEventListener('error', () => events.push({ stage, status: 'error', message: reader.error?.message || 'FileReader error' }), { once: true });",
    "try { return original.apply(reader, arguments); } catch (error) { events.push({ stage, status: 'throw', message: String(error?.message || error) }); throw error; }",
    "};",
    "}",
    "if (typeof window.createImageBitmap === 'function') {",
    "const original = window.createImageBitmap.bind(window);",
    "window.createImageBitmap = (...args) => original(...args).then((image) => { events.push({ stage: 'createImageBitmap', status: 'ok', width: image.width, height: image.height }); return image; }, (error) => { events.push({ stage: 'createImageBitmap', status: 'error', message: String(error?.message || error) }); throw error; });",
    "}",
    "if (typeof HTMLImageElement !== 'undefined' && typeof HTMLImageElement.prototype.decode === 'function') {",
    "const original = HTMLImageElement.prototype.decode;",
    "HTMLImageElement.prototype.decode = function() { const image = this; return original.apply(image, arguments).then(() => { events.push({ stage: 'image.decode', status: 'ok', width: image.naturalWidth, height: image.naturalHeight }); }, (error) => { events.push({ stage: 'image.decode', status: 'error', message: String(error?.message || error) }); throw error; }); };",
    "}",
    "return true;",
    "})()",
  ].join("\n"));
}

async function setFileInput(client, filePath) {
  const document = await client.send("DOM.getDocument", { depth: 2, pierce: true });
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector: "input[type=file]",
  });
  if (!nodeId) throw new Error("Create route file input was not found.");
  await client.send("DOM.setFileInputFiles", { files: [filePath], nodeId });
}

async function waitForUploadState(client, state, timeoutMs = 30000) {
  return client.waitEvent(
    "Runtime.bindingCalled",
    (params) => params.name === "phase300UploadState" && params.payload === state,
    timeoutMs,
  );
}

async function attemptEditorFileUpload(client, filePath) {
  await navigate(client, baseUrl + "/editor");
  await setLocale(client, "en");
  await clickExpression(client, "document.querySelector('button[aria-label=\"Screenshot\"]')");
  await waitForValue(client, "!!document.querySelector('#editor-screenshot-file')", Boolean, "Editor screenshot input");
  await installUploadStateObserver(client);
  await installImageDiagnostics(client);
  const processingEvent = waitForUploadState(client, "processing", 30000);
  await setFileInput(client, filePath);
  await processingEvent;
  const state = await waitForValue(
    client,
    "document.querySelector('#editor-screenshot-file')?.closest('[data-state]')?.getAttribute('data-state') || null",
    (value) => value === "success" || value === "error",
    "Editor upload result",
    45000,
  );
  const diagnostics = await evaluate(client, "({ files: window.__phase300SelectedFiles || [], events: window.__phase300ImageDiagnostics || [] })");
  const message = await evaluate(client, "document.querySelector('[role=alert]')?.innerText?.trim() || ''");
  if (state === "success") {
    await delay(700);
    report.upload.screenshots.editorComparison = (await capture(client, path.join(qaRoot, "editor-upload-local-selection.png"))).file;
  }
  return { state, diagnostics, message };
}

async function uploadThroughCreateFile(client, filePath) {
  await navigate(client, baseUrl + "/create");
  await setLocale(client, "en");
  await installUploadStateObserver(client);
  await installImageDiagnostics(client);
  const processingEvent = waitForUploadState(client, "processing", 30000);
  await setFileInput(client, filePath);
  const event = await processingEvent;
  const processingNow = await evaluate(client, "document.querySelector('input[type=file]')?.closest('[data-state]')?.getAttribute('data-state') || null");
  const state = await waitForValue(
    client,
    "document.querySelector('input[type=file]')?.closest('[data-state]')?.getAttribute('data-state') || null",
    (value) => value === "success" || value === "error",
    "Create local-file upload result",
    45000,
  );
  const diagnostics = await evaluate(client, "({ files: window.__phase300SelectedFiles || [], events: window.__phase300ImageDiagnostics || [] })");
  const message = await evaluate(client, "document.querySelector('[role=alert]')?.innerText?.trim() || ''");
  return { state, processingCaptured: processingNow === "processing", processingContextId: event?.executionContextId ?? null, diagnostics, message };
}

async function selectRatioInEditor(client, ratio) {
  const current = await evaluate(client, "document.querySelector('[data-editor-ratio-trigger]')?.getAttribute('data-ratio-value') || null");
  if (current === ratio) return;
  await clickExpression(client, "document.querySelector('[data-editor-ratio-trigger]')");
  const optionSelector = "[role=\"menuitemradio\"][data-ratio-value=" + JSON.stringify(ratio) + "]";
  await waitForValue(client, "!!document.querySelector(" + JSON.stringify(optionSelector) + ")", Boolean, "ratio option " + ratio);
  await clickExpression(client, "document.querySelector(" + JSON.stringify(optionSelector) + ")");
  await waitForValue(
    client,
    "document.querySelector('[data-editor-ratio-trigger]')?.getAttribute('data-ratio-value') || null",
    (value) => value === ratio,
    "editor ratio " + ratio,
  );
}

async function openExportFromEditor(client, label = "Export") {
  await clickButtonText(client, label);
  await waitForPath(client, "/export");
  await waitForValue(
    client,
    "!!Array.from(document.querySelectorAll('article[data-card-render-scope]')).find((card) => { const r = card.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0; })",
    Boolean,
    "visible export card",
    45000,
  );
}

async function measureRenderedCard(client) {
  return evaluate(client, [
    "(() => {",
    "const cards = Array.from(document.querySelectorAll('article[data-card-render-scope]'));",
    "const visible = cards.map((card) => ({ card, rect: card.getBoundingClientRect(), style: getComputedStyle(card) }))",
    ".filter(({ rect, style }) => style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0)",
    ".sort((left, right) => right.rect.width * right.rect.height - left.rect.width * left.rect.height);",
    "const item = visible[0];",
    "if (!item) return null;",
    "return {",
    "ratio: item.card.getAttribute('data-ratio'), width: item.rect.width, height: item.rect.height,",
    "ratioFromBox: item.rect.width / item.rect.height, left: item.rect.left, top: item.rect.top,",
    "box: item.style.aspectRatio,",
    "};",
    "})()",
  ].join("\n"));
}

function ratioValue(ratio) {
  const parts = ratio.split(":").map(Number);
  return parts[0] / parts[1];
}

function assertAspect(measurement, ratio, context) {
  assert.ok(measurement, context + ": no visible card");
  assert.equal(measurement.ratio, ratio, context + ": renderer ratio attribute");
  assert.ok(
    Math.abs(measurement.ratioFromBox - ratioValue(ratio)) < 0.015,
    context + ": card geometry " + measurement.ratioFromBox + " does not match " + ratio,
  );
}

function readPngDimensions(bytes) {
  assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", "PNG signature");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR", "PNG IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readWebpDimensions(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", "WebP RIFF header");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP", "WebP signature");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: readUInt24LE(bytes, data + 4) + 1,
        height: readUInt24LE(bytes, data + 7) + 1,
      };
    }
    if (chunkType === "VP8 " && chunkSize >= 10) {
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && bytes[data] === 0x2f) {
      const b0 = bytes[data + 1];
      const b1 = bytes[data + 2];
      const b2 = bytes[data + 3];
      const b3 = bytes[data + 4];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    offset = data + chunkSize + (chunkSize % 2);
  }
  throw new Error("No supported VP8/VP8L/VP8X image chunk was found.");
}

function parseUiDimensions(value) {
  const numbers = String(value ?? "").match(/\d[\d,]*/g)?.map((part) => Number(part.replaceAll(",", ""))) ?? [];
  if (numbers.length < 2) throw new Error("Could not read the export dimensions from " + JSON.stringify(value));
  return { width: numbers[0], height: numbers[1] };
}

async function recaptureCanonicalEntryExport(client, browser, directory) {
  await setViewport(client, desktop);
  await navigate(client, baseUrl + "/create");
  await waitForValue(client, "!!document.querySelector('input[type=file]')", Boolean, "Create route for Korean screenshots");
  const desktopShot = await capture(client, path.join(qaRoot, "create-entry-desktop.png"));
  Object.assign(desktopShot, { state: "idle", viewport: "1440x900", locale: "ko" });

  await setViewport(client, mobile);
  await waitForApplication(client);
  const mobileShot = await capture(client, path.join(qaRoot, "create-entry-mobile.png"));
  Object.assign(mobileShot, { state: "idle", viewport: "390x844", locale: "ko" });

  await setViewport(client, desktop);
  await waitForApplication(client);
  const localeBeforeStart = await evaluate(client, "document.documentElement.lang");
  assert.equal(localeBeforeStart, "ko", "Create screenshots and sample action should use Korean copy");
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((button) => button.innerText.trim().includes('예시로 시작하기'))");
  await waitForPath(client, "/editor");
  await waitForApplication(client);
  const canonicalEditorCard = await evaluate(client, [
    "(() => {",
    "const card = Array.from(document.querySelectorAll('article[data-card-render-scope]')).find((item) => item.getAttribute('data-ratio') === '4:5');",
    "return { name: card?.getAttribute('aria-label') || null, ratio: card?.getAttribute('data-ratio') || null, lang: document.documentElement.lang };",
    "})()",
  ].join("\n"));
  assert.ok(canonicalEditorCard.name?.startsWith("Coner,"), "Create sample CTA should enter Editor with Coner");
  const editorFrame = await capture(client, path.join(qaRoot, "editor-export-transition", "01-editor-before-export.png"));
  const transitionStartedAt = Date.now();
  await openExportFromEditor(client, "내보내기");
  const entryFrame = await capture(client, path.join(qaRoot, "editor-export-transition", "02-export-entry.png"));
  await delay(120);
  const revealFrame = await capture(client, path.join(qaRoot, "editor-export-transition", "03-export-reveal.png"));
  await delay(520);
  await waitForApplication(client);
  const exportLocale = await evaluate(client, "document.documentElement.lang");
  assert.equal(exportLocale, "ko", "Export success proof should retain Korean copy before the click");
  const exportFrame = await capture(client, path.join(qaRoot, "18-editor-to-export.png"));
  const card = await measureRenderedCard(client);
  assertAspect(card, "4:5", "canonical Korean Editor-to-Export card");
  const png = await captureDownload(client, browser, "png", directory, {
    ratio: "4:5",
    characterName: "Coner",
  });
  assert.ok(png.successStatus.includes("카드 이미지 다운로드를 시작했어요"), "19 should show Korean success text");
  const successShot = await capture(client, path.join(qaRoot, "19-export-success.png"));
  Object.assign(successShot, { state: "PNG download succeeded", locale: "ko", status: png.successStatus, viewport: "1440x900" });

  const recapture = {
    schema: "phase300-entry-export-visual-recapture-v1",
    capturedAt: new Date().toISOString(),
    browser: report.browser,
    buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null),
    locale: "ko",
    create: {
      sampleAction: "Create -> Editor",
      screenshot: desktopShot.file,
      mobileScreenshot: mobileShot.file,
      sampleCard: canonicalEditorCard,
    },
    editorToExport: {
      path: "/export",
      elapsedMs: Date.now() - transitionStartedAt,
      elapsedMetric: "Total probe wall time, including route navigation, settling, and screenshot capture; not isolated navigation or animation latency.",
      frames: [editorFrame.file, entryFrame.file, revealFrame.file, exportFrame.file],
    },
    successScreenshot: { file: successShot.file, locale: "ko", status: png.successStatus },
    pngDownload: png,
  };
  const recapturePath = path.join(qaRoot, "entry-export-visual-recapture-report.json");
  await writeFile(recapturePath, JSON.stringify(recapture, null, 2) + "\n");

  const fullReportPath = path.join(qaRoot, "entry-export-functional-report.json");
  const fullReport = JSON.parse(await readFile(fullReportPath, "utf8"));
  if (!fullReport.functionalRunBuildId) fullReport.functionalRunBuildId = fullReport.application.productionBuildId ?? fullReport.runId;
  const priorVisualBuildIds = fullReport.visualRecaptureBuildIds ?? [];
  const priorVisualBuildId = fullReport.visualRecapture?.buildId;
  const mergeScreenshot = (entry, extra = {}) => {
    const name = path.basename(entry.file.replaceAll("\\", "/"));
    let existing = fullReport.screenshots.find((item) => path.basename(String(item.file).replaceAll("\\", "/")) === name);
    if (!existing) {
      existing = {};
      fullReport.screenshots.push(existing);
    }
    Object.assign(existing, entry, extra);
  };
  mergeScreenshot(desktopShot, { locale: "ko" });
  mergeScreenshot(mobileShot, { locale: "ko" });
  mergeScreenshot(editorFrame);
  mergeScreenshot(entryFrame);
  mergeScreenshot(revealFrame);
  mergeScreenshot(exportFrame, { locale: "ko" });
  mergeScreenshot(successShot, { locale: "ko" });
  fullReport.visualRecaptureBuildIds = [...new Set([...priorVisualBuildIds, priorVisualBuildId, recapture.buildId].filter(Boolean))];
  fullReport.application.productionBuildId = recapture.buildId;
  fullReport.editorToExport = { ...fullReport.editorToExport, ...recapture.editorToExport, locale: "ko" };
  fullReport.visualRecapture = recapture;
  fullReport.provenanceNote = "The full upload/draft/export/print functional run is identified by functionalRunBuildId. Later visual recaptures update Create and Editor-to-Export screenshots/download proof; intervening application changes were presentation CSS and marketing-only. Do not interpret the recapture wall time as isolated navigation or animation latency.";
  const pngIndex = fullReport.downloads.findIndex((item) => item.format === "png");
  if (pngIndex >= 0) fullReport.downloads[pngIndex] = png;
  await writeFile(fullReportPath, JSON.stringify(fullReport, null, 2) + "\n");
  console.log(JSON.stringify({
    recaptureReport: path.relative(root, recapturePath),
    locale: recapture.locale,
    createScreenshots: [desktopShot.file, mobileShot.file],
    exportScreenshots: [exportFrame.file, successShot.file],
    png: { file: png.file, dimensions: png.dimensions, bytes: png.bytes },
  }, null, 2));
}

async function recaptureCreateOnlyEntry(client) {
  const assertViewport = async (expected, label) => {
    const actual = await evaluate(client, "({ width: innerWidth, height: innerHeight, visibility: document.visibilityState, focus: document.hasFocus() })");
    assert.equal(actual.width, expected.width, label + " viewport width");
    assert.equal(actual.height, expected.height, label + " viewport height");
    assert.equal(actual.visibility, "visible", label + " page visibility");
    assert.equal(actual.focus, true, label + " page focus");
    return actual;
  };

  await setViewport(client, desktop);
  await navigate(client, baseUrl + "/create");
  await waitForValue(client, "!!document.querySelector('input[type=file]')", Boolean, "Create route for viewport recapture");
  await setLocale(client, "ko");
  await waitForApplication(client);
  await bringPageToFront(client, "Create desktop screenshot");
  const desktopViewport = await assertViewport(desktop, "Create desktop");
  const desktopShot = await capture(client, path.join(qaRoot, "create-entry-desktop.png"));
  Object.assign(desktopShot, { state: "idle", viewport: "1440x900", locale: "ko" });

  await setViewport(client, mobile);
  await waitForApplication(client);
  await bringPageToFront(client, "Create mobile screenshot");
  const mobileViewport = await assertViewport(mobile, "Create mobile");
  const mobileLayout = await evaluate(client, [
    "(() => {",
    "const entryPanel = document.querySelector('section[aria-label=\"카드 시작 방법\"]');",
    "const previewPanel = document.querySelector('figure[aria-label=\"실제 카드 미리보기\"]');",
    "const entry = entryPanel?.getBoundingClientRect();",
    "const preview = previewPanel?.getBoundingClientRect();",
    "const sample = Array.from(document.querySelectorAll('button')).find((button) => button.innerText.trim().includes('예시로 시작하기'))?.getBoundingClientRect();",
    "const choose = Array.from(document.querySelectorAll('button')).find((button) => button.innerText.trim() === '스크린샷 선택')?.getBoundingClientRect();",
    "return { entryTop: entry?.top ?? null, previewTop: preview?.top ?? null, sampleBottom: sample?.bottom ?? null, chooseBottom: choose?.bottom ?? null, entryOrder: entryPanel ? getComputedStyle(entryPanel).order : null, previewOrder: previewPanel ? getComputedStyle(previewPanel).order : null };",
    "})()",
  ].join("\n"));
  assert.ok(mobileLayout.entryTop !== null && mobileLayout.previewTop !== null, "Create mobile entry and preview panels should exist");
  assert.ok(mobileLayout.entryTop < mobileLayout.previewTop, "Create mobile entry choices should precede the preview");
  assert.ok(mobileLayout.sampleBottom <= mobile.height, "Create mobile sample action should fit within the first viewport");
  assert.ok(mobileLayout.chooseBottom <= mobile.height, "Create mobile upload action should fit within the first viewport");
  const mobileShot = await capture(client, path.join(qaRoot, "create-entry-mobile.png"));
  Object.assign(mobileShot, { state: "idle", viewport: "390x844", locale: "ko" });

  await setViewport(client, desktop);
  await waitForApplication(client);
  await bringPageToFront(client, "Create sample handoff");
  const localeBeforeStart = await evaluate(client, "document.documentElement.lang");
  assert.equal(localeBeforeStart, "ko", "Create sample handoff should use Korean copy");
  const handoffStartedAt = Date.now();
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((button) => button.innerText.trim().includes('예시로 시작하기'))");
  await waitForPath(client, "/editor");
  await waitForApplication(client);
  const editorCard = await evaluate(client, [
    "(() => {",
    "const card = Array.from(document.querySelectorAll('article[data-card-render-scope]')).find((item) => item.getAttribute('data-ratio') === '4:5');",
    "return { name: card?.getAttribute('aria-label') || null, ratio: card?.getAttribute('data-ratio') || null, lang: document.documentElement.lang };",
    "})()",
  ].join("\n"));
  assert.ok(editorCard.name?.startsWith("Coner,"), "Create sample CTA should enter Editor with Coner");
  assert.equal(editorCard.ratio, "4:5", "Create sample handoff should preserve the sample ratio");
  assert.equal(editorCard.lang, "ko", "Create sample handoff should retain Korean locale");

  const result = {
    schema: "phase300-create-visual-recapture-v1",
    capturedAt: new Date().toISOString(),
    buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null),
    locale: "ko",
    viewports: { desktop: desktopViewport, mobile: mobileViewport },
    mobileLayout,
    createScreenshots: [desktopShot, mobileShot],
    sampleHandoff: { path: "/editor", elapsedMs: Date.now() - handoffStartedAt, card: editorCard },
  };
  const reportPath = path.join(qaRoot, "create-entry-recapture-report.json");
  await writeFile(reportPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ report: path.relative(root, reportPath), buildId: result.buildId, screenshots: result.createScreenshots, mobileLayout, sampleHandoff: result.sampleHandoff }, null, 2));
}

async function setExportFormat(client, format) {
  const selected = await evaluate(client, [
    "(() => {",
    "const button = Array.from(document.querySelectorAll('[role=group] button')).find((item) => item.innerText.trim() === " + JSON.stringify(format.toUpperCase()) + ");",
    "return button?.getAttribute('aria-pressed') === 'true';",
    "})()",
  ].join("\n"));
  if (!selected) await clickButtonText(client, format.toUpperCase());
}

async function captureDownload(client, browser, format, directory, reportEntry) {
  await setExportFormat(client, format);
  const dimensionsText = await evaluate(client, "document.querySelector('#export-dimensions strong')?.innerText || null");
  const expectedDimensions = parseUiDimensions(dimensionsText);
  const startedPromise = browser.waitEvent(
    "Browser.downloadWillBegin",
    (event) => report.isolation.browserContextId === null || !event.browserContextId || event.browserContextId === report.isolation.browserContextId,
    60000,
  );
  await clickExpression(client, "document.querySelector('button[aria-busy]')");
  const started = await startedPromise;
  const completedPromise = browser.waitEvent(
    "Browser.downloadProgress",
    (event) => event.guid === started.guid && event.state === "completed",
    120000,
  );
  const completed = await completedPromise;
  const filename = path.basename(started.suggestedFilename || started.guid + "." + format);
  const filePath = path.join(directory, filename);
  const bytes = await waitForFile(filePath);
  const actualDimensions = format === "png" ? readPngDimensions(bytes) : readWebpDimensions(bytes);
  assert.deepEqual(actualDimensions, expectedDimensions, format.toUpperCase() + " dimensions must match the UI");
  assertAspect(
    { ratio: reportEntry.ratio, ratioFromBox: actualDimensions.width / actualDimensions.height },
    reportEntry.ratio,
    format.toUpperCase() + " download",
  );
  await waitForValue(
    client,
    "document.querySelector('#export-feedback')?.getAttribute('data-feedback') || ''",
    (value) => value === "success",
    format.toUpperCase() + " completion status",
    30000,
  );
  const status = await evaluate(client, "document.querySelector('#export-feedback')?.innerText?.trim() || ''");
  const entry = {
    format,
    file: path.relative(root, filePath),
    bytes: bytes.length,
    sha256: sha256(bytes),
    dimensions: actualDimensions,
    expectedFromUi: expectedDimensions,
    suggestedFilename: started.suggestedFilename,
    downloadGuid: started.guid,
    progressState: completed.state,
    successStatus: status,
  };
  report.downloads.push(entry);
  return entry;
}

async function waitForFile(filePath, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const bytes = await readFile(filePath);
      if (bytes.length > 0) return bytes;
    } catch { /* download rename or write is not complete yet */ }
    await delay(100);
  }
  throw new Error("Downloaded file did not appear: " + filePath);
}

async function verifySavedDraftConfirmation(client) {
  await navigate(client, baseUrl + "/create");
  await setLocale(client, "en");
  await waitForValue(client, "!!document.querySelector('a[href=\"/editor\"]')", Boolean, "resume saved draft link");
  const tabOrder = await evaluate(client, [
    "(() => {",
    "const file = document.querySelector('input[type=file]');",
    "const choose = Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim() === 'Choose screenshot');",
    "return { fileInputTabIndex: file?.tabIndex ?? null, chooseButtonTabIndex: choose?.tabIndex ?? null };",
    "})()",
  ].join("\n"));
  assert.equal(tabOrder.fileInputTabIndex, -1, "the clipped file input should not add an invisible tab stop");
  assert.equal(tabOrder.chooseButtonTabIndex, 0, "the visible file picker button should remain keyboard reachable");

  const foregroundBeforeConfirm = await bringPageToFront(client, "saved-draft Create");
  await evaluate(client, "Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim().includes('Open the sample'))?.focus()");
  const triggerFocusedBeforeActivation = await evaluate(client, "document.activeElement?.innerText?.trim() || ''");
  report.savedDraftConfirmation.foregroundBeforeConfirm = foregroundBeforeConfirm;
  report.savedDraftConfirmation.triggerFocusedBeforeActivation = triggerFocusedBeforeActivation;
  assert.ok(triggerFocusedBeforeActivation.includes("Open the sample"), "keyboard focus should be on the sample trigger before Enter");
  await pressKey(client, "Enter", "Enter", 13);
  report.savedDraftConfirmation.keyboardOpenedConfirmation = await evaluate(client, "!!document.getElementById('sample-confirm-message')");
  await waitForValue(client, "!!document.getElementById('sample-confirm-message')", Boolean, "sample replacement confirmation");
  await waitForValue(
    client,
    "document.activeElement?.innerText?.trim() || ''",
    (value) => value.includes("Replace with sample"),
    "confirmation focus",
  );
  const describedBy = await evaluate(client, [
    "(() => {",
    "const button = document.activeElement;",
    "const id = button?.getAttribute('aria-describedby');",
    "return { text: button?.innerText?.trim() || '', describedBy: id, description: id ? document.getElementById(id)?.innerText?.trim() || '' : '' };",
    "})()",
  ].join("\n"));
  assert.ok(describedBy.description.length > 0, "confirmation message should be announced through aria-describedby");
  const confirmShot = await capture(client, path.join(qaRoot, "create-saved-draft-confirm.png"));

  await pressKey(client, "Tab", "Tab", 9);
  const cancelFocus = await evaluate(client, "document.activeElement?.innerText?.trim() || ''");
  assert.ok(cancelFocus.includes("Keep my saved card"), "Tab should move from confirmation to cancel");
  await pressKey(client, "Enter", "Enter", 13);
  await waitForValue(
    client,
    "document.activeElement?.innerText?.trim() || ''",
    (value) => value.includes("Open the sample"),
    "focus restoration to sample trigger",
  );
  const stored = await evaluate(client, [
    "(() => {",
    "const draft = JSON.parse(localStorage.getItem(" + JSON.stringify(editorStorageKey) + ") || 'null');",
    "return { hasDraft: Boolean(draft?.card), imageDataUrl: Boolean(draft?.card?.imageUrl?.startsWith('data:image/')), characterName: draft?.card?.character?.name || null };",
    "})()",
  ].join("\n"));
  assert.equal(stored.hasDraft, true, "cancel should preserve the saved draft");
  assert.equal(stored.imageDataUrl, true, "the uploaded screenshot should remain in the saved draft");
  await clickEditorLink(client);
  const resumedDraft = await evaluate(client, [
    "(() => {",
    "const draft = JSON.parse(localStorage.getItem(" + JSON.stringify(editorStorageKey) + ") || 'null');",
    "return { name: draft?.card?.character?.name || null, imageDataUrl: Boolean(draft?.card?.imageUrl?.startsWith('data:image/')) };",
    "})()",
  ].join("\n"));
  assert.equal(resumedDraft.imageDataUrl, true, "the resume path should preserve the uploaded screenshot");
  await navigate(client, baseUrl + "/create");
  await setLocale(client, "en");
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim().includes('Open the sample'))");
  await waitForValue(client, "!!document.getElementById('sample-confirm-message')", Boolean, "sample replacement confirmation after cancel");
  await clickButtonText(client, "Replace with sample", false);
  await waitForPath(client, "/editor");
  await waitForApplication(client);
  await delay(700);
  const canonicalDraft = await evaluate(client, [
    "(() => {",
    "const draft = JSON.parse(localStorage.getItem(" + JSON.stringify(editorStorageKey) + ") || 'null');",
    "return { name: draft?.card?.character?.name || null, jobId: draft?.card?.character?.jobId || null, imageUrl: draft?.card?.imageUrl || null, ratio: draft?.card?.design?.ratio || null };",
    "})()",
  ].join("\n"));
  assert.equal(canonicalDraft.name, "Coner", "numbered export proof should return to canonical Coner data");
  assert.equal(canonicalDraft.jobId, "red-mage");
  assert.equal(canonicalDraft.imageUrl, "/assets/samples/coner/optimized/landscape.webp");
  assert.equal(canonicalDraft.ratio, "4:5");
  report.savedDraftConfirmation = { resumeLinkVisible: true, tabOrder, foregroundBeforeConfirm, activationMethod: "keyboard-enter", triggerFocusedBeforeActivation, describedBy, cancelFocus, focusRestored: true, stored, resumedDraft, canonicalDraft, screenshot: confirmShot.file };
}

async function main() {
  await mkdir(qaRoot, { recursive: true });
  report.application.productionBuildId = await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null);
  report.functionalRunBuildId = report.application.productionBuildId;
  if (!recaptureCreateOnly) {
    await mkdir(downloadDir, { recursive: true });
    if (!recaptureFinal) await writeFile(invalidImagePath, "This is intentionally not an image.\n");
  }
  const sourceBytes = await readFile(sampleWebpPath);
  const sourcePngBytes = await readFile(samplePngPath);
  report.upload.sourceImage = {
    file: path.relative(root, sampleWebpPath),
    bytes: sourceBytes.length,
    sha256: sha256(sourceBytes),
    firstChunk: { type: sourceBytes.toString("ascii", 12, 16), bytes: sourceBytes.readUInt32LE(16), availableIn512KiBPrefix: sourceBytes.readUInt32LE(16) <= (512 * 1024 - 20) },
  };
  report.upload.pngComparisonSource = {
    file: path.relative(root, samplePngPath),
    bytes: sourcePngBytes.length,
    sha256: sha256(sourcePngBytes),
  };

  let browser;
  let page;
  let contextId;
  let browserTargetId;
  try {
    const version = await waitForBrowserVersion(debugPort);
    report.browser = { product: version.Browser, protocolVersion: version["Protocol-Version"], debugPort };
    browser = clientFor(version.webSocketDebuggerUrl);
    await browser.ready();
    let target;
    if (useDefaultContext) {
      report.isolation.browserContext = "dedicated hidden Chrome process with a fresh temporary user-data-dir";
      report.isolation.browserContextId = null;
      for (let attempt = 0; attempt < 30 && !target; attempt += 1) {
        const targets = await fetchJson("http://127.0.0.1:" + debugPort + "/json/list");
        target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
        if (!target) await delay(100);
      }
      if (!target) {
        const created = await browser.send("Target.createTarget", { url: "about:blank" });
        browserTargetId = created.targetId;
        for (let attempt = 0; attempt < 30 && !target; attempt += 1) {
          const targets = await fetchJson("http://127.0.0.1:" + debugPort + "/json/list");
          target = targets.find((item) => item.id === created.targetId);
          if (!target) await delay(100);
        }
      }
      browserTargetId = target?.id ?? null;
    } else {
      const context = await browser.send("Target.createBrowserContext", { disposeOnDetach: true });
      contextId = context.browserContextId;
      report.isolation.browserContextId = contextId;
      const created = await browser.send("Target.createTarget", { url: "about:blank", browserContextId: contextId });
      browserTargetId = created.targetId;
      report.isolation.targetId = created.targetId;
      for (let attempt = 0; attempt < 30 && !target; attempt += 1) {
        const targets = await fetchJson("http://127.0.0.1:" + debugPort + "/json/list");
        target = targets.find((item) => item.id === created.targetId);
        if (!target) await delay(100);
      }
    }
    if (!target?.webSocketDebuggerUrl) throw new Error("Dedicated isolated browser target did not appear.");
    page = clientFor(target.webSocketDebuggerUrl);
    await page.ready();
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("DOM.enable");
    await page.send("Page.setLifecycleEventsEnabled", { enabled: true });
    await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: [
        "try { localStorage.setItem(" + JSON.stringify(localeStorageKey) + ", 'ko'); } catch {}",
        "try { localStorage.setItem(" + JSON.stringify(appearanceStorageKey) + ", 'dark'); } catch {}",
      ].join("\n"),
    });
    if (!recaptureCreateOnly) {
      await browser.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadDir,
        eventsEnabled: true,
        ...(contextId ? { browserContextId: contextId } : {}),
      });
    }
    if (recaptureCreateOnly) {
      await recaptureCreateOnlyEntry(page);
      return;
    }
    if (recaptureFinal) {
      await recaptureCanonicalEntryExport(page, browser, downloadDir);
      return;
    }
    await setViewport(page, desktop);
    await navigate(page, baseUrl + "/create");
    await waitForValue(page, "!!document.querySelector('input[type=file]')", Boolean, "Create page upload input");

    const desktopShot = await capture(page, path.join(qaRoot, "create-entry-desktop.png"));
    Object.assign(desktopShot, { state: "idle", viewport: "1440x900" });
    await setViewport(page, mobile);
    await waitForApplication(page);
    const mobileShot = await capture(page, path.join(qaRoot, "create-entry-mobile.png"));
    Object.assign(mobileShot, { state: "idle", viewport: "390x844" });
    await setViewport(page, desktop);
    await waitForApplication(page);
    await setLocale(page, "en");
    await evaluate(page, "document.documentElement.style.scrollBehavior='auto'; document.querySelector('#upload-guidance')?.scrollIntoView({block:'center',behavior:'instant'}); true");
    await waitForApplication(page);

    await installUploadStateObserver(page);
    await installImageDiagnostics(page);
    const invalidErrorEvent = waitForUploadState(page, "error", 30000);
    await setFileInput(page, invalidImagePath);
    await invalidErrorEvent;
  await waitForValue(
      page,
      "document.querySelector('div[data-state]')?.getAttribute('data-state') || null",
      (value) => value === "error",
      "invalid upload error state",
    );
    const errorMessage = await evaluate(page, "document.querySelector('[role=alert]')?.innerText?.trim() || ''");
    assert.ok(errorMessage.length > 0, "invalid upload should expose a localized error");
    report.upload.stateEvents.push({ state: "error", observed: true, message: errorMessage, file: path.basename(invalidImagePath) });
    report.upload.screenshots.error = (await capture(page, path.join(qaRoot, "create-upload-error.png"))).file;

    const processingEvent = waitForUploadState(page, "processing", 30000);
    await setFileInput(page, sampleWebpPath);
    const processingParams = await processingEvent;
    const processingNow = await evaluate(page, "document.querySelector('div[data-state]')?.getAttribute('data-state') || null");
    report.upload.stateEvents.push({
      state: "processing",
      observed: true,
      capturedState: processingNow,
      observedAt: processingParams?.executionContextId ?? null,
    });
    if (processingNow === "processing") {
      report.upload.screenshots.processing = (await capture(page, path.join(qaRoot, "create-upload-processing.png"))).file;
    } else {
      report.limitations.push("The real image upload entered processing, but completed before CDP could capture that transient frame.");
    }

    let finalUploadState = await waitForValue(
      page,
      "document.querySelector('div[data-state]')?.getAttribute('data-state') || null",
      (value) => value === "success" || value === "error",
      "valid WebP upload result",
      45000,
    );
    let createUploadSource = "CDP-selected local Coner WebP";
    if (finalUploadState === "error") {
      const validImageError = await evaluate(page, "document.querySelector('[role=alert]')?.innerText?.trim() || 'No localized error text.'");
      const createDiagnostics = await evaluate(page, "({ files: window.__phase300SelectedFiles || [], events: window.__phase300ImageDiagnostics || [] })");
      report.upload.screenshots.webpError = (await capture(page, path.join(qaRoot, "create-upload-webp-error.png"))).file;
      report.upload.localFileInputAttempt = { state: "error", message: validImageError, diagnostics: createDiagnostics };
      report.upload.stateEvents.push({ state: "error", source: "local Coner WebP through Create file input", message: validImageError });

      const editorComparison = await attemptEditorFileUpload(page, sampleWebpPath);
      report.upload.editorComparison = editorComparison;
      if (editorComparison.state === "error") {
        report.upload.webpParserFinding = "A 2,076,120-byte VP8 WebP fails in both Create and Editor after the 512 KiB header read succeeds; see localFileInputAttempt and editorComparison diagnostics.";
      }

      const pngAttempt = await uploadThroughCreateFile(page, samplePngPath);
      report.upload.pngFallbackAttempt = pngAttempt;
      if (pngAttempt.state !== "success") {
        throw new Error("The local Coner PNG fallback also failed through Create: " + pngAttempt.message);
      }
      finalUploadState = "success";
      createUploadSource = "local Coner PNG fallback after shared WebP header-parser rejection";
      report.upload.stateEvents.push({ state: "processing", source: "local Coner PNG through Create file input", captured: pngAttempt.processingCaptured });
      if (pngAttempt.processingCaptured) {
        report.upload.screenshots.processing = (await capture(page, path.join(qaRoot, "create-upload-processing.png"))).file;
      }
    }
    const continueButton = await evaluate(page, [
      "Array.from(document.querySelectorAll('button')).some((button) => button.innerText.trim() === 'Continue in the editor')",
    ].join("\n"));
    assert.equal(continueButton, true, "success must offer explicit editor continuation");
    report.upload.stateEvents.push({ state: "success", observed: true, explicitContinue: continueButton, source: createUploadSource });
    report.upload.diagnostics = await evaluate(page, "({ files: window.__phase300SelectedFiles || [], events: window.__phase300ImageDiagnostics || [] })");
    report.upload.screenshots.success = (await capture(page, path.join(qaRoot, "create-upload-success.png"))).file;

    await clickButtonText(page, "Continue in the editor");
    await waitForPath(page, "/editor");
    await waitForApplication(page);
    await delay(900);
    const persistedUpload = await evaluate(page, [
      "(() => {",
      "const draft = JSON.parse(localStorage.getItem(" + JSON.stringify(editorStorageKey) + ") || 'null');",
      "return { hasDraft: Boolean(draft?.card), imageDataUrl: Boolean(draft?.card?.imageUrl?.startsWith('data:image/')), name: draft?.card?.character?.name || null };",
      "})()",
    ].join("\n"));
    assert.equal(persistedUpload.hasDraft, true, "successful upload should be saved before editor handoff");
    assert.equal(persistedUpload.imageDataUrl, true, "uploaded WebP should be stored in the editor draft");
    report.upload.persistedDraft = persistedUpload;

    await verifySavedDraftConfirmation(page);
    await waitForApplication(page);
    if (functionalOnly) {
      report.functionalOnly = true;
      const functionalReportPath = path.join(qaRoot, "entry-functional-report.json");
      await writeFile(functionalReportPath, JSON.stringify(report, null, 2) + "\n");
      console.log(JSON.stringify({
        report: path.relative(root, functionalReportPath),
        screenshots: report.screenshots.map((item) => item.file),
        uploadStates: report.upload.stateEvents.map((item) => item.state),
        focusRestored: report.savedDraftConfirmation.focusRestored,
        canonicalDraft: report.savedDraftConfirmation.canonicalDraft,
      }, null, 2));
      return;
    }
    const editorBefore = await capture(page, path.join(qaRoot, "editor-export-transition", "01-editor-before-export.png"));
    const transitionStartedAt = Date.now();
    await openExportFromEditor(page);
    const frameEntry = await capture(page, path.join(qaRoot, "editor-export-transition", "02-export-entry.png"));
    await delay(120);
    const frameReveal = await capture(page, path.join(qaRoot, "editor-export-transition", "03-export-reveal.png"));
    await delay(520);
    await waitForApplication(page);
    const exportStable = await capture(page, path.join(qaRoot, "18-editor-to-export.png"));
    report.editorToExport = {
      editorPath: "/editor",
      exportPath: await evaluate(page, "location.pathname"),
      elapsedMs: Date.now() - transitionStartedAt,
      sequence: [editorBefore.file, frameEntry.file, frameReveal.file, exportStable.file],
      firstCardName: await evaluate(page, "document.querySelector('article[data-card-render-scope]')?.getAttribute('aria-label') || null"),
    };
    assert.equal(report.editorToExport.exportPath, "/export", "editor export action should navigate to Export");

    const ratioRows = [];
    const ratios = ["4:5", "1:1", "3:4", "9:16", "16:9"];
    for (let index = 0; index < ratios.length; index += 1) {
      const ratio = ratios[index];
      if (index > 0) {
        await navigate(page, baseUrl + "/editor");
        await setLocale(page, "en");
        await selectRatioInEditor(page, ratio);
        await openExportFromEditor(page);
        await waitForApplication(page);
      }
      const screenMeasure = await measureRenderedCard(page);
      assertAspect(screenMeasure, ratio, "screen export " + ratio);

      await page.send("Emulation.setEmulatedMedia", { media: "print" });
      await waitForApplication(page);
      const printMeasure = await measureRenderedCard(page);
      assertAspect(printMeasure, ratio, "print export " + ratio);
      const printHeightInches = printMeasure.height / 96;
      assert.ok(printHeightInches <= 9.81, "print card height should stay within 9.8in for " + ratio);
      const ratioRow = {
        ratio,
        screen: { width: round(screenMeasure.width), height: round(screenMeasure.height), ratioFromBox: round(screenMeasure.ratioFromBox) },
        print: { width: round(printMeasure.width), height: round(printMeasure.height), widthInches: round(printMeasure.width / 96), heightInches: round(printHeightInches), ratioFromBox: round(printMeasure.ratioFromBox) },
      };
      ratioRows.push(ratioRow);
      if (ratio === "9:16") {
        report.print.nineBySixteen = ratioRow;
        report.print.screenshot = (await capture(page, path.join(qaRoot, "export-9x16-print-layout.png"))).file;
        const pdf = await page.send("Page.printToPDF", {
          printBackground: true,
          paperWidth: 8.5,
          paperHeight: 11,
          marginTop: 0.25,
          marginBottom: 0.25,
          marginLeft: 0.25,
          marginRight: 0.25,
          preferCSSPageSize: true,
        });
        const pdfBytes = Buffer.from(pdf.data, "base64");
        const pdfPath = path.join(downloadDir, "Coner-9x16-print.pdf");
        await writeFile(pdfPath, pdfBytes);
        report.print.pdf = { file: path.relative(root, pdfPath), bytes: pdfBytes.length, sha256: sha256(pdfBytes) };
      }
      await page.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [
          { name: "prefers-color-scheme", value: "dark" },
          { name: "prefers-reduced-motion", value: "no-preference" },
        ],
      });
      if (ratio === "4:5") {
        const png = await captureDownload(page, browser, "png", downloadDir, ratioRow);
        const successShot = await capture(page, path.join(qaRoot, "19-export-success.png"));
        Object.assign(successShot, { state: "PNG download succeeded", status: png.successStatus, viewport: "1440x900" });
        await captureDownload(page, browser, "webp", downloadDir, ratioRow);
      }
    }

    report.ratios = ratioRows;
    report.print.ratioCheckPassed = ratioRows.length === 5 && ratioRows.every((item) => {
      return Math.abs(item.screen.ratioFromBox - ratioValue(item.ratio)) < 0.015 &&
        Math.abs(item.print.ratioFromBox - ratioValue(item.ratio)) < 0.015 &&
        item.print.heightInches <= 9.81;
    });
    assert.equal(report.print.ratioCheckPassed, true, "all five screen/print card formats should preserve ratio and print height");
    assert.equal(report.downloads.length, 2, "PNG and WebP downloads should both be captured");

    const reportPath = path.join(qaRoot, "entry-export-functional-report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({
      report: path.relative(root, reportPath),
      browser: report.browser,
      screenshots: report.screenshots.map((item) => item.file),
      uploadStates: report.upload.stateEvents.map((item) => item.state),
      ratioFormats: report.ratios.map((item) => item.ratio),
      downloads: report.downloads.map((item) => ({ format: item.format, file: item.file, dimensions: item.dimensions, bytes: item.bytes })),
      isolatedContext: report.isolation.browserContextId,
    }, null, 2));
  } catch (error) {
    report.failure = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null };
    const failurePath = path.join(qaRoot, "entry-export-functional-failure.json");
    await writeFile(failurePath, JSON.stringify(report, null, 2) + "\n");
    throw error;
  } finally {
    page?.close();
    if (browser && contextId) {
      await browser.send("Target.disposeBrowserContext", { browserContextId: contextId }).catch(() => undefined);
    }
    if (browser && useDefaultContext && browserTargetId) {
      await browser.send("Target.closeTarget", { targetId: browserTargetId }).catch(() => undefined);
      await browser.send("Browser.close").catch(() => undefined);
    }
    browser?.close();
  }
}

await main();

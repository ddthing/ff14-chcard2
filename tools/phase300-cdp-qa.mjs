import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = getArg("--stage", "before");
const out = path.join(root, "docs", "qa", "phase300", stage === "before" ? "baseline" : "after");
const baseUrl = getArg("--base-url", "http://localhost:3317").replace(/\/$/, "");
const port = Number(getArg("--debug-port", "9322"));
const trials = Math.max(3, Number(getArg("--trials", "3")));
const skipScreenshots = process.argv.includes("--skip-screenshots");
const visualOnly = process.argv.includes("--visual-only");
const exportOnly = process.argv.includes("--export-only");
const exportFixtureId = "builtin-coner-cinematic-4:5";
const exportDraftStorageKeys = [
  "ff14-adventurer-card:draft:v3",
  "ff14-adventurer-card:draft:v2",
  "ff14-adventurer-card:draft:v1",
  "ff14-adventurer-card:draft:recovery",
];
let activeClient;
let expectedViewport = null;
let foregroundAssertionCount = 0;
await mkdir(out, { recursive: true });

const routes = [{ id: "home", path: "/" }, { id: "templates", path: "/templates" }, { id: "export", path: "/export" }];
const sizes = [
  { id: "390x844", width: 390, height: 844, mobile: true },
  { id: "768x1024", width: 768, height: 1024, mobile: true },
  { id: "1280x800", width: 1280, height: 800, mobile: false },
  { id: "1440x900", width: 1440, height: 900, mobile: false },
  { id: "1920x1080", width: 1920, height: 1080, mobile: false },
];
const themes = ["dark", "light"];
const locales = ["ko", "en", "ja"];
const screenshots = new Map([
  ["home|1440x900|dark|ko", "before-01-home-dark-desktop.png"],
  ["home|1440x900|light|ko", "before-02-home-light-desktop.png"],
  ["home|390x844|dark|ko", "before-03-home-mobile-dark.png"],
  ["home|390x844|light|ko", "before-04-home-mobile-light.png"],
  ["templates|1440x900|dark|ko", "before-10-templates-dark.png"],
  ["templates|1440x900|light|ko", "before-11-templates-light.png"],
  ["templates|390x844|dark|ko", "before-12-templates-mobile.png"],
  ["export|1440x900|dark|ko", "before-15-export-dark.png"],
  ["export|1440x900|light|ko", "before-16-export-light.png"],
  ["export|390x844|dark|ko", "before-17-export-mobile.png"],
  ["home|1440x900|dark|en", "before-home-en.png"],
  ["home|1440x900|dark|ja", "before-home-ja.png"],
]);

function getArg(name, fallback) {
  const entry = process.argv.find((arg) => arg.startsWith(name + "="));
  return entry ? entry.slice(name.length + 1) : fallback;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function quantile(values, pct) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * pct;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return round(low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low));
}

function summary(values) {
  return { n: values.filter(Number.isFinite).length, p50: quantile(values, 0.5), p95: quantile(values, 0.95) };
}

function clientFor(url) {
  const socket = new WebSocket(url);
  let id = 0;
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
      if (message.error) request.reject(new Error(message.error.message));
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
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("CDP request timed out: " + method));
        }, 30000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    waitEvent(method, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        const set = listeners.get(method) ?? new Set();
        const listener = (params) => {
          set.delete(listener);
          clearTimeout(timer);
          resolve(params);
        };
        set.add(listener);
        listeners.set(method, set);
        const timer = setTimeout(() => {
          set.delete(listener);
          reject(new Error("CDP event timed out: " + method));
        }, timeoutMs);
      });
    },
    close: () => socket.close(),
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
  await evaluate(client, "new Promise((resolve) => (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  await client.send("Page.bringToFront");
  const focusState = await evaluate(client, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve({ visibility: document.visibilityState, hasFocus: document.hasFocus(), width: innerWidth, height: innerHeight }))))");
  if (focusState.visibility !== "visible" || !focusState.hasFocus) {
    throw new Error("CDP target is not foreground after navigation: " + JSON.stringify({ url, focusState }));
  }
  if (expectedViewport && (Math.abs(focusState.width - expectedViewport.width) > 1 || Math.abs(focusState.height - expectedViewport.height) > 1)) {
    throw new Error("CDP viewport drifted from requested cohort: " + JSON.stringify({ url, expectedViewport, actualViewport: { width: focusState.width, height: focusState.height } }));
  }
  foregroundAssertionCount += 1;
}

async function setState(client, size, theme, locale) {
  expectedViewport = { width: size.width, height: size.height };
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile,
  });
  await client.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
  const code = "(() => { localStorage.setItem(" +
    JSON.stringify("ff14-adventurer-card:locale") + ", " + JSON.stringify(locale) + "); localStorage.setItem(" +
    JSON.stringify("ff14-adventurer-card:appearance") + ", " + JSON.stringify(theme) + "); return true; })()";
  await evaluate(client, code);
}

async function resetIsolatedExportDraft(client) {
  return evaluate(client, "(() => {const keys=" + JSON.stringify(exportDraftStorageKeys) + ";const hadDraft=keys.some((key)=>localStorage.getItem(key)!==null);for(const key of keys)localStorage.removeItem(key);return{clearedKeys:keys,hadDraft}})()");
}

function assertBuiltInExportFixture(row, stage, viewport, theme, sample) {
  const fixture = row.exportFixture;
  if (!fixture || fixture.name !== "Coner" || fixture.template !== "cinematic" || fixture.ratio !== "4:5") {
    throw new Error("Export performance fixture drifted: " + JSON.stringify({ stage, viewport: viewport.id, theme, sample, expected: exportFixtureId, actual: fixture }));
  }
}

async function evidence(client) {
  const row = await evaluate(client, [
    "(() => {",
    "const nav = performance.getEntriesByType('navigation')[0];",
    "const qa = window.__phase300Qa || {};",
    "const lcp = (qa.lcp || []).at(-1) || null;",
    "const cls = (qa.shifts || []).reduce((sum, item) => sum + item.value, 0);",
    "const headings = [...document.querySelectorAll('h1,h2')].slice(0, 8).map((node) => node.innerText.trim());",
    "const heading = document.querySelector('h1');",
    "const rect = heading && heading.getBoundingClientRect();",
    "const overflows = [...document.querySelectorAll('h1,h2,p,a,button')].filter((node) => node.getBoundingClientRect().width > 0 && node.scrollWidth > node.clientWidth + 2).slice(0, 12).map((node) => (node.innerText || node.getAttribute('aria-label') || node.tagName).trim().slice(0, 80));",
    "const resources = performance.getEntriesByType('resource');",
    "const exportArticle = [...document.querySelectorAll('article[data-template]')].find((card) => { const r=card.getBoundingClientRect(); return r.width>0 && r.height>0 && r.right>0 && r.left<innerWidth && r.bottom>0 && r.top<innerHeight; });",
    "const exportFixture = location.pathname==='/export' ? { name:document.querySelector('#export-settings-title')?.innerText.trim()??null, summary:document.querySelector('#export-settings-title')?.nextElementSibling?.innerText.trim()??null, template:exportArticle?.getAttribute('data-template')??null, ratio:exportArticle?.getAttribute('data-ratio')??null, masterId:exportArticle?.getAttribute('data-master-id')??null, imageUrl:exportArticle?.querySelector('img')?.getAttribute('src')??null } : null;",
    "return {",
    "url: location.pathname, title: document.title, htmlLang: document.documentElement.lang,",
    "themePreference: document.documentElement.getAttribute('data-app-appearance'),",
    "resolvedTheme: document.documentElement.getAttribute('data-app-theme'),",
    "viewport: { width: innerWidth, height: innerHeight }, pageVisibility: document.visibilityState, pageHasFocus: document.hasFocus(), scrollWidth: document.documentElement.scrollWidth,",
    "scrollHeight: document.documentElement.scrollHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,",
    "firstHeadings: headings, h1: heading ? heading.innerText.trim() : null,",
    "h1Box: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,",
    "overflowingTextNodes: overflows, marketingCards: document.querySelectorAll('[data-marketing-card]').length,",
    "navigation: nav ? { responseStartMs: nav.responseStart - nav.startTime, domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime, loadMs: nav.loadEventEnd - nav.startTime, transferSize: nav.transferSize, encodedBodySize: nav.encodedBodySize } : null,",
    "lcpMs: lcp ? lcp.startTime : null, lcpSize: lcp ? lcp.size : null, cls,",
    "events: qa.events || [], longAnimationFrames: (qa.longAnimationFrames || []).length,",
    "resourceCount: resources.length, resourceTransferBytes: resources.reduce((sum, item) => sum + (item.transferSize || 0), 0)",
    ", exportFixture",
    "};",
    "})()",
  ].join("\n"));
  if (row.pageVisibility !== "visible" || !row.pageHasFocus) {
    throw new Error("Load evidence came from a hidden or unfocused page: " + JSON.stringify({ url: row.url, pageVisibility: row.pageVisibility, pageHasFocus: row.pageHasFocus }));
  }
  if (expectedViewport && (Math.abs(row.viewport.width - expectedViewport.width) > 1 || Math.abs(row.viewport.height - expectedViewport.height) > 1)) {
    throw new Error("Measurement viewport did not match the requested cohort: " + JSON.stringify({ url: row.url, expectedViewport, actualViewport: row.viewport }));
  }
  return row;
}

async function capture(client, file) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(result.data, "base64");
  await writeFile(file, bytes);
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function outputScreenshotName(name) {
  return stage === "before" ? name : name.replace(/^before-/, "");
}

async function settle(client, delay = 1500) {
  const expression = [
    "(async () => {",
    "const started = performance.now();",
    "await (document.fonts?.ready ?? Promise.resolve());",
    "const rectVisible = (rect) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;",
    "const visibleImages = [...document.images].filter((image) => rectVisible(image.getBoundingClientRect()));",
    "const decodeVisible = visibleImages.map((image) => image.decode ? image.decode().catch(() => {}) : Promise.resolve());",
    "const bgUrls = new Set();",
    "for (const element of document.querySelectorAll('main, section, [class*=hero], [class*=backdrop]')) {",
    "if (!rectVisible(element.getBoundingClientRect())) continue;",
    "const background = getComputedStyle(element).backgroundImage;",
    "for (const match of background.matchAll(/url\\([\\\"']?([^\\\"')]+)[\\\"']?\\)/g)) {",
    "try { const url = new URL(match[1], document.baseURI); if (url.origin === location.origin) bgUrls.add(url.href); } catch {}",
    "}",
    "}",
    "const decodeBackground = [...bgUrls].map((url) => new Promise((resolve) => { const image = new Image(); image.onload = image.onerror = resolve; image.src = url; if (image.complete) resolve(); setTimeout(resolve, 3000); }));",
    "await Promise.race([Promise.all([...decodeVisible, ...decodeBackground]), new Promise((resolve) => setTimeout(resolve, 3000))]);",
    "const remaining = Math.max(0, " + delay + " - (performance.now() - started));",
    "await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, remaining))));",
    "return { visibleImageCount: visibleImages.length, backgroundImageCount: bgUrls.size };",
    "})()",
  ].join("\n");
  return evaluate(client, expression);
}

async function main() {
  const versionResponse = await fetch("http://127.0.0.1:" + port + "/json/version");
  if (!versionResponse.ok) throw new Error("Chrome DevTools endpoint not ready on port " + port);
  const pageResponse = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" });
  if (!pageResponse.ok) throw new Error("Could not create a dedicated CDP page: " + pageResponse.status);
  const target = await pageResponse.json();
  const client = clientFor(target.webSocketDebuggerUrl);
  activeClient = client;
  await client.ready();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("DOM.enable");
  await client.send("Page.setLifecycleEventsEnabled", { enabled: true });
  const instrumentation = [
    "(() => {",
    "const state = { lcp: [], shifts: [], events: [], longAnimationFrames: [] };",
    "Object.defineProperty(window, '__phase300Qa', { configurable: false, value: state });",
    "const observe = (type, options, receive) => { try { const observer = new PerformanceObserver((list) => receive(list.getEntries())); observer.observe({ type, buffered: true, ...(options || {}) }); } catch {} };",
    "observe('largest-contentful-paint', null, (entries) => { for (const entry of entries) state.lcp.push({ startTime: entry.startTime, size: entry.size || null }); });",
    "observe('layout-shift', null, (entries) => { for (const entry of entries) if (!entry.hadRecentInput) state.shifts.push({ value: entry.value, startTime: entry.startTime }); });",
    "observe('event', { durationThreshold: 16 }, (entries) => { for (const entry of entries) state.events.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId || 0 }); });",
    "observe('long-animation-frame', null, (entries) => { for (const entry of entries) state.longAnimationFrames.push({ duration: entry.duration, startTime: entry.startTime }); });",
    "})()",
  ].join("\n");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: instrumentation });
  await client.send("Page.bringToFront");
  await navigate(client, baseUrl + "/");

  const localeRows = [];
  const screenshotRows = [];
  const screenshotDone = new Set();
  const performanceRows = [];

  // Locale smoke checks: Home, Templates and Export in KO, EN and JA at 1440x900.
  const desktop = sizes.find((item) => item.id === "1440x900");
  if (!exportOnly) {
    for (const route of routes) for (const locale of locales) {
      await setState(client, desktop, "dark", locale);
      if (route.id === "export") await resetIsolatedExportDraft(client);
      await navigate(client, baseUrl + route.path);
      await settle(client, 1500);
      const row = await evidence(client);
      if (route.id === "export") assertBuiltInExportFixture(row, stage, desktop, "dark", "locale-" + locale);
      localeRows.push({ route: route.id, locale, ...row });
      const key = [route.id, desktop.id, "dark", locale].join("|");
      const earlyName = screenshots.get(key);
      if (!skipScreenshots && stage === "before" && route.id === "home" && locale === "ko" && earlyName) {
        const outputName = outputScreenshotName(earlyName);
        const captureInfo = await capture(client, path.join(out, outputName));
        screenshotRows.push({ file: outputName, route: route.id, viewport: desktop.id, theme: "dark", locale, ...captureInfo, evidence: row });
        screenshotDone.add(earlyName);
        console.log("Captured " + outputName);
      }
    }
  }

  // Baseline visuals at the requested desktop and mobile sizes, both themes.
  const captureScenarios = exportOnly ? [
    ["export", "1440x900", "dark", "ko"],
    ["export", "1440x900", "light", "ko"],
    ["export", "390x844", "dark", "ko"],
  ] : [
    ["home", "1440x900", "light", "ko"],
    ["templates", "1440x900", "dark", "ko"],
    ["export", "1440x900", "dark", "ko"],
    ["home", "1440x900", "dark", "ko"],
    ["home", "1440x900", "light", "ko"],
    ["home", "390x844", "dark", "ko"], ["home", "390x844", "light", "ko"],
    ["templates", "1440x900", "dark", "ko"], ["templates", "1440x900", "light", "ko"],
    ["templates", "390x844", "dark", "ko"],
    ["export", "1440x900", "light", "ko"],
    ["export", "390x844", "dark", "ko"],
    ["home", "1440x900", "dark", "en"], ["home", "1440x900", "dark", "ja"],
  ];
  for (const [routeId, sizeId, theme, locale] of captureScenarios) {
    if (skipScreenshots) break;
    const key = [routeId, sizeId, theme, locale].join("|");
    const name = screenshots.get(key);
    if (!name || screenshotDone.has(name)) continue;
    const route = routes.find((item) => item.id === routeId);
    const size = sizes.find((item) => item.id === sizeId);
    await setState(client, size, theme, locale);
    if (route.id === "export") await resetIsolatedExportDraft(client);
    await navigate(client, baseUrl + route.path);
    await settle(client, 1500);
    const row = await evidence(client);
    if (route.id === "export") assertBuiltInExportFixture(row, stage, size, theme, "screenshot");
    const outputName = outputScreenshotName(name);
    const captureInfo = await capture(client, path.join(out, outputName));
    screenshotRows.push({ file: outputName, route: route.id, viewport: size.id, theme, locale, ...captureInfo, evidence: row });
    screenshotDone.add(name);
    console.log("Captured " + outputName);
  }

  if (visualOnly) {
    const version = await versionResponse.json();
    const buildIdPath = stage === "before"
      ? path.join(root, "docs", "qa", "phase300", "baseline-build", ".next", "BUILD_ID")
      : path.join(root, ".next", "BUILD_ID");
    const productionBuildId = await readFile(buildIdPath, "utf8").then((value) => value.trim()).catch(() => null);
    const visualReport = {
      schema: "phase300-visual-capture-v1",
      stage,
      capturedAt: new Date().toISOString(),
      browser: { product: version.Browser, mode: "headless Chrome over local CDP", deviceScaleFactor: 1 },
      application: { baseUrl, productionBuildId, buildMode: getArg("--build-mode", "webpack") },
      protocol: {
        viewports: sizes.map(({ id, width, height, mobile }) => ({ id, width, height, mobile, deviceScaleFactor: 1 })),
        themes,
        locales,
        settleMs: 1500,
        foregroundedOnEveryNavigation: true,
        visibilityAndFocusAsserted: true,
        actualViewportAsserted: true,
        visibleImagesDecoded: true,
      },
      localeValidation: localeRows,
      screenshots: screenshotRows,
      limitations: ["This is a visual-only pass; no performance timings were recorded."],
    };
    const visualPath = path.join(out, "visual-report.json");
    await writeFile(visualPath, JSON.stringify(visualReport, null, 2) + "\n");
    console.log(JSON.stringify({
      report: path.relative(root, visualPath),
      screenshots: screenshotRows.length,
      localeChecks: localeRows.length,
      homeScreenshot: screenshotRows.find((row) => row.route === "home" && row.viewport === "1440x900" && row.theme === "dark" && row.locale === "ko")?.file ?? null,
    }, null, 2));
    client.close();
    activeClient = undefined;
    return;
  }

  // Five viewport sizes, both color themes and all three product routes. One warmup plus N measured visits.
  const progressPath = path.join(out, exportOnly ? "export-only-performance-progress.json" : "performance-progress.json");
  const completedCohorts = [];
  const measuredRoutes = exportOnly ? routes.filter((route) => route.id === "export") : routes;
  for (const route of measuredRoutes) for (const size of sizes) for (const theme of themes) {
    const cohortStart = performanceRows.length;
    for (let sample = 0; sample <= trials; sample += 1) {
      await setState(client, size, theme, "ko");
      const exportDraftReset = route.id === "export" ? await resetIsolatedExportDraft(client) : null;
      await navigate(client, baseUrl + route.path);
      await settle(client, 1500);
      const row = await evidence(client);
      if (route.id === "export") assertBuiltInExportFixture(row, stage, size, theme, sample);
      if (sample > 0) performanceRows.push({
        route: route.id, viewport: size.id, theme, locale: "ko", sample,
        ...(route.id === "export" ? { exportFixtureId, exportFixture: row.exportFixture, exportDraftReset } : {}),
        pageVisibility: row.pageVisibility, pageHasFocus: row.pageHasFocus,
        actualViewportWidth: row.viewport.width, actualViewportHeight: row.viewport.height,
        responseStartMs: row.navigation?.responseStartMs ?? null,
        domContentLoadedMs: row.navigation?.domContentLoadedMs ?? null,
        loadMs: row.navigation?.loadMs ?? null,
        lcpMs: row.lcpMs, cls: row.cls,
        resourceCount: row.resourceCount, resourceTransferBytes: row.resourceTransferBytes,
        horizontalOverflow: row.horizontalOverflow, h1: row.h1,
      });
      if (sample > 0) console.log("Measured " + route.id + " " + size.id + " " + theme + " sample " + sample);
    }
    completedCohorts.push({
      route: route.id, viewport: size.id, theme, locale: "ko",
      samples: performanceRows.length - cohortStart,
    });
    await writeFile(progressPath, JSON.stringify({
      schema: "phase300-performance-progress-v1",
      updatedAt: new Date().toISOString(),
      stage, baseUrl, trialsPerCohort: trials,
      completedCohorts, performanceSamples: performanceRows,
    }, null, 2) + "\n");
  }

  const groups = new Map();
  for (const row of performanceRows) {
    const key = [row.route, row.viewport, row.theme].join("|");
    const items = groups.get(key) ?? [];
    items.push(row);
    groups.set(key, items);
  }
  const summaries = [...groups].map(([key, items]) => {
    const [route, viewport, theme] = key.split("|");
    return {
      route, viewport, theme, locale: "ko", samples: items.length,
      responseStartMs: summary(items.map((item) => item.responseStartMs)),
      domContentLoadedMs: summary(items.map((item) => item.domContentLoadedMs)),
      loadMs: summary(items.map((item) => item.loadMs)),
      lcpMs: summary(items.map((item) => item.lcpMs)),
      cls: summary(items.map((item) => item.cls)),
      horizontalOverflowCount: items.filter((item) => item.horizontalOverflow).length,
    };
  });

  let frameReport = null;
  if (!exportOnly) {
  await setState(client, desktop, "dark", "ko");
  await navigate(client, baseUrl + "/");
  await settle(client, 1500);
  await evaluate(client, [
    "(() => { const state = window.__phase300Qa; state.frames = []; state.frameActive = true; let prior = 0;",
    "const tick = (now) => { if (!state.frameActive) return; if (prior) state.frames.push(now - prior); prior = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()",
  ].join("\n"));
  const scrollStart = await evaluate(client, "window.scrollY");
  for (let index = 0; index < 5; index += 1) {
    await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 450, deltaY: 520, deltaX: 0 });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const scrollEnd = await evaluate(client, "window.scrollY");
  await evaluate(client, "window.__phase300Qa.frameActive = false; true");
  const frameIntervals = await evaluate(client, "window.__phase300Qa.frames");
  frameReport = {
    scrollStart, scrollEnd, frames: frameIntervals.length,
    intervalMs: summary(frameIntervals),
    over16_7ms: frameIntervals.filter((value) => value > 16.7).length,
    over50ms: frameIntervals.filter((value) => value > 50).length,
    longAnimationFrames: (await evidence(client)).longAnimationFrames,
    limitation: "requestAnimationFrame intervals are a cadence proxy, not a compositor/GPU presentation trace.",
  };
  }

  if (skipScreenshots) {
    for (const [key, name] of screenshots) {
      const outputName = outputScreenshotName(name);
      const bytes = await readFile(path.join(out, outputName)).catch(() => null);
      if (!bytes) continue;
      const [route, viewport, theme, locale] = key.split("|");
      screenshotRows.push({
        file: outputName, route, viewport, theme, locale, bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }

  const version = await versionResponse.json();
  const buildIdPath = stage === "before"
    ? path.join(root, "docs", "qa", "phase300", "baseline-build", ".next", "BUILD_ID")
    : path.join(root, ".next", "BUILD_ID");
  const productionBuildId = await readFile(buildIdPath, "utf8").then((value) => value.trim()).catch(() => null);
  const report = {
    schema: "phase300-browser-baseline-v1",
    stage,
    scope: exportOnly ? "export-only fixture-matched remeasurement" : "full Home/Templates/Export suite",
    capturedAt: new Date().toISOString(),
    browser: { product: version.Browser, mode: "headless Chrome over local CDP", deviceScaleFactor: 1, cpuThrottlingRate: 1 },
    application: {
      baseUrl,
      productionBuildId,
      buildMode: getArg("--build-mode", "webpack"),
      buildCopy: stage === "before" ? "docs/qa/phase300/baseline-build" : "caller-supplied production build",
      caveat: stage === "before"
        ? "The frozen copy removes two print-media global selectors from Export CSS Module to compile; no regular screen styles were changed."
        : "No baseline-only source workaround was applied to the final production build.",
    },
    protocol: {
      measuredRoutes: exportOnly ? ["export"] : routes.map((route) => route.id),
      viewports: sizes.map(({ id, width, height, mobile }) => ({ id, width, height, mobile, deviceScaleFactor: 1 })),
      themes, locales, warmupsPerCohort: 1, trialsPerCohort: trials,
      exportFixture: exportOnly ? {
        id: exportFixtureId,
        defaultCard: "Coner / Cinematic C2 / 4:5 / portrait",
        resetKeys: exportDraftStorageKeys,
        resetMethod: "Remove only editor-persistence current/previous/legacy/recovery draft keys before every /export navigation; the app then hydrates the same built-in demoAdventurerData.",
      } : null,
      percentileMethod: "linear interpolation over sorted samples",
      settledBeforeReadMs: 1500,
      foregroundedOnEveryNavigation: true,
      visibilityAndFocusAsserted: true,
      foregroundAssertionsPassed: foregroundAssertionCount,
      actualViewportAsserted: true,
      metrics: "NavigationTiming, buffered LCP/CLS, resources, horizontal overflow and heading geometry. Visible image decodes and local hero background image loads are awaited. Scroll uses requestAnimationFrame cadence.",
    },
    localeValidation: localeRows,
    screenshots: screenshotRows,
    performanceSamples: performanceRows,
    performanceSummaries: summaries,
    scrollFrameReport: frameReport,
    limitations: [
      "Buffered LCP and CLS are local lab observations from visible, focused page loads, not field Web Vitals.",
      "No CPU or network throttling was applied; results describe this local Windows headless Chrome session.",
      "The isolated Chrome profile keeps its HTTP cache between cohorts; each cohort drops one warmup, but later cohorts may benefit from cached fonts and assets.",
      "Animation-frame cadence does not measure actual compositor presentation or GPU timing.",
      "Three repeats provide a directional before/after baseline; p95 is interpolated from a small cohort.",
    ],
  };
  const reportFile = exportOnly ? "export-only-browser-report.json" : "browser-report.json";
  await writeFile(path.join(out, reportFile), JSON.stringify(report, null, 2) + "\n");
  const csvLines = ["route,viewport,theme,locale,sample,pageVisibility,pageHasFocus,actualViewportWidth,actualViewportHeight,exportFixtureId,exportName,exportTemplate,exportRatio,exportImageUrl,responseStartMs,domContentLoadedMs,loadMs,lcpMs,cls,horizontalOverflow,resourceCount,resourceTransferBytes"];
  for (const row of performanceRows) csvLines.push([
    row.route, row.viewport, row.theme, row.locale, row.sample, row.pageVisibility, row.pageHasFocus, row.actualViewportWidth, row.actualViewportHeight,
    row.exportFixtureId ?? "", row.exportFixture?.name ?? "", row.exportFixture?.template ?? "", row.exportFixture?.ratio ?? "", row.exportFixture?.imageUrl ?? "",
    row.responseStartMs, row.domContentLoadedMs,
    row.loadMs, row.lcpMs, row.cls, row.horizontalOverflow, row.resourceCount, row.resourceTransferBytes,
  ].join(","));
  const sampleFile = exportOnly ? "export-only-performance-samples.csv" : "performance-samples.csv";
  await writeFile(path.join(out, sampleFile), csvLines.join("\n") + "\n");
  console.log(JSON.stringify({
    report: path.relative(root, path.join(out, reportFile)),
    screenshots: screenshotRows.length, performanceCohorts: summaries.length,
    performanceSamples: performanceRows.length, frameSamples: frameReport?.frames ?? 0, browser: version.Browser,
  }, null, 2));
  client.close();
  activeClient = undefined;
}

await main().catch((error) => {
  console.error(error);
  activeClient?.close();
  process.exitCode = 1;
});

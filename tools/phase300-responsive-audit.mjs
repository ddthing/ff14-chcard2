import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const matrixRoot = path.join(qaRoot, "matrix");
const baseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=").slice(1).join("=") ?? "http://localhost:3318";
const debugPort = Number(process.argv.find((arg) => arg.startsWith("--debug-port="))?.split("=")[1] ?? "9322");
const exportOnly = process.argv.includes("--export-only");
let activeClient;
await mkdir(matrixRoot, { recursive: true });
process.on("unhandledRejection", (error) => {
  console.error(error);
  activeClient?.close();
  process.exitCode = 1;
});

const routes = [{ id: "home", path: "/" }, { id: "templates", path: "/templates" }, { id: "export", path: "/export" }];
const sizes = [
  { id: "390x844", width: 390, height: 844, mobile: true },
  { id: "768x1024", width: 768, height: 1024, mobile: true },
  { id: "1280x800", width: 1280, height: 800, mobile: false },
  { id: "1440x900", width: 1440, height: 900, mobile: false },
  { id: "1920x1080", width: 1920, height: 1080, mobile: false },
];
const themes = ["dark", "light"];
const exportDraftStorageKeys = [
  "ff14-adventurer-card:draft:v3",
  "ff14-adventurer-card:draft:v2",
  "ff14-adventurer-card:draft:v1",
  "ff14-adventurer-card:draft:recovery",
];
const exportFixtureId = "builtin-coner-cinematic-4:5";

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
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("CDP timed out: " + method));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
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

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}

async function resetIsolatedExportDraft(client) {
  return evaluate(client, "(() => {const keys=" + JSON.stringify(exportDraftStorageKeys) + ";const hadDraft=keys.some((key)=>localStorage.getItem(key)!==null);for(const key of keys)localStorage.removeItem(key);return{clearedKeys:keys,hadDraft}})()");
}

async function navigate(client, url) {
  await client.send("Page.bringToFront");
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(result.errorText);
  await loaded;
  await evaluate(client, "new Promise((resolve) => (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  await client.send("Page.bringToFront");
}

async function settle(client) {
  return evaluate(client, [
    "(async () => {",
    "const start = performance.now();",
    "await (document.fonts?.ready ?? Promise.resolve());",
    "const visibleHosts = [...document.querySelectorAll('[data-marketing-card]')].filter((host) => { const r=host.getBoundingClientRect(); return r.width>0 && r.height>0 && r.right>0 && r.left<innerWidth && r.bottom>0 && r.top<innerHeight; });",
    "const mountDeadline=performance.now()+3000; while(visibleHosts.some((host)=>host.getAttribute('data-mounted')!=='true')&&performance.now()<mountDeadline) await new Promise((resolve)=>setTimeout(resolve,25));",
    "const visible = [...document.images].filter((image) => { const r=image.getBoundingClientRect(); return r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight; });",
    "await Promise.race([Promise.all(visible.map((image) => image.decode ? image.decode().catch(() => {}) : Promise.resolve())), new Promise((resolve) => setTimeout(resolve, 3000))]);",
    "const remaining = Math.max(0, 1500 - (performance.now() - start));",
    "await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, remaining))));",
    "return { visibleImages:visible.length, visibleHosts:visibleHosts.map((host)=>({template:host.getAttribute('data-marketing-card'),mounted:host.getAttribute('data-mounted'),hasArticle:!!host.querySelector('article[data-template]')})) };",
    "})()",
  ].join("\n"));
}

async function screenshot(client, file) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(result.data, "base64");
  await writeFile(file, bytes);
  return { file: path.relative(qaRoot, file).replaceAll("\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function geometry(client) {
  return evaluate(client, [
    "(() => {",
    "const ratioValues = { '1:1': 1, '4:5': 0.8, '3:4': 0.75, '9:16': 9/16, '16:9': 16/9 };",
    "const cards = [...document.querySelectorAll('article[data-template]')].map((card,index) => {",
    "const host = card.closest('[data-marketing-card]') || card.parentElement;",
    "const expectedRatio = ratioValues[card.getAttribute('data-ratio')] || null;",
    "const style = getComputedStyle(card);",
    "const clippedText = [...card.querySelectorAll('h2,p,[data-field]')].filter((el) => { const cs=getComputedStyle(el); return cs.display!=='none' && el.getBoundingClientRect().width>0 && el.scrollWidth>el.clientWidth+2; }).map((el) => ({ tag:el.tagName.toLowerCase(), field:el.getAttribute('data-field'), text:(el.innerText||'').trim().slice(0,80), scrollWidth:el.scrollWidth, clientWidth:el.clientWidth }));",
    "const ratio = card.offsetHeight ? card.offsetWidth/card.offsetHeight : null;",
    "return { index, template: card.getAttribute('data-template'), ratioName: card.getAttribute('data-ratio'), masterId: card.getAttribute('data-master-id'),",
    "layoutWidth: card.offsetWidth, layoutHeight: card.offsetHeight, hostWidth: host?.clientWidth ?? null, hostHeight: host?.clientHeight ?? null,",
    "expectedRatio, actualRatio: ratio, ratioError: expectedRatio && ratio ? Math.abs(ratio-expectedRatio)/expectedRatio : null,",
    "ratioPass: !expectedRatio || !ratio || Math.abs(ratio-expectedRatio)/expectedRatio <= 0.025,",
    "overflow: style.overflow, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth, clippedText };",
    "});",
    "const elements = [...document.querySelectorAll('h1,h2,p,a,button')].filter((el) => el.getBoundingClientRect().width>0);",
    "const textClipping = elements.filter((el) => el.scrollWidth>el.clientWidth+2).slice(0,20).map((el)=>({tag:el.tagName.toLowerCase(),text:(el.innerText||'').trim().slice(0,80),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));",
    "const exportArticle=[...document.querySelectorAll('article[data-template]')].find((card)=>{const r=card.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;});",
    "const exportFixture=location.pathname==='/export'?{name:document.querySelector('#export-settings-title')?.innerText.trim()??null,summary:document.querySelector('#export-settings-title')?.nextElementSibling?.innerText.trim()??null,template:exportArticle?.getAttribute('data-template')??null,ratio:exportArticle?.getAttribute('data-ratio')??null,imageUrl:exportArticle?.querySelector('img')?.getAttribute('src')??null}:null;",
    "return { url:location.pathname, lang:document.documentElement.lang, theme:document.documentElement.getAttribute('data-app-theme'),pageVisibility:document.visibilityState,pageHasFocus:document.hasFocus(),",
    "viewport:{width:innerWidth,height:innerHeight}, document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth},",
    "marketingCardHosts:[...document.querySelectorAll('[data-marketing-card]')].map((host)=>({template:host.getAttribute('data-marketing-card'),mounted:host.getAttribute('data-mounted'),hasArticle:!!host.querySelector('article[data-template]'),width:host.clientWidth,height:host.clientHeight})),",
    "cards, textClipping, exportFixture",
    "};",
    "})()",
  ].join("\n"));
}

function labelSvg(text, width, height = 40) {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
    '<rect width="100%" height="100%" fill="#111412"/><text x="10" y="25" fill="#d5bf94" font-family="Arial,sans-serif" font-size="15">' +
    escaped + "</text></svg>");
}

async function composeContactSheet(rows) {
  const columns = sizes.length;
  const cellWidth = 340;
  const cellHeight = 225;
  const labelHeight = 34;
  const gridRows = routes.length * themes.length;
  const composites = [];
  const thumbs = await Promise.all(rows.map(async (row) => sharp(row.bytes)
    .resize(cellWidth - 16, cellHeight - labelHeight - 12, { fit: "contain", background: "#111412" })
    .png().toBuffer()));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const x = index % columns * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    composites.push({ input: labelSvg(row.label, cellWidth, labelHeight), left: x, top: y });
    composites.push({ input: thumbs[index], left: x + 8, top: y + labelHeight + 4 });
  }
  const output = path.join(qaRoot, "30-viewport-matrix.png");
  await sharp({ create: { width: cellWidth * columns, height: cellHeight * gridRows, channels: 3, background: "#111412" } })
    .composite(composites).png().toFile(output);
  const bytes = await readFile(output);
  return { file: path.relative(qaRoot, output).replaceAll("\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const versionResponse = await fetch("http://127.0.0.1:" + debugPort + "/json/version");
if (!versionResponse.ok) throw new Error("Chrome CDP is not ready on port " + debugPort);
const pageResponse = await fetch("http://127.0.0.1:" + debugPort + "/json/new?about:blank", { method: "PUT" });
if (!pageResponse.ok) throw new Error("Could not create responsive matrix page: " + pageResponse.status);
const target = await pageResponse.json();
const client = clientFor(target.webSocketDebuggerUrl);
activeClient = client;
await client.ready();
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Page.setLifecycleEventsEnabled", { enabled: true });
await navigate(client, baseUrl);
const rows = [];
const screenshotRows = [];
if (exportOnly) {
  const existingReport = JSON.parse(await readFile(path.join(qaRoot, "responsive-visual-audit.json"), "utf8"));
  const currentBuildId = await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim());
  if (existingReport.application.buildId !== currentBuildId) throw new Error("Cannot preserve Home/Templates matrix cases from a different build.");
  const preservedRows = existingReport.cases.filter((row) => row.route !== "export");
  rows.push(...preservedRows);
  for (const row of preservedRows) {
    const imageBytes = await readFile(path.join(qaRoot, row.screenshot));
    screenshotRows.push({ label: row.route.toUpperCase() + " · " + row.theme.toUpperCase() + " · " + row.size, bytes: imageBytes });
  }
}

const routesToCapture = exportOnly ? routes.filter((route) => route.id === "export") : routes;
for (const route of routesToCapture) {
  for (const theme of themes) {
    for (const size of sizes) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile,
      });
      await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
      await evaluate(client, "localStorage.setItem('ff14-adventurer-card:appearance', " + JSON.stringify(theme) + "); localStorage.setItem('ff14-adventurer-card:locale','ko'); true");
      const exportDraftReset = route.id === "export" ? await resetIsolatedExportDraft(client) : null;
      await navigate(client, baseUrl + route.path);
      const settleResult = await settle(client);
      const evidence = await geometry(client);
      if (evidence.pageVisibility !== "visible" || !evidence.pageHasFocus) throw new Error("Responsive capture page is hidden or unfocused: " + JSON.stringify({ route: route.id, theme, size: size.id, visibility: evidence.pageVisibility, hasFocus: evidence.pageHasFocus }));
      if (evidence.viewport.width !== size.width || evidence.viewport.height !== size.height) throw new Error("Responsive capture viewport drifted: " + JSON.stringify({ route: route.id, theme, expected: size, actual: evidence.viewport }));
      if (settleResult.visibleHosts.some((host) => host.mounted !== "true" || !host.hasArticle)) throw new Error("A visible LazyMaster did not mount before capture: " + JSON.stringify({ route: route.id, theme, size: size.id, visibleHosts: settleResult.visibleHosts }));
      if (route.id === "export" && (evidence.exportFixture?.name !== "Coner" || evidence.exportFixture?.template !== "cinematic" || evidence.exportFixture?.ratio !== "4:5")) throw new Error("Responsive Export fixture drifted: " + JSON.stringify({ theme, size: size.id, exportDraftReset, fixture: evidence.exportFixture }));
      const file = path.join(matrixRoot, route.id + "-" + size.id + "-" + theme + ".png");
      const shot = await screenshot(client, file);
      const summary = { route: route.id, size: size.id, theme, evidence, ...(route.id === "export" ? { exportFixtureId, exportDraftReset } : {}), screenshot: shot.file, sha256: shot.sha256 };
      rows.push(summary);
      screenshotRows.push({ label: route.id.toUpperCase() + " · " + theme.toUpperCase() + " · " + size.id, bytes: await readFile(file) });
      console.log("Captured " + shot.file);
    }
  }
}

const contactSheet = await composeContactSheet(screenshotRows);
const report = {
  schema: "phase300-responsive-visual-audit-v1",
  capturedAt: new Date().toISOString(),
  application: { baseUrl, buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null) },
  browser: (await versionResponse.json()).Browser,
  protocol: { viewports: sizes, themes, locale: "ko", screenshotCount: rows.length, deviceScaleFactor: 1, settleMs: 1500, foregroundedOnEveryNavigation: true, visibilityAndFocusAsserted: true, actualViewportAsserted: true, visibleLazyHostsMountedBeforeCapture: true, exportFixture: { id: exportFixtureId, defaultCard: "Coner / Cinematic C2 / 4:5 / portrait", resetKeys: exportDraftStorageKeys }, exportOnlyRecapture: exportOnly },
  cases: rows,
  clippedCardTextCount: rows.reduce((sum, row) => sum + row.evidence.cards.reduce((count, card) => count + card.clippedText.length, 0), 0),
  pageHorizontalOverflowCount: rows.filter((row) => row.evidence.document.horizontalOverflow).length,
  ratioMismatchCount: rows.reduce((sum, row) => sum + row.evidence.cards.filter((card) => !card.ratioPass).length, 0),
  contactSheet,
  limitation: "DOM bounds and text overflow checks are viewport snapshots; the interactive reviews cover actual input and navigation behavior separately.",
};
await writeFile(path.join(qaRoot, "responsive-visual-audit.json"), JSON.stringify(report, null, 2) + "\n");
client.close();
activeClient = undefined;
console.log(JSON.stringify({
  report: "docs/qa/phase300/responsive-visual-audit.json",
  contactSheet: contactSheet.file,
  cases: rows.length,
  pageOverflow: report.pageHorizontalOverflowCount,
  clippedCardText: report.clippedCardTextCount,
  ratioMismatches: report.ratioMismatchCount,
}, null, 2));
if (report.pageHorizontalOverflowCount > 0 || report.clippedCardTextCount > 0 || report.ratioMismatchCount > 0) process.exitCode = 1;

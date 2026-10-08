import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "docs", "qa", "phase300", "theme-isolation-audit.json");
const baseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=").slice(1).join("=") ?? "http://localhost:3318";
const port = Number(process.argv.find((arg) => arg.startsWith("--debug-port="))?.split("=")[1] ?? "9322");
const properties = ["color", "fontSize", "fontFamily", "fontWeight", "lineHeight"];

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

async function navigate(client, url) {
  await client.send("Page.bringToFront");
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(result.errorText);
  await loaded;
  await evaluate(client, "new Promise((resolve) => (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  await client.send("Page.bringToFront");
  const focusState = await evaluate(client, "({visibility:document.visibilityState,hasFocus:document.hasFocus(),width:innerWidth,height:innerHeight})");
  if (focusState.visibility !== "visible" || !focusState.hasFocus || focusState.width !== 1440 || focusState.height !== 900) {
    throw new Error("Theme style audit page is hidden, unfocused, or at the wrong viewport: " + JSON.stringify({ url, focusState }));
  }
}

async function settle(client) {
  const expression = [
    "(async () => {",
    "await (document.fonts?.ready ?? Promise.resolve());",
    "const visible = [...document.images].filter((image) => { const r = image.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });",
    "await Promise.race([Promise.all(visible.map((image) => image.decode ? image.decode().catch(() => {}) : Promise.resolve())), new Promise((resolve) => setTimeout(resolve, 3000))]);",
    "await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 1500))));",
    "return visible.length;",
    "})()",
  ].join("\n");
  return evaluate(client, expression);
}

async function captureStyles(client, theme) {
  await evaluate(client, "localStorage.setItem('ff14-adventurer-card:appearance', " + JSON.stringify(theme) + "); localStorage.setItem('ff14-adventurer-card:locale', 'ko'); true");
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  await navigate(client, baseUrl);
  const visibleImageCount = await settle(client);
  const result = await evaluate(client, [
    "(() => {",
    "const cards = [...document.querySelectorAll('section[aria-labelledby=home-title] [data-marketing-card]')].map((host, cardIndex) => {",
    "const article = host.querySelector('article[data-template]');",
    "if (!article) return { cardIndex, template: host.getAttribute('data-marketing-card'), missingArticle: true, nodes: [] };",
    "const selectorCounts = new Map();",
    "const elements = [article, ...article.querySelectorAll('p,h2,[data-field]')];",
    "const nodes = elements.map((element) => {",
    "const tag = element.tagName.toLowerCase();",
    "const field = element.getAttribute('data-field');",
    "const base = field ? tag + '[data-field=' + field + ']' : tag + (element === article ? '[data-template]' : '');",
    "const occurrence = selectorCounts.get(base) ?? 0; selectorCounts.set(base, occurrence + 1);",
    "const style = getComputedStyle(element);",
    "const computed = { color: style.color, fontSize: style.fontSize, fontFamily: style.fontFamily, fontWeight: style.fontWeight, lineHeight: style.lineHeight };",
    "return { selector: base + ':' + occurrence, tag: tag.toUpperCase(), field, text: (element.innerText || '').trim().replace(/\\\\s+/g, ' ').slice(0, 80), computed };",
    "});",
    "return { cardIndex, template: article.getAttribute('data-template'), ratio: article.getAttribute('data-ratio'), masterId: article.getAttribute('data-master-id'), visible: host.getAttribute('data-mounted'), nodes };",
    "});",
    "return { url: location.pathname, pageTheme: document.documentElement.getAttribute('data-app-theme'), pageVisibility:document.visibilityState,pageHasFocus:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight},cards };",
    "})()",
  ].join("\n"));
  return { theme, visibleImageCount, ...result };
}

const versionResponse = await fetch("http://127.0.0.1:" + port + "/json/version");
if (!versionResponse.ok) throw new Error("Chrome CDP is not available on port " + port);
const pageResponse = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" });
if (!pageResponse.ok) throw new Error("Could not create CDP page: " + pageResponse.status);
const target = await pageResponse.json();
const client = clientFor(target.webSocketDebuggerUrl);
await client.ready();
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await client.send("Page.bringToFront");
await navigate(client, baseUrl);
const dark = await captureStyles(client, "dark");
const light = await captureStyles(client, "light");

function flatten(report) {
  const rows = [];
  for (const card of report.cards) for (const node of card.nodes) {
    rows.push({
      key: card.template + "|" + node.selector,
      template: card.template,
      selector: node.selector,
      tag: node.tag,
      field: node.field,
      text: node.text,
      computed: node.computed,
    });
  }
  return rows;
}

const darkRows = flatten(dark);
const lightRows = flatten(light);
const darkByKey = new Map(darkRows.map((row) => [row.key, row]));
const lightByKey = new Map(lightRows.map((row) => [row.key, row]));
const styleDifferences = [];
for (const [key, darkRow] of darkByKey) {
  const lightRow = lightByKey.get(key);
  if (!lightRow) {
    styleDifferences.push({ key, missing: "light" });
    continue;
  }
  for (const property of properties) {
    if (darkRow.computed[property] !== lightRow.computed[property]) {
      styleDifferences.push({
        key, property, dark: darkRow.computed[property], light: lightRow.computed[property],
      });
    }
  }
}
for (const key of lightByKey.keys()) if (!darkByKey.has(key)) styleDifferences.push({ key, missing: "dark" });

async function referenceParity() {
  const darkPath = path.join(root, "docs", "qa", "phase215", "final-editor-dark-card-style.json");
  const lightPath = path.join(root, "docs", "qa", "phase215", "final-editor-light-card-style.json");
  const [darkBytes, lightBytes] = await Promise.all([readFile(darkPath), readFile(lightPath)]);
  const darkRef = JSON.parse(darkBytes.toString("utf8"));
  const lightRef = JSON.parse(lightBytes.toString("utf8"));
  const differences = [];
  for (let rootIndex = 0; rootIndex < Math.min(darkRef.roots.length, lightRef.roots.length); rootIndex += 1) {
    const darkNodes = darkRef.roots[rootIndex].nodes;
    const lightNodes = lightRef.roots[rootIndex].nodes;
    for (let nodeIndex = 0; nodeIndex < Math.min(darkNodes.length, lightNodes.length); nodeIndex += 1) {
      const darkNode = darkNodes[nodeIndex];
      const lightNode = lightNodes[nodeIndex];
      if (darkNode.tag !== lightNode.tag) {
        differences.push({ rootIndex, nodeIndex, darkTag: darkNode.tag, lightTag: lightNode.tag });
        continue;
      }
      for (const property of ["color", "font-size", "font-family", "font-weight", "line-height"]) {
        if (darkNode.values?.[property] !== lightNode.values?.[property]) {
          differences.push({
            rootIndex, nodeIndex, tag: darkNode.tag, property,
            dark: darkNode.values?.[property] ?? null,
            light: lightNode.values?.[property] ?? null,
          });
        }
      }
    }
  }
  return {
    files: ["docs/qa/phase215/final-editor-dark-card-style.json", "docs/qa/phase215/final-editor-light-card-style.json"],
    sha256: { dark: createHash("sha256").update(darkBytes).digest("hex"), light: createHash("sha256").update(lightBytes).digest("hex") },
    roots: { dark: darkRef.roots.length, light: lightRef.roots.length },
    comparedProperties: ["color", "font-size", "font-family", "font-weight", "line-height"],
    comparedBy: "same editor DOM root and node index/tag in the frozen theme captures; those records do not retain data-template labels.",
    differences,
    exactAcrossThemes: differences.length === 0,
  };
}

const reference = await referenceParity();
const version = await versionResponse.json();
const buildId = await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null);
const report = {
  schema: "phase300-card-theme-isolation-v1",
  capturedAt: new Date().toISOString(),
  application: { baseUrl, buildId },
  browser: version.Browser,
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  foregroundedOnEveryNavigation: true,
  visibilityAndViewportAssertionsPassed: true,
  comparedProperties: properties,
  templates: ["cinematic", "editorial", "id-card"],
  exactAcrossAppThemes: styleDifferences.length === 0 && dark.cards.length === 3 && light.cards.length === 3,
  dark,
  light,
  styleDifferences,
  frozenEditorReference: reference,
  limitation: "The frozen editor style inventory does not retain master-template names, so the reference comparison verifies dark/light parity by DOM order and tag rather than assigning each root to C2, E2 or I3.",
};
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
client.close();
console.log(JSON.stringify({
  report: path.relative(root, outputPath),
  buildId,
  cardsDark: dark.cards.map((card) => card.template),
  cardsLight: light.cards.map((card) => card.template),
  styleRowsCompared: darkRows.length,
  differences: styleDifferences.length,
  referenceExactAcrossThemes: reference.exactAcrossThemes,
  referenceDifferences: reference.differences.length,
}, null, 2));
if (!report.exactAcrossAppThemes || !reference.exactAcrossThemes) process.exitCode = 1;

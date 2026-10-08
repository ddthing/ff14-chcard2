import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs", "qa", "phase300", "accessibility-audit.json");
const baseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=").slice(1).join("=") ?? "http://localhost:3318";
const port = Number(process.argv.find((arg) => arg.startsWith("--debug-port="))?.split("=")[1] ?? "9322");
const landmarkProbeOnly = process.argv.includes("--landmark-probe");
const createFooterOpacityProbeOnly = process.argv.includes("--create-footer-opacity-probe");
const axePath = path.join(root, "node_modules", "axe-core", "axe.min.js");
let activeClient;

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
          reject(new Error("CDP timed out: " + method));
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

async function evaluate(client, expression, awaitPromise = true) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
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
}

async function setState(client, theme) {
  await client.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
  await evaluate(client,
    "localStorage.setItem('ff14-adventurer-card:appearance', " + JSON.stringify(theme) +
    "); localStorage.setItem('ff14-adventurer-card:locale', 'ko'); true");
}

async function settle(client) {
  await evaluate(client, "new Promise((resolve) => document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 700)))))");
}

async function runAxe(client, route, viewport, theme) {
  await setState(client, theme);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width <= 768,
  });
  await navigate(client, baseUrl + route);
  await settle(client);
  const pageState = await evaluate(client, "({visibility:document.visibilityState,hasFocus:document.hasFocus(),width:innerWidth,height:innerHeight})");
  if (pageState.visibility !== "visible" || !pageState.hasFocus || pageState.width !== viewport.width || pageState.height !== viewport.height) {
    throw new Error("Axe page is hidden, unfocused, or at the wrong viewport: " + JSON.stringify({ route, expected: viewport, pageState }));
  }
  return evaluate(client, [
    "axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })",
    ".then((result) => ({",
    "url: location.pathname, lang: document.documentElement.lang, theme: document.documentElement.getAttribute('data-app-theme'),",
    "viewport: { width: innerWidth, height: innerHeight },pageVisibility:document.visibilityState,pageHasFocus:document.hasFocus(),",
    "violations: result.violations.map((item) => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })),",
    "passes: result.passes.length, incomplete: result.incomplete.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })),",
    "}))",
  ].join("\n"));
}

async function runLandmarkRoleImageProbe(client) {
  await setState(client, "dark");
  const viewport = { width: 1440, height: 900 };
  await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
  await navigate(client, baseUrl + "/");
  await settle(client);
  const before = await evaluate(client, [
    "axe.run(document, { runOnly: { type: 'rule', values: ['landmark-unique'] } })",
    ".then((result) => ({ violations: result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), passCount: result.passes.length }))",
  ].join("\n"));
  const hosts = await evaluate(client, [
    "(() => {",
    "const cards=[...document.querySelectorAll('[data-marketing-card]')];",
    "return cards.map((host,index)=>{const template=host.getAttribute('data-marketing-card')||'card';const label=template+' card preview '+(index+1);host.setAttribute('role','img');host.setAttribute('aria-label',label);return{template,index,role:host.getAttribute('role'),ariaLabel:host.getAttribute('aria-label'),hasNestedSection:!!host.querySelector('section[aria-label]')};});",
    "})()",
  ].join("\n"));
  const roleOnly = await evaluate(client, [
    "axe.run(document, { runOnly: { type: 'rule', values: ['landmark-unique'] } })",
    ".then((result) => ({ violations: result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), passCount: result.passes.length }))",
  ].join("\n"));
  const hiddenWrapper = await evaluate(client, [
    "(() => {",
    "const cards=[...document.querySelectorAll('[data-marketing-card][role=img]')];",
    "for(const host of cards){const wrapper=document.createElement('div');wrapper.setAttribute('aria-hidden','true');wrapper.style.display='contents';while(host.firstChild)wrapper.append(host.firstChild);host.append(wrapper);}",
    "return cards.map((host)=>({template:host.getAttribute('data-marketing-card'),role:host.getAttribute('role'),ariaLabel:host.getAttribute('aria-label'),hiddenInner:host.firstElementChild?.getAttribute('aria-hidden'),hasArticle:!!host.querySelector('article[data-template]')}));",
    "})()",
  ].join("\n"));
  const after = await evaluate(client, [
    "axe.run(document, { runOnly: { type: 'rule', values: ['landmark-unique'] } })",
    ".then((result) => ({ violations: result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), passCount: result.passes.length }))",
  ].join("\n"));
  return {
    url: await evaluate(client, "location.pathname"),
    viewport: await evaluate(client, "({width:innerWidth,height:innerHeight,visibility:document.visibilityState,hasFocus:document.hasFocus()})"),
    before, simulatedHosts: hosts, roleOnly, hiddenWrapper, after,
    limitation: "The role=img change is applied only to this disposable CDP document for diagnosis; no application source or saved screenshot is changed.",
  };
}

async function runCreateFooterOpacityProbe(client) {
  const rows = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await setState(client, "light");
    await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: viewport.width <= 768 });
    await navigate(client, baseUrl + "/create");
    await settle(client);
    const before = await evaluate(client, [
      "axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } })",
      ".then((result) => ({ violations: result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), passCount: result.passes.length }))",
    ].join("\n"));
    const beforeStyles = await evaluate(client, "(() => [...document.querySelectorAll('footer > small')].map((el)=>({className:el.parentElement.className,text:el.innerText,opacity:getComputedStyle(el).opacity,color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,parentOpacity:getComputedStyle(el.parentElement).opacity})))()");
    const simulatedCss = await evaluate(client, "(() => {const footer=document.querySelector('footer > small')?.parentElement;const className=[...(footer?.classList??[])].find((name)=>name.includes('siteFooter'));if(!className)return null;const selector='.'+CSS.escape(className)+' > small';const style=document.createElement('style');style.dataset.phase300Probe='create-footer-opacity';style.textContent=selector+' { opacity: 1; }';document.head.append(style);return style.textContent;})()");
    const after = await evaluate(client, [
      "axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } })",
      ".then((result) => ({ violations: result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), passCount: result.passes.length }))",
    ].join("\n"));
    const afterStyles = await evaluate(client, "(() => [...document.querySelectorAll('footer > small')].map((el)=>({className:el.parentElement.className,text:el.innerText,opacity:getComputedStyle(el).opacity,color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,parentOpacity:getComputedStyle(el.parentElement).opacity})))()");
    rows.push({ viewport, pageVisibility: await evaluate(client, "document.visibilityState"), pageHasFocus: await evaluate(client, "document.hasFocus()"), beforeStyles, before, simulatedCss, afterStyles, after });
  }
  return rows;
}

async function main() {
  const versionResponse = await fetch("http://127.0.0.1:" + port + "/json/version");
  if (!versionResponse.ok) throw new Error("Chrome CDP is not ready on port " + port);
  const pageResponse = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" });
  if (!pageResponse.ok) throw new Error("Could not create CDP page: " + pageResponse.status);
  const target = await pageResponse.json();
  const client = clientFor(target.webSocketDebuggerUrl);
  activeClient = client;
  await client.ready();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.setLifecycleEventsEnabled", { enabled: true });
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: await readFile(axePath, "utf8") });
  await navigate(client, baseUrl + "/");

  if (landmarkProbeOnly) {
    const probe = await runLandmarkRoleImageProbe(client);
    const report = {
      schema: "phase300-landmark-role-image-probe-v1",
      capturedAt: new Date().toISOString(),
      application: { baseUrl, buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null) },
      browser: (await versionResponse.json()).Browser,
      probe,
    };
    const probePath = path.join(root, "docs", "qa", "phase300", "landmark-role-img-probe.json");
    await writeFile(probePath, JSON.stringify(report, null, 2) + "\n");
    client.close();
    activeClient = undefined;
    console.log(JSON.stringify({ report: "docs/qa/phase300/landmark-role-img-probe.json", beforeViolations: probe.before.violations.length, afterViolations: probe.after.violations.length, hostCount: probe.simulatedHosts.length }, null, 2));
    return;
  }

  if (createFooterOpacityProbeOnly) {
    const rows = await runCreateFooterOpacityProbe(client);
    const report = {
      schema: "phase300-create-footer-opacity-probe-v1",
      capturedAt: new Date().toISOString(),
      application: { baseUrl, buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null) },
      browser: (await versionResponse.json()).Browser,
      rows,
      limitation: "The opacity rule was injected into the disposable CDP document only. It does not change source or saved screenshots.",
    };
    const probePath = path.join(root, "docs", "qa", "phase300", "create-footer-opacity-probe.json");
    await writeFile(probePath, JSON.stringify(report, null, 2) + "\n");
    client.close();
    activeClient = undefined;
    console.log(JSON.stringify({ report: "docs/qa/phase300/create-footer-opacity-probe.json", viewports: rows.length, beforeViolations: rows.map((row) => row.before.violations.length), afterViolations: rows.map((row) => row.after.violations.length) }, null, 2));
    return;
  }

  const pages = [];
  for (const route of ["/", "/templates", "/create", "/export"]) {
    for (const width of [1440, 390]) {
      for (const theme of ["dark", "light"]) {
        pages.push(await runAxe(client, route, { width, height: width === 390 ? 844 : 900 }, theme));
      }
    }
  }

  const report = {
    schema: "phase300-accessibility-audit-v1",
    capturedAt: new Date().toISOString(),
    application: {
      baseUrl,
      buildId: await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim()).catch(() => null),
    },
    browser: (await versionResponse.json()).Browser,
    engine: { name: "axe-core", version: "package from node_modules/axe-core", tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    foregroundedOnEveryNavigation: true,
    visibilityAndViewportAssertionsPassed: true,
    pageCount: pages.length,
    violationCount: pages.reduce((sum, page) => sum + page.violations.length, 0),
    pages,
    limitation: "Automated axe checks are a regression signal, not a substitute for manual keyboard and screen-reader review.",
  };
  await writeFile(out, JSON.stringify(report, null, 2) + "\n");
  client.close();
  activeClient = undefined;
  console.log(JSON.stringify({ report: "docs/qa/phase300/accessibility-audit.json", pageCount: pages.length, violationCount: report.violationCount }, null, 2));
}

await main().catch((error) => {
  console.error(error);
  activeClient?.close();
  process.exitCode = 1;
});

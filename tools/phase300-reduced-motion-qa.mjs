import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = path.join(root, "docs", "qa", "phase300");
const outputRoot = path.join(qaRoot, "reduced-motion");
const baseUrl = arg("--base-url", "http://127.0.0.1:3318").replace(/\/$/, "");
const debugPort = Number(arg("--debug-port", "9325"));
const expectedBuildId = "mYoq6tTrwEbVu_2O1In9-";
const routes = [
  { id: "home", path: "/", width: 1440, height: 900, mobile: false, screenshot: "home-1440x900.png" },
  { id: "home", path: "/", width: 390, height: 844, mobile: true },
  { id: "templates", path: "/templates", width: 1440, height: 900, mobile: false },
  { id: "templates", path: "/templates", width: 390, height: 844, mobile: true },
  { id: "create", path: "/create", width: 1440, height: 900, mobile: false },
  { id: "create", path: "/create", width: 390, height: 844, mobile: true },
  { id: "export", path: "/export", width: 1440, height: 900, mobile: false, screenshot: "export-1440x900.png" },
  { id: "export", path: "/export", width: 390, height: 844, mobile: true },
];

function arg(name, fallback) {
  const entry = process.argv.find((value) => value.startsWith(name + "="));
  return entry ? entry.slice(name.length + 1) : fallback;
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
      if (message.error) request.reject(new Error(`CDP ${request.method}: ${message.error.message}`));
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
          reject(new Error(`CDP timed out: ${method}`));
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
        const timer = setTimeout(() => { set.delete(listener); reject(new Error(`CDP event timed out: ${method}`)); }, timeoutMs);
      });
    },
    close: () => socket.close(),
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function waitForDebugger() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const versionResponse = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      const version = await versionResponse.json();
      const targetsResponse = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await targetsResponse.json();
      const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (target) return { version, target };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Chrome CDP did not become available on port ${debugPort}.`);
}

async function setPageConditions(client, route) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: route.width, height: route.height, deviceScaleFactor: 1, mobile: route.mobile,
  });
  await client.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "dark" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
}

async function navigate(client, url) {
  const loaded = client.waitEvent("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) throw new Error(`Navigation failed for ${url}: ${result.errorText}`);
  await loaded;
  await client.send("Page.bringToFront");
  await evaluate(client, "(async()=>{await(document.fonts?.ready??Promise.resolve());const imgs=[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight});await Promise.race([Promise.all(imgs.map(i=>i.decode?.().catch(()=>{})??Promise.resolve())),new Promise(r=>setTimeout(r,3000))]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,1400))));return true})()");
}

async function saveScreenshot(client, filename) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(result.data, "base64");
  const outputPath = path.join(outputRoot, filename);
  await writeFile(outputPath, bytes);
  return { file: `reduced-motion/${filename}`, bytes: bytes.length };
}

function visiblePageAuditExpression() {
  return `(() => {
    const visible=(el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0};
    const headings=[...document.querySelectorAll('h1')].filter(visible).map((el)=>el.innerText.trim()).filter(Boolean);
    const actions=[...document.querySelectorAll('a[href],button,[role="button"],input[type="submit"],input[type="button"]')].filter(visible).map((el)=>({tag:el.tagName.toLowerCase(),label:(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||el.value||'').trim().replace(/\\s+/g,' ').slice(0,100),href:el.getAttribute('href')}));
    const parseMs=(value)=>value.split(',').map((part)=>{const text=part.trim(),num=parseFloat(text)||0;return text.endsWith('ms')?num:num*1000});
    const rows=[...document.querySelectorAll('*')].filter((el)=>el.getClientRects().length>0).map((el)=>{const s=getComputedStyle(el);return {tag:el.tagName.toLowerCase(),name:s.animationName,animationMs:Math.max(...parseMs(s.animationDuration)),transitionMs:Math.max(...parseMs(s.transitionDuration)),visible:visible(el)}});
    const relevant=rows.filter((row)=>row.visible);
    const worst=(key,source)=>source.reduce((acc,row)=>row[key]>acc[key]?row:acc,({[key]:0}));
    const pageCards=[...document.querySelectorAll('[data-marketing-card]')].map((el)=>({template:el.getAttribute('data-marketing-card'),mounted:el.getAttribute('data-mounted')==='true',hasCard:!!el.querySelector('article[data-template]')}));
    return {url:location.pathname,mediaReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,headingCount:headings.length,headings,visibleActions:actions.length,actions,domElementCount:rows.length,visibleElementCount:relevant.length,worstAnimation:worst('animationMs',rows),worstTransition:worst('transitionMs',rows),runningAnimations:document.getAnimations().filter((animation)=>animation.playState==='running').length,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior,pageCards};
  })()`;
}

async function inspectHomeScroll(client) {
  return evaluate(client, `(async()=>{
    const wait=()=>new Promise((resolve)=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),140));
    const admitVisible=async()=>{for(let attempt=0;attempt<14;attempt++){const pending=[...document.querySelectorAll('[data-marketing-card]')].filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight&&(el.getAttribute('data-mounted')!=='true'||!el.querySelector('article[data-template]'))});if(!pending.length)return;await wait()}};
    const sections=[...document.querySelectorAll('section[aria-labelledby]')];
    const sectionRows=[];
    const sample=()=>{const cards=[...document.querySelectorAll('[data-marketing-card]')].map((el)=>{const r=el.getBoundingClientRect();const visible=r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;return {template:el.getAttribute('data-marketing-card'),visible,mounted:el.getAttribute('data-mounted')==='true',hasCard:!!el.querySelector('article[data-template]')}});return {scrollY:Math.round(scrollY),visibleCards:cards.filter((x)=>x.visible),unmountedVisibleCards:cards.filter((x)=>x.visible&&(!x.mounted||!x.hasCard)).map((x)=>x.template)}};
    for(let i=0;i<sections.length;i++){const section=sections[i];const heading=section.querySelector('h1,h2,h3');(heading??section).scrollIntoView({behavior:'auto',block:'center'});await admitVisible();const r=heading?.getBoundingClientRect();const headingVisible=!!r&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;const row={index:i+1,heading:heading?.innerText.trim()??'',headingVisible,...sample()};sectionRows.push(row)}
    const maxY=Math.max(0,document.documentElement.scrollHeight-innerHeight);
    const step=Math.max(320,Math.round(innerHeight*.72));
    const down=[];for(let y=0;y<=maxY;y+=step){scrollTo(0,Math.min(y,maxY));await admitVisible();down.push(sample())}if(down.at(-1)?.scrollY!==maxY){scrollTo(0,maxY);await admitVisible();down.push(sample())}
    const up=[];for(let y=maxY-step;y>=0;y-=step){scrollTo(0,Math.max(0,y));await admitVisible();up.push(sample())}scrollTo(0,0);await admitVisible();up.push(sample());
    const allVisibleAdmission=[...sectionRows,...down,...up].flatMap((row)=>row.unmountedVisibleCards);
    const storyItems=[...document.querySelectorAll('[data-scroll-story] > li')];const storyRows=[];
    for(let i=0;i<storyItems.length;i++){const item=storyItems[i];item.scrollIntoView({behavior:'auto',block:'center'});await admitVisible();const r=item.getBoundingClientRect();const visible=r.bottom>0&&r.top<innerHeight;const cards=[...item.querySelectorAll('[data-marketing-card]')].map((el)=>({template:el.getAttribute('data-marketing-card'),mounted:el.getAttribute('data-mounted')==='true',hasCard:!!el.querySelector('article[data-template]')}));storyRows.push({index:i+1,heading:item.querySelector('h3')?.innerText.trim()??'',visible,cards})}
    scrollTo(0,0);await wait();
    const admittedTemplates=[...new Set([...sectionRows,...down,...up].flatMap((row)=>row.visibleCards.filter((card)=>card.mounted&&card.hasCard).map((card)=>card.template)))];
    return {sectionCount:sections.length,sections:sectionRows,scrollHeight:document.documentElement.scrollHeight,maximumScrollY:maxY,downStepPx:step,downSamples:down.length,upSamples:up.length,allVisibleCardsAdmitted:allVisibleAdmission.length===0,unmountedVisibleCards:allVisibleAdmission,admittedTemplates,storyItemCount:storyItems.length,storyItems:storyRows,returnedToTop:scrollY===0};
  })()`);
}

async function clickVisibleLink(client, selector) {
  const rect = await evaluate(client, `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;el.scrollIntoView({behavior:'auto',block:'center'});const r=el.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,href:el.getAttribute('href')}})()`);
  if (!rect || rect.width < 1 || rect.height < 1) return false;
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  return rect;
}

await mkdir(outputRoot, { recursive: true });
const localBuildId = await readFile(path.join(root, ".next", "BUILD_ID"), "utf8").then((value) => value.trim());
if (localBuildId !== expectedBuildId) throw new Error(`Local production build changed: expected ${expectedBuildId}, got ${localBuildId}`);
const initial = await waitForDebugger();
const browserClient = clientFor(initial.target.webSocketDebuggerUrl);
await browserClient.ready();
await browserClient.send("Page.enable");
await browserClient.send("Runtime.enable");

const report = {
  schema: "phase300-reduced-motion-smoke-v1",
  capturedAt: new Date().toISOString(),
  application: { baseUrl, buildId: localBuildId },
  browser: initial.version.Browser,
  protocol: { mediaEmulationBeforeEachRouteNavigation: true, reducedMotionValue: "reduce", foregroundAndViewportAssertionsPerCase: true, waitAfterLoadMs: 1400 },
  cases: [],
  screenshots: [],
  homeScroll: null,
  ordinaryNavigation: null,
  cleanup: { isolatedChromeStopped: false, isolatedProfileRemoved: false },
  limitations: ["This is a targeted reduced-motion smoke, not a full accessibility or performance cohort."],
};

for (const route of routes) {
  await setPageConditions(browserClient, route);
  if (await evaluate(browserClient, "location.origin === 'null'").catch(() => true)) {
    await navigate(browserClient, baseUrl + "/");
  }
  await evaluate(browserClient, `localStorage.setItem('ff14-adventurer-card:appearance','dark');localStorage.setItem('ff14-adventurer-card:locale','ko');true`);
  await setPageConditions(browserClient, route);
  await navigate(browserClient, baseUrl + route.path);
  await browserClient.send("Page.bringToFront");
  const actual = await evaluate(browserClient, "({visibility:document.visibilityState,hasFocus:document.hasFocus(),width:innerWidth,height:innerHeight})");
  const expected = { width: route.width, height: route.height };
  if (actual.visibility !== "visible" || !actual.hasFocus || actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(`Foreground/viewport assertion failed on ${route.id} ${route.width}x${route.height}: ${JSON.stringify({ actual, expected })}`);
  }
  const audit = await evaluate(browserClient, visiblePageAuditExpression());
  const caseResult = {
    page: route.id,
    path: route.path,
    viewport: expected,
    foreground: actual,
    mediaReduced: audit.mediaReduced,
    visibleHeadings: audit.headings,
    visibleActions: audit.actions,
    visibleElementCount: audit.visibleElementCount,
    domElementCount: audit.domElementCount,
    worstAnimation: audit.worstAnimation,
    worstTransition: audit.worstTransition,
    runningAnimations: audit.runningAnimations,
    scrollBehavior: audit.scrollBehavior,
    marketingCards: audit.pageCards,
    checks: {
      foregroundAndViewport: true,
      reducedMediaApplied: audit.mediaReduced,
      headingVisible: audit.headingCount > 0,
      actionVisible: audit.visibleActions > 0,
      animationDurationAtMost001ms: audit.worstAnimation.animationMs <= 0.0101,
      transitionDurationAtMost001ms: audit.worstTransition.transitionMs <= 0.0101,
      scrollBehaviorAuto: audit.scrollBehavior === "auto",
    },
  };
  if (route.screenshot) report.screenshots.push(await saveScreenshot(browserClient, route.screenshot));
  if (route.id === "home" && route.width === 1440) {
    report.homeScroll = await inspectHomeScroll(browserClient);
  }
  report.cases.push(caseResult);
}

await setPageConditions(browserClient, routes[0]);
await evaluate(browserClient, `localStorage.setItem('ff14-adventurer-card:appearance','dark');localStorage.setItem('ff14-adventurer-card:locale','ko');true`);
await navigate(browserClient, baseUrl + "/");
const navigationSetup = await evaluate(browserClient, `(()=>{const had=typeof document.startViewTransition==='function';let disabled=false;try{Object.defineProperty(document,'startViewTransition',{configurable:true,writable:true,value:undefined});disabled=typeof document.startViewTransition==='undefined'}catch{}return {supportedBefore:had,disabledForNavigation:disabled}})()`);
let ordinaryNavigation = { ...navigationSetup, pass: false, destination: null };
if (navigationSetup.disabledForNavigation) {
  const clicked = await clickVisibleLink(browserClient, 'a[href="/templates"]');
  if (clicked) {
    const start = Date.now();
    let destination = null;
    while (Date.now() - start < 8000) {
      destination = await evaluate(browserClient, "({path:location.pathname,transitionUnavailable:typeof document.startViewTransition==='undefined'})");
      if (destination.path === "/templates") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const foreground = await evaluate(browserClient, "({visibility:document.visibilityState,hasFocus:document.hasFocus(),width:innerWidth,height:innerHeight})");
    ordinaryNavigation = { ...ordinaryNavigation, destination: destination?.path ?? null, transitionUnavailableAfterNavigation: destination?.transitionUnavailable ?? false, foreground, pass: destination?.path === "/templates" && destination.transitionUnavailable && foreground.visibility === "visible" && foreground.hasFocus };
  }
}
report.ordinaryNavigation = ordinaryNavigation;
report.summary = {
  caseCount: report.cases.length,
  caseChecksPassed: report.cases.every((item) => Object.values(item.checks).every(Boolean)),
  homeScrollPass: report.homeScroll?.sectionCount > 0 && report.homeScroll?.sections.every((item) => item.headingVisible) && report.homeScroll?.allVisibleCardsAdmitted && report.homeScroll?.storyItems.every((item) => item.visible && item.cards.every((card) => card.mounted && card.hasCard)) && report.homeScroll?.returnedToTop,
  ordinaryNavigationPass: report.ordinaryNavigation.pass,
  screenshotCount: report.screenshots.length,
};
await writeFile(path.join(qaRoot, "reduced-motion-qa.json"), JSON.stringify(report, null, 2) + "\n");
browserClient.close();
if (!report.summary.caseChecksPassed || !report.summary.homeScrollPass) process.exitCode = 1;
console.log(JSON.stringify({ report: "docs/qa/phase300/reduced-motion-qa.json", buildId: localBuildId, summary: report.summary, cases: report.cases.map((item) => ({ page: item.page, viewport: item.viewport, checks: item.checks, worstAnimation: item.worstAnimation.animationMs, worstTransition: item.worstTransition.transitionMs })) }, null, 2));

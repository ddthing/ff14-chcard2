import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromProject = createRequire(path.join(root, 'package.json'));
const DEFAULT_BEFORE = 'http://127.0.0.1:4334';
const DEFAULT_AFTER = 'http://127.0.0.1:4333';
const DEFAULT_REPORT_DIR = 'tmp/editor-font-preview-browser-qa';
const EXPORT_TIMEOUT_MS = 90_000;
const FONT_WAIT_TIMEOUT_MS = 50_000;
const FONT_FIXTURE_PATH = 'docs/qa/phase217/ui-seed-system.json';
const TEXT_ITEM_ID = 'cinematic.promise';

const FONT_CASES = [
  { locale: 'ko', viewport: 'desktop', width: 1440, height: 1000, fontId: 'pretendard', search: '프리텐다드', alias: 'XIV Preview 002' },
  { locale: 'ko', viewport: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, fontId: 'pretendard', search: '프리텐다드', alias: 'XIV Preview 002' },
  { locale: 'ja', viewport: 'desktop', width: 1440, height: 1000, fontId: 'pretendard-jp', search: 'Pretendard JP', alias: 'XIV Preview 003' },
  { locale: 'ja', viewport: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, fontId: 'pretendard-jp', search: 'Pretendard JP', alias: 'XIV Preview 003' },
];

function usage() {
  return [
    'Usage: node tools/editor-font-preview-browser-qa.mjs [options]',
    '',
    `  --before <url>       Baseline loopback origin (default: ${DEFAULT_BEFORE})`,
    `  --after <url>        Current loopback origin (default: ${DEFAULT_AFTER})`,
    '  --build <target>     Run before, after, or both (default: both)',
    '  --case <locale-view> Run one case such as ko-desktop or ja-mobile',
    `  --report-dir <path>  JSON report and optional screenshots (default: ${DEFAULT_REPORT_DIR})`,
    '  --screenshots        Save picker and applied-font screenshots for each cold context',
    '  --help               Show this help',
    '',
    'Each locale and viewport uses a fresh headless Chrome context with the public Coner fixture.',
    'Playwright loads from EDITOR_QA_NODE_MODULES or this project; no persistent browser profile is used.',
  ].join('\n');
}

function parseArgs(args) {
  const options = { before: DEFAULT_BEFORE, after: DEFAULT_AFTER, reportDir: DEFAULT_REPORT_DIR, screenshots: false, build: 'both', caseKey: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--screenshots') options.screenshots = true;
    else if (arg === '--build' || arg === '--case' || arg === '--before' || arg === '--after' || arg === '--report-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      index += 1;
      if (arg === '--build') options.build = value;
      else if (arg === '--case') options.caseKey = value;
      else if (arg === '--before') options.before = value;
      else if (arg === '--after') options.after = value;
      else options.reportDir = value;
    } else if (arg.startsWith('--before=')) options.before = arg.slice('--before='.length);
    else if (arg.startsWith('--after=')) options.after = arg.slice('--after='.length);
    else if (arg.startsWith('--report-dir=')) options.reportDir = arg.slice('--report-dir='.length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!['before', 'after', 'both'].includes(options.build)) throw new Error('--build must be before, after, or both.');
  if (options.caseKey && !FONT_CASES.some((testCase) => `${testCase.locale}-${testCase.viewport}` === options.caseKey)) {
    throw new Error(`Unknown --case value: ${options.caseKey}`);
  }
  return options;
}

function loadPlaywright() {
  const moduleDirectory = process.env.EDITOR_QA_NODE_MODULES?.trim();
  if (moduleDirectory) {
    const resolvedDirectory = path.resolve(moduleDirectory);
    for (const candidate of [
      path.join(resolvedDirectory, 'playwright'),
      path.join(resolvedDirectory, 'playwright-core'),
      path.join(resolvedDirectory, 'node_modules', 'playwright'),
      path.join(resolvedDirectory, 'node_modules', 'playwright-core'),
    ]) {
      try { return requireFromProject(candidate); } catch { /* Try the next bundle path. */ }
    }
  }
  for (const packageName of ['playwright', 'playwright-core']) {
    try { return requireFromProject(packageName); } catch { /* Try the supported fallback. */ }
  }
  throw new Error('Playwright was not found. Set EDITOR_QA_NODE_MODULES to a node_modules directory containing playwright or playwright-core.');
}

function assertLoopbackUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${name} URL: ${value}`); }
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (!['http:', 'https:'].includes(url.protocol) || !hosts.has(url.hostname) || url.username || url.password) {
    throw new Error(`${name} must use a loopback host and must not include credentials.`);
  }
  return new URL(url.origin);
}

function resolveReportDir(value) {
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('--report-dir must stay inside the project workspace.');
  return absolute;
}

function createInitScript(origin, fixture, locale) {
  const seed = JSON.stringify({
    origin,
    locale,
    draftKey: fixture.storage.draftKey,
    serializedDraft: fixture.storage.serializedDraft,
    localeKey: fixture.storage.localeKey,
    appearanceKey: fixture.storage.appearanceKey,
  });
  return `(() => {
    const seed = ${seed};
    const state = window.__editorFontPreviewQa ?? { fixtureApplied: false, downloads: [] };
    state.downloads ??= [];
    window.__editorFontPreviewQa = state;
    if (window.location.origin !== seed.origin) return;
    if (window.location.pathname === '/editor') {
      try {
        window.localStorage.setItem(seed.draftKey, seed.serializedDraft);
        window.localStorage.setItem(seed.localeKey, seed.locale);
        window.sessionStorage.setItem(seed.localeKey, seed.locale);
        window.localStorage.setItem(seed.appearanceKey, 'system');
        state.fixtureApplied = true;
      } catch (error) {
        state.seedError = String(error);
      }
    }
    if (!window.__editorFontPreviewQaAnchorHooked) {
      window.__editorFontPreviewQaAnchorHooked = true;
      const nativeAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function(...args) {
        if (this.href.startsWith('blob:') && this.hasAttribute('download')) {
          window.__editorFontPreviewQa.downloads.push({ href: this.href, filename: this.download, recordedAt: performance.now() });
          return;
        }
        return nativeAnchorClick.apply(this, args);
      };
    }
  })();`;
}

function attachNetworkCapture(session) {
  const records = [];
  const latestByRequestId = new Map();
  let phase = 'startup';

  session.on('Network.requestWillBeSent', (event) => {
    if (event.redirectResponse) {
      const redirect = latestByRequestId.get(event.requestId);
      if (redirect) {
        redirect.status = event.redirectResponse.status;
        redirect.mimeType = event.redirectResponse.mimeType;
        redirect.redirected = true;
        redirect.finished = true;
      }
    }
    const record = {
      url: event.request.url,
      method: event.request.method,
      type: event.type,
      phase,
      status: null,
      mimeType: '',
      encodedDataLength: 0,
      finished: false,
      failed: false,
      fromDiskCache: false,
      fromServiceWorker: false,
    };
    records.push(record);
    latestByRequestId.set(event.requestId, record);
  });

  session.on('Network.responseReceived', (event) => {
    const record = latestByRequestId.get(event.requestId);
    if (!record) return;
    record.status = event.response.status;
    record.mimeType = event.response.mimeType;
    record.fromDiskCache = event.response.fromDiskCache;
    record.fromServiceWorker = event.response.fromServiceWorker;
  });

  session.on('Network.loadingFinished', (event) => {
    const record = latestByRequestId.get(event.requestId);
    if (!record) return;
    record.encodedDataLength = Math.max(0, Math.round(event.encodedDataLength));
    record.finished = true;
  });

  session.on('Network.loadingFailed', (event) => {
    const record = latestByRequestId.get(event.requestId);
    if (!record) return;
    record.failed = true;
    record.errorText = event.errorText;
    record.finished = true;
  });

  return {
    setPhase(nextPhase) { phase = nextPhase; },
    getRecords() { return records; },
  };
}

function pathnameOf(value) {
  try { return new URL(value).pathname; } catch { return value; }
}

function isFontResource(record) {
  return record.type === 'Font'
    || /^font\//iu.test(record.mimeType)
    || /\.(?:woff2?|ttf|otf)(?:$|\?)/iu.test(record.url);
}

function isStylesheetResource(record) {
  return record.type === 'Stylesheet'
    || record.mimeType.toLowerCase().includes('text/css')
    || /\.css(?:$|\?)/iu.test(record.url);
}

function summarizeNetwork(records) {
  const summarize = (selected) => ({
    fontBytes: selected.filter(isFontResource).reduce((sum, resource) => sum + resource.encodedDataLength, 0),
    cssBytes: selected.filter(isStylesheetResource).reduce((sum, resource) => sum + resource.encodedDataLength, 0),
    previewFontBytes: selected.filter((resource) => isFontResource(resource) && pathnameOf(resource.url).includes('/fonts/previews/')).reduce((sum, resource) => sum + resource.encodedDataLength, 0),
    previewCssBytes: selected.filter((resource) => isStylesheetResource(resource) && pathnameOf(resource.url).includes('/fonts/previews/css/')).reduce((sum, resource) => sum + resource.encodedDataLength, 0),
    fontResources: selected.filter(isFontResource).map((resource) => ({
      url: resource.url,
      bytes: resource.encodedDataLength,
      phase: resource.phase,
      status: resource.status,
      mimeType: resource.mimeType,
      failed: resource.failed,
      errorText: resource.errorText ?? null,
    })),
    stylesheets: selected.filter(isStylesheetResource).map((resource) => ({
      url: resource.url,
      bytes: resource.encodedDataLength,
      phase: resource.phase,
      status: resource.status,
      failed: resource.failed,
      errorText: resource.errorText ?? null,
    })),
  });

  const phases = {};
  for (const phase of ['startup', 'picker', 'selection', 'export']) {
    phases[phase] = summarize(records.filter((record) => record.phase === phase));
  }
  return { total: summarize(records), phases };
}

function assetTotals(records) {
  const completed = records.filter((resource) => resource.finished && !resource.failed);
  const fonts = completed.filter(isFontResource);
  const stylesheets = completed.filter(isStylesheetResource);
  const previewFonts = fonts.filter((resource) => pathnameOf(resource.url).includes('/fonts/previews/'));
  const previewCss = stylesheets.filter((resource) => pathnameOf(resource.url).includes('/fonts/previews/css/'));
  const summarize = (resources) => ({
    bytes: resources.reduce((sum, resource) => sum + resource.encodedDataLength, 0),
    requestCount: resources.length,
    resources: resources.map((resource) => ({ url: resource.url, bytes: resource.encodedDataLength, phase: resource.phase, mimeType: resource.mimeType })),
  });
  return {
    font: summarize(fonts),
    css: summarize(stylesheets),
    previewFont: summarize(previewFonts),
    previewCss: summarize(previewCss),
    unfinishedFontOrCssRequests: records.filter((resource) => !resource.finished && !resource.failed && (isFontResource(resource) || isStylesheetResource(resource))).length,
  };
}

function assetDelta(before, after) {
  const delta = (first, last) => ({
    bytes: Math.max(0, last.bytes - first.bytes),
    requestCount: Math.max(0, last.requestCount - first.requestCount),
  });
  return {
    font: delta(before.font, after.font),
    css: delta(before.css, after.css),
    previewFont: delta(before.previewFont, after.previewFont),
    previewCss: delta(before.previewCss, after.previewCss),
  };
}

async function waitForRelevantNetworkIdle(page, network, timeoutMs = 10_000) {
  const started = Date.now();
  let stableSince = null;
  let previousCount = -1;
  while (Date.now() - started < timeoutMs) {
    const relevant = network.getRecords().filter((record) => isFontResource(record) || isStylesheetResource(record));
    const hasPending = relevant.some((record) => !record.finished && !record.failed);
    if (!hasPending && relevant.length === previousCount) {
      stableSince ??= Date.now();
      if (Date.now() - stableSince >= 350) return;
    } else {
      stableSince = null;
    }
    previousCount = relevant.length;
    await page.waitForTimeout(100);
  }
}

async function visiblePreviewStates(page) {
  return page.evaluate(() => {
    const list = document.querySelector('[role="listbox"]');
    if (!list) return { listVisible: false, optionCount: 0, states: [] };
    const bounds = list.getBoundingClientRect();
    const options = Array.from(list.querySelectorAll('[role="option"]'));
    const states = options.map((option) => {
      const rect = option.getBoundingClientRect();
      const intersects = rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
      const preview = option.querySelector('[data-font-preview-state]');
      const sample = preview?.querySelector('[class*="sample"]') ?? option.querySelector('[class*="sample"]');
      return intersects ? {
        fontId: preview?.getAttribute('data-font-id') ?? option.getAttribute('data-font-id'),
        state: preview?.getAttribute('data-font-preview-state') ?? 'unreported',
        sampleText: sample?.textContent ?? '',
        sampleFamily: sample ? getComputedStyle(sample).fontFamily : null,
      } : null;
    }).filter(Boolean);
    return {
      listVisible: bounds.width > 0 && bounds.height > 0,
      optionCount: list.querySelectorAll('[role="option"]').length,
      states,
    };
  });
}

async function waitForVisiblePreviews(page) {
  await page.waitForFunction(() => {
    const list = document.querySelector('[role="listbox"]');
    if (!list) return false;
    const bounds = list.getBoundingClientRect();
    const visible = Array.from(list.querySelectorAll('[role="option"]')).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
    });
    return visible.length > 0 && visible.every((option) => option.querySelector('[data-font-preview-state]')?.getAttribute('data-font-preview-state') !== 'loading');
  }, { timeout: FONT_WAIT_TIMEOUT_MS });
}

async function waitForFontDraft(page, fixture, fontId, textItemId) {
  await page.waitForFunction(({ draftKey, expectedFontId, targetItemId }) => {
    try {
      const stored = localStorage.getItem(draftKey);
      if (!stored) return false;
      const card = JSON.parse(stored)?.card;
      return card?.design?.textTypography?.[targetItemId]?.fontFamily === expectedFontId;
    } catch { return false; }
  }, { draftKey: fixture.storage.draftKey, expectedFontId: fontId, targetItemId: textItemId }, { timeout: 15_000 });
}

async function readSavedFont(page, fixture, textItemId) {
  return page.evaluate(({ draftKey, targetItemId }) => {
    try {
      const card = JSON.parse(localStorage.getItem(draftKey) ?? 'null')?.card;
      const typography = card?.design?.textTypography?.[targetItemId] ?? null;
      return {
        fontFamily: typography?.fontFamily ?? null,
        hasPreviewAlias: JSON.stringify(card?.design?.textTypography ?? {}).includes('XIV Preview'),
        fontTypography: typography,
      };
    } catch (error) {
      return { fontFamily: null, hasPreviewAlias: false, error: String(error) };
    }
  }, { draftKey: fixture.storage.draftKey, targetItemId: textItemId });
}

async function extractDownloadedPng(page) {
  return page.evaluate(async () => {
    const state = window.__editorFontPreviewQa;
    const download = state?.downloads?.at(-1);
    if (!download) return null;
    const response = await fetch(download.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    return {
      filename: download.filename,
      responseStatus: response.status,
      mimeType: blob.type,
      size: blob.size,
      magicHex: Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      downloadCount: state.downloads.length,
    };
  });
}

async function chooseRadio(page, selector) {
  const radio = page.locator(selector);
  if (!(await radio.count())) return false;
  if (await radio.isChecked()) return true;
  await radio.locator('xpath=..').click();
  await page.waitForFunction((target) => document.querySelector(target)?.checked === true, selector, { timeout: 10_000 });
  return true;
}

async function captureScreenshot(page, reportDir, relativeName, caseResult) {
  const filePath = path.join(reportDir, 'screenshots', relativeName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true, animations: 'disabled' });
  caseResult.screenshots ??= [];
  caseResult.screenshots.push(path.relative(root, filePath).replaceAll('\\', '/'));
}

async function openInformationTask(page, locale) {
  const taskTabs = ['#editor-task-tab-desktop-information', '#editor-task-tab-mobile-information'];
  for (const selector of taskTabs) {
    const button = page.locator(selector);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      await page.waitForFunction(() => document.querySelector('#editor-inspector')?.getAttribute('data-state') === 'open');
      return;
    }
  }
  const accessibleName = locale === 'ko' ? /문구/u : /テキスト/u;
  const fallback = page.locator('button:visible').filter({ hasText: accessibleName }).first();
  await fallback.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.click();
    await page.waitForFunction(() => document.querySelector('#editor-inspector')?.getAttribute('data-state') === 'open');
    return;
  }
  throw new Error(`Could not find a visible ${locale} information task tab.`);
}

async function selectPromiseText(page, locale) {
  const itemLabel = locale === 'ko' ? /약속/u : /メッセージ/u;
  const itemSelect = page.locator('[data-text-item-select="true"]');
  if (await itemSelect.isVisible().catch(() => false)) {
    await itemSelect.selectOption(TEXT_ITEM_ID);
    await page.waitForFunction((id) => document.querySelector('[data-text-item-select]')?.value === id, TEXT_ITEM_ID);
  } else {
    const row = page.locator('#editor-navigator').getByRole('button', { name: itemLabel }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
    } else {
      const target = page.locator(`[data-card-text-target="${TEXT_ITEM_ID}"], [data-text-target="${TEXT_ITEM_ID}"]`).first();
      await target.waitFor({ state: 'visible', timeout: 15_000 });
      const badge = target.locator('[data-card-text-badge-hit="true"], [data-text-badge-hit="true"]');
      if (await badge.count()) await badge.click();
      else await target.click();
    }
  }
  const trigger = page.locator(`[data-text-font-family="${TEXT_ITEM_ID}"]`);
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction((id) => document.querySelector('[data-text-typography-editor]')?.getAttribute('data-text-typography-editor') === id, TEXT_ITEM_ID, { timeout: 10_000 }).catch(() => {});
  return trigger;
}

async function runCase(browser, build, baseUrl, testCase, fixture, reportDir, screenshots) {
  const caseResult = {
    key: `${build}-${testCase.locale}-${testCase.viewport}`,
    build,
    baseUrl,
    locale: testCase.locale,
    viewport: { width: testCase.width, height: testCase.height, isMobile: Boolean(testCase.isMobile), hasTouch: Boolean(testCase.hasTouch) },
    targetFont: { id: testCase.fontId, search: testCase.search, expectedPreviewAlias: testCase.alias },
    passed: false,
    assertions: [],
    pageErrors: [],
    requestFailures: [],
  };
  let context;
  let session;
  let page;
  let network;
  let step = 'create isolated context';
  let textItemId = TEXT_ITEM_ID;
  const started = Date.now();
  try {
    const origin = new URL(baseUrl).origin;
    context = await browser.newContext({
      viewport: { width: testCase.width, height: testCase.height },
      isMobile: Boolean(testCase.isMobile),
      hasTouch: Boolean(testCase.hasTouch),
      serviceWorkers: 'block',
    });
    await context.addInitScript({ content: createInitScript(origin, fixture, testCase.locale) });
    page = await context.newPage();
    page.on('pageerror', (error) => caseResult.pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'font' || /\.css(?:$|\?)/iu.test(request.url())) {
        caseResult.requestFailures.push({ url: request.url(), type: request.resourceType(), error: request.failure()?.errorText ?? null });
      }
    });
    session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    network = attachNetworkCapture(session);

    step = 'open editor route';
    const editorUrl = new URL('/editor', origin).href;
    const response = await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!response || response.status() >= 400) throw new Error(`Editor route returned ${response?.status() ?? 'no response'}.`);
    await page.locator('#editor-canvas-stage').waitFor({ state: 'attached', timeout: 60_000 });
    const fixtureState = await page.evaluate(() => ({
      fixtureApplied: window.__editorFontPreviewQa?.fixtureApplied ?? false,
      seedError: window.__editorFontPreviewQa?.seedError ?? null,
      name: JSON.parse(localStorage.getItem('ff14-adventurer-card:draft:v3') ?? 'null')?.card?.character?.name ?? null,
      locale: localStorage.getItem('ff14-adventurer-card:locale'),
    }));
    caseResult.assertions.push({ label: 'Cold isolated context seeded with the public Coner fixture and requested locale', passed: fixtureState.fixtureApplied && fixtureState.name === 'Coner' && fixtureState.locale === testCase.locale, actual: fixtureState, expected: { fixtureApplied: true, name: 'Coner', locale: testCase.locale } });
    if (!fixtureState.fixtureApplied || fixtureState.name !== 'Coner' || fixtureState.locale !== testCase.locale) throw new Error(`The public fixture did not seed correctly: ${JSON.stringify(fixtureState)}`);

    step = 'open information task';
    await openInformationTask(page, testCase.locale);
    step = 'select localized copy item';
    const fontTrigger = await selectPromiseText(page, testCase.locale);
    await fontTrigger.scrollIntoViewIfNeeded();
    const triggerInfo = await fontTrigger.evaluate((element) => ({
      text: element.textContent?.trim() ?? '',
      ariaLabel: element.getAttribute('aria-label'),
      itemId: element.getAttribute('data-text-font-family'),
      rect: (() => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; })(),
    }));
    caseResult.assertions.push({ label: 'Font picker trigger belongs to the localized public card-copy item', passed: triggerInfo.rect.width > 0 && triggerInfo.rect.height > 0, actual: triggerInfo, expected: { itemId: TEXT_ITEM_ID, visible: true } });

    step = 'snapshot cold resources before opening the picker';
    await waitForRelevantNetworkIdle(page, network);
    const beforePicker = assetTotals(network.getRecords());
    network.setPhase('picker');
    step = 'open font picker';
    await fontTrigger.click();
    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('[role="listbox"]') }).last();
    await dialog.waitFor({ state: 'visible', timeout: 20_000 });
    const search = page.locator('input[role="combobox"]');
    const hasSearch = await search.count() > 0;
    let initialSamples = { listVisible: false, optionCount: 0, states: [] };
    if (hasSearch) {
      step = 'wait for visible picker samples';
      await waitForVisiblePreviews(page).catch((error) => {
        if (build === 'after') throw error;
      });
      initialSamples = await visiblePreviewStates(page);
    } else {
      initialSamples = await page.evaluate(() => ({
        listVisible: Boolean(document.querySelector('[role="listbox"]')),
        optionCount: document.querySelectorAll('[role="option"]').length,
        states: [],
      }));
    }
    caseResult.initialVisibleChoices = initialSamples.optionCount;
    caseResult.initialVisibleSamples = initialSamples.states;
    caseResult.assertions.push({
      label: 'Font picker shows sample choices in this cold context',
      passed: initialSamples.listVisible && initialSamples.optionCount > 0,
      actual: { hasSearch, ...initialSamples },
      expected: 'visible font-choice samples',
    });
    if (hasSearch && build === 'after') {
      const failed = initialSamples.states.filter((sample) => sample.state !== 'ready');
      caseResult.assertions.push({ label: 'Visible current-build font samples reached ready state', passed: initialSamples.states.length > 0 && failed.length === 0, actual: initialSamples.states, expected: 'all visible samples ready' });
      if (initialSamples.states.length === 0 || failed.length > 0) throw new Error(`Some current-build visible font samples did not load: ${JSON.stringify(failed)}`);
    }
    await waitForRelevantNetworkIdle(page, network);
    const afterInitialPreviews = assetTotals(network.getRecords());
    caseResult.popupNetwork = {
      beforeOpen: beforePicker,
      afterVisibleSamplesReady: afterInitialPreviews,
      visibleSampleDelta: assetDelta(beforePicker, afterInitialPreviews),
    };

    step = 'search for the chosen font preview';
    if (hasSearch) await search.fill(testCase.search);
    const targetPreview = page.locator(`[data-font-id="${testCase.fontId}"]`);
    const targetPreviewCount = await targetPreview.count();
    let targetSample = null;
    if (targetPreviewCount > 0) {
      await targetPreview.waitFor({ state: 'visible', timeout: FONT_WAIT_TIMEOUT_MS });
      if (build === 'after') {
        await page.waitForFunction((fontId) => {
          const sample = document.querySelector(`[data-font-id="${fontId}"]`);
          return sample?.getAttribute('data-font-preview-state') === 'ready';
        }, testCase.fontId, { timeout: FONT_WAIT_TIMEOUT_MS });
      }
      targetSample = await targetPreview.evaluate((node) => ({
        fontId: node.getAttribute('data-font-id'),
        state: node.getAttribute('data-font-preview-state'),
        sampleText: node.querySelector('[class*="sample"]')?.textContent ?? '',
        computedFamily: node.querySelector('[class*="sample"]') ? getComputedStyle(node.querySelector('[class*="sample"]')).fontFamily : null,
      }));
    }
    const matchingOption = page.locator('[role="option"]').filter({ hasText: testCase.search }).first();
    await matchingOption.waitFor({ state: 'visible', timeout: 20_000 });
    const optionCount = await page.locator('[role="option"]').count();
    const aliasApplied = targetSample?.state === 'ready' && targetSample.computedFamily?.startsWith(`"${testCase.alias}"`);
    caseResult.targetPreview = { targetPreviewCount, targetSample, aliasApplied, filteredOptionCount: optionCount };
    caseResult.assertions.push({
      label: 'Requested sample font appears in the filtered picker list',
      passed: optionCount >= 1 && (build !== 'after' || targetPreviewCount > 0),
      actual: caseResult.targetPreview,
      expected: { fontId: testCase.fontId, visibleOption: true, ...(build === 'after' ? { alias: testCase.alias, state: 'ready' } : {}) },
    });
    if (build === 'after') {
      caseResult.assertions.push({ label: 'Preview sample uses its generated alias while the picker is open', passed: aliasApplied, actual: targetSample, expected: { fontId: testCase.fontId, state: 'ready', computedFamilyStartsWith: `"${testCase.alias}"` } });
      if (!aliasApplied) throw new Error(`The ready font sample did not use the expected preview alias ${testCase.alias}.`);
    }
    await waitForRelevantNetworkIdle(page, network);
    const afterTargetPreview = assetTotals(network.getRecords());
    caseResult.popupNetwork.afterChosenPreviewReady = afterTargetPreview;
    caseResult.popupNetwork.chosenPreviewDelta = assetDelta(afterInitialPreviews, afterTargetPreview);

    if (screenshots) await captureScreenshot(page, reportDir, `${caseResult.key}-picker.png`, caseResult);
    network.setPhase('selection');
    step = 'apply original font choice';
    await matchingOption.click();
    await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="listbox"]') === null);
    await waitForFontDraft(page, fixture, testCase.fontId, textItemId);
    await waitForRelevantNetworkIdle(page, network);
    const afterFontSelection = assetTotals(network.getRecords());
    caseResult.popupNetwork.afterOriginalSelection = afterFontSelection;
    caseResult.popupNetwork.originalFontLoadDelta = assetDelta(afterTargetPreview, afterFontSelection);
    caseResult.savedFont = await readSavedFont(page, fixture, textItemId);
    caseResult.assertions.push({ label: 'Chosen font ID is persisted as the original source font ID, without a preview alias', passed: caseResult.savedFont.fontFamily === testCase.fontId && !caseResult.savedFont.hasPreviewAlias, actual: caseResult.savedFont, expected: { fontFamily: testCase.fontId, hasPreviewAlias: false } });
    if (caseResult.savedFont.fontFamily !== testCase.fontId || caseResult.savedFont.hasPreviewAlias) throw new Error(`Chosen font did not persist as an original font ID: ${JSON.stringify(caseResult.savedFont)}`);
    caseResult.renderedFont = await page.evaluate((id) => {
      const target = Array.from(document.querySelectorAll('[data-card-text-id]')).find((element) => element.getAttribute('data-card-text-id') === id);
      return target ? {
        text: target.textContent?.trim() ?? '',
        fontFamily: getComputedStyle(target).fontFamily,
        fontWeight: getComputedStyle(target).fontWeight,
        previewAliasUsed: getComputedStyle(target).fontFamily.includes('XIV Preview'),
      } : null;
    }, textItemId);
    caseResult.assertions.push({ label: 'Rendered card copy uses the original selected family, not a preview alias', passed: Boolean(caseResult.renderedFont && !caseResult.renderedFont.previewAliasUsed && caseResult.renderedFont.fontFamily.includes(testCase.locale === 'ko' ? 'Pretendard Variable' : 'Pretendard JP Variable')), actual: caseResult.renderedFont, expected: { family: testCase.locale === 'ko' ? 'Pretendard Variable' : 'Pretendard JP Variable', previewAliasUsed: false } });
    if (screenshots) await captureScreenshot(page, reportDir, `${caseResult.key}-applied.png`, caseResult);

    network.setPhase('export');
    step = 'find and follow the visible image export link';
    const exportLink = page.locator('a[href="/export"]:visible').first();
    await exportLink.waitFor({ state: 'visible', timeout: 20_000 });
    await exportLink.click();
    await page.waitForURL((url) => url.pathname === '/export', { timeout: 30_000 });
    await page.locator('[data-export-state]').waitFor({ state: 'visible', timeout: 30_000 });
    step = 'choose PNG format and 1× export resolution';
    const pngFormat = page.locator('input[name="export-format"][value="png"]');
    await chooseRadio(page, 'input[name="export-format"][value="png"]');
    await chooseRadio(page, 'input[name="export-scale"][value="1"]');
    const pngSelected = await pngFormat.isChecked();
    const oneXSelected = await page.locator('input[name="export-scale"][value="1"]').isChecked();
    caseResult.assertions.push({ label: 'The export is configured as PNG at 1×', passed: pngSelected && oneXSelected, actual: { pngSelected, oneXSelected }, expected: { pngSelected: true, oneXSelected: true } });
    if (!pngSelected || !oneXSelected) throw new Error('Could not select PNG at 1× for the real export.');
    const exportButton = page.locator('aside[aria-labelledby="export-settings-title"] button:not([aria-describedby])').first();
    await exportButton.waitFor({ state: 'visible', timeout: 20_000 });
    step = 'render and download the real PNG export';
    await exportButton.click();
    await page.waitForFunction(() => document.querySelector('[data-export-state="complete"]') !== null, undefined, { timeout: EXPORT_TIMEOUT_MS });
    await page.waitForFunction(() => (window.__editorFontPreviewQa?.downloads?.length ?? 0) > 0, undefined, { timeout: 20_000 });
    caseResult.exportDownload = await extractDownloadedPng(page);
    const pngMagic = caseResult.exportDownload?.magicHex?.startsWith('89504e470d0a1a0a') ?? false;
    caseResult.assertions.push({ label: 'Selecting the original font ID completes a real PNG export without writing to Downloads', passed: pngMagic && caseResult.exportDownload?.size > 0 && caseResult.exportDownload?.downloadCount === 1, actual: caseResult.exportDownload, expected: 'one intercepted non-empty PNG blob with PNG signature' });
    if (!pngMagic || !caseResult.exportDownload?.size) throw new Error(`The export did not produce a readable PNG blob: ${JSON.stringify(caseResult.exportDownload)}`);
    if (screenshots) await captureScreenshot(page, reportDir, `${caseResult.key}-export.png`, caseResult);

    await waitForRelevantNetworkIdle(page, network);
    const afterPngExport = assetTotals(network.getRecords());
    caseResult.popupNetwork.afterPngExport = afterPngExport;
    caseResult.popupNetwork.exportLoadDelta = assetDelta(afterFontSelection, afterPngExport);
    step = 'verify runtime and asset requests';
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    caseResult.network = summarizeNetwork(network.getRecords());
    caseResult.requestFailures = caseResult.requestFailures.slice(0, 100);
    caseResult.assertions.push({ label: 'No uncaught browser runtime errors', passed: caseResult.pageErrors.length === 0, actual: caseResult.pageErrors, expected: [] });
    caseResult.assertions.push({ label: 'No font-preview stylesheet or font request failed', passed: caseResult.requestFailures.length === 0, actual: caseResult.requestFailures, expected: [] });
    if (caseResult.pageErrors.length || caseResult.requestFailures.length) throw new Error('The browser recorded a runtime error or a failed font/CSS request.');
    const failedAssertions = caseResult.assertions.filter((assertion) => !assertion.passed);
    if (failedAssertions.length > 0) throw new Error(`Font QA assertions failed: ${failedAssertions.map((assertion) => assertion.label).join('; ')}`);
    caseResult.passed = true;
  } catch (error) {
    caseResult.failedAt = step;
    caseResult.error = error instanceof Error ? error.stack ?? error.message : String(error);
    if (network && !caseResult.network) {
      try { caseResult.network = summarizeNetwork(network.getRecords()); } catch { /* Keep the original failure. */ }
    }
    if (page) {
      try {
        caseResult.failureSnapshot = await page.evaluate(() => ({
          url: location.href,
          activeTask: document.querySelector('[data-active-task]')?.getAttribute('data-active-task') ?? null,
          textEditorId: document.querySelector('[data-text-typography-editor]')?.getAttribute('data-text-typography-editor') ?? null,
          textItemSelect: document.querySelector('[data-text-item-select]')?.value ?? null,
          fontTriggers: Array.from(document.querySelectorAll('[data-text-font-family]')).map((element) => ({
            itemId: element.getAttribute('data-text-font-family'),
            ariaLabel: element.getAttribute('aria-label'),
            visible: element.getClientRects().length > 0,
          })),
          exportLinks: Array.from(document.querySelectorAll('a[href="/export"]')).map((element) => ({ text: element.textContent?.trim() ?? '', visible: element.getClientRects().length > 0 })),
          exportState: document.querySelector('[data-export-state]')?.getAttribute('data-export-state') ?? null,
          dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map((element) => ({ label: element.getAttribute('aria-label'), visible: element.getClientRects().length > 0 })),
        }));
      } catch { /* Keep the original failure. */ }
    }
    if (page && screenshots) {
      try { await captureScreenshot(page, reportDir, `${caseResult.key}-failed.png`, caseResult); } catch (screenshotError) {
        caseResult.screenshotError = screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
      }
    }
  } finally {
    caseResult.durationMs = Date.now() - started;
    if (session) await session.detach().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
  return caseResult;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const beforeOrigin = assertLoopbackUrl(options.before, '--before');
  const afterOrigin = assertLoopbackUrl(options.after, '--after');
  const reportDir = resolveReportDir(options.reportDir);
  const fixturePath = path.join(root, FONT_FIXTURE_PATH);
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  if (fixture.storage?.payload?.card?.character?.name !== 'Coner' || typeof fixture.storage?.serializedDraft !== 'string') {
    throw new Error(`${FONT_FIXTURE_PATH} is missing its canonical public Coner draft.`);
  }

  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true, channel: process.env.EDITOR_QA_BROWSER_CHANNEL ?? 'chrome' });
  const report = {
    schema: 'editor-font-preview-browser-qa-v1',
    startedAt: new Date().toISOString(),
    browser: { channel: process.env.EDITOR_QA_BROWSER_CHANNEL ?? 'chrome', isolatedColdContextPerCase: true, persistentProfile: false },
    fixture: { source: FONT_FIXTURE_PATH, name: 'public-coner-cinematic-4x5', characterName: 'Coner', imageUrl: fixture.expectedCard.imageUrl },
    builds: { before: beforeOrigin.origin, after: afterOrigin.origin },
    cases: [],
    passed: 0,
    failed: 0,
  };
  const reportPath = path.join(reportDir, 'report.json');
  const persistProgress = async () => {
    report.updatedAt = new Date().toISOString();
    report.passed = report.cases.filter((result) => result.passed).length;
    report.failed = report.cases.filter((result) => !result.passed).length;
    await mkdir(reportDir, { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  };
  const buildsToRun = options.build === 'both' ? ['before', 'after'] : [options.build];
  const testCases = options.caseKey
    ? FONT_CASES.filter((testCase) => `${testCase.locale}-${testCase.viewport}` === options.caseKey)
    : FONT_CASES;

  try {
    for (const build of buildsToRun) {
      const origin = build === 'before' ? beforeOrigin.origin : afterOrigin.origin;
      for (const testCase of testCases) {
        const result = await runCase(browser, build, origin, testCase, fixture, reportDir, options.screenshots);
        report.cases.push(result);
        await persistProgress();
        process.stdout.write(`${JSON.stringify({
          case: result.key,
          passed: result.passed,
          durationMs: result.durationMs,
          failedAt: result.failedAt ?? null,
          error: result.error?.split('\n')[0] ?? null,
          visibleSampleDelta: result.popupNetwork?.visibleSampleDelta ?? null,
          chosenPreviewDelta: result.popupNetwork?.chosenPreviewDelta ?? null,
          originalFontLoadDelta: result.popupNetwork?.originalFontLoadDelta ?? null,
          exportLoadDelta: result.popupNetwork?.exportLoadDelta ?? null,
        })}\n`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  report.finishedAt = new Date().toISOString();
  report.passed = report.cases.filter((result) => result.passed).length;
  report.failed = report.cases.length - report.passed;
  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ report: path.relative(root, reportPath).replaceAll('\\', '/'), passed: report.passed, failed: report.failed }, null, 2)}\n`);
  if (report.failed > 0) process.exitCode = 1;
}

await main();

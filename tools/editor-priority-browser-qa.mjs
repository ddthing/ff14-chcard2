import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromProject = createRequire(path.join(root, 'package.json'));
const DEFAULT_BASE_URL = 'http://127.0.0.1:4333';
const DEFAULT_REPORT_DIR = 'tmp/priority-browser-qa';
const WAIT_TIMEOUT_MS = 20_000;

function usage() {
  return [
    'Usage: node tools/editor-priority-browser-qa.mjs [options]',
    '',
    `  --base-url <url>       Local app origin (default: ${DEFAULT_BASE_URL})`,
    `  --report-dir <path>    JSON report and optional screenshots (default: ${DEFAULT_REPORT_DIR})`,
    '  --core-only            Run the guide-shortcut and same-document draft regressions only',
    '  --screenshots          Save desktop and mobile regression screenshots',
    '  --phase4               Include in-progress native text-select and card-badge checks',
    '  --help                 Show this help',
    '',
    'Playwright can be loaded from EDITOR_QA_NODE_MODULES (a node_modules directory)',
    'or from this project. Chrome must be installed; EDITOR_QA_CHROME_EXECUTABLE_PATH',
    'can point to an installed Chrome executable when it is not on Playwright’s channel path.',
  ].join('\n');
}

function parseArgs(args) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    reportDir: DEFAULT_REPORT_DIR,
    screenshots: false,
    coreOnly: false,
    phase4: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--screenshots') {
      options.screenshots = true;
    } else if (arg === '--core-only') {
      options.coreOnly = true;
    } else if (arg === '--phase4') {
      options.phase4 = true;
    } else if (arg === '--base-url' || arg === '--report-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      index += 1;
      if (arg === '--base-url') options.baseUrl = value;
      else options.reportDir = value;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg.startsWith('--report-dir=')) {
      options.reportDir = arg.slice('--report-dir='.length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.coreOnly && options.phase4) throw new Error('--core-only cannot be combined with --phase4.');
  return options;
}

function loadPlaywright() {
  const moduleDirectory = process.env.EDITOR_QA_NODE_MODULES?.trim();
  const candidates = [];
  if (moduleDirectory) {
    const resolvedDirectory = path.resolve(moduleDirectory);
    candidates.push(path.join(resolvedDirectory, 'playwright'));
    candidates.push(path.join(resolvedDirectory, 'playwright-core'));
    candidates.push(path.join(resolvedDirectory, 'node_modules', 'playwright'));
    candidates.push(path.join(resolvedDirectory, 'node_modules', 'playwright-core'));
  }

  for (const candidate of candidates) {
    try {
      return requireFromProject(candidate);
    } catch {
      // Try the next bundled or project-local package location.
    }
  }

  for (const packageName of ['playwright', 'playwright-core']) {
    try {
      return requireFromProject(packageName);
    } catch {
      // The diagnostic below names the supported installation paths.
    }
  }

  throw new Error(
    'Playwright was not found. Set EDITOR_QA_NODE_MODULES to a node_modules directory containing playwright or playwright-core.',
  );
}

function assertLocalBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid --base-url: ${value}`);
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (!['http:', 'https:'].includes(url.protocol) || !loopbackHosts.has(url.hostname) || url.username || url.password) {
    throw new Error('--base-url must use a loopback host (localhost, 127.0.0.1, or ::1) and must not include credentials.');
  }

  return url;
}

function editorUrlFor(baseUrl) {
  if (baseUrl.pathname === '/' || baseUrl.pathname === '') {
    const editorUrl = new URL('/editor', baseUrl);
    editorUrl.search = baseUrl.search;
    return editorUrl;
  }
  return baseUrl;
}

function fixtureInitScript(fixture) {
  const serializedFixture = JSON.stringify(fixture);
  return `(() => {
    const fixture = ${serializedFixture};
    if (window.location.origin !== fixture.origin || window.location.pathname !== fixture.pathname) return;
    try {
      window.localStorage.setItem(fixture.draftKey, fixture.serializedDraft);
      window.localStorage.setItem(fixture.localeKey, 'ko');
      window.sessionStorage.setItem(fixture.localeKey, 'ko');
      window.localStorage.setItem(fixture.appearanceKey, 'system');
      window.__editorPriorityQaSeed = { applied: true, fixture: fixture.fixtureName };
    } catch (error) {
      window.__editorPriorityQaSeed = { applied: false, error: String(error) };
    }
  })();`;
}

function safeValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function verify(result, label, condition, actual, expected = true) {
  const assertion = { label, passed: Boolean(condition), actual: safeValue(actual), expected: safeValue(expected) };
  result.assertions.push(assertion);
  if (!condition) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function equal(result, label, actual, expected) {
  const safeActual = safeValue(actual);
  const safeExpected = safeValue(expected);
  verify(result, label, JSON.stringify(safeActual) === JSON.stringify(safeExpected), safeActual, safeExpected);
}

async function openEditor(browser, fixture, url, viewport, result) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: Boolean(viewport.isMobile),
    hasTouch: Boolean(viewport.hasTouch),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_TIMEOUT_MS);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.addInitScript(fixtureInitScript(fixture));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('#editor-inspector').waitFor({ state: 'attached' });
  await page.waitForFunction(() => {
    const seed = window.__editorPriorityQaSeed;
    return seed?.applied === true || seed?.applied === false;
  });
  const seedStatus = await page.evaluate(() => window.__editorPriorityQaSeed ?? null);
  verify(result, 'Isolated public fixture seeded in this browser context', seedStatus?.applied === true, seedStatus, { applied: true, fixture: 'public-coner-cinematic-4x5' });
  return { context, page, pageErrors };
}

async function activateTask(page, task, mobile = false) {
  const tabIds = mobile
    ? [`editor-task-tab-mobile-${task}`]
    : [`editor-task-tab-desktop-${task}`, `editor-task-tab-inspector-${task}`];
  let tab;
  for (const id of tabIds) {
    const candidate = page.locator(`#${id}`);
    if (await candidate.isVisible().catch(() => false)) {
      tab = candidate;
      break;
    }
  }
  if (!tab) throw new Error(`No visible ${mobile ? 'mobile' : 'desktop or compact-inspector'} task tab was found for ${task}: ${tabIds.map((id) => `#${id}`).join(', ')}.`);
  await tab.click();
  await page.waitForFunction(() => document.querySelector('#editor-inspector')?.getAttribute('data-state') === 'open');
  return tab;
}

async function currentFocus(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement ? { id: active.id, label: active.getAttribute('aria-label'), tag: active.tagName.toLowerCase() } : null;
  });
}

function numberFromAccessibleValue(value) {
  const match = typeof value === 'string' ? value.match(/-?\d+(?:[.,]\d+)?/u) : null;
  return match ? Number(match[0].replace(',', '.')) : null;
}

async function accessibleNumber(locator) {
  return numberFromAccessibleValue(await locator.getAttribute('aria-valuetext'));
}

async function waitForAccessibleNumber(page, selector, expected) {
  await page.waitForFunction(({ targetSelector, expectedValue }) => {
    const value = document.querySelector(targetSelector)?.getAttribute('aria-valuetext') ?? '';
    const match = value.match(/-?\d+(?:[.,]\d+)?/u);
    return Boolean(match && Number(match[0].replace(',', '.')) === expectedValue);
  }, { targetSelector: selector, expectedValue: expected });
}

async function captureScreenshot(page, reportDir, name, result) {
  const destination = path.join(reportDir, 'screenshots', `${name}.png`);
  await mkdir(path.dirname(destination), { recursive: true });
  await page.screenshot({ path: destination, fullPage: true, animations: 'disabled' });
  result.screenshot = path.relative(root, destination).replaceAll('\\', '/');
}

async function runScenario(browser, options) {
  const result = {
    name: options.name,
    passed: false,
    durationMs: 0,
    assertions: [],
    pageErrors: [],
  };
  const startedAt = Date.now();
  let context;
  let page;

  try {
    ({ context, page, pageErrors: result.pageErrors } = await openEditor(
      browser,
      options.fixture,
      options.editorUrl,
      options.viewport,
      result,
    ));
    await options.run(page, result);
    verify(result, 'No uncaught browser runtime errors', result.pageErrors.length === 0, result.pageErrors, []);
    if (options.screenshotName && options.captureScreenshots) {
      await captureScreenshot(page, options.reportDir, options.screenshotName, result);
    }
    result.passed = true;
  } catch (error) {
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    if (page && options.screenshotName && options.captureScreenshots) {
      try {
        await captureScreenshot(page, options.reportDir, `${options.screenshotName}-failed`, result);
      } catch (screenshotError) {
        result.screenshotError = screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
      }
    }
  } finally {
    result.durationMs = Date.now() - startedAt;
    if (context) {
      try {
        await context.close();
      } catch (error) {
        result.closeError = error instanceof Error ? error.message : String(error);
        result.passed = false;
      }
    }
  }

  return result;
}

async function inspectViewport(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
    const page = document.querySelector('[data-compact-viewport]');
    const pageRect = page?.getBoundingClientRect();
    const moreTab = document.querySelector('#editor-task-tab-mobile-more');
    const dock = moreTab?.closest('nav')?.parentElement ?? null;
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const header = document.querySelector('header[data-editor-header="true"]');
    const headerRect = header?.getBoundingClientRect();
    const menuButton = header?.querySelector('button[aria-expanded]');
    const menuRect = menuButton?.getBoundingClientRect();
    const density = getComputedStyle(document.documentElement);
    const buttons = Array.from(document.querySelectorAll('#editor-task-tab-mobile-photo, #editor-task-tab-mobile-information, #editor-task-tab-mobile-design, #editor-task-tab-mobile-more'))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          id: button.id,
          disabled: button instanceof HTMLButtonElement ? button.disabled : false,
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          visible: rect.width > 0 && rect.height > 0 && getComputedStyle(button).visibility !== 'hidden',
        };
      });
    return {
      width,
      height,
      documentWidth,
      page: pageRect ? { x: pageRect.x, y: pageRect.y, right: pageRect.right, bottom: pageRect.bottom, width: pageRect.width, height: pageRect.height } : null,
      dockDisplay: dockStyle?.display ?? null,
      headerHeight: headerRect?.height ?? null,
      densityTokens: {
        headerHeight: density.getPropertyValue('--editor-density-header-height').trim(),
        controlHeight: density.getPropertyValue('--editor-density-control-height').trim(),
        iconTarget: density.getPropertyValue('--editor-density-icon-target').trim(),
      },
      headerMenuTarget: menuRect ? { width: menuRect.width, height: menuRect.height } : null,
      dockButtons: buttons,
    };
  });
}

function checkNoHorizontalOverflow(result, geometry, label) {
  verify(result, `${label}: document has no horizontal overflow`, geometry.documentWidth <= geometry.width + 1, geometry.documentWidth, geometry.width);
}

function checkDockGeometry(result, geometry, label) {
  const visibleButtons = geometry.dockButtons.filter((button) => button.visible);
  verify(result, `${label}: mobile dock is visible`, geometry.dockDisplay !== 'none' && visibleButtons.length >= 4, {
    display: geometry.dockDisplay,
    visibleButtonCount: visibleButtons.length,
  }, 'visible dock with four actions');
  for (const button of visibleButtons) {
    verify(result, `${label}: ${button.id} is in the viewport`, button.x >= -1 && button.right <= geometry.width + 1 && button.y >= -1 && button.bottom <= geometry.height + 1, button, 'fully visible');
    verify(result, `${label}: ${button.id} meets the 44px touch target`, button.width >= 44 && button.height >= 44, { width: button.width, height: button.height }, 'at least 44×44 CSS px');
    verify(result, `${label}: ${button.id} is enabled`, !button.disabled, button.disabled, false);
  }
  for (let first = 0; first < visibleButtons.length; first += 1) {
    for (let second = first + 1; second < visibleButtons.length; second += 1) {
      const a = visibleButtons[first];
      const b = visibleButtons[second];
      const overlaps = Math.min(a.right, b.right) > Math.max(a.x, b.x) && Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y);
      verify(result, `${label}: ${a.id} and ${b.id} do not overlap`, !overlaps, overlaps, false);
    }
  }
}

function checkMobileDensity(result, geometry, label) {
  equal(result, `${label}: touch header is 56px`, geometry.headerHeight, 56);
  equal(result, `${label}: density header token is 56px`, geometry.densityTokens?.headerHeight, '56px');
  equal(result, `${label}: touch control token is 44px`, geometry.densityTokens?.controlHeight, '44px');
  equal(result, `${label}: touch icon target token is 44px`, geometry.densityTokens?.iconTarget, '44px');
  verify(result, `${label}: mobile header menu target is at least 44×44px`, geometry.headerMenuTarget?.width >= 44 && geometry.headerMenuTarget?.height >= 44, geometry.headerMenuTarget, 'at least 44×44 CSS px');
}

async function inspectDensity(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const header = document.querySelector('header[data-editor-header="true"]');
    const style = getComputedStyle(document.documentElement);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      header: rect(header),
      guideButton: rect(header?.querySelector('button[aria-label="사용법"]')),
      mobileMenuButton: rect(header?.querySelector('button[aria-expanded]')),
      tokens: {
        headerHeight: style.getPropertyValue('--editor-density-header-height').trim(),
        controlHeight: style.getPropertyValue('--editor-density-control-height').trim(),
        iconTarget: style.getPropertyValue('--editor-density-icon-target').trim(),
      },
      pointerFine: matchMedia('(pointer: fine)').matches,
      pointerCoarse: matchMedia('(pointer: coarse)').matches,
      anyPointerCoarse: matchMedia('(any-pointer: coarse)').matches,
    };
  });
}

function checkFineDesktopDensity(result, density, control, label) {
  equal(result, `${label}: fine desktop header is 48px`, density.header?.height, 48);
  equal(result, `${label}: desktop header density token is 48px`, density.tokens.headerHeight, '48px');
  equal(result, `${label}: fine desktop control density token is 36px`, density.tokens.controlHeight, '36px');
  equal(result, `${label}: fine desktop icon target token is 32px`, density.tokens.iconTarget, '32px');
  verify(result, `${label}: guide icon target is 32×32px`, density.guideButton?.width === 32 && density.guideButton?.height === 32, density.guideButton, '32×32 CSS px');
  verify(result, `${label}: photo slider and numeric hit parent are 36px high`, control.range.height === 36 && control.number.wrapper?.height === 36, {
    sliderHeight: control.range.height,
    numericWrapperHeight: control.number.wrapper?.height,
    numericInputHeight: control.number.input.height,
    numericWrapperHasBorder: control.number.wrapperHasBorder,
  }, '36px slider and bordered numeric parent');
}

function checkTouchDensity(result, density, control, label) {
  equal(result, `${label}: touch header is 56px`, density.header?.height, 56);
  equal(result, `${label}: touch header density token is 56px`, density.tokens.headerHeight, '56px');
  equal(result, `${label}: touch control density token is 44px`, density.tokens.controlHeight, '44px');
  equal(result, `${label}: touch icon target token is 44px`, density.tokens.iconTarget, '44px');
  verify(result, `${label}: mobile menu target is 44×44px`, density.mobileMenuButton?.width === 44 && density.mobileMenuButton?.height === 44, density.mobileMenuButton, '44×44 CSS px');
  verify(result, `${label}: photo slider and numeric hit parent are at least 44px high`, control.range.height >= 44 && control.number.wrapper?.height >= 44, {
    sliderHeight: control.range.height,
    numericWrapperHeight: control.number.wrapper?.height,
    numericInputHeight: control.number.input.height,
    numericWrapperHasBorder: control.number.wrapperHasBorder,
  }, 'at least 44px slider and bordered numeric parent');
}

async function runMobileMoreSheetCheck(page, result) {
  const moreTab = page.locator('#editor-task-tab-mobile-more');
  await moreTab.click();
  await page.waitForFunction(() => document.querySelector('#editor-task-tab-mobile-more')?.getAttribute('aria-expanded') === 'true');
  const fitAction = page.getByRole('button', { name: '캔버스 맞춤', exact: true });
  await fitAction.waitFor({ state: 'visible' });
  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const more = document.querySelector('#editor-task-tab-mobile-more');
    const dock = more?.closest('nav')?.parentElement ?? null;
    const inspector = document.querySelector('#editor-inspector');
    const body = document.querySelector('#editor-inspector-body');
    const action = Array.from(inspector?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('캔버스 맞춤')) ?? null;
    const dockRect = rect(dock);
    const inspectorRect = rect(inspector);
    const viewportRect = { x: 0, y: 0, right: window.innerWidth, bottom: window.innerHeight };
    const intersect = (first, second) => {
      if (!first || !second) return null;
      const x = Math.max(first.x, second.x);
      const y = Math.max(first.y, second.y);
      const right = Math.min(first.right, second.right);
      const bottom = Math.min(first.bottom, second.bottom);
      return right > x && bottom > y ? { x, y, right, bottom } : null;
    };
    const bodyRect = rect(body);
    const visibleButtonRegions = Array.from(inspector?.querySelectorAll('button') ?? []).map((button) => {
      const bounds = rect(button);
      const clippedToBody = intersect(bounds, bodyRect);
      const visibleBounds = intersect(clippedToBody, viewportRect);
      return {
        label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
        bounds,
        visibleBounds,
        overlapsDock: Boolean(intersect(visibleBounds, dockRect)),
      };
    }).filter((button) => button.visibleBounds);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      moreExpanded: more?.getAttribute('aria-expanded') === 'true',
      inspectorOpen: inspector?.getAttribute('data-state') === 'open',
      actionInInspector: Boolean(action && inspector?.contains(action)),
      actionInInspectorBody: Boolean(action && body?.contains(action)),
      actionInsideDock: Boolean(action && dock?.contains(action)),
      action: rect(action),
      inspector: inspectorRect,
      dock: dockRect,
      visibleButtonRegions,
      buttonsOverlappingDock: visibleButtonRegions.filter((button) => button.overlapsDock),
      dockDisplay: dock ? getComputedStyle(dock).display : null,
      verticalGap: dockRect && inspectorRect ? dockRect.y - inspectorRect.bottom : null,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    };
  });
  verify(result, 'Mobile More opens its own inspector sheet while the dock remains a separate region', geometry.moreExpanded && geometry.inspectorOpen && geometry.actionInInspectorBody && !geometry.actionInsideDock && geometry.dockDisplay !== 'none', geometry, 'expanded More sheet action inside the inspector, outside the dock');
  verify(result, 'Mobile More panel edge overlap stays within 1 CSS px and no visible buttons overlap the dock', geometry.verticalGap >= -1 && geometry.buttonsOverlappingDock.length === 0, geometry, 'panel edge overlap is no more than 1 CSS px; every visible button hit region remains clear of the dock');
  verify(result, 'The More action button remains fully above the dock', geometry.action?.y >= geometry.inspector?.y && geometry.action?.bottom <= geometry.dock?.y, geometry, 'action hit region fully separated from the dock');
  verify(result, 'Mobile More sheet has no horizontal document overflow', geometry.documentWidth <= geometry.width + 1, geometry.documentWidth, geometry.width);
  await moreTab.click();
  await page.waitForFunction(() => document.querySelector('#editor-task-tab-mobile-more')?.getAttribute('aria-expanded') === 'false' && document.querySelector('#editor-inspector')?.getAttribute('data-state') === 'closing');
}

async function readControlGeometry(page) {
  const range = page.getByRole('slider', { name: '사진 확대 값', exact: true });
  const exactNumberInput = page.getByLabel('사진 확대 값 (%)', { exact: true });
  const [rangeRect, numberRect] = await Promise.all([
    range.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }),
    exactNumberInput.evaluate((element) => {
      const inputRect = element.getBoundingClientRect();
      const wrapper = element.parentElement;
      const wrapperRect = wrapper?.getBoundingClientRect();
      const borderWidth = wrapper ? Number.parseFloat(getComputedStyle(wrapper).borderTopWidth) || 0 : 0;
      return {
        input: { x: inputRect.x, y: inputRect.y, right: inputRect.right, bottom: inputRect.bottom, width: inputRect.width, height: inputRect.height },
        wrapper: wrapperRect ? { x: wrapperRect.x, y: wrapperRect.y, right: wrapperRect.right, bottom: wrapperRect.bottom, width: wrapperRect.width, height: wrapperRect.height } : null,
        wrapperHasBorder: borderWidth > 0,
      };
    }),
  ]);
  return { range: rangeRect, number: numberRect };
}

async function runGuideShortcutScenario(page, result) {
  await activateTask(page, 'photo');
  const xSlider = page.getByRole('slider', { name: '가로 위치 값', exact: true });
  equal(result, 'Horizontal position begins at the Coner fixture default', await xSlider.inputValue(), '50');
  await xSlider.focus();
  await xSlider.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#editor-inspector input[type="range"][aria-label="가로 위치 값"]')?.value === '51');
  equal(result, 'ArrowRight adjusts the focused horizontal slider from 50 to 51', await xSlider.inputValue(), '51');

  const guideTrigger = page.getByRole('button', { name: '사용법', exact: true });
  await guideTrigger.click();
  const guide = page.locator('dialog[open]');
  await guide.waitFor({ state: 'visible' });
  await page.keyboard.press('Control+z');
  equal(result, 'Undo shortcut leaves the native guide open', await guide.count(), 1);
  equal(result, 'Undo shortcut inside the guide does not undo the prior slider edit', await xSlider.inputValue(), '51');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('dialog[open]') === null);
  equal(result, 'Escape closes the guide while keeping the inspector open', await page.locator('#editor-inspector').getAttribute('data-state'), 'open');
  equal(result, 'Guide close restores focus to the 사용법 trigger', (await currentFocus(page)).label, '사용법');
  equal(result, 'Guide close preserves the edited slider value', await xSlider.inputValue(), '51');
}

async function runSameDocumentDraftScenario(page, result) {
  const initial = await page.evaluate(() => ({
    width: window.innerWidth,
    timeOrigin: performance.timeOrigin,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
  equal(result, 'Touch-emulated page starts at the 901px desktop side of the breakpoint', initial.width, 901);
  verify(result, 'The same browser context has touch input enabled', initial.maxTouchPoints > 0, initial.maxTouchPoints, 'at least one touch point');
  equal(result, 'The initial document is not in the mobile breakpoint', await page.evaluate(() => window.matchMedia('(max-width: 900px)').matches), false);
  checkMobileDensity(result, await inspectViewport(page), '901px touch desktop');
  await activateTask(page, 'photo');

  await page.setViewportSize({ width: 900, height: 844 });
  await page.waitForFunction(() => window.innerWidth === 900 && window.matchMedia('(max-width: 900px)').matches);
  await page.locator('#editor-task-tab-mobile-photo').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#editor-inspector')?.getAttribute('data-state') === 'open');
  const mobileGeometry = await inspectViewport(page);
  checkMobileDensity(result, mobileGeometry, '900px touch mobile');
  checkDockGeometry(result, mobileGeometry, '900px touch mobile');
  const afterResize = await page.evaluate(() => ({
    width: window.innerWidth,
    timeOrigin: performance.timeOrigin,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
  verify(result, 'The same touch document crosses 901→900 without navigation', afterResize.timeOrigin === initial.timeOrigin, afterResize, { width: 900, timeOrigin: initial.timeOrigin });
  equal(result, 'The same document now uses the 900px mobile breakpoint', afterResize.width, 900);
  equal(result, 'Touch emulation stays constant across the viewport breakpoint', afterResize.maxTouchPoints, initial.maxTouchPoints);

  const scaleInput = page.getByLabel('사진 확대 값 (%)', { exact: true });
  const scaleSlider = page.getByRole('slider', { name: '사진 확대 값', exact: true });
  const scaleSliderSelector = '#editor-inspector input[type="range"][aria-label="사진 확대 값"]';
  await scaleInput.focus();
  await scaleInput.fill('9');
  equal(result, 'Out-of-range draft digit 9 remains visible in the active input', await scaleInput.inputValue(), '9');
  equal(result, 'The 9 draft does not prematurely change the applied photo scale', await accessibleNumber(scaleSlider), 100);
  equal(result, 'The raw draft keeps focus in the open sheet', await page.evaluate(() => document.activeElement?.getAttribute('data-editor-numeric-input')), 'true');
  equal(result, 'The inspector remains open while the numeric draft is active', await page.locator('#editor-inspector').getAttribute('data-state'), 'open');

  await scaleInput.press('0');
  await waitForAccessibleNumber(page, scaleSliderSelector, 90);
  equal(result, 'Completing the draft as 90 applies 90 percent', await accessibleNumber(scaleSlider), 90);
  await page.keyboard.press('Tab');
  equal(result, 'Tab commits the raw draft before history navigation', await accessibleNumber(scaleSlider), 90);
  await page.keyboard.press('Control+z');
  await waitForAccessibleNumber(page, scaleSliderSelector, 100);
  equal(result, 'Tab commits the draft as one undoable edit', await accessibleNumber(scaleSlider), 100);
  await page.keyboard.press('Control+Shift+z');
  await waitForAccessibleNumber(page, scaleSliderSelector, 90);
  equal(result, 'Redo reapplies the committed 90 percent scale', await accessibleNumber(scaleSlider), 90);
  equal(result, 'Viewport and history edits preserved performance.timeOrigin', await page.evaluate(() => performance.timeOrigin), initial.timeOrigin);
}

async function runNavigatorBreakpointScenario(page, result) {
  await page.waitForFunction(() => document.querySelector('[data-compact-navigator="true"]') !== null);
  await activateTask(page, 'photo');
  checkFineDesktopDensity(result, await inspectDensity(page), await readControlGeometry(page), '1180px compact desktop');
  const trigger = page.locator('#editor-navigator-open');
  await trigger.waitFor({ state: 'visible' });
  await trigger.click();
  await page.waitForFunction(() => document.querySelector('[data-navigator-open="true"]') !== null);
  const close = page.getByRole('button', { name: '항목 닫기', exact: true });
  await close.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '항목 닫기');
  equal(result, 'Opening the compact navigator focuses its close control', await currentFocus(page), { id: '', label: '항목 닫기', tag: 'button' });

  await close.click();
  await page.waitForFunction(() => document.querySelector('[data-navigator-open="false"]') !== null && document.activeElement?.id === 'editor-navigator-open');
  equal(result, 'Closing the compact navigator restores focus to its trigger', (await currentFocus(page)).id, 'editor-navigator-open');

  await page.setViewportSize({ width: 1181, height: 900 });
  await page.waitForFunction(() => window.innerWidth === 1181 && document.querySelector('[data-compact-navigator="false"]') !== null);
  const collapse = page.locator('#editor-navigator-collapse');
  await collapse.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'editor-navigator-collapse');
  checkFineDesktopDensity(result, await inspectDensity(page), await readControlGeometry(page), '1181px compact-to-desktop boundary');
  equal(result, 'The 1180→1181 breakpoint transfers focus to the visible desktop collapse control', await currentFocus(page), { id: 'editor-navigator-collapse', label: '편집 항목 접기', tag: 'button' });
  equal(result, 'Navigator stays expanded after focus transfers to its desktop control', await page.locator('#editor-navigator').getAttribute('aria-hidden'), 'false');

  await collapse.click();
  await page.waitForFunction(() => document.querySelector('[data-navigator-collapsed="true"]') !== null && document.activeElement?.id === 'editor-navigator-open');
  const rail = page.locator('#editor-task-tab-desktop-photo');
  await rail.waitFor({ state: 'visible' });
  equal(result, 'Collapsing the layer navigator hides only its panel', await page.locator('#editor-navigator').getAttribute('aria-hidden'), 'true');
  verify(result, 'The desktop tool rail remains visible after navigator collapse', await rail.isVisible(), true, true);

  await page.locator('#editor-navigator-open').click();
  await page.waitForFunction(() => document.querySelector('[data-navigator-collapsed="false"]') !== null && document.activeElement?.id === 'editor-navigator-collapse');
  equal(result, 'Reopening the layer navigator preserves its desktop rail', await page.locator('#editor-navigator').getAttribute('aria-hidden'), 'false');
  verify(result, 'The photo tool remains in the rail after reopening navigation', await rail.isVisible(), true, true);
}

async function readActiveFocusGeometry(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const bounds = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    const hiddenByInert = Boolean(active.closest('[inert]'));
    const hiddenByAriaHidden = Boolean(active.closest('[aria-hidden="true"]'));
    return {
      id: active.id,
      label: active.getAttribute('aria-label'),
      tag: active.tagName.toLowerCase(),
      isDocumentRoot: active === document.body || active === document.documentElement,
      visible: bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        && bounds.x >= 0 && bounds.y >= 0 && bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight,
      hiddenByInert,
      hiddenByAriaHidden,
      bounds: { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height },
    };
  });
}

async function runSameDocumentNavigatorFocusScenario(page, result) {
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.waitForFunction(() => window.innerWidth === 1200 && document.querySelector('[data-compact-navigator="false"]') !== null);
  await activateTask(page, 'photo');

  const desktopRow = page.locator('#editor-navigator nav button[aria-pressed]').first();
  await desktopRow.waitFor({ state: 'visible' });
  await desktopRow.focus();
  const desktopFocus = await readActiveFocusGeometry(page);
  verify(result, '1200px setup focuses a visible row inside the expanded desktop navigator', Boolean(desktopFocus && !desktopFocus.isDocumentRoot && desktopFocus.visible && !desktopFocus.hiddenByInert && !desktopFocus.hiddenByAriaHidden) && await desktopRow.evaluate((element) => element === document.activeElement), desktopFocus, 'visible focused desktop navigator row');

  await page.setViewportSize({ width: 1180, height: 900 });
  await page.waitForFunction(() => window.innerWidth === 1180 && document.querySelector('[data-compact-navigator="true"]') !== null && document.querySelector('#editor-navigator-open') !== null && document.activeElement?.id === 'editor-navigator-open');
  const compactFocus = await readActiveFocusGeometry(page);
  verify(result, 'Same-document 1200→1180 moves focus from the now-hidden desktop row to the visible compact navigator trigger', compactFocus?.id === 'editor-navigator-open' && compactFocus.visible && !compactFocus.isDocumentRoot && !compactFocus.hiddenByInert && !compactFocus.hiddenByAriaHidden, compactFocus, 'visible editor-navigator-open focused');

  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForFunction(() => window.innerWidth === 1000 && document.querySelector('[data-compact-navigator="true"]') !== null);
  const trigger = page.locator('#editor-navigator-open');
  await trigger.click();
  await page.waitForFunction(() => document.querySelector('[data-navigator-open="true"]') !== null);
  const drawerRow = page.locator('#editor-navigator nav button[aria-pressed]').first();
  await drawerRow.waitFor({ state: 'visible' });
  await drawerRow.focus();
  await page.waitForFunction(() => document.querySelector('#editor-navigator')?.contains(document.activeElement));
  const drawerFocus = await readActiveFocusGeometry(page);
  verify(result, '1000px compact drawer setup focuses a visible row inside the open navigator', Boolean(drawerFocus && !drawerFocus.isDocumentRoot && drawerFocus.visible && !drawerFocus.hiddenByInert && !drawerFocus.hiddenByAriaHidden) && await drawerRow.evaluate((element) => element === document.activeElement), drawerFocus, 'visible focused compact drawer row');

  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForFunction(() => window.innerWidth === 900
    && window.matchMedia('(max-width: 900px)').matches
    && document.querySelector('[data-navigator-open="false"]') !== null
    && document.activeElement?.id === 'editor-task-tab-mobile-photo');
  const mobileFocus = await readActiveFocusGeometry(page);
  verify(result, 'Same-document 1000→900 moves focus out of the closed compact drawer to the visible mobile task dock', mobileFocus?.id === 'editor-task-tab-mobile-photo' && mobileFocus.visible && !mobileFocus.isDocumentRoot && !mobileFocus.hiddenByInert && !mobileFocus.hiddenByAriaHidden, mobileFocus, 'visible editor-task-tab-mobile-photo focused');
  verify(result, 'Navigator breakpoint focus transfers preserve the same document', await page.evaluate(() => performance.timeOrigin), timeOrigin, timeOrigin);
}

async function runResponsiveViewportScenario(page, result) {
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction((expectedWidth) => window.innerWidth === expectedWidth, width);
    const geometry = await inspectViewport(page);
    checkNoHorizontalOverflow(result, geometry, `${width}×844 mobile`);
    checkMobileDensity(result, geometry, `${width}×844 mobile`);
    checkDockGeometry(result, geometry, `${width}×844 mobile`);
    if (width === 390) await runMobileMoreSheetCheck(page, result);
  }

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.innerWidth === 844 && window.innerHeight === 390);
  await activateTask(page, 'information', true);
  checkMobileDensity(result, await inspectViewport(page), '844×390 landscape touch');
  const nameInput = page.locator('#editor-inspector [data-editor-field="name"]');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.scrollIntoViewIfNeeded();
  await nameInput.focus();
  await page.waitForFunction(() => document.querySelector('[data-input-compact-mode="true"]') !== null);
  const compactState = await page.evaluate(() => {
    const page = document.querySelector('[data-input-compact-mode="true"]');
    const inspector = document.querySelector('#editor-inspector');
    const field = document.querySelector('#editor-inspector [data-editor-field="name"]');
    const dock = document.querySelector('#editor-task-tab-mobile-more')?.closest('nav')?.parentElement ?? null;
    const stage = document.querySelector('#editor-canvas-stage');
    const inspectRect = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const fieldRect = field ? inspectRect(field) : null;
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageMode: page?.dataset.inputCompactMode ?? null,
      inspector: inspector ? inspectRect(inspector) : null,
      field: fieldRect,
      fieldFocused: document.activeElement === field,
      dockDisplay: dock ? getComputedStyle(dock).display : null,
      stageVisibility: stage ? getComputedStyle(stage).visibility : null,
    };
  });
  checkNoHorizontalOverflow(result, { width: compactState.width, documentWidth: compactState.pageWidth }, '844×390 short input');
  verify(result, 'Short-height input keeps the focused field visible in the viewport', compactState.fieldFocused && compactState.field?.x >= 0 && compactState.field.right <= 844 && compactState.field.y >= 0 && compactState.field.bottom <= 390, compactState, 'focused name field fully inside the viewport');
  verify(result, 'Short-height input keeps the inspector inside the viewport', compactState.inspector?.x >= 0 && compactState.inspector.right <= 844 && compactState.inspector.bottom <= 390, compactState.inspector, 'inspector inside viewport');
  verify(result, 'The task dock is removed while the short-height input mode is active', compactState.dockDisplay === 'none', compactState.dockDisplay, 'none');
  verify(result, 'The card stage yields space to the short-height input', compactState.stageVisibility === 'hidden', compactState.stageVisibility, 'hidden');

  const cardView = page.getByRole('button', { name: '카드 보기', exact: true });
  await cardView.waitFor({ state: 'visible' });
  await cardView.click();
  await page.waitForFunction(() => document.querySelector('[data-inspector-open="false"]') !== null && document.querySelector('[data-input-compact-mode="false"]') !== null);
  await page.waitForFunction(() => document.activeElement?.id === 'editor-task-tab-mobile-information');
  const afterCardView = await page.evaluate(() => {
    const active = document.activeElement;
    const dock = document.querySelector('#editor-task-tab-mobile-more')?.closest('nav')?.parentElement ?? null;
    const stage = document.querySelector('#editor-canvas-stage');
    const rect = active instanceof HTMLElement ? active.getBoundingClientRect() : null;
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      timeOrigin: performance.timeOrigin,
      inspectorOpen: document.querySelector('[data-inspector-open]')?.getAttribute('data-inspector-open'),
      activeId: active instanceof HTMLElement ? active.id : '',
      activeVisible: Boolean(rect && rect.width > 0 && rect.height > 0 && getComputedStyle(active).visibility !== 'hidden'),
      activeRect: rect ? { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      dockDisplay: dock ? getComputedStyle(dock).display : null,
      stageVisibility: stage ? getComputedStyle(stage).visibility : null,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    };
  });
  checkNoHorizontalOverflow(result, afterCardView, '844×390 card view');
  verify(result, 'Card view closes the inspector and restores focus to the visible task dock', afterCardView.inspectorOpen === 'false' && afterCardView.activeId === 'editor-task-tab-mobile-information' && afterCardView.activeVisible && afterCardView.activeRect.x >= 0 && afterCardView.activeRect.right <= 844 && afterCardView.activeRect.y >= 0 && afterCardView.activeRect.bottom <= 390, afterCardView, 'visible mobile information task button focused');
  verify(result, 'Card view restores the stage and task dock without changing documents', afterCardView.stageVisibility === 'visible' && afterCardView.dockDisplay !== 'none' && afterCardView.timeOrigin === timeOrigin, afterCardView, 'stage and dock visible; same performance.timeOrigin');
  const finalGeometry = await inspectViewport(page);
  checkMobileDensity(result, finalGeometry, '844×390 card view');
  checkDockGeometry(result, finalGeometry, '844×390 card view');
}

async function runPointerTargetScenario(page, result, minimumHeight) {
  const isMobile = await page.evaluate(() => window.matchMedia('(max-width: 900px)').matches);
  await activateTask(page, 'photo', isMobile);
  if (minimumHeight === 24) {
    verify(result, 'Fine-pointer scenario uses a fine primary pointer', await page.evaluate(() => window.matchMedia('(pointer: fine)').matches), true, true);
  } else {
    verify(result, 'Touch-target scenario has touch input enabled', await page.evaluate(() => navigator.maxTouchPoints > 0), true, true);
  }
  const geometry = await readControlGeometry(page);
  const density = await inspectDensity(page);
  if (minimumHeight === 24) checkFineDesktopDensity(result, density, geometry, `${density.width}px fine desktop`);
  else checkTouchDensity(result, density, geometry, `${density.width}px touch mobile`);
  const precisionHitHeight = Math.max(geometry.number.wrapperHasBorder ? geometry.number.wrapper.height : geometry.number.input.height, geometry.number.input.height);
  verify(result, 'Photo slider meets its minimum pointer target height', geometry.range.height >= minimumHeight, geometry.range.height, `${minimumHeight}px or more`);
  verify(result, 'Photo numeric input meets its minimum pointer target height', precisionHitHeight >= minimumHeight, {
    measuredHitHeight: precisionHitHeight,
    wrapperHeight: geometry.number.wrapper.height,
    inputHeight: geometry.number.input.height,
    wrapperHasBorder: geometry.number.wrapperHasBorder,
  }, `${minimumHeight}px or more`);
  result.measurements = { ...geometry, numericEffectiveHitHeight: precisionHitHeight, minimumHeight };
}

async function runPhase4TextScenario(page, result) {
  await activateTask(page, 'information');
  const bioTarget = page.locator('[data-card-text-target="character.bio"]');
  const bioBadgeHit = bioTarget.locator('[data-card-text-badge-hit="true"]');
  await bioBadgeHit.waitFor({ state: 'visible' });
  const badgeSize = await bioBadgeHit.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  verify(result, 'Editable bio badge hit area is at least 24×24px', badgeSize.width >= 24 && badgeSize.height >= 24, badgeSize, 'at least 24×24 CSS px');
  await bioBadgeHit.click();
  await page.waitForFunction(() => document.querySelector('[data-text-editor]')?.getAttribute('data-selected-text-id') === 'character.bio');
  equal(result, 'Clicking the actual bio badge hit area opens its editor item', await page.locator('[data-text-editor]').getAttribute('data-selected-text-id'), 'character.bio');

  const select = page.locator('[data-text-item-select]');
  await select.waitFor({ state: 'visible' });
  verify(result, 'Native text selector remains visible alongside the selected bio editor', await select.isVisible(), true, true);
  const options = await select.locator('option').evaluateAll((elements) => elements.map((element) => ({ value: element.value, label: element.textContent?.trim() ?? '' })));
  const bioOption = options.find((option) => option.value === 'character.bio');
  verify(result, 'Native text selector includes the bio item', Boolean(bioOption), options, 'an option with value character.bio');
  await select.selectOption(bioOption.value);
  equal(result, 'Native text selector can select the bio item', await page.locator('[data-text-editor]').getAttribute('data-selected-text-id'), 'character.bio');

  const copyOption = options.find((option) => /^(cinematic|editorial|identity)\./u.test(option.value));
  verify(result, 'Native text selector includes an editable card-copy item', Boolean(copyOption), options, 'an option whose value is a public card-copy slot');
  await select.selectOption(copyOption.value);
  equal(result, 'Native text selector can select an editable card-copy item', await page.locator('[data-text-editor]').getAttribute('data-selected-text-id'), copyOption.value);
  equal(result, 'The selected card-copy item has an editable control', await page.locator('[data-text-content-input]').count(), 1);
}

async function loadFixture() {
  const seedPath = path.join(root, 'docs', 'qa', 'phase217', 'ui-seed-system.json');
  const seed = JSON.parse(await readFile(seedPath, 'utf8'));
  const draftKey = seed.storage?.draftKey;
  const serializedDraft = seed.storage?.serializedDraft;
  if (seed.expectedCard?.characterName !== 'Coner'
    || seed.expectedCard?.family !== 'cinematic'
    || seed.expectedCard?.ratio !== '4:5'
    || seed.expectedCard?.imageUrl !== '/assets/samples/coner/optimized/portrait.webp'
    || draftKey !== 'ff14-adventurer-card:draft:v3'
    || typeof serializedDraft !== 'string'
    || seed.storage?.version !== 3) {
    throw new Error(`The public Coner fixture at ${path.relative(root, seedPath)} did not match its known v3 contract.`);
  }

  return {
    path: path.relative(root, seedPath).replaceAll('\\', '/'),
    fixtureName: 'public-coner-cinematic-4x5',
    draftKey,
    serializedDraft,
    localeKey: seed.storage.localeKey,
    appearanceKey: seed.storage.appearanceKey,
    characterName: seed.expectedCard.characterName,
    imageUrl: seed.expectedCard.imageUrl,
  };
}

async function writeReport(report, reportDir) {
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  let baseUrl;
  try {
    baseUrl = assertLocalBaseUrl(options.baseUrl);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  const reportDir = path.resolve(root, options.reportDir);
  const reportDirRelative = path.relative(root, reportDir);
  if (reportDirRelative.startsWith('..') || path.isAbsolute(reportDirRelative)) {
    process.stderr.write('--report-dir must stay inside the project workspace.\n');
    process.exitCode = 2;
    return;
  }
  let fixture;
  let playwright;
  try {
    fixture = await loadFixture();
    playwright = loadPlaywright();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  const targetUrl = editorUrlFor(baseUrl);
  const fixtureForOrigin = {
    origin: targetUrl.origin,
    pathname: targetUrl.pathname,
    fixtureName: fixture.fixtureName,
    draftKey: fixture.draftKey,
    serializedDraft: fixture.serializedDraft,
    localeKey: fixture.localeKey,
    appearanceKey: fixture.appearanceKey,
  };
  const report = {
    schema: 'editor-priority-browser-qa-v1',
    startedAt: new Date().toISOString(),
    baseUrl: targetUrl.origin,
    editorPath: targetUrl.pathname,
    browser: { channel: process.env.EDITOR_QA_BROWSER_CHANNEL ?? 'chrome', isolatedContextPerScenario: true },
    fixture: {
      source: fixture.path,
      name: fixture.fixtureName,
      characterName: fixture.characterName,
      imageUrl: fixture.imageUrl,
      storageOrigin: targetUrl.origin,
    },
    checks: [],
    passed: 0,
    failed: 0,
  };

  let browser;
  try {
    const launchOptions = { headless: true, channel: process.env.EDITOR_QA_BROWSER_CHANNEL ?? 'chrome' };
    if (process.env.EDITOR_QA_CHROME_EXECUTABLE_PATH?.trim()) {
      launchOptions.executablePath = path.resolve(process.env.EDITOR_QA_CHROME_EXECUTABLE_PATH.trim());
      delete launchOptions.channel;
    }
    browser = await playwright.chromium.launch(launchOptions);

    const scenarioOptions = (name, viewport, run, screenshotName) => ({
      name,
      viewport,
      fixture: fixtureForOrigin,
      editorUrl: targetUrl,
      run,
      screenshotName,
      captureScreenshots: options.screenshots,
      reportDir,
    });

    report.checks.push(await runScenario(browser, scenarioOptions(
      'desktop guide shortcuts and focus restoration',
      { width: 1440, height: 1000 },
      runGuideShortcutScenario,
      'desktop-1440-guide-focus',
    )));
    report.checks.push(await runScenario(browser, scenarioOptions(
      'same-document 901→900 draft, commit, undo and redo',
      { width: 901, height: 844, isMobile: true, hasTouch: true },
      runSameDocumentDraftScenario,
      'mobile-900-image-draft',
    )));
    if (!options.coreOnly) {
      report.checks.push(await runScenario(browser, scenarioOptions(
        'compact navigator breakpoint focus transfer',
        { width: 1180, height: 900 },
        runNavigatorBreakpointScenario,
        'desktop-1181-navigator-focus',
      )));
      report.checks.push(await runScenario(browser, scenarioOptions(
        'same-document focus visibility at 1200→1180 and 1000→900',
        { width: 1200, height: 900 },
        runSameDocumentNavigatorFocusScenario,
        'responsive-navigator-focus-boundaries',
      )));
      report.checks.push(await runScenario(browser, scenarioOptions(
        'mobile minimum widths and short-height card view',
        { width: 390, height: 844, isMobile: true, hasTouch: true },
        runResponsiveViewportScenario,
        'mobile-844x390-card-view',
      )));
      report.checks.push(await runScenario(browser, scenarioOptions(
        'compact fine-pointer control targets',
        { width: 901, height: 900 },
        (page, result) => runPointerTargetScenario(page, result, 24),
        'fine-pointer-901-control-targets',
      )));
      report.checks.push(await runScenario(browser, scenarioOptions(
        'touch control targets and bordered numeric hit area',
        { width: 390, height: 844, isMobile: true, hasTouch: true },
        (page, result) => runPointerTargetScenario(page, result, 44),
        'touch-390-control-targets',
      )));
    }

    if (options.phase4) {
      report.checks.push(await runScenario(browser, scenarioOptions(
        'phase 4 native text selection and clickable bio badge',
        { width: 1440, height: 1000 },
        runPhase4TextScenario,
        'desktop-1440-phase4-text-select',
      )));
    }
  } catch (error) {
    report.launchError = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter((check) => check.passed).length;
  report.failed = report.checks.filter((check) => !check.passed).length + (report.launchError ? 1 : 0);
  const reportPath = await writeReport(report, reportDir);
  process.stdout.write(`${JSON.stringify({
    report: path.relative(root, reportPath).replaceAll('\\', '/'),
    passed: report.passed,
    failed: report.failed,
    checks: report.checks.map(({ name, passed, durationMs, error }) => ({ name, passed, durationMs, ...(error ? { error: error.split('\n')[0] } : {}) })),
    ...(report.launchError ? { launchError: report.launchError.split('\n')[0] } : {}),
  }, null, 2)}\n`);

  if (report.failed > 0) process.exitCode = 1;
}

await main();

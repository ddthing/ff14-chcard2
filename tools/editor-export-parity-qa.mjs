import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const requireFromProject = createRequire(path.join(root, 'package.json'));
const DEFAULT_BEFORE = 'http://127.0.0.1:4334';
const DEFAULT_AFTER = 'http://127.0.0.1:4333';
const DEFAULT_REPORT_DIR = 'tmp/editor-export-parity-qa';
const EXPORT_TIMEOUT_MS = 60_000;

function usage() {
  return [
    'Usage: node --experimental-strip-types tools/editor-export-parity-qa.mjs [options]',
    '',
    `  --before <url>             Baseline loopback origin (default: ${DEFAULT_BEFORE})`,
    `  --after <url>              Current loopback origin (default: ${DEFAULT_AFTER})`,
    `  --report-dir <path>        JSON report and optional mismatch screenshots (default: ${DEFAULT_REPORT_DIR})`,
    '  --quick                    Run Cinematic, Editorial, and Adventurer Record at 4:5 / Korean (default)',
    '  --full                     Run all 3 masters × 5 ratios × 3 locales (45 PNG 1× exports)',
    '  --baseline-only            Export from --before only, without comparing --after',
    '  --webp-2x                  Add one representative Cinematic 4:5 Korean WebP 2× export',
    '  --calibrate-variance       Measure baseline self-variance for cross-version pixel mismatches',
    '  --screenshots-on-mismatch  Capture both export pages only when a case fails or differs',
    '  --save-mismatch-images     Save decoded before/after PNGs and a pixel-difference PNG on mismatch',
    '  --profile                  Record CDP function self-hit counts on the first case per origin',
    '  --help                     Show this help',
    '',
    'Playwright and sharp load from EDITOR_QA_NODE_MODULES or this project. Chrome must be installed.',
    'The runner launches isolated headless contexts and only intercepts its own blob download anchors.',
  ].join('\n');
}

function parseArgs(args) {
  const options = {
    before: DEFAULT_BEFORE,
    after: DEFAULT_AFTER,
    reportDir: DEFAULT_REPORT_DIR,
    mode: 'quick',
    baselineOnly: false,
    webp2x: false,
    calibrateVariance: false,
    screenshotsOnMismatch: false,
    saveMismatchImages: false,
    profile: false,
    help: false,
  };
  let modeWasExplicit = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--quick' || arg === '--full') {
      if (modeWasExplicit && options.mode !== arg.slice(2)) throw new Error('--quick and --full cannot be combined.');
      options.mode = arg.slice(2);
      modeWasExplicit = true;
    } else if (arg === '--baseline-only') {
      options.baselineOnly = true;
    } else if (arg === '--webp-2x') {
      options.webp2x = true;
    } else if (arg === '--calibrate-variance') {
      options.calibrateVariance = true;
    } else if (arg === '--screenshots-on-mismatch') {
      options.screenshotsOnMismatch = true;
    } else if (arg === '--save-mismatch-images') {
      options.saveMismatchImages = true;
    } else if (arg === '--profile') {
      options.profile = true;
    } else if (arg === '--before' || arg === '--after' || arg === '--report-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      index += 1;
      if (arg === '--before') options.before = value;
      else if (arg === '--after') options.after = value;
      else options.reportDir = value;
    } else if (arg.startsWith('--before=')) {
      options.before = arg.slice('--before='.length);
    } else if (arg.startsWith('--after=')) {
      options.after = arg.slice('--after='.length);
    } else if (arg.startsWith('--report-dir=')) {
      options.reportDir = arg.slice('--report-dir='.length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.webp2x && options.mode !== 'full') throw new Error('--webp-2x requires --full.');
  if (options.calibrateVariance && options.baselineOnly) throw new Error('--calibrate-variance requires a before/after comparison.');
  if (options.profile && options.mode !== 'quick') throw new Error('--profile currently supports --quick only.');
  return options;
}

function assertLoopbackUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name} URL: ${value}`);
  }
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (!['http:', 'https:'].includes(url.protocol)
    || !allowedHosts.has(url.hostname)
    || url.username
    || url.password) {
    throw new Error(`${name} must use a loopback host and must not include credentials.`);
  }
  return new URL(url.origin);
}

function resolveInsideRoot(value, name) {
  const absolutePath = path.resolve(root, value);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${name} must stay inside the project workspace.`);
  }
  return absolutePath;
}

function loadDependency(packageName) {
  const moduleDirectory = process.env.EDITOR_QA_NODE_MODULES?.trim();
  if (moduleDirectory) {
    const resolvedDirectory = path.resolve(moduleDirectory);
    for (const candidate of [
      path.join(resolvedDirectory, packageName),
      path.join(resolvedDirectory, 'node_modules', packageName),
    ]) {
      try {
        return requireFromProject(candidate);
      } catch {
        // Try the other configured package location.
      }
    }
  }
  return requireFromProject(packageName);
}

function sourceFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

async function loadFixtureModules() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      let base;
      if (specifier.startsWith('@/')) base = path.resolve(sourceRoot, specifier.slice(2));
      else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
        const parentPath = fileURLToPath(context.parentURL);
        const relativeParent = path.relative(sourceRoot, parentPath);
        if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) return nextResolve(specifier, context);
        base = path.resolve(path.dirname(parentPath), specifier);
      } else return nextResolve(specifier, context);
      const resolved = sourceFile(base);
      if (!resolved) throw new Error(`Unable to resolve source alias ${specifier} from ${base}.`);
      return nextResolve(pathToFileURL(resolved).href, context);
    },
  });

  const [cardsModule, storeModule, persistenceModule, localeModule, appearanceModule] = await Promise.all([
    import('../src/components/cards/types.ts'),
    import('../src/store/editor-store.ts'),
    import('../src/store/editor-persistence.ts'),
    import('../src/lib/locale-preference.ts'),
    import('../src/lib/app-appearance.ts'),
  ]);
  return {
    getConerSample: cardsModule.getConerSample,
    editorStore: storeModule.editorStore,
    normalizeCardData: persistenceModule.normalizeCardData,
    persistEditorDraft: persistenceModule.persistEditorDraft,
    parseStoredEditorDraft: persistenceModule.parseStoredEditorDraft,
    storageKey: persistenceModule.EDITOR_STORAGE_KEY,
    storageVersion: persistenceModule.EDITOR_STORAGE_VERSION,
    localeKey: localeModule.LOCALE_STORAGE_KEY,
    appearanceKey: appearanceModule.APP_APPEARANCE_STORAGE_KEY,
  };
}

function makeMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

function createCaseFixture(modules, testCase) {
  const sample = modules.getConerSample(testCase.template, testCase.ratio);
  modules.editorStore.getState().replaceCardData(sample, {
    persist: false,
    recordHistory: false,
    imageMetadata: { fileName: null, mimeType: null },
  });
  const card = modules.normalizeCardData(modules.editorStore.getState().toCardData());
  const memoryStorage = makeMemoryStorage();
  if (!modules.persistEditorDraft(card, memoryStorage, { fileName: null, mimeType: null })) {
    throw new Error(`Could not serialize the public Coner fixture for ${testCase.key}.`);
  }
  const serializedDraft = memoryStorage.getItem(modules.storageKey);
  if (typeof serializedDraft !== 'string') throw new Error(`The editor store did not write ${modules.storageKey}.`);
  const parsedDraft = modules.parseStoredEditorDraft(serializedDraft);
  if (!parsedDraft || parsedDraft.migrated || parsedDraft.card.character.name !== 'Coner') {
    throw new Error(`The serialized fixture for ${testCase.key} did not round-trip as canonical Coner data.`);
  }
  if (parsedDraft.card.design.template !== testCase.template || parsedDraft.card.design.ratio !== testCase.ratio) {
    throw new Error(`Fixture mismatch for ${testCase.key}: got ${parsedDraft.card.design.template}/${parsedDraft.card.design.ratio}.`);
  }

  return {
    draftKey: modules.storageKey,
    version: modules.storageVersion,
    localeKey: modules.localeKey,
    appearanceKey: modules.appearanceKey,
    serializedDraft,
    draftSha256: createHash('sha256').update(serializedDraft).digest('hex'),
    imageUrl: parsedDraft.card.imageUrl,
    characterName: parsedDraft.card.character.name,
  };
}

function createPageInitScript({ origin, fixture, locale }) {
  const seed = JSON.stringify({
    origin,
    path: '/export',
    locale,
    draftKey: fixture.draftKey,
    serializedDraft: fixture.serializedDraft,
    localeKey: fixture.localeKey,
    appearanceKey: fixture.appearanceKey,
  });
  return `(() => {
    const seed = ${seed};
    if (window.location.origin !== seed.origin || window.location.pathname !== seed.path) return;
    const state = { fixtureApplied: false, downloads: [], longTasks: [], longTaskObserver: false };
    window.__editorExportParityQa = state;
    try {
      window.localStorage.setItem(seed.draftKey, seed.serializedDraft);
      window.localStorage.setItem(seed.localeKey, seed.locale);
      window.sessionStorage.setItem(seed.localeKey, seed.locale);
      window.localStorage.setItem(seed.appearanceKey, 'system');
      state.fixtureApplied = true;
    } catch (error) {
      state.seedError = String(error);
    }
    const nativeAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(...args) {
      if (this.href.startsWith('blob:') && this.hasAttribute('download')) {
        state.downloads.push({ href: this.href, filename: this.download, recordedAt: performance.now() });
        return;
      }
      return nativeAnchorClick.apply(this, args);
    };
    try {
      const observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      });
      observer.observe({ type: 'longtask', buffered: true });
      state.longTaskObserver = true;
    } catch {
      state.longTaskObserver = false;
    }
  })();`;
}

function expectedTemplateLabel(template, locale) {
  const labels = {
    ko: { cinematic: '시네마틱', editorial: '에디토리얼', 'id-card': '모험가 기록' },
    en: { cinematic: 'Cinematic', editorial: 'Editorial', 'id-card': 'Adventurer Record' },
    ja: { cinematic: 'シネマティック', editorial: 'エディトリアル', 'id-card': '冒険者の記録' },
  };
  return labels[locale][template];
}

function formatCaseKey(testCase) {
  return `${testCase.template}-${testCase.ratio.replace(':', 'x')}-${testCase.locale}-${testCase.format}-${testCase.scale}x`;
}

function createCases(mode, includeWebp) {
  const templates = ['cinematic', 'editorial', 'id-card'];
  const ratios = ['1:1', '4:5', '3:4', '9:16', '16:9'];
  const locales = ['ko', 'en', 'ja'];
  const cases = mode === 'quick'
    ? templates.map((template) => ({ template, ratio: '4:5', locale: 'ko', format: 'png', scale: 1 }))
    : templates.flatMap((template) => ratios.flatMap((ratio) => locales.map((locale) => ({ template, ratio, locale, format: 'png', scale: 1 }))));
  if (includeWebp) cases.push({ template: 'cinematic', ratio: '4:5', locale: 'ko', format: 'webp', scale: 2 });
  return cases.map((testCase) => ({ ...testCase, key: formatCaseKey(testCase) }));
}

function verify(result, label, condition, actual, expected = true) {
  const assertion = { label, passed: Boolean(condition), actual, expected };
  result.assertions.push(assertion);
  if (!condition) throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
}

async function startProfiler(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 1000 });
  await client.send('Profiler.start');
  return client;
}

function summarizeSelfCounts(profile) {
  const nodes = (profile?.nodes ?? [])
    .map((node) => ({
      functionName: node.callFrame?.functionName || '(anonymous)',
      url: node.callFrame?.url || '',
      selfHitCount: Number(node.hitCount ?? 0),
    }))
    .filter((node) => node.selfHitCount > 0)
    .sort((a, b) => b.selfHitCount - a.selfHitCount);
  return {
    sampleCount: profile?.samples?.length ?? 0,
    totalSelfHitCount: nodes.reduce((sum, node) => sum + node.selfHitCount, 0),
    topFunctions: nodes.slice(0, 30),
  };
}

async function stopProfiler(client) {
  if (!client) return null;
  try {
    const { profile } = await client.send('Profiler.stop');
    return summarizeSelfCounts(profile);
  } finally {
    await client.send('Profiler.disable').catch(() => {});
    await client.detach().catch(() => {});
  }
}

function parseDimensionPair(value) {
  const numbers = (String(value).match(/\d[\d,\u00a0\u202f]*/gu) ?? [])
    .map((part) => Number(part.replace(/\D/gu, '')))
    .filter(Number.isFinite);
  return numbers.length >= 2 ? { width: numbers[0], height: numbers[1] } : null;
}

async function readBlobFromPage(page, href) {
  const transfer = await page.evaluate(async (blobUrl) => {
    const response = await fetch(blobUrl);
    if (!response.ok) throw new Error(`Fetching the intercepted export Blob returned ${response.status}.`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks = [];
    const chunkSize = 24_000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return { base64: btoa(chunks.join('')), type: blob.type, size: blob.size };
  }, href);
  return { bytes: Buffer.from(transfer.base64, 'base64'), type: transfer.type, size: transfer.size };
}

async function readLongTasks(page) {
  await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 0)));
  return page.evaluate(() => window.__editorExportParityQa?.longTasks ?? []);
}

async function decodeExport(sharp, bytes) {
  const metadata = await sharp(bytes).metadata();
  const decoded = await sharp(bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    rgbaData: decoded.data,
    summary: {
      format: metadata.format ?? null,
      width: decoded.info.width,
      height: decoded.info.height,
      channels: decoded.info.channels,
      bytes: bytes.length,
      byteSha256: createHash('sha256').update(bytes).digest('hex'),
      rgbaSha256: createHash('sha256').update(decoded.data).digest('hex'),
      decodedBytes: decoded.data.length,
    },
  };
}

async function waitForExportOutcome(page) {
  await page.waitForFunction(() => {
    return Boolean(document.querySelector('#export-result-title') || document.querySelector('#export-feedback[role="alert"]'));
  }, null, { timeout: EXPORT_TIMEOUT_MS });
  return page.evaluate(() => {
    const result = document.querySelector('#export-result-title');
    const error = document.querySelector('#export-feedback[role="alert"]');
    return result
      ? { status: 'success', title: result.textContent?.trim() ?? '' }
      : { status: 'error', message: error?.textContent?.trim() ?? 'Unknown export error.' };
  });
}

async function performUiExport(browser, sharp, host, baseUrl, testCase, fixture, options) {
  const startedAt = Date.now();
  const side = { host, status: 'failed', assertions: [], pageErrors: [], longTasks: [] };
  let context;
  let page;
  let profilerClient;
  let longTasksCaptured = false;
  let rgbaData;
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on('pageerror', (error) => side.pageErrors.push(error.message));
    await context.addInitScript(createPageInitScript({ origin: baseUrl.origin, fixture, locale: testCase.locale }));
    await page.goto(new URL('/export', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('#export-settings-title').waitFor({ state: 'visible' });
    await page.waitForFunction((expectedLocale) => document.documentElement.lang === expectedLocale, testCase.locale);
    const settings = await page.evaluate(() => ({
      seeded: window.__editorExportParityQa?.fixtureApplied === true,
      seedError: window.__editorExportParityQa?.seedError ?? null,
      name: document.querySelector('#export-settings-title')?.textContent?.trim() ?? '',
      templateAndRatio: document.querySelector('aside[aria-labelledby="export-settings-title"] p')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      ratio: document.querySelector('input[name="export-ratio"]:checked')?.value ?? null,
      locale: document.documentElement.lang,
    }));
    verify(side, `${host}: isolated Coner draft was applied`, settings.seeded && settings.name === 'Coner', settings, { seeded: true, name: 'Coner' });
    verify(side, `${host}: requested ratio is loaded from the store fixture`, settings.ratio === testCase.ratio, settings.ratio, testCase.ratio);
    verify(side, `${host}: requested locale is active before export`, settings.locale === testCase.locale, settings.locale, testCase.locale);
    verify(side, `${host}: UI shows the requested master`, settings.templateAndRatio.includes(expectedTemplateLabel(testCase.template, testCase.locale)), settings.templateAndRatio, expectedTemplateLabel(testCase.template, testCase.locale));

    const formatRadio = page.locator(`input[name="export-format"][value="${testCase.format}"]`);
    const scaleRadio = page.locator(`input[name="export-scale"][value="${testCase.scale}"]`);
    await formatRadio.locator('xpath=..').click();
    await scaleRadio.locator('xpath=..').click();
    const selectedSettings = await page.evaluate(() => ({
      format: document.querySelector('input[name="export-format"]:checked')?.value ?? null,
      scale: Number(document.querySelector('input[name="export-scale"]:checked')?.value ?? NaN),
      ratio: document.querySelector('input[name="export-ratio"]:checked')?.value ?? null,
    }));
    verify(side, `${host}: export page selected the requested output format`, selectedSettings.format === testCase.format, selectedSettings.format, testCase.format);
    verify(side, `${host}: export page selected the requested output scale`, selectedSettings.scale === testCase.scale, selectedSettings.scale, testCase.scale);
    verify(side, `${host}: export page retained the requested ratio`, selectedSettings.ratio === testCase.ratio, selectedSettings.ratio, testCase.ratio);

    if (options.profile) profilerClient = await startProfiler(page);
    const primaryAction = page.locator('aside[aria-labelledby="export-settings-title"] button:not([aria-describedby])');
    await primaryAction.waitFor({ state: 'visible' });
    verify(side, `${host}: settings panel exposes one primary export action`, await primaryAction.count() === 1, await primaryAction.count(), 1);
    await primaryAction.click();
    const outcome = await waitForExportOutcome(page);
    if (profilerClient) {
      side.profiler = await stopProfiler(profilerClient);
      profilerClient = null;
    }
    side.longTasks = await readLongTasks(page);
    longTasksCaptured = true;
    verify(side, `${host}: actual export UI completed without a renderer error`, outcome.status === 'success', outcome, 'success result panel');
    if (outcome.status !== 'success') throw new Error(`${host} export failed in the UI: ${outcome.message}`);

    const resultRows = await page.locator('aside[aria-labelledby="export-result-title"] dl > div').evaluateAll((elements) => elements.map((row) => ({
      label: row.querySelector('dt')?.textContent?.trim() ?? '',
      value: row.querySelector('dd')?.textContent?.trim() ?? '',
    })));
    const formatRow = resultRows.find((row) => /형식|format|ファイル形式|形式/iu.test(row.label));
    const dimensionsRow = resultRows.find((row) => /픽셀|dimension|pixel|ピクセル/iu.test(row.label));
    const ratioRow = resultRows.find((row) => /비율|ratio|比率/iu.test(row.label));
    const resultDimensions = parseDimensionPair(dimensionsRow?.value);
    verify(side, `${host}: result panel reports the requested format`, formatRow?.value.toLowerCase() === testCase.format, formatRow?.value ?? null, testCase.format.toUpperCase());
    verify(side, `${host}: result panel reports the requested ratio`, ratioRow?.value === testCase.ratio, ratioRow?.value ?? null, testCase.ratio);
    verify(side, `${host}: result panel reports output dimensions`, Boolean(resultDimensions), dimensionsRow?.value ?? null, 'two pixel dimensions');

    const click = await page.evaluate(() => window.__editorExportParityQa?.downloads.at(-1) ?? null);
    verify(side, `${host}: only the generated Blob anchor was intercepted`, Boolean(click?.href?.startsWith('blob:') && click.filename), click, 'blob URL and filename');
    if (!click?.href) throw new Error(`${host} showed success without producing an intercepted Blob download.`);
    const exportBlob = await readBlobFromPage(page, click.href);
    const decodedExport = await decodeExport(sharp, exportBlob.bytes);
    const decoded = decodedExport.summary;
    rgbaData = decodedExport.rgbaData;
    const expectedMime = testCase.format === 'png' ? 'image/png' : 'image/webp';
    verify(side, `${host}: Blob MIME matches the requested format`, exportBlob.type === expectedMime, exportBlob.type, expectedMime);
    verify(side, `${host}: download filename uses the requested extension`, click.filename.toLowerCase().endsWith(`.${testCase.format}`), click.filename, `.${testCase.format}`);
    verify(side, `${host}: decoded dimensions match the export result UI`, decoded.width === resultDimensions.width && decoded.height === resultDimensions.height, { width: decoded.width, height: decoded.height }, resultDimensions);
    verify(side, `${host}: export completed without uncaught browser errors`, side.pageErrors.length === 0, side.pageErrors, []);

    side.status = 'passed';
    side.output = {
      filename: click.filename,
      mimeType: exportBlob.type,
      byteSize: exportBlob.size,
      decoded,
      resultRows,
    };
  } catch (error) {
    side.status = 'failed';
    side.error = error instanceof Error ? error.stack ?? error.message : String(error);
    if (page) {
      try {
        const failure = await page.locator('#export-feedback[role="alert"]').textContent({ timeout: 1_000 }).catch(() => null);
        if (failure?.trim()) side.uiError = failure.trim();
      } catch {
        // Preserve the original failure; a secondary diagnostic read is best-effort.
      }
    }
  } finally {
    if (page && !longTasksCaptured) side.longTasks = await readLongTasks(page).catch(() => []);
    if (profilerClient) {
      try {
        side.profiler = await stopProfiler(profilerClient);
      } catch (error) {
        side.profilerError = error instanceof Error ? error.message : String(error);
      }
    }
    side.pageErrors = [...side.pageErrors];
    side.durationMs = Date.now() - startedAt;
  }

  return { side, context, page, rgbaData };
}

async function captureMismatchScreenshot(page, reportDir, testCase, host, result) {
  if (!page) return null;
  const directory = path.join(reportDir, 'screenshots');
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${testCase.key}-${host}.png`);
  await page.screenshot({ path: outputPath, fullPage: true, animations: 'disabled' });
  const relativePath = path.relative(root, outputPath).replaceAll('\\', '/');
  result.screenshots ??= {};
  result.screenshots[host] = relativePath;
  return relativePath;
}

function calculatePixelDifference(left, right, width, height, channels) {
  if (!left || !right || left.length !== right.length || channels !== 4) return null;
  const diffRgba = Buffer.alloc(left.length);
  let mismatchingPixels = 0;
  let differingChannels = 0;
  let maxChannelDelta = 0;
  let absoluteDeltaSum = 0;
  let squaredDeltaSum = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * channels;
    let pixelDiffers = false;
    let pixelMaxDelta = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const delta = Math.abs(left[offset + channel] - right[offset + channel]);
      if (delta === 0) continue;
      pixelDiffers = true;
      differingChannels += 1;
      absoluteDeltaSum += delta;
      squaredDeltaSum += delta * delta;
      pixelMaxDelta = Math.max(pixelMaxDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (!pixelDiffers) continue;
    mismatchingPixels += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    diffRgba[offset] = 255;
    diffRgba[offset + 1] = 24;
    diffRgba[offset + 2] = 24;
    diffRgba[offset + 3] = Math.min(255, Math.max(96, pixelMaxDelta * 16));
  }

  const meanSquaredError = squaredDeltaSum / Math.max(1, left.length);
  return {
    diffRgba,
    stats: {
      mismatchingPixels,
      differingChannels,
      maxChannelDelta,
      meanAbsoluteDeltaAmongChangedChannels: differingChannels === 0 ? 0 : absoluteDeltaSum / differingChannels,
      meanSquaredErrorPerChannel: meanSquaredError,
      psnrDb: meanSquaredError === 0 ? null : 10 * Math.log10((255 * 255) / meanSquaredError),
      boundingBox: maxX < 0 ? null : {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
    },
  };
}

async function saveMismatchImageSet(sharp, reportDir, testCase, beforeAttempt, afterAttempt, diffRgba, width, height, result) {
  const directory = path.join(reportDir, 'pixel-diffs');
  await mkdir(directory, { recursive: true });
  const artifacts = {};
  for (const [name, rgba] of [['before', beforeAttempt.rgbaData], ['after', afterAttempt.rgbaData], ['diff', diffRgba]]) {
    if (!rgba) continue;
    const filename = `${testCase.key}-${name}.png`;
    const outputPath = path.join(directory, filename);
    await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(outputPath);
    artifacts[name] = path.relative(root, outputPath).replaceAll('\\', '/');
  }
  result.pixelDiffArtifacts = artifacts;
}

function compareAttemptOutputs(beforeAttempt, afterAttempt, result) {
  const before = beforeAttempt.side;
  const after = afterAttempt.side;
  if (before.status !== 'passed' || after.status !== 'passed') {
    result.status = 'failed';
    result.comparison = { equal: false, reason: 'At least one actual export UI attempt failed.' };
    return null;
  }
  const left = before.output.decoded;
  const right = after.output.decoded;
  const sameDimensions = left.width === right.width && left.height === right.height;
  const samePixels = sameDimensions && left.rgbaSha256 === right.rgbaSha256;
  const pixelDiff = sameDimensions && !samePixels
    ? calculatePixelDifference(beforeAttempt.rgbaData, afterAttempt.rgbaData, left.width, left.height, left.channels)
    : null;
  result.status = samePixels ? 'passed' : 'mismatch';
  result.comparison = {
    equal: samePixels,
    sameDimensions,
    sameDecodedRgba: samePixels,
    byteIdentical: before.output.decoded.byteSha256 === after.output.decoded.byteSha256,
    pixelDifference: samePixels
      ? {
        mismatchingPixels: 0,
        differingChannels: 0,
        maxChannelDelta: 0,
        meanAbsoluteDeltaAmongChangedChannels: 0,
        meanSquaredErrorPerChannel: 0,
        psnrDb: null,
        boundingBox: null,
      }
      : pixelDiff?.stats ?? null,
    before: { width: left.width, height: left.height, rgbaSha256: left.rgbaSha256, byteSha256: left.byteSha256 },
    after: { width: right.width, height: right.height, rgbaSha256: right.rgbaSha256, byteSha256: right.byteSha256 },
  };
  return pixelDiff?.diffRgba ?? null;
}

function qualifyBaselineRasterVariance(crossComparison, controlComparison) {
  if (!crossComparison?.sameDimensions) return { qualified: false, reason: 'cross-dimensions-differ' };
  const cross = crossComparison.pixelDifference;
  if (!cross) return { qualified: false, reason: 'cross-pixel-diff-unavailable' };
  if (cross.maxChannelDelta > 1) return { qualified: false, reason: 'cross-channel-delta-exceeds-1' };
  if (cross.mismatchingPixels === 0 || cross.differingChannels === 0) return { qualified: false, reason: 'cross-diff-has-no-pixels' };
  if (!controlComparison?.sameDimensions) return { qualified: false, reason: 'control-dimensions-differ' };
  const control = controlComparison.pixelDifference;
  if (!control) return { qualified: false, reason: 'control-pixel-diff-unavailable' };
  if (control.mismatchingPixels === 0 || control.differingChannels === 0) return { qualified: false, reason: 'control-is-pixel-identical' };
  if (control.maxChannelDelta > 1) return { qualified: false, reason: 'control-channel-delta-exceeds-1' };
  if (cross.mismatchingPixels > control.mismatchingPixels) return { qualified: false, reason: 'cross-mismatching-pixels-exceed-control' };
  if (cross.differingChannels > control.differingChannels) return { qualified: false, reason: 'cross-differing-channels-exceed-control' };
  if (crossComparison.before.width !== controlComparison.before.width
    || crossComparison.before.height !== controlComparison.before.height) {
    return { qualified: false, reason: 'control-output-dimensions-do-not-match-cross-output' };
  }
  return { qualified: true, reason: 'cross-delta-is-contained-by-same-build-control' };
}

async function runVarianceCalibration(browser, sharp, beforeUrl, testCase, fixture, crossComparison, progressPrefix) {
  const calibration = {
    classification: null,
    reason: null,
    maxControlPairs: 2,
    controlPairs: [],
  };
  const crossIsSmallSameSize = crossComparison?.sameDimensions
    && crossComparison.pixelDifference
    && crossComparison.pixelDifference.maxChannelDelta <= 1;

  for (let index = 1; index <= calibration.maxControlPairs; index += 1) {
    process.stdout.write(`${progressPrefix} baseline self-control ${index}/${calibration.maxControlPairs}\n`);
    const beforeAttempt = await performUiExport(
      browser,
      sharp,
      `baseline-control-${index}-before`,
      beforeUrl,
      testCase,
      fixture,
      { profile: false },
    );
    const afterAttempt = await performUiExport(
      browser,
      sharp,
      `baseline-control-${index}-after`,
      beforeUrl,
      testCase,
      fixture,
      { profile: false },
    );
    const controlResult = { status: 'pending' };
    compareAttemptOutputs(beforeAttempt, afterAttempt, controlResult);
    calibration.controlPairs.push({
      index,
      status: controlResult.status,
      exactParity: controlResult.comparison?.equal === true,
      before: beforeAttempt.side,
      after: afterAttempt.side,
      comparison: controlResult.comparison ?? null,
    });
    for (const attempt of [beforeAttempt, afterAttempt]) {
      if (attempt.context) await attempt.context.close().catch(() => {});
    }

    const qualification = controlResult.status === 'mismatch'
      ? qualifyBaselineRasterVariance(crossComparison, controlResult.comparison)
      : { qualified: false, reason: controlResult.status === 'failed' ? 'control-export-failed' : 'control-is-pixel-identical' };
    calibration.controlPairs.at(-1).qualification = qualification;
    if (qualification.qualified) {
      if (index === 1) {
        calibration.classification = 'baseline-raster-variance';
        calibration.reason = qualification.reason;
      } else {
        calibration.reason = 'first-control-pair-did-not-qualify';
      }
      break;
    }

    calibration.reason = qualification.reason;
    // A small same-size cross delta can be timing variance. One bounded repeat
    // provides a second control sample; any zero, severe, or larger cross
    // comparison still leaves the exact-parity case failed.
    if (index === 1 && crossIsSmallSameSize) continue;
    break;
  }

  return calibration;
}

function updateReportCounts(report) {
  report.exactCount = report.cases.filter((item) => item.status === 'passed').length;
  report.varianceCount = report.cases.filter((item) => item.status === 'baseline-raster-variance').length;
  report.failureCount = report.cases.filter((item) => !['passed', 'baseline-raster-variance'].includes(item.status)).length;
  report.passed = report.exactCount;
  report.failed = report.failureCount;
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

  let beforeUrl;
  let afterUrl;
  let reportDir;
  let playwright;
  let sharp;
  let modules;
  try {
    beforeUrl = assertLoopbackUrl(options.before, '--before');
    afterUrl = assertLoopbackUrl(options.after, '--after');
    reportDir = resolveInsideRoot(options.reportDir, '--report-dir');
    playwright = loadDependency('playwright');
    sharp = loadDependency('sharp');
    modules = await loadFixtureModules();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  const cases = createCases(options.mode, options.webp2x);
  const report = {
    schema: 'editor-export-parity-qa-v1',
    startedAt: new Date().toISOString(),
    suite: options.mode,
    baselineOnly: options.baselineOnly,
    urls: { before: beforeUrl.origin, ...(options.baselineOnly ? {} : { after: afterUrl.origin }) },
    browser: { channel: process.env.EDITOR_QA_BROWSER_CHANNEL ?? 'chrome', isolatedContextPerExport: true },
    fixture: {
      source: 'Node editorStore + getConerSample + normalizeCardData + persistEditorDraft',
      character: 'Coner',
      storageKey: modules.storageKey,
      storageVersion: modules.storageVersion,
      localeStorageKey: modules.localeKey,
      appearanceStorageKey: modules.appearanceKey,
      imageSources: 'built-in public Coner samples only',
    },
    profilerEnabled: options.profile,
    varianceCalibrationEnabled: options.calibrateVariance,
    saveMismatchImages: options.saveMismatchImages,
    cases: [],
    exactCount: 0,
    varianceCount: 0,
    failureCount: 0,
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
    const total = cases.length;

    for (let index = 0; index < cases.length; index += 1) {
      const caseStartedAt = Date.now();
      const testCase = cases[index];
      const fixture = createCaseFixture(modules, testCase);
      const caseResult = {
        key: testCase.key,
        template: testCase.template,
        ratio: testCase.ratio,
        locale: testCase.locale,
        format: testCase.format,
        scale: testCase.scale,
        fixture: { imageUrl: fixture.imageUrl, draftSha256: fixture.draftSha256 },
        status: 'pending',
      };
      const profileThisCase = options.profile && index === 0;
      process.stdout.write(`[${index + 1}/${total}] start ${testCase.key}\n`);
      const beforeAttempt = await performUiExport(browser, sharp, 'before', beforeUrl, testCase, fixture, { profile: profileThisCase });
      caseResult.before = beforeAttempt.side;
      process.stdout.write(`[${index + 1}/${total}] before ${testCase.key}: ${beforeAttempt.side.status}${beforeAttempt.side.uiError ? ` · ${beforeAttempt.side.uiError}` : ''}\n`);

      let afterAttempt;
      let diffRgba;
      if (options.baselineOnly) {
        caseResult.status = beforeAttempt.side.status === 'passed' ? 'passed' : 'failed';
      } else {
        afterAttempt = await performUiExport(browser, sharp, 'after', afterUrl, testCase, fixture, { profile: profileThisCase });
        caseResult.after = afterAttempt.side;
        diffRgba = compareAttemptOutputs(beforeAttempt, afterAttempt, caseResult);
        process.stdout.write(`[${index + 1}/${total}] after ${testCase.key}: ${afterAttempt.side.status}${afterAttempt.side.uiError ? ` · ${afterAttempt.side.uiError}` : ''}\n`);
        caseResult.exactParity = caseResult.comparison?.equal === true;
        if (options.calibrateVariance && caseResult.status === 'mismatch') {
          caseResult.varianceCalibration = await runVarianceCalibration(
            browser,
            sharp,
            beforeUrl,
            testCase,
            fixture,
            caseResult.comparison,
            `[${index + 1}/${total}] ${testCase.key}`,
          );
          if (caseResult.varianceCalibration.classification === 'baseline-raster-variance') {
            caseResult.status = 'baseline-raster-variance';
            caseResult.classification = 'baseline-raster-variance';
            caseResult.exactParity = false;
          }
        }
      }

      if (options.saveMismatchImages && caseResult.comparison?.equal === false && afterAttempt && diffRgba) {
        const dimensions = caseResult.comparison.before;
        await saveMismatchImageSet(sharp, reportDir, testCase, beforeAttempt, afterAttempt, diffRgba, dimensions.width, dimensions.height, caseResult)
          .catch((error) => {
            caseResult.pixelDiffArtifactError = error instanceof Error ? error.message : String(error);
          });
      }

      if (options.screenshotsOnMismatch && caseResult.status !== 'passed') {
        await captureMismatchScreenshot(beforeAttempt.page, reportDir, testCase, 'before', caseResult).catch((error) => {
          caseResult.screenshotErrors ??= [];
          caseResult.screenshotErrors.push(`before: ${error instanceof Error ? error.message : String(error)}`);
        });
        if (afterAttempt) {
          await captureMismatchScreenshot(afterAttempt.page, reportDir, testCase, 'after', caseResult).catch((error) => {
            caseResult.screenshotErrors ??= [];
            caseResult.screenshotErrors.push(`after: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
      }

      for (const attempt of [beforeAttempt, afterAttempt].filter(Boolean)) {
        if (attempt.context) await attempt.context.close().catch(() => {});
      }
      caseResult.durationMs = Date.now() - caseStartedAt;
      report.cases.push(caseResult);
      updateReportCounts(report);
      await writeReport(report, reportDir);
      process.stdout.write(`[${index + 1}/${total}] result ${testCase.key}: ${caseResult.status}\n`);
    }
  } catch (error) {
    report.runnerError = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  report.finishedAt = new Date().toISOString();
  updateReportCounts(report);
  report.failed += report.runnerError ? 1 : 0;
  const reportPath = await writeReport(report, reportDir);
  process.stdout.write(`${JSON.stringify({
    report: path.relative(root, reportPath).replaceAll('\\', '/'),
    suite: report.suite,
    cases: report.cases.length,
    exact: report.exactCount,
    baselineRasterVariance: report.varianceCount,
    failed: report.failed,
    ...(report.runnerError ? { runnerError: report.runnerError.split('\n')[0] } : {}),
  }, null, 2)}\n`);
  if (report.failed > 0) process.exitCode = 1;
}

export { calculatePixelDifference, qualifyBaselineRasterVariance };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const appearanceArg = process.argv.slice(2).find(value => value.startsWith('--appearance='))?.split('=', 2)[1] ?? 'system';
if (!['system', 'light', 'dark'].includes(appearanceArg)) throw new Error('Usage: node --experimental-strip-types tools/phase217-ui-seed.mjs [--appearance=system|light|dark]');

function sourceFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile());
}

// Resolve the repo's @/ source alias so this generator executes the same
// getConerSample and persistence normalizer as the browser application.
registerHooks({
  resolve(specifier, context, nextResolve) {
    let base;
    if (specifier.startsWith('@/')) base = path.resolve(sourceRoot, specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    } else return nextResolve(specifier, context);
    const resolved = sourceFile(base);
    if (!resolved) throw new Error(`Unable to resolve source alias ${specifier} from ${base}.`);
    return nextResolve(pathToFileURL(resolved).href, context);
  },
});

const [cardsModule, persistenceModule, localeModule, appearanceModule] = await Promise.all([
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
  import('../src/lib/locale-preference.ts'),
  import('../src/lib/app-appearance.ts'),
]);

const { getConerSample } = cardsModule;
const { EDITOR_STORAGE_KEY, EDITOR_STORAGE_VERSION, normalizeCardData, parseStoredEditorDraft, persistEditorDraft } = persistenceModule;
const { LOCALE_STORAGE_KEY } = localeModule;
const { APP_APPEARANCE_STORAGE_KEY } = appearanceModule;
const sample = getConerSample('cinematic', '4:5', 'portrait');
const card = normalizeCardData(sample);
const inMemoryItems = new Map();
const inMemoryStorage = {
  getItem(key) { return inMemoryItems.get(key) ?? null; },
  setItem(key, value) { inMemoryItems.set(key, value); },
};
if (!persistEditorDraft(sample, inMemoryStorage, { fileName: null, mimeType: null })) throw new Error('Existing persistEditorDraft rejected the Coner seed.');
const serializedDraft = inMemoryStorage.getItem(EDITOR_STORAGE_KEY);
if (typeof serializedDraft !== 'string') throw new Error('Existing persistence did not write the expected v3 draft key.');
const payload = JSON.parse(serializedDraft);
if (payload.version !== EDITOR_STORAGE_VERSION) throw new Error(`Expected storage version ${EDITOR_STORAGE_VERSION}; found ${payload.version}.`);
const parsed = parseStoredEditorDraft(serializedDraft);
if (!parsed || parsed.migrated) throw new Error('Generated v3 draft did not parse as a current canonical draft.');
if (JSON.stringify(parsed.card) !== JSON.stringify(card)) throw new Error('Existing store parser changed the generated Coner seed.');
if (parsed.imageMetadata.fileName !== null || parsed.imageMetadata.mimeType !== null) throw new Error('Generated image metadata is not the exact sample-artwork metadata.');
if (card.design.template !== 'cinematic' || card.design.ratio !== '4:5' || card.imageUrl !== '/assets/samples/coner/optimized/portrait.webp') {
  throw new Error('The real getConerSample call did not produce the expected portrait Cinematic 4:5 seed.');
}

const allowedOrigins = [
  'http://qa217.localhost:3016',
  'http://qa217-before.localhost:3017',
];
const storeUiDefaults = { activePanel: 'screenshot', zoom: 1 };
const initScript = `(() => {
  const allowedOrigins = ${JSON.stringify(allowedOrigins)};
  if (!window || !window.location || !allowedOrigins.includes(window.location.origin) || window.location.pathname !== '/editor') return;
  const status = { applied: false, origin: window.location.origin, pathname: window.location.pathname };
  try {
    window.localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)}, ${JSON.stringify(serializedDraft)});
    window.localStorage.setItem(${JSON.stringify(LOCALE_STORAGE_KEY)}, 'ko');
    window.sessionStorage.setItem(${JSON.stringify(LOCALE_STORAGE_KEY)}, 'ko');
    window.localStorage.setItem(${JSON.stringify(APP_APPEARANCE_STORAGE_KEY)}, ${JSON.stringify(appearanceArg)});
    status.applied = true;
    status.version = ${EDITOR_STORAGE_VERSION};
    status.locale = 'ko';
    status.appearance = ${JSON.stringify(appearanceArg)};
    status.template = 'cinematic';
    status.ratio = '4:5';
    status.imageUrl = '/assets/samples/coner/optimized/portrait.webp';
    status.activePanel = 'screenshot';
    status.zoom = 1;
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
  }
  window.__phase217UiSeedStatus = status;
})();`;

function simulateInit(origin, pathname) {
  const localWrites = [];
  const sessionWrites = [];
  const localStorage = { setItem(key, value) { localWrites.push({ key, value }); } };
  const sessionStorage = { setItem(key, value) { sessionWrites.push({ key, value }); } };
  const window = { location: { origin, pathname }, localStorage, sessionStorage };
  runInNewContext(initScript, { window });
  return { window, localWrites, sessionWrites };
}

for (const origin of allowedOrigins) {
  const simulated = simulateInit(origin, '/editor');
  const draft = simulated.localWrites.find(row => row.key === EDITOR_STORAGE_KEY);
  const locale = simulated.localWrites.find(row => row.key === LOCALE_STORAGE_KEY);
  const appearance = simulated.localWrites.find(row => row.key === APP_APPEARANCE_STORAGE_KEY);
  if (simulated.window.__phase217UiSeedStatus?.applied !== true || !draft || !locale || !appearance) {
    throw new Error(`Owned QA origin ${origin} did not receive the seed.`);
  }
  if (JSON.parse(draft.value).version !== EDITOR_STORAGE_VERSION || locale.value !== 'ko' || appearance.value !== appearanceArg) {
    throw new Error(`Owned QA origin ${origin} received an invalid draft, locale, or appearance.`);
  }
  if (simulated.sessionWrites.length !== 1 || simulated.sessionWrites[0].key !== LOCALE_STORAGE_KEY || simulated.sessionWrites[0].value !== 'ko') {
    throw new Error(`Owned QA origin ${origin} did not receive the session locale seed.`);
  }
}

for (const [origin, pathname] of [
  ['http://127.0.0.1:3016', '/editor'],
  ['http://localhost:3016', '/editor'],
  ['https://qa217.localhost:3016', '/editor'],
  [allowedOrigins[0], '/'],
]) {
  const simulated = simulateInit(origin, pathname);
  if (simulated.localWrites.length || simulated.sessionWrites.length || simulated.window.__phase217UiSeedStatus) {
    throw new Error(`Origin/path guard failed to keep the seed away from ${origin}${pathname}.`);
  }
}

const seed = {
  schema: 'phase217-editor-ui-seed-v1',
  generatedAt: new Date().toISOString(),
  sourceCall: "getConerSample('cinematic', '4:5', 'portrait')",
  normalizer: 'src/store/editor-persistence.ts normalizeCardData + parseStoredEditorDraft',
  storeUiSource: 'src/store/editor-store.ts DEFAULT_UI',
  storage: {
    draftKey: EDITOR_STORAGE_KEY,
    version: EDITOR_STORAGE_VERSION,
    localeKey: LOCALE_STORAGE_KEY,
    appearanceKey: APP_APPEARANCE_STORAGE_KEY,
    imageMetadata: payload.imageMetadata,
    payload,
    serializedDraft,
    serializedDraftSha256: createHash('sha256').update(serializedDraft).digest('hex'),
  },
  appearance: appearanceArg,
  locale: 'ko',
  storeUiDefaults,
  expectedCard: {
    characterName: card.character.name,
    family: card.design.template,
    ratio: card.design.ratio,
    layoutVariant: card.design.layoutVariant,
    imageUrl: card.imageUrl,
    imageAdjustments: card.imageAdjustments,
    jobMotifVisible: card.design.jobMotifVisible,
  },
  allowedOrigins,
  originGuard: 'Writes localStorage/sessionStorage only on exact owned QA origins and only at /editor. In particular, 127.0.0.1, plain localhost, and all other origins are no-ops.',
  originGuardValidation: { ownedOriginsSeeded: true, disallowedOriginsAndPathsUnchanged: true },
  initScriptSha256: createHash('sha256').update(initScript).digest('hex'),
  parserValidation: { accepted: true, migrated: false, exactCanonicalCard: true },
};

const qaRoot = path.join(root, 'docs', 'qa', 'phase217');
await mkdir(qaRoot, { recursive: true });
const jsonPath = path.join(qaRoot, `ui-seed-${appearanceArg}.json`);
const scriptPath = path.join(qaRoot, `ui-seed-init-${appearanceArg}.js`);
await Promise.all([
  writeFile(jsonPath, `${JSON.stringify(seed, null, 2)}\n`),
  writeFile(scriptPath, `${initScript}\n`),
]);
console.log(JSON.stringify({
  seed: path.relative(root, jsonPath),
  initScript: path.relative(root, scriptPath),
  appearance: appearanceArg,
  version: EDITOR_STORAGE_VERSION,
  character: card.character.name,
  family: card.design.template,
  ratio: card.design.ratio,
  imageUrl: card.imageUrl,
  allowedOrigins,
  serializedDraftSha256: seed.storage.serializedDraftSha256,
  parserValidation: seed.parserValidation,
}, null, 2));

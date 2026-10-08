import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ editorStore }, { demoAdventurerData }, {
  loadEditorDraft,
  normalizeCardData,
  persistEditorDraft,
  LEGACY_DRAFT_STORAGE_KEY,
  PREVIOUS_DRAFT_STORAGE_KEY,
  EDITOR_STORAGE_KEY,
  RECOVERY_DRAFT_STORAGE_KEY,
}] = await Promise.all([
  import('../src/store/editor-store.ts'),
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
]);
const { subscribeToCardDraft } = await import('../src/components/editor/draft.ts');

class MemoryStorage {
  values = new Map();
  writes = 0;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function restoreDemoCard() {
  editorStore.getState().replaceCardData(demoAdventurerData, {
    persist: false,
    recordHistory: false,
    saveStatus: 'saved',
  });
}

test('v1 drafts migrate legacy text and crop fields into the v3 card shape', () => {
  const storage = new MemoryStorage();
  const legacy = {
    character: {
      name: 'Mira Vale', world: 'Tonberry', dataCenter: 'Elemental', freeCompany: 'Moonlit', job: 'Bard', level: 90,
      race: "Miqo'te", clan: 'Keeper of the Moon', grandCompany: 'Maelstrom', languages: ['EN', 'KO'],
      playStyles: ['Story', 'Glamour'], bio: 'Still looking for the next song.',
    },
    design: {
      template: demoAdventurerData.design.template,
      ratio: demoAdventurerData.design.ratio,
      accentColor: '#aa4455',
      imagePosition: '63% 27%',
      imageScale: 1.22,
      typographyPreset: 'serif',
      effects: demoAdventurerData.design.effects,
    },
    imageUrl: 'data:image/png;base64,ZmFrZQ==',
  };
  storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify(legacy));

  const loaded = loadEditorDraft(storage);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.card.character.name, 'Mira Vale');
  assert.equal(loaded.card.design.palette.accent, '#aa4455');
  assert.deepEqual(loaded.card.imageAdjustments, {
    x: 63,
    y: 27,
    scale: 1.22,
    rotation: 0,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    exposure: 0,
  });

  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    editorStore.getState().hydrate();
    const saved = JSON.parse(storage.getItem(EDITOR_STORAGE_KEY));
    assert.equal(saved.version, 3);
    assert.equal(saved.card.character.name, 'Mira Vale');
    assert.equal(saved.card.character.world, 'Tonberry');
    assert.equal(saved.card.character.worldId, 'global.elemental.tonberry');
    assert.equal(saved.card.character.service, 'global');
    assert.equal(saved.card.character.physicalRegionId, 'japan');
    assert.equal(saved.card.character.dataCenterId, 'global.elemental');
    assert.equal(saved.card.character.jobId, 'bard');
    assert.equal(saved.card.character.raceId, 'miqote');
    assert.equal(saved.card.character.clanId, 'keeper-of-the-moon');
    assert.equal(saved.card.character.grandCompanyId, 'maelstrom');
    assert.deepEqual(saved.card.character.languages, ['en', 'ko']);
    assert.deepEqual(saved.card.character.playStyles, ['story', 'glamour']);
    assert.equal(editorStore.getState().character.name, 'Mira Vale');
    editorStore.getState().setImage({ fileName: 'Mira.png', mimeType: 'image/png' });
    editorStore.getState().persistNow();
    editorStore.setState({ isHydrated: false });
    editorStore.getState().hydrate();
    assert.equal(editorStore.getState().image.fileName, 'Mira.png');
    assert.equal(editorStore.getState().image.mimeType, 'image/png');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('v2 envelope drafts migrate IDs and retain their metadata and custom labels', () => {
  const storage = new MemoryStorage();
  const card = {
    ...demoAdventurerData,
    character: {
      ...demoAdventurerData.character,
      service: undefined,
      physicalRegionId: undefined,
      dataCenterId: undefined,
      worldId: undefined,
      jobId: undefined,
      raceId: undefined,
      clanId: undefined,
      grandCompanyId: undefined,
      name: 'Mira Vale',
      world: 'Tonberry',
      dataCenter: 'Elemental',
      freeCompany: 'Moonlit',
      job: 'Bard',
      race: "Miqo'te",
      clan: 'Keeper of the Moon',
      grandCompany: 'Maelstrom',
      languages: ['EN', 'KO'],
      playStyles: ['Story', 'Glamour', 'My old activity'],
    },
  };
  storage.setItem(PREVIOUS_DRAFT_STORAGE_KEY, JSON.stringify({
    version: 2,
    card,
    imageMetadata: { fileName: 'Mira.webp', mimeType: 'image/webp' },
  }));

  const loaded = loadEditorDraft(storage);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.imageMetadata.fileName, 'Mira.webp');
  assert.equal(loaded.imageMetadata.mimeType, 'image/webp');
  assert.equal(loaded.card.character.world, 'Tonberry');
  assert.equal(loaded.card.character.worldId, 'global.elemental.tonberry');
  assert.deepEqual(loaded.card.character.languages, ['en', 'ko']);
  assert.deepEqual(loaded.card.character.playStyles, ['story', 'glamour', 'My old activity']);
});

test('character edits can be undone and redone', () => {
  editorStore.getState().replaceCardData(demoAdventurerData, { persist: false, recordHistory: false });
  editorStore.getState().updateCharacter('name', 'Ari Sol');
  assert.equal(editorStore.getState().character.name, 'Ari Sol');
  assert.equal(editorStore.getState().history.past.length, 1);

  editorStore.getState().undo();
  assert.equal(editorStore.getState().character.name, demoAdventurerData.character.name);
  assert.equal(editorStore.getState().history.future.length, 1);
  editorStore.getState().redo();
  assert.equal(editorStore.getState().character.name, 'Ari Sol');
});

test('a grouped image drag produces one undo entry for the whole gesture', () => {
  editorStore.getState().replaceCardData(demoAdventurerData, { persist: false, recordHistory: false });
  const initialX = editorStore.getState().image.x;
  editorStore.getState().beginImageAdjustmentGroup('pointer-drag');
  editorStore.getState().setImage({ x: 40, y: 45 }, { groupId: 'pointer-drag' });
  editorStore.getState().setImage({ x: 35, y: 52 }, { groupId: 'pointer-drag' });
  editorStore.getState().endImageAdjustmentGroup();

  assert.equal(editorStore.getState().history.past.length, 1);
  assert.equal(editorStore.getState().image.x, 35);
  editorStore.getState().undo();
  assert.equal(editorStore.getState().image.x, initialX);
  editorStore.getState().redo();
  assert.equal(editorStore.getState().image.x, 35);
  assert.equal(editorStore.getState().design.imagePosition, '35% 52%');
});

test('malformed current storage is backed up before a valid older draft is migrated', () => {
  const storage = new MemoryStorage();
  const corrupt = '{ this is not valid JSON';
  const oldCard = {
    ...demoAdventurerData,
    character: {
      ...demoAdventurerData.character,
      name: 'Recovered Mira',
      job: 'Bard',
      jobId: 'deleted-job',
      world: 'Tonberry',
      dataCenter: 'Elemental',
      worldId: 'deleted-world',
    },
  };
  storage.setItem(EDITOR_STORAGE_KEY, corrupt);
  storage.setItem(PREVIOUS_DRAFT_STORAGE_KEY, JSON.stringify({ version: 2, card: oldCard }));

  const loaded = loadEditorDraft(storage);
  assert.equal(loaded.card.character.name, 'Recovered Mira');
  assert.equal(loaded.card.character.jobId, 'bard');
  assert.equal(loaded.card.character.worldId, 'global.elemental.tonberry');
  assert.equal(loaded.migrated, true);

  assert.equal(persistEditorDraft(loaded.card, storage, loaded.imageMetadata), true);
  assert.equal(storage.getItem(RECOVERY_DRAFT_STORAGE_KEY), corrupt);
  assert.equal(JSON.parse(storage.getItem(EDITOR_STORAGE_KEY)).version, 3);
});

test('unknown future schema is kept recoverable while draft normalization drops invalid IDs', () => {
  const storage = new MemoryStorage();
  const future = JSON.stringify({ version: 99, card: { name: 'Future data', unknown: 'keep' } });
  storage.setItem(EDITOR_STORAGE_KEY, future);

  const loaded = loadEditorDraft(storage);
  assert.equal(loaded.card.character.name, demoAdventurerData.character.name);
  assert.equal(loaded.migrated, false);

  const normalized = normalizeCardData({
    ...demoAdventurerData,
    design: { ...demoAdventurerData.design, template: 'identity-master', typographyPreset: 'serif', futureField: { ignored: true } },
    character: {
      ...demoAdventurerData.character,
      job: 'Bard',
      grandCompany: 'Maelstrom',
      service: 'global',
      physicalRegionId: 'europe',
      dataCenterId: 'global.chaos',
      worldId: 'global.elemental.tonberry',
      jobId: 'missing-job',
      raceId: 'hyur',
      clanId: 'keeper-of-the-moon',
      grandCompanyId: 'deleted-company',
    },
  });
  assert.equal(normalized.design.template, 'id-card');
  assert.equal(normalized.design.typographyPreset, 'editorial');
  assert.equal(normalized.character.worldId, 'global.elemental.tonberry');
  assert.equal(normalized.character.service, 'global');
  assert.equal(normalized.character.physicalRegionId, 'japan');
  assert.equal(normalized.character.dataCenterId, 'global.elemental');
  assert.equal(normalized.character.jobId, 'bard');
  assert.equal(normalized.character.raceId, 'hyur');
  assert.equal(normalized.character.clanId, null);
  assert.equal(normalized.character.clan, '');
  assert.equal(normalized.character.grandCompanyId, 'maelstrom');
  assert.equal(Object.hasOwn(normalized.design, 'futureField'), false);

  persistEditorDraft(loaded.card, storage, loaded.imageMetadata);
  assert.equal(storage.getItem(RECOVERY_DRAFT_STORAGE_KEY), future);
});

test('direct canonical updates keep service, world, data center, race and clan aligned', () => {
  restoreDemoCard();
  editorStore.getState().setCharacter({
    service: 'global',
    physicalRegionId: 'europe',
    dataCenterId: 'global.chaos',
    dataCenter: 'Chaos',
    worldId: null,
    world: '',
  });
  editorStore.getState().setCharacter({
    worldId: 'global.elemental.tonberry',
    world: 'Tonberry',
  });
  let character = editorStore.getState().character;
  assert.equal(character.service, 'global');
  assert.equal(character.physicalRegionId, 'japan');
  assert.equal(character.dataCenterId, 'global.elemental');
  assert.equal(character.worldId, 'global.elemental.tonberry');

  editorStore.getState().setCharacter({ service: 'korea' });
  character = editorStore.getState().character;
  assert.equal(character.service, 'korea');
  assert.equal(character.physicalRegionId, null);
  assert.equal(character.dataCenterId, null);
  assert.equal(character.worldId, null);
  assert.equal(character.world, '');

  editorStore.getState().setCharacter({ raceId: 'au-ra', race: 'Au Ra', clanId: 'raen', clan: 'Raen' });
  editorStore.getState().setCharacter({ raceId: 'hyur', race: 'Hyur' });
  character = editorStore.getState().character;
  assert.equal(character.raceId, 'hyur');
  assert.equal(character.clanId, null);
  assert.equal(character.clan, '');

  editorStore.getState().setCharacter({ clanId: 'highlander', clan: 'Highlander' });
  character = editorStore.getState().character;
  assert.equal(character.raceId, 'hyur');
  assert.equal(character.clanId, 'highlander');
});

test('text changes group into one IME-safe undo and history stays bounded', () => {
  restoreDemoCard();
  const initialName = editorStore.getState().character.name;
  editorStore.getState().beginHistoryGroup('name-ime');
  editorStore.getState().updateCharacter('name', '모', { groupId: 'name-ime' });
  editorStore.getState().updateCharacter('name', '모서', { groupId: 'name-ime' });
  editorStore.getState().updateCharacter('name', '모서리', { groupId: 'name-ime' });
  editorStore.getState().endHistoryGroup();
  assert.equal(editorStore.getState().history.past.length, 1);
  editorStore.getState().undo();
  assert.equal(editorStore.getState().character.name, initialName);

  restoreDemoCard();
  for (let index = 0; index < 50; index += 1) {
    editorStore.getState().updateCharacter('freeCompany', `Guild ${index}`);
  }
  assert.equal(editorStore.getState().history.past.length, 40);
  for (let index = 0; index < 50; index += 1) editorStore.getState().undo();
  assert.equal(editorStore.getState().history.future.length, 40);
  for (let index = 0; index < 50; index += 1) editorStore.getState().redo();
  assert.equal(editorStore.getState().history.past.length, 40);
});

test('a design edit ends an image-scale group without undoing the image adjustment', () => {
  restoreDemoCard();
  const initialRatio = editorStore.getState().design.ratio;
  editorStore.getState().beginImageAdjustmentGroup('image-scale');
  editorStore.getState().setImage({ scale: 1.25 }, { groupId: 'image-scale' });
  editorStore.getState().setDesign({ ratio: '3:4' });

  editorStore.getState().undo();
  assert.equal(editorStore.getState().design.ratio, initialRatio);
  assert.equal(editorStore.getState().image.scale, 1.25);
});

test('a different character field cannot join a pending name group', () => {
  restoreDemoCard();
  const initialName = editorStore.getState().character.name;
  const initialJob = editorStore.getState().character.job;
  editorStore.getState().beginHistoryGroup('name-ime');
  editorStore.getState().updateCharacter('name', 'Composing', { groupId: 'name-ime' });
  editorStore.getState().updateCharacter('name', 'Composing name');
  editorStore.getState().setCharacter({ job: 'Ninja', jobId: 'ninja' });
  editorStore.getState().endHistoryGroup();

  editorStore.getState().undo();
  assert.equal(editorStore.getState().character.job, initialJob);
  assert.equal(editorStore.getState().character.name, 'Composing name');
  editorStore.getState().undo();
  assert.equal(editorStore.getState().character.name, initialName);
});

test('same-value edits and saves do not add history or rewrite storage', () => {
  restoreDemoCard();
  const storage = new MemoryStorage();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    assert.equal(editorStore.getState().persistNow(), true);
    const writes = storage.writes;
    const state = editorStore.getState();
    state.updateCharacter('name', state.character.name);
    state.setDesign({ ratio: state.design.ratio });
    state.setImage({ x: state.image.x });
    state.beginHistoryGroup('empty-focus');
    state.endHistoryGroup();
    assert.equal(editorStore.getState().history.past.length, 0);
    assert.equal(editorStore.getState().persistNow(), true);
    assert.equal(storage.writes, writes);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('persistNow cannot overwrite an existing draft before hydration completes', () => {
  restoreDemoCard();
  const storage = new MemoryStorage();
  const existing = JSON.stringify({
    version: 3,
    card: {
      ...demoAdventurerData,
      character: { ...demoAdventurerData.character, name: 'Saved before remount' },
    },
    imageMetadata: { fileName: 'Saved.png', mimeType: 'image/png' },
  });
  storage.setItem(EDITOR_STORAGE_KEY, existing);
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    editorStore.setState({ isHydrated: false });
    assert.equal(editorStore.getState().persistNow(), false);
    assert.equal(storage.getItem(EDITOR_STORAGE_KEY), existing);
    assert.equal(storage.writes, 1);
  } finally {
    editorStore.setState({ isHydrated: true });
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('a malformed cross-tab draft event does not replace the current editor state', () => {
  restoreDemoCard();
  editorStore.getState().updateCharacter('name', 'Keep this edit', { persist: false });
  const historyLength = editorStore.getState().history.past.length;
  const originalWindow = globalThis.window;
  let storageListener;
  globalThis.window = {
    localStorage: new MemoryStorage(),
    addEventListener: (_name, listener) => { storageListener = listener; },
    removeEventListener: () => {},
  };
  try {
    const unsubscribe = subscribeToCardDraft(() => {});
    storageListener({ key: EDITOR_STORAGE_KEY, newValue: '{ broken JSON' });
    assert.equal(editorStore.getState().character.name, 'Keep this edit');
    assert.equal(editorStore.getState().history.past.length, historyLength);
    unsubscribe();
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('uploaded image and derived palette are one undo step; custom colors survive replacement', () => {
  restoreDemoCard();
  const originalImage = editorStore.getState().image.src;
  const originalPalette = { ...editorStore.getState().design.palette };
  const uploadedPalette = { primary: '#123456', accent: '#abcdef', light: '#ffffff', dark: '#000000' };
  editorStore.getState().replaceUploadedImage({
    src: 'data:image/png;base64,QQ==',
    fileName: 'Screenshot A.png',
    mimeType: 'image/png',
  }, uploadedPalette);
  assert.equal(editorStore.getState().history.past.length, 1);
  assert.equal(editorStore.getState().design.palette.accent, uploadedPalette.accent);
  editorStore.getState().undo();
  assert.equal(editorStore.getState().image.src, originalImage);
  assert.deepEqual(editorStore.getState().design.palette, originalPalette);
  editorStore.getState().redo();
  assert.equal(editorStore.getState().image.fileName, 'Screenshot A.png');

  editorStore.getState().setDesign({
    colorMode: 'custom',
    palette: { primary: '#202020', accent: '#cc3344', light: '#eeeeee', dark: '#101010' },
    accentColor: '#cc3344',
  });
  const customPalette = { ...editorStore.getState().design.palette };
  editorStore.getState().replaceUploadedImage({
    src: 'data:image/webp;base64,QQ==',
    fileName: 'Screenshot B.webp',
    mimeType: 'image/webp',
  }, uploadedPalette);
  assert.equal(editorStore.getState().design.colorMode, 'custom');
  assert.deepEqual(editorStore.getState().design.palette, customPalette);
});

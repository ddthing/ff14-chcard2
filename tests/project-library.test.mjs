import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ createProjectLibrary, limitProjectName, normalizeProjectName, normalizeProjectSummary, normalizeSavedProject }, { demoAdventurerData }, { normalizeCharacterUpdate }] = await Promise.all([
  import('../src/lib/project-library.ts'),
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
]);

class MemoryRequest {
  onsuccess = null;
  onerror = null;
  result;
  error = null;
}

class MemoryTransaction {
  oncomplete = null;
  onerror = null;
  onabort = null;
  error = null;
  pending = 0;
  failed = false;
  completionQueued = false;
  snapshots = new Map();

  constructor(database, names, mode) {
    this.database = database;
    this.names = Array.isArray(names) ? names : [names];
    this.mode = mode;
    for (const name of this.names) {
      this.snapshots.set(name, new Map(database.stores.get(name)));
    }
  }

  objectStore(name) {
    assert.ok(this.names.includes(name));
    return new MemoryObjectStore(this, name);
  }

  schedule(operation) {
    const request = new MemoryRequest();
    this.pending += 1;
    queueMicrotask(() => {
      try {
        if (this.failed) return;
        request.result = operation();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        this.abort(error);
        request.onerror?.({ target: request });
        this.onerror?.({ target: this });
      } finally {
        this.pending -= 1;
        this.queueComplete();
      }
    });
    return request;
  }

  queueComplete() {
    if (this.pending !== 0 || this.completionQueued || this.failed) return;
    this.completionQueued = true;
    queueMicrotask(() => {
      this.completionQueued = false;
      if (this.pending === 0 && !this.failed) this.oncomplete?.({ target: this });
    });
  }

  abort(error = new Error('Transaction aborted.')) {
    if (this.failed) return;
    this.failed = true;
    this.error = error;
    for (const [name, values] of this.snapshots) this.database.stores.set(name, new Map(values));
    this.onabort?.({ target: this });
  }
}

class MemoryObjectStore {
  constructor(transaction, name) {
    this.transaction = transaction;
    this.name = name;
  }

  get(key) {
    return this.transaction.schedule(() => this.transaction.database.stores.get(this.name).get(key));
  }

  getAll() {
    return this.transaction.schedule(() => [...this.transaction.database.stores.get(this.name).values()]);
  }

  add(value) {
    return this.write(value, true);
  }

  put(value) {
    return this.write(value, false);
  }

  write(value, rejectExisting) {
    return this.transaction.schedule(() => {
      if (this.transaction.mode !== 'readwrite') throw new Error('Read-only transaction.');
      if (this.transaction.database.failNextWrite) {
        this.transaction.database.failNextWrite = false;
        const quotaError = new Error('Storage quota exceeded.');
        quotaError.name = 'QuotaExceededError';
        throw quotaError;
      }
      const keyPath = this.transaction.database.keyPaths.get(this.name);
      const key = value[keyPath];
      const values = this.transaction.database.stores.get(this.name);
      if (rejectExisting && values.has(key)) {
        const error = new Error('A record with this key already exists.');
        error.name = 'ConstraintError';
        throw error;
      }
      values.set(key, structuredClone(value));
      return key;
    });
  }

  delete(key) {
    return this.transaction.schedule(() => {
      if (this.transaction.mode !== 'readwrite') throw new Error('Read-only transaction.');
      this.transaction.database.stores.get(this.name).delete(key);
    });
  }
}

class MemoryDatabase {
  constructor() {
    this.stores = new Map();
    this.keyPaths = new Map();
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
    this.failNextWrite = false;
  }

  createObjectStore(name, options) {
    this.stores.set(name, new Map());
    this.keyPaths.set(name, options.keyPath);
    return {};
  }

  transaction(names, mode) {
    return new MemoryTransaction(this, names, mode);
  }

  close() {}
}

class MemoryIndexedDB {
  database = new MemoryDatabase();

  open() {
    const request = new MemoryRequest();
    request.result = this.database;
    queueMicrotask(() => {
      request.onupgradeneeded?.({ target: request });
      queueMicrotask(() => request.onsuccess?.({ target: request }));
    });
    return request;
  }
}

function cardWithUploadedImage() {
  return {
    ...demoAdventurerData,
    imageUrl: 'data:image/png;base64,aGVsbG8=',
    character: { ...demoAdventurerData.character, languages: [...demoAdventurerData.character.languages], playStyles: [...demoAdventurerData.character.playStyles] },
  };
}

test('project library saves complete card data and uploaded image metadata, then supports list, rename, duplicate, and delete', async () => {
  const indexedDB = new MemoryIndexedDB();
  const library = createProjectLibrary(indexedDB);
  const data = cardWithUploadedImage();

  const original = await library.save({
    name: 'Dawn over Limsa',
    data,
    imageMetadata: { fileName: 'limsa-dawn.png', mimeType: 'image/png' },
  });
  const loaded = await library.get(original.id);
  assert.equal(loaded.data.imageUrl, data.imageUrl);
  assert.equal(loaded.imageMetadata.fileName, 'limsa-dawn.png');
  assert.equal(loaded.imageMetadata.mimeType, 'image/png');

  const duplicate = await library.duplicate(original.id, 'Dawn over Limsa copy');
  assert.notEqual(duplicate.id, original.id);
  assert.equal((await library.get(duplicate.id)).imageMetadata.fileName, 'limsa-dawn.png');

  assert.equal(await library.rename(original.id, 'Evening in Limsa'), true);
  const list = await library.list();
  assert.deepEqual(list.projects.map(({ name }) => name).sort(), ['Dawn over Limsa copy', 'Evening in Limsa']);
  assert.equal(list.unreadableCount, 0);

  await library.delete(duplicate.id);
  assert.equal((await library.list()).projects.length, 1);
});

test('project save and reload preserve the selected decorative copy mode without a schema change', async () => {
  const library = createProjectLibrary(new MemoryIndexedDB());
  const data = cardWithUploadedImage();
  data.design.decorativeCopy = 'companions';

  const summary = await library.save({ name: 'Shared journey', data });
  const loaded = await library.get(summary.id);

  assert.equal(summary.schemaVersion, 1);
  assert.equal(loaded.data.design.decorativeCopy, 'companions');
});

test('project save and reload preserve a deliberately cleared clan', async () => {
  const library = createProjectLibrary(new MemoryIndexedDB());
  const data = cardWithUploadedImage();
  data.character = normalizeCharacterUpdate(data.character, { clan: '', clanId: null });
  assert.equal(data.character.race, 'Lalafell');
  assert.equal(data.character.raceId, 'lalafell');
  assert.equal(data.character.clan, '');
  assert.equal(data.character.clanId, null);

  const project = await library.save({ name: 'No clan selected', data });
  const loaded = await library.get(project.id);
  assert.equal(loaded.data.character.clan, '');
  assert.equal(loaded.data.character.clanId, null);
  assert.equal(loaded.data.character.raceId, 'lalafell');
});

test('normalization rejects unknown schema, invalid names, and expired object URLs instead of substituting a demo card', () => {
  const summary = {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Saved card',
    createdAt: 10,
    updatedAt: 10,
    characterName: 'Mira',
    job: 'White Mage',
    template: 'cinematic',
    ratio: '4:5',
  };
  assert.equal(normalizeProjectSummary({ ...summary, schemaVersion: 99 }), null);
  assert.throws(() => normalizeProjectName(''), { code: 'invalid-name' });
  assert.throws(() => normalizeProjectName('x'.repeat(81)), { code: 'invalid-name' });

  const normalized = normalizeSavedProject({
    ...summary,
    payload: {
      projectId: summary.id,
      data: { ...cardWithUploadedImage(), imageUrl: 'blob:expired' },
      imageMetadata: { fileName: 'old.png', mimeType: 'image/png' },
    },
  });
  assert.equal(normalized, null);
});

test('project names retain up to 80 Unicode code points through storage and reload', async () => {
  const library = createProjectLibrary(new MemoryIndexedDB());
  const name = '🌙'.repeat(80);
  assert.equal(normalizeProjectName(name), name);

  const summary = await library.save({ name, data: demoAdventurerData });
  assert.equal(summary.name, name);
  assert.equal((await library.get(summary.id)).name, name);
  assert.equal((await library.list()).projects[0].name, name);
});

test('project-name input limiting uses 80 Unicode code points for emoji, mixed, and BMP text', () => {
  const emojiName = '🌙'.repeat(80);
  assert.equal(limitProjectName(emojiName), emojiName);
  assert.equal(limitProjectName(`${emojiName}🌙`), emojiName);
  assert.equal(limitProjectName('A🌙'.repeat(41)), 'A🌙'.repeat(40));
  assert.equal(limitProjectName('x'.repeat(81)), 'x'.repeat(80));
  assert.equal(limitProjectName('A'.repeat(80)), 'A'.repeat(80));
  assert.equal(limitProjectName('A'.repeat(81)), 'A'.repeat(80));
});

test('quota failure leaves the existing library intact and reports a recoverable storage error', async () => {
  const indexedDB = new MemoryIndexedDB();
  const library = createProjectLibrary(indexedDB);
  await library.save({ name: 'First card', data: demoAdventurerData });
  indexedDB.database.failNextWrite = true;

  await assert.rejects(
    library.save({ name: 'Second card', data: demoAdventurerData }),
    { code: 'quota' },
  );
  const list = await library.list();
  assert.deepEqual(list.projects.map(({ name }) => name), ['First card']);
});

test('unsupported storage is surfaced as an explicit local-library error', async () => {
  const indexedDB = new MemoryIndexedDB();
  let blocked = true;
  const library = createProjectLibrary({
    open(...args) {
      if (blocked) throw new Error('blocked by browser policy');
      return indexedDB.open(...args);
    },
  });
  await assert.rejects(library.list(), { code: 'unavailable' });
  blocked = false;
  assert.deepEqual((await library.list()).projects, []);
});

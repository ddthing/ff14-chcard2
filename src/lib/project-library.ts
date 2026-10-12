import type { AdventurerCardData, AdventurerCardTemplate, CardRatio } from '@/components/cards/types';
import { normalizeCardData } from '@/store/editor-persistence';

export const PROJECT_LIBRARY_DATABASE = 'ff14-adventurer-card:project-library';
export const PROJECT_LIBRARY_VERSION = 1;

const PROJECTS_STORE = 'projects';
const PAYLOADS_STORE = 'payloads';
export const PROJECT_NAME_MAX_CODE_POINTS = 80;

export type ProjectLibraryErrorCode =
  | 'unavailable'
  | 'blocked'
  | 'quota'
  | 'corrupt'
  | 'missing'
  | 'invalid-name'
  | 'failed';

export class ProjectLibraryError extends Error {
  readonly code: ProjectLibraryErrorCode;

  constructor(code: ProjectLibraryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectLibraryError';
    this.code = code;
  }
}

export interface ProjectImageMetadata {
  fileName: string | null;
  mimeType: string | null;
}

export interface ProjectLibrarySummary {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  characterName: string;
  job: string;
  template: AdventurerCardTemplate;
  ratio: CardRatio;
}

export interface SavedProject extends ProjectLibrarySummary {
  data: AdventurerCardData;
  imageMetadata: ProjectImageMetadata;
}

export interface ProjectLibraryList {
  projects: ProjectLibrarySummary[];
  unreadableCount: number;
}

export interface ProjectLibrary {
  list(): Promise<ProjectLibraryList>;
  get(id: string): Promise<SavedProject>;
  save(input: {
    name: string;
    data: AdventurerCardData;
    imageMetadata?: ProjectImageMetadata;
  }): Promise<ProjectLibrarySummary>;
  rename(id: string, name: string): Promise<boolean>;
  duplicate(id: string, name: string): Promise<ProjectLibrarySummary>;
  delete(id: string): Promise<void>;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function isTemplate(value: unknown): value is AdventurerCardTemplate {
  return value === 'cinematic' || value === 'editorial' || value === 'id-card';
}

function isRatio(value: unknown): value is CardRatio {
  return value === '1:1' || value === '4:5' || value === '3:4' || value === '9:16' || value === '16:9';
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/gu, '').trim()).slice(0, maxLength).join('');
}

export function normalizeProjectName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, '').trim() : '';
  if (!name || Array.from(name).length > PROJECT_NAME_MAX_CODE_POINTS) {
    throw new ProjectLibraryError('invalid-name', 'Project names must contain 1 to 80 characters.');
  }
  return name;
}

/** Keeps controlled project-name inputs within the same Unicode code-point limit as storage. */
export function limitProjectName(value: string): string {
  return Array.from(value).slice(0, PROJECT_NAME_MAX_CODE_POINTS).join('');
}

function normalizeImageMetadata(value: unknown): ProjectImageMetadata {
  const input = asRecord(value);
  const fileName = cleanText(input?.fileName, 255);
  const mimeType = cleanText(input?.mimeType, 120);
  return {
    fileName: fileName || null,
    mimeType: mimeType || null,
  };
}

/** Validates the metadata index independently from the larger card payload. */
export function normalizeProjectSummary(value: unknown): ProjectLibrarySummary | null {
  const input = asRecord(value);
  if (!input) return null;

  const id = cleanText(input.id, 200);
  if (input.schemaVersion !== PROJECT_LIBRARY_VERSION) return null;
  const rawName = typeof input.name === 'string'
    ? input.name.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
    : '';
  if (!rawName || Array.from(rawName).length > PROJECT_NAME_MAX_CODE_POINTS) return null;
  const name = cleanText(rawName, PROJECT_NAME_MAX_CODE_POINTS);
  const createdAt = typeof input.createdAt === 'number' ? input.createdAt : Number.NaN;
  const updatedAt = typeof input.updatedAt === 'number' ? input.updatedAt : Number.NaN;
  const characterName = cleanText(input.characterName, 120);
  const job = cleanText(input.job, 80);

  if (!id || !name ||
      !Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;

  return {
    schemaVersion: PROJECT_LIBRARY_VERSION,
    id,
    name,
    createdAt,
    updatedAt,
    characterName,
    job,
    template: isTemplate(input.template) ? input.template : 'cinematic',
    ratio: isRatio(input.ratio) ? input.ratio : '4:5',
  };
}

/** Normalizes current and older card shapes while rejecting records that would silently become the demo card. */
export function normalizeSavedProject(value: unknown): SavedProject | null {
  const input = asRecord(value);
  const summary = normalizeProjectSummary(input);
  const payload = asRecord(input?.payload);
  const rawData = asRecord(payload?.data);
  if (!summary || !payload || !rawData ||
      payload.projectId !== summary.id ||
      !asRecord(rawData.character) || !asRecord(rawData.design) ||
      typeof rawData.imageUrl !== 'string' || !asRecord(rawData.imageAdjustments)) return null;

  try {
    const sourceUrl = rawData.imageUrl.trim();
    const data = normalizeCardData(rawData);
    if (!sourceUrl || data.imageUrl !== sourceUrl) return null;
    return {
      ...summary,
      data,
      imageMetadata: normalizeImageMetadata(payload.imageMetadata),
    };
  } catch {
    return null;
  }
}

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function asLibraryError(error: unknown, fallbackCode: ProjectLibraryErrorCode = 'failed'): ProjectLibraryError {
  if (error instanceof ProjectLibraryError) return error;
  const input = asRecord(error);
  const name = typeof input?.name === 'string' ? input.name : '';
  const message = error instanceof Error ? error.message : 'The local project library could not complete this action.';
  if (name === 'QuotaExceededError' || /quota|storage (?:is )?full|not enough space/i.test(message)) {
    return new ProjectLibraryError('quota', message, { cause: error });
  }
  return new ProjectLibraryError(fallbackCode, message, { cause: error });
}

function getIndexedDBFactory(): IDBFactory | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    return undefined;
  }
}

function openDatabase(factory: IDBFactory | undefined): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new ProjectLibraryError('unavailable', 'IndexedDB is unavailable.'));

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(PROJECT_LIBRARY_DATABASE, PROJECT_LIBRARY_VERSION);
    } catch (error) {
      reject(asLibraryError(error, 'unavailable'));
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PAYLOADS_STORE)) {
        database.createObjectStore(PAYLOADS_STORE, { keyPath: 'projectId' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(asLibraryError(request.error, 'unavailable'));
    request.onblocked = () => reject(new ProjectLibraryError('blocked', 'The local project library is busy in another tab.'));
  });
}

function runTransaction<T>(
  database: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  start: (transaction: IDBTransaction, setResult: (value: T) => void, fail: (error: unknown) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(stores, mode);
    } catch (error) {
      reject(asLibraryError(error));
      return;
    }

    let settled = false;
    let hasResult = false;
    let result: T;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(asLibraryError(error ?? transaction.error));
    };
    const setResult = (value: T) => {
      result = value;
      hasResult = true;
    };

    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      if (!hasResult) {
        reject(new ProjectLibraryError('failed', 'The local project library returned no result.'));
        return;
      }
      resolve(result);
    };
    transaction.onerror = () => fail(transaction.error);
    transaction.onabort = () => fail(transaction.error);

    try {
      start(transaction, setResult, fail);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        fail(error);
      }
      fail(error);
    }
  });
}

function setRequestHandlers<T>(
  request: IDBRequest<T>,
  onSuccess: (value: T) => void,
  fail: (error: unknown) => void,
): void {
  request.onsuccess = () => onSuccess(request.result);
  request.onerror = () => fail(request.error);
}

function summaryFromCard(
  id: string,
  name: string,
  data: AdventurerCardData,
  createdAt: number,
  updatedAt: number,
): ProjectLibrarySummary {
  return {
    schemaVersion: PROJECT_LIBRARY_VERSION,
    id,
    name,
    createdAt,
    updatedAt,
    characterName: cleanText(data.character.name, 120),
    job: cleanText(data.character.job, 80),
    template: data.design.template,
    ratio: data.design.ratio,
  };
}

export function createProjectLibrary(factory?: IDBFactory): ProjectLibrary {
  let databasePromise: Promise<IDBDatabase> | undefined;
  const getDatabase = () => {
    if (!databasePromise) {
      databasePromise = openDatabase(factory ?? getIndexedDBFactory()).catch((error: unknown) => {
        databasePromise = undefined;
        throw error;
      });
    }
    return databasePromise;
  };

  const load = async (id: string): Promise<SavedProject> => {
    const database = await getDatabase();
    const records = await runTransaction<{ project: unknown; payload: unknown }>(
      database,
      [PROJECTS_STORE, PAYLOADS_STORE],
      'readonly',
      (transaction, setResult, fail) => {
        let remaining = 2;
        let project: unknown;
        let payload: unknown;
        const finish = () => {
          remaining -= 1;
          if (remaining === 0) setResult({ project, payload });
        };
        setRequestHandlers(transaction.objectStore(PROJECTS_STORE).get(id), (value) => { project = value; finish(); }, fail);
        setRequestHandlers(transaction.objectStore(PAYLOADS_STORE).get(id), (value) => { payload = value; finish(); }, fail);
      },
    );
    const summary = normalizeProjectSummary(records.project);
    if (!summary) throw new ProjectLibraryError('missing', 'This saved project is no longer available.');
    const input = asRecord(records.payload);
    const normalized = normalizeSavedProject({ ...summary, payload: input });
    if (!normalized) throw new ProjectLibraryError('corrupt', 'This saved project could not be read safely.');
    return normalized;
  };

  const save = async ({ name: rawName, data: rawData, imageMetadata }: {
    name: string;
    data: AdventurerCardData;
    imageMetadata?: ProjectImageMetadata;
  }): Promise<ProjectLibrarySummary> => {
    const name = normalizeProjectName(rawName);
    let data: AdventurerCardData;
    try {
      data = normalizeCardData(rawData);
    } catch (error) {
      throw new ProjectLibraryError('corrupt', 'The current card could not be normalized for saving.', { cause: error });
    }
    const now = Date.now();
    const summary = summaryFromCard(createId(), name, data, now, now);
    const payload = {
      projectId: summary.id,
      data,
      imageMetadata: normalizeImageMetadata(imageMetadata),
    };
    const database = await getDatabase();
    return runTransaction<ProjectLibrarySummary>(database, [PROJECTS_STORE, PAYLOADS_STORE], 'readwrite', (transaction, setResult) => {
      transaction.objectStore(PROJECTS_STORE).add(summary);
      transaction.objectStore(PAYLOADS_STORE).add(payload);
      setResult(summary);
    });
  };

  return {
    async list() {
      const database = await getDatabase();
      const records = await runTransaction<unknown[]>(database, PROJECTS_STORE, 'readonly', (transaction, setResult, fail) => {
        setRequestHandlers(transaction.objectStore(PROJECTS_STORE).getAll(), (value) => setResult(value), fail);
      });
      let unreadableCount = 0;
      const projects = records.flatMap((record) => {
        const summary = normalizeProjectSummary(record);
        if (!summary) {
          unreadableCount += 1;
          return [];
        }
        return [summary];
      }).sort((left, right) => right.updatedAt - left.updatedAt);
      return { projects, unreadableCount };
    },

    async get(id) {
      return load(id);
    },

    async save(input) {
      return save(input);
    },

    async rename(id, rawName) {
      const name = normalizeProjectName(rawName);
      const database = await getDatabase();
      return runTransaction<boolean>(database, PROJECTS_STORE, 'readwrite', (transaction, setResult, fail) => {
        const store = transaction.objectStore(PROJECTS_STORE);
        setRequestHandlers(store.get(id), (value) => {
          const current = normalizeProjectSummary(value);
          if (!current) {
            setResult(false);
            return;
          }
          const updated = { ...current, name, updatedAt: Date.now() };
          const request = store.put(updated);
          request.onerror = () => fail(request.error);
          setResult(true);
        }, fail);
      });
    },

    async duplicate(id, rawName) {
      const name = normalizeProjectName(rawName);
      const original = await load(id);
      return save({ name, data: original.data, imageMetadata: original.imageMetadata });
    },

    async delete(id) {
      const database = await getDatabase();
      await runTransaction<void>(database, [PROJECTS_STORE, PAYLOADS_STORE], 'readwrite', (transaction, setResult, fail) => {
        const projectRequest = transaction.objectStore(PROJECTS_STORE).delete(id);
        const payloadRequest = transaction.objectStore(PAYLOADS_STORE).delete(id);
        projectRequest.onerror = () => fail(projectRequest.error);
        payloadRequest.onerror = () => fail(payloadRequest.error);
        setResult(undefined);
      });
    },
  };
}

export const projectLibrary = createProjectLibrary();

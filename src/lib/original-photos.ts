import { ImageProcessingError, prepareImageFile, type ImageProcessingOptions, type PreparedImage } from './image-processing';

const databaseName = 'ff14-adventurer-card:original-photos';
const storeName = 'photos';

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export type PreparedEditorPhoto = PreparedImage & { originalPhotoId: string };

export async function prepareEditorPhoto(file: File, options: ImageProcessingOptions): Promise<PreparedEditorPhoto> {
  const preview = await prepareImageFile(file, options);
  const { signal } = options;
  signal?.throwIfAborted();
  const originalPhotoId = crypto.randomUUID();
  try {
    const database = await openPhotoDatabase();
    try {
      signal?.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const abort = () => {
          try { transaction.abort(); } catch { /* The transaction already committed. */ }
        };
        const cleanup = () => signal?.removeEventListener('abort', abort);
        transaction.oncomplete = () => { cleanup(); resolve(); };
        transaction.onabort = () => { cleanup(); reject(transaction.error); };
        transaction.onerror = () => { cleanup(); reject(transaction.error); };
        transaction.objectStore(storeName).put(file.slice(0, file.size, preview.sourceMimeType), originalPhotoId);
        signal?.addEventListener('abort', abort, { once: true });
      });
    } finally {
      database.close();
    }
  } catch {
    if (signal?.aborted) throw new ImageProcessingError('cancelled', 'Photo preparation was cancelled.');
    throw new ImageProcessingError('storage-budget', 'The browser could not save the original photo.');
  }
  return { ...preview, originalPhotoId };
}

export async function readOriginalPhoto(id: string): Promise<Blob | undefined> {
  const database = await openPhotoDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
    });
  } finally {
    database.close();
  }
}

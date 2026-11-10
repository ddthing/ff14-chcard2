export const REATIC_FAMILY = 'Reatic Card Local';
export const REATIC_SOURCE = 'https://www.reaticindustry.com/reaticfont';

const RELEASE_FILES = {
  2632952: { mime: 'font/otf', hash: 'e40a4803c83dc48d4ba80a44a9a450cd49283e1ffc097b64125cc59a1e183c26' },
  2955564: { mime: 'font/ttf', hash: '190825fceb4e60735d2fd6ab75867c25179a970e564c4aeea1ec41fa6149a05f' },
} as const;

type FontStatus = 'idle' | 'loading' | 'missing' | 'ready';
let status: FontStatus = 'idle';
let pending: Promise<boolean> | undefined;
const listeners = new Set<() => void>();

export function subscribeToReatic(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const getReaticStatus = () => status;
export const getInitialReaticStatus = (): FontStatus => 'idle';

function setStatus(value: FontStatus) {
  status = value;
  listeners.forEach(listener => listener());
}

function getReleaseFile(blob: Blob) {
  return RELEASE_FILES[blob.size as keyof typeof RELEASE_FILES];
}

async function installFace(blob: Blob) {
  const releaseFile = getReleaseFile(blob);
  if (!releaseFile || blob.type !== releaseFile.mime) throw new Error('Invalid REATIC font.');
  const url = URL.createObjectURL(blob);
  const format = blob.type === 'font/otf' ? 'opentype' : 'truetype';
  const style = document.createElement('style');
  // Use a stylesheet so the PNG renderer can discover and embed this face.
  style.textContent = `@font-face{font-family:"${REATIC_FAMILY}";src:url("${url}") format("${format}");font-weight:400;font-display:swap}`;
  document.head.append(style);
  try {
    const faces = await document.fonts.load(`400 16px "${REATIC_FAMILY}"`, '리틱 Aa');
    if (!faces.length) throw new Error('REATIC font could not be loaded.');
  } catch (error) {
    style.remove();
    URL.revokeObjectURL(url);
    throw error;
  }
  return () => {
    style.remove();
    URL.revokeObjectURL(url);
  };
}

export function ensureReaticFont(): Promise<boolean> {
  if (pending) return pending;
  if (status === 'ready' || status === 'missing') return Promise.resolve(status === 'ready');
  setStatus('loading');
  pending = (async () => {
    try {
      const blob = await readFont();
      if (!blob) return false;
      await installFace(blob);
      return true;
    } catch {
      return false;
    }
  })().then(ready => {
    pending = undefined;
    setStatus(ready ? 'ready' : 'missing');
    return ready;
  });
  return pending;
}

export async function registerReaticFont(file: File): Promise<'ready' | 'invalid' | 'failed'> {
  if (await ensureReaticFont()) return 'ready';
  const releaseFile = getReleaseFile(file);
  if (!releaseFile) return 'invalid';

  if (pending) return await pending ? 'ready' : 'failed';
  let outcome: 'invalid' | 'failed' = 'failed';
  setStatus('loading');
  pending = (async () => {
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== releaseFile.hash) {
        outcome = 'invalid';
        return false;
      }
      const blob = file.slice(0, file.size, releaseFile.mime);
      const uninstall = await installFace(blob);
      try {
        await writeFont(blob);
      } catch (error) {
        uninstall();
        throw error;
      }
      return true;
    } catch {
      return false;
    }
  })().then(ready => {
    pending = undefined;
    setStatus(ready ? 'ready' : 'missing');
    return ready;
  });
  return await pending ? 'ready' : outcome;
}

function accessFont(blob?: Blob): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('ff14-adventurer-card:local-fonts', 1);
    let blocked = false;
    open.onupgradeneeded = () => { open.result.createObjectStore('fonts'); };
    open.onerror = () => reject(open.error);
    open.onblocked = () => {
      blocked = true;
      reject(new Error('Local font storage is blocked.'));
    };
    open.onsuccess = () => {
      const database = open.result;
      if (blocked) {
        database.close();
        return;
      }
      const transaction = database.transaction('fonts', blob ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('fonts');
      const request = blob ? store.put(blob, 'reatic-regular') : store.get('reatic-regular');
      transaction.oncomplete = () => {
        database.close();
        resolve(blob ? undefined : request.result);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}

const readFont = () => accessFont();
const writeFont = (blob: Blob) => accessFont(blob);

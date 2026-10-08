import {
  demoAdventurerCards,
  demoAdventurerData,
  type AdventurerCardData,
  type AdventurerCardTemplate,
  type CardRatio,
} from '@/components/cards/types';
import { editorStore } from '@/store/editor-store';
import {
  EDITOR_STORAGE_KEY,
  LEGACY_DRAFT_STORAGE_KEY,
  normalizeCardData,
  parseStoredEditorDraft,
  persistEditorDraft,
} from '@/store/editor-persistence';

/** Preserves the old key export for callers that still inspect or migrate v1 drafts. */
export const DRAFT_STORAGE_KEY = LEGACY_DRAFT_STORAGE_KEY;
export const CARD_RATIOS: CardRatio[] = ['1:1', '4:5', '3:4', '9:16', '16:9'];
export const CARD_TEMPLATES: AdventurerCardTemplate[] = ['cinematic', 'editorial', 'id-card'];

type DraftListener = () => void;
export type DraftSaveStatus = 'saving' | 'saved' | 'error';

const listeners = new Set<DraftListener>();
let cachedDraft: AdventurerCardData = demoAdventurerData;
let cachedCardBranches: { character: unknown; design: unknown; image: unknown } | undefined;
let snapshotInitialized = false;
let storeUnsubscribe: (() => void) | undefined;

function refreshDraftCache() {
  const state = editorStore.getState();
  if (
    snapshotInitialized &&
    cachedCardBranches?.character === state.character &&
    cachedCardBranches.design === state.design &&
    cachedCardBranches.image === state.image
  ) {
    return;
  }
  cachedDraft = state.toCardData();
  cachedCardBranches = { character: state.character, design: state.design, image: state.image };
  snapshotInitialized = true;
}

function notifyDraftListeners() {
  refreshDraftCache();
  listeners.forEach((listener) => listener());
}

function decodeCurrentDraft(value: string | null): AdventurerCardData | null {
  if (!value) return demoAdventurerData;
  return parseStoredEditorDraft(value)?.card ?? null;
}

function handleStorage(event: StorageEvent) {
  if (event.key === EDITOR_STORAGE_KEY) {
    const card = decodeCurrentDraft(event.newValue);
    if (card) editorStore.getState().replaceCardData(card, { persist: false, recordHistory: false });
    return;
  }
  if (event.key === LEGACY_DRAFT_STORAGE_KEY) {
    const card = decodeCurrentDraft(event.newValue);
    if (card) editorStore.getState().replaceCardData(card, { persist: false, recordHistory: false });
  }
}

export function subscribeToCardDraft(listener: DraftListener) {
  listeners.add(listener);
  if (typeof window !== 'undefined') {
    if (!storeUnsubscribe) storeUnsubscribe = editorStore.subscribe(notifyDraftListeners);
    window.addEventListener('storage', handleStorage);
    // Hydrate after the external-store subscription is installed to keep the server
    // snapshot and the first client render identical in Next.js.
    editorStore.getState().hydrate();
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage);
    if (listeners.size === 0) {
      storeUnsubscribe?.();
      storeUnsubscribe = undefined;
    }
  };
}

export function getCardDraftSnapshot(): AdventurerCardData {
  if (typeof window === 'undefined') return demoAdventurerData;
  refreshDraftCache();
  return cachedDraft;
}

export function getServerCardDraftSnapshot(): AdventurerCardData {
  return demoAdventurerData;
}

export function getDraftSaveStatusSnapshot(): DraftSaveStatus {
  return editorStore.getState().saveStatus;
}

export function getServerDraftSaveStatusSnapshot(): DraftSaveStatus {
  return 'saved';
}

export function updateCardDraftSnapshot(data: AdventurerCardData) {
  editorStore.getState().replaceCardData(data, { persist: false, saveStatus: 'saving' });
  refreshDraftCache();
}

export function persistCardDraft(data: AdventurerCardData): boolean {
  const currentImage = editorStore.getState().image;
  const image = currentImage.src === data.imageUrl ? currentImage : { fileName: null, mimeType: null };
  const success = persistEditorDraft(
    normalizeCardData(data),
    undefined,
    { fileName: image.fileName, mimeType: image.mimeType },
  );
  editorStore.setState({ saveStatus: success ? 'saved' : 'error' });
  return success;
}

export function buildCardData(
  template: AdventurerCardTemplate,
  base: AdventurerCardData = demoAdventurerData,
): AdventurerCardData {
  const visual = demoAdventurerCards[template];
  const merged = normalizeCardData({
    ...visual,
    character: { ...visual.character, ...base.character },
    design: { ...visual.design, ...base.design, template },
    imageUrl: base.imageUrl.startsWith('data:') ? base.imageUrl : visual.imageUrl,
    imageAdjustments: base.imageAdjustments,
  });
  return merged;
}

export function readCardDraft(): AdventurerCardData {
  if (typeof window !== 'undefined') editorStore.getState().hydrate();
  return getCardDraftSnapshot();
}

export function writeCardDraft(data: AdventurerCardData): boolean {
  updateCardDraftSnapshot(data);
  return persistCardDraft(data);
}

export function parseTemplate(value: string | null): AdventurerCardTemplate | undefined {
  return CARD_TEMPLATES.find((template) => template === value);
}

export function parseRatio(value: string | null): CardRatio | undefined {
  return CARD_RATIOS.find((ratio) => ratio === value);
}

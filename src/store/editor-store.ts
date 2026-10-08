'use client';

import { create } from 'zustand';
import {
  demoAdventurerData,
  type AdventurerCardCharacter,
  type AdventurerCardData,
  type AdventurerCardDesign,
  type AdventurerCardImageAdjustments,
} from '@/components/cards/types';
import type { CardPalette } from '@/lib/palette';
import { loadEditorDraft, normalizeCardData, normalizeCharacterUpdate, persistEditorDraft } from '@/store/editor-persistence';
import { profileCount, profileStart } from '@/lib/performance-profile';

export interface EditorHistoryOptions {
  groupId?: string;
  persist?: boolean;
  recordHistory?: boolean;
}

export type EditorHistoryScope = 'character' | 'design' | 'image';

export type EditorPanelId = 'screenshot' | 'character' | 'information' | 'template' | 'style' | 'effects';
export type EditorSaveStatus = 'saving' | 'saved' | 'error';

export interface EditorImageState extends AdventurerCardImageAdjustments {
  /** Current screenshot source. Uploaded images should be data URLs for persistence. */
  src: string;
  fileName: string | null;
  mimeType: string | null;
}

export interface EditorSnapshot {
  character: AdventurerCardCharacter;
  design: AdventurerCardDesign;
  image: EditorImageState;
}

export interface EditorHistoryState {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  groupId: string | null;
  groupHasSnapshot: boolean;
  groupScope: EditorHistoryScope | null;
  groupFields: string[];
}

export interface EditorUiState {
  activePanel: EditorPanelId;
  zoom: number;
  safeAreaVisible: boolean;
  previewOpen: boolean;
  inspectorOpen: boolean;
}

export interface EditorStoreState extends EditorSnapshot {
  history: EditorHistoryState;
  ui: EditorUiState;
  saveStatus: EditorSaveStatus;
  isHydrated: boolean;
  updateCharacter: <K extends keyof AdventurerCardCharacter>(key: K, value: AdventurerCardCharacter[K], options?: EditorHistoryOptions) => void;
  setCharacter: (partial: Partial<AdventurerCardCharacter>, options?: EditorHistoryOptions) => void;
  updateDesign: <K extends keyof AdventurerCardDesign>(key: K, value: AdventurerCardDesign[K]) => void;
  setDesign: (partial: Partial<AdventurerCardDesign>) => void;
  setImage: (partial: Partial<EditorImageState>, options?: { groupId?: string }) => void;
  replaceUploadedImage: (source: Pick<EditorImageState, 'src' | 'fileName' | 'mimeType'>, palette: CardPalette) => void;
  beginHistoryGroup: (groupId: string, scope?: EditorHistoryScope) => void;
  endHistoryGroup: () => void;
  beginImageAdjustmentGroup: (groupId: string) => void;
  endImageAdjustmentGroup: () => void;
  replaceCardData: (data: AdventurerCardData, options?: { persist?: boolean; recordHistory?: boolean; saveStatus?: EditorSaveStatus }) => void;
  toCardData: () => AdventurerCardData;
  hydrate: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  setUi: (partial: Partial<EditorUiState>) => void;
  persistNow: () => boolean;
}

const MAX_HISTORY_ENTRIES = 40;
const PERSIST_DEBOUNCE_MS = 320;
const DEFAULT_UI: EditorUiState = {
  activePanel: 'screenshot',
  zoom: 1,
  safeAreaVisible: false,
  previewOpen: false,
  inspectorOpen: false,
};

function imageFromCardData(
  data: AdventurerCardData,
  metadata: { fileName: string | null; mimeType: string | null } = { fileName: null, mimeType: null },
): EditorImageState {
  return {
    src: data.imageUrl,
    ...metadata,
    ...data.imageAdjustments,
  };
}

function snapshotFromCardData(
  data: AdventurerCardData,
  metadata?: { fileName: string | null; mimeType: string | null },
): EditorSnapshot {
  profileCount('draft.snapshot.materialize.calls');
  const finish = profileStart('draft.snapshot.materialize');
  const normalized = normalizeCardData(data);
  const snapshot = {
    character: normalized.character,
    design: normalized.design,
    image: imageFromCardData(normalized, metadata),
  };
  finish();
  return snapshot;
}

function captureSnapshot(state: Pick<EditorStoreState, 'character' | 'design' | 'image'>): EditorSnapshot {
  profileCount('history.snapshot.capture.calls');
  const finish = profileStart('history.snapshot.capture', { srcUrlLength: state.image.src.length });
  const snapshot = {
    character: { ...state.character, languages: [...state.character.languages], playStyles: [...state.character.playStyles] },
    design: { ...state.design, palette: { ...state.design.palette }, effects: [...state.design.effects] },
    image: { ...state.image },
  };
  finish();
  return snapshot;
}

function appendHistory(
  history: EditorHistoryState,
  snapshot: EditorSnapshot,
  groupId: string | null = null,
  groupScope: EditorHistoryScope | null = null,
  groupFields: string[] = [],
): EditorHistoryState {
  profileCount('history.append.calls');
  return {
    past: [...history.past, snapshot].slice(-MAX_HISTORY_ENTRIES),
    future: [],
    groupId,
    groupHasSnapshot: groupId !== null,
    groupScope: groupId === null ? null : groupScope,
    groupFields: groupId === null ? [] : [...groupFields],
  };
}

function clamp(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeImagePatch(current: EditorImageState, partial: Partial<EditorImageState>): EditorImageState {
  return {
    ...current,
    ...partial,
    x: clamp(partial.x ?? current.x, current.x, 0, 100),
    y: clamp(partial.y ?? current.y, current.y, 0, 100),
    scale: clamp(partial.scale ?? current.scale, current.scale, 0.75, 2.5),
    rotation: clamp(partial.rotation ?? current.rotation, current.rotation, -10, 10),
    brightness: clamp(partial.brightness ?? current.brightness, current.brightness, 0, 2),
    contrast: clamp(partial.contrast ?? current.contrast, current.contrast, 0, 2),
    saturation: clamp(partial.saturation ?? current.saturation, current.saturation, 0, 2),
    exposure: clamp(partial.exposure ?? current.exposure, current.exposure, -2, 2),
  };
}

function sameImage(a: EditorImageState, b: EditorImageState): boolean {
  return a.src === b.src && a.fileName === b.fileName && a.mimeType === b.mimeType &&
    a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation &&
    a.brightness === b.brightness && a.contrast === b.contrast && a.saturation === b.saturation &&
    a.exposure === b.exposure;
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameCharacter(a: AdventurerCardCharacter, b: AdventurerCardCharacter): boolean {
  const scalarKeys: (keyof AdventurerCardCharacter)[] = [
    'name', 'world', 'dataCenter', 'freeCompany', 'job', 'level', 'race', 'clan', 'grandCompany', 'bio',
    'service', 'physicalRegionId', 'dataCenterId', 'worldId', 'jobId', 'raceId', 'clanId', 'grandCompanyId',
  ];
  return scalarKeys.every((key) => a[key] === b[key]) &&
    sameStringArray(a.languages, b.languages) && sameStringArray(a.playStyles, b.playStyles);
}

function sameDesign(a: AdventurerCardDesign, b: AdventurerCardDesign): boolean {
  return a.template === b.template && a.ratio === b.ratio && a.layoutVariant === b.layoutVariant &&
    a.colorMode === b.colorMode && a.jobMotifVisible === b.jobMotifVisible && a.jobIconColor === b.jobIconColor &&
    a.accentColor === b.accentColor && a.typographyPreset === b.typographyPreset &&
    a.imagePosition === b.imagePosition && a.imageScale === b.imageScale &&
    a.palette.primary === b.palette.primary && a.palette.accent === b.palette.accent &&
    a.palette.light === b.palette.light && a.palette.dark === b.palette.dark &&
    sameStringArray(a.effects, b.effects);
}

function sameSnapshot(a: EditorSnapshot, b: EditorSnapshot): boolean {
  return sameCharacter(a.character, b.character) && sameDesign(a.design, b.design) && sameImage(a.image, b.image);
}

function historyForChange(
  state: EditorStoreState,
  scope: EditorHistoryScope,
  fieldKeys: readonly string[],
  options?: EditorHistoryOptions,
  joinActiveGroup = true,
): EditorHistoryState {
  profileCount('history.change.calls');
  const fields = [...new Set(fieldKeys)].sort();
  const finish = profileStart('history.change', { scope, fieldCount: fields.length });
  const activeFieldsMatch = state.history.groupFields.length === 0 || sameStringArray(state.history.groupFields, fields);
  const activeGroupMatches = joinActiveGroup && state.history.groupId !== null &&
    state.history.groupScope === scope && activeFieldsMatch;
  const groupId = options?.groupId ?? (activeGroupMatches ? state.history.groupId : null);
  const groupFields = groupId === null ? [] : fields;
  const isSameGroup = groupId !== null && groupId === state.history.groupId &&
    state.history.groupScope === scope && activeFieldsMatch && state.history.groupHasSnapshot;
  if (isSameGroup) {
    profileCount('history.group.joined');
    finish();
    return state.history;
  }
  profileCount(groupId === null ? 'history.change.standalone' : 'history.group.started');
  const history = appendHistory(state.history, captureSnapshot(state), groupId, groupId === null ? null : scope, groupFields);
  finish();
  return history;
}

function mergeDesign(current: AdventurerCardDesign, partial: Partial<AdventurerCardDesign>): AdventurerCardDesign {
  const next = { ...current, ...partial };
  if (partial.palette) {
    next.palette = { ...current.palette, ...partial.palette };
    next.accentColor = partial.accentColor ?? next.palette.accent;
    if (partial.accentColor) next.palette.accent = partial.accentColor;
  } else if (partial.accentColor) {
    next.palette = { ...current.palette, accent: partial.accentColor };
  }
  if (partial.effects) next.effects = [...partial.effects];
  return next;
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePersist() {
  if (typeof window === 'undefined') return;
  profileCount('draft.debounce.schedule.calls');
  if (persistTimer) profileCount('draft.debounce.reset.calls');
  if (persistTimer) clearTimeout(persistTimer);
  if (editorStore.getState().saveStatus !== 'saving') editorStore.setState({ saveStatus: 'saving' });
  const finishWait = profileStart('draft.debounce.wait');
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    profileCount('draft.debounce.fire.calls');
    finishWait();
    editorStore.getState().persistNow();
  }, PERSIST_DEBOUNCE_MS);
}

function updateSnapshotData(state: EditorStoreState, snapshot: EditorSnapshot): Pick<EditorStoreState, 'character' | 'design' | 'image'> {
  return {
    character: snapshot.character,
    design: snapshot.design,
    image: snapshot.image,
  };
}

export const useEditorStore = create<EditorStoreState>((set, get) => {
  const initial = snapshotFromCardData(demoAdventurerData);
  return {
    ...initial,
    history: { past: [], future: [], groupId: null, groupHasSnapshot: false, groupScope: null, groupFields: [] },
    ui: DEFAULT_UI,
    saveStatus: 'saved',
    isHydrated: false,

    updateCharacter: (key, value, options) => {
      profileCount('store.character.update.calls');
      get().setCharacter({ [key]: value } as Partial<AdventurerCardCharacter>, options);
    },
    setCharacter: (partial, options) => {
      profileCount('store.character.set.calls');
      const finishSet = profileStart('store.character.set.total');
      let changed = false;
      set((state) => {
        profileCount('store.character.normalize.calls');
        const finishNormalize = profileStart('store.character.normalize');
        const character = normalizeCharacterUpdate(state.character, partial);
        finishNormalize();
        const finishEquality = profileStart('store.character.equality');
        const unchanged = sameCharacter(state.character, character);
        finishEquality();
        if (unchanged) {
          profileCount('store.character.noop.calls');
          return state;
        }
        changed = true;
        return {
          character,
          history: options?.recordHistory === false
            ? state.history
            : historyForChange(state, 'character', Object.keys(partial), options),
        };
      });
      if (changed && options?.persist !== false) schedulePersist();
      finishSet();
    },
    updateDesign: (key, value) => {
      profileCount('store.design.update.calls');
      get().setDesign({ [key]: value } as Partial<AdventurerCardDesign>);
    },
    setDesign: (partial) => {
      profileCount('store.design.set.calls');
      const finishSet = profileStart('store.design.set.total');
      let changed = false;
      set((state) => {
        const design = {
          ...mergeDesign(state.design, partial),
          imagePosition: `${state.image.x}% ${state.image.y}%`,
          imageScale: state.image.scale,
        };
        const finishEquality = profileStart('store.design.equality');
        const unchanged = sameDesign(state.design, design);
        finishEquality();
        if (unchanged) {
          profileCount('store.design.noop.calls');
          return state;
        }
        changed = true;
        return { design, history: historyForChange(state, 'design', Object.keys(partial)) };
      });
      if (changed) schedulePersist();
      finishSet();
    },
    setImage: (partial, options) => {
      profileCount('store.image.set.calls');
      const finishSet = profileStart('store.image.set.total');
      let changed = false;
      set((state) => {
        profileCount('store.image.normalize.calls');
        const finishNormalize = profileStart('store.image.normalize');
        const image = normalizeImagePatch(state.image, partial);
        finishNormalize();
        const finishEquality = profileStart('store.image.equality');
        const unchanged = sameImage(state.image, image);
        finishEquality();
        if (unchanged) {
          profileCount('store.image.noop.calls');
          return state;
        }
        changed = true;
        const design = {
          ...state.design,
          imagePosition: `${image.x}% ${image.y}%`,
          imageScale: image.scale,
        };
        return { image, design, history: historyForChange(state, 'image', Object.keys(partial), options) };
      });
      if (changed) schedulePersist();
      finishSet();
    },
    replaceUploadedImage: (source, palette) => {
      profileCount('store.image.replace.calls');
      const finishReplace = profileStart('store.image.replace.total', { srcUrlLength: source.src.length });
      let changed = false;
      set((state) => {
        const image = normalizeImagePatch(state.image, {
          ...source,
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0,
          brightness: 1,
          contrast: 1,
          saturation: 1,
          exposure: 0,
        });
        const preserveCustomPalette = state.design.colorMode === 'custom';
        const design = {
          ...state.design,
          imagePosition: `${image.x}% ${image.y}%`,
          imageScale: image.scale,
          ...(preserveCustomPalette ? {} : {
            colorMode: 'auto' as const,
            palette: { ...palette },
            accentColor: palette.accent,
          }),
        };
        const finishEquality = profileStart('store.image.replace.equality');
        const unchanged = sameSnapshot(captureSnapshot(state), { character: state.character, design, image });
        finishEquality();
        if (unchanged) {
          profileCount('store.image.replace.noop.calls');
          return state;
        }
        changed = true;
        return { image, design, history: historyForChange(state, 'image', ['replaceUploadedImage'], undefined, false) };
      });
      if (changed) schedulePersist();
      finishReplace();
    },
    beginHistoryGroup: (groupId, scope = 'character') => {
      profileCount('history.group.begin.calls');
      set((state) => {
        if (state.history.groupId === groupId && state.history.groupScope === scope) return state;
        profileCount(`history.group.begin.${scope}`);
        return { history: { ...state.history, groupId, groupHasSnapshot: false, groupScope: scope, groupFields: [] } };
      });
    },
    endHistoryGroup: () => {
      profileCount('history.group.end.calls');
      set((state) => {
        if (state.history.groupId === null) return state;
        profileCount('history.group.end.active');
        return { history: { ...state.history, groupId: null, groupHasSnapshot: false, groupScope: null, groupFields: [] } };
      });
    },
    beginImageAdjustmentGroup: (groupId) => {
      get().beginHistoryGroup(groupId, 'image');
    },
    endImageAdjustmentGroup: () => {
      get().endHistoryGroup();
    },
    replaceCardData: (data, options) => {
      profileCount('store.replaceCardData.calls');
      const finishReplace = profileStart('store.replaceCardData.total');
      const normalized = normalizeCardData(data);
      let cardChanged = false;
      set((state) => {
        const metadata = normalized.imageUrl === state.image.src
          ? { fileName: state.image.fileName, mimeType: state.image.mimeType }
          : undefined;
        const next = snapshotFromCardData(normalized, metadata);
        cardChanged = !sameSnapshot(captureSnapshot(state), next);
        const history = options?.recordHistory === false
          ? state.history.past.length || state.history.future.length || state.history.groupId !== null
            ? { past: [], future: [], groupId: null, groupHasSnapshot: false, groupScope: null, groupFields: [] }
            : state.history
          : cardChanged ? appendHistory(state.history, captureSnapshot(state)) : state.history;
        const nextSaveStatus = options?.saveStatus ?? state.saveStatus;
        if (!cardChanged && state.isHydrated && state.history === history && state.saveStatus === nextSaveStatus) return state;
        return {
          ...next,
          history,
          isHydrated: true,
          saveStatus: nextSaveStatus,
        };
      });
      if (cardChanged && options?.persist !== false) schedulePersist();
      if (!cardChanged) profileCount('store.replaceCardData.noop.calls');
      finishReplace();
    },
    toCardData: () => {
      profileCount('store.toCardData.calls');
      const finishToCardData = profileStart('store.toCardData.total');
      const state = get();
      const imageAdjustments: AdventurerCardImageAdjustments = {
        x: state.image.x,
        y: state.image.y,
        scale: state.image.scale,
        rotation: state.image.rotation,
        brightness: state.image.brightness,
        contrast: state.image.contrast,
        saturation: state.image.saturation,
        exposure: state.image.exposure,
      };
      const data = {
        character: { ...state.character, languages: [...state.character.languages], playStyles: [...state.character.playStyles] },
        design: {
          ...state.design,
          palette: { ...state.design.palette },
          effects: [...state.design.effects],
          accentColor: state.design.palette.accent,
          imagePosition: `${state.image.x}% ${state.image.y}%`,
          imageScale: state.image.scale,
        },
        imageUrl: state.image.src,
        imageAdjustments,
      };
      finishToCardData();
      return data;
    },
    hydrate: () => {
      profileCount('draft.hydrate.calls');
      if (typeof window === 'undefined') {
        profileCount('draft.hydrate.serverSkip');
        return;
      }
      if (get().isHydrated) {
        profileCount('draft.hydrate.alreadyHydratedSkip');
        return;
      }
      const finishHydrate = profileStart('draft.hydrate.total');
      const loaded = loadEditorDraft();
      profileCount(loaded.migrated ? 'draft.hydrate.migrated' : 'draft.hydrate.currentSchema');
      const next = snapshotFromCardData(loaded.card, loaded.imageMetadata);
      set((state) => ({
        ...next,
        history: { past: [], future: [], groupId: null, groupHasSnapshot: false, groupScope: null, groupFields: [] },
        isHydrated: true,
        saveStatus: state.saveStatus,
      }));
      if (loaded.migrated) {
        const status = persistEditorDraft(loaded.card, undefined, loaded.imageMetadata) ? 'saved' : 'error';
        if (get().saveStatus !== status) set({ saveStatus: status });
      }
      finishHydrate();
    },
    undo: () => {
      profileCount('history.undo.calls');
      let changed = false;
      set((state) => {
        if (state.history.past.length === 0) return state;
        changed = true;
        const snapshot = state.history.past[state.history.past.length - 1];
        return {
          ...updateSnapshotData(state, snapshot),
          history: {
            past: state.history.past.slice(0, -1),
            future: [captureSnapshot(state), ...state.history.future].slice(0, MAX_HISTORY_ENTRIES),
            groupId: null,
            groupHasSnapshot: false,
            groupScope: null,
            groupFields: [],
          },
        };
      });
      if (changed) schedulePersist();
      else profileCount('history.undo.empty');
    },
    redo: () => {
      profileCount('history.redo.calls');
      let changed = false;
      set((state) => {
        if (state.history.future.length === 0) return state;
        changed = true;
        const snapshot = state.history.future[0];
        return {
          ...updateSnapshotData(state, snapshot),
          history: {
            past: [...state.history.past, captureSnapshot(state)].slice(-MAX_HISTORY_ENTRIES),
            future: state.history.future.slice(1),
            groupId: null,
            groupHasSnapshot: false,
            groupScope: null,
            groupFields: [],
          },
        };
      });
      if (changed) schedulePersist();
      else profileCount('history.redo.empty');
    },
    reset: () => {
      const next = snapshotFromCardData(demoAdventurerData);
      let changed = false;
      set((state) => {
        changed = !sameSnapshot(captureSnapshot(state), next);
        if (!changed && state.isHydrated) return state;
        return {
          ...next,
          history: changed ? appendHistory(state.history, captureSnapshot(state)) : state.history,
          isHydrated: true,
        };
      });
      if (changed) schedulePersist();
    },
    setUi: (partial) => set((state) => ({ ui: { ...state.ui, ...partial } })),
    persistNow: () => {
      profileCount('draft.persistNow.calls');
      if (!get().isHydrated) {
        profileCount('draft.persistNow.preHydrationSkip');
        if (persistTimer) {
          clearTimeout(persistTimer);
          persistTimer = undefined;
          profileCount('draft.debounce.preHydrationCancel');
        }
        return false;
      }
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
        profileCount('draft.debounce.flush');
      }
      const finishPersistNow = profileStart('draft.persistNow.total');
      try {
        const image = get().image;
        const success = persistEditorDraft(get().toCardData(), undefined, { fileName: image.fileName, mimeType: image.mimeType });
        const status = success ? 'saved' : 'error';
        if (get().saveStatus !== status) set({ saveStatus: status });
        profileCount(success ? 'draft.persistNow.success' : 'draft.persistNow.failure');
        return success;
      } finally {
        finishPersistNow();
      }
    },
  };
});

/** Static access for non-React adapters and tests; React components should use the hook. */
export const editorStore = useEditorStore;

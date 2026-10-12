import type { CardTypographyPreset, CardTypographyRole } from '@/components/cards/types';
import type { CardTextSlotId } from '@/lib/card-text-editing';
import { editorStore } from '@/store/editor-store';

export function applyGlobalTypographyPreset(preset: CardTypographyPreset) {
  editorStore.getState().updateDesign('typographyPreset', preset);
}

export function applyDefaultCopySample(copyIds: readonly CardTextSlotId[]) {
  const state = editorStore.getState();
  const copyIdSet = new Set(copyIds);
  const current = state.design.textOverrides ?? {};
  const hasActiveCopyOverrides = Object.keys(current).some((id) => copyIdSet.has(id as CardTextSlotId));
  const modeChanged = state.design.decorativeCopy !== 'default';
  if (!hasActiveCopyOverrides && !modeChanged) return;

  if (!hasActiveCopyOverrides) {
    state.updateDesign('decorativeCopy', 'default');
    return;
  }

  const next = Object.fromEntries(Object.entries(current).filter(([id]) => !copyIdSet.has(id as CardTextSlotId)));
  state.setDesign({
    decorativeCopy: 'default',
    textOverrides: Object.keys(next).length > 0 ? next : undefined,
  });
}

export function resetLegacyTypographyRole(role: CardTypographyRole) {
  const state = editorStore.getState();
  const current = state.design.typography;
  if (!current?.[role]) return;
  const next = { ...current };
  delete next[role];
  state.setDesign({ typography: Object.keys(next).length > 0 ? next : undefined });
}

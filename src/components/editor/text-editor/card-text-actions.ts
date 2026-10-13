import type { CardTypographyOverride, CardTypographyPreset, CardTypographyRole } from '@/components/cards/types';
import type { CardTextSlotId } from '@/lib/card-text-editing';
import { editorStore } from '@/store/editor-store';
import { normalizeCardTypographyOverride } from '@/store/editor-persistence';

export interface TypographyGroupUpdate {
  id: CardTextSlotId;
  patch: Partial<CardTypographyOverride>;
}

function sameTypographyOverride(left: CardTypographyOverride | undefined, right: CardTypographyOverride | undefined): boolean {
  return left?.fontFamily === right?.fontFamily && left?.sizePercent === right?.sizePercent &&
    left?.weight === right?.weight && left?.trackingEm === right?.trackingEm;
}

export function applyTypographyGroupOverrides(updates: readonly TypographyGroupUpdate[], groupId?: string) {
  if (!updates.length) return;
  const state = editorStore.getState();
  const current = state.design.textTypography ?? {};
  const next = { ...current };
  let changed = false;

  for (const { id, patch } of updates) {
    const merged = { ...(current[id] ?? {}), ...patch };
    for (const key of Object.keys(merged) as Array<keyof CardTypographyOverride>) {
      if (merged[key] === undefined) delete merged[key];
    }
    const normalized = normalizeCardTypographyOverride(merged);
    if (sameTypographyOverride(current[id], normalized)) continue;
    changed = true;
    if (normalized) next[id] = normalized;
    else delete next[id];
  }

  if (changed) {
    state.setDesign(
      { textTypography: Object.keys(next).length > 0 ? next : undefined },
      groupId ? { groupId } : undefined,
    );
  }
}

export function resetTypographyGroupOverrides(ids: readonly CardTextSlotId[]) {
  if (!ids.length) return;
  const state = editorStore.getState();
  const current = state.design.textTypography;
  if (!current) return;
  const next = { ...current };
  let changed = false;
  for (const id of ids) {
    if (!Object.hasOwn(next, id)) continue;
    delete next[id];
    changed = true;
  }
  if (changed) state.setDesign({ textTypography: Object.keys(next).length > 0 ? next : undefined });
}

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

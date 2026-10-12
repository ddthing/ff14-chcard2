import type { AdventurerCardData, AdventurerCardTemplate } from '@/components/cards/types';
import { MASTER_CARD_CONFIG } from '@/lib/master-card-config';
import { editorStore } from '@/store/editor-store';

/** Render a different master over the same card data without changing the draft. */
export function createTemplateComparisonData(
  data: AdventurerCardData,
  template: AdventurerCardTemplate,
): AdventurerCardData {
  return {
    ...data,
    design: {
      ...data.design,
      template,
      layoutVariant: MASTER_CARD_CONFIG[template].layout,
    },
  };
}

/** Apply the chosen master to the hydrated draft while retaining its other edits. */
export function applyTemplateToEditorDraft(template: AdventurerCardTemplate): boolean {
  const state = editorStore.getState();
  if (!state.isHydrated) return false;

  state.setDesign({
    template,
    layoutVariant: MASTER_CARD_CONFIG[template].layout,
  });
  return true;
}

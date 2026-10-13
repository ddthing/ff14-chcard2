import type { CardTextItem } from '@/lib/card-text-editing';
import {
  getInformationTypographyItems,
  isIndividualTypographyItem,
} from '@/components/editor/text-editor/card-text-model';

export interface EditorLayerPanelModel {
  identityItems: CardTextItem[];
  phraseItems: CardTextItem[];
  informationItems: CardTextItem[];
  informationAnchor: CardTextItem | null;
  selectedItem: CardTextItem | null;
  informationGroupSelected: boolean;
}

/**
 * Keep the layer navigator tied to actual editable card targets. Character
 * fields and card phrases remain individual rows; information typography is
 * represented by one aggregate entry backed by a real information target.
 */
export function getEditorLayerPanelModel(
  items: readonly CardTextItem[],
  selectedId: string | null,
): EditorLayerPanelModel {
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const identityItems = items.filter((item) =>
    isIndividualTypographyItem(item) && (item.field === 'name' || item.field === 'bio'));
  const phraseItems = items.filter((item) =>
    isIndividualTypographyItem(item) && item.category === 'copy');
  const informationItems = getInformationTypographyItems(items);
  const informationGroupSelected = selectedItem !== null
    && informationItems.some((item) => item.id === selectedItem.id);
  const informationAnchor = (informationGroupSelected ? selectedItem : null)
    ?? informationItems.find((item) => item.field === 'job')
    ?? informationItems[0]
    ?? null;

  return {
    identityItems,
    phraseItems,
    informationItems,
    informationAnchor,
    selectedItem,
    informationGroupSelected,
  };
}

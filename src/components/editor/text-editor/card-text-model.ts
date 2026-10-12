import type { CardTextCategory, CardTextItem } from '@/lib/card-text-editing';

export const CARD_TEXT_CATEGORIES: readonly CardTextCategory[] = ['identity', 'information', 'copy'];

export function getEditorTextCategory(item: CardTextItem): CardTextCategory {
  return item.field === 'name' || item.field === 'bio' ? 'identity' : item.category;
}

export function getTextItemsForCategory(items: readonly CardTextItem[], category: CardTextCategory): CardTextItem[] {
  return items.filter((item) => getEditorTextCategory(item) === category);
}

export function resolveSelectedTextItem(
  items: readonly CardTextItem[],
  category: CardTextCategory,
  selectedId: string | null,
): CardTextItem | null {
  const categoryItems = getTextItemsForCategory(items, category);
  return categoryItems.find((item) => item.id === selectedId) ?? categoryItems[0] ?? null;
}

export function getCardTextItemOrdinal(items: readonly CardTextItem[], id: string): number {
  const index = items.findIndex((item) => item.id === id);
  return index < 0 ? 0 : index + 1;
}

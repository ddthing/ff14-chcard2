import type { CardTextCategory, CardTextItem } from '@/lib/card-text-editing';
import type { TypographyScript } from '@/lib/typography-presets';

export const CARD_TEXT_CATEGORIES: readonly CardTextCategory[] = ['identity', 'information', 'copy'];

export function isIndividualTypographyItem(item: CardTextItem): boolean {
  if (item.field === 'name' || item.field === 'bio') return true;
  return item.category === 'copy'
    && item.supportsTextOverride
    && item.kind !== 'label'
    && !item.id.includes('.label.');
}

export function getInformationTypographyItems(items: readonly CardTextItem[]): CardTextItem[] {
  return items.filter((item) => item.category === 'information' && !isIndividualTypographyItem(item));
}

export function getTypographyGroupPrimaryScript(
  requiredScripts: readonly TypographyScript[],
  localeScript: TypographyScript,
): TypographyScript {
  if (localeScript !== 'latin' && requiredScripts.includes(localeScript)) return localeScript;
  if (requiredScripts.includes('korean')) return 'korean';
  if (requiredScripts.includes('japanese')) return 'japanese';
  return 'latin';
}

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

/** Stable ordinals for the creative text targets shown together on the card. */
export function getIndividualTypographyOrdinal(items: readonly CardTextItem[], id: string): number {
  const targets = items.filter(isIndividualTypographyItem);
  const index = targets.findIndex((item) => item.id === id);
  return index < 0 ? 0 : index + 1;
}

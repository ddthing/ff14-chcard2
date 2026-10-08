import type { CardRatio } from '@/components/cards/types';

export interface EditorialBrushShape {
  id: string;
  composition: 'side-panel' | 'stacked';
  inkOutline: string;
}

const INK_OUTLINE = '/assets/card-materials/v3/editorial-brush-outline.svg';

/** The authored dry-brush asset is reused while the card reflows by ratio. */
const EDITORIAL_BRUSH_SHAPES: Readonly<Record<CardRatio, EditorialBrushShape>> = {
  '4:5': { id: 'portrait-side-brush', composition: 'side-panel', inkOutline: INK_OUTLINE },
  '1:1': { id: 'square-side-brush', composition: 'side-panel', inkOutline: INK_OUTLINE },
  '3:4': { id: 'portrait-tall-side-brush', composition: 'side-panel', inkOutline: INK_OUTLINE },
  '9:16': { id: 'tall-stacked-brush', composition: 'stacked', inkOutline: INK_OUTLINE },
  '16:9': { id: 'landscape-side-brush', composition: 'side-panel', inkOutline: INK_OUTLINE },
};

export function getEditorialBrushShape(ratio: CardRatio): EditorialBrushShape {
  return EDITORIAL_BRUSH_SHAPES[ratio];
}

import type { CardRatio } from '@/components/cards/types';

export interface EditorialPaperShape {
  id: string;
  path: string;
}

/**
 * One smooth, deliberate paper/photo collision for each card composition.
 * Paths use a normalized square viewBox; the SVG scales them with the canvas
 * so each ratio can keep its own silhouette rather than stretching one mask.
 */
const EDITORIAL_PAPER_SHAPES: Readonly<Record<CardRatio, EditorialPaperShape>> = {
  '4:5': {
    id: 'portrait-s-curve',
    path: 'M 586 0 C 548 108 542 217 574 322 C 606 426 610 525 575 638 C 544 742 535 866 558 1000 L 1000 1000 L 1000 0 Z',
  },
  '1:1': {
    id: 'square-s-curve',
    path: 'M 526 0 C 491 104 482 214 510 316 C 538 418 548 513 519 614 C 490 718 491 855 514 1000 L 1000 1000 L 1000 0 Z',
  },
  '3:4': {
    id: 'portrait-waist',
    path: 'M 612 0 C 570 115 560 226 586 326 C 608 414 610 507 578 633 C 552 730 547 848 570 1000 L 1000 1000 L 1000 0 Z',
  },
  '9:16': {
    id: 'tall-sheet-lift',
    path: 'M 0 615 C 180 603 285 624 420 621 C 570 618 665 596 790 609 C 890 620 956 621 1000 611 L 1000 1000 L 0 1000 Z',
  },
  '16:9': {
    id: 'landscape-s-curve',
    path: 'M 326 0 C 292 92 288 190 314 286 C 342 386 341 486 309 592 C 281 704 290 850 318 1000 L 1000 1000 L 1000 0 Z',
  },
};

export function getEditorialPaperShape(ratio: CardRatio): EditorialPaperShape {
  return EDITORIAL_PAPER_SHAPES[ratio];
}

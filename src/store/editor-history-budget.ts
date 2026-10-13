export const MAX_HISTORY_IMAGE_BYTES = 64 * 1024 * 1024;

const ESTIMATED_BYTES_PER_STRING_CODE_UNIT = 2;

export interface HistoryImageSourceSnapshot {
  image: { src: string };
}

export interface TrimmedHistorySnapshots<TSnapshot extends HistoryImageSourceSnapshot> {
  past: TSnapshot[];
  future: TSnapshot[];
  estimatedImageBytes: number;
}

/**
 * Bounds history's retained image-source strings. This is a conservative
 * estimate (two bytes per UTF-16 code unit), not a measurement of browser heap.
 */
export function trimHistoryByUniqueImageBytes<TSnapshot extends HistoryImageSourceSnapshot>(
  pastSnapshots: readonly TSnapshot[],
  futureSnapshots: readonly TSnapshot[],
  currentImageSrc: string,
  maxBytes = MAX_HISTORY_IMAGE_BYTES,
): TrimmedHistorySnapshots<TSnapshot> {
  const past = [...pastSnapshots];
  const future = [...futureSnapshots];
  const byteBudget = Number.isFinite(maxBytes) ? Math.max(0, maxBytes) : MAX_HISTORY_IMAGE_BYTES;

  const estimateBytes = () => {
    const uniqueSources = new Set<string>([currentImageSrc]);
    for (const snapshot of past) uniqueSources.add(snapshot.image.src);
    for (const snapshot of future) uniqueSources.add(snapshot.image.src);

    let total = 0;
    for (const source of uniqueSources) total += source.length * ESTIMATED_BYTES_PER_STRING_CODE_UNIT;
    return total;
  };

  let estimatedImageBytes = estimateBytes();
  while (estimatedImageBytes > byteBudget && (past.length > 0 || future.length > 0)) {
    if (past.length > 0) past.shift();
    else future.pop();
    estimatedImageBytes = estimateBytes();
  }

  return { past, future, estimatedImageBytes };
}

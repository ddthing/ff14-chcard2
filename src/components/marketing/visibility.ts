type VisibilityEntry = Pick<IntersectionObserverEntry, 'target' | 'time' | 'isIntersecting'>;

/** A delivery can include both an old exit and the current entrance after a
 * resize/scroll. Ignore detached targets and apply only the newest observation. */
export function getLatestVisibility(entries: readonly VisibilityEntry[], target: Element | null): boolean | undefined {
  if (!target) return undefined;
  let latest: VisibilityEntry | undefined;
  for (const entry of entries) {
    if (entry.target === target && (!latest || entry.time >= latest.time)) latest = entry;
  }
  return latest?.isIntersecting;
}

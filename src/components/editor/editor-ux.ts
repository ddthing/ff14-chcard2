export function isSampleArtworkSource(source: string, sampleSources: ReadonlySet<string>): boolean {
  return sampleSources.has(source);
}

export type ImageDragHintPhase = 'idle' | 'pending' | 'visible' | 'finished';
export type ImageDragHintEvent = 'successful-upload' | 'canvas-available' | 'image-drag' | 'sample-reset' | 'timeout';

export function transitionImageDragHint(
  phase: ImageDragHintPhase,
  event: ImageDragHintEvent,
): ImageDragHintPhase {
  if (phase === 'idle' && event === 'successful-upload') return 'pending';
  if (phase === 'idle' && event === 'image-drag') return 'finished';
  if (phase === 'pending' && event === 'canvas-available') return 'visible';
  if (phase === 'pending' && (event === 'image-drag' || event === 'sample-reset')) return 'finished';
  if (phase === 'visible' && (event === 'image-drag' || event === 'sample-reset' || event === 'timeout')) return 'finished';
  return phase;
}

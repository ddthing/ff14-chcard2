interface PrepareCardForPrintOptions {
  node: HTMLElement | null;
  signal: AbortSignal;
  loadFonts: () => Promise<void>;
  waitForAssets: (node: HTMLElement, signal: AbortSignal) => Promise<void>;
  print: () => void;
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('Card print preparation was cancelled.');
  error.name = 'AbortError';
  throw error;
}

/** Wait for the same card's type, decoded images, optical layout, and paint before printing. */
export async function prepareCardForPrint({
  node,
  signal,
  loadFonts,
  waitForAssets,
  print,
}: PrepareCardForPrintOptions): Promise<void> {
  if (!node) throw new Error('Print card is unavailable.');
  throwIfAborted(signal);
  await loadFonts();
  throwIfAborted(signal);
  await waitForAssets(node, signal);
  throwIfAborted(signal);
  print();
}

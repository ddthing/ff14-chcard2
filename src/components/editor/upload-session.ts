const cancellations = new Set<() => void>();

export function registerUploadCancellation(cancel: () => void): () => void {
  cancellations.add(cancel);
  return () => { cancellations.delete(cancel); };
}

/** Reset is an explicit cancellation even when the document already equals its default. */
export function cancelPendingEditorUploads(): void {
  cancellations.forEach(cancel => cancel());
}

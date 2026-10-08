/** Lab derivatives remain archived; none meets the Award Master fidelity gate. */
export type DerivedJobIconUsage = 'editorialLarge' | 'small' | 'medium';
export type DerivedJobIconAsset = Readonly<{ src: string; width: number; height: number }>;

export function getDerivedJobIconAsset(
  jobId: string | null | undefined,
  usage: DerivedJobIconUsage,
): DerivedJobIconAsset | null {
  // An explicit empty allowlist prevents an old lab manifest from re-enabling
  // the retired exception when its generator is run again.
  void jobId;
  void usage;
  return null;
}

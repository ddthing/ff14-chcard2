import { FFXIV_OFFICIAL_ASSETS_ENABLED } from "./config";
import jobIconManifest from "./job-icon-manifest.json" with { type: "json" };

export type OfficialJobIconAsset = Readonly<{
  src: string;
  maskSrc: string;
  sourcePath: string;
  width: number;
  height: number;
}>;

type OfficialJobIconManifestEntry = OfficialJobIconAsset & Readonly<{
  extractionMode: "gold-hue" | "neutral-luminance";
  sourceSha256: string;
  maskSha256: string;
}>;

/** The reviewed job-id to original/glyph mapping. */
export const OFFICIAL_JOB_ICON_ASSETS: Readonly<
  Record<string, OfficialJobIconManifestEntry>
> = Object.freeze(
  jobIconManifest.entries as unknown as Record<string, OfficialJobIconManifestEntry>,
);

const OFFICIAL_JOB_ASSET_PREFIX = "/assets/ffxiv/jobs/official/";

/**
 * Return the reviewed local original and derived glyph mask for a job.
 *
 * The public flag is opt-in. Unknown jobs, including Beastmaster while it has
 * no official Fan Kit icon, remain on their caller-provided generic fallback.
 */
export function getOfficialJobIconAsset(
  jobId: string | null | undefined,
): OfficialJobIconAsset | null {
  if (!FFXIV_OFFICIAL_ASSETS_ENABLED || !jobId) return null;
  if (!Object.prototype.hasOwnProperty.call(OFFICIAL_JOB_ICON_ASSETS, jobId)) return null;

  const asset = OFFICIAL_JOB_ICON_ASSETS[jobId];
  if (
    !asset?.src.startsWith(OFFICIAL_JOB_ASSET_PREFIX) ||
    !asset.maskSrc.startsWith(`${OFFICIAL_JOB_ASSET_PREFIX}masks/`)
  ) {
    return null;
  }

  return asset;
}

/**
 * Resolve the byte-identical local original through the reviewed allowlist.
 * Kept for existing callers that still render the framed Fan Kit PNG.
 */
export function getOfficialJobIconSrc(
  jobId: string | null | undefined,
): string | null {
  return getOfficialJobIconAsset(jobId)?.src ?? null;
}

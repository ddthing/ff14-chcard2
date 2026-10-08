import { FFXIV_OFFICIAL_ASSETS_ENABLED } from './config';
import {
  OFFICIAL_JOB_ICON_ASSETS,
  type OfficialJobIconAsset,
} from './job-icons';
import xivapiJobIconManifest from './xivapi-job-icon-manifest.json' with { type: 'json' };

export type JobIconUsage =
  | 'picker'
  | 'micro'
  | 'cardSmall'
  | 'cardMedium'
  | 'cardDisplay'
  | 'export'
  | 'small'
  | 'medium'
  | 'editorialLarge';

export type CanonicalJobIconUsage = Exclude<JobIconUsage, 'small' | 'medium' | 'editorialLarge'>;
export type JobIconAppearance = 'tinted' | 'source';
export type JobIconSourceKind = 'xivapi-svg' | 'xivapi-raster' | 'fan-kit';

export type XivapiJobIconSource = Readonly<{
  src: string;
  width: number;
  height: number;
  verified: boolean;
  integrityVerified?: boolean;
  sha256?: string;
  sourcePath?: string;
  upstreamGitBlobSha?: string;
  visualReview?: string;
  colorMode?: 'monochrome-mask' | 'source-color-and-alpha-mask' | 'native';
  visualScale?: number;
  opticalOffsetX?: number;
  opticalOffsetY?: number;
  verifiedUsages?: readonly CanonicalJobIconUsage[];
}>;

export type XivapiJobIconEntry = Readonly<{
  svg?: XivapiJobIconSource | null;
  raster?: XivapiJobIconSource | null;
  rasterCandidates?: Readonly<Record<string, XivapiJobIconSource>>;
  visualScale?: number;
  opticalOffsetX?: number;
  opticalOffsetY?: number;
}>;

type XivapiJobIconManifest = Readonly<{
  entries: Readonly<Record<string, XivapiJobIconEntry>>;
}>;

export type ResolvedJobIcon = Readonly<{
  src: string;
  width: number;
  height: number;
  source: JobIconSourceKind;
  verified: boolean;
  appearance: JobIconAppearance;
  renderAs: 'mask' | 'image';
  usage: CanonicalJobIconUsage;
  visualScale: number;
  opticalOffsetX: number;
  opticalOffsetY: number;
}>;

export type ResolveJobIconInput = Readonly<{
  jobId: string | null | undefined;
  usage: JobIconUsage;
  appearance?: JobIconAppearance;
  officialAssetsEnabled?: boolean;
  failedSources?: readonly string[];
}>;

export type ResolveJobIconSourcesInput = Readonly<{
  jobId: string | null | undefined;
  usage: JobIconUsage;
  appearance?: JobIconAppearance;
  officialAssetsEnabled?: boolean;
  failedSources?: readonly string[];
  entry?: XivapiJobIconEntry | null;
  fanKitAsset?: OfficialJobIconAsset | null;
}>;

const XIVAPI_ASSET_PREFIX = '/assets/ffxiv/jobs/xivapi/';
const FAN_KIT_ASSET_PREFIX = '/assets/ffxiv/jobs/official/';
const xivapiEntries = (xivapiJobIconManifest as unknown as XivapiJobIconManifest).entries;

function canonicalizeUsage(usage: JobIconUsage): CanonicalJobIconUsage {
  switch (usage) {
    case 'small': return 'cardSmall';
    case 'medium': return 'cardMedium';
    case 'editorialLarge': return 'cardDisplay';
    default: return usage;
  }
}

function isSafeJobId(jobId: string | null | undefined): jobId is string {
  return typeof jobId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(jobId);
}

function isSafeLocalAssetPath(src: string, prefix: string): boolean {
  if (
    !src.startsWith(prefix) ||
    src.includes('\\') ||
    /[%?#\s]/.test(src) ||
    !/^\/[A-Za-z0-9._/-]+$/.test(src)
  ) {
    return false;
  }

  return src.slice(1).split('/').every((segment) => segment !== '.' && segment !== '..');
}

function hasValidDimensions(source: XivapiJobIconSource): boolean {
  return Number.isInteger(source.width) && source.width > 0 &&
    Number.isInteger(source.height) && source.height > 0 &&
    source.width <= 16_384 && source.height <= 16_384;
}

function isVerifiedXivapiSource(
  source: XivapiJobIconSource | null | undefined,
  usage: CanonicalJobIconUsage,
): source is XivapiJobIconSource {
  return Boolean(
    source && source.verified === true &&
    (!source.verifiedUsages || source.verifiedUsages.includes(usage)) &&
    isSafeLocalAssetPath(source.src, XIVAPI_ASSET_PREFIX) &&
    hasValidDimensions(source),
  );
}

function isSafeFanKitAsset(asset: OfficialJobIconAsset): boolean {
  return (
    isSafeLocalAssetPath(asset.src, FAN_KIT_ASSET_PREFIX) &&
    isSafeLocalAssetPath(asset.maskSrc, `${FAN_KIT_ASSET_PREFIX}masks/`) &&
    hasValidDimensions({ ...asset, verified: true })
  );
}

function createResolvedIcon(
  src: string,
  width: number,
  height: number,
  source: JobIconSourceKind,
  verified: boolean,
  appearance: JobIconAppearance,
  usage: CanonicalJobIconUsage,
  visualScale = 1,
  opticalOffsetX = 0,
  opticalOffsetY = 0,
  renderAs: 'mask' | 'image' = appearance === 'tinted' ? 'mask' : 'image',
): ResolvedJobIcon {
  return {
    src,
    width,
    height,
    source,
    verified,
    appearance,
    renderAs,
    usage,
    visualScale: safeVisualScale(visualScale),
    opticalOffsetX: safeOpticalOffset(opticalOffsetX),
    opticalOffsetY: safeOpticalOffset(opticalOffsetY),
  };
}

function safeVisualScale(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 4 ? value : 1;
}

function safeOpticalOffset(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 0.5 ? value : 0;
}

function getRenderMode(appearance: JobIconAppearance, colorMode?: XivapiJobIconSource['colorMode']): 'mask' | 'image' {
  if (appearance === 'tinted') return 'mask';
  return colorMode === 'native' || colorMode === 'source-color-and-alpha-mask' ? 'image' : 'mask';
}

/**
 * Pick a reviewed local asset for this presentation size. The display gate
 * accepts SVG only; templates that need a large graphic can keep their own
 * typography when no reviewed SVG is available.
 */
export function resolveJobIcon({
  jobId,
  usage: requestedUsage,
  appearance = 'tinted',
  officialAssetsEnabled = FFXIV_OFFICIAL_ASSETS_ENABLED,
  failedSources = [],
}: ResolveJobIconInput): ResolvedJobIcon | null {
  if (!officialAssetsEnabled || !isSafeJobId(jobId)) return null;

  const entry = Object.prototype.hasOwnProperty.call(xivapiEntries, jobId)
    ? xivapiEntries[jobId]
    : undefined;
  const fanKitAsset = Object.prototype.hasOwnProperty.call(OFFICIAL_JOB_ICON_ASSETS, jobId)
    ? OFFICIAL_JOB_ICON_ASSETS[jobId]
    : undefined;

  return resolveJobIconFromSources({
    jobId,
    usage: requestedUsage,
    appearance,
    officialAssetsEnabled,
    failedSources,
    entry,
    fanKitAsset,
  });
}

/** Resolve one manifest entry using the same rules as the production lookup. */
export function resolveJobIconFromSources({
  jobId,
  usage: requestedUsage,
  appearance = 'tinted',
  officialAssetsEnabled = FFXIV_OFFICIAL_ASSETS_ENABLED,
  failedSources = [],
  entry,
  fanKitAsset,
}: ResolveJobIconSourcesInput): ResolvedJobIcon | null {
  if (!officialAssetsEnabled || !isSafeJobId(jobId)) return null;

  const usage = canonicalizeUsage(requestedUsage);
  const svg = isVerifiedXivapiSource(entry?.svg, usage) ? entry.svg : undefined;
  if (svg && !failedSources.includes(svg.src)) {
    return createResolvedIcon(
      svg.src,
      svg.width,
      svg.height,
      'xivapi-svg',
      true,
      appearance,
      usage,
      svg.visualScale ?? entry?.visualScale,
      svg.opticalOffsetX ?? entry?.opticalOffsetX,
      svg.opticalOffsetY ?? entry?.opticalOffsetY,
      getRenderMode(appearance, svg.colorMode),
    );
  }

  // A large display mark is used only when its verified vector passed review.
  if (usage === 'cardDisplay') return null;

  const raster = isVerifiedXivapiSource(entry?.raster, usage) ? entry.raster : undefined;
  if (raster && !failedSources.includes(raster.src)) {
    return createResolvedIcon(
      raster.src,
      raster.width,
      raster.height,
      'xivapi-raster',
      true,
      appearance,
      usage,
      raster.visualScale ?? entry?.visualScale,
      raster.opticalOffsetX ?? entry?.opticalOffsetX,
      raster.opticalOffsetY ?? entry?.opticalOffsetY,
      getRenderMode(appearance, raster.colorMode),
    );
  }

  if (!fanKitAsset || !isSafeFanKitAsset(fanKitAsset)) return null;

  const src = appearance === 'tinted' ? fanKitAsset.maskSrc : fanKitAsset.src;
  if (failedSources.includes(src)) return null;

  return createResolvedIcon(
    src,
    fanKitAsset.width,
    fanKitAsset.height,
    'fan-kit',
    false,
    appearance,
    usage,
  );
}

export function normalizeJobIconUsage(usage: JobIconUsage): CanonicalJobIconUsage {
  return canonicalizeUsage(usage);
}

/**
 * Opt-in switch for official FFXIV assets.
 *
 * Keep disabled until the applicable regional policy and redistribution rights
 * for this project are confirmed. NEXT_PUBLIC_* values are inlined at build
 * time by Next.js, so changing this value requires a rebuild.
 */
export const FFXIV_OFFICIAL_ASSETS_ENABLED =
  process.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED === "true";

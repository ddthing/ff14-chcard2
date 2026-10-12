/**
 * Opt-in switch for official FFXIV assets.
 *
 * Release builds explicitly enable the project's reviewed local originals in
 * tools/build.mjs; a process environment value of false disables them. Direct
 * Next invocations remain opt-in. NEXT_PUBLIC_* values are inlined at build
 * time, so changing this value requires a rebuild.
 */
export const FFXIV_OFFICIAL_ASSETS_ENABLED =
  process.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED === "true";

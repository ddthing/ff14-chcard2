// Generated from src/data/fonts/registry.ts. Do not edit by hand.
export const TYPOGRAPHY_STYLESHEET_LOADERS = {
  notoSansKr: () => import("@fontsource-variable/noto-sans-kr/wght.css"),
  notoSansJp: () => import("@fontsource-variable/noto-sans-jp/wght.css"),
  notoSerifKr: () => import("@fontsource-variable/noto-serif-kr/wght.css"),
  notoSerifJp: () => import("@fontsource-variable/noto-serif-jp/wght.css"),
} as const;

export type TypographyStylesheetId = keyof typeof TYPOGRAPHY_STYLESHEET_LOADERS;

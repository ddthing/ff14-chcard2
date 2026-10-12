import type { Locale } from "./types";
import { ROUTES, type RoutePath } from "./routes";

export interface AppNavigationCopy {
  primary: string;
  home: string;
  templates: string;
  create: string;
  editor: string;
  export: string;
  newCard: string;
  saveImage: string;
  backToEditor: string;
  menu: string;
  settings: string;
  appearance: string;
}

export type TranslateNavigation = (key: string) => string;

const localizedNavigationCopy: Record<Locale, Pick<AppNavigationCopy, "newCard" | "saveImage" | "backToEditor" | "menu" | "settings" | "appearance">> = {
  ko: {
    newCard: "새 카드",
    saveImage: "이미지 저장",
    backToEditor: "편집으로",
    menu: "메뉴",
    settings: "화면 설정",
    appearance: "화면 테마",
  },
  en: {
    newCard: "New card",
    saveImage: "Save image",
    backToEditor: "Back to editing",
    menu: "Menu",
    settings: "Display settings",
    appearance: "Appearance",
  },
  ja: {
    newCard: "新しいカード",
    saveImage: "画像を保存",
    backToEditor: "編集に戻る",
    menu: "メニュー",
    settings: "画面設定",
    appearance: "画面テーマ",
  },
};

export function getAppNavigationCopy(t: TranslateNavigation, locale: Locale): AppNavigationCopy {
  return {
    primary: t("nav.primary"),
    home: t("nav.home"),
    templates: t("nav.templates"),
    create: t("nav.create"),
    editor: t("nav.editor"),
    export: t("nav.export"),
    ...localizedNavigationCopy[locale],
  };
}

export function isRouteCurrent(pathname: string, route: RoutePath): boolean {
  if (route === ROUTES.home) return pathname === ROUTES.home;
  return pathname === route || pathname.startsWith(`${route}/`);
}

export interface AppNavigationItem {
  href: RoutePath;
  label: string;
  current: boolean;
  primary: boolean;
}

export function getAppNavigationItems(
  pathname: string,
  copy: AppNavigationCopy,
  options: { exclude?: readonly RoutePath[]; primaryHref?: RoutePath } = {},
): AppNavigationItem[] {
  const routes: readonly { href: RoutePath; label: string }[] = [
    { href: ROUTES.home, label: copy.home },
    { href: ROUTES.templates, label: copy.templates },
    { href: ROUTES.create, label: copy.create },
    {
      href: ROUTES.editor,
      label: isRouteCurrent(pathname, ROUTES.export) ? copy.backToEditor : copy.editor,
    },
    {
      href: ROUTES.export,
      label: isRouteCurrent(pathname, ROUTES.editor) ? copy.saveImage : copy.export,
    },
  ];
  const excluded = new Set(options.exclude ?? []);

  return routes
    .filter(({ href }) => !excluded.has(href))
    .map(({ href, label }) => ({
      href,
      label,
      current: isRouteCurrent(pathname, href),
      primary: href === options.primaryHref,
    }));
}

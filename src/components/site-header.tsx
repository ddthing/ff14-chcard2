"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppearanceControl } from "@/components/appearance-control";
import { MobileNavigation, RouteNavigationLinks } from "@/components/route-navigation";
import { getLatestVisibility } from "@/components/marketing/visibility";
import { loadTypographyFonts } from "@/data/fonts/load-fonts";
import { getAppNavigationCopy } from "@/lib/app-navigation";
import { ROUTES, type RoutePath } from "@/lib/routes";
import { useI18n, type Locale } from "@/lib/i18n";
import styles from "@/components/marketing/marketing.module.css";

const languageLabels = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

export default function SiteHeader({ activePath }: { activePath?: RoutePath }) {
  const pathname = usePathname() ?? ROUTES.home;
  const routePath = activePath ?? pathname;
  const { locale, setLocale, t } = useI18n();
  const copy = getAppNavigationCopy(t, locale);
  const sentinel = useRef<HTMLSpanElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const script = locale === "ko" ? "korean" : locale === "ja" ? "japanese" : "latin";
    void loadTypographyFonts("editorial", script, {}, { signal: controller.signal }).catch(() => {
      // The registered system fallback remains readable offline.
    });
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    if (!sentinel.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = getLatestVisibility(entries, sentinel.current);
      if (visible !== undefined) setScrolled(!visible);
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <a className={styles.skip} href="#main-content">{t("nav.skipToContent")}</a>
      <span ref={sentinel} className={styles.sentinel} aria-hidden="true" />
      <header className={styles.header} data-scrolled={scrolled}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href={ROUTES.home} aria-label={t("header.brand")}>
            <strong aria-hidden="true">XIV</strong><span aria-hidden="true">ATELIER</span>
          </Link>
          <RouteNavigationLinks
            pathname={routePath}
            copy={copy}
            className={styles.nav}
            linkClassName={styles.navLink}
          />
          <div className={styles.actions}>
            <AppearanceControl />
            <label className={styles.desktopLanguageField}>
              <span className={styles.visuallyHidden}>{t("nav.language")}</span>
              <select className={styles.language} value={locale} aria-label={t("nav.language")}
                onChange={(event) => setLocale(event.currentTarget.value as Locale)}>
                {languageLabels.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <MobileNavigation
            key={routePath}
            pathname={routePath}
            copy={{ ...copy, saveImage: copy.export, backToEditor: copy.editor }}
            languageLabel={t("nav.language")}
            classes={{
              root: styles.mobileNavigation,
              trigger: styles.mobileMenuTrigger,
              panel: styles.mobileMenuPanel,
              links: styles.mobileMenuLinks,
              link: styles.mobileMenuLink,
              settings: styles.mobileMenuSettings,
              settingsHeading: styles.mobileMenuSettingsHeading,
              settingRow: styles.mobileMenuSettingRow,
              settingLabel: styles.mobileMenuSettingLabel,
              languageField: styles.mobileMenuLanguageField,
              languageSelect: styles.mobileMenuLanguageSelect,
            }}
          />
        </div>
      </header>
    </>
  );
}

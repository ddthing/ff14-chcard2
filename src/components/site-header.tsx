"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ROUTES, type RoutePath } from "@/lib/routes";
import { useI18n, type Locale } from "@/lib/i18n";
import { AppearanceControl } from "@/components/appearance-control";
import { loadTypographyFonts } from "@/data/fonts/load-fonts";
import { getLatestVisibility } from "@/components/marketing/visibility";
import styles from "@/components/marketing/marketing.module.css";

export default function SiteHeader({ activePath }: { activePath?: RoutePath }) {
  const pathname = usePathname() ?? ROUTES.home;
  const { locale, setLocale, t } = useI18n();
  const sentinel = useRef<HTMLSpanElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const script = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
    void loadTypographyFonts('editorial', script, {}, { signal: controller.signal }).catch(() => { /* The registered system fallback remains readable offline. */ });
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
  return <>
    <a className={styles.skip} href="#main-content">{t("nav.skipToContent")}</a>
    <span ref={sentinel} className={styles.sentinel} aria-hidden="true" />
    <header className={styles.header} data-scrolled={scrolled}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href={ROUTES.home} aria-label={t("header.brand")}>
          <svg className={styles.brandMark} aria-hidden="true" viewBox="0 0 32 32" width="26" height="26" fill="none"><path d="M16 2.8v26.4M2.8 16h26.4M6.7 6.7l18.6 18.6M25.3 6.7 6.7 25.3" stroke="currentColor" strokeWidth=".75" /><circle cx="16" cy="16" r="3.1" stroke="currentColor" strokeWidth=".75" /></svg>
          <strong>XIV</strong><span>Adventurer Card</span>
        </Link>
        <nav className={styles.nav} aria-label={t("nav.primary")}>
          <Link href={ROUTES.templates} aria-current={(activePath ?? pathname) === ROUTES.templates ? "page" : undefined}>{t("nav.templates")}</Link>
          <Link href={ROUTES.create} aria-current={(activePath ?? pathname) === ROUTES.create ? "page" : undefined}>{t("header.create")}</Link>
        </nav>
        <div className={styles.actions}>
          <AppearanceControl />
          <select className={styles.language} value={locale} aria-label={t("nav.language")} onChange={event => setLocale(event.target.value as Locale)}>
            <option value="ko">KO</option><option value="en">EN</option><option value="ja">JA</option>
          </select>
        </div>
      </div>
    </header>
  </>;
}

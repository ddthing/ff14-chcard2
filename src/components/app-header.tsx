"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { getEditorCopy } from "@/components/editor/copy";
import { AppearanceControl } from "@/components/appearance-control";
import { useEditorStore } from "@/store/editor-store";
import { ROUTES } from "@/lib/routes";
import styles from "@/components/app-shell.module.css";

function HeaderSaveStatus() {
  const { locale } = useI18n();
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const copy = getEditorCopy(locale);
  const longLabel = saveStatus === "error" ? copy.saveError : saveStatus === "saving" ? copy.saving : copy.saved;
  const shortLabel = {
    ko: { saved: "저장됨", saving: "저장 중", error: "저장 안 됨" },
    en: { saved: "Saved", saving: "Saving", error: "Not saved" },
    ja: { saved: "保存済み", saving: "保存中", error: "未保存" },
  }[locale][saveStatus];

  return (
    <span
      className={styles.saveStatus}
      data-status={saveStatus}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={longLabel}
      title={longLabel}
    >
      <span className={styles.saveStatusDot} aria-hidden="true" />
      <span>{shortLabel}</span>
    </span>
  );
}

const languageLabels = [
  { value: "ko", label: "KO" },
  { value: "en", label: "EN" },
  { value: "ja", label: "JP" },
] as const;

export function AppHeader() {
  const pathname = usePathname() ?? ROUTES.editor;
  const { locale, setLocale, t } = useI18n();
  const isEditor = pathname === ROUTES.editor || pathname.startsWith(`${ROUTES.editor}/`);
  const section = pathname.startsWith(ROUTES.templates)
    ? t("nav.templates")
    : pathname.startsWith(ROUTES.export)
      ? t("nav.export")
      : t("nav.editor");

  return (
    <header className={styles.appHeader} data-app-header>
      <div className={styles.headerLeft}>
        <Link className={styles.brand} href={ROUTES.home} aria-label={t("header.brand")}>
          <span className={styles.brandMark} aria-hidden="true">
            <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
              <path d="M16 2.8v26.4M2.8 16h26.4M6.7 6.7l18.6 18.6M25.3 6.7 6.7 25.3" stroke="currentColor" strokeWidth=".85" />
              <circle cx="16" cy="16" r="3.1" stroke="currentColor" strokeWidth=".85" />
            </svg>
          </span>
          <span className={styles.brandFull}>XIV ADVENTURER CARD</span>
          <span className={styles.brandCompact}>XIV</span>
        </Link>
        <span className={styles.headerDivider} aria-hidden="true">/</span>
        <span className={styles.sectionLabel}>{section}</span>
      </div>

      <div className={styles.headerRight}>
        {isEditor && <HeaderSaveStatus />}
        <span className={styles.actionDivider} aria-hidden="true" />
        <AppearanceControl />
        <span className={styles.actionDivider} aria-hidden="true" />
        <div className={styles.languageButtons} role="group" aria-label={t("nav.language")}>
          {languageLabels.map(({ value, label }) => (
            <button
              className={styles.languageButton}
              key={value}
              type="button"
              aria-pressed={locale === value}
              lang={value}
              onClick={() => setLocale(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className={styles.languageSelect}
          aria-label={t("nav.language")}
          value={locale}
          onChange={(event) => setLocale(event.currentTarget.value as typeof locale)}
        >
          {languageLabels.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
        </select>
      </div>
    </header>
  );
}

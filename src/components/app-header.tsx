"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { getEditorCopy } from "@/components/editor/copy";
import { AppearanceControl } from "@/components/appearance-control";
import { useEditorStore } from "@/store/editor-store";
import { ROUTES } from "@/lib/routes";
import { EditorIcon } from "@/components/editor/editor-icon";
import styles from "@/components/app-shell.module.css";

function HeaderSaveStatus() {
  const { locale } = useI18n();
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const copy = getEditorCopy(locale);
  const longLabel = saveStatus === "error" ? copy.saveError : saveStatus === "saving" ? copy.saving : copy.saved;
  const shortLabel = {
    ko: { saved: "초안 저장됨", saving: "저장 중", error: "저장 안 됨" },
    en: { saved: "Draft saved", saving: "Saving", error: "Not saved" },
    ja: { saved: "下書き保存済み", saving: "保存中", error: "未保存" },
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
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname() ?? ROUTES.editor;
  const { locale, setLocale, t } = useI18n();
  const isEditor = pathname === ROUTES.editor || pathname.startsWith(`${ROUTES.editor}/`);
  const name = useEditorStore((state) => state.character.name);
  const persistNow = useEditorStore((state) => state.persistNow);
  const labels = {
    ko: { home: '홈으로', export: '이미지 저장', settings: '화면 설정', editing: '카드 편집' },
    en: { home: 'Home', export: 'Save image', settings: 'Display settings', editing: 'Card editor' },
    ja: { home: 'ホーム', export: '画像を保存', settings: '表示設定', editing: 'カード編集' },
  }[locale];
  const section = pathname.startsWith(ROUTES.templates)
    ? t("nav.templates")
    : pathname.startsWith(ROUTES.export)
      ? t("nav.export")
      : t("nav.editor");

  return (
    <header className={styles.appHeader} data-app-header>
      <div className={styles.headerLeft}>
        <Link className={styles.brand} href={ROUTES.home} aria-label={isEditor ? labels.home : t("header.brand")}>
          <span className={styles.brandMark} aria-hidden="true"><span className={styles.backArrow}>←</span></span>
          <span className={styles.brandWordmark} aria-hidden="true"><strong>XIV</strong><small>ATELIER</small></span>
        </Link>
        <span className={styles.headerDivider} aria-hidden="true" />
        <div className={styles.documentIdentity}>
          <span className={styles.documentLabel}>{isEditor ? labels.editing : 'XIV / ATELIER'}</span>
          <span className={isEditor ? styles.editorName : styles.sectionLabel}>{isEditor ? name || section : section}</span>
        </div>
      </div>

      <div className={styles.headerRight}>
        {isEditor && <HeaderSaveStatus />}
        <span className={styles.actionDivider} aria-hidden="true" />
        <span className={styles.desktopAppearance}><AppearanceControl /></span>
        <span className={styles.actionDivider} aria-hidden="true" />
        <select className={styles.desktopLanguage} aria-label={t("nav.language")} value={locale}
          onChange={(event) => setLocale(event.currentTarget.value as typeof locale)}>
          {languageLabels.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
        </select>
        <details className={styles.mobileSettings} onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}>
          <summary aria-label={labels.settings}>•••</summary>
          <div className={styles.settingsContent}>
            <AppearanceControl />
            <select className={styles.languageSelect} aria-label={t('nav.language')} value={locale}
              onChange={(event) => setLocale(event.currentTarget.value as typeof locale)}>
              {languageLabels.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
        </details>
        {isEditor && <button type="button" className={styles.headerExport} onClick={() => {
          persistNow();
          router.push(ROUTES.export);
        }}><span>{labels.export}</span><EditorIcon name="export" size={16} /></button>}
      </div>
    </header>
  );
}

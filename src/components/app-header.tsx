"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppearanceControl } from "@/components/appearance-control";
import { EditorIcon } from "@/components/editor/editor-icon";
import { useEditorChrome } from "@/components/editor/editor-chrome-context";
import { MobileNavigation, RouteNavigationLinks } from "@/components/route-navigation";
import { getEditorCopy } from "@/components/editor/copy";
import { getAppNavigationCopy } from "@/lib/app-navigation";
import { useI18n } from "@/lib/i18n";
import { ROUTES } from "@/lib/routes";
import { useEditorStore } from "@/store/editor-store";
import styles from "@/components/app-shell.module.css";

function HeaderSaveStatus({ className }: { className?: string }) {
  const { locale } = useI18n();
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const copy = getEditorCopy(locale);
  const label = {
    ko: { saved: "저장됨", saving: "저장 중", error: "저장 안 됨" },
    en: { saved: "Saved", saving: "Saving", error: "Not saved" },
    ja: { saved: "保存済み", saving: "保存中", error: "未保存" },
  }[locale][saveStatus];
  const accessibleLabel = saveStatus === "error" ? copy.saveError : saveStatus === "saving" ? copy.saving : copy.saved;

  return (
    <span
      className={className ? `${styles.saveStatus} ${className}` : styles.saveStatus}
      data-status={saveStatus}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <span className={styles.saveStatusMark} aria-hidden="true">{saveStatus === "saved" ? "✓" : "•"}</span>
      <span>{label}</span>
    </span>
  );
}

const languageLabels = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

export function AppHeader() {
  const pathname = usePathname() ?? ROUTES.editor;
  const { locale, setLocale, t } = useI18n();
  const copy = getAppNavigationCopy(t, locale);
  const isEditor = pathname === ROUTES.editor || pathname.startsWith(`${ROUTES.editor}/`);
  const isExport = pathname === ROUTES.export || pathname.startsWith(`${ROUTES.export}/`);
  const name = useEditorStore((state) => state.character.name.trim());
  const persistNow = useEditorStore((state) => state.persistNow);
  const section = isExport ? copy.export : copy.editor;
  const documentName = name || copy.newCard;
  const { setGuideOpen, guideTriggerRef } = useEditorChrome();
  const guideLabel = { ko: '사용법', en: 'Guide', ja: '使い方' }[locale];

  const navigationMenu = <MobileNavigation
    key={pathname}
    pathname={pathname}
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
    onNavigate={(href) => {
      if (isEditor && href === ROUTES.export) persistNow();
    }}
  />;

  return (
    <header className={styles.appHeader} data-app-header data-editor-header={isEditor ? 'true' : undefined}>
      <div className={styles.headerLeft}>
        {isEditor && navigationMenu}
        <Link className={styles.brand} href={ROUTES.home} aria-label={t("header.brand")}>
          <span className={styles.brandWordmark} aria-hidden="true">
            <strong>XIV</strong><small>ATELIER</small>
          </span>
        </Link>
        <span className={styles.headerDivider} aria-hidden="true" />
        <div className={styles.documentIdentity} aria-label={`${section}: ${documentName}`} title={documentName}>
          <span className={styles.documentLabel}>{isEditor ? 'XIV / ATELIER' : section}</span>
          {isExport && <HeaderSaveStatus className={styles.mobileIdentitySaveStatus} />}
          <span className={styles.editorName}>{documentName}</span>
        </div>
      </div>

      {!isEditor && <RouteNavigationLinks
        pathname={pathname}
        copy={copy}
        className={styles.desktopNavigation}
        linkClassName={styles.desktopNavigationLink}
        exclude={isEditor ? [ROUTES.export] : isExport ? [ROUTES.editor] : undefined}
      />}

      <div className={styles.headerRight}>
        {isEditor && <button type="button" className={styles.editorGuideButton} aria-label={guideLabel} title={guideLabel} onClick={(event) => { guideTriggerRef.current = event.currentTarget; setGuideOpen(true); }}>?</button>}
        {isEditor && <HeaderSaveStatus className={styles.visuallyHidden} />}
        {isExport && <HeaderSaveStatus className={styles.desktopHeaderSaveStatus} />}
        <span className={styles.desktopAppearance}><AppearanceControl /></span>
        <label className={styles.desktopLanguageField}>
          <span className={styles.visuallyHidden}>{t("nav.language")}</span>
          <select className={styles.desktopLanguage} aria-label={t("nav.language")} value={locale}
            onChange={(event) => setLocale(event.currentTarget.value as typeof locale)}>
            {languageLabels.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        {isEditor && (
          <Link className={styles.headerExport} href={ROUTES.export} onClick={() => persistNow()}>
            <span>{copy.saveImage}</span><EditorIcon name="export" size={16} />
          </Link>
        )}
        {isExport && (
          <Link className={styles.headerReturn} href={ROUTES.editor}>
            {copy.backToEditor}
          </Link>
        )}
        {!isEditor && navigationMenu}
      </div>
    </header>
  );
}

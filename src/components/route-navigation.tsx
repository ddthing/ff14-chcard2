"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AppIcon } from "@/components/app-icon";
import { AppearanceControl } from "@/components/appearance-control";
import { useI18n } from "@/lib/i18n";
import { getAppNavigationItems, isRouteCurrent, type AppNavigationCopy } from "@/lib/app-navigation";
import { type RoutePath } from "@/lib/routes";

interface RouteNavigationLinksProps {
  pathname: string;
  copy: AppNavigationCopy;
  className: string;
  linkClassName: string;
  primaryLinkClassName?: string;
  exclude?: readonly RoutePath[];
  primaryHref?: RoutePath;
  onNavigate?: (href: RoutePath) => void;
}

export function RouteNavigationLinks({
  pathname,
  copy,
  className,
  linkClassName,
  primaryLinkClassName,
  exclude,
  primaryHref,
  onNavigate,
}: RouteNavigationLinksProps) {
  const items = getAppNavigationItems(pathname, copy, { exclude, primaryHref });

  return (
    <nav className={className} aria-label={copy.primary}>
      {items.map(({ href, label, current, primary }) => (
        <Link
          className={primary && primaryLinkClassName ? `${linkClassName} ${primaryLinkClassName}` : linkClassName}
          href={href}
          aria-current={current ? "page" : undefined}
          data-primary={primary ? "true" : undefined}
          key={href}
          onClick={() => onNavigate?.(href)}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export interface MobileNavigationClasses {
  root: string;
  trigger: string;
  panel: string;
  links: string;
  link: string;
  settings: string;
  settingsHeading: string;
  settingRow: string;
  settingLabel: string;
  languageField: string;
  languageSelect: string;
}

interface MobileNavigationProps {
  pathname: string;
  copy: AppNavigationCopy;
  languageLabel: string;
  classes: MobileNavigationClasses;
  onNavigate?: (href: RoutePath) => void;
}

const languageOptions = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

export function MobileNavigation({ pathname, copy, languageLabel, classes, onNavigate }: MobileNavigationProps) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function navigateTo(href: RoutePath) {
    onNavigate?.(href);
    setOpen(false);
    if (isRouteCurrent(pathname, href)) triggerRef.current?.focus();
  }

  return (
    <div className={classes.root} ref={rootRef}>
      <button
        className={classes.trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={copy.menu}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
      >
        <AppIcon name="Menu" size={18} />
        <span>{copy.menu}</span>
      </button>
      <div className={classes.panel} id={panelId} hidden={!open}>
        <RouteNavigationLinks
          pathname={pathname}
          copy={copy}
          className={classes.links}
          linkClassName={classes.link}
          onNavigate={navigateTo}
        />
        <div className={classes.settings}>
          <div className={classes.settingsHeading}>{copy.settings}</div>
          <div className={classes.settingRow}>
            <span className={classes.settingLabel}>{copy.appearance}</span>
            <AppearanceControl key={open ? "menu-open" : "menu-closed"} />
          </div>
          <label className={classes.languageField}>
            <span className={classes.settingLabel}>{languageLabel}</span>
            <select
              className={classes.languageSelect}
              aria-label={languageLabel}
              value={locale}
              onChange={(event) => setLocale(event.currentTarget.value as typeof locale)}
            >
              {languageOptions.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

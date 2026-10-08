"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { AppAppearancePreference } from "@/lib/app-appearance";
import { useAppearance } from "@/components/theme-provider";
import styles from "@/components/app-shell.module.css";

const labels = {
  ko: { appearance: "화면 테마", system: "시스템", light: "밝게", dark: "어둡게", current: "현재 화면 테마" },
  en: { appearance: "Appearance", system: "System", light: "Light", dark: "Dark", current: "Current appearance" },
  ja: { appearance: "画面テーマ", system: "システム", light: "ライト", dark: "ダーク", current: "現在の画面テーマ" },
} as const;

const appearanceOptions: readonly AppAppearancePreference[] = ["system", "light", "dark"];

export function AppearanceControl() {
  const { locale } = useI18n();
  const { preference, setPreference } = useAppearance();
  const copy = labels[locale];
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      const focusIsInsideControl = event.target instanceof Node && rootRef.current?.contains(event.target);
      setOpen(false);
      if (focusIsInsideControl) {
        event.preventDefault();
        event.stopPropagation();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectAppearance(value: AppAppearancePreference) {
    setPreference(value);
  }

  return (
    <div className={styles.appearanceControl} ref={rootRef}>
      <button
        className={styles.appearanceTrigger}
        type="button"
        aria-label={`${copy.current}: ${copy[preference]}`}
        aria-expanded={open}
        aria-controls={`appearance-options-${id}`}
        title={`${copy.current}: ${copy[preference]}`}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
          <path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5A6 6 0 0 1 10 2.5Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
          <path d="M10 2.5v15" stroke="currentColor" strokeWidth="1.1" opacity=".5" />
        </svg>
      </button>
      <div className={styles.appearancePopup} id={`appearance-options-${id}`} hidden={!open}>
        <fieldset className={styles.appearanceFieldset}>
          <legend className={styles.visuallyHidden}>{copy.appearance}</legend>
          {appearanceOptions.map((value) => (
            <label className={styles.appearanceOption} key={value}>
              <input
                type="radio"
                name={`app-appearance-${id}`}
                value={value}
                checked={preference === value}
                onChange={() => selectAppearance(value)}
              />
              <span>{copy[value]}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

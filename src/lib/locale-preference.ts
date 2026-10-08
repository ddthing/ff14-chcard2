import { SUPPORTED_LOCALES, type Locale } from "@/lib/types";

export const LOCALE_STORAGE_KEY = "ff14-adventurer-card:locale";
export const LOCALE_CHANGE_EVENT = "ff14-adventurer-card:locale-change";

type LocaleWindow = Pick<Window, "localStorage" | "sessionStorage">;

// The WeakMap is keyed by the browser window, so an in-memory fallback is
// isolated per tab and is never shared between server-rendered users.
const windowFallbacks = new WeakMap<LocaleWindow, Locale>();

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);
}

export function getStoredLocale(target: LocaleWindow): Locale {
  try {
    const storedLocale = target.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (storedLocale !== null) {
      return isLocale(storedLocale) ? storedLocale : "ko";
    }
  } catch {
    // Continue to the session and per-window fallbacks when local storage is blocked.
  }

  try {
    const sessionLocale = target.sessionStorage.getItem(LOCALE_STORAGE_KEY);
    if (sessionLocale !== null) {
      return isLocale(sessionLocale) ? sessionLocale : "ko";
    }
  } catch {
    // Some restricted contexts block both storage APIs.
  }

  return windowFallbacks.get(target) ?? "ko";
}

export function setStoredLocale(target: LocaleWindow, value: unknown): boolean {
  if (!isLocale(value)) return false;

  windowFallbacks.set(target, value);

  try {
    target.localStorage.setItem(LOCALE_STORAGE_KEY, value);
  } catch {
    // Session storage and the per-window fallback keep the choice active.
  }

  try {
    target.sessionStorage.setItem(LOCALE_STORAGE_KEY, value);
  } catch {
    // The per-window fallback survives client-side navigation if storage is blocked.
  }

  return true;
}

export function syncLocaleFromStorageEvent(
  target: LocaleWindow,
  key: string | null,
  newValue: string | null,
): boolean {
  if (key !== null && key !== LOCALE_STORAGE_KEY) return false;

  const locale = key === LOCALE_STORAGE_KEY && isLocale(newValue) ? newValue : "ko";
  windowFallbacks.set(target, locale);

  try {
    target.sessionStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The per-window fallback still reflects the external update.
  }

  return true;
}

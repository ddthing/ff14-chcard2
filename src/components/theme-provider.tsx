"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  APP_APPEARANCE_CHANGE_EVENT,
  APP_COLOR_SCHEME_QUERY,
  getStoredAppAppearance,
  resolveAppAppearance,
  setStoredAppAppearance,
  syncAppAppearanceFromStorageEvent,
  type AppAppearancePreference,
  type AppResolvedAppearance,
  type AppearanceTarget,
} from "@/lib/app-appearance";

interface AppearanceContextValue {
  preference: AppAppearancePreference;
  resolved: AppResolvedAppearance;
  setPreference: (preference: AppAppearancePreference) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const SERVER_SNAPSHOT = "system:dark";

function getWindowTarget(): AppearanceTarget {
  return window as unknown as AppearanceTarget;
}

function systemAppearance(): AppResolvedAppearance {
  try {
    return window.matchMedia?.(APP_COLOR_SCHEME_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function snapshot(): string {
  const preference = getStoredAppAppearance(getWindowTarget());
  return `${preference}:${resolveAppAppearance(preference, systemAppearance())}`;
}

function applyAppearance(preference: AppAppearancePreference): AppResolvedAppearance {
  const resolved = resolveAppAppearance(preference, systemAppearance());
  const root = document.documentElement;
  root.setAttribute("data-app-appearance", preference);
  root.setAttribute("data-app-theme", resolved);
  return resolved;
}

function subscribe(onStoreChange: () => void): () => void {
  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia?.(APP_COLOR_SCHEME_QUERY);
  } catch {
    media = undefined;
  }
  const onMediaChange = () => {
    const preference = getStoredAppAppearance(getWindowTarget());
    if (preference === "system") applyAppearance(preference);
    onStoreChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (!syncAppAppearanceFromStorageEvent(getWindowTarget(), event.key, event.newValue)) return;
    applyAppearance(getStoredAppAppearance(getWindowTarget()));
    onStoreChange();
  };

  window.addEventListener(APP_APPEARANCE_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  if (media?.addEventListener) media.addEventListener("change", onMediaChange);
  else media?.addListener?.(onMediaChange);

  return () => {
    window.removeEventListener(APP_APPEARANCE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
    if (media?.removeEventListener) media.removeEventListener("change", onMediaChange);
    else media?.removeListener?.(onMediaChange);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const currentAppearance = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const [preference, resolved] = currentAppearance.split(":") as [AppAppearancePreference, AppResolvedAppearance];

  useLayoutEffect(() => {
    // Next's development remount may clear attributes from the inline bootstrap.
    applyAppearance(getStoredAppAppearance(getWindowTarget()));
    window.dispatchEvent(new Event(APP_APPEARANCE_CHANGE_EVENT));
  }, []);

  const setPreference = useCallback((nextPreference: AppAppearancePreference) => {
    if (!setStoredAppAppearance(getWindowTarget(), nextPreference)) return;
    applyAppearance(nextPreference);
    window.dispatchEvent(new Event(APP_APPEARANCE_CHANGE_EVENT));
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used inside ThemeProvider.");
  return context;
}


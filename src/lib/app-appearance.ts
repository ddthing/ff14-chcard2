export const APP_APPEARANCE_STORAGE_KEY = "ff14-adventurer-card:appearance";
export const APP_APPEARANCE_CHANGE_EVENT = "ff14-adventurer-card:appearance-change";
export const APP_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
// Browser chrome needs sRGB colors; these match the applied Stone backgrounds.
export const APP_BROWSER_THEME_COLORS = { light: "#ffffff", dark: "#0c0a09" } as const;

export const APP_APPEARANCES = ["system", "light", "dark"] as const;

export type AppAppearancePreference = (typeof APP_APPEARANCES)[number];
export type AppResolvedAppearance = Exclude<AppAppearancePreference, "system">;

type AppearanceStorage = Pick<Storage, "getItem" | "setItem">;
export type AppearanceTarget = object & { localStorage: AppearanceStorage };

const windowFallbacks = new WeakMap<AppearanceTarget, AppAppearancePreference>();

export function isAppAppearance(value: unknown): value is AppAppearancePreference {
  return typeof value === "string" && APP_APPEARANCES.includes(value as AppAppearancePreference);
}

export function resolveAppAppearance(
  preference: AppAppearancePreference,
  system: AppResolvedAppearance,
): AppResolvedAppearance {
  return preference === "system" ? system : preference;
}

export function getStoredAppAppearance(target: AppearanceTarget): AppAppearancePreference {
  const inMemory = windowFallbacks.get(target);
  if (inMemory !== undefined) return inMemory;

  try {
    const stored = target.localStorage.getItem(APP_APPEARANCE_STORAGE_KEY);
    if (stored !== null) return isAppAppearance(stored) ? stored : "system";
  } catch {
    // Continue to the per-window value when browser storage is restricted.
  }

  return windowFallbacks.get(target) ?? "system";
}

export function setStoredAppAppearance(
  target: AppearanceTarget,
  preference: unknown,
): preference is AppAppearancePreference {
  if (!isAppAppearance(preference)) return false;

  windowFallbacks.set(target, preference);
  try {
    target.localStorage.setItem(APP_APPEARANCE_STORAGE_KEY, preference);
  } catch {
    // The in-memory choice remains available for this tab.
  }

  return true;
}

export function syncAppAppearanceFromStorageEvent(
  target: AppearanceTarget,
  key: string | null,
  newValue: string | null,
): boolean {
  if (key !== null && key !== APP_APPEARANCE_STORAGE_KEY) return false;

  windowFallbacks.set(target, key === APP_APPEARANCE_STORAGE_KEY && isAppAppearance(newValue) ? newValue : "system");
  return true;
}

/** A parser-blocking bootstrap applied from the root layout before the first paint. */
export function createAppAppearanceBootstrapScript(): string {
  const storageKey = JSON.stringify(APP_APPEARANCE_STORAGE_KEY);
  const query = JSON.stringify(APP_COLOR_SCHEME_QUERY);
  const browserColors = JSON.stringify(APP_BROWSER_THEME_COLORS);

  return `(function(){var r=document.documentElement,p='system',m=false;try{var v=localStorage.getItem(${storageKey});if(v==='light'||v==='dark')p=v}catch(e){}try{m=window.matchMedia?window.matchMedia(${query}).matches:false}catch(e){}var t=p==='system'?(m?'dark':'light'):p;r.setAttribute('data-app-appearance',p);r.setAttribute('data-app-theme',t);r.classList.toggle('dark',t==='dark');var c=${browserColors},a=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<a.length;i++){a[i].setAttribute('content',c[t]);a[i].removeAttribute('media')}})()`;
}


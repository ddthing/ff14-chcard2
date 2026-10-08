import { FONT_FAMILIES } from './registry';
import {
  CARD_EXPORT_FONT_TIMEOUT_MS,
  CardExportError,
  withCardExportTimeout,
} from '@/lib/card-export';
import { profileCount, profileStart } from '@/lib/performance-profile';
import {
  detectTypographyScript,
  getTypographyPreset,
  getTypographyScriptsForText,
  TYPOGRAPHY_SPECIMENS,
  type MasterTypographyFamily,
  type TypographyScript,
} from '@/lib/typography-presets';

export type TypographyStylesheetId = 'notoSansKr' | 'notoSansJp' | 'notoSerifKr' | 'notoSerifJp';
type StylesheetLoader = () => Promise<unknown>;

export interface TypographyFontLoadOptions {
  /** Master cards use the registered Cormorant/Noto Serif display pairing in every preset. */
  masterFamily?: MasterTypographyFamily;
  serifWeightByScript?: Partial<Record<TypographyScript, number>>;
  timeoutMs?: number;
  signal?: AbortSignal;
  profileSource?: 'preview' | 'export' | 'optical' | 'other';
}

export interface FontFaceProfileDetail {
  source: string;
  face: string;
  script: TypographyScript;
  weight?: number;
  glyphCount: number;
}

const STYLESHEET_LOADERS: Readonly<Record<TypographyStylesheetId, StylesheetLoader>> = {
  notoSansKr: () => import('@fontsource-variable/noto-sans-kr/wght.css'),
  notoSansJp: () => import('@fontsource-variable/noto-sans-jp/wght.css'),
  notoSerifKr: () => import('@fontsource-variable/noto-serif-kr/wght.css'),
  notoSerifJp: () => import('@fontsource-variable/noto-serif-jp/wght.css'),
};

const stylesheetPromises = new Map<TypographyStylesheetId, Promise<void>>();
const FONT_FACE_CACHE_LIMIT = 96;
const FONT_FACE_CACHE_MAX_KEY_LENGTH = 4096;
const fontFaceLoadCache = new WeakMap<FontFaceSet, Map<string, Promise<FontFace[]>>>();

function importStylesheet(id: TypographyStylesheetId): Promise<void> {
  const current = stylesheetPromises.get(id);
  if (current) {
    profileCount('fonts.stylesheet.cache.hit');
    return current;
  }

  profileCount('fonts.stylesheet.cache.miss');
  const finishTiming = profileStart('fonts.stylesheet.import', { stylesheet: id });
  let loading: Promise<unknown>;
  try {
    loading = STYLESHEET_LOADERS[id]();
  } catch (error) {
    finishTiming();
    throw error;
  }
  const pending = loading.then(() => undefined).catch((error: unknown) => {
    stylesheetPromises.delete(id);
    throw error;
  }).finally(finishTiming);
  stylesheetPromises.set(id, pending);
  return pending;
}

export function waitForTypographyStylesheetLoader(
  loader: () => Promise<unknown>,
  timeoutMs = CARD_EXPORT_FONT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<void> {
  return withCardExportTimeout(
    () => loader().then(() => undefined),
    timeoutMs,
    'font-timeout',
    signal,
  );
}

export function getTypographyStylesheetIds(
  presetId: string | null | undefined,
  scripts: TypographyScript | readonly TypographyScript[],
  options: TypographyFontLoadOptions = {},
): TypographyStylesheetId[] {
  const preset = getTypographyPreset(presetId);
  const suppliedScripts: readonly TypographyScript[] =
    typeof scripts === 'string' ? [scripts] : scripts;
  const scriptList = Array.from(new Set<TypographyScript>(suppliedScripts));
  const isSerifPreset = options.masterFamily !== undefined || preset.id === 'editorial' || preset.id === 'classic';

  return scriptList.flatMap<TypographyStylesheetId>((script) => {
    if (script === 'korean') {
      return isSerifPreset ? ['notoSansKr', 'notoSerifKr'] : ['notoSansKr'];
    }
    if (script === 'japanese') {
      return isSerifPreset ? ['notoSansJp', 'notoSerifJp'] : ['notoSansJp'];
    }
    return [];
  });
}

function extractScriptGlyphs(text: string, script: TypographyScript): string {
  const glyphs: string[] = [];

  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    const isKorean =
      (point >= 0xac00 && point <= 0xd7af) ||
      (point >= 0x1100 && point <= 0x11ff) ||
      (point >= 0x3130 && point <= 0x318f) ||
      (point >= 0xa960 && point <= 0xa97f) ||
      (point >= 0xd7b0 && point <= 0xd7ff);
    const isJapanese =
      (point >= 0x3040 && point <= 0x30ff) ||
      (point >= 0x31f0 && point <= 0x31ff) ||
      (point >= 0xff66 && point <= 0xff9f) ||
      (point >= 0x1b000 && point <= 0x1b16f);
    const isHan =
      (point >= 0x3400 && point <= 0x9fff) ||
      (point >= 0xf900 && point <= 0xfaff) ||
      (point >= 0x20000 && point <= 0x2fa1f);

    if ((script === 'korean' && (isKorean || isHan)) || (script === 'japanese' && (isJapanese || isHan))) {
      glyphs.push(character);
    }
  }

  return glyphs.join('');
}

/**
 * Dynamically imports only the script faces needed by the active card text.
 * Noto's unicode-range declarations then fetch only the WOFF2 shards needed
 * for those glyphs. Serif files are requested only by serif presets or Master cards.
 */
export async function loadTypographyFonts(
  presetId: string | null | undefined,
  scripts: TypographyScript | readonly TypographyScript[],
  textByScript: Partial<Record<TypographyScript, string>> = {},
  options: TypographyFontLoadOptions = {},
): Promise<void> {
  if (typeof document === 'undefined') return;

  const preset = getTypographyPreset(presetId);
  const suppliedScripts: readonly TypographyScript[] =
    typeof scripts === 'string' ? [scripts] : scripts;
  const scriptList: TypographyScript[] = Array.from(new Set<TypographyScript>(suppliedScripts));
  const isSerifPreset = options.masterFamily !== undefined || preset.id === 'editorial' || preset.id === 'classic';
  const stylesheetIds = getTypographyStylesheetIds(presetId, scriptList, options);
  const timeoutMs = options.timeoutMs ?? CARD_EXPORT_FONT_TIMEOUT_MS;
  const profileSource = options.profileSource ?? 'other';
  profileCount(`fonts.loader.calls.${profileSource}`);
  const finishLoaderTiming = profileStart('fonts.loader.total', {
    source: profileSource,
    scripts: scriptList.join(','),
    stylesheetCount: stylesheetIds.length,
  });

  try {
    const finishStylesheetTiming = profileStart('fonts.loader.stylesheets', { source: profileSource });
    try {
      await Promise.all(stylesheetIds.map(async (id) => {
        try {
          await waitForTypographyStylesheetLoader(() => importStylesheet(id), timeoutMs, options.signal);
        } catch (error) {
          // A timed-out import must not poison the cache; the next export can retry.
          stylesheetPromises.delete(id);
          if (error instanceof CardExportError) throw error;
          throw new CardExportError('font-load-failed');
        }
      }));
    } finally {
      finishStylesheetTiming();
    }

    const fontLoads = scriptList.flatMap((script) => {
      if (script === 'latin') return [];
      const text = textByScript[script] || TYPOGRAPHY_SPECIMENS[script];
      const glyphs = extractScriptGlyphs(text, script);
      if (!glyphs) return [];

      profileCount(`fonts.loader.script.${script}`);
      const glyphCount = Array.from(glyphs).length;
      const sansId = script === 'korean' ? 'noto-sans-kr' : 'noto-sans-jp';
      const sansFamily = script === 'korean' ? FONT_FAMILIES.korean : FONT_FAMILIES.japanese;
      const faces = [loadProfiledFontFace(`400 16px "${sansFamily}"`, glyphs, {
        source: profileSource,
        face: sansId,
        script,
        glyphCount,
      })];
      if (isSerifPreset) {
        const serifId = script === 'korean' ? 'noto-serif-kr' : 'noto-serif-jp';
        const serifFamily = script === 'korean' ? FONT_FAMILIES.koreanSerif : FONT_FAMILIES.japaneseSerif;
        const weight = options.serifWeightByScript?.[script] ?? preset.displayWeight;
        faces.push(loadProfiledFontFace(`${weight} 16px "${serifFamily}"`, glyphs, {
          source: profileSource,
          face: serifId,
          script,
          weight,
          glyphCount,
        }));
      }
      return faces;
    });

    await withCardExportTimeout(
      () => Promise.all(fontLoads),
      timeoutMs,
      'font-timeout',
      options.signal,
    );
  } catch (error) {
    if (error instanceof CardExportError) throw error;
    throw new CardExportError('font-load-failed');
  } finally {
    finishLoaderTiming();
  }
}

export function loadProfiledFontFace(
  font: string,
  glyphs: string,
  detail: FontFaceProfileDetail,
): Promise<FontFace[]> {
  const profileDetails: Record<string, string | number | boolean | null> = {
    source: detail.source,
    face: detail.face,
    script: detail.script,
    glyphCount: detail.glyphCount,
    ...(detail.weight === undefined ? {} : { weight: detail.weight }),
  };
  profileCount('fonts.faceset.load.calls');
  const finishTiming = profileStart('fonts.faceset.load', profileDetails);
  try {
    const fontSet = document.fonts;
    const canCache = font.length + 1 + glyphs.length <= FONT_FACE_CACHE_MAX_KEY_LENGTH;
    const cacheKey = canCache ? `${font}\u0000${glyphs}` : '';
    let cache = canCache ? fontFaceLoadCache.get(fontSet) : undefined;
    if (canCache && cache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        profileCount('fonts.faceset.cache.hit');
        cache.delete(cacheKey);
        cache.set(cacheKey, cached);
        return cached.finally(finishTiming);
      }
    }

    profileCount(canCache ? 'fonts.faceset.cache.miss' : 'fonts.faceset.cache.bypass');
    const request = fontSet.load(font, glyphs);
    if (!canCache) return request.finally(finishTiming);

    cache ??= new Map<string, Promise<FontFace[]>>();
    if (!fontFaceLoadCache.has(fontSet)) fontFaceLoadCache.set(fontSet, cache);
    const pending = request.then((faces) => {
      if (faces.length === 0 && cache?.get(cacheKey) === pending) cache.delete(cacheKey);
      return faces;
    }, (error: unknown) => {
      if (cache?.get(cacheKey) === pending) cache.delete(cacheKey);
      throw error;
    });
    if (cache.size >= FONT_FACE_CACHE_LIMIT) {
      cache.delete(cache.keys().next().value!);
      profileCount('fonts.faceset.cache.eviction');
    }
    cache.set(cacheKey, pending);
    return pending.finally(finishTiming);
  } catch (error) {
    finishTiming();
    throw error;
  }
}

/** Select the display fallback for a name, using the active locale for Han-only names. */
export function getTypographyScriptForText(text: string, localeScript: TypographyScript): TypographyScript {
  return detectTypographyScript(text, localeScript);
}

/** Resolve each real script in a run so mixed Hangul, Kana, and Han request every face they need. */
export function getTypographyScriptsForCardText(text: string, localeScript: TypographyScript): TypographyScript[] {
  return getTypographyScriptsForText(text, localeScript);
}


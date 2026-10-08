'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AdventurerIdCard, CinematicCard, EditorialCard } from '@/components/cards';
import type { AdventurerCardCharacter, AdventurerCardData } from '@/components/cards/types';
import { getJob, JOB_CATEGORIES, localizeFfxivLabel } from '@/data/ffxiv';
import { loadTypographyFonts, loadProfiledFontFace, getTypographyScriptsForCardText } from '@/data/fonts/load-fonts';
import { CARD_EXPORT_FONT_TIMEOUT_MS, CardExportError, withCardExportTimeout } from '@/lib/card-export';
import { getCardMicrocopy, localizeCardWorld } from '@/lib/card-microcopy';
import { CARD_STOCK_COPY, getCardDisplayBio, getCardStaticText } from '@/lib/card-copy';
import { profileCount, profileRender, profileStart } from '@/lib/performance-profile';
import { useI18n } from '@/lib/i18n';
import type { Locale } from '@/lib/types';
import {
  getMasterTypographyFamily,
  getMasterTypographyTreatment,
  type MasterTypographyFamily,
  type TypographyScript,
} from '@/lib/typography-presets';

export function getCardFontRequest(
  character: AdventurerCardCharacter,
  locale: Locale,
  template?: 'cinematic' | 'editorial' | 'id-card',
  imageUrl = '',
) {
  const scriptFallback: TypographyScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const job = getJob(character.jobId ?? character.job);
  const jobCategory = JOB_CATEGORIES.find(({ id }) => id === job?.category);
  const microcopy = getCardMicrocopy(character, locale);
  const displayBio = getCardDisplayBio(character, imageUrl, locale);
  const strings = [
    character.name,
    displayBio,
    character.freeCompany,
    ...getCardStaticText(locale, template),
    microcopy.jobAbbreviation,
    microcopy.origin,
    localizeFfxivLabel('job', character.jobId ?? character.job, locale),
    jobCategory?.localizedName[locale] ?? '',
    localizeCardWorld(character, locale),
    localizeFfxivLabel('dataCenter', character.dataCenterId ?? character.dataCenter, locale),
    localizeFfxivLabel('race', character.raceId ?? character.race, locale),
    localizeFfxivLabel('clan', character.clanId ?? character.clan, locale),
    localizeFfxivLabel('grandCompany', character.grandCompanyId ?? character.grandCompany, locale),
    ...character.languages.map((language) => localizeFfxivLabel('language', language, locale)),
    ...character.playStyles.map((playStyle) => localizeFfxivLabel('playStyle', playStyle, locale)),
  ];
  const textByScript: Partial<Record<TypographyScript, string>> = {};

  for (const text of strings) {
    for (const script of getTypographyScriptsForCardText(text, scriptFallback)) {
      textByScript[script] = `${textByScript[script] ?? ''} ${text}`.trim();
    }
  }

  return { scripts: Object.keys(textByScript) as TypographyScript[], textByScript };
}

export interface CardPreviewFontData {
  character: AdventurerCardCharacter;
  imageUrl?: string;
  design: {
    typographyPreset: string;
    template?: 'cinematic' | 'editorial' | 'id-card';
    layoutVariant?: 'a' | 'b' | 'c';
  };
}

/** Fingerprint only the text and face-selection inputs that can change preview font readiness. */
export function getCardPreviewFontRequestKey(data: CardPreviewFontData, locale: Locale): string {
  return JSON.stringify([
    locale,
    data.design.typographyPreset,
    data.design.template ?? 'unknown',
    data.design.layoutVariant ?? 'a',
    getCardFontRequest(data.character, locale, data.design.template, data.imageUrl),
  ]);
}

/** Resolve script faces and wait for their glyphs before a preview/export capture. */
export async function loadCardPreviewFonts(
  data: CardPreviewFontData,
  locale: Locale,
  options: { signal?: AbortSignal; timeoutMs?: number; source?: 'preview' | 'export' } = {},
): Promise<void> {
  if (typeof document === 'undefined') return;
  const fontRequest = getCardFontRequest(data.character, locale, data.design.template, data.imageUrl);
  const source = options.source ?? 'preview';
  profileCount(`preview.fontLoads.calls.${source}`);
  const finishProfile = profileStart('preview.fontLoads.total', {
    source,
    locale,
    template: data.design.template ?? 'unknown',
    layout: data.design.layoutVariant ?? 'unknown',
    scripts: fontRequest.scripts.join(','),
  });
  const masterFamily: MasterTypographyFamily | undefined = data.design.template && (data.design.layoutVariant ?? 'a') === 'a'
    ? getMasterTypographyFamily(data.design.template)
    : undefined;
  const serifWeightByScript = masterFamily
    ? Object.fromEntries(fontRequest.scripts.map((script) => [
      script,
      getMasterTypographyTreatment(masterFamily, 'display', script).weight,
    ])) as Partial<Record<TypographyScript, number>>
    : undefined;
  const timeoutMs = options.timeoutMs ?? CARD_EXPORT_FONT_TIMEOUT_MS;
  try {
    await loadTypographyFonts(
      data.design.typographyPreset,
      fontRequest.scripts,
      fontRequest.textByScript,
      {
        ...(masterFamily ? { masterFamily, serifWeightByScript } : {}),
        timeoutMs,
        signal: options.signal,
        profileSource: source,
      },
    );
    const finishReady = profileStart('preview.fonts.ready', { source, locale });
    try {
      // V3's handwritten captions are real local faces in both preview and export.
      if (masterFamily) {
        const handwrittenLoads = data.design.template === 'cinematic'
          ? [() => {
            const text = CARD_STOCK_COPY.cinematic[locale].signature.join(' ');
            return loadProfiledFontFace('400 24px "Pinyon Script"', text, {
              source,
              face: 'pinyon-script',
              script: 'latin',
              glyphCount: Array.from(text).length,
            });
          }]
          : data.design.template === 'editorial'
            ? [
              () => {
                const text = CARD_STOCK_COPY.editorial[locale].warriorOfLight;
                return loadProfiledFontFace('400 24px "Pinyon Script"', text, {
                  source,
                  face: 'pinyon-script',
                  script: 'latin',
                  glyphCount: Array.from(text).length,
                });
              },
              () => {
                const text = CARD_STOCK_COPY.editorial[locale].story;
                return loadProfiledFontFace('400 24px "Whisper"', text, {
                  source,
                  face: 'whisper',
                  script: 'latin',
                  glyphCount: Array.from(text).length,
                });
              },
            ]
            : [];
        if (handwrittenLoads.length > 0) {
          await withCardExportTimeout(
            () => Promise.all(handwrittenLoads.map((load) => load())),
            timeoutMs,
            'font-timeout',
            options.signal,
          );
        }
      }
      await withCardExportTimeout(
      () => document.fonts.ready,
      timeoutMs,
      'font-timeout',
      options.signal,
      );
    } finally {
      finishReady();
    }
  } catch (error) {
    if (error instanceof CardExportError) throw error;
    throw new CardExportError('font-load-failed');
  } finally {
    finishProfile();
  }
}

type CardPreviewProps = {
  data: AdventurerCardData;
  className?: string;
  highlightField?: string;
  locale?: Locale;
};

export function CardPreview({ data, className, highlightField, locale: localeOverride }: CardPreviewProps) {
  profileRender('CardPreview');
  const { locale: contextLocale } = useI18n();
  const locale = localeOverride ?? contextLocale;
  const { character } = data;
  const typographyPreset = data.design.typographyPreset;
  const template = data.design.template;
  const layoutVariant = data.design.layoutVariant;
  const imageUrl = data.imageUrl;
  const fontData = useMemo<CardPreviewFontData>(() => ({
    character,
    imageUrl,
    design: { typographyPreset, template, layoutVariant },
  }), [character, imageUrl, layoutVariant, template, typographyPreset]);
  const fontRequestKey = useMemo(
    () => getCardPreviewFontRequestKey(fontData, locale),
    [fontData, locale],
  );
  const fontInputsRef = useRef({ data: fontData, locale });

  useEffect(() => {
    fontInputsRef.current = { data: fontData, locale };
  }, [fontData, locale]);

  useEffect(() => {
    const controller = new AbortController();
    const fontInputs = fontInputsRef.current;
    void loadCardPreviewFonts(fontInputs.data, fontInputs.locale, { source: 'preview', signal: controller.signal })
      .catch(() => undefined);
    return () => controller.abort();
  }, [fontRequestKey]);

  const props = { data, ratio: data.design.ratio, className, highlightField, locale };

  switch (data.design.template) {
    case 'editorial':
      return <EditorialCard {...props} />;
    case 'id-card':
      return <AdventurerIdCard {...props} />;
    case 'cinematic':
    default:
      return <CinematicCard {...props} />;
  }
}

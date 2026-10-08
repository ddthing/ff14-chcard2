'use client';

import { useEffect } from 'react';
import { AdventurerIdCard, CinematicCard, EditorialCard } from '@/components/cards';
import type { AdventurerCardCharacter, AdventurerCardData } from '@/components/cards/types';
import { localizeFfxivLabel } from '@/data/ffxiv';
import { loadTypographyFonts, getTypographyScriptsForCardText } from '@/data/fonts/load-fonts';
import { CARD_EXPORT_FONT_TIMEOUT_MS, CardExportError, withCardExportTimeout } from '@/lib/card-export';
import { profileCount, profileRender, profileStart } from '@/lib/performance-profile';
import { useI18n } from '@/lib/i18n';
import type { Locale } from '@/lib/types';
import {
  getMasterTypographyFamily,
  getMasterTypographyTreatment,
  type MasterTypographyFamily,
  type TypographyScript,
} from '@/lib/typography-presets';

function getCardFontRequest(character: AdventurerCardCharacter, locale: Locale) {
  const scriptFallback: TypographyScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const strings = [
    character.name,
    character.bio,
    character.freeCompany,
    localizeFfxivLabel('job', character.jobId ?? character.job, locale),
    localizeFfxivLabel('world', character.worldId ?? character.world, locale),
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
  design: {
    typographyPreset: string;
    template?: 'cinematic' | 'editorial' | 'id-card';
    layoutVariant?: 'a' | 'b' | 'c';
  };
}

/** Resolve script faces and wait for their glyphs before a preview/export capture. */
export async function loadCardPreviewFonts(
  data: CardPreviewFontData,
  locale: Locale,
  options: { signal?: AbortSignal; timeoutMs?: number; source?: 'preview' | 'export' } = {},
): Promise<void> {
  if (typeof document === 'undefined') return;
  const fontRequest = getCardFontRequest(data.character, locale);
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

  useEffect(() => {
    void loadCardPreviewFonts({
      character,
      design: {
        typographyPreset,
        template: data.design.template,
        layoutVariant: data.design.layoutVariant,
      },
    }, locale, { source: 'preview' })
      .catch(() => undefined);
  }, [character, data.design.layoutVariant, data.design.template, locale, typographyPreset]);

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

export type EditorA11yLocale = 'ko' | 'en' | 'ja';
export type AccessibleImageControlKey = 'x' | 'y' | 'scale' | 'rotation' | 'brightness' | 'contrast' | 'saturation' | 'exposure';

const LOCALE_TAGS: Record<EditorA11yLocale, string> = {
  ko: 'ko-KR',
  en: 'en',
  ja: 'ja-JP',
};

const UNITS: Record<EditorA11yLocale, Record<'percent' | 'times' | 'degrees' | 'exposure', string>> = {
  ko: { percent: '퍼센트', times: '배', degrees: '도', exposure: 'EV' },
  en: { percent: 'percent', times: 'times', degrees: 'degrees', exposure: 'EV' },
  ja: { percent: 'パーセント', times: '倍', degrees: '度', exposure: 'EV' },
};

function formatNumber(locale: EditorA11yLocale, value: number, fractionDigits: number, signed = false): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  }).format(value);
}

function withUnit(locale: EditorA11yLocale, value: number, unit: keyof (typeof UNITS)[EditorA11yLocale], fractionDigits = 0): string {
  const separator = locale === 'ja' ? '' : ' ';
  return `${formatNumber(locale, value, fractionDigits)}${separator}${UNITS[locale][unit]}`;
}

export function formatAccessiblePercent(locale: EditorA11yLocale, value: number): string {
  return withUnit(locale, Math.round(value), 'percent');
}

export function formatAccessibleImageControlValue(
  locale: EditorA11yLocale,
  key: AccessibleImageControlKey,
  value: number,
): string {
  if (key === 'x' || key === 'y') return withUnit(locale, Math.round(value), 'percent');
  if (key === 'scale') return withUnit(locale, value, 'times', 2);
  if (key === 'rotation') return withUnit(locale, value, 'degrees', 1);
  if (key === 'exposure') return `${formatNumber(locale, value, 1, true)} ${UNITS[locale].exposure}`;
  return withUnit(locale, Math.round(value * 100), 'percent');
}

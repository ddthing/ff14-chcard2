import { FONT_FAMILIES } from '@/data/fonts/registry';

export type TypographyPresetId = 'editorial' | 'modern' | 'condensed' | 'classic' | 'clean';
export type TypographyScript = 'latin' | 'korean' | 'japanese';
export type TypographyRole = 'display' | 'body' | 'metadata';
export type MasterTypographyFamily = 'cinematic' | 'editorial' | 'identity';
export type MasterTypographyRole =
  | 'display'
  | 'secondaryDisplay'
  | 'job'
  | 'information'
  | 'label'
  | 'caption'
  | 'micro';

export interface MasterTypographyTreatment {
  readonly fontFamily: string;
  readonly weight: number;
  readonly tracking: string;
  readonly lineHeight: number;
}

export type TypographyScriptStacks = Readonly<Record<TypographyScript, string>>;

export interface TypographyFontPairing {
  display: TypographyScriptStacks;
  body: TypographyScriptStacks;
  metadata: TypographyScriptStacks;
}

export interface TypographyPreset {
  id: TypographyPresetId;
  label: string;
  /** Legacy Latin stacks retained for previews and older card consumers. */
  display: string;
  body: string;
  metadata: string;
  /** Explicit stacks let cards keep Latin and CJK metrics balanced per script. */
  fonts: TypographyFontPairing;
  displayWeight: number;
  displayTracking: string;
  metadataTracking: string;
  displayTransform: 'none' | 'uppercase';
}

const displayFonts: TypographyScriptStacks = {
  latin: `${FONT_FAMILIES.display}, Georgia, serif`,
  korean: `${FONT_FAMILIES.display}, ${FONT_FAMILIES.koreanSerif}, "Noto Serif KR", "Nanum Myeongjo", ${FONT_FAMILIES.korean}, "Malgun Gothic", "Apple SD Gothic Neo", serif`,
  japanese: `${FONT_FAMILIES.display}, ${FONT_FAMILIES.japaneseSerif}, "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", ${FONT_FAMILIES.japanese}, "Meiryo", serif`,
};

const bodyFonts: TypographyScriptStacks = {
  latin: `${FONT_FAMILIES.sans}, Arial, system-ui, sans-serif`,
  korean: `${FONT_FAMILIES.sans}, "Pretendard", ${FONT_FAMILIES.korean}, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`,
  japanese: `${FONT_FAMILIES.sans}, ${FONT_FAMILIES.japanese}, "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`,
};

const metadataFonts: TypographyScriptStacks = {
  latin: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  korean: `${FONT_FAMILIES.korean}, "SFMono-Regular", Consolas, "Malgun Gothic", monospace`,
  japanese: `${FONT_FAMILIES.japanese}, "SFMono-Regular", Consolas, "Yu Gothic", monospace`,
};

const masterSerifFonts: Readonly<Record<TypographyScript, string>> = {
  latin: `${FONT_FAMILIES.display}, ${FONT_FAMILIES.koreanSerif}, ${FONT_FAMILIES.japaneseSerif}, Georgia, "Times New Roman", serif`,
  korean: `${FONT_FAMILIES.display}, ${FONT_FAMILIES.koreanSerif}, ${FONT_FAMILIES.japaneseSerif}, "Noto Serif KR", "Noto Serif JP", "Nanum Myeongjo", "Batang", "Yu Mincho", "Hiragino Mincho ProN", "Malgun Gothic", "Apple SD Gothic Neo", serif`,
  japanese: `${FONT_FAMILIES.display}, ${FONT_FAMILIES.japaneseSerif}, ${FONT_FAMILIES.koreanSerif}, "Noto Serif JP", "Noto Serif KR", "Yu Mincho", "Hiragino Mincho ProN", "Nanum Myeongjo", "Batang", "Meiryo", serif`,
};

const masterSansFonts: Readonly<Record<TypographyScript, string>> = {
  latin: `${FONT_FAMILIES.sans}, Arial, system-ui, ${FONT_FAMILIES.korean}, ${FONT_FAMILIES.japanese}, sans-serif`,
  korean: `${FONT_FAMILIES.display}, ${FONT_FAMILIES.korean}, ${FONT_FAMILIES.japanese}, ${FONT_FAMILIES.sans}, "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Meiryo", sans-serif`,
  japanese: `${FONT_FAMILIES.display}, ${FONT_FAMILIES.japanese}, ${FONT_FAMILIES.korean}, ${FONT_FAMILIES.sans}, "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", "Malgun Gothic", sans-serif`,
};

const masterMicroFonts: Readonly<Record<TypographyScript, string>> = {
  latin: `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", ${FONT_FAMILIES.korean}, ${FONT_FAMILIES.japanese}, monospace`,
  korean: `${FONT_FAMILIES.korean}, ${FONT_FAMILIES.japanese}, ui-monospace, "SFMono-Regular", Consolas, "Malgun Gothic", monospace`,
  japanese: `${FONT_FAMILIES.japanese}, ${FONT_FAMILIES.korean}, ui-monospace, "SFMono-Regular", Consolas, "Yu Gothic", monospace`,
};

const treatment = (
  fontFamily: string,
  weight: number,
  tracking: string,
  lineHeight: number,
): MasterTypographyTreatment => ({ fontFamily, weight, tracking, lineHeight });

/**
 * Final art-directed typography pairing for each Master family, script, and
 * semantic role. Cormorant supplies Latin serifs; the registered Noto Serif
 * KR/JP faces carry CJK glyphs. Each CJK stack includes both script faces so
 * mixed Hangul, Kana, and Han names never drop into an unrelated sans face.
 */
export const MASTER_TYPOGRAPHY_MAP = {
  cinematic: {
    latin: {
      display: treatment(masterSerifFonts.latin, 500, '-0.050em', 0.82),
      secondaryDisplay: treatment(masterSerifFonts.latin, 450, '0.018em', 1.25),
      job: treatment(masterSerifFonts.latin, 600, '0.04em', 1.02),
      information: treatment(masterSansFonts.latin, 500, '0', 1.08),
      label: treatment(masterMicroFonts.latin, 600, '0.10em', 1.15),
      caption: treatment(masterSansFonts.latin, 500, '0.02em', 1.24),
      micro: treatment(masterMicroFonts.latin, 600, '0.11em', 1.08),
    },
    korean: {
      display: treatment(masterSerifFonts.korean, 460, '-0.01em', 1.02),
      secondaryDisplay: treatment(masterSerifFonts.korean, 450, '0', 1.26),
      job: treatment(masterSerifFonts.korean, 500, '0', 1.08),
      information: treatment(masterSansFonts.korean, 480, '0', 1.12),
      label: treatment(masterMicroFonts.korean, 500, '0.015em', 1.2),
      caption: treatment(masterSansFonts.korean, 450, '0.005em', 1.3),
      micro: treatment(masterMicroFonts.korean, 500, '0.04em', 1.2),
    },
    japanese: {
      display: treatment(masterSerifFonts.japanese, 470, '-0.006em', 1.04),
      secondaryDisplay: treatment(masterSerifFonts.japanese, 450, '0', 1.27),
      job: treatment(masterSerifFonts.japanese, 500, '0.01em', 1.08),
      information: treatment(masterSansFonts.japanese, 480, '0', 1.12),
      label: treatment(masterMicroFonts.japanese, 500, '0.02em', 1.2),
      caption: treatment(masterSansFonts.japanese, 450, '0.01em', 1.29),
      micro: treatment(masterMicroFonts.japanese, 500, '0.035em', 1.2),
    },
  },
  editorial: {
    latin: {
      display: treatment(masterSerifFonts.latin, 650, '-0.035em', 0.9),
      secondaryDisplay: treatment(masterSerifFonts.latin, 500, '0.01em', 1.3),
      job: treatment(masterSerifFonts.latin, 650, '-0.055em', 0.95),
      information: treatment(masterSansFonts.latin, 550, '-0.02em', 1.2),
      label: treatment(masterSansFonts.latin, 550, '0.08em', 1.2),
      caption: treatment(masterSansFonts.latin, 560, '-0.015em', 1.22),
      micro: treatment(masterMicroFonts.latin, 550, '0.06em', 1.2),
    },
    korean: {
      display: treatment(masterSerifFonts.korean, 480, '-0.012em', 0.98),
      secondaryDisplay: treatment(masterSerifFonts.korean, 480, '0', 1.3),
      job: treatment(masterSerifFonts.korean, 520, '-0.01em', 1.08),
      information: treatment(masterSansFonts.korean, 480, '-0.01em', 1.2),
      label: treatment(masterSansFonts.korean, 500, '0.01em', 1.24),
      caption: treatment(masterSansFonts.korean, 480, '0', 1.28),
      micro: treatment(masterMicroFonts.korean, 500, '0.025em', 1.2),
    },
    japanese: {
      display: treatment(masterSerifFonts.japanese, 500, '-0.003em', 1),
      secondaryDisplay: treatment(masterSerifFonts.japanese, 460, '0', 1.28),
      job: treatment(masterSerifFonts.japanese, 520, '0', 1.1),
      information: treatment(masterSansFonts.japanese, 500, '-0.005em', 1.2),
      label: treatment(masterSansFonts.japanese, 500, '0.02em', 1.24),
      caption: treatment(masterSansFonts.japanese, 480, '0.005em', 1.28),
      micro: treatment(masterMicroFonts.japanese, 500, '0.025em', 1.2),
    },
  },
  identity: {
    latin: {
      display: treatment(masterSerifFonts.latin, 600, '-0.028em', 0.92),
      secondaryDisplay: treatment(masterSerifFonts.latin, 500, '0.006em', 1.22),
      job: treatment(masterSerifFonts.latin, 600, '-0.025em', 1.05),
      information: treatment(masterSerifFonts.latin, 520, '-0.012em', 1.14),
      label: treatment(masterMicroFonts.latin, 680, '0.075em', 1.1),
      caption: treatment(masterSerifFonts.latin, 500, '0.006em', 1.18),
      micro: treatment(masterMicroFonts.latin, 600, '0.10em', 1.05),
    },
    korean: {
      display: treatment(masterSerifFonts.korean, 470, '-0.009em', 1.03),
      secondaryDisplay: treatment(masterSerifFonts.korean, 460, '0', 1.24),
      job: treatment(masterSerifFonts.korean, 500, '-0.005em', 1.08),
      information: treatment(masterSerifFonts.korean, 500, '-0.008em', 1.15),
      label: treatment(masterMicroFonts.korean, 600, '0.015em', 1.14),
      caption: treatment(masterSerifFonts.korean, 480, '0', 1.22),
      micro: treatment(masterMicroFonts.korean, 550, '0.035em', 1.1),
    },
    japanese: {
      display: treatment(masterSerifFonts.japanese, 500, '-0.004em', 1.04),
      secondaryDisplay: treatment(masterSerifFonts.japanese, 460, '0', 1.24),
      job: treatment(masterSerifFonts.japanese, 510, '0', 1.08),
      information: treatment(masterSerifFonts.japanese, 500, '-0.005em', 1.16),
      label: treatment(masterMicroFonts.japanese, 580, '0.018em', 1.14),
      caption: treatment(masterSerifFonts.japanese, 480, '0.005em', 1.22),
      micro: treatment(masterMicroFonts.japanese, 550, '0.035em', 1.1),
    },
  },
} as const satisfies Readonly<
  Record<MasterTypographyFamily, Readonly<Record<TypographyScript, Readonly<Record<MasterTypographyRole, MasterTypographyTreatment>>>>>
>;

export function getMasterTypographyTreatment(
  family: MasterTypographyFamily,
  role: MasterTypographyRole,
  script: TypographyScript,
): MasterTypographyTreatment {
  return MASTER_TYPOGRAPHY_MAP[family][script][role];
}

const sharedFonts: TypographyFontPairing = {
  display: displayFonts,
  body: bodyFonts,
  metadata: metadataFonts,
};

/** Text samples intentionally include glyphs from every supported UI locale. */
export const TYPOGRAPHY_SPECIMENS: Readonly<Record<TypographyScript, string>> = {
  latin: 'Coner · Small steps, long journeys.',
  korean: 'Coner · 작은 발걸음, 긴 여정',
  japanese: 'Coner · 小さな一歩、長い旅',
};

/**
 * Script-aware stacks built around the Phase 2 Latin fonts. Noto CJK faces
 * are script subsets with unicode-range declarations, so only glyphs used by
 * the active text request their corresponding WOFF2 files.
 */
export const TYPOGRAPHY_PRESETS: Readonly<Record<TypographyPresetId, TypographyPreset>> = {
  editorial: {
    id: 'editorial',
    label: 'Editorial',
    display: displayFonts.latin,
    body: bodyFonts.latin,
    metadata: metadataFonts.latin,
    fonts: sharedFonts,
    displayWeight: 500,
    displayTracking: '-0.035em',
    metadataTracking: '0.12em',
    displayTransform: 'none',
  },
  modern: {
    id: 'modern',
    label: 'Modern',
    display: bodyFonts.latin,
    body: bodyFonts.latin,
    metadata: metadataFonts.latin,
    fonts: { ...sharedFonts, display: bodyFonts },
    displayWeight: 600,
    displayTracking: '-0.045em',
    metadataTracking: '0.1em',
    displayTransform: 'none',
  },
  condensed: {
    id: 'condensed',
    label: 'Condensed',
    // Tracking and case create a condensed treatment without another family.
    display: bodyFonts.latin,
    body: bodyFonts.latin,
    metadata: metadataFonts.latin,
    fonts: { ...sharedFonts, display: bodyFonts },
    displayWeight: 700,
    displayTracking: '-0.075em',
    metadataTracking: '0.16em',
    displayTransform: 'uppercase',
  },
  classic: {
    id: 'classic',
    label: 'Classic',
    display: displayFonts.latin,
    body: bodyFonts.latin,
    metadata: bodyFonts.latin,
    fonts: { ...sharedFonts, metadata: bodyFonts },
    displayWeight: 600,
    displayTracking: '-0.025em',
    metadataTracking: '0.14em',
    displayTransform: 'none',
  },
  clean: {
    id: 'clean',
    label: 'Clean',
    display: bodyFonts.latin,
    body: bodyFonts.latin,
    metadata: bodyFonts.latin,
    fonts: { ...sharedFonts, display: bodyFonts, metadata: bodyFonts },
    displayWeight: 500,
    displayTracking: '-0.02em',
    metadataTracking: '0.04em',
    displayTransform: 'none',
  },
};

export function getTypographyPreset(preset: string | null | undefined): TypographyPreset {
  switch (preset) {
    case 'editorial':
    case 'modern':
    case 'condensed':
    case 'classic':
    case 'clean':
      return TYPOGRAPHY_PRESETS[preset];
    default:
      return TYPOGRAPHY_PRESETS.editorial;
  }
}

export function getTypographyFontFamily(
  preset: string | null | undefined,
  role: TypographyRole,
  script: TypographyScript,
): string {
  return getTypographyPreset(preset).fonts[role][script];
}

export function getMasterTypographyFamily(
  template: 'cinematic' | 'editorial' | 'id-card',
): MasterTypographyFamily {
  return template === 'id-card' ? 'identity' : template;
}

/**
 * Kana distinguishes Japanese from Han-only text. Han-only names use the
 * supplied locale fallback because Unicode doesn't encode Chinese/Japanese/
 * Korean language for shared ideographs. Text with no CJK script uses Latin
 * metrics regardless of the interface locale.
 */
export function detectTypographyScript(
  text: string,
  fallback: TypographyScript = 'latin',
): TypographyScript {
  let firstHangul = -1;
  let firstKana = -1;
  let hasHan = false;
  let index = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (firstHangul < 0 && (
      (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
      (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
      (codePoint >= 0x3130 && codePoint <= 0x318f) ||
      (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
      (codePoint >= 0xd7b0 && codePoint <= 0xd7ff)
    )) {
      firstHangul = index;
    }
    if (firstKana < 0 && (
      (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
      (codePoint >= 0x31f0 && codePoint <= 0x31ff) ||
      (codePoint >= 0xff66 && codePoint <= 0xff9f) ||
      (codePoint >= 0x1b000 && codePoint <= 0x1b16f)
    )) {
      firstKana = index;
    }
    if ((codePoint >= 0x3400 && codePoint <= 0x9fff) || (codePoint >= 0xf900 && codePoint <= 0xfaff) || (codePoint >= 0x20000 && codePoint <= 0x2fa1f)) {
      hasHan = true;
    }
    index += character.length;
  }

  if (firstHangul >= 0 && firstKana >= 0) return firstHangul < firstKana ? 'korean' : 'japanese';
  if (firstHangul >= 0) return 'korean';
  if (firstKana >= 0) return 'japanese';
  // Han is shared across Chinese, Japanese, and Korean. Keep the active
  // Korean locale when provided; otherwise use Japanese as the stable CJK
  // fallback so Han-only names request the same face used by card geometry.
  if (hasHan) return fallback === 'korean' ? 'korean' : 'japanese';
  return 'latin';
}

/** Return every font script represented in a text run, including mixed names. */
export function getTypographyScriptsForText(
  text: string,
  fallback: TypographyScript = 'latin',
): TypographyScript[] {
  const hasHangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u.test(text);
  const hasKana = /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f\u{1b000}-\u{1b16f}]/u.test(text);
  const hasHan = /[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/u.test(text);
  const scripts: TypographyScript[] = [];

  if (/\p{Script=Latin}/u.test(text)) scripts.push('latin');
  if (hasHangul) scripts.push('korean');
  if (hasKana) scripts.push('japanese');

  if (hasHan) {
    const hanScript = hasHangul && hasKana
      ? detectTypographyScript(text, fallback)
      : hasHangul
        ? 'korean'
        : hasKana
          ? 'japanese'
          : fallback === 'korean' ? 'korean' : 'japanese';
    if (!scripts.includes(hanScript)) scripts.push(hanScript);
  }

  if (scripts.length === 0) scripts.push(detectTypographyScript(text, fallback));
  return scripts;
}


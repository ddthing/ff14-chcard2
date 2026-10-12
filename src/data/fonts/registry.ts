export type RegisteredFontSubset = 'latin' | 'latin-ext' | 'vietnamese' | 'full' | 'unicode-range';

export interface LocalFontAsset {
  readonly subset: Exclude<RegisteredFontSubset, 'unicode-range'>;
  readonly publicPath: `/fonts/${string}`;
  readonly filePath: `public/fonts/${string}`;
  readonly bytes: number;
  readonly style?: 'normal' | 'italic';
  readonly stretch?: string;
  /** CSS unicode-range from the upstream subset stylesheet, when this is a subset face. */
  readonly unicodeRange?: string;
  /** Fixed face weight when this file represents a static face in a family. */
  readonly weight?: number;
}

export interface FontRegistryEntry {
  readonly id: string;
  readonly family: string;
  readonly license: string;
  readonly licenseFile: `licenses/fonts/${string}`;
  readonly publicLicenseFile?: `public/fonts/licenses/${string}`;
  readonly sourceUrl: `https://${string}`;
  readonly axes: Readonly<{ weight: readonly [number, number] }>;
  /** Stable local @font-face output order; new entries without a value are appended. */
  readonly cssOrder?: number;
  readonly fontDisplay?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  /** False for bundled artwork-only fonts that must not appear in the editor picker. */
  readonly selectable?: boolean;
  /** Exact discrete weights for static families; variable families use the axis range. */
  readonly weights?: readonly number[];
  readonly supportedScripts: readonly ('latin' | 'korean' | 'japanese')[];
  readonly localAssets?: readonly LocalFontAsset[];
  readonly package?: Readonly<{
    /** Select all package faces for the active script and typography role. */
    role: 'sans' | 'serif';
    /** The default family used by the app when loading the base script face. */
    isDefault?: boolean;
    name: string;
    version: string;
    stylesheet: string;
    stylesheetPath: `node_modules/${string}`;
    filePattern: string;
    fileCount: number;
    fontBytes: number;
    unicodeRangeLoading: true;
  }>;
}

/** Exact upstream CSS subset ranges retained for the existing local WOFF2 files. */
export const FONT_UNICODE_RANGES = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  latinExtCormorant: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2C60-2C7F, U+A720-A7FF',
  latinExtDmSans: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  latinExtExpanded: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
  vietnamese: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
} as const;

/**
 * Latin faces are hand-selected WOFF2 subsets. Script-specific Noto CSS is
 * dynamically imported by loadTypographyFonts; unicode-range keeps its WOFF2
 * requests limited to glyphs used by the selected card text.
 */
export const FONT_REGISTRY = {
  pinyonScript: {
    id: 'pinyon-script', family: 'Pinyon Script', license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Pinyon-Script-OFL.txt',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/pinyonscript',
    cssOrder: 2,
    axes: { weight: [400, 400] }, supportedScripts: ['latin'], selectable: false,
    localAssets: [
      { subset: 'vietnamese', publicPath: '/fonts/pinyon-script-vietnamese-normal.woff2', filePath: 'public/fonts/pinyon-script-vietnamese-normal.woff2', bytes: 10700, unicodeRange: FONT_UNICODE_RANGES.vietnamese },
      { subset: 'latin-ext', publicPath: '/fonts/pinyon-script-latin-ext-normal.woff2', filePath: 'public/fonts/pinyon-script-latin-ext-normal.woff2', bytes: 36152, unicodeRange: FONT_UNICODE_RANGES.latinExtExpanded },
      { subset: 'latin', publicPath: '/fonts/pinyon-script-latin-normal.woff2', filePath: 'public/fonts/pinyon-script-latin-normal.woff2', bytes: 39044, unicodeRange: FONT_UNICODE_RANGES.latin },
    ],
  },
  whisper: {
    id: 'whisper', family: 'Whisper', license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Whisper-OFL.txt',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/whisper',
    cssOrder: 3,
    axes: { weight: [400, 400] }, supportedScripts: ['latin'], selectable: false,
    localAssets: [
      { subset: 'vietnamese', publicPath: '/fonts/whisper-vietnamese-normal.woff2', filePath: 'public/fonts/whisper-vietnamese-normal.woff2', bytes: 10344, unicodeRange: FONT_UNICODE_RANGES.vietnamese },
      { subset: 'latin-ext', publicPath: '/fonts/whisper-latin-ext-normal.woff2', filePath: 'public/fonts/whisper-latin-ext-normal.woff2', bytes: 26340, unicodeRange: FONT_UNICODE_RANGES.latinExtExpanded },
      { subset: 'latin', publicPath: '/fonts/whisper-latin-normal.woff2', filePath: 'public/fonts/whisper-latin-normal.woff2', bytes: 33296, unicodeRange: FONT_UNICODE_RANGES.latin },
    ],
  },
  cormorantGaramond: {
    id: 'cormorant-garamond',
    family: 'Cormorant Garamond Variable',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Cormorant-Garamond-OFL.txt',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/cormorantgaramond',
    cssOrder: 0,
    axes: { weight: [300, 700] },
    supportedScripts: ['latin'],
    localAssets: [
      {
        subset: 'latin',
        publicPath: '/fonts/cormorant-garamond-latin-wght-normal.woff2',
        filePath: 'public/fonts/cormorant-garamond-latin-wght-normal.woff2',
        bytes: 37_640,
        unicodeRange: FONT_UNICODE_RANGES.latin,
      },
      {
        subset: 'latin-ext',
        publicPath: '/fonts/cormorant-garamond-latin-ext-wght-normal.woff2',
        filePath: 'public/fonts/cormorant-garamond-latin-ext-wght-normal.woff2',
        bytes: 33_736,
        unicodeRange: FONT_UNICODE_RANGES.latinExtCormorant,
      },
      {
        subset: 'vietnamese',
        publicPath: '/fonts/cormorant-garamond-vietnamese-wght-normal.woff2',
        filePath: 'public/fonts/cormorant-garamond-vietnamese-wght-normal.woff2',
        bytes: 11_220,
        unicodeRange: FONT_UNICODE_RANGES.vietnamese,
      },
    ],
  },
  dmSans: {
    id: 'dm-sans',
    family: 'DM Sans Variable',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/DM-Sans-OFL.txt',
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/dmsans',
    cssOrder: 1,
    axes: { weight: [100, 1000] },
    supportedScripts: ['latin'],
    localAssets: [
      {
        subset: 'latin',
        publicPath: '/fonts/dm-sans-latin-wght-normal.woff2',
        filePath: 'public/fonts/dm-sans-latin-wght-normal.woff2',
        bytes: 36_932,
        unicodeRange: FONT_UNICODE_RANGES.latin,
      },
      {
        subset: 'latin-ext',
        publicPath: '/fonts/dm-sans-latin-ext-wght-normal.woff2',
        filePath: 'public/fonts/dm-sans-latin-ext-wght-normal.woff2',
        bytes: 18_228,
        unicodeRange: FONT_UNICODE_RANGES.latinExtDmSans,
      },
    ],
  },
  estonia: {
    id: 'estonia',
    family: 'Estonia',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Estonia-OFL.txt',
    publicLicenseFile: 'public/fonts/licenses/Estonia-OFL.txt',
    sourceUrl: 'https://github.com/googlefonts/estonia',
    cssOrder: 4,
    axes: { weight: [400, 400] },
    weights: [400],
    supportedScripts: ['latin'],
    localAssets: [
      { subset: 'vietnamese', publicPath: '/fonts/estonia-vietnamese-normal.woff2', filePath: 'public/fonts/estonia-vietnamese-normal.woff2', bytes: 19_596, unicodeRange: FONT_UNICODE_RANGES.vietnamese },
      { subset: 'latin-ext', publicPath: '/fonts/estonia-latin-ext-normal.woff2', filePath: 'public/fonts/estonia-latin-ext-normal.woff2', bytes: 62_776, unicodeRange: FONT_UNICODE_RANGES.latinExtExpanded },
      { subset: 'latin', publicPath: '/fonts/estonia-latin-normal.woff2', filePath: 'public/fonts/estonia-latin-normal.woff2', bytes: 81_924, unicodeRange: FONT_UNICODE_RANGES.latin },
    ],
  },
  bricolageGrotesque: {
    id: 'bricolage-grotesque',
    family: 'Bricolage Grotesque',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Bricolage-Grotesque-OFL.txt',
    publicLicenseFile: 'public/fonts/licenses/Bricolage-Grotesque-OFL.txt',
    sourceUrl: 'https://github.com/ateliertriay/bricolage',
    cssOrder: 5,
    axes: { weight: [200, 800] },
    supportedScripts: ['latin'],
    localAssets: [
      { subset: 'vietnamese', publicPath: '/fonts/bricolage-grotesque-vietnamese-wght-normal.woff2', filePath: 'public/fonts/bricolage-grotesque-vietnamese-wght-normal.woff2', bytes: 12_984, stretch: '100%', unicodeRange: FONT_UNICODE_RANGES.vietnamese },
      { subset: 'latin-ext', publicPath: '/fonts/bricolage-grotesque-latin-ext-wght-normal.woff2', filePath: 'public/fonts/bricolage-grotesque-latin-ext-wght-normal.woff2', bytes: 30_736, stretch: '100%', unicodeRange: FONT_UNICODE_RANGES.latinExtExpanded },
      { subset: 'latin', publicPath: '/fonts/bricolage-grotesque-latin-wght-normal.woff2', filePath: 'public/fonts/bricolage-grotesque-latin-wght-normal.woff2', bytes: 76_888, stretch: '100%', unicodeRange: FONT_UNICODE_RANGES.latin },
    ],
  },
  valleySans: {
    id: 'valley-sans',
    family: 'Valley Sans',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Valley-Sans-OFL.txt',
    publicLicenseFile: 'public/fonts/licenses/Valley-Sans-OFL.txt',
    sourceUrl: 'https://github.com/HelsinkiTypeStudio/valley-sans',
    cssOrder: 6,
    axes: { weight: [100, 900] },
    supportedScripts: ['latin'],
    localAssets: [
      { subset: 'latin-ext', publicPath: '/fonts/valley-sans-latin-ext-wght-normal.woff2', filePath: 'public/fonts/valley-sans-latin-ext-wght-normal.woff2', bytes: 19_056, unicodeRange: FONT_UNICODE_RANGES.latinExtExpanded },
      { subset: 'latin', publicPath: '/fonts/valley-sans-latin-wght-normal.woff2', filePath: 'public/fonts/valley-sans-latin-wght-normal.woff2', bytes: 47_444, unicodeRange: FONT_UNICODE_RANGES.latin },
    ],
  },
  gmarketSans: {
    id: 'gmarket-sans',
    family: 'Gmarket Sans',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Gmarket-Sans-OFL.txt',
    publicLicenseFile: 'public/fonts/licenses/Gmarket-Sans-OFL.txt',
    sourceUrl: 'https://corp.gmarket.com/fonts/',
    cssOrder: 7,
    axes: { weight: [300, 700] },
    weights: [300, 500, 700],
    supportedScripts: ['latin', 'korean'],
    localAssets: [
      { subset: 'full', weight: 300, publicPath: '/fonts/gmarket-sans-light.woff2', filePath: 'public/fonts/gmarket-sans-light.woff2', bytes: 374_600 },
      { subset: 'full', weight: 500, publicPath: '/fonts/gmarket-sans-medium.woff2', filePath: 'public/fonts/gmarket-sans-medium.woff2', bytes: 411_932 },
      { subset: 'full', weight: 700, publicPath: '/fonts/gmarket-sans-bold.woff2', filePath: 'public/fonts/gmarket-sans-bold.woff2', bytes: 422_344 },
    ],
  },
  notoSansKr: {
    id: 'noto-sans-kr',
    family: 'Noto Sans KR Variable',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Noto-Sans-KR-OFL.txt',
    sourceUrl: 'https://github.com/notofonts/noto-cjk',
    axes: { weight: [100, 900] },
    supportedScripts: ['korean'],
    package: {
      role: 'sans',
      isDefault: true,
      name: '@fontsource-variable/noto-sans-kr',
      version: '5.3.0',
      stylesheet: '@fontsource-variable/noto-sans-kr/wght.css',
      stylesheetPath: 'node_modules/@fontsource-variable/noto-sans-kr/wght.css',
      filePattern: 'files/noto-sans-kr-*-wght-normal.woff2',
      fileCount: 124,
      fontBytes: 3_519_780,
      unicodeRangeLoading: true,
    },
  },
  notoSansJp: {
    id: 'noto-sans-jp',
    family: 'Noto Sans JP Variable',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Noto-Sans-JP-OFL.txt',
    sourceUrl: 'https://github.com/notofonts/noto-cjk',
    axes: { weight: [100, 900] },
    supportedScripts: ['japanese'],
    package: {
      role: 'sans',
      isDefault: true,
      name: '@fontsource-variable/noto-sans-jp',
      version: '5.3.0',
      stylesheet: '@fontsource-variable/noto-sans-jp/wght.css',
      stylesheetPath: 'node_modules/@fontsource-variable/noto-sans-jp/wght.css',
      filePattern: 'files/noto-sans-jp-*-wght-normal.woff2',
      fileCount: 124,
      fontBytes: 5_223_320,
      unicodeRangeLoading: true,
    },
  },
  notoSerifKr: {
    id: 'noto-serif-kr',
    family: 'Noto Serif KR Variable',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Noto-Serif-KR-OFL.txt',
    sourceUrl: 'https://github.com/notofonts/noto-cjk',
    axes: { weight: [200, 900] },
    supportedScripts: ['korean'],
    package: {
      role: 'serif',
      isDefault: true,
      name: '@fontsource-variable/noto-serif-kr',
      version: '5.3.0',
      stylesheet: '@fontsource-variable/noto-serif-kr/wght.css',
      stylesheetPath: 'node_modules/@fontsource-variable/noto-serif-kr/wght.css',
      filePattern: 'files/noto-serif-kr-*-wght-normal.woff2',
      fileCount: 124,
      fontBytes: 6_249_684,
      unicodeRangeLoading: true,
    },
  },
  notoSerifJp: {
    id: 'noto-serif-jp',
    family: 'Noto Serif JP Variable',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'licenses/fonts/Noto-Serif-JP-OFL.txt',
    sourceUrl: 'https://github.com/notofonts/noto-cjk',
    axes: { weight: [200, 900] },
    supportedScripts: ['japanese'],
    package: {
      role: 'serif',
      isDefault: true,
      name: '@fontsource-variable/noto-serif-jp',
      version: '5.3.0',
      stylesheet: '@fontsource-variable/noto-serif-jp/wght.css',
      stylesheetPath: 'node_modules/@fontsource-variable/noto-serif-jp/wght.css',
      filePattern: 'files/noto-serif-jp-*-wght-normal.woff2',
      fileCount: 124,
      fontBytes: 7_073_756,
      unicodeRangeLoading: true,
    },
  },
} as const satisfies Readonly<Record<string, FontRegistryEntry>>;

export const FONT_FAMILIES = {
  display: FONT_REGISTRY.cormorantGaramond.family,
  sans: FONT_REGISTRY.dmSans.family,
  korean: FONT_REGISTRY.notoSansKr.family,
  japanese: FONT_REGISTRY.notoSansJp.family,
  koreanSerif: FONT_REGISTRY.notoSerifKr.family,
  japaneseSerif: FONT_REGISTRY.notoSerifJp.family,
} as const;


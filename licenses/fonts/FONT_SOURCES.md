# Font sources and web delivery

Every bundled font is under the SIL Open Font License 1.1. The unmodified license and copyright text shipped with each source package is kept next to this file. WOFF2 files are served with the app; the site does not contact Google Fonts at runtime.

## Latin families

| Family | Upstream source | Included subsets | Payload |
| --- | --- | --- | ---: |
| Cormorant Garamond Variable | [google/fonts `cormorantgaramond`](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) | Latin, Latin Extended, Vietnamese | 82,596 bytes |
| DM Sans Variable | [google/fonts `dmsans`](https://github.com/google/fonts/tree/main/ofl/dmsans) | Latin, Latin Extended | 55,160 bytes |

These five variable WOFF2 files are the only fonts requested by the initial stylesheet. Their combined payload is 137,756 bytes (about 134.5 KiB). Only normal style is included; the variable weight axes remain available.

## Korean and Japanese families

| Family | Upstream project | Fontsource package | WOFF2 shards | All shards |
| --- | --- | --- | ---: | ---: |
| Noto Sans KR Variable | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) | `@fontsource-variable/noto-sans-kr` 5.3.0 | 124 | 3,519,780 bytes |
| Noto Sans JP Variable | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) | `@fontsource-variable/noto-sans-jp` 5.3.0 | 124 | 5,223,320 bytes |
| Noto Serif KR Variable | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) | `@fontsource-variable/noto-serif-kr` 5.3.0 | 124 | 6,249,684 bytes |
| Noto Serif JP Variable | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) | `@fontsource-variable/noto-serif-jp` 5.3.0 | 124 | 7,073,756 bytes |

The CJK CSS is dynamically imported for the active script. Sans faces are used for body and metadata. Serif faces are imported only for Editorial and Classic display text. Fontsource's generated CSS preserves `unicode-range`, so the browser fetches only the subset files matching rendered glyphs rather than all 496 WOFF2 shards. When a character has no bundled font glyph, the script-specific system stack remains as the fallback.

The four CJK families contain 22,066,540 bytes across all subsets (about 21.0 MiB) for complete fallback coverage. Representative sample-only transfers are measured in `tests/fonts-registry.test.mjs`; real card transfers vary with the characters entered and the selected preset.

## License evidence

- `Cormorant-Garamond-OFL.txt`: Copyright 2015 The Cormorant Project Authors. The upstream Google Fonts family metadata declares OFL.
- `DM-Sans-OFL.txt`: Copyright 2014 The DM Sans Project Authors. The upstream Google Fonts family metadata declares OFL.
- `Noto-Sans-KR-OFL.txt`, `Noto-Sans-JP-OFL.txt`, `Noto-Serif-KR-OFL.txt`, and `Noto-Serif-JP-OFL.txt`: Google Inc. The official Noto CJK project publishes these web families under OFL 1.1; the Fontsource package metadata declares OFL-1.1 and includes the license text.

The Fontsource package CSS and WOFF2 subsets are version-pinned in `package-lock.json`. Their subset fonts are served locally and loaded through `src/data/fonts/load-fonts.ts`; no third-party font CDN is used.

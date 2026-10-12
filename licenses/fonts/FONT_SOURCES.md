# Font sources and web delivery

Every bundled font is under the SIL Open Font License 1.1. The unmodified license and copyright notice for each source is kept next to this file. Gmarket Sans also carries its original clause 6, which grants eBay Korea promotional use of production images made with the font unless the user explicitly rejects that use to the rightsholder. The four added font notices are shipped at `/fonts/NOTICE.txt`, with their full text at `/fonts/licenses/`. WOFF2 files are served with the app; the site does not contact Google Fonts at runtime.

## Latin families

| Family | Upstream source | Included subsets | Payload |
| --- | --- | --- | ---: |
| Cormorant Garamond Variable | [google/fonts `cormorantgaramond`](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) | Latin, Latin Extended, Vietnamese | 82,596 bytes |
| DM Sans Variable | [google/fonts `dmsans`](https://github.com/google/fonts/tree/main/ofl/dmsans) | Latin, Latin Extended | 55,160 bytes |
| Estonia | [Google Fonts upstream `estonia`](https://github.com/googlefonts/estonia) | Latin, Latin Extended, Vietnamese | 164,296 bytes |
| Bricolage Grotesque Variable | [Atelier Triay upstream](https://github.com/ateliertriay/bricolage) | Latin, Latin Extended, Vietnamese; weights 200–800 | 120,608 bytes |
| Valley Sans Variable | [Helsinki Type Studio upstream](https://github.com/HelsinkiTypeStudio/valley-sans) | Latin, Latin Extended; weights 100–900 | 66,500 bytes |

The Latin font files are declared locally and fetched only when text uses the corresponding family. The pre-existing Cormorant Garamond and DM Sans assets total 137,756 bytes; only normal style is included, with their variable weight axes retained.

## Korean and Latin family

| Family | Official source | Included faces | Payload |
| --- | --- | --- | ---: |
| Gmarket Sans | [Gmarket font page](https://corp.gmarket.com/fonts/) | Light 300, Medium 500, Bold 700; full Latin and Korean glyph coverage | 1,208,876 bytes |

The Gmarket Sans files are the WOFF2 faces served by Gmarket’s own site. The accompanying [license file](Gmarket-Sans-OFL.txt) preserves the complete English license embedded in the official TTF download, including its additional clause 6.

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
- `Estonia-OFL.txt`: Copyright 2010–2021 The Estonia Project Authors. The official upstream repository publishes the family under OFL 1.1.
- `Bricolage-Grotesque-OFL.txt`: Copyright 2022 The Bricolage Grotesque Project Authors. The author’s upstream repository publishes the family under OFL 1.1.
- `Valley-Sans-OFL.txt`: Copyright 2026 The Valley Sans Project Authors. The official Helsinki Type Studio repository publishes the family under OFL 1.1 and links to its Google Fonts release.
- `Gmarket-Sans-OFL.txt`: Copyright 2019 eBay Korea Co., Ltd., with Reserved Font Name `Gmarket Sans Font`. This is the complete English license embedded in Gmarket’s official TTF download; its additional clause 6 permits eBay Korea to use production images made with the font to promote the font unless the user rejects that use to the rightsholder.
- `Noto-Sans-KR-OFL.txt`, `Noto-Sans-JP-OFL.txt`, `Noto-Serif-KR-OFL.txt`, and `Noto-Serif-JP-OFL.txt`: Google Inc. The official Noto CJK project publishes these web families under OFL 1.1; the Fontsource package metadata declares OFL-1.1 and includes the license text.

The Fontsource package CSS and WOFF2 subsets are version-pinned in `package-lock.json`. Their subset fonts are served locally and loaded through `src/data/fonts/load-fonts.ts`; no third-party font CDN is used.

## Requested families not bundled

- **Gilland:** The user-linked mirror archive’s included license text and both OTF name tables identify Andreu Gallart Ruiviejo and permit personal/commercial use, but they do not grant web embedding or redistribution of the font files. The creator’s [Payhip listing](https://payhip.com/b/oWKb) offers a free ZIP without additional visible terms. Obtain explicit author permission for app embedding and bundling before adding it.
- **Heir of Light:** The [official font page](https://heiroflighteclipse.com2us.com/en?r=p1) permits personal/business use but forbids font redistribution and embedding in games or programs associated with games without written rightsholder consent. This FFXIV card program falls within that restriction, so the family is not bundled.

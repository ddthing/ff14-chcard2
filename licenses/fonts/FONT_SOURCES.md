# Font sources and web delivery

Bundled fonts use the licenses named in the registry: SIL OFL 1.1, CHAI Font License, Ownglyph Original Font License, KOGL Type 1, and the creator's specific Ok Dandan app-embedding permission. Copyright and license evidence is kept next to this file and shipped at `/fonts/NOTICE.txt` and `/fonts/licenses/`. Gmarket Sans retains its original clause 6 on promotional use of production images. CHAI, Ownglyph and OkFont also have promotional-image terms documented below and in their notices. Font files are served with the app; no external font CDN is contacted at runtime.

## 2026-10-13 additions

The [request-by-request review](../../docs/design/v3/REQUESTED_FONTS_2026-10-13.md) covers all 13 supplied sources. [The audit manifest](REQUESTED_FONT_AUDIT_2026-10-13.json) records the SHA-256, original file size and inspected coverage of all 34 added faces (30,899,628 bytes across 16 families).

| Families | Source | Delivery and conditions |
| --- | --- | --- |
| Pretendard / Pretendard JP | [orioncactus v1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9) | Original variable WOFF2, axes 45–930. OFL and RFNs retained. JP is offered for Korean, English and Japanese; the base face is offered for Korean and English. |
| MaruMinya Hangul | [quiple](https://quiple.dev/font/maruminya-hangul) | Original WOFF2, static 500. Korean, English and Japanese specimen coverage verified. OFL retained. |
| Mona 12 / Limgul 12 / Suhgung 12 / Tangba 12 / Umdot 12 | [Monad ABXY](https://monadabxy.com/fonts/) | Original 12px regular/bold WOFF2, CSS weights 400/700. All five OFLs and Mona's upstream notices are included. Mona supports the Japanese specimen; the other four have some missing Japanese common ideographs and are offered for Korean and English. |
| CHAI Hwaljjak / CHAI Rising | [CHAI](https://www.artistchai.co.kr/#/pride/identity_font) | Original official WOFF2 only; no conversion or subsetting. Hwaljjak 400/500/700/800, Rising 300/800. Complete policy permits bundling with software and forbids modifying the font files. It allows promotional/research use of produced images unless the user asks the publisher to exclude them. |
| Ownglyph Yeongrong / Park Dahyeon | [Ownglyph license](https://www.ownglyph.com/font) | Original official WOFF2, static 400. Explicit web/server embedding and font distribution permission, modification and font sale prohibited. Hangul counts are 2,350/2,780. The license includes promotional use of images made with the fonts. |
| Ok Dandan | [official font and creator reply](https://www.okticon.com/freefont/?bmode=view&idx=169969648) | Original `OkDanDan-Bold.ttf`, stored weight 500, unchanged. The creator's 2026-08-26 reply permits app inclusion for image/video creation. The permission does not authorize general standalone redistribution or conversion. |
| Seoul Hangang / Namsan / Alrim | [Seoul Metropolitan Government](https://www.seoul.go.kr/seoul/font.do) | The font copyright section displays KOGL Type 1. Source credit/link and full notice accompany the fonts. Only container compression to WOFF2 was performed, with all cmap entries, glyph order and horizontal metrics checked. L/M/B/EB are mapped to CSS 300/500/700/800 for Hangang/Namsan; their old OS/2 tables label every face 400, so the official style labels govern CSS matching. Alrim uses its native 500/700/800/900. |

**서울서체 출처표시:** 본 웹앱은 서울특별시가 공공누리 제1유형으로 개방한 서울서체(서울한강체·서울남산체·서울알림체)를 이용합니다. 원본은 [서울특별시 서울서체 페이지](https://www.seoul.go.kr/seoul/font.do)에서 무료로 받을 수 있습니다. 출처의 변경 허용 조건에 따라 글리프를 유지하며 웹 전송 컨테이너를 WOFF2로 압축했습니다. 서울특별시의 후원이나 제휴를 의미하지 않습니다.

The picker loads preview faces only as their rows become visible. Missing glyphs retain the existing Noto/script-specific fallback. Original format and derivative status are explicit in the audit manifest; no unreviewed font conversion is hidden behind a filename change.

KoPubWorld (separate server/app approval), Eulyoo1945 (embedding/redistribution ban), and Ok Mallang / Ownglyph Okticon / Ok SunnyNote (no confirmed app-file redistribution grant) were not bundled. See the request review for source links and exact scope.

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

# Phase 3.0.1 font candidate inventory

Status: QA-only inventory, recorded 2026-10-08. This document and the binaries under `docs/qa/phase301-card-type-job/fonts/` support the isolated typography experiment. No candidate has been selected, and no candidate font was added to `public/fonts`, the production font registry, or package dependencies.

The machine-readable inventory is [`font-manifest.json`](../qa/phase301-card-type-job/fonts/font-manifest.json). Each staged WOFF2 file has a relative source path, prepared-lab URL, script, exact source `unicode-range` where provided, byte size, SHA-256, and weight availability. Static faces carry one exact weight per file; variable faces carry their axis range. The manifest records physical name-table family, full name, PostScript name, typographic family, and glyph count per static file, separately from the QA CSS aliases; verified name tuples are summarized below.

## Candidate matrix

| Set | Latin | Korean | Japanese | Simplified Chinese | Traditional Chinese |
|---|---|---|---|---|---|
| S1 | Cormorant Garamond | Noto Serif KR | Noto Serif JP | Noto Serif SC | Noto Serif TC |
| S2 | Cormorant Garamond | Source Han Serif K (본명조) | Source Han Serif JP localized face | Source Han Serif SC | Source Han Serif TC |
| S3 | Cormorant Garamond | RIDIBatang | Shippori Mincho | Noto Serif SC | Noto Serif TC |
| S4 | Cormorant Garamond | Nanum Myeongjo | Zen Old Mincho | Noto Serif SC | Noto Serif TC |
| N1 | Pretendard | Pretendard | Pretendard JP | Noto Sans SC | Noto Sans TC |
| N2 | SUIT | SUIT | Noto Sans JP | Noto Sans SC | Noto Sans TC |
| M1 | DM Sans | Noto Sans KR | Noto Sans JP | Noto Sans SC | Noto Sans TC |
| M2 | Pretendard | Pretendard | Pretendard JP | Noto Sans SC | Noto Sans TC |
| M3 | SUIT | SUIT | Noto Sans JP | Noto Sans SC | Noto Sans TC |

N1/N2 are intended for the I3 sans-dominant typography comparison. M1/M2/M3 are metadata alternatives; the experiment keeps the display family fixed at S1 as its neutral anchor. These mappings follow the Phase 3.0.1 brief and are not a production recommendation.

## Files, identity, and licensing

| Stable ID | Actual CSS / internal family; representative PostScript name | Format and available weights | Provider, source, and license |
|---|---|---|---|
| `cormorant-garamond` | CSS: Cormorant Garamond Variable; name table sample: Cormorant Garamond Light / `CormorantGaramond-Light` | WOFF2 Latin, Latin-ext, Vietnamese subsets; variable 300–700 | Google Fonts Cormorant Garamond; SIL OFL 1.1, bundled `LICENSE.txt`. Reused only as the QA Latin anchor. [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) |
| `dm-sans` | CSS: DM Sans Variable; name table sample: DM Sans 9pt / `DMSans9pt-Regular` | WOFF2 Latin and Latin-ext subsets; variable 100–1000 | Google Fonts DM Sans; SIL OFL 1.1, bundled `LICENSE.txt`. [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/dmsans) |
| `noto-serif-kr`, `noto-serif-jp`, `noto-serif-sc`, `noto-serif-tc` | CSS families Noto Serif KR/JP/SC/TC Variable; representative name-table samples are the corresponding ExtraLight regional family and PostScript face | WOFF2 variable subsets; 200–900 | Google Fonts regional families, staged from Fontsource 5.3.0 packages; SIL OFL 1.1, each package `LICENSE` retained. [KR](https://github.com/google/fonts/tree/main/ofl/notoserifkr), [JP](https://github.com/google/fonts/tree/main/ofl/notoserifjp), [SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc), [TC](https://github.com/google/fonts/tree/main/ofl/notoseriftc) |
| `noto-sans-kr`, `noto-sans-jp`, `noto-sans-sc`, `noto-sans-tc` | CSS families Noto Sans KR/JP/SC/TC Variable; representative name-table samples are the corresponding Thin regional family and PostScript face | WOFF2 variable subsets; 100–900 | Google Fonts regional families, staged from Fontsource 5.3.0 packages; SIL OFL 1.1, each package `LICENSE` retained. [KR](https://github.com/google/fonts/tree/main/ofl/notosanskr), [JP](https://github.com/google/fonts/tree/main/ofl/notosansjp), [SC](https://github.com/google/fonts/tree/main/ofl/notosanssc), [TC](https://github.com/google/fonts/tree/main/ofl/notosanstc) |
| `source-han-serif-k` | Source Han Serif K VF / `SourceHanSerifKVF-ExtraLight` (本명조) | Official full localized WOFF2 variable face; 200–900 | Adobe Source Han Serif 2.003R; SIL OFL 1.1, Adobe `LICENSE.txt` copied beside each regional face. [Release](https://github.com/adobe-fonts/source-han-serif/releases/tag/2.003R), [regional family names](https://github.com/adobe-fonts/source-han-serif/blob/master/FontMenuNameDB) |
| `source-han-serif-jp` | Source Han Serif VF / `SourceHanSerifVF-ExtraLight` | Official Japanese localized WOFF2 variable face; 200–900 | Adobe Source Han Serif 2.003R; same license and release links as above. The official Japanese variable file is `SourceHanSerif-VF.woff2`; no guessed `JP` suffix is used. |
| `source-han-serif-sc` | Source Han Serif SC VF / `SourceHanSerifSCVF-ExtraLight` | Official simplified-Chinese WOFF2 variable face; 200–900 | Adobe Source Han Serif 2.003R; SIL OFL 1.1. |
| `source-han-serif-tc` | localized name-table family 思源宋體 VF / `SourceHanSerifTCVF-ExtraLight` | Official traditional-Chinese WOFF2 variable face; 200–900 | Adobe Source Han Serif 2.003R; SIL OFL 1.1. |
| `ridi-batang` | Noonnu CSS name Ridibatang; name-table family ID 1 is absent; PostScript name `RIDIBatang` | WOFF2 static 400; original WOFF retained as conversion provenance | RIDI Corporation, delivered by Noonnu. The page permits embedding and redistribution with copyright/license notice and prohibits standalone font sale. The staged WOFF2 is a format-only FontTools 4.66.1 conversion of the original Noonnu WOFF; both hashes are in the manifest. [RIDI license/source](https://ridicorp.com/ridibatang/), [Noonnu package page](https://noonnu.cc/en/font_page/324) |
| `shippori-mincho` | Shippori Mincho / `ShipporiMincho-Regular` (400 sample) | WOFF2 Japanese shards; static 400, 500, 600, 700, 800 | Google Fonts / Fontsource 5.3.0; SIL OFL 1.1, package license retained. Per-shard Unicode ranges are from upstream CSS. [Google Fonts metadata](https://github.com/google/fonts/tree/main/ofl/shipporimincho), [upstream project](https://github.com/fontdasu/ShipporiMincho) |
| `nanum-myeongjo` | CSS: Nanum Myeongjo; name-table family `NanumMyeongjo` (400 sample) | WOFF2 Korean shards; static 400, 700, 800 | Naver / Google Fonts / Fontsource 5.3.0; bundled license files retained. Naver permits commercial use and redistribution subject to its notice and standalone-sale terms. [Naver license](https://help.naver.com/service/30016/contents/18088?lang=ko&osType=PC), [Google Fonts metadata](https://github.com/google/fonts/tree/main/ofl/nanummyeongjo) |
| `zen-old-mincho` | Zen Old Mincho / `ZenOldMincho-Regular` (400 sample) | WOFF2 Japanese shards; static 400, 500, 600, 700, 900 | Google Fonts / Fontsource 5.3.0; SIL OFL 1.1, package license retained. Per-shard Unicode ranges are from upstream CSS. [Google Fonts metadata](https://github.com/google/fonts/tree/main/ofl/zenoldmincho), [upstream project](https://github.com/googlefonts/zen-oldmincho) |
| `pretendard` | Pretendard Variable / `PretendardVariable-Regular` | Official full variable WOFF2; 45–920 | Orion Cactus, release v1.3.9; SIL OFL 1.1, bundled license retained. [Official release and source](https://github.com/orioncactus/pretendard/releases/tag/v1.3.9), [package documentation](https://github.com/orioncactus/pretendard/tree/main/packages/pretendard) |
| `pretendard-jp` | Pretendard JP Variable / `PretendardJPVariable-Regular` | Separate official Japanese variable WOFF2 package; 45–920 | Orion Cactus, release v1.3.9; SIL OFL 1.1, bundled license retained. The JP font is a real separate package, not a label for the generic Pretendard file. [Official source](https://github.com/orioncactus/pretendard), [author coverage discussion](https://github.com/orioncactus/pretendard/discussions/86) |
| `suit` | Noonnu CSS family Suit; name-table family SUIT; representative PostScript `SUIT-Regular` | Nine separate WOFF2 files, exact static weights 100–900 by 100 | SUNN YOUN via Noonnu; official SUNN SIL OFL 1.1 `LICENSE.txt` included. Noonnu confirms commercial/web embedding and redistribution under OFL. [Noonnu page](https://noonnu.cc/font_page/845), [official license](https://github.com/sun-typeface/SUIT/blob/main/LICENSE), [official project](https://github.com/sun-typeface/SUIT) |

## Verified static name tables

FontTools 4.66.1 read every manifest-linked static WOFF2 file: 1,506 unique files across RIDIBatang, Shippori Mincho, Nanum Myeongjo, Zen Old Mincho, and SUIT. Each shard within a family/weight had the same name ID 1, 4, and 6 values shown here. The manifest also records the name ID 16 typographic family, actual glyph count, and a per-weight shard count.

| Family | Weight | Name ID 1: family | Name ID 4: full name | Name ID 6: PostScript | WOFF2 shards |
|---|---:|---|---|---|---:|
| RIDIBatang | 400 | unavailable | unavailable | `RIDIBatang` | 1 |
| Shippori Mincho | 400 | `Shippori Mincho` | `Shippori Mincho Regular` | `ShipporiMincho-Regular` | 122 |
| Shippori Mincho | 500 | `Shippori Mincho Medium` | `Shippori Mincho Medium` | `ShipporiMincho-Medium` | 122 |
| Shippori Mincho | 600 | `Shippori Mincho SemiBold` | `Shippori Mincho SemiBold` | `ShipporiMincho-SemiBold` | 122 |
| Shippori Mincho | 700 | `Shippori Mincho` | `Shippori Mincho Bold` | `ShipporiMincho-Bold` | 122 |
| Shippori Mincho | 800 | `Shippori Mincho ExtraBold` | `Shippori Mincho ExtraBold` | `ShipporiMincho-ExtraBold` | 122 |
| Nanum Myeongjo | 400 | `NanumMyeongjo` | `NanumMyeongjo` | `NanumMyeongjo` | 92 |
| Nanum Myeongjo | 700 | `NanumMyeongjo` | `NanumMyeongjoBold` | `NanumMyeongjoBold` | 92 |
| Nanum Myeongjo | 800 | `NanumMyeongjoExtraBold` | `NanumMyeongjoExtraBold` | `NanumMyeongjoExtraBold` | 92 |
| Zen Old Mincho | 400 | `Zen Old Mincho` | `Zen Old Mincho Regular` | `ZenOldMincho-Regular` | 122 |
| Zen Old Mincho | 500 | `Zen Old Mincho Medium` | `Zen Old Mincho Medium` | `ZenOldMincho-Medium` | 122 |
| Zen Old Mincho | 600 | `Zen Old Mincho SemiBold` | `Zen Old Mincho SemiBold` | `ZenOldMincho-SemiBold` | 122 |
| Zen Old Mincho | 700 | `Zen Old Mincho` | `Zen Old Mincho Bold` | `ZenOldMincho-Bold` | 122 |
| Zen Old Mincho | 900 | `Zen Old Mincho Black` | `Zen Old Mincho Black` | `ZenOldMincho-Black` | 122 |
| SUIT | 100 | `SUIT Thin` | `SUIT Thin` | `SUIT-Thin` | 1 |
| SUIT | 200 | `SUIT ExtraLight` | `SUIT ExtraLight` | `SUIT-ExtraLight` | 1 |
| SUIT | 300 | `SUIT Light` | `SUIT Light` | `SUIT-Light` | 1 |
| SUIT | 400 | `SUIT` | `SUIT Regular` | `SUIT-Regular` | 1 |
| SUIT | 500 | `SUIT Medium` | `SUIT Medium` | `SUIT-Medium` | 1 |
| SUIT | 600 | `SUIT SemiBold` | `SUIT SemiBold` | `SUIT-SemiBold` | 1 |
| SUIT | 700 | `SUIT` | `SUIT Bold` | `SUIT-Bold` | 1 |
| SUIT | 800 | `SUIT ExtraBold` | `SUIT ExtraBold` | `SUIT-ExtraBold` | 1 |
| SUIT | 900 | `SUIT Heavy` | `SUIT Heavy` | `SUIT-Heavy` | 1 |
Adobe 2.003R release notes warn that CFF2 variable-font rendering may corrupt on Windows 10 builds before 19045.3758 and Windows 11 builds before 22621.2506/22631.2506; Adobe recommends TTF variable faces on affected systems. The staged Source Han files are the official CFF2 WOFF2 faces, so the actual browser host needs visual and export verification against that release warning. [Adobe 2.003R release notes](https://github.com/adobe-fonts/source-han-serif/releases/tag/2.003R)

The Noto, Nanum, Shippori, and Zen packages preserve the upstream per-file Unicode ranges for the script shards used in this experiment. Latin-only files for those CJK candidates are excluded from their role aliases because Cormorant, DM Sans, Pretendard, or SUIT is the selected Latin family for the relevant set.

## Script aliases and coverage notes

- `font-manifest.json` gives Pretendard and SUIT separate Latin-only and Hangul-only aliases even though the physical WOFF2 files contain wider glyph coverage. They have no Simplified or Traditional Chinese aliases, so the exact Noto SC/TC faces receive those roles. Pretendard JP is mapped only to Japanese.
- Source Han's four files use the official localized K, JP, SC, and TC identities. Each has a script-scoped alias; the Japanese filename is the upstream `SourceHanSerif-VF.woff2`, while the TC name table is localized as `思源宋體 VF`.
- RIDIBatang is a Korean serif face, not a Japanese or Chinese fallback. The FontTools specimen audit found 12,432 glyphs and no U+30FC or U+5149. Preserve these as coverage gaps for the actual-face QA; do not infer fallback from CSS family declarations.
- Static faces are reported at the exact available weight. Variable faces expose their verified axis ranges. The lab requests role weights without synthetic bold and records the physical face/weight separately.
- Required probe strings remain `Coner`, `코너`, `コナー`, `光`, `Coner 光`, `Coner 코너`, and `コナー Coner`. Manifest ranges describe declared faces; the Phase 3.0.1 CDP/platform-font QA must still prove actual glyph selection and detect system fallback per rendered text run.

## Retrieval, conversion, and scope

All renderer-eligible font binaries are WOFF2 for local browser preview and export. The only conversion is RIDIBatang's Noonnu WOFF to WOFF2, performed in the QA asset directory with FontTools 4.66.1. The original WOFF is retained only as conversion provenance and is excluded from the renderer manifest; both original and converted SHA-256 values are recorded. The package assets are not production preload candidates; remove this QA directory after evidence review if the experiment is no longer needed.
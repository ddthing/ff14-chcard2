# FFXIV job icon sources

## XIVAPI source pin and inventory

The reviewed provider is [xivapi/classjob-icons](https://github.com/xivapi/classjob-icons), pinned to commit [`766cb47831435a83f04d904146bd3472501564c5`](https://github.com/xivapi/classjob-icons/tree/766cb47831435a83f04d904146bd3472501564c5). The source tree was inspected through GitHub's repository and recursive tree APIs on 2026-10-07 (Asia/Seoul). Sync downloads only the canonical allowlist in [`sync-xivapi-job-icons.mjs`](../../tools/sync-xivapi-job-icons.mjs); it does not copy the full upstream repository.

The current registry has 34 entries: the 33 jobs already represented in the Fan Kit source manifest plus Beastmaster. At this pinned revision, upstream coverage is:

| Upstream folder | Coverage | Native files inspected | Notes |
| --- | ---: | --- | --- |
| `svg/` | 33 / 34 | 33 SVGs, 1000×1000 viewBox | `class_job_*.svg` is mapped to the canonical job IDs recorded in the audit. |
| `icons/` | 33 / 34 | 33 PNGs, 256×256 | Plain silver/gold class and job marks. |
| `companion/` | 33 / 34 | 29 PNGs at 192×192; 4 at 96×96 | Includes source aliases such as `pct.png` and `vpr.png`. |
| `risingstones/` | 31 / 34 | 20 PNGs at 512×512; 11 at 64×64 | The 64px sources are the craft and gather marks. Pictomancer and Viper are absent. |

Beastmaster is absent from all four folders. No source was invented for it. The complete per-job list of upstream paths, availability, native dimensions, local SHA-256 values, and Git blob hashes is in [`source-audit.json`](../qa/phase216-job-icons/source-audit.json). All 130 allowlisted candidates are preserved under `docs/qa/phase216-job-icons/upstream/` for reproducible comparison; these candidates are outside `public/`.

## Comparison and adoption

The existing Fan Kit source is the user-supplied 76×76 PNG. The comparison uses its current runtime mask as the shape reference. [`compare-xivapi-job-icons.mjs`](../../tools/compare-xivapi-job-icons.mjs) creates white-alpha renderings for the monochrome SVG and `icons/` candidates so the glyphs can be compared in the same ink. The SVG files themselves remain byte-identical to upstream. Their original black fill works as an alpha mask with `currentColor`; the mask treatment does not redraw or reshape a path.

The 512px shape metrics use the visible alpha bounding box at threshold 128 after each source has been rendered into the same 512×512 canvas. The audit records raw overlap, overlap after uniform bounding-box alignment, source dimensions, and measured scale/offset. Faint pixels outside the visible glyph are recorded separately and are not used to fit the icon. Alignment is comparison evidence; it does not alter source bytes.

The expanded size board reviews all 33 source-backed registry IDs at 32, 64, 128, 256, and 512px. Beastmaster appears as an explicit missing-source row. The detail boards include full 512px renders and 200%/400% crops. The 0.85 aligned silhouette IoU cutoff is a review aid used together with the visual boards; it does not automatically approve a source.

Sixteen monochrome SVGs passed the per-job shape review. Their measured transforms preserve the visible Fan Kit mask bounds:

| Job | Aligned IoU | `visualScale` | `opticalOffsetX` | `opticalOffsetY` |
| --- | ---: | ---: | ---: | ---: |
| Paladin | 0.904 | 0.835 | 0.0010 | 0.0068 |
| Warrior | 0.932 | 0.842 | 0.0010 | 0.0020 |
| Gunbreaker | 0.911 | 0.770 | 0.0046 | -0.0049 |
| White Mage | 0.916 | 0.839 | 0.0010 | 0.0010 |
| Scholar | 0.931 | 0.838 | 0.0010 | 0.0012 |
| Sage | 0.894 | 0.795 | 0.0127 | 0.0126 |
| Monk | 0.931 | 0.836 | 0.0010 | 0.0091 |
| Dragoon | 0.881 | 0.832 | 0.0010 | 0.0231 |
| Samurai | 0.880 | 0.749 | 0.0088 | 0.0059 |
| Bard | 0.895 | 0.839 | 0.0029 | 0.0101 |
| Machinist | 0.896 | 0.837 | 0.0088 | -0.0049 |
| Dancer | 0.904 | 0.786 | 0.0064 | 0.0036 |
| Black Mage | 0.882 | 0.833 | 0.0010 | 0.0068 |
| Summoner | 0.903 | 0.829 | 0.0264 | 0.0035 |
| Red Mage | 0.874 | 0.783 | -0.0479 | 0.0070 |
| Blue Mage | 0.917 | 0.740 | 0.0010 | 0.0205 |

Offsets are fractions of the square icon box. The compact [`xivapi-job-icon-manifest.json`](../../src/lib/ffxiv-assets/xivapi-job-icon-manifest.json) stores these values on each approved source. The SVGs are monochrome mask sources; template `currentColor` supplies the ink. All 16 are approved for picker, micro, cardSmall, cardMedium, cardDisplay, and export. The template-owned large Editorial typography remains unchanged.

The native 512px Rising Stones combat PNGs have clean antialiased edges at 512px and no visible halo in the detail boards. They still contain the full framed, colored tile artwork. Using their alpha as a tinted glyph mask would tint the frame/background into a square, so they were not selected for the shared glyph resolver. The 11 Rising Stones 64px files cannot improve the supplied 76px sources. Companion images likewise preserve framed app artwork at 192px or 96px. The plain 256px `icons/` images are the only inspected raster sources with isolated mark alpha.

Four plain `icons/` PNGs passed as small/medium sources. Reaper, Viper, and Pictomancer use the raster source because it matches the Fan Kit silhouette more closely than their SVG candidate. Summoner keeps SVG as primary and the PNG as a small/medium load-failure fallback. These sources retain their original source color for original-appearance display and use their alpha as a mask for tinted marks.

| Job | Raster role | Aligned IoU | `visualScale` |
| --- | --- | ---: | ---: |
| Reaper | Primary, small/medium | 0.889 | 0.563 |
| Viper | Primary, small/medium | 0.858 | 0.548 |
| Pictomancer | Primary, small/medium | 0.857 | 0.557 |
| Summoner | SVG fallback, small/medium | 0.861 | 0.650 |

These 256px PNGs are not approved for `cardDisplay`. Their optical metadata is recorded per source in the runtime manifest.

Fourteen jobs retain Fan Kit because neither the SVG nor plain raster passed the visible-shape review. The scores below are SVG/raster IoU after the same 512px bounding-box alignment; the per-job review file records the source-specific reason.

| Job | SVG | Raster |
| --- | ---: | ---: |
| Dark Knight | 0.621 | 0.628 |
| Astrologian | 0.717 | 0.691 |
| Ninja | 0.676 | 0.696 |
| Carpenter | 0.825 | 0.754 |
| Blacksmith | 0.794 | 0.748 |
| Armorer | 0.695 | 0.666 |
| Goldsmith | 0.675 | 0.592 |
| Leatherworker | 0.687 | 0.638 |
| Weaver | 0.531 | 0.563 |
| Alchemist | 0.735 | 0.670 |
| Culinarian | 0.831 | 0.813 |
| Miner | 0.744 | 0.641 |
| Botanist | 0.512 | 0.573 |
| Fisher | 0.734 | 0.705 |

The Companion and Rising Stones candidates preserve their framed/background artwork. They are retained in the QA capture but are not used as tinted glyph masks. The runtime manifest contains all 34 IDs and only the 20 approved local source objects: 16 SVGs and 4 `icons/` PNGs. The review log records a decision for every registry ID; Beastmaster uses the existing generic fallback because it has no upstream source. The feature flag remains opt-in.

## Local serving, checksums, and use terms

Approved production files are served locally from `public/assets/ffxiv/jobs/xivapi/svg/` and `.../icons/`. Runtime code does not request GitHub or XIVAPI URLs. Comparison-only copies remain under `docs/qa/phase216-job-icons/upstream/`, and original Fan Kit PNGs and the current fallback path are preserved.

The repository API reports an MIT license for `xivapi/classjob-icons`. That declaration applies to the repository's code and does not turn FINAL FANTASY XIV artwork into MIT-licensed artwork. The underlying game graphics remain Square Enix material. This project is an unofficial fan project; retain its existing `© SQUARE ENIX` notice and apply the relevant regional materials terms to any public hosting or exported-card distribution. This source record is attribution, not a rights determination.

Re-run the pinned asset workflow from the repository root with:

```sh
node tools/sync-xivapi-job-icons.mjs --sync
node tools/compare-xivapi-job-icons.mjs
node tools/sync-xivapi-job-icons.mjs --publish
node tools/sync-xivapi-job-icons.mjs --check
```

`--publish` copies only entries approved in [`review-decisions.json`](../qa/phase216-job-icons/review-decisions.json). `--check` verifies every retained source candidate and every published SVG or raster against SHA-256, upstream Git blob SHA, and dimensions.

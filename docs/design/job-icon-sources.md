# FFXIV job icon sources

## Current runtime policy (2026-10-08)

Runtime icons now use only locally pinned XIVAPI originals: 16 reviewed 1000×1000 SVGs and 18 reviewed 256×256 `icons/` PNGs cover all 33 upstream-backed jobs. The raw PNGs are used directly; the browser may read their original alpha for tinting, and the build does not create separate mask files. PNG approval is limited to picker, micro, cardSmall, cardMedium, and export; `cardDisplay` requires an approved SVG. Unsupported jobs and failed sources use the app's generic text or role mark.

The following 2026-10-07 review records the previous comparison against manually derived 76px Fan Kit masks. Keep it as historical evidence only; the generated mask and SDF PNG assets were removed from the runtime tree and all audited asset copies on 2026-10-08. Comparison records remain available as historical evidence.

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

For the 2026-10-07 comparison, the 76×76 Fan Kit PNG was the shape baseline and its then-current runtime mask was used for measurement. The historical [`compare-xivapi-job-icons.mjs`](../../tools/compare-xivapi-job-icons.mjs) created white-alpha renderings for the monochrome SVG and `icons/` candidates. That comparison tool is retired; its existing boards and metrics remain as historical evidence. The SVG files remain byte-identical to upstream. Their original black fill can be used as an alpha mask with `currentColor`; no path is redrawn.

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

In the 2026-10-07 review, four plain `icons/` PNGs passed as small/medium sources. Reaper, Viper, and Pictomancer were selected because their PNGs matched the Fan Kit silhouette more closely than their SVG candidates; Summoner's PNG was a small/medium SVG load-failure fallback. These source PNGs retain their original color for source appearance and can use their own alpha for tinted marks.

| Job | Raster role | Aligned IoU | `visualScale` |
| --- | --- | ---: | ---: |
| Reaper | Primary, small/medium | 0.889 | 0.563 |
| Viper | Primary, small/medium | 0.858 | 0.548 |
| Pictomancer | Primary, small/medium | 0.857 | 0.557 |
| Summoner | SVG fallback, small/medium | 0.861 | 0.650 |

These 256px PNGs are not approved for `cardDisplay`. Their optical metadata is recorded per source in the runtime manifest.

The historical Fan Kit silhouette gate rejected the following 14 jobs' SVG and raster candidates. Under the current runtime policy above, these jobs now use their original XIVAPI 256px `icons/` PNGs for approved small and medium usages; the older scores remain here only to record the 2026-10-07 comparison result. They do not imply a current Fan Kit fallback.

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

The Companion and Rising Stones candidates preserve their framed/background artwork. They are retained in the QA capture but are not used as tinted glyph masks. At the time of this historical review, the runtime manifest contained all 34 IDs and 20 approved local source objects: 16 SVGs and 4 `icons/` PNGs. The review log records a decision for every registry ID; Beastmaster had the generic fallback because it has no upstream source. The feature flag remained opt-in.

## Local serving, checksums, and use terms

Approved production files are served locally from `public/assets/ffxiv/jobs/xivapi/svg/` and `.../icons/`. Runtime code does not request GitHub or XIVAPI URLs and does not load Fan Kit fallback images. Comparison-only copies remain under `docs/qa/phase216-job-icons/upstream/`; original Fan Kit PNGs remain as preserved source copies. No generated job-mask or SDF PNG files remain in the runtime or archived build-output asset trees.

The repository API reports an MIT license for `xivapi/classjob-icons`. That declaration applies to the repository's code and does not turn FINAL FANTASY XIV artwork into MIT-licensed artwork. The underlying game graphics remain Square Enix material. This project is an unofficial fan project; retain its existing `© SQUARE ENIX` notice and apply the relevant regional materials terms to any public hosting or exported-card distribution. This source record is attribution, not a rights determination.

The active pinned-source workflow is:

```sh
node tools/sync-xivapi-job-icons.mjs --sync
node tools/sync-xivapi-job-icons.mjs --publish
node tools/sync-xivapi-job-icons.mjs --check
```

`--sync` refreshes the pinned comparison sources under `docs/qa/phase216-job-icons/upstream/`. Review approvals in the runtime XIVAPI manifest; `--publish` republishes only its verified, usage-approved original sources. `--check` verifies retained source candidates and published SVG/PNG files against SHA-256, upstream Git blob SHA, and dimensions. The former mask-based compare command is retired and fails closed.

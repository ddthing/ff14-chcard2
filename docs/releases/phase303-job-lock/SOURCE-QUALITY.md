# Phase 3.0.3 source-quality and export-scale audit

Read-only audit for the production Job Identity lock, recorded 2026-10-08. This note derives source-resolution envelopes from the checked-in export code and source manifests. It does not change renderer code or select a glyph/container design. Pixel ceilings below are **native-sampling bounds**, not visual acceptance results; only produced exports can establish edge quality.

## Actual production raster scale

`getCardExportSize()` starts from the canonical base output size, limits the requested scale by `22,000,000` pixels and `8,192` pixels on the longest edge, floors output width, then floors height from the logical card dimensions. `renderCardBlob()` passes `size.width / logical.width` to the rasterizer. So a requested filename scale such as 4× can be capped. The 1:1 4× case is the exception: 4,320² is 18,662,400 pixels and remains uncapped. The other four 4× ratios hit the pixel budget; none reaches the edge cap.

| Ratio | Logical layout | 1× output (px/logical) | 2× output (px/logical) | Requested 4× actual output (px/logical) |
|---|---:|---:|---:|---:|
| 1:1 | 432×432 | 1080×1080 (2.5) | 2160×2160 (5) | 4320×4320 (10; actual scale 4, uncapped) |
| 4:5 | 432×540 | 1080×1350 (2.5) | 2160×2700 (5) | 4195×5243 (9.710648× / 9.709259y; actual scale 3.884259) |
| 3:4 | 432×576 | 1080×1440 (2.5) | 2160×2880 (5) | 4062×5416 (9.402778; actual scale 3.761111) |
| 9:16 | 432×768 | 1080×1920 (2.5) | 2160×3840 (5) | 3517×6252 (8.141204× / 8.140625y; actual scale 3.256481) |
| 16:9 | 640×360 | 1920×1080 (3) | 3840×2160 (6) | 6253×3517 (9.770313× / 9.769444y; actual scale 3.256771) |

Capped output `px/logical` is `actual output width / logical width` (and height similarly after integer flooring), not simply the requested `1/2/4` multiplier.

## Source-safe glyph envelope

For a square raster glyph box displayed at `p` output pixels per logical pixel, the strict no-upsample size is `native source side / p`. This compares the image box itself; it does not include the family container, border, padding, or label. A larger Job block can therefore create presence while the emblem stays within its source envelope.

| Export | Worst output density across ratios | Fan Kit 76px no-upsample glyph box | HQ raster 256px no-upsample glyph box |
|---|---:|---:|---:|
| 1× | 3px/logical (16:9) | 25.333 logical px | 85.333 logical px |
| 2× | 6px/logical (16:9) | 12.667 logical px | 42.667 logical px |
| 4× | 10px/logical (1:1) | 7.6 logical px | 25.6 logical px |

At 4×, the per-ratio Fan Kit ceilings are 7.6px (1:1), 7.8265px (4:5), 8.0827px (3:4), 9.3352px (9:16), and 7.7787px (16:9). A single fixed logical glyph box of **7.6px** is the conservative no-upsample bound across every ratio. If the block uses `cqi`, that fixed logical size corresponds to about 1.759cqi on a 432px-wide layout and 1.188cqi on the 640px-wide 16:9 layout; one shared cqi value would change the actual logical glyph size between portrait and landscape.

The cap applies to the effective painted source image box. `JobIcon` already applies resolver `visualScale` and optical offsets to the image/mask. Those existing values can make a raster's final painted box smaller than its layout slot; verify the actual transformed bounds in the produced 4× export before using that as extra resolution headroom. Do not enlarge the outer family container to satisfy a glyph-resolution target. For a common all-source slot, Fan Kit remains the limiting tier because its current resolver scale is 1.0.

The prior Phase 3.0.2 sweep tested Astrologian at 4:5 and 2× only. There, 15.2 logical px maps to exactly 76 output px; the 16px and 18px probes exceed that source grid and softened slightly. That is useful evidence for the tested condition, not a 4× production-safe size. At 4× 1:1, 15.2 logical px maps to 152 output px, twice the Fan Kit source side. The no-upsample bound still requires real export-edge review; it is not itself a visual quality pass.

## Current source classes and resolver behavior

The registry contains 34 job IDs and these usable source tiers:

| Tier / primary route at `cardSmall` or `cardMedium` | Count | IDs |
|---|---:|---|
| Verified SVG, 1000×1000 viewBox | 16 | Paladin, Warrior, Gunbreaker, White Mage, Scholar, Sage, Monk, Dragoon, Samurai, Bard, Machinist, Dancer, Black Mage, Summoner, Red Mage, Blue Mage |
| HQ raster-only primary, 256×256 | 3 | Pictomancer, Reaper, Viper |
| Fan Kit-only primary, 76×76 | 14 | Dark Knight, Astrologian, Ninja, Carpenter, Blacksmith, Armorer, Goldsmith, Leatherworker, Weaver, Alchemist, Culinarian, Miner, Botanist, Fisher |
| Generic fallback only | 1 | Beastmaster |

Summoner also has a 256×256 raster fallback behind its SVG. The resolver therefore has four distinct HQ raster files across three raster-only jobs plus that Summoner backup. All 33 Fan Kit job assets are present as a fallback tier for all other jobs. Beastmaster has no bitmap/vector emblem and uses the existing role mark (`L` at small/medium); the full Job name and abbreviation carry its semantics.

`resolveJobIcon()` prefers a verified SVG, then (except for `cardDisplay`) a verified raster, then Fan Kit. `cardDisplay` returns `null` before the raster/Fan Kit branches. The new printed emblems must therefore use `cardSmall` or `cardMedium`; using `cardDisplay` would silently turn 18 non-SVG jobs into text fallback even though small/medium assets exist. The current icon image/mask uses `object-fit: contain` / `mask-size: contain`; clipping risks arise in its parent Job placement, not the base icon box.

## Existing normalization and bound evidence

Phase 3.0.2's [`jobmark-optics.json`](../phase302-jobmark-correction/qa-source/jobmark-optics.json) is QA-only. It uses exact SVG Bézier extrema for vector paths and `alpha >= 128` raster/mask bounds, while checking all-alpha bounds against a 4% safety inset. Its target visible maximum fraction `0.592105` comes from the Astrologian Fan Kit mask's 45/76 visible width; it preserves the original visible center and does not alter source paths.

The audited cases were only eight jobs: RDM, DRG, GNB, WHM, BLM, AST, RPR, and BST. Five included direct SVG path bounds; AST was Fan Kit, RPR was the 256px raster, and BST was text fallback. The checked-in resolver contains reviewed `visualScale` and offsets for 16 SVGs (scale range 0.74045–0.84163; offsets X −0.04785…+0.02637, Y −0.00488…+0.02309). The four 256px raster entries also have transforms: PCT 0.5570, RPR 0.5626, VPR 0.5479, and SMN fallback 0.6500. These transforms are applied in `JobIcon`; they should be applied once, not multiplied by a second Phase 3.0.2 QA normalization. The Phase 3.0.2 per-job bounds record does not cover all 16 SVGs or every raster fallback.

A read-only alpha-box scan of the 33 checked-in Fan Kit masks confirms that identical 76×76 canvases do not give identical visible ink. At `alpha >= 128`, AST is 45×38px (59.2%×50%) as previously recorded; WHM is only 22px wide (28.9%), SCH 48×26px (63.2%×34.2%), CUL 46×22px (60.5%×28.9%), and Goldsmith 48×28px (63.2%×36.8%). Miner has the lowest thresholded alpha occupancy at 4.88%; this occupancy is a pixel count, not a glyph-quality score. A shared slot can keep the source sampling consistent, but per-job visualBounds/optical data are still needed to judge compact and sparse marks. AST must not stand in for every Fan Kit job.

## Coverage gap and source-upgrade debt

Phase 3.0.2 visually tested eight of the 34 registry jobs, leaving these 26 outside its source/placement screenshots: SVG jobs Paladin, Warrior, Scholar, Sage, Monk, Samurai, Bard, Machinist, Dancer, Summoner, and Blue Mage; raster-first Pictomancer and Viper; and Fan Kit-only Dark Knight, Ninja, Carpenter, Blacksmith, Armorer, Goldsmith, Leatherworker, Weaver, Alchemist, Culinarian, Miner, Botanist, and Fisher. Reaper's raster was tested, but the other raster files are not equivalent artwork; Summoner's fallback raster needs an error/failure-path check. The requested eight-job Phase 3.0.3 matrix covers source categories, not every silhouette or mask defect.

Phase 2.7.1 records 33 user-provided Fan Kit originals and 33 derived masks, all 76×76. The source archive name/version and download date were not supplied, and hosted redistribution/export permission scope was not independently approved in that QA record. Keep that as source provenance/update debt. Fan Kit's native size is the binding common source if every Job must keep one glyph slot at 1×/2×/4×; higher-resolution SVG/HQ assets do not raise the Fan Kit tier's sampling ceiling. If a 7.6px 4× common glyph slot is not identifiable, preserve full Job identity through the container, family material, full localized Job name, and abbreviation. The Phase 3.0.3 contract explicitly prefers that treatment over enlarging a 76px source; a more detailed official vector/high-resolution Fan Kit asset remains the appropriate upgrade debt.

A quality pass still requires actual 1×/2×/4× PNG captures at every ratio and source class. The calculations here establish the output sizes and a no-upsample bound; they do not assert that a specific production glyph size has passed final visual review.

## Source files checked

- `src/lib/card-export/index.ts` — base output sizes, logical sizes, pixel/edge caps, and DOM rasterizer scale.
- `src/lib/ffxiv-assets/job-icon-resolver.ts`, `xivapi-job-icon-manifest.json`, `job-icon-manifest.json` — source order, usage gate, dimensions, and per-source visual transforms.
- `src/components/ffxiv/job-icon.tsx` and `job-icon.module.css` — contain fitting and single transform application.
- `src/data/ffxiv/jobs.ts` — 34 registered Job IDs.
- `docs/qa/phase302-jobmark-correction/qa-source/jobmark-optics.json` and `REPORT.md` — prior eight-job bounds, normalization, and size-sweep scope.
- `docs/qa/phase271-icons/README.md` — Fan Kit source and prior source-provenance limitation.
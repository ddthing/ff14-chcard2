# FFXIV job icon assets

## Runtime source policy

Runtime job marks come only from the locally pinned [xivapi/classjob-icons](https://github.com/xivapi/classjob-icons) revision `766cb47831435a83f04d904146bd3472501564c5`. The manifest has 34 canonical jobs: 16 reviewed SVGs and 18 reviewed 256×256 `icons/` PNGs cover all 33 jobs present upstream; Beastmaster has no upstream source.

The resolver accepts local files under `public/assets/ffxiv/jobs/xivapi/svg/` or `.../icons/`, verifies the source and usage metadata, and never falls back to a Fan Kit image or a generated file. A source PNG's own alpha channel can be used directly for a tinted presentation; no separate mask PNG is created. Approved SVGs remain first choice. As of 2026-10-12, checksum-verified 256px raster originals are also approved for `cardDisplay` through explicit manifest usage metadata, in addition to picker, micro, small/medium marks, and export. Unsupported, failed, or unavailable assets fall back to the app's text or role mark.

Picker-only optical scaling fits the visible alpha's longest edge to 18px within a 20px frame. Card and export optical scales stay unchanged; source pixels are not cropped or regenerated.

`NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED` is embedded at build time. The site's `npm run build` / `build:cloudflare` release wrapper explicitly opts in to the reviewed local originals, passing `true` to both Next.js and packaging when the process environment does not specify a value. An explicit process value of `false` disables them. Direct Next invocations retain the default `false`. Required notices and the source-policy records below remain applicable.

## Preserved Fan Kit originals

Original files remain byte-preserved under `vendor/ffxiv-fankit/class-job-icons/`, with their 76×76 public copies under `public/assets/ffxiv/jobs/official/`. The source-only inventory is [`fan-kit-source-manifest.json`](../src/lib/ffxiv-assets/fan-kit-source-manifest.json). These originals are retained for source history and attribution; the app does not load them.

Verify those preserved copies with:

```sh
node tools/check-fankit-source-copies.mjs --check
```

`tools/import-ffxiv-job-icons.mjs` is a retired-command notice. It no longer writes files. The previous importer and derived-asset lab sources are recoverable under `.asset-archive/job-icon-derived/`.

## Historical evidence and rights

The previous mask review files remain in `docs/ffxiv-assets/` and the prior source comparisons remain in `docs/qa/phase216-job-icons/`. They record the historical Fan Kit comparison baseline and are not runtime inputs. The old SDF candidate and generated masks were moved out of `public/` to `.asset-archive/job-icon-derived/`.

The upstream repository's MIT declaration applies to code, not FINAL FANTASY XIV artwork. Artwork remains Square Enix material and is subject to the applicable regional Fan Kit and materials terms. The North American, Korean, European, and Japanese policies are region-specific and are not interchangeable. Keep the project's required notices and confirm that the intended hosting and exported-card distribution fit the relevant terms before publication; this document does not make a legal determination.

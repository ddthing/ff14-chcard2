# FINAL FANTASY XIV Fan Kit source files

This directory preserves the 45 user-supplied, extracted PNG originals from
the Fan Kit **Class & Job Icons** collection. The individual source files
remain unchanged. Intake provenance and missing package metadata are recorded
in [`SOURCE.md`](SOURCE.md).

The official [North American Fan Kit page](https://na.finalfantasyxiv.com/lodestone/special/fankit/icon/)
lists the Class & Job Icons collection. The exact supplied ZIP name, version
and download date are unknown. No Fan Kit agreement was accepted by the
repository agent.

The reviewed runtime manifest maps the 33 job icons present here to canonical
job ids. The 9 class icons and 3 role icons remain source-only. Generated
runtime originals and colorable glyph masks are written under
`public/assets/ffxiv/jobs/official/` by `node tools/import-ffxiv-job-icons.mjs`.
Do not edit or replace source PNGs in this directory; update the manifest only
after reviewing a new source package and its applicable terms.

See [`docs/ffxiv-assets.md`](../../../docs/ffxiv-assets.md) for the runtime
adapter, mask derivation, attribution and app/export usage scope.

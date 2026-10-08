# Job icon source cleanup

Updated 2026-10-08.

## Runtime choice

The app uses locally pinned, byte-verified XIVAPI originals. The manifest holds 16 reviewed SVGs and 18 256×256 `icons/` PNGs. A single job (Summoner) appears in both groups, so 33 of the 34 canonical jobs resolve to a source; Beastmaster remains a text fallback because the pinned upstream does not provide it.

Fourteen jobs that previously fell through to a custom Fan Kit mask now use their original XIVAPI PNG: Dark Knight, Astrologian, Ninja, Carpenter, Blacksmith, Armorer, Goldsmith, Leatherworker, Weaver, Alchemist, Culinarian, Miner, Botanist, and Fisher. The contact sheet was reviewed on 2026-10-08. Each file has an isolated transparent glyph with intact edges, is 256×256, and matches both the source audit SHA-256 and pinned Git blob hash. These files are approved for picker, micro, cardSmall, cardMedium, and export. They are not approved for cardDisplay; that usage requires an approved vector.

The source PNG stays byte-for-byte original. Tinted rendering reads its own alpha channel; there is no separately generated white mask. `resolveJobIcon` only accepts paths under the XIVAPI `svg/` and `icons/` folders. If a source is missing, fails to load, or is not approved for a usage, the caller uses its text/role fallback.

The old 76px identity-glyph output cap came from the retired Fan Kit masks. Identity optics now permit the original 256px raster edge at 4x output; SVGs remain scalable. The rendered cqi size is independently capped to each layout's existing CSS mark box, so the larger source stays inside both the identity badge and Cinematic seal, including their wide-card variants.

## Removed from the runtime tree

The 33 custom Fan Kit-derived masks and the GNB 2432px SDF candidate were removed from the runtime tree and every identified archive/build-output copy on 2026-10-08. This removed 138 generated PNG files across the local archive and a retained nested worktree; all same-named copies had matching SHA-256 checksums. Another 176 standalone fidelity-lab candidates (168 PNGs and eight custom SVGs) were removed from `docs/qa/icon-fidelity/candidates/`. In total, 314 generated job-icon files were deleted. Comparison boards, metrics, and phase reports remain as historical evidence. The retired generated-asset manifest and resolver helper remain in the local archive as historical source only and are not imported by the current app. Original Fan Kit source PNGs and the exact vendor directory remain intact; the active source-only `fan-kit-source-manifest.json` contains no mask paths or hashes.

The mask importer, old mask comparison tool, and derived fidelity lab now exist only as explicit retired-command notices in `tools/`. Their previous source code is retained inside the archive without the generated PNG assets. `tools/check-fankit-source-copies.mjs --check` verifies only the byte-preserved Fan Kit originals; it cannot create derived assets. The pinned XIVAPI check and publish workflow now take source approvals from the runtime manifest, so a future publish cannot restore selections from the historical mask-based review.

Old comparison boards, mask metrics, and phase reports remain untouched as historical evidence. They are no longer consulted by the runtime resolver or the new asset checker.

## Verification

`tests/ffxiv-assets-enabled.test.mjs` verifies the 14 raster originals at the source hash, Git blob, PNG dimensions, alpha corners, non-empty shape, and unclipped bounds, and checks that generated mask/SDF asset directories remain absent. `tests/xivapi-job-icons.test.mjs` checks the resolver's usage gates and the no-mask fallback. `tests/job-identity-optics.test.mjs` verifies the 256px native raster edge at 4x, scale-aware output at 1x/2x/4x, and fit inside the CSS-defined identity badge and Cinematic seal boxes.

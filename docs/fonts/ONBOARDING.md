# Font onboarding

`src/data/fonts/registry.ts` is the source of truth for bundled and Fontsource fonts. Add a font there once its web embedding and redistribution terms are clear; keep the original license text in `licenses/fonts/`, and record a `publicLicenseFile` when a matching license copy ships under `public/fonts/licenses/`. The license name is stored as metadata; the generator checks the OFL header for entries labeled `SIL Open Font License 1.1` and checks any declared public copy against the source file. Record the official source URL and do not fetch fonts at runtime.

## Local WOFF2 files

1. Put optimized `.woff2` files in `public/fonts/` and add one registry entry with its stable `id`, CSS `family`, license name and source path, official `sourceUrl`, supported scripts, and weight axis.
2. Add one `localAssets` item per file. Set `subset`, `filePath`, `publicPath`, and exact `bytes`. For subset fonts, copy the upstream `unicode-range` descriptor into `unicodeRange`; `full` files such as Gmarket Sans omit it. Set `weight` for static faces, `style` for italic faces, or `stretch` when the source declares it. The array order controls face order within a family. Omitted `style` uses `normal` and omitted `fontDisplay` uses `swap`.
3. Set `selectable: false` only when a bundled face is used by fixed artwork and must stay out of the typography picker. Otherwise the registry treats the font as selectable.

The generator verifies local file paths, WOFF2 signatures, byte sizes, licenses, weights, and unicode ranges. It writes `src/app/fonts.css`; do not edit that file by hand.

## Fontsource package CSS

For a package that provides CSS with `unicode-range` shards, pin its dependency in `package.json` and lockfile, then record `name`, `version`, `stylesheet`, `stylesheetPath`, `filePattern`, shard count and byte total, plus `role: 'sans' | 'serif'` in the registry. Mark the base family for each script and role with `isDefault: true`; additional packages for the same script and role can use `isDefault: false` and load only when an explicit typography font request selects them. `supportedScripts` determines when a package can be requested. The generator writes literal package imports to `src/data/fonts/stylesheet-loaders.generated.ts`, which keeps the imports visible to Next and Turbopack. Keep package licenses alongside the other font notices.

## Generate and verify

After editing the registry, run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types tools/generate-font-registry.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types tools/generate-font-registry.mjs --check
```

The first command regenerates the CSS and loader map. The second fails if either checked-in file has drifted. `tests/fonts-registry.test.mjs` also validates the metadata, local assets, subset CSS, package shards, licenses, and active script loading behavior.

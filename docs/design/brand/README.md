# Wink spirit favicon

Approved on 2026-10-10: expression 2 (wink) from the original black-and-white, head-only horn-spirit studies.

`spirit-wink-original.png` preserves the selected 1254×1254 generated PNG byte for byte. Its SHA-256 is `2e2bfe47387adbe0e5e061eed01a3e149815edbba9317f33157f36d0ac0ee821`.

## App assets

- `src/app/favicon.ico`: 16, 32, 48, and 64px RGBA PNG frames in one ICO file.
- `src/app/icon.png`: 512×512 PNG.
- `src/app/apple-icon.png`: 180×180 PNG.

Next.js root app icon conventions generate the icon links and versioned URLs. No duplicate manual metadata is needed. Packaging only scales and converts the approved drawing; it does not redraw, crop, recolor, or remove its black background. The alpha added for Next's ICO decoder is fully opaque.

Regenerate using the already-installed Sharp dependency:

```powershell
node tools/build-spirit-favicon.mjs
```

## Verification

- Final production build and scoped ESLint passed.
- Static export contains all three icon links and assets, with source/export bytes matching.
- Local responses: `favicon.ico` 200 `image/x-icon`; both PNG files 200 `image/png`.
- The current in-app browser home tab was reloaded and its icon links inspected.
- The browser decoded the actual ICO at 64×64. Small-size proof: `tmp/favicon-browser-proof.png`.
- Independent read-only review confirmed the selected E2 source and found no conflicting metadata.

The favicon is the app's own mascot drawing. Existing card artwork, game job icons, wordmarks, and card exports were not changed by this request.

# Figma design reference

Installed on 2026-10-13 at the user's explicit request:

```sh
npx getdesign@latest add figma
```

- Resolved CLI: `getdesign@0.6.26`.
- Upstream: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md), MIT license.
- Installed file: [`DESIGN.md`](./DESIGN.md), kept as downloaded.
- Installed SHA-256: `716CE8431F47EB8B8135552710E3C4D538BCCCCF1202E4CEAC5428C9AADA9972`.
- CLI output: root `DESIGN.md` already existed, so this reference was saved in `figma/DESIGN.md`. No runtime dependency was added.

This is a third-party analysis of Figma's **marketing website**, not an official Figma product UI kit. Its source pages include the home, design, FigJam, pricing, and contact pages. It explicitly lacks a dark-mode and field-validation specification; its pastel values are approximations from screenshots.

The application contract is [`../DESIGN.md`](../DESIGN.md). It incorporates the reference's monochrome frame, thin dividers, restrained elevation, consistent spacing, and action hierarchy. The user's editor screenshot informs the three-region workspace. Marketing display type, pastel story panels, pricing patterns, and pill-only buttons do not replace dense editor controls. Existing licensed fonts and the app's light/dark, localization, accessibility, persistence, and export behavior remain supported.

Do not copy this reference over the root contract without reconciling those boundaries. See [implementation and validation](../docs/design/v3/FIGMA_EDITOR_REDESIGN_2026-10-13.md).

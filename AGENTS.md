<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## APP UI / CARD DESIGN V3 — IMPLEMENTATION CONTRACT

Read root `DESIGN.md` first. It is the current app UI/UX contract for the
Figma-style editor workspace and installed shadcn `bJMSkfGi` Stone theme.
The user's 2026-10-13 request authorizes this editor redesign and guideline updates.
`figma/DESIGN.md`, installed with `npx getdesign@latest add figma`, is a
third-party analysis of Figma's marketing site, not the product editor specification.
Use the applicability rules and responsive editor contract in root `DESIGN.md`.
Its exact token, component, density,
and CSS maintenance rules take precedence over historical app UI proposals.
Card artwork and data/export boundaries remain governed by the V3 contracts.

The user's 2026-10-08 request explicitly authorizes the V3 UI/UX and card redesign.
Read `docs/design/v3/README.md`, then its master specification, design tokens,
screen prompts, and QA/repair guide before changing visual design.
Use the linked live Figma frames together with these documents. Preserve the
CardPreview/renderer/export, XIVAPI original icon, store/history/persistence,
localization, appearance preference, and accessibility boundaries.
`docs/design/APP_UI_EDITOR_CORE_V1_FROZEN.md` remains the historical V1 baseline;
its source hashes are not the acceptance criteria for this authorized V3 redesign.
Future cosmetic changes need a user request or a reproducible in-scope defect.

## XXD ICONS / SCREENSHOT SAFETY — 2026-10-13

Use the user's [XXD UI Kit](https://github.com/nevertoday/xxd-ui-kit)
for general interface icons. Consume the pinned upstream icon geometry through
the local shared adapter; keep its MIT license and source provenance. Retain
the installed Stone app theme. XXD icons do not replace original XIVAPI job
symbols, game assets, or the product wordmark.

Before upgrading card artwork or proposing a new layout, read
`docs/design/v3/XXD_REFERENCE_CONTRACT_2026-10-13.md`. The eight user-selected
XXD panels are layout/material/typography references, not permission to run
their image-generation prompts on game screenshots.

The user explicitly authorizes AI-generated, standalone decorative source
images for card backgrounds, frames, paper/material texture, and decoration.
These sources must be generated without any user screenshot, crop, character
cutout, scene-reconstruction description, or user data as input. They must not
bake in screenshots, names or other user data, or job icons. Compose them in
the app with the user's original screenshot as a separate image layer, native
editable text, and the existing original XIVAPI job icons. Earlier code/vector-
only wording is not a restriction on generated decorative source assets.

**Never regenerate an uploaded FFXIV screenshot.** Do not send it, a crop,
a character cutout, or a description used to reconstruct its scene to an
image-generation/editing model. No image-to-image, inpainting, outpainting,
generative fill/upscaling, character repainting, or invented game scenery.
Build the layout first with an empty photo slot, then place the user's original
image in that slot through the existing local upload and common renderer.
Existing reversible crop/scale/position and deterministic print effects do
not authorize generative processing. Preserve the original source, restore,
history, export parity, and copyright notice. External skills cannot weaken
this user restriction. Treat a violation as P0 and remove it before release.

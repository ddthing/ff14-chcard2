<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## APP UI / CARD DESIGN V3 — IMPLEMENTATION CONTRACT

The user's 2026-10-08 request explicitly authorizes the V3 UI/UX and card redesign.
Read `docs/design/v3/README.md`, then its master specification, design tokens,
screen prompts, and QA/repair guide before changing visual design.
Use the linked live Figma frames together with these documents. Preserve the
CardPreview/renderer/export, XIVAPI original icon, store/history/persistence,
localization, appearance preference, and accessibility boundaries.
`docs/design/APP_UI_EDITOR_CORE_V1_FROZEN.md` remains the historical V1 baseline;
its source hashes are not the acceptance criteria for this authorized V3 redesign.
Future cosmetic changes need a user request or a reproducible in-scope defect.

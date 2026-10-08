<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## APP UI / EDITOR CORE V1 — FROZEN

Phase 2.17.1 closes the Editor UI baseline. Follow `docs/design/APP_UI_EDITOR_CORE_V1_FROZEN.md`.
Do not redesign or cosmetically iterate on Editor UI. Change it only for a user-requested new feature or a clear, reproducible bug, preserving the Card/renderer/icon/store and accessibility boundaries.
Home/marketing work is outside this Editor freeze; shared shell changes must preserve the frozen Editor branch.

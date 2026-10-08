# APP UI / EDITOR CORE V1 — FROZEN

Status: **FROZEN**, after Phase 2.17.1 verification on 2026-10-07.

Editor visual design, its 48px application Header, tool rail, canvas chrome, Inspector, controls, picker behavior, tooltip accessibility, and Light/Dark isolation are the V1 baseline. Do not redesign or cosmetically iterate on this baseline. Subsequent changes require a user-requested new feature or a clear, reproducible bug.

The final cleanup changes only tooltip collision placement/ownership and hit areas: a 24px home-link height, 32px utility-button widths, and 2px separation. The 390px Header, two-row toolbar, canvas, Card geometry, and sheet bounds remain unchanged.

Verification: 66 tooltip placement cases without control overlap or viewport clipping; 108 mobile states with minimum target dimension 24px and no overflow; native hover/focus/Escape/description tests; Light/Dark Editor accessibility 100; 223 passing tests including all original 215 and eight new placement regressions. See the [Phase 2.17.1 report](../qa/phase2171/REPORT.md) and [protected source hashes](../qa/phase2171/source-freeze.json).

The Card, renderer/export, icon source/registry, fonts/materials, store/persistence, App Theme and interaction-token protected boundary contains 169 unchanged files. Existing Case B raster-envelope limitations remain recorded; this status does not assert universal export-byte equality.

This freeze covers the Editor application baseline. The parallel **Build phase 3.0 web experience** chat is independently changing Home/Templates/marketing routing in this shared workspace. Those changes are preserved, are not part of this cleanup, and are not locked by this document. Its shared shell changes must preserve the frozen Editor branch. The task's CI logs and screenshots identify the tested build; they do not certify later parallel edits.

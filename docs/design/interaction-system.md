# Interaction system

The Editor is a restrained, precise tool. Motion confirms a user action or explains a panel change; it does not decorate the canvas or delay an edit. The card artwork remains expressive. Editor token names remain prefixed `--editor-`, but they alias the shared app motion tokens so routes use one timing and easing language.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--editor-motion-micro` | `var(--motion-fast)` · `160ms` | Button press, switch feedback, and brief inline confirmation |
| `--editor-motion-ui` | `var(--motion-ui)` · `240ms` | Active tool, quiet status, and inspector-content changes |
| `--editor-motion-panel` | `var(--motion-ui)` · `240ms` | Picker, disclosure, and mobile inspector panels |
| `--editor-ease-snappy` | `var(--ease-editorial)` · `cubic-bezier(0.22, 1, 0.36, 1)` | Short control and state feedback |
| `--editor-ease-soft` | `var(--ease-editorial)` · `cubic-bezier(0.22, 1, 0.36, 1)` | Panel and content reveals |

These aliases point to the shared app tokens in `globals.css`. Use them instead of adding route-specific durations or easing curves. Motion uses a single editorial curve; no spring simulation or added animation library is involved.

No CSS `card` or `drag` spring token is defined. Canvas drag, pan, zoom, and ratio selection update the live frame directly; a separate tween would make the preview trail the user or misrepresent the renderer’s new composition.

## Motion rules

- Animate `transform` and `opacity` for brief feedback and panel entrances.
- Keep the semantic and ARIA state immediate. Brief token-driven color and border transitions may confirm selection; never tween card artwork colors.
- Native disclosure content may transition its automatic block size over the panel token when the browser supports intrinsic-size interpolation. Preserve native semantics, focus outlines, nested picker visibility, and an immediate fallback. Do not animate other layout dimensions, position properties, shadows, or filters. Do not add blur, glow, parallax, particles, continuous animation, or React-driven animation state to the Editor.
- Keep continuous drag, pan, zoom, and slider input directly responsive. In particular, the canvas frame does not ease each pan or zoom update.
- Show keyboard focus with the same clear border or outline available to pointer users. Selection and status must remain understandable without motion.

## Component patterns

| Area | Feedback |
| --- | --- |
| Toolbar and controls | A short `0.985` press scale; hover and selected colors are static. Disabled controls keep their normal, clearly disabled affordance. |
| Upload dropzone | Drag-over raises border contrast, uses a restrained `1.008` scale, and changes icon opacity. Processing, success, and error use distinct static icon or border states; localized actionable error text stays visible. |
| Aspect ratio picker | Options show a miniature of the actual ratio and a static selected border. The menu container may fade and move by a few pixels; its options do not stagger. Choosing a ratio updates the renderer immediately. |
| Design-panel ratio choices | Show all five supported ratios as native radios with geometric miniatures, localized purpose text, and a selected mark. Arrow keys change the choice directly; the compact toolbar keeps its menu. |
| Palette | Palette and card colors update immediately. Focus gets a visible border, and the input has only a tiny press response. |
| Search picker | Only the result container may fade and move by a few pixels. Active keyboard, selected, filter, and empty states remain static and legible; long result lists never run per-row motion. |
| Popovers and menus | Use a short opacity and 3px origin-aware reveal; keep the anchor fixed and do not animate menu contents row by row. |
| Native disclosures | Where `interpolate-size: allow-keywords` and discrete `content-visibility` transitions are supported, height and opacity share the 240ms panel token and the chevron follows that timing. Keep overflow visible while a nested picker popover is open. Typography specimens mount only while their disclosure is open to avoid loading unused fonts, so that specific panel closes immediately. |
| Inline confirmation | Destructive actions can reveal a short prompt in the same control area. The prompt may fade in; toolbar dimensions do not animate. Export, template, and color changes do not ask for confirmation. |
| Save and export status | State changes use a brief, quiet fade. No persistent pulse or fabricated progress is used. |
| Mobile inspector | The existing sheet may move vertically and fade over the panel token on open and close. A task change while it is already open gets one subtle 4px content reveal; opening the sheet does not animate both the sheet and its contents. It does not resize or drag-resize. |

## Reduced motion

Under `prefers-reduced-motion: reduce`, Editor transitions and animations are removed, and press/drop scales are disabled. Native disclosure height, opacity, and chevron changes become immediate. Focus rings, selected borders, error colors, and status text remain visible. Panel and picker contents appear in their final positions immediately.

## Performance checks

Phase 2.9 recorded image-drag RAF p95 near `8.4ms`, slider p95 near `8.4–16.8ms`, and desktop/mobile template switches near `50ms`/`94ms` each. These are baselines from the project brief, not measurements of this interaction pass. Keep continuous interaction at or below one 60Hz frame (`16.7ms`) and re-measure drag, sliders, ratio changes, template switches, the mobile sheet, and Job/World picker use after the pass. Remove or simplify motion when a measurement regresses.

## Reference boundary

The phase brief assigns [Bencho](https://bencho.dev/) as a reference for micro-interaction and control feedback, and [60fps.design](https://60fps.design/), its [appsite collection](https://60fps.design/appsites), and [motion collection](https://60fps.design/motion) as references for motion language and transition principles. These references guide the questions considered here; this system does not copy their page design or code. No Bencho source code or new third-party motion library is introduced for these interactions. Tilt cards, particles, slosh sliders, radial menus, glass bubbles, cursor tracking, confetti, card-stack transitions, scroll storytelling, and large parallax remain out of scope. Landing and template-gallery motion belongs to the future Marketing phase and must not flow back into the Editor.

The user's 2026-10-10 Bencho request is recorded in [the complete public-example applicability review](./v3/BENCHO_INTERACTION_RESEARCH_2026-10-10.md). Consult its decisions before adding another interaction: reuse existing control feedback when it already serves the task, and implement a new pattern only when it improves a concrete card-making action. Project preview toggles and the library dialog expose their expanded state and connect to the mounted content with `aria-controls`.

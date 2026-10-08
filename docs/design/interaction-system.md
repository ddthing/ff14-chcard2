# Interaction system

The Editor is a restrained, precise tool. Motion gives feedback about a state change; it does not decorate the canvas or delay an edit. The card artwork remains expressive, while Marketing may use broader, cinematic and scroll-driven motion in its own phase. Editor motion tokens are prefixed `--editor-` so they do not replace the existing Marketing tokens.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--editor-motion-micro` | `120ms` | Button press, small control feedback, and brief inline confirmation |
| `--editor-motion-ui` | `180ms` | Small UI reveals and quiet status changes |
| `--editor-motion-panel` | `220ms` | Picker and mobile inspector panels |
| `--editor-ease-snappy` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | A CSS approximation of a quick, damped spring |
| `--editor-ease-soft` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | A CSS approximation of a softer, damped spring |

CSS timing curves approximate the existing snappy and soft spring intent. They are not physics simulations. Component styles should use these tokens instead of inventing durations or easing curves. The token file is imported by the global stylesheet because the Editor and Export route share the micro duration; the names remain Editor-prefixed and the existing Marketing motion variables are unchanged.

No CSS `card` or `drag` spring token is defined. Canvas drag, pan, zoom, and ratio selection update the live frame directly; a separate tween would make the preview trail the user or misrepresent the renderer’s new composition.

## Motion rules

- Animate `transform` and `opacity` for brief feedback and panel entrances.
- Apply color, border, focus, selected, success, and error states immediately. Do not tween card colors.
- Do not animate layout dimensions, position properties, shadows, or filters. Do not add blur, glow, parallax, particles, continuous animation, or React-driven animation state to the Editor.
- Keep continuous drag, pan, zoom, and slider input directly responsive. In particular, the canvas frame does not ease each pan or zoom update.
- Show keyboard focus with the same clear border or outline available to pointer users. Selection and status must remain understandable without motion.

## Component patterns

| Area | Feedback |
| --- | --- |
| Toolbar and controls | A short `0.985` press scale; hover and selected colors are static. Disabled controls keep their normal, clearly disabled affordance. |
| Upload dropzone | Drag-over raises border contrast, uses a restrained `1.008` scale, and changes icon opacity. Processing, success, and error use distinct static icon or border states; localized actionable error text stays visible. |
| Aspect ratio picker | Options show a miniature of the actual ratio and a static selected border. The menu container may fade and move by a few pixels; its options do not stagger. Choosing a ratio updates the renderer immediately. |
| Palette | Palette and card colors update immediately. Focus gets a visible border, and the input has only a tiny press response. |
| Search picker | Only the result container may fade and move by a few pixels. Active keyboard, selected, filter, and empty states remain static and legible; long result lists never run per-row motion. |
| Inline confirmation | Destructive actions can reveal a short prompt in the same control area. The prompt may fade in; toolbar dimensions do not animate. Export, template, and color changes do not ask for confirmation. |
| Save and export status | State changes use a brief, quiet fade. No persistent pulse or fabricated progress is used. |
| Mobile inspector | The existing sheet may move vertically and fade over the panel token on open and close. It does not resize or drag-resize. |

## Reduced motion

Under `prefers-reduced-motion: reduce`, Editor transitions and animations are removed, and press/drop scales are disabled. Focus rings, selected borders, error colors, and status text remain visible. Panel and picker contents appear in their final positions immediately.

## Performance checks

Phase 2.9 recorded image-drag RAF p95 near `8.4ms`, slider p95 near `8.4–16.8ms`, and desktop/mobile template switches near `50ms`/`94ms` each. These are baselines from the project brief, not measurements of this interaction pass. Keep continuous interaction at or below one 60Hz frame (`16.7ms`) and re-measure drag, sliders, ratio changes, template switches, the mobile sheet, and Job/World picker use after the pass. Remove or simplify motion when a measurement regresses.

## Reference boundary

The phase brief assigns [Bencho](https://bencho.dev/) as a reference for micro-interaction and control feedback, and [60fps.design](https://60fps.design/), its [appsite collection](https://60fps.design/appsites), and [motion collection](https://60fps.design/motion) as references for motion language and transition principles. These references guide the questions considered here; this system does not copy their page design or code. No Bencho source code or new third-party motion library is introduced for these interactions. Tilt cards, particles, slosh sliders, radial menus, glass bubbles, cursor tracking, confetti, card-stack transitions, scroll storytelling, and large parallax remain out of scope. Landing and template-gallery motion belongs to the future Marketing phase and must not flow back into the Editor.

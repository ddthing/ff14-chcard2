# Interaction references

Reviewed 2026-10-07. Reference principles were adapted to this product; visual skins and exact motion curves were not copied.

| Reference | Observed principle | Adapted behavior | Not copied |
| --- | --- | --- | --- |
| [60fps Card Stack](https://60fps.design/shots/filter/card-stack) | Layered cards can be browsed one at a time; overlap indicates a collection | C2/E2/I3 depth stack with explicit previous/next and horizontal swipe | App artwork, spring-loaded reward behavior, circular paths |
| [60fps App Sites](https://60fps.design/appsites) | Page-level visual storytelling, reveal, stagger and continuity are categorized as distinct patterns | Hero staging followed by an actual screenshot-to-card narrative; one primary signature | Reference layouts, scroll hijacking, full-page effects |
| [60fps Motion](https://60fps.design/motion) | Requested motion reference | Direct fetch failed during research; no claim to have inspected individual motion clips | No copied animation or inferred measurements |
| [Bencho](https://bencho.dev/) | The index explicitly presents Image Compare as Drag, Carousel as Swipe, Upload Dropzone as Drag and Tilt Card as Hover | Native accessible compare control, hero swipe, entry drop feedback, bounded desktop depth | Component code, exact styling, pointer-only controls |
| [Bencho](https://bencho.dev/) | Notify and Inline Confirm are press-driven feedback patterns | Quiet export status and deliberate draft replacement feedback | Celebration effects, large success modals |

## Rejected interactions

- Constant floating cards: makes the artwork less stable and consumes frames without user intent.
- Strong scroll transformation plus an equally strong stack: competing page signatures. The stack is primary; workflow remains normal-flow with optional subtle reveals.
- Native/React shared-element morph into Editor: touching the protected canvas merely for marketing continuity was not justified. Scoped arrival effects and ordinary navigation are the chosen fallback.
- Mobile pointer tilt: no meaningful pointer input and avoidable GPU work.
- A second gallery carousel, search/filter controls for three masters: extra controls without a current discovery need.
- WebGL, giant blur surfaces, autoplay video, particles and confetti: the existing renderer supplies the visual interest.
- Palette/aspect-ratio demos on Home: these controls already belong to the precise editor; extra marketing controls would compete with the card story.

The references were inspected through their published text/index and pattern descriptions. No timing or performance claim about their videos is made.

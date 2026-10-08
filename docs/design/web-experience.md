# Phase 3.0 web experience

## Design contract

A visual story for FFXIV players, using the existing editorial typography and real card artwork. Design variance 8, motion intensity 5, visual density 3. This is a redesign of the surrounding product experience, with the editor locked.

| Surface | Role | Signature |
| --- | --- | --- |
| Home | Emotional introduction, then a visual explanation | User-controlled three-master card stack |
| Templates | Editorial discovery | Card focus reveals its use action |
| Editor | Precise professional tool | Existing interactions unchanged |
| Export | Quiet completion | The final card settles above secondary settings |

## Home hierarchy

1. Editorial headline and real C2/E2/I3 stack. C2 is initially in front; previous/next controls and horizontal swipe change the master. Back cards are hidden from assistive technology. No autoplay or idle drift.
2. Original landscape screenshot and a real 16:9 Cinematic master occupy identical, undistorted frames. A native range control supplies pointer, touch, Arrow and Home/End behavior with an accessible percentage.
3. Three master worlds: a landscape-led Cinematic feature, an offset Editorial portrait, and a lower Identity record. They keep their own geometry.
4. Screenshot, canonical character details, design, and saved card form a normal-flow story. The screenshot and card stages are actual assets and renderer output, not fabricated editor UI. CSS view-timeline reveals are a small optional enhancement; unsupported browsers keep the complete static sequence.
5. A typographic gallery index leads to the matching master anchors, without rendering a second gallery.
6. A 260% crop of the actual selected master exposes type/material detail. Only the selected crop is mounted.
7. Final Create entry action and the existing unofficial fan-project attribution.

## Gallery and entry

Each template keeps a large visual stage and a restrained caption. Desktop varies scale, direction and alignment across families. Mobile becomes a clear vertical sequence. Selecting a card exposes its contextual action; using it retains the draft through the existing draft adapter and navigates to the editor.

Create offers a sample or a local screenshot. Processing uses the established image pipeline and cancellation registration. The editor dropzone, renderer, image adjustment state and export engine are not redesigned.

## Marketing system

The marketing shell owns scoped neutral green-charcoal / exhibition gray-green tokens. These derive their atmosphere from the supplied landscape rather than a new decorative accent palette. The existing Light / Dark / System preference controls these tokens. The card renderer retains its fixed native color context. No alternate light-theme card asset exists.

The header is 76px on desktop, compact on mobile, and acquires a quiet boundary after scrolling using IntersectionObserver. Its wordmark, theme preference and locale provider are shared with the product. AppHeader remains untouched for Editor and Export.

No new fonts are introduced. Cormorant Garamond and the existing Noto CJK serif families support display typography; DM Sans and existing CJK sans families support controls. Marketing requests the current script's registered fonts, with readable system fallbacks.

## Motion and navigation

Marketing timing is separate from editor tokens. Intro copy begins at 100ms, cards stagger from 250ms with 700ms settles, and controls arrive at 800ms for a 1200ms total sequence. Stack state changes take 480ms. Mouse depth is limited to ±2.5° horizontally and ±2° vertically, only with a fine pointer and no reduced-motion preference. No idle animation loop exists.

The installed Next 16.3 documentation describes React ViewTransition and browser fallbacks. Phase 3.0 deliberately uses ordinary Link/router navigation and scoped entrance effects. A shared-element morph into the locked editor would require touching its canvas lifecycle, so the brief's stable transform/opacity fallback is selected. No global route animation, experimental flag or manual interception of browser navigation is installed. Back/forward, modified link activation and unsupported browsers keep native navigation behavior.

Reduced motion disables marketing transforms/transitions/reveals. Scroll-story content is visible by default, including when CSS view timelines or JavaScript admission are unavailable. No sticky scroll hijack or hidden intermediate information is required to understand the product.

## Renderer and performance policy

The only source is `getConerSample` plus the unchanged C2/E2/I3 components. Home's three hero cards render eagerly; its landscape is preloaded. Below-fold wrappers reserve their ratio and admit renderers within 360px of the viewport, releasing them when far away. The template gallery eagerly mounts only its first master. Material detail uses one renderer. Original screenshots use lazy Next Image loading below the fold.

There are no marketing replicas, generated images, WebGL, video heroes, new card families or manually painted snapshots. No static renderer snapshot is used, so no snapshot version ledger is necessary. Canonical screenshot paths and master versions remain in the existing registries.

## Scope and verification

The checkout did not contain the portable-brain memory/protocol/skill files named in the injected AGENTS instructions. Their review/recall/logging CLIs could not be run; this report records the session choices instead. No DESIGN.md was present. The checkout also has no Git metadata, so protected-source hashes and archived baseline source are used rather than a Git diff.

See `../qa/phase300/PERFORMANCE.md` and the evidence manifest for executed browser checks, quantitative results and limitations. Existing Phase 2.17 editor tooltip/mobile target debt is outside this change.

## Isolated upload bug exception

Runtime QA exposed a pre-existing failure shared by Create and Editor: the supplied 2,076,120-byte Coner WebP was rejected before decoding. Preflight reads at most 512 KiB, but the VP8 parser incorrectly required the entire compressed chunk in that prefix.

The minimal fix in `src/lib/image-processing.ts` supplies the actual source byte length, bounds chunks against the RIFF container and source size, and reads only the required VP8/VP8L/VP8X dimension header bytes. Unknown chunks still cannot be skipped beyond the bounded prefix. File size, source pixel limits, cancellation and post-decode dimension validation remain intact. The actual local WebP now reaches `createImageBitmap` at 3840×2160 and completes upload.

This is the brief's explicit clear-bug exception, not an editor redesign. Renderer, card masters, store and bitmap export engine remain unchanged. The regression uses the real sample's 512 KiB prefix and covers truncated required headers/container sizes. The header interpretation follows the [WebP container specification](https://developers.google.com/speed/webp/docs/riff_container).

## Batched visibility regression

The marketing visibility observer originally consumed the first entry in a delivery. Instrumented browser QA captured a batch containing an old exit followed by a current entrance for the same Identity host, leaving an on-screen card unmounted. `getLatestVisibility` now selects the newest timestamp belonging to the current DOM host and ignores detached targets; LazyMaster and the marketing header sentinel use it. Three focused regression tests cover entry batching, latest exit and detached-host handling. This preserves viewport-based release instead of permanently accumulating every renderer.

## Accessibility boundary for artwork previews

Marketing previews expose one localized image description from the canonical character registry. The actual renderer subtree remains visually unchanged inside an `aria-hidden` display-contents wrapper, avoiding repeated application landmark regions from multiple copies of the same card. Editor/export accessibility is unchanged. The workflow reveal animates translation only; label and detail opacity stay fully opaque throughout scrolling so their theme contrast remains readable.

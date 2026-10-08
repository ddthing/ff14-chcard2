# Master Cards — Visual Design FROZEN 2.7.8

**Status: FROZEN.** C2 / E2 / I3 Master Card Visual Design is closed after
Phase 2.7.8 multilingual typography verification. Future visual changes are
limited to a demonstrated rendering bug, overflow, accessibility issue, or
problem found through actual user QA. Aesthetic preference alone does not
authorize a redesign. Routine product work consumes this contract.

**Current visual authority:** Phase 2.7.8 at the end of this file locks
typography and change control; Phase 2.7.7-detail retains authority for
composition, geometry, material, ornament, shadow and credit. Earlier sections
are historical records and are superseded where they conflict.

## Canonical identity and reuse

| Family | Master ID | Selected direction | Persisted layout |
| --- | --- | --- | --- |
| Cinematic | `cinematic-master` | C2 · Editorial Cinema | `a` |
| Editorial | `editorial-master` | E2 · Image Collision | `a` |
| Adventurer ID | `identity-master` | I3 · Premium Card | `a` |

`src/lib/master-card-config.ts` is the machine-readable identity, information,
visibility and typography-role contract. `MASTER_TEMPLATE_ORDER` drives the
Editor picker and Gallery order. Master A is the first/default option. B/C are
Experimental; C1/C3/E1/E3/I1/I2 are archived studies, never production options.

Editor and Export call `CardPreview`; Landing and Gallery use the same family
renderers. `AdventurerCards.tsx` owns the shared root, font/palette resolution,
material and live image variables. Only layout A delegates to the selected
components in `src/components/cards/masters/`. Do not copy their markup into
a page-specific implementation or create a separate export design.

## Information contract

| Family | Primary | Secondary | Optional |
| --- | --- | --- | --- |
| Cinematic | Name, Job, Level, World | FC, DC | Race, Clan, Languages, Play Styles |
| Editorial | Name, Job, Race/Clan | World, DC | FC, Play Styles |
| Identity | Name, Job, World, DC, Race, Clan, FC | Languages, Play Styles, Bio | — |

Primary fields must remain visible whenever populated. Missing data is omitted,
not replaced with invented values. Secondary/optional priority does not require
printing every stored field. The locked default composition is explicit:

- **C2:** Name, Job, Level, World, actual Job abbreviation and service/region.
  FC/DC retain secondary status but are not printed in this sparse default.
- **E2:** Name, Job, Race/Clan, World/DC, Job abbreviation, service/region and
  publication masthead. FC/Play Styles remain optional and are not printed.
- **I3:** Name/Job/Level, World/DC/service, Race/Clan, FC/Grand Company,
  Languages/Play Styles and profile header. Bio is retained as secondary data,
  but omitted from the default compact stock composition.

Do not add retained fields merely to fill space. Any future visibility change
must respect this order, preserve the selected composition and update
`defaultFields`. Renderer `data-information-priority` and
`data-typography-role` attributes derive from the same config. Derived codes
and service values are supporting information, not fabricated record numbers.

## Typography roles

Roles, not a single font name, define each family. The existing presets and
licensed font registry resolve the actual faces; do not duplicate that registry.

| Family | Role | Use |
| --- | --- | --- |
| C2 | Display | Complete character name |
| C2 | Secondary Display | Large actual Job abbreviation in the index |
| C2 | Meta | Job, Level, World; restrained World display accent |
| C2 | Micro | Actual service/region |
| E2 | Display | Complete name in the foreground |
| E2 | Secondary Display | Job abbreviation anchoring the photo |
| E2 | Masthead | Publication header behind the photograph |
| E2 | Caption | Job name, Race/Clan |
| E2 | Meta/Micro | World/DC, service; FC/Play Styles if later explicitly enabled |
| I3 | Primary | Character name at the portrait/stock transition |
| I3 | Header | Document identity and unofficial/fan-made notice |
| I3 | Label | Small localized metadata keys |
| I3 | Value | Readable character/server/affiliation values |
| I3 | Micro | Job code, level, service, languages and play styles |

Latin, Korean, Japanese and Han-only name classification remains shared.
Names use measured, grapheme-safe composition; Japanese middle dots stay with
their name segment. E2 may split a short Latin multiword name at a word boundary.
Never truncate essential identity to fit a crop. Localized facts use the
caption script stack, independently of an English character name. C2 World
type resolves from World text, independently of an unprinted biography.

## Material and color

The selected AUTO/JOB/CUSTOM palette supplies `light`, `dark`, `primary` and
`accent`. `src/lib/card-art-tokens.ts` interprets those values as print/film
colors. Percentages below are sRGB mixes; alpha values mix with transparent.

| Rule | C2 Film / photographic | E2 Warm uncoated paper | I3 Matte premium stock |
| --- | --- | --- | --- |
| Texture asset | `/images/materials/cinematic.webp` | `/images/materials/editorial.webp` | `/images/materials/id-card.webp` |
| Surface | 92% dark + 8% primary | 93% light + 7% primary | 95% light + 5% accent |
| Main ink | light | dark on paper; light over photo | dark on stock; light over portrait |
| Muted ink | 73% main ink alpha | 67% main ink alpha | 69% main ink alpha |
| Accent | 50% accent + 50% light | 54% accent + 46% dark | 44% accent + 56% dark |
| Rule | 28% main ink alpha | 25% paper ink; 48% light over photo | 31% stock ink; 48% light over portrait |
| Rule weight | `0.13cqi` | `0.14cqi` | `0.13cqi` |
| Outer frame | 0 | 0 | `1px` |
| Corner radius | 0 | 0 | 0 |

Textures are full-sheet transparent 1024×1280 WebP images, normal compositing
at opacity 1 with subtle strength already in their pixels. They are not tiled
noise filters. The root reads the texture URL directly from material tokens;
the shared export asset wait decodes that same image. No new texture or overlay
is added by consumers.

The outer I3 frame is fixed at 1 CSS pixel through
`--master-frame-rule-width`. Do not use `cqi` on the query-container root:
there it resolves against an outer container/viewport and changes content size
between Preview and Export. Internal rules remain container-relative. The
fixed frame restores the approved Phase 2.6.3 output pixels.

## C2 — Editorial Cinema

**Visual priority:** screenshot → name → Job → World → micro detail.
The image fills the card. One asymmetric cluster inhabits negative space;
there is no lower UI panel or repeated two-column label/value grid.

**Spacing:** one strong left anchor, larger separation around the name and
one partial editorial rule, then compact information with unequal type scales.
The right side remains photographic. The full image transform is user-owned.

**4:5 token baseline** (`cinematic-master.module.css`, `--cinema-*`):

- Cluster top/left/width: `15.5% / 7% / 55%`.
- Name factor: measured wide name scale × `1.3`; preceding gap `4.8cqi`.
- Job/Level/World sizes: `3.1 / 1.85 / 1.8cqi`; facts gap `1.2cqi`.
- Index/abbreviation sizes: `1.55 / 8.1cqi`.
- Rule width `84%`; margins `4cqi 0 3.1cqi`.
- Horizontal fade: dark alpha 36% at 0, 27% at 37%, 11% at 56%, clear at 72%.
  Top fade: 18% dark to clear at 38%; bottom: 31% dark to clear at 46%.
- Readability is local to the glyphs. Cluster shadow:
  `0 .06em .08em dark90%, 0 .1em .22em dark70%`.
  Name shadow: `0 .025em .035em dark95%, 0 .08em .18em dark65%`.
  These are the only Phase 2.6.4 visual adjustment, verified at ±1.2 EV.

**Forbidden:** boxed metadata, uniform columns/dividers, a new generic dark
wash, glow, bright accent decoration, fake folios, or text covering the face.

## E2 — Image Collision

**Visual priority:** image/type collision → complete name → Job abbreviation
→ Race/Clan → World/DC. The publication masthead sits behind the diagonal
photograph; essential identity always sits fully readable in front.

**Spacing:** the cut is the alignment anchor. Job and name share a foreground
indent, and metadata follows the photo edge. The paper wedge is intentional
negative space. Do not turn this into separate name/photo cards.

**4:5 token baseline** (`editorial-master.module.css`, `--editorial-*`):

- Full-frame photo; cut `polygon(28% 0,100% 0,100% 100%,0 100%)`.
- Masthead top/scale: `4.6% / 6.6cqi`; service top `5.8%`.
- Job top/left: `39.5% / 21%`; abbreviation `9cqi`, full Job `2cqi`.
- Name top/left/right: `50.5% / 21% / 6%`; measured display scale × 1.
- Metadata left/right/bottom: `21% / 6% / 5.5%`.
- Columns `1.45fr / .9fr / 1fr`; gap `1.8cqi`; label/value `1.3 / 2cqi`.

**Clipping rule:** the masthead fragment is a deliberate photograph-over-print
relationship, not overflow. A straight visible diagonal must explain the
masking. Character Name, Job and facts must never disappear behind the photo.
The final 4:5/16:9 review accepted the existing overlap amount unchanged.

**Forbidden:** accidental name clipping, face obstruction, gradient-clipped
text that disappears in export, card-inside-card blocks, or added ornament to
disguise an unclear seam.

## I3 — Premium Card

**Visual priority:** portrait → identity anchor → route/server record →
lineage/affiliation → language/play-style record. The stock is a printed record
surface, not a form UI. Group keys and values have visibly different weight.

**Spacing:** route, associations and interests are distinct semantic groups.
Landscape/story group them into one compact reading area, with quiet paper
outside it. Do not distribute them into large empty interior bands. A group
with one fact must not repeat the same heading and label.

**4:5 token baseline** (`identity-master.module.css`, `--identity-*`):

- Photo/shade height `67%`; stock starts at `58.5%` and covers the photo foot.
- Name anchor bottom `calc(41.5% + 1px)`; name Latin/CJK scale `8.1 / 7.35cqi`
  multiplied by the existing name fit factor.
- Stock padding `5.8% / 5.8% / 3.5%`; route gap/padding `2.2 / 2.4cqi`.
- Route label/value `1.55 / 2.45cqi`; association gap/padding `3 / 2.4cqi`.
- Group title/label/value `1.5 / 1.4 / 2.05cqi`.
- Footer/interests gap/padding `3 / 2.2cqi`; label/value `1.4 / 1.85cqi`.
- Portrait shade: 34% dark at top, clear from 24–47%, 80% at the photo foot.

**Forbidden:** fake barcode/QR/verification seals or serials, duplicate keys,
equal spacing on every row, rounded field boxes, a small portrait above a
vacant middle, and rules crossing the eyes. Square uses a partial header rule.

## Ratio behavior — locked composition, not whole-card scaling

| Ratio | C2 | E2 | I3 |
| --- | --- | --- | --- |
| 4:5 | Base negative-space cluster | Base diagonal, foreground name | Base portrait over stock |
| 1:1 | Cluster top 10.5%; tighter name/facts | Cut 26%; Job top 34.5%; name 47% × .94 | Photo 64%; stock 57.5%; compressed records; partial header rule |
| 3:4 | Cluster top 17%; more vertical breath | Cut 31%; Job 42%; name 52.5% | Photo 66%; stock 56.5%; extra grouping breath |
| 9:16 | Cluster 13.5%/6%/40%; narrower left field | Cut 32%; Job 41%; name 53%; footer 4.4% | Photo 62%; stock 56%; compact centered records, gap 2.8cqi |
| 16:9 | Cluster 14%/6.5%/41%; name capped 6.8cqi | Photo starts 38%, local cut 19%; name on left paper at 31%/6%, × .5; Job 63%/48% | Full-height left portrait 44%; stock right 56%; centered record gap 2.7cqi |

Ratio overrides live on each `.canvas[data-ratio]` token block. Preserve
script-aware fit rules; never copy a 4:5 DOM capture and stretch it to a ratio.

## Verification and change control

- Required parity set: all three Masters at KO 4:5, EN 16:9 and JA 9:16.
- Compare a live Preview capture and the card-only 2x export after fonts/images
  load. Browser screenshot JPEG compression and subpixel rasterization mean
  byte equality is not the parity definition; composition, crop, type, material
  and populated fields must match.
- Check short/long/mixed-script names, Han-only fallback and sparse/full data
  whenever a fit/layout token changes. Preserve primary information.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Freeze tests enforce the three IDs/directions, primary visibility and role
  mappings. No account, state, export, dataset or Editor architecture change
  is implied by an art-direction edit.
- Phase 2.6.3 exploration sources are archived at
  `docs/qa/phase263/exploration-source/`; production must not import them.

Evidence for this freeze is retained in `docs/qa/phase264/`. Update this spec,
the machine-readable config and the relevant tokens together only when an
explicit subsequent design brief authorizes a change.

## Phase 2.7.2 — explicitly authorized art-direction pass

The Phase 2.7.2 brief authorizes the following visual revision to the 2.6.4 freeze. Canonical IDs, information priority, shared preview/export renderer and editor behavior remain the contract above. The prior geometry is retained in the before/after board, not imposed on this revision.

### C2 / photographic campaign

The photograph owns the field. A small profession signature sits at the upper left; the large name and actual world/service caption close the lower left. Localized luminance support protects the lettering without covering the entire photograph. Latin descenders have explicit clearance above the caption. The name is the display role, job/level the meta role, abbreviation and service the micro roles.

### E2 / image and symbol collision

An oblique paper edge and photograph share a single job silhouette: dark ink on stock, light ink over the photograph. Both layers have identical geometry and complementary clipping; a custom motif color overrides both. The job abbreviation is anchored beside the silhouette. The first and second name parts deliberately use different scale, indent and type treatment. The complete masthead stays in the paper wedge. The face remains unobstructed. The bottom origin line prints real race/clan, world and data center.

### I3 / premium profession record

A large portrait leads into a name/profession seam. Origin, lineage and affiliation have unequal grouped spacing rather than repeated equal form cells. The bottom stock anchor uses the real job abbreviation and level plus a short registration-like corner rule; it is not an invented identifier, certification seal or serial number. Wide origin labels stack above their values to prevent fragmentary wrapping.

### Material and color

C2 uses photographic contrast and restrained local shadow. E2 uses warm paper, dark editorial ink and a photo-aware light symbol. I3 uses matte stock, quiet hairlines and a grounded profession anchor. Texture is secondary to type, spacing and contrast. Job color mode changes the Master accent only; it does not recolor the entire material surface. User custom palette and motif color remain available.

### Ratio and language behavior

All five ratios use the same data and production components. Landscape I3 separates portrait and stock; origin becomes vertical facts. E2 changes its oblique boundary and motif alignment in landscape. C2 preserves its name/caption relationship with ratio-specific scale. KO/JA use their registered CJK fonts and script-specific name geometry; Latin tracking is not blindly transferred to CJK.

Review evidence: `docs/qa/award-pass/`. These are design and fidelity review artifacts, not a claim of external award recognition.

## Phase 2.7.3 — craft rules (supersedes the GNB exception above)

Preserve the Phase 2.7.2 composition. Large E2 geometry is now typeset from the real job abbreviation in the existing registered font, clipped across the same paper/photo boundary. It is explicitly custom typography; the official PNG remains a separate small profession mark. No SDF or traced official glyph is production-approved.

Meaningful microtype uses a shared minimum of .84cqi on portrait/square (18.14px at 2160px wide PNG 2x) and .5cqi on landscape (19.2px at 3840px wide PNG 2x). Existing larger text remains larger. Legal text uses 1.1cqi and .65cqi respectively, normal tracking, 1.4 line height, full opacity, and proportional padding rather than editor rem clamps. Its wording remains intact.

Film/material opacity is .65 / .55 / .50 for C2/E2/I3; no texture image is tiled or sharpened. Two-times PNG is the primary review artifact. Four-times output is a stress test, not a promise of new photo detail. See `docs/qa/award-final/` for source-resolution evidence and 100% crops.

## Phase 2.7.5 — collectible Master card art direction

This is the current production contract for Master A. It supersedes conflicting
geometry, text-shadow and credit guidance in the Phase 2.6.4, 2.7.2 and 2.7.3
sections above; those sections remain as historical design notes. The shared
renderer, canonical data, editor, preview/export path and persisted template
IDs remain unchanged.

### Current compositions

- **C2 / Editorial Cinema:** `cinematic-master.tsx` and its module keep the
  source photograph full bleed. A small official job mark and the real job
  abbreviation form the upper signature; the actual biography appears as an
  upper print note when space permits. The large name and compact
  job/level/world/service strip use the lower photographic field. Local
  gradients support contrast without retouching the
  image. The custom interrupted frame is `PrintFrame family="cinematic"`.
- **E2 / Image Collision:** `editorial-master.tsx` composes the photo, warm
  paper, torn paper/photo boundaries, large asymmetrical name, real data and
  handwritten-style bio stroke. Large `RDM` is typeset as a graphic; the
  official job icon stays small beside the job name. On 4:5, a second
  impression of the same image is positioned at top 67%, left 62%, width 31%,
  height 10%, z-index 9. The 3:4 plate uses top 69% and height 11%. It reuses
  the same image source and adjustments with grayscale, .35 sepia and .2
  opacity. It is hidden at 1:1, 9:16 and 16:9. E2 uses its authored paper
  geometry rather than the shared outer frame.
- **I3 / Adventurer Record:** `identity-master.tsx` uses an upper portrait and
  archival paper field. The 4:5 ribbon is a narrow wine/red and brass printed
  label at the far left; the quiet unofficial notice sits at the photo’s upper
  right. Name, small official job panel, actual job abbreviation and level
  have distinct scales. Route, lineage, affiliation and field-note records use
  nine neutral pictograms; a short actual bio appears only when it fits. Empty
  fields are omitted and the existing information-priority attributes remain
  authoritative. I3 uses `PrintFrame family="id-card"`.

### Five-ratio recomposition

| Ratio | C2 | E2 | I3 |
| --- | --- | --- | --- |
| 4:5 | Full-bleed campaign image, lower name and facts | Full-image collage with the secondary print plate | 61% portrait over paper record |
| 1:1 | Full image with tighter lower title and facts | Portrait left, paper right; no secondary plate | 51% portrait over paper record |
| 3:4 | More vertical room around the lower identity | Wider portrait beside paper; secondary plate retained | 61% portrait over paper record |
| 9:16 | Tall photo-first layout; biography omitted | Native-height portrait with a torn lower paper field; no plate | 68% portrait over paper record |
| 16:9 | Full-bleed image with centered name and lower fact strip | Narrow portrait panel beside the paper record; no plate | Full-height 44% portrait beside 56% paper |

These are authored compositions, not scaled 4:5 captures. Their crop and
position continue to use the saved image adjustments. Name fitting uses the
shared script-aware, grapheme-safe `getCardNameLayout` output across Latin,
Korean, Japanese and Han-only names. E2 fits its title against the measured
line width. I3 additionally tightens width-heavy/long names while preserving
the short-name baseline. Latin I3 uses the registered Cormorant display face;
CJK names keep their registered script faces. No name or primary field is
truncated to make room.

### Shared print, type and material rules

- `src/components/cards/craft/print-frame.tsx` draws the project’s own
  interrupted rules, corners and rosettes with original SVG geometry. It is
  used by C2 and I3; E2’s torn paper/photo cuts are its frame treatment.
- `src/lib/card-graphics/pictograms.ts` defines the nine single-colour,
  1.5-stroke neutral record marks: World, Data Center, Service, Race, Clan,
  Grand Company, Languages, Play Style and Free Company. They are original
  print pictograms, not extracted game UI or a web-icon set.
- Official job marks remain small. Large job identity is set with the actual
  abbreviation as type, never by enlarging an official glyph.
- The palette-derived `--craft-paper`, `--craft-ivory`, `--craft-ink`,
  `--craft-brass` and `--craft-red` tokens support the three material families.
  Existing full-sheet textures remain C2/E2/I3 at .65/.55/.50 opacity. Type,
  photo treatment, rules and frames carry the material distinction as well.
- All card text is shadow-free. Contrast comes from ink, paper, image placement
  and non-text photo treatments. The sole `© SQUARE ENIX` credit is bottom
  right, unboxed and without a footer band; a fine outline is painted behind
  the lettering for readability (.045cqi portrait/square, .03cqi wide).

The user-supplied FFXIV screenshot remains the original source. No regeneration,
face/outfit/background replacement or pixel retouching is permitted. Standard
crop, saved position/scale adjustments, non-destructive overlays and E2’s
secondary print impression are allowed; the secondary impression always uses
the same source and saved adjustments.

## Phase 2.7.6 — precision craft authority

This section supersedes the 2.7.5 torn edges, drop-cap treatment, secondary
print plate, proofmark and ornate corner paths. Family identity, information
priority, source photographs and shared preview/export remain the contract.

- E2 uses one four-anchor diagonal photo cut, clean rectangular stock and an
  uncut facts field. The tall version has one controlled panel intrusion.
  No random serration or duplicated paper edge is permitted. The redundant
  secondary impression and decorative scribble are removed.
- The whole E2 name uses one baseline, ink tone and scale per line. Latin
  display weight is 650 with -.035em tracking; KO uses -.015em, JA 0, with
  script-specific leading and fit limits. Initials are not isolated drop caps.
  The large job abbreviation uses the registered serif, normal font kerning,
  -.08em tracking, .95 leading, no skew and enough measure for all RDM letters.
  The authentic official icon remains a separate small profession mark.
- Existing frame paths are reduced to one smooth corner stroke and one top
  central diamond. C2 omits long side rails; I3 retains quiet document rails.
  SVG caps, joins and miter limits are explicit. CSS rails and SVG corners
  share a stroke unit, reach and inset so their junction is deliberate.
- Nine existing pictograms share a 32-unit field, 1.5 stroke, explicit caps,
  miter limit 2 and registry optical offsets. Identity records use intrinsic
  label/value rows with a small optical gap. Do not use inherited `em` track
  minima: these grow from the browser text size and caused overlapping rows.
  JA 4:5 lineage uses the full column to avoid a single-kana orphan.
  CJK name size is capped by planned line units and the ratio's name-column
  measure; planned lines do not rewrap. CJK leading is 1.1. Tight CJK names
  omit optional bio and use intrinsic record rows to protect primary data.
- Information hairlines use `calc(100cqi / 1080)` for portrait/square and
  `calc(100cqi / 1920)` for wide cards: one output pixel at 1x, two at 2x,
  four at uncapped 4x (capped requests follow their actual scale). The browser
  clamps CSS layout borders to a device pixel, so information rules retain a
  transparent 1px layout border and paint a fractional background-gradient
  stripe only on the intended side, with border-box origin. SVG/background
  rules use the same print unit. Border images are excluded: the current
  export rasterizer filled their element area instead of preserving the rule.
  Raster antialiasing at fractional positions is expected; never
  promise that every diagonal or glyph has integer pixel boundaries.
- Material opacity is .45 / .30 / .30 for C2/E2/I3. Craft must also work with
  the material layer disabled. Microtype tracking is restrained by role;
  meaningful text is inspected at actual output size.
- No text shadows, new ornaments, new pictograms or new captions are added.
  Credit remains `© SQUARE ENIX`, outlined and unboxed.

Native, 200% and 400% evidence: `docs/qa/precision-craft/`. Enlargements use
nearest-neighbour scaling to expose the existing raster grid, not to create
new detail. The supplied screenshot sources remain byte-identical.

## Phase 2.7.7 — expressive precision authority

This section supersedes the straight E2 boundary and character-count-based
display sizing above. The three Master IDs, information priorities, materials,
licensed font registry, screenshots, Editor and shared export pipeline remain
the contract.

### Optical name hierarchy

`card-name-envelope.ts` defines per-family, per-ratio visual width/height and
script caps in CQI. `OpticalName` measures the actual loaded typeface at 100px:
advance width, glyph ink height and alpha coverage. Tracking is included in
the width calculation. Final size is the minimum of script cap, available
width, allowed ink height and a reference-ink budget. The reference is `Coner`
in the family's Latin display face/weight; single-line ink height also stays
within that reference's optical height. Multi-line names use the family
envelope. Caps prevent short names from being automatically blown up.

- C2: photographic display, up to 72% visual width in portrait; full image
  leads. The serif and dense CJK glyphs have distinct caps, with actual metrics
  deciding the final size.
- E2: the largest editorial cover role, fitted to the sculpted paper field.
  Coner, paper and RDM positions share one composition. Latin uses weight 650;
  CJK uses separate leading/tracking and measured caps.
- I3: the Latin record name retains Cormorant at 600; Hangul uses its explicit
  script-aware information font at 640, -.01em and 1.03 leading. Japanese uses
  its registered script face at 580. Glyph density differentiates light Kana
  and dense Kanji without a common font-size multiplier.

The client name leaf loads the existing script subsets and the Latin reference,
then measures after fonts settle. It caches font/text metrics (bounded to 256
entries), recalculates on name/preset/ratio or container resize, and ignores
canvas pan/zoom transforms. It does not read or edit screenshot pixels or
change stored character text. Server fallback is conservative; actual Preview
and Export use the measured result.

### Family shape languages

- C2 is an **open frame**: interrupted upper line, shortened lower line and
  removed lower-right corner. No organic paper mask is added to the photograph.
- E2 is **sculpted paper**: actual SVG overlays with three large cubic Bézier
  gestures per ratio. `editorial-shape.ts` holds five authored paths; the
  portrait S-waist, square curve, tall lifted sheet and wide curve are distinct
  compositions. No serrated polygon, random rotation or distortion filter.
  The RDM start meets the lower paper waist; the tall motif crosses the sheet
  entrance. The official profession mark remains small and separate.
- I3 is a **structured grid with partial rules**: unequal rail lengths and
  controlled offsets retain document order while avoiding repeated full-width
  form lines. The portrait and existing ribbon remain the leading elements.

No new ornament, texture, pictogram or Editor feature is introduced. Fractional
background-stripe hairlines, shadow-free text and the outlined/unboxed
`© SQUARE ENIX` credit remain in effect. Evidence, the 45-case matrix and the
image-free paper/type outline are under `docs/qa/expressive-precision/`.

## Reference detail integration — visual version 2.7.7-detail

This pass follows the user's three October 3 reference cards. The earlier
2.7.7 restriction on adding ornament described that completed pass; this
subsequent request explicitly restores print decoration and material detail.
The measured name hierarchy, curved Editorial silhouette and shared renderer
remain the foundation.

### Shared engraving vocabulary

`craft/print-frame.tsx` adds one authored botanical corner: a continuous outer
rail, quieter inset rail and three small curved leaves. Corners reuse the same
geometry by rotation. `craft/engraving-mark.tsx` provides the compass needle
and thin diamond divider. These are decorative project artwork, not official
logos, certification marks or Job glyphs. All SVGs are hidden from assistive
technology. Hairlines continue to use print-unit SVG strokes/background
stripes; no border-image or shadow is introduced.

### Family treatment

- C2: warm brass/ivory foil stops with the existing film grain clipped to live
  text, a correctly proportioned engraved divider, weighted metadata columns
  and script-aware serif information. The photograph stays the primary image.
- E2: warm stock, literal red Job abbreviation typography, ink detail and a
  real-profile pull quote. The existing three-gesture SVG paper edge remains
  smooth; no jagged tear, generated scenery or reconstructed character is used.
- I3: deeper wine stock ribbon, engraved compass and a quiet photo/stock join.
  English values use the existing editorial serif; KO/JA keep registered
  script-aware information faces. Semantic record grouping stays intact.

The only narrative copy is the user's actual bio. No invented service codes,
profile claims or fake handwritten signatures. No new font family or external
asset dependency. Copyright remains the unboxed, thinly outlined
`© SQUARE ENIX` for all ratios.

### Evidence

`docs/qa/reference-detail/` stores actual renderer exports, identical-scale
before/after boards and a reference comparison. The comparison deliberately
shows the unchanged real screenshot, rather than copying the reference's
AI-rendered character/background into the application.

## Phase 2.7.8 — multilingual typography final lock

**Master Card Visual Design: FROZEN.** Canonical IDs remain
`cinematic-master` = C2, `editorial-master` = E2, `identity-master` = I3.
`MASTER_VISUAL_VERSION` is `2.7.8`; the stable identity contract version remains
`2.6.4`. No composition, shape, frame, ornament, material, pictogram, Job motif
or screenshot crop philosophy is redesigned in this phase.

### Family × Script Display contract

| Family | Latin | Korean | Japanese |
| --- | --- | --- | --- |
| C2 | Cormorant Garamond, photographic serif | Noto Serif KR, restrained elegant serif | Noto Serif JP, restrained Mincho |
| E2 | Cormorant Garamond, high-contrast editorial serif | Noto Serif KR, editorial serif | Noto Serif JP, expressive Mincho |
| I3 | Cormorant Garamond, premium record serif | Noto Serif KR, light formal record serif | Noto Serif JP, formal Mincho |

All three are registered variable fonts under the existing SIL OFL 1.1
notices. No font package, external font request or license is added. Master
name font families remain serif across Editorial, Modern, Condensed, Classic
and Clean presets. Existing approved Latin weight, tracking, case and
ratio-leading selectors remain intact; experimental layouts retain their
general preset behavior.

Display optical treatment at the standard family settings:

| Family | KO weight / tracking / leading | JA weight / tracking / leading |
| --- | --- | --- |
| C2 | 460 / −.010em / 1.02 | 470 / −.006em / 1.04 |
| E2 | 480 / −.012em / .98 | 500 / −.003em / 1.00 |
| I3 | 470 / −.009em / 1.03 | 500 / −.004em / 1.04 |

These are optical corrections, not a common font-size multiplier. I3 Korean
Display no longer uses its prior UI Sans at weight 640; Japanese Display no
longer depends on a Sans preset's fallback. The original actual text/ink
measurement, grapheme-safe line layout, per-family visual envelope,
script-aware scale and five ratio caps are unchanged.

### Seven roles and mixed text

`MASTER_TYPOGRAPHY_MAP` in `typography-presets.ts` explicitly defines all
3 families × 3 scripts × 7 roles, including weight, tracking and leading.
`data-master-typography-role` records this treatment without changing the
legacy information-priority/typography-role contract.

| Role | C2 | E2 | I3 |
| --- | --- | --- | --- |
| Display | Cormorant / KR Serif / JP Mincho | Cormorant / KR Serif / JP Mincho | Cormorant / KR Serif / JP Mincho |
| Secondary Display | Corresponding display serif | Corresponding display serif | Corresponding display serif |
| Job | Corresponding serif; existing Latin code treatment retained | Corresponding serif; existing Latin RDM treatment retained | Corresponding record serif |
| Information | DM Sans / Noto Sans KR / Noto Sans JP | DM Sans / Noto Sans KR / Noto Sans JP | Cormorant / Noto Serif KR / Noto Serif JP |
| Label | Latin micro stack / KR Sans / JP Sans | DM Sans / KR Sans / JP Sans | Latin micro stack / KR Sans / JP Sans |
| Caption | DM Sans / KR Sans / JP Sans | DM Sans / KR Sans / JP Sans | Cormorant / KR Serif / JP Mincho |
| Micro | Latin micro stack / KR Sans / JP Sans | Latin micro stack / KR Sans / JP Sans | Latin micro stack / KR Sans / JP Sans |

The existing Latin selector variants for profile quotes, World accents and
numeric/code details remain authoritative; script correction applies to the
actual CJK text in each role. Labels stay subordinate to name and Job. Latin
RDM and level digits retain their approved treatment in a KO/JA interface.

Mixed display runs put Cormorant first, followed by the detected script's
registered Serif face and the other CJK Serif face. Latin letters therefore
keep the family character. Font requests collect every script in a string,
including extended Hangul/Kana/Han ranges. Han-only names follow the locale
policy: Korean in KO, Japanese otherwise. All parts of a name share one
measured line layout and optical fit; no per-character branch markup or
independent baseline is introduced.

### Verification and frozen boundary

`docs/qa/typography-lock/` contains 189 actual 2x PNG/WebP exports and sidecars:
45 basic family/script/ratio cases, 90 all-ratio long/mixed/Kanji cases, six
same-name locale controls, three WebP controls and 45 preset/script controls.
The seven requested comparison boards use those actual exports. Boards 01–03
hold the profile, screenshot, crop, ratio and name `Coner` constant and change
only locale; translated names are compared separately in boards 04–05.

Every captured case passes primary/secondary bounds and name clearance,
optical readiness sampled at the production asset wait, loaded-font checks,
actual 2x dimensions and PNG/WebP geometry checks. All CJK display treatments
and printed role font branches are verified against the map. The six required
outputs were opened for glyph, baseline, weight, hierarchy and clipping review.
Six final live Preview captures also match export geometry and measured name
size; screenshot raster comparison allows delivery resampling/antialiasing.

The 34 protected source hashes retain the name solver/envelopes, assets and
art system, official icon mapping, sample/profile, export, Editor, Undo/Redo
and Draft implementation. Mobile Editor remains usable at 390px. Tests retain
the pre-existing suite and add script, mixed-text, preset and saved-export
coverage. The QA collector is removed from the production application.

Common KO/EN/JA names, supplied mixed names and all five ratios are closed.
Rare glyphs outside the bundled fonts, emoji variation sequences and browser
raster differences remain subjects for actual user QA; detecting a script
does not guarantee that a font contains every Unicode glyph. Future phases
focus on product stability, performance and real user UX. Reopen card visuals
only for the four demonstrated problem categories in the FROZEN status above.

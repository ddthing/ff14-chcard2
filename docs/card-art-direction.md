# Card art direction, Phase 2.6

Historical Phase 2.6 record. Current application and card implementation follow
[`DESIGN.md`](../DESIGN.md) and the [V3 contracts](design/v3/README.md); the older
experimental-layout and attribution descriptions below are not current UI rules.

## Scope and audit

The nine existing layouts were inspected at 4:5. The three A layouts shared a
photo-plus-data-panel rhythm, rounded edges, and similar metadata treatment.
Cinematic had a double frame, Editorial placed a conventional information panel
under the photograph, and ID left a large unstructured gap below its portrait.
B/C had more varied cropping but retained these family shells and panel shadows.

The Phase 2.6 reference is used for photographic priority, typographic contrast,
asymmetry, and disciplined printed detail. It is not traced or reused as an asset.

## Master compositions

- **Cinematic A:** an unframed, full-bleed photographic poster. Name, job, and
  location sit in a limited dark reading field; the photograph carries the card.
- **Editorial A:** a paper cover with a masthead, offset portrait, oversized name,
  and an asymmetric metadata rhythm. A paper-backed title preserves contrast at
  the image boundary.
- **Adventurer ID A:** a ruled document grid with a controlled portrait window,
  paired metadata fields, and a readable unofficial fan-made mark. It contains
  no invented QR, barcode, certification, or verification claim.

Color still comes from AUTO / JOB / CUSTOM tokens. Fonts still come from the
licensed script-specific registry. Official icons remain behind the existing
feature flag and the neutral role fallback.

## Compatibility

The persisted `a` / `b` / `c` identifiers remain valid. A is displayed as Master;
B/C are displayed as Experimental and remain available to existing drafts. The
template chooser uses the real shared renderer, and selecting a Master proof
selects that family's A layout in one history update.

Character data, image adjustment, Undo/Redo, local recovery, ratios, and export
are not replaced. Home consumes the updated card components automatically.

## Verification method

A temporary review route renders each family from fixed sample data without
touching the user's local draft. It is removed before the final build. The review
covers the five ratios, KO / EN / JA, long names, long or absent free companies,
Korea without a data center, maximum language/style selections, grayscale
hierarchy, and an image-free decoration review. Downloads use the production
card export function with font readiness and card-only capture.

Final verification results and visual artifacts are recorded in `qa/phase26/`.

Card samples use their existing optimized WebP originals directly rather than
capturing a smaller Next Image preview derivative. Their natural source
resolution is still the upper bound on photographic detail after strong crops.
Name composition follows the name's script, independently of the UI locale.
On mobile, selecting a Master closes the sheet and returns focus to the tool.

## Phase 2.6.1 Master polish

Cinematic preserves its composition with a lighter existing lower scrim.
Editorial moves the portrait left and uses explicit script-aware title lines
to join type and image. ID moves its 4:5 body upward while preserving footer
breathing room. Master fallback H/T/R marks are removed; microcopy derives
from canonical job, level, service and region data. Han-only name classification
is shared by composition and font loading. Proof exports and geometry results
are in `qa/phase261/`.

## Phase 2.6.2 graphic printing systems

Master A now has a family-specific material and palette interpretation in
`src/lib/card-art-tokens.ts`. Full-sheet transparent WebP materials are generated
by `tools/generate-card-materials.mjs` and rendered as decoded images in the
shared card component, preserving export parity. Cinematic uses fine film
grain; Editorial is an uncoated cover with an oversized Job gutter and
intersecting title/portrait edge; ID combines an archival stock, serif masthead,
sans name, portrait mat and numbered fields. The 4:5 master was reviewed first,
then extended to the other four ratios. Proofs, reference comparison and
native-pixel detail crops are recorded in `qa/phase262/`.

## Phase 2.6.3 composition selection

Nine coded 4:5 studies were exported before Master changes. The chosen
directions are C2 Editorial Cinema, E2 Image Collision, and I3 Premium Card;
the selection/evidence is in `qa/phase263/`. Production A delegates only to
these family presentations under `src/components/cards/masters/`. The shared
root, palette/font resolution, image adjustment and Preview/Export path remain.
Cinematic reduces information to one city-side typography cluster. Editorial
lets the photo cut across publication type while keeping the complete name in
the foreground. ID gives the large portrait and stock record distinct but
connected roles. Ratio-specific composition follows the approved 4:5 masters.

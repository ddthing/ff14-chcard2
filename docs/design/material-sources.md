# Card material sources

Last reviewed: 2026-10-07 (KST)

## Source decision

The four Resource Boy pages below identify their products as **Exclusive** and list Resource Boy as the designer. Resource Boy's current [exclusive-products license](https://resourceboy.com/license/) allows personal and commercial use, including websites and applications, and permits a final project output when source files are not made available separately. It also expressly prohibits uploading original or modified files to public or accessible private repositories, bundling them for distribution, or offering them as standalone downloads.

This card's normal browser build serves static assets from public URLs. Under the project's strict source-redistribution gate, the boundary between a finished card and an extractable source texture is unresolved. Therefore no Resource Boy file is adopted or downloaded. This is a conservative project decision, not a conclusion that the license forbids every use in a web application.

| Candidate | Primary product page | Page metadata | Adoption | Downloaded source |
| --- | --- | --- | --- | --- |
| 100 Noise Textures | [Resource Boy product page](https://resourceboy.com/textures/noise-textures/) | Exclusive; Designed by Resource Boy; personal and commercial use | No | None |
| 50+ White Paper Textures | [Resource Boy product page](https://resourceboy.com/textures/white-paper-textures/) | Exclusive; Designed by Resource Boy; personal and commercial use | No | None |
| 100 Ink Textures | [Resource Boy product page](https://resourceboy.com/textures/ink-textures/) | Exclusive; Designed by Resource Boy; personal and commercial use | No | None |
| 100 Paint Stroke Textures | [Resource Boy product page](https://resourceboy.com/textures/paint-stroke-textures/) | Exclusive; Designed by Resource Boy; personal and commercial use | No | None |

No vendor preview, source image, or derivative was copied into the repository. These links document research and do not imply endorsement or asset use.

## Project-owned maps

The current material maps are deterministic procedural outputs of [`tools/generate-card-materials.mjs`](../../tools/generate-card-materials.mjs). The generator creates pixel buffers from seeded noise and fiber/spot placement, then encodes them as WebP. Its provenance statement says that no external reference pixels, photographs, or AI-generated pixels were used. Each output is 1280 × 1600 RGBA. The checked-in [`material-manifest.json`](../../public/images/materials/material-manifest.json) records generation seeds, source and encoded SHA-256 hashes, alpha statistics, dimensions, encoding settings, and byte sizes.

| Generated output | Intended material | Bytes | Source and attribution |
| --- | --- | ---: | --- |
| `cinematic-film-grain.webp` | Sparse fine luminance grain | 411,220 | Procedural; generator above |
| `editorial-paper-surface.webp` | Low-contrast paper mottle and short fibers | 313,904 | Procedural; generator above |
| `editorial-ink-density.webp` | Sparse neutral ink variation, clipped by the card renderer | 147,160 | Procedural; generator above |
| `identity-matte-fiber.webp` | Quiet matte mottle and short fibers | 113,854 | Procedural; generator above |

Total encoded size is **986,138 bytes**. The existing `cinematic.webp`, `editorial.webp`, and `id-card.webp` remain baseline maps; they are not listed as outputs of this new generator. The project-created maps are governed by the project's applicable terms. This note does not assign them a separate open-source or Creative Commons license.

## Local source-file handling

`.local-assets/resourceboy/` is listed in the workspace `.gitignore` for any future locally held vendor files. This workspace checkout has no usable Git metadata (`git rev-parse` reports that it is not a Git repository), so ignore enforcement and tracked-file status could not be verified here. The directory's ignore rule is not evidence that third-party files are present or safely excluded. Current source records for all four candidates remain `download=0` and `sourceFile=null`.

## Reconsideration gate

Before adopting any candidate, resolve in writing whether the normal public browser delivery is permitted under the source-file and redistribution restrictions, and how source-map extraction, caches, and downloadable card outputs are treated. Until then, keep vendor assets out of runtime/public assets, archives, and deliverables. A newly generated project-owned map is the current source-safe path.

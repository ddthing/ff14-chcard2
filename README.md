# XIV Adventurer Card

A screenshot-first character card studio for FINAL FANTASY XIV players. The cinematic home leads into a local editor that turns an uploaded screenshot into a downloadable card.

The current app UI/UX contract is [DESIGN.md](DESIGN.md), based on the installed shadcn `bJMSkfGi` Stone preset. Read it before changing tokens, components, layout, or CSS.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Before shipping, run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm test` runs portable source checks and labels historical render checks as skipped.
To validate the full local render archive, restore `docs/qa/` and run `npm run test:archive`;
that command fails if a required archive is missing. Archive checks do not replace fresh browser testing.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Brand hero, card stack, template showcase, and ratio preview |
| `/templates` | Interactive selection of Cinematic, Editorial, and Adventurer ID |
| `/create` | Choose a starting template and ratio |
| `/editor` | Upload a screenshot, adjust the image, and edit a card with live preview |
| `/export` | Download the finished card as PNG or WebP; PDF printing is secondary |

## Structure

- `src/app/globals.css`: surface, type, color, and motion tokens
- `src/lib/i18n.tsx`: Korean, English, and Japanese copy and locale state
- `src/lib/motion.ts`: shared durations, easing, springs, and reveal variants
- `src/components/cards/`: reusable, ratio-aware card layouts and data model
- `src/components/home/`: cinematic landing composition and gallery
- `src/components/editor/`: editing controls and live card preview
- `src/store/`: Zustand editor state, bounded undo/redo, and local draft migration
- `src/lib/image-processing.ts`, `src/lib/palette.ts`: upload preparation and automatic colors
- `src/lib/card-export/`: card-only image rendering at selected output dimensions
- `src/data/ffxiv/`: localized jobs, roles, races, clans, companies, languages, play styles, and World/DC records
- `src/data/fonts/`: font license registry and lazy script-specific card font loading
- `src/lib/ffxiv-assets/`, `src/components/ffxiv/`: optional official-asset adapter and role-symbol fallback
- `src/data/samples/coner.ts`: canonical Coner profile, image roles, sample crops, and measured Auto Color palettes
- `public/assets/samples/coner/`: unchanged original player screenshots and optimized WebPs

The card data model keeps character details separate from template, variation, ratio, palette, and image adjustments. Three template families each have A/B/C compositions; all five ratios recompose their content. Drafts and compressed uploaded images remain in this browser's local storage. Undo history and canvas UI state last for the current session. No account or remote storage is used.

The export screen offers PNG and WebP at 1×, 2×, or 4×. A 4:5 card at 2× is 2160 × 2700 pixels. Large 4× requests are capped at 22 megapixels and an 8192-pixel edge to limit browser memory use. Export waits for fonts and images, then renders only the card.

Default samples use the two supplied FINAL FANTASY XIV screenshots and the Coner / Red Mage profile. Original PNG bytes are preserved; runtime WebPs use standard compression. Older generated image URLs are retained only for existing local draft compatibility. Historical QA boards remain unchanged. Local official Fan Kit job icons are opt-in; see docs/ffxiv-assets.md.

## Character data

The editor stores stable IDs alongside the older display strings, so Phase 2 drafts can be restored. Global World and Data Center relationships are based on the [official Lodestone World Status](https://na.finalfantasyxiv.com/lodestone/worldstatus/) roster checked on 2026-09-29. The Korean service has its own five-World dataset; its Data Center and physical region fields remain empty because an official grouping was not confirmed. Changing congestion or preferred status is never saved in a card.

## Typography & font licenses

The UI preloads the local DM Sans Latin WOFF2 face. Card typography offers Editorial, Modern, Condensed, Classic, and Clean pairings for Latin, Korean, and Japanese text. Active CJK faces load on demand through Unicode-range WOFF2 subsets; Editorial and Classic also load script-specific Noto Serif faces. Export waits for the selected card fonts and image to finish loading before capture.

| Family | Use | License |
| --- | --- | --- |
| Cormorant Garamond Variable | Latin editorial display | SIL OFL 1.1 |
| DM Sans Variable | UI, Latin body and modern display | SIL OFL 1.1 |
| Noto Sans KR / JP Variable | Korean and Japanese body/metadata | SIL OFL 1.1 |
| Noto Serif KR / JP Variable | Korean and Japanese editorial/classic display | SIL OFL 1.1 |

The source URLs, exact WOFF2 delivery method, and unmodified copyright/license notices are recorded in [FONT_SOURCES.md](licenses/fonts/FONT_SOURCES.md) and the neighboring `*-OFL.txt` files. No runtime Google Fonts request is made.

To add or update a font, follow [Font onboarding](docs/fonts/ONBOARDING.md), then run `npm run fonts:generate` and `npm run fonts:check`. The registry generates local font CSS and package loaders; release builds check those files before compilation. `.node-version` pins the same Node 24.13.1 runtime used for verification.

## Official FFXIV assets

Runtime job marks use the reviewed, locally pinned XIVAPI originals described in [ffxiv-assets.md](docs/ffxiv-assets.md). The current inventory covers 33 source-backed jobs; Beastmaster and failed sources retain text or role fallbacks. Source artwork, required notices, and source-policy records remain preserved.

`npm run build` explicitly enables these reviewed icons through `tools/build.mjs`, which passes the same build-time flag to Next.js and the static packager. A process environment value of `NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED=false` disables them. Direct Next invocations remain opt-in. The app does not present itself as an official Square Enix service.

## Card Art Direction

Phase 2.6 gives the A layouts three distinct compositions: a photographic
Cinematic poster, an asymmetric Editorial cover, and a ruled Adventurer ID.
B/C remain available as Experimental studies. The template chooser uses the
shared card renderer for its Master proofs.

See [card art direction](docs/card-art-direction.md) and the
[Phase 3.0.3 Job Identity review](docs/releases/phase303-job-lock/README.md).

## Deploying to Cloudflare Pages

This build is configured as a static Next.js export. Use `npm run build:cloudflare` (or `npm run build`) and publish `dist/`; Next.js also emits the same files in `out/`. Release builds include the reviewed job icons without depending on a local environment file. An explicit process environment flag of `false` disables and omits them. See the [Cloudflare deployment notes](docs/releases/phase303-job-lock/DEPLOY_CLOUDFLARE.md).


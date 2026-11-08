# Asterloom

**Make knowledge an adventure.**

Asterloom is a desktop studio in development for turning your materials into source-grounded learning adventures. Build with AI, learn through missions, and play finished games locally.

[Explore the website](https://nimeshbuilds.github.io/asterloom/) · [Try ten guided scenarios](https://nimeshbuilds.github.io/asterloom/scenarios/) · [Share feedback](https://github.com/nimeshbuilds/asterloom/issues) · [NimeshBuilds](https://github.com/nimeshbuilds)

## Current status

The application and website share the public [`nimeshbuilds/asterloom`](https://github.com/nimeshbuilds/asterloom) repository. The website is maintained in `site/` alongside the app; the `gh-pages` branch contains only its published files.

The [v0.7.14 Mac preview](https://github.com/nimeshbuilds/asterloom/releases/tag/v0.7.14) is available for personal learning on macOS 13 or later, for Apple silicon and Intel. It is signed and notarized. **The newer gameplay shown on the website is not included in this older preview.** There is no Windows download in that release.

The landscape images are world artwork. The desktop screenshot is an actual development capture using original sample learning material. It is not a promise of released functionality or a benchmark of learning outcomes.

The product is being developed around:

- Teaching and missions grounded in the learner’s source materials.
- AI-assisted creation, followed by local play without a required AI connection.
- Aster, a guide with local source search and optional AI explanations.
- Saved progress and portable, individual learning adventures.

Provider support and export limitations are documented in the application repository and release notes. Please do not post private learning materials, credentials or provider tokens in public issues.

## Website development

The published site is plain HTML, CSS and JavaScript. It has no application backend, analytics, cookies, external fonts or server build requirement. The scenario guides optionally save checklist progress in local browser storage; no progress is uploaded.

To preview locally from the application repository root:

```sh
python3 -m http.server 4317 --bind 127.0.0.1 --directory site
```

Open `http://127.0.0.1:4317/`. In a standalone checkout of `gh-pages`, omit `--directory site`. The custom 404 page uses the production `/asterloom/` path. GitHub Pages publishes the repository’s `gh-pages` branch from `/`; `.nojekyll` keeps the files unprocessed. See [`docs/github-pages.md`](https://github.com/nimeshbuilds/asterloom/blob/codex/godot-native-player-pilot/docs/github-pages.md) for the subtree deployment steps. Update page metadata and the sitemap if the deployment URL changes.

The gallery works with pointer and keyboard input. Without JavaScript, all three worlds remain visible. The screenshot opens in a native dialog, with a direct image link as a fallback. Reduced-motion preferences are respected, and all fonts are hosted locally.

The scenario hub and its ten guides include original fictional sources, individual and combined ZIP kits, sequential instructions, and source-based answer checks. These are desktop walkthroughs, not browser games or prebuilt games. All instructions and downloads remain usable without JavaScript; filters, copy buttons, and saved checkmarks are optional enhancements. The guides document the published v0.7.14 controls and do not claim a fresh ten-game generation benchmark.

Guide content is maintained in `scripts/site-scenarios.json` in the application repository, with sample sources and a manifest in `site/scenarios/sources/`. Run `node scripts/build-site-scenarios.mjs` from the app repository to update the static guides, ZIP kits, homepage cards and sitemap. The generator uses the app's existing `fflate` dependency; it is not needed to serve this site.

## License and asset provenance

Original site content and Asterloom artwork use the [Asterloom Personal Learning License](./LICENSE). Free personal and family learning is permitted; business and institutional use requires a separate written license. This is a license with use restrictions, not an OSI-approved open-source license.

DM Sans and Fraunces are distributed under their included SIL Open Font License notices in `assets/fonts/`. Artwork and screenshot provenance are recorded in `assets/provenance.json`. Your own learning materials remain yours.

Crafted by [NimeshBuilds](https://github.com/nimeshbuilds).

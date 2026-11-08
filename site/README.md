# Asterloom

**Make knowledge an adventure.**

Asterloom is a desktop studio in development for turning your materials into source-grounded learning adventures. Build with AI, learn through missions, and play finished games locally.

[Explore the website](https://nimeshbuilds.github.io/asterloom-site/) · [Share feedback](https://github.com/nimeshbuilds/asterloom-site/issues) · [NimeshBuilds](https://github.com/nimeshbuilds)

## Current status

This repository contains Asterloom’s public website and its approved artwork. **There is no public application download yet.** Application source and test builds remain private while the learning and gameplay experience is being improved.

The landscape images are world artwork. The desktop screenshot is an actual development capture using original sample learning material. It is not a promise of released functionality or a benchmark of learning outcomes.

The product is being developed around:

- Teaching and missions grounded in the learner’s source materials.
- AI-assisted creation, followed by local play without a required AI connection.
- Aster, a guide with local source search and optional AI explanations.
- Saved progress and portable, individual learning adventures.

Provider support, export platforms and release availability will be documented with a public build. Please do not post private learning materials, credentials or provider tokens in public issues.

## Website development

The site is plain HTML, CSS and JavaScript. It has no application backend, analytics, cookies, external fonts or build dependencies.

To preview locally:

```sh
python3 -m http.server 4317 --bind 127.0.0.1
```

Open `http://127.0.0.1:4317/`. The custom 404 page uses the production `/asterloom-site/` path. GitHub Pages publishes this repository’s `main` branch from `/`; `.nojekyll` keeps the files unprocessed. Update page metadata and the sitemap if the deployment URL changes.

The gallery works with pointer and keyboard input. Without JavaScript, all three worlds remain visible. The screenshot opens in a native dialog, with a direct image link as a fallback. Reduced-motion preferences are respected, and all fonts are hosted locally.

## License and asset provenance

Original site content and Asterloom artwork use the [Asterloom Personal Learning License](./LICENSE). Free personal and family learning is permitted; business and institutional use requires a separate written license. This is a license with use restrictions, not an OSI-approved open-source license.

DM Sans and Fraunces are distributed under their included SIL Open Font License notices in `assets/fonts/`. Artwork and screenshot provenance are recorded in `assets/provenance.json`. Your own learning materials remain yours.

Crafted by [NimeshBuilds](https://github.com/nimeshbuilds).

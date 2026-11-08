# Asterloom public website

The application and buildless website share the public `nimeshbuilds/asterloom` repository. The website source lives in `site/`; GitHub Pages publishes the `gh-pages` branch from `/`:

https://nimeshbuilds.github.io/asterloom/

The `gh-pages` branch contains the website files only. Application changes remain in the normal development branches and pull requests. Publishing the website does not merge or release the application.

## Preview and verification

```sh
python3 -m http.server 4317 --bind 127.0.0.1 --directory site
```

Open `http://127.0.0.1:4317/`. Check desktop and mobile layouts, gallery keyboard navigation, screenshot dialog focus/closing, FAQ expansion, no-JavaScript fallback, and reduced motion. Check accessibility contrast in the page, expanded FAQ and dialog. Verify all external links anonymously.

Only original or approved artwork and synthetic sample material belong on the public site. Asset provenance is in `site/assets/provenance.json`; local fonts retain their license notices. Never copy uploaded learner sources or app data into `site/`.

## Guided scenarios

The `/scenarios/` hub links to ten standalone desktop walkthroughs. Each includes original fictional source material, exact preview controls, expected outcomes, source-based answer checks, and a ZIP with the sources, a text walkthrough, and the license. These are starter materials, not prebuilt games. Creating a game still requires the desktop application and an AI connection.

Edit guide content in `scripts/site-scenarios.json` and sample materials in `site/scenarios/sources/`. Keep `source-manifest.json` consistent with the sources and evidence checks. Regenerate the committed static pages, downloads, homepage cards, and sitemap with:

```sh
node scripts/build-site-scenarios.mjs
```

The generator uses the repository's existing `fflate` dependency. GitHub Pages serves the generated files directly and needs no build runtime. Do not edit the generated guide HTML or ZIPs by hand. Shared presentation and interactions live in `site/scenarios/scenarios.css` and `site/scenarios/scenarios.js`.

Check all ten guides, individual and combined ZIP contents, source copy/fallback, filters, keyboard access, responsive layouts, and no-JavaScript reading/downloads. Checkmarks are stored only in the visitor's browser, separately for each guide; they are not desktop game progress. Blocked or malformed storage must not break the walkthrough. Confirm controls against the published release when updating instructions, and distinguish that code audit from actually generating and playing the sample games.

## Publish an update

Commit the reviewed site changes in this repository first. Split only that directory into a separate history:

```sh
git subtree split --prefix=site -b codex/pages-publish
git ls-tree -r --name-only codex/pages-publish
git push origin codex/pages-publish:gh-pages
```

Use a fresh local split branch name if the example branch already exists. Inspect the tree before pushing: only the public website, its assets, README and license should be present. Use a normal fast-forward push; if `gh-pages` has diverged, reconcile it rather than forcing over changes. All updates stay in this same repository; no second website repository is needed.

GitHub Pages is configured with `build_type: legacy`, source `gh-pages`, path `/`, and HTTPS enforced. `.nojekyll` disables Jekyll processing. After pushing, verify Pages build status and the live website; repository push success is not proof of successful publication.

The landing page describes the published v0.7.14 Mac prerelease separately from current development work. That signed and notarized universal preview supports macOS 13 or later, on Apple silicon and Intel, and has no Windows download. Its gameplay predates the development screenshot on the website. Update release copy only after verifying a new published build. Distinguish illustrative world artwork from actual development screenshots and released functionality.

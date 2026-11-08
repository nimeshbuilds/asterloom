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

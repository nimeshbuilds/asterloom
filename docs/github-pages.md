# Asterloom public website

The buildless site lives in `site/`. GitHub Pages publishes the public **website-only** repository, `nimeshbuilds/asterloom-site`, from `main` at `/`:

https://nimeshbuilds.github.io/asterloom-site/

The application repository stays private. GitHub Free does not include Pages for private organization repositories. Do not change application visibility or push application history to the website repository to work around that constraint.

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
git push https://github.com/nimeshbuilds/asterloom-site.git codex/pages-publish:main
```

Use a fresh local split branch name if the example branch already exists. Inspect the tree before pushing: only the public website, its assets, README and license should be present. Use a normal fast-forward push; if the website repository has diverged, reconcile it rather than forcing over changes.

GitHub Pages is configured with `build_type: legacy`, source `main`, path `/`, and HTTPS enforced. `.nojekyll` disables Jekyll processing. After pushing, verify Pages build status and the live website; repository push success is not proof of successful publication.

The landing page deliberately says the app is in development and no public application download is available. Private releases are not accessible to anonymous visitors. Replace that message only after a public, verified application release exists. Distinguish illustrative world artwork from actual development screenshots and released functionality.

# All-template native factory

This Godot project implements the 75 Asterloom recipe contracts through 18 shared interaction families and their specialized presenters. It replaces the earlier three-template limit **for native contract coverage**, not the studio's complete feature set. The studio exposes it as **Native game preview** until Aster, studio progress, competition and original-material downloads have equivalent native integrations.

Every recipe is defined by its source prerequisites, authored world, learning sequence, actual controls, assessment rules, age constraints and allowed sound palette. Its generated [template skill](../../public/template-skills/README.md) supplies these constraints to game creation. A catalog entry alone does not establish playability: the reference benchmark requires a matching source model and exercises the native evaluator and saved response.

## Authoring and offline play

The AI selects a suitable recipe and produces bounded activity data, cited teaching, mission framing and sound IDs. It does not generate executable Godot code. All 75 recipes have an AI writing contract. Claude receives a complete output schema for every recipe; Codex receives its supported closed schemas and uses validated JSON generation for 19 contracts requiring typed dictionaries. Other providers use the same local source, activity and teaching validators. Schema compatibility does not guarantee model reliability or lesson quality.

`bridge/engine.ts` validates a complete notebook, its current source evidence, the recipe binding and required capabilities before producing a native pack. Imported presentation caches are rebuilt from validated notebook data. Existing source-backed recall cards can become recall activities without being promoted to human-reviewed content.

The native player displays the saved teaching before the activity, runs real Godot controls, and sends bounded data requests to the deterministic assessment bridge. The desktop app supplies its bundled Node runtime. Gameplay requires no AI connection. Draft models retain their review status: preview feedback and participation credit are distinct from independent completion of a reviewed model.

Progress is local to the exact pack revision. Changed sources invalidate the old model. Sound and motion preferences persist independently. The presentation manifest bundles 17 existing world illustrations, 75 recipe overlays, 90 authored score variations and 10 CC0 recordings, plus recipe/age-specific generated sound cues. These counts do not mean 75 unique illustrated worlds or 100 independently composed recordings. Provenance and license files accompany the assets.

Desktop preview packs, progress, media references and interrupted assessment files are stored under the notebook's own directory. Notebook deletion waits for an active preview to close, then removes those owned files while preserving other notebooks and shared sound/motion settings. Unidentifiable files from older experimental previews remain visible as pending cleanup; their ownership is never guessed.

## Reproduce verification

Use the pinned Godot 4.7.2 editor and the repository's Node dependencies:

```sh
node scripts/godot-factory/prepare-tools.mjs --editor-only
node scripts/godot-factory/verify.mjs
```

An existing verified editor can be supplied without another download:

```sh
node scripts/godot-factory/verify.mjs --godot=/absolute/path/to/Godot
```

The runner builds the local bridge and presentation assets, imports the project, checks every recipe's render/assessment/save/source-change behavior, exercises actual control signals, checks response rendering and audio presentation, then independently compares the native and reference results. Diagnostics and machine-readable results are written under `.qa/native-factory-benchmark/`. A failed check fails the command; unmeasured human readability and live-provider quality remain explicitly unverified.

The separate [factory benchmark](../factory-benchmark/README.md) measures real provider generation, repairs, token receipts and elapsed request time. Its supplied-plan writer test and full source-to-game creation test are different measurements. Offline fixtures, mocked providers and schema acceptance must never be reported as successful live generation.

## Build the desktop runtime

```sh
node scripts/godot-factory/prepare-tools.mjs
node scripts/godot-factory/build-installed.mjs --platform=mac
# Or: --platform=windows
npm run build
npm run package:desktop -- --platform=mac
```

The Godot build verifies pinned official export-template checksums, exports Universal Mac or Windows x64, and creates its assessment sidecar and notices under `desktop/vendor/godot-factory/<platform>/`. Existing output directories are intentionally not overwritten. The studio packager requires this runtime and places it inside the desktop bundle; notebook data cannot choose the executable or command line. Exported desktop notebooks inherit the runtime through the existing desktop export flow.

The raw Godot app produced by `build-installed.mjs` is a **runtime component**, not a standalone end-user distribution: it needs the desktop host's assessment runtime, sources and launch configuration. Development signatures are not release signing or notarization. Windows export from a Mac is a build check, not evidence of Windows execution.

After packaging, set `ASTERLOOM_SMOKE_APP` to the desktop executable and run `node scripts/godot-factory/verify-packaged.mjs` on the target operating system. This exercises all 75 reference cases using both the bundled Godot player and the bundled Electron assessment host, then independently compares their results. Mac and Windows CI jobs require this check as well as the complete desktop workflow. Results remain separate from live AI generation quality.

## Remaining release gates

- Native Aster conversation, studio progress synchronization and challenge-room competition need integration before native play replaces the complete studio player.
- Native progress currently belongs to the exact pack revision. Metadata-only edits, including titles or audio choices, can start a separate native progress record; stable assessment-only identity remains a release gate.
- Native source-text export does not replace the studio's original-file download feature.
- Native audio supports MP3, WAV and Ogg. MP4/WebM video playback needs an additional supported decoder; the player currently explains the limitation and retains the provided transcript. Import/transcription support is separate from native video playback.
- Automated controls, positive/wrong response parity and source checks do not prove learning effectiveness, age suitability, accessibility completeness or entertainment value. Those require representative human playtesting.
- Small-model creation reliability must be demonstrated with live results, including failures, refusals, repair costs and withheld sources. There is no blanket claim that every model produces an acceptable game for every source.

The older `scripts/godot-pilot` remains available for compatibility and comparison. Its three richer pilot scenes are not counted as 75 unique bespoke scene implementations.

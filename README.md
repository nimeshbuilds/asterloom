<p align="center"><img src="public/assets/brand/wordmark.svg" width="400" alt="Asterloom — Learning, made playable"/></p>

# Asterloom

A local-first studio for turning your own materials into portable, editable learning adventures. Core creation and play do not require an AI service. Asterloom is made by [NimeshBuilds](https://github.com/NimeshBuilds). Keep several notebooks in the studio; export one selected notebook with its materials and the studio itself.

**Current status: working development build, not a validated commercial release.** The repository distinguishes implemented engines from authored scaffold specifications. Do not market all 75 recipes as distinct complete simulations or claim proven learning benefits before field evaluation.

## Run the studio

Node.js 24 or newer:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4319**. For development use `npm run dev` (Vite on port 5173). The first build downloads the pinned retrieval model; OCR and its four language packs are copied from installed dependencies. Subsequent builds reuse verified local assets.

Asterloom is distributed as a desktop application for Mac and Windows. The local browser endpoint is a development/test shell; standalone HTML games and HTML exports are no longer distributed. Export one notebook as a native application containing its materials and the complete game engine.

For local speech recognition while running this checkout on macOS or Windows, prepare the host decoder/recognizer once with `npm run prepare:media`, then restart `npm start`. This step requires the developer tools described in [the native build guide](desktop/README.md#build-and-run). The selected speech model downloads when transcription is first requested; existing games need no speech model to play. The current preparation script does not build a Linux speech runtime.

## Desktop applications

For a Universal Mac application, use macOS with Node.js 24+ and Xcode Command Line Tools (Clang and Make):

```sh
npm ci
npm run build
npm run prepare:media -- --platform=mac
node desktop/download-tor.mjs --platform=mac
npm run package:desktop -- --platform=mac
```

For Windows x64, build on Windows with CMake, Visual Studio C++ Build Tools and MSYS2 UCRT64 GCC/Make. Follow the [Windows prerequisites and commands](desktop/README.md#build-and-run); a fresh Mac checkout cannot build the Windows speech runtime. The explicit media-preparation step makes setup failures visible early; `package:desktop` also prepares or verifies the required runtime automatically.

Built applications are placed under `release/desktop/` for the selected platform:

- `Asterloom-darwin-universal/Asterloom.app` — one Mac app for Apple Silicon and Intel, macOS 13+.
- `Asterloom-win32-x64/Asterloom.exe` — Windows x64; keep its entire folder together.

Recipients need no Node.js, compilers, FFmpeg or Tesseract installation. The app includes the decoder/recognizer executables, four OCR languages and the local retrieval model; speech weights are a verified first-use download and are then reused offline. Extract a downloaded archive before launching it.

The default packager creates development applications. A publisher can sign a prepared macOS bundle with `node scripts/sign-desktop.mjs --identity "Developer ID Application: …" --app source.app --output signed.app`; notarization remains a separate distribution step. CI artifacts are unsigned. Modified game exports require their own publisher signature/notarization for trusted distribution; they cannot inherit the original publisher seal. Normal OS trust protections remain in effect.

In the desktop studio, open a notebook → **Export** → choose a platform. The export contains exactly that notebook and the complete studio. The same-platform runtime can be copied from the running application. Cross-platform exports need the corresponding runtime template installed alongside the other releases. Notebook recipient profiles are isolated from the creator's profile. No provider keys, room secrets or personal progress are embedded.

## What works

- A library of separate learning notebooks, editable source materials and source-linked challenges.
- TXT, Markdown, copied text, CSV, JSON, SRT/VTT and saved HTML source imports in the desktop studio.
- Local PDF, DOCX, PPTX, XLSX and EPUB extraction; bounded public-page import with Mozilla Readability, preserved headings/lists/code/tables, access-wall detection, final-URL provenance and downloadable original snapshots.
- Streamed MP3/MP4 and supported recording uploads up to 2 GiB per file in the desktop studio. Original bytes are retained by SHA-256; local Whisper.cpp transcription produces editable timestamps, with managed, verified Base/Small model downloads and offline reuse. Speech jobs support progress, cancel, restart recovery and retry. Machine transcripts and their generated learning activities require author review.
- Local Tesseract/WASM text recognition for images and up to 24 selected video frames, with English, Spanish, French and German bundled. The picture, raw OCR, corrected text, parent recording and capture timestamp remain linked. Recognition does not interpret diagrams; only explicitly checked text becomes a ready learning source.
- Deterministic source extraction, exact evidence offsets/revisions, local hybrid lexical + semantic retrieval, evidence-selected objective drafts and author review. Desktop authoring uses the bundled q8 MiniLM encoder through ONNX WASM by default; WebGPU is attempted when supported. Its English-focused similarity estimates select evidence, not authoritative answers. No remote model or API tokens are required.
- New document and text uploads preserve their original files with SHA-256 checksums. Originals travel with the notebook as downloadable attachments alongside extracted text; earlier notebooks require reimport to add originals.
- **Seventeen bounded activity engines**: sequences, classification, policy decisions, relationship graphs, budgets, rubrics, diagram labels, worked completion, data investigation, media checkpoints, stateful scenarios, construction, explanation, source-picture exploration, changing-rule sorting, puppet/pretend play and picture build-and-tell. Specialized scenario interfaces include prediction, multi-case planning, role perspectives, dialogue and supplied prompt/output comparison.
- A versioned catalog of **75 scaffold specifications**: 25 general, 25 domain/professional and 25 age-adapted recipes. Each recipe has a runtime contract and content prerequisites. A suitable, author-reviewed model must be explicitly linked before the recipe is playable. These recipes reuse engines; they are not 75 independently validated simulations.
- Structured activity authoring, examples, strict JSON import/export, validation and live interactive boards. Source changes invalidate dependent evidence; rebuilding refreshes extracted structures.
- A deterministic chapter outline with verbatim evidence and separately identified fictional scenery.
- Source-linked visual authoring: upload an illustration or optionally generate one through an image API. Drafts require author review and never become factual source material. Reviewed figures remain attached through export/remix.
- A logo/icon system, six overall themes, and 75 authored world compositions with domain objects, age profiles, live state-driven scenes and prepared SVG previews. PixiJS scenes retain accessible DOM controls and a simpler rendering fallback. Recipes share engines and presentation primitives.
- 100 offline soundtrack choices: ten CC0 recordings and 90 original modular interactive scores. Each recipe has a prepared pairing and feedback cue profile. Music and feedback have independent opt-in/volume controls, narration ducking and reduced-motion visual feedback. The original scores share synthesized instruments and compositional grammar; they are not 90 additional recordings.
- Durable local notebook/progress storage, interrupted-session recovery and separate progress backups. Structured attempts use transparent spaced-review intervals; assisted, collaborative and caregiver-reviewed work earns no independent-learning credit.
- Portable `.learnpack` notebooks and native application exports with create/remix/re-export capability. Compact `.learnpack` backups embed recording bytes (20 MiB/file, 48 MiB media total). Large `.learnzip` archives stream the selected notebook and recordings, verify every checksum and reopen in the desktop studio; native app exports also include the selected recordings.
- Private asynchronous challenge rooms bind to the same source text and recording bytes. Durable per-result outboxes retry in the background after the dialog closes or the app reopens; uncertain acknowledgments do not duplicate scores. Tor reconnect and explicit on/off choices are preserved. Scores are friendly, self-reported competition.
- Optional excerpt-only game-model drafting and wording refinement using the user's OpenAI, Anthropic, xAI or compatible API endpoint. A copy/paste prompt-and-JSON workflow also works with an existing assistant subscription. API keys remain in session memory. Provider catalogs are fetched dynamically with a manual model-ID fallback. Optional ChatGPT-plan OAuth plumbing uses PKCE, verified identity tokens, scope checks, encrypted desktop credentials and the public Responses API. This distribution leaves subscription sign-in disabled pending provider eligibility/approval; commercial integration is not established merely by having working code. Claude subscription login requires provider approval, and a general Grok subscription integration has not been verified. No CLI or user token scraping is used.
- Opt-in Tor rooms with a verified bundled runtime, onion-only proxy routing, saved outboxes and restricted peer endpoints. Separate-process and native-renderer peer tests have passed locally; the host must remain open for synchronization.

## Sources are the game material

The engine extracts only structures it can support. Clear definitions and factual prose yield recall practice. Numbered steps and explicit structured relationships can yield process and model activities. Well-formed numeric CSV/TSV/Markdown tables can produce data investigations with exact row evidence. Guided creators prepare source-backed decision rules, resource constraints, visual targets, bounded scenarios, construction models, reasoning chains, recordings and children’s scenes. Other specialized contracts can be edited as validated JSON. Unreviewed structured models remain available for unscored author previews; they cannot award points, completion, independent-learning credit or review intervals. AI-refined recall wording must be reviewed before it enters a scored session. Review downgrades and progress restores clear obsolete completion while preserving historical effort. Optional AI receives only a creator-selected passage for a model draft; its response must pass local validation and still needs author review. The engine does not invent scientific consequences or treat an arbitrary text as a validated simulation.

NotebookLM and YouTube URLs use an assisted source/transcript workflow. A share URL alone is not a guaranteed full export interface. Rights to reuse original content remain the creator's responsibility.

## Learning design

Retrieval, spaced review, worked examples, meaningful choice, actionable feedback and source-linked explanation inform the implementation. Fixed visual/auditory/kinesthetic learner labels are not used. Age bands supply editable defaults; they are not developmental diagnoses.

Completion, supported practice, independent recall, constrained-system performance and self-assessment are different evidence. Open-ended prose is not automatically graded as objectively correct. Enjoyment, voluntary return, delayed retention and transfer must be measured independently in learner studies.

Research and implementation rules: [`docs/learning-research.md`](docs/learning-research.md).

## Validation

```sh
npm test
npm run test:server
npm run test:desktop
npm run build
npx playwright install chromium
npm run test:e2e
```

Native smoke test after packaging:

```sh
ASTERLOOM_NATIVE_SMOKE=1 ASTERLOOM_SMOKE_APP="/absolute/path/to/Asterloom.app/Contents/MacOS/Asterloom" node --test desktop/native-smoke.test.mjs
```

GitHub Actions runs web/source/service checks and native application export/replay tests on real Windows and macOS runners. Tests cover behavior and source integrity; they do not establish learning efficacy or market demand.

## Architecture

- React + TypeScript; DOM/SVG interactions for inspectable, keyboard-accessible activities.
- Trusted, deterministic engines execute bounded notebook data; imported notebooks never supply arbitrary executable code.
- Vite builds the internal desktop renderer with embedded fonts, art and music. It does not produce a standalone HTML game distribution.
- Node local companion handles document import, provider proxy, durable speech jobs, streaming recording assets and persistent private rooms. Native FFmpeg decodes audio; whisper.cpp runs local speech recognition. Bundled Tesseract WASM handles visible text.
- Electron application packages the same studio and companion, using an isolated renderer and a stable custom origin for local saves.
- A versioned scaffold schema and structured activity schema extend the catalog through declarative definitions.

## Release work that remains

- Validate fun, age appropriateness, retention and transfer with representative learners.
- Expand authoring convenience and professionally reviewed domain fixture libraries. Bounded prepared models do not establish the behavior of live cloud platforms, professional systems or arbitrary source content.
- Evaluate transcription/OCR accuracy with representative accents, languages, noise, layouts and diagrams; the shipped models recognize speech/text and do not establish subject-matter correctness.
- Broaden Tor reliability testing across real networks and platforms, and finish redistribution review for every bundled dependency.
- Complete signing/notarization, distribution/update processes, support and any paid checkout offering.
- Test accessibility with assistive technology and broaden browser/OS/device coverage.

## Assets and rights

Composer credits and original notices are in [`public/assets/licenses/`](public/assets/licenses/). The ten recordings are CC0 works by **Juhani Junkala / SubspaceAudio** and **hernandack**. The 90 original modular scores and feedback cues are project assets covered by the Asterloom license, not additional CC0 recordings. DM Sans and Fraunces use the SIL Open Font License; Lucide uses ISC. Asterloom source and original assets use the Personal Learning License in `LICENSE`; third-party assets retain their original licenses. Included-asset permissions for notebook exports are documented separately.

## Playable example

After building, run `npx tsx scripts/build-showcase.ts`. `release/examples/The-Systems-Expedition.learnpack` contains eight structured activities with original sources. Open it in Asterloom, then export a native game for the target platform.

Build `npx tsx scripts/build-laboratories.ts` for two more complete offline notebooks: **The Learning Laboratories** and **The Little Explorers**. They include original teaching sources, editable models and prepared assets, and make no model calls during play.

## Personal learning and commercial licensing

The [Asterloom Personal Learning License](LICENSE) permits individual and family
learning and free sharing for those purposes. Business and institutional uses
require a separate written commercial agreement. This is **source-available**,
not OSI open source. Your materials remain yours, while the runtime inside an
export retains its license. Third-party libraries, models, music and fonts retain
their own terms. See [licensing rationale](docs/licensing.md).

## Local retrieval assets

`npm run build` prepares integrity-checked model, tokenizer, ONNX WASM and notice
files from the pinned manifest. After the first preparation, those files are reused
locally. The desktop bundle includes them; gameplay never loads them or sends
source text to a provider. Exact lexical matching remains available as a local
retrieval fallback. Native exported games include the complete editing studio.
Model quality, enjoyment and learning transfer still require representative
evaluation.

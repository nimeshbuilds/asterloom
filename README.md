<p align="center"><img src="public/assets/brand/wordmark.svg" width="400" alt="Asterloom — Learning, made playable"/></p>

# Asterloom

A local-first studio for turning your own materials into portable, editable learning adventures. Core creation and play do not require an AI service. Keep several notebooks in the studio; export one selected notebook with its materials and the studio itself.

**Current status: working development build, not a validated commercial release.** The repository distinguishes implemented engines from authored scaffold specifications. Do not market all 75 recipes as distinct complete simulations or claim proven learning benefits before field evaluation.

## Run the studio

Node.js 24 or newer:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4319**. For development use `npm run dev` (Vite on port 5173). The self-contained `release/Asterloom-Studio.html` can be double-clicked without Node, an account, an API key, or an internet connection. The local companion adds document parsing, URL imports and shared challenge rooms.

## Desktop applications

```sh
npm run build
npm run package:desktop
```

Built applications are placed under `release/desktop/`:

- `Asterloom-darwin-arm64/Asterloom.app` — Apple Silicon Mac.
- `Asterloom-darwin-x64/Asterloom.app` — Intel Mac.
- `Asterloom-win32-x64/Asterloom.exe` — Windows x64; keep its entire folder together.

Development applications are unsigned/unnotarized. Normal OS trust protections remain in effect. Signed, notarized releases require the publisher's signing identities; no bypass of those protections is included.

In the desktop studio, open a notebook → **Export** → choose a platform. The export contains exactly that notebook and the complete studio. The same-platform runtime can be copied from the running application. Cross-platform exports need the corresponding runtime template installed alongside the other releases. Notebook recipient profiles are isolated from the creator's profile. No provider keys, room secrets or personal progress are embedded.

## What works

- A library of separate learning notebooks, editable source materials and source-linked challenges.
- TXT, Markdown, copied text, CSV, JSON, SRT/VTT and HTML imports in the browser.
- Local PDF, DOCX, PPTX, XLSX and EPUB extraction; ordinary website text import with network restrictions.
- MP3/MP4 and supported media attachments. Supply transcripts/descriptions where automatic extraction is unavailable.
- Deterministic source extraction, local keyword retrieval, source evidence checks and author review.
- Ten reusable practice interaction families; **seven structured activity engines**: sequences, classification, policy decisions, relationship graphs, budgets, rubrics and diagram labels.
- A versioned catalog of **75 scaffold specifications**: 25 general, 25 domain/professional and 25 age-adapted recipes. Explicit content prerequisites govern what can be built reliably.
- Structured activity authoring, examples, strict JSON import/export, validation and live interactive boards.
- Six illustrated world themes, a logo/icon system and 75 prepared scaffold illustrations.
- Ten offline CC0 music recordings, prepared scaffold pairings, volume/mute, optional synthesized fallback and interaction sounds.
- Durable local notebook/progress storage, interrupted-session recovery and separate progress backups.
- Portable `.learnpack` and self-contained HTML exports with create/remix/re-export capability.
- Private asynchronous challenge rooms, compatible-content fingerprints, persisted results, retry queues and deduplicated standings. Scores are friendly, self-reported competition.
- Optional wording refinement using the user's OpenAI, Anthropic, xAI or compatible API endpoint. Provider credentials remain ephemeral. A chat subscription is not assumed to grant third-party API access.

## Sources are the game material

The engine extracts only structures it can support. Clear definitions and factual prose yield recall practice. Numbered steps and explicit structured relationships can yield process and model activities. The author can prepare source-backed decision rules, resource constraints and visual targets with the activity builder. The engine does not invent scientific consequences or treat an arbitrary text as a validated simulation.

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
- Vite builds a self-contained offline browser studio with embedded fonts, art and music.
- Node local companion handles document import, provider proxy and persistent private rooms.
- Electron application packages the same studio and companion, using an isolated renderer and a stable custom origin for local saves.
- A versioned scaffold schema and structured activity schema extend the catalog through declarative definitions.

## Release work that remains

- Validate fun, age appropriateness, retention and transfer with representative learners.
- Complete specialized fixtures/engines and interaction polish for recipes whose prerequisites go beyond the existing engines.
- Ship validated local audio transcription/OCR models if automatic media understanding is advertised.
- Verify Tor peer transport on real networks and platforms before making reliability claims.
- Complete signing/notarization, distribution/update processes, support and any paid checkout offering.
- Test accessibility with assistive technology and broaden browser/OS/device coverage.

## Assets and rights

Composer credits and original notices are in [`public/assets/licenses/`](public/assets/licenses/). The ten recordings are CC0 works by **Juhani Junkala / SubspaceAudio** and **hernandack**. DM Sans and Fraunces use the SIL Open Font License; Lucide uses ISC. Project source is private and unlicensed unless the owner supplies a commercial or open-source license. Included-asset permissions for notebook exports are documented separately.

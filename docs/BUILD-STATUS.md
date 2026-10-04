# Build status and evidence

Asterloom 0.6.1 is a working development preview. It implements a local creator and player, selected-notebook native exports with the full offline remixing studio, saved progress, optional model/visual assistance, and asynchronous private competition. The project belongs to the private NimeshBuilds/asterloom repository.

## Source-first selection in 0.6.1

Activity candidates now require current, readable source evidence and a compatible explicitly bound model. A title, theme, goal or age change cannot supply missing facts or rules. Upload and rebuild share the same preparation path. Numbered glossaries retain definition practice without becoming procedures. Lesson context stays within cited source units; an unrelated neighboring procedure cannot replace the target lesson. Unsupported or stale activities remain editable but are not offered as learning missions. Exact citation checks establish provenance, not semantic entailment; authored and AI-derived rules still require review.

## Activity production

The catalog contains 75 recipes (50 general/domain plus 25 children’s recipes). Seventeen bounded activity engines and specialized presenters now cover the catalog’s defined runtime interfaces. Recipes share engines. They do not represent 75 bespoke simulations or professionally validated courses.

The engine compiles explicit source structures: definitions, steps, relationships, categories and well-formed numeric tables. Guided forms support deeper authored models. Every factual activity carries exact source excerpts. Source changes invalidate affected models and saved answers. Local validation checks schema, references, solvability and bounded state, but does not prove that prose entails an author’s interpretation. Human content review remains necessary.

Stateful scenarios replay authored actions, resource costs, guarded transitions and observations. Prediction and campaign interfaces record commitments before reveal. Dialogue and perspective models use supplied roles and lines. Prompt comparison replays supplied outputs with model/version context and reviewed rubrics; it makes no inference calls. Construction accepts any model satisfying the stated constraints, not only a memorized layout. Explanation uses claim/evidence/reasoning alternatives; partner turns and exact code-span review have dedicated interfaces. Pictures use actual supplied raster crops. Children’s scenes support puppet turns and prop placement, and build-and-tell keeps caregiver assessment distinct from automatic checks.

AI is optional. Source-grounded drafts and image briefs run through user-selected providers, with exact evidence, structural validation, and author review. Request-scoped API keys stay out of storage and exports. The personal desktop edition installs official local engines for supported subscription connections; per-tool distribution conditions and verification limits are documented in [provider-integrations.md](provider-integrations.md). Actual provider account eligibility and successful inference require account-specific validation; mocked authentication tests are not evidence of a live subscription request.

## Included in the 0.3 upgrade

- Exact evidence offsets, revision checks, objective selection and bundled local MiniLM semantic retrieval with WASM/WebGPU fallback; the English-focused encoder does not generate answers. Exact lexical retrieval remains available as a local fallback.
- Seventy-five explicit world compositions, age-aware presentation, PixiJS scenes with accessible controls and reduced-motion/SVG fallbacks.
- Original source attachments with checksums; Mozilla Readability and structured public-page extraction preserve code, tables, headings and source links. Persistent import receipts disclose partial pages and assisted imports. Embedded web assets are not automatically downloaded.
- One Universal Mac target for Intel and Apple Silicon, plus Windows x64; signing and notarization are separately verified distribution properties.
- NimeshBuilds branding and a personal/family-learning license, with separate commercial permission required. This is source-available licensing, not OSI open source.

## Included in the 0.4 recording upgrade

- Streamed audio/video attachments up to 2 GiB per recording, range-capable playback, raw-byte checksums, cancellation and re-import repair. Recordings no longer need to be base64 strings in notebook storage.
- Pinned, locally built FFmpeg 9.0.2 LGPL decoding and whisper.cpp 1.9.4 speech recognition for up to two-hour recordings. The default Small and optional Base model download once with exact size/SHA-256 verification, then run offline. The complete app includes native decoders and corresponding sources; model weights use first-use download to keep the installer smaller.
- Editable timestamped captions, retained caption/ASR provenance, uncertain speech flags, explicit correction review, saved cue edits/playhead and checkpoint choices. Deterministic source-based checkpoint and structure drafts remain unscored until approved; rebuilding cannot bypass review.
- Bundled local Tesseract 7/WASM OCR in four languages, retained image/video-frame evidence, bounded frame selection and explicit correction review. Raw recognition confidence is separate from factual review. Browser-provided approximate frame positions are disclosed.
- `.learnzip` large-recording archives with streamed verification and bounded ZIP64 handling. Native exported games carry the selected recordings and remix studio; compact `.learnpack` backups hydrate eligible media into verified bytes. Missing external file references fail clearly instead of producing incomplete games.
- Source media identity participates in progress restoration and room matching. Durable background room delivery survives closing the dialog and retries uncertain acknowledgments idempotently; explicit Tor off remains respected.

## The 0.6 gameplay and source overhaul

The prior compiler could create arbitrary missing-word tasks, confuse numbered facts with procedures, and separate a question from its surrounding explanation. The new compiler extracts named concepts, keeps same-section alternatives, and requires actual procedure cues. Headings, paragraphs, tables, code, and caption boundaries determine source units. Complete body text remains available in a chapter-based campaign even when the source cannot substantiate a scored model. There is no fallback that invents a simulation's rules from ambiguous prose.

The source corpus audit includes eleven inputs spanning prose, a real research document, glossary definitions, procedures, numbered facts, code, tables, captions, and ambiguous definitions. It records exact spans, source coverage and validated portable outputs. The catalog audit distinguishes all 75 recipe contracts and 17 engines from the 37 recipes with explicitly bound, source-validated example fixtures (plus source-recall corpus coverage); it does not claim that every recipe has received individual learner testing.

Teaching now has a source-connected assignment, worked placement, supported construction of a concept/procedure kit, and a handoff into the mission. The lesson's factual content comes from cited material. The fictional setting is separated from factual consequences. Unsupported prose remains an evidence-and-explanation investigation with saved field notes, not a guessed answer key. Ordinary audio/video speech likewise creates timed listening observations with exact transcript evidence and saved field notes; these remain self-reviewed, without correctness points or independent mastery.

Sequence missions now use a route workshop: drag or select source steps into stations and trace the learner’s own arrangement before evaluating its ordering constraints. This is a model preview, not an invented causal simulation. Completion uses a tray and contextual model slots. Classification places source items in category inventories. Dependency tasks connect visible source nodes with directed, labeled relationships. Data investigation lets learners inspect records, compare observations, and pin supporting rows. Accessible direct controls remain available. The illustrated scene provides context rather than duplicating a second answer form above the actual game.

Play occupies a dedicated stage. A persistent HUD displays committed score, XP, mission progress, and whether the current attempt is preparation, supported practice, independent work, reflection, or an unreviewed preview. Supported recall retries cannot produce independent mastery credit. Field notes and explored draft models do not earn assessment points. Correcting a wrong answer does not count the question twice. Source chapters, saved kits and notes, model state, and recall sessions survive reopening. A return invitation surfaces due reviews, unfinished models and new source chapters without streak pressure. Due reviews, unseen material and missed ideas take precedence over repeated first-day success.

Only recognizable, untouched legacy generated cards are migrated automatically. Reviewed, authored, AI-refined and edited work is preserved. Source revisions still invalidate affected assessment evidence and completion.

The soundtrack library contains 100 choices: ten independently licensed CC0 recordings plus 90 original modular interactive scores, with shared synthesized instruments and compositional grammar. Seventy-five recipes have prepared score assignments and supportive cue profiles. Short scaffold-specific selection, placement, movement, connection, removal, inspection, reveal and commit sounds acknowledge meaningful actions without implying correctness. Typing and playback ticks remain silent; evaluated outcomes take priority. Background music and feedback are independently controlled, quieted around narration, and optional. Visual reactions use eight presentation grammars and the recipe’s authored objects, with reduced-motion alternatives.

## Evidence and limits

Use the current commit’s GitHub Actions checks and local release verification files as the source of truth for executed tests. CI runs web/source/service tests plus actual Windows and macOS save/restart/export/play/remix tests. The expanded native test now exercises a data-investigation answer across real application restart as well as recall and recipient editing. Renderer tests exercise imported notebooks, separate learner profiles, accessible controls, source integrity and room synchronization. The renderer harness is development/test infrastructure; the product distributes native apps and editable notebook/archive files, not standalone HTML games. No paid model request is required by the automated tests.

Prior baseline cbf1414 passed all three CI jobs in run 37177456590. Local baseline evidence includes Apple Silicon and Intel/Rosetta launches, Developer ID macOS signatures, and real Tor peer connectivity. New versioned artifacts require their own verification; an older green run does not certify changed code.

There is no claim yet of validated child suitability, improved learning outcomes, superior enjoyment, commercial readiness, universal extraction, guaranteed provider subscription access or tamper-proof offline rankings. Completion, assisted work, independent success and open-ended self/caregiver review remain different outcomes. Local speech transcription and visible-text recognition have real-media regression coverage; this does not establish accuracy for every language, accent, codec or source layout. Unsupported visual codecs receive a clear message while usable audio/transcripts remain available. NotebookLM and YouTube links use assisted official export/transcript routes, not universal private-content retrieval.

## Commercial release gates

- Evaluate enjoyment, usability, delayed retention and transfer with representative adults and children under appropriate caregiver supervision.
- Commission expert review for professional-domain content and broaden prepared fixture libraries and guided specialized authoring.
- Complete publisher notarization, Windows signing, installers/updates, legal review of license terms, support and checkout if selling directly.
- Complete redistribution review for native dependencies, included Tor source/notices and exported asset permissions.
- Exercise assistive technology, broader devices, restricted networks and long-running Tor rooms. Hosts must remain open for synchronization.

The preview is usable for product evaluation. These remaining gates must be completed before describing it as a finished commercial learning platform.

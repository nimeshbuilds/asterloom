# Creation and gameplay review — 0.7

The previous default studio exposed internal preparation, evidence selection, scaffold choices and authoring panels before a learner could play. It also seeded example notebooks into an empty library and selected the same recall soundtrack across otherwise different notebooks. Those are concrete experience defects, not a lack of advertised template count.

## Implemented creation direction

The default path is **add sources → optional age and goal → connect/select AI → Create game → Play**. The connection opens in place. Advanced editing is a secondary disclosure, and scaffolds are internal. Examples are opt-in and labeled. A new project's draft/ready state persists in its portable notebook; failed or canceled creation cannot masquerade as a completed game after restart. Previously authored and imported games continue to play offline.

AI inventories every readable source unit, plans supported activities, writes digestible cited teaching and missions, and checks generated claims against their supporting spans. The planner can choose 50 runtime-compatible recipes across 10 writer families, using each recipe’s domain, mechanic, age range and source prerequisites. The remaining 25 catalog recipes need specialized writer modes or other engine/media workflows and are not offered as automatic generation choices. Each batch has at most three units and 12,000 source characters. Exact evidence, identifiers, age/recipe compatibility, feasible constructions and reachable scenarios are validated locally. Unsupported material remains explicit source study. No generated code runs, and credentials never enter the exported notebook. A run stops at 60 actual requests and can resume saved stages; it never silently omits later units. Content, age, goal, provider and model fingerprints prevent stale cache reuse. Failed/canceled calls remain in the usage ledger, and unknown token counts are not reported as zero.

Source-quote and structural validation do not prove semantic correctness. Generated models remain unreviewed. Players can receive a clearly labeled practice score against those model rules without gaining verified mastery, review scheduling or competitive credit. Reviewed activities retain their existing scoring path. Scores are recomputed from saved responses, not accepted from imported score fields.

## Gameplay and audio

The construction workbench turns a source-defined system into place/connect/trace/repair actions. Its probe follows the player's actual graph, reporting typed-port and capacity conditions from the authored model; it is not a real-world engineering simulator. Accessible text controls remain available alongside visual interaction.

Music selection now considers notebook, mission, mechanic, scene and age. Reading and active play have different arrangements; manual pinning is separate from adaptive selection. Phrase variants avoid restarting the same intro at every transition, and lifecycle checks prevent old feedback timers from restarting music. The bundled catalog remains 10 CC0 recordings and 90 original prepared scores. Catalog size alone is not evidence of musical quality or learner preference.

## Aster and prepared artwork

Aster combines a consistent original 3D-style portrait and 50 illustrated expressions and poses with deterministic runtime guidance. AI selects allowed expressions for welcome, explanation, hints, retry, success and reflection in the existing planning call. It reuses the lesson's source-bound teaching instead of creating a second factual script. Her artwork is a raster character render; there is no claim of a rigged 3D character model.

Automatic bubbles are occasional, dismissible process guidance or committed scores. Source hints require a deliberate reveal and a successful assistance save. Per-mission/card scope changes cancel pending answers. Questions search the notebook through the bundled MiniLM/WASM model plus lexical retrieval and return exact cited excerpts; retrieval is not generated reasoning or an authoritative answer. Quiet/off controls and reduced motion are retained across restart.

The visual package adds nine generated environment paintings shared by the 75 existing authored compositions, including distinct younger-child and junior settings. Source-specific factual diagrams still require source evidence and review. Generated scenery supplies atmosphere, not scientific facts.

Task/process feedback and learner control inform these decisions; adding an avatar does not itself prove better learning. [Hattie and Timperley, The Power of Feedback](https://journals.sagepub.com/doi/10.3102/003465430298487), [animated-agent feedback experiment](https://www.sciencedirect.com/science/article/pii/S0360131513001103).

## Measured AI usage

The report records provider/model, stage, status, and provider-reported counts for actual requests, including optional wording refinement, individual mission drafts and image generation. Every call must durably save a started receipt before it can spend usage. Receipt updates merge by request identity so concurrent tools preserve one another’s history. Total-only image reports remain visible without inventing an input/output split. Input includes cache reads; Anthropic cache writes are also included in total input. Cached inputs and reasoning outputs are shown as subsets. Reused stages add no new receipt. Codex fresh-thread totals are captured from token-usage events. Grok ACP context occupancy is not a billed token counter and is shown as unreported when separate input/output measurements are absent. Provider errors are sanitized; receipts exclude credentials and submitted text. Imported receipts are historical notebook data, not verified billing statements.

[OpenAI usage and caching](https://developers.openai.com/api/docs/guides/prompt-caching), [Anthropic cache counters](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [xAI cache usage](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/usage-and-pricing).

## Engine decision

The current desktop shell is Electron/React, with PixiJS rendering, deterministic domain models, local retrieval and bundled media. PixiJS provides rendering, input events and a frame loop; it is not a complete game-design system. [PixiJS architecture](https://pixijs.com/8.x/guides/concepts/architecture)

Phaser is the strongest low-disruption candidate for future 2D action scenes because it uses JavaScript/TypeScript and can run inside a desktop wrapper. It is not a native desktop exporter by itself. Its framework is MIT licensed. [Phaser overview](https://docs.phaser.io/phaser/getting-started/what-is-phaser), [license](https://phaser.io/download/license)

Godot is a credible native alternative if the product needs a separate runtime or extensive 3D/physics. Official Mac export templates produce a Universal 2 application; signing and notarization remain required distribution work. Adopting it here would require a real runtime, persistence and packaging migration. [Godot macOS exports](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_macos.html)

GDevelop offers an open-source creator with its own editor and JavaScript runtime, but embedding a second authoring product would not by itself simplify this app's learner workflow. [GDevelop runtime](https://docs.gdevelop.io/GDJS%20Runtime%20Documentation/)

This release keeps the current renderer and improves actual interactions rather than shipping an unused engine dependency. A future engine adapter should consume validated portable mission data and report actions back to the same deterministic state model.

## Experience and learning acceptance

The source-first entry and progressive disclosure follow the useful interaction pattern of a simple primary workflow with advanced controls available when needed. [Notebook creation workflow](https://support.google.com/gemininotebook/answer/16206563?hl=en), [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)

Automated checks establish correctness, accessibility, save/reload behavior, source provenance and export completeness. They cannot establish that every generated game is enjoyable or that it improves delayed retention. Those claims require observation with representative learners and delayed learning/transfer measurements. This version is a preview with explicit capabilities and limits, not evidence that the entire catalog meets that quality bar.

# Native factory benchmark

This benchmark keeps three different claims separate:

1. **Reference contracts:** 75 explicitly bound source/model fixtures, including 37 original fictional specifications added for missing recipes and a structured recall case. The reference output is supplied by the benchmark author, not produced by a provider.
2. **Native automated smoke:** observed Godot controls, application evaluator results, file save/reload, and source-change rejection. Rendering and inventory do not prove manual interaction completeness or media codec playback.
3. **Live generation:** actual provider requests through the application's `/api/generate` route. The full director run measures the complete authoring pipeline. The writer component run supplies an explicit plan and source window and measures the real writing prompt and the same strict validators; it does not measure the planner, creative direction, provider self-check, or completed learner experience.

Every report includes all 75 recipe identities. Missing, failed, declined, and unverified work stays visible. Offline results never imply live quality. No report estimates tokens from text length. Provider-unreported counts and timing are `null`, not zero. Cache counts are reported separately and must not be added to an input count that already contains them.

## Reference and native checks

```sh
npx tsx --test scripts/factory-benchmark/benchmark.test.ts
npx tsx scripts/factory-benchmark/offline.ts --output .qa/native-factory-benchmark
```

The output contains `report.json`, `native-manifest.json`, and `authoring-inputs.json`. The report checks exact citations, full model validation, actual scaffold binding, required capabilities, quoted prerequisite evidence, positive and wrong responses, malformed responses, and replacement-source rejection. Prerequisite semantic suitability and lesson readability still require independent review. Readability statistics describe fixture explanation text, not a completed generated lesson.

Feed the manifest to the native runner (see `scripts/godot-factory`). Then compare the returned evaluator objects, independent of JSON key order:

```sh
npx tsx scripts/factory-benchmark/offline.ts \
  --output .qa/native-factory-benchmark \
  --native-results .qa/native-factory-benchmark/native-report.json \
  --require-native
```

The command fails if any reference contract fails. `--require-native` additionally fails unless every native record has controls, matching positive and wrong evaluator outputs, saved-state equality, and source invalidation evidence. An external `ok:true` without the matching evaluation cannot satisfy the gate.

New source/model fixtures stay `needs-review`. Detached `reviewed` models are explicitly marked `testOnlyReferenceModel` and are used only to exercise deterministic reference answers. No generated or user content is promoted. For build-and-tell, the reference checks picture geometry while retaining the real caregiver gate; it does not fabricate caregiver approval or award independent correctness.

## Full authoring pipeline

Without `--execute-live`, the runner only prints a plan and makes no requests. Supply an explicit local service, provider, and model, or the explicit installed Claude executable for a benchmark-only connection:

```sh
npx tsx scripts/factory-benchmark/live.ts \
  --execute-live --service-url http://127.0.0.1:4319 \
  --provider claude-code --model haiku \
  --scaffolds recall-escape-mission --max-requests 8 \
  --output .qa/native-factory-live
```

`--variants cited-source-only` runs an explicitly narrowed input made only from the original fixture’s exact cited text passages; the original full-source trial is retained separately. `--variants positive,unsupported-source,source-injection` includes the sparse and adversarial source inputs. `--repeat` is bounded to 1–5. `--resume` validates the selected checkpoint's source hashes, age, and goal before resuming the saved director stage. An explicit request cap preserves a paused checkpoint; pause/resume remains unverified until a real resumed run is observed.

The existing director selects source-suitable recipes. A requested fixture recipe may not be selected, and that is reported as `different-recipe`; it is not counted as coverage for the requested recipe. Full result notebooks preserve generated lessons, activities, source disclosures, review status, checkpoint history, and every repair request receipt.

`--overall-timeout-ms 600000 --min-free-disk-bytes 2147483648` additionally bounds the whole run to ten minutes and checks a two-GiB disk reserve before generation and every five seconds. Either stop preserves the director's cancellation receipt and checkpoint; missing usage stays unknown. An unverifiable disk reading also stops this optional guarded run. Exact dispatched request prompts and schemas are retained outside the tracked ledger without credentials. These limits complement the request deadline and do not alter production repair or source-validation rules.

The source-change probe checks a new input revision, reset planned content, and rejection of every old activity against the replacement sources. Historical generated-model IDs remain as provenance for later cleanup and are not playable content. Earlier reports incorrectly required those IDs to disappear; their original failed metric is retained alongside a separate corrected offline probe, never silently replaced.

## Per-recipe live writer component

```sh
npx tsx scripts/factory-benchmark/writer.ts \
  --execute-live --system-claude /absolute/path/to/claude --model haiku \
  --scaffolds all --concurrency 2 --repairs 1 \
  --output .qa/native-factory-writer
```

The component benchmark invokes `gameWritingPrompt`, then validates replies using the same activity, specialized capability, teaching evidence, story, prose, clarity, and audio-direction validators as the director. It sends exact source text plus a supplied plan; it never sends the reference activity or correct-response witness. Media and code cases use the explicit timed-transcript and separate code/prose fixtures from `tests/gameDraftAuthoring.fixture.ts`. Source windows stay within the actual 6,000-character writer limit.

There are at most two application requests per recipe with `--repairs 1`; each correction is included in measured request wall time and provider token receipts. Timing covers the end-to-end local API request, including CLI startup; it is not isolated provider compute time. Claude may internally retry its formatter within the bounded CLI turn budget; its cumulative provider usage, including that work, is retained. `--repairs 0` measures first-attempt performance. `--scaffolds` can select a comma-separated subset. `writer-report.json` checkpoints started requests and completed cases; SIGINT/SIGTERM retain canceled receipts with unknown usage and leave undispatched recipes unverified, with per-case input, attempt, and result artifacts. `valid-draft` means the strict local checks passed, not that the lesson has human approval or a successful native playthrough.

Structured-output capable providers receive the same compact output schema and nullable-field normalization as the director. For Claude, `--json-schema` is read from `structured_output`, checked locally, and never replaced with an unchecked prose result. The CLI uses an internal `StructuredOutput` call; schema requests permit only that internal result tool and at most three turns, with built-in tools disabled and MCP denied. The [official CLI reference](https://code.claude.com/docs/en/cli-reference) documents the tool restrictions, and [structured-output documentation](https://code.claude.com/docs/en/headless#get-structured-output) documents the result field.

The benchmark-only system Claude adapter uses the native CLI's existing subscription sign-in, with external tools, customizations, MCP, history, and persistence disabled. It never reads or copies credential files. This adapter is distinct from the product's private managed-profile account connection. It captures provider-reported resolved model identifiers and usage, and does not invent entitlement or price claims. The executable remains responsible for authentication and provider billing. For API connections, pass the name of an explicitly configured environment variable with `--api-key-env`; keys are not written into reports.

`summarize-live.ts --report <writer-report.json-or-live-report.json> --output <analysis.json>` joins retained safe provider results with receipt timing and stage accounting. It includes observed concurrency, latency distributions, provider result subtypes, and attempt diagnostic categories. It does not infer formatter retry counts from token counts or from `usage.iterations` array length. A request that has not finished retains unknown counts. The output token setting applies per model turn, so cumulative CLI output can exceed that setting when formatting uses additional turns.

`generated-native.ts --source <writer-report.json-or-director-result.json> --output <manifest.json>` builds native QA inputs from actual validated generated drafts. A detached test clone permits reference assessment without changing saved review status. Cases without a confirmed positive and contrasting negative response witness remain blocked. After the native runner, add `--native-results <native-report.json>` to compare complete evaluator outputs as well as rendering, save/reload, and source invalidation.

`publish-results.ts --cohort baseline=<writer-report.json> --cohort candidate=<other-report.json> --native <reference-report.json> --output <directory>` creates a small Markdown and JSON ledger for version control. Each cohort retains all catalog statuses, timing, provider counters, failure diagnostics, and input/prompt/schema hashes. The ledger excludes raw model responses, source text, prompts, and provider diagnostics; preserve those separately in the run directories. Candidate outcomes never replace the original baseline. Publish the final ledger only after the relevant runs finish, or label an interim snapshot explicitly.

Use `--generated-native cohort=<verified-manifest.json>` to attach exact generated-player comparisons. Optional `--observations <sanitized-observations.json>` records explicitly authored source-inspection findings and unexecuted follow-ups; it does not convert them into model passes. The ledger preserves original application statuses and separately classifies final failures using observed evidence. In particular, a CLI `success` subtype with `is_error:true` and an explicit session-limit result is an account-availability failure. Unknown usage on a timeout stays unknown. Failure categories are disjoint per completed case.

Before a new measured cohort, `cohort-context.ts --output <run-directory> --settings <non-secret-settings.json>` records workflow file hashes and supplied settings without making provider calls or reading credentials. The machine-readable capability ledger associates actual model identifiers with workflow, request contract, source/input revisions, recipe, audience, and outcome. Missing launch-time snapshots remain null. This evidence is not automatic model qualification, and authoring results do not qualify Aster chat.

The checked-in [result ledger](results/README.md) records the completed 75-case Haiku baseline, the focused full creation trial, native verification, and unexecuted account-limited follow-ups. The baseline is retained separately from subsequent prompt/schema changes. Its locally valid drafts are not counted as pedagogical passes.

`checker.ts --execute-live --system-claude <binary> --source-directory <writer-run-directory> --scaffold <recipe> --output <directory>` replays an unchanged accepted writer draft through the actual production check prompt, structured schema, and strict check validator. This is a measured check-stage component test, not a completed creation flow. It discloses no expected verdict, permits at most one repair, keeps every receipt, and never edits or promotes the original draft. A provider's retain decision is still not independent semantic or human validation.

For a matched configuration experiment, `live.ts --scaffolds process-reconstruction --variants heldout-procedure` uses a separate original fictional procedure containing no reference answer JSON. Use distinct output directories for each arm. The optional system-CLI-only `--thinking-budget 0` passes `MAX_THINKING_TOKENS=0`; a positive budget must be 1024–8191. This is an explicitly reported experiment setting, not a production default. Verify its effect from reported reasoning counts. The [official environment documentation](https://code.claude.com/docs/en/env-vars) describes model-specific support. Keep the model identifier and source fixed, and report warm-cache differences. One matched pair does not establish general model quality or cost.

## Current limits

The suite does not establish educational effectiveness, human age suitability, semantic truth of fictional fixtures, real medical/security competence, native media decoding, keyboard/accessibility parity, or general provider reliability from one trial. Repeating the same fixture is not held-out evaluation. Source-only declinations, validation failures, unknown usage, and partial progress must remain visible in any release summary.

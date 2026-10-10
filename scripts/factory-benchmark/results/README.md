# Native factory benchmark results

Recorded 2026-10-10T18:52:46.467Z.

Reference fixture/native smoke, live writer component validation, full authoring completion, and human teaching quality are distinct claims. Drafts remain needs-review. An accepted local contract does not establish source semantic truth or human teaching quality. Candidate cohorts do not replace baseline outcomes.

Provider-reported input includes cache reads and writes once. Reasoning is a subset of output. Provider totals are not an invoice or subscription charge. Unknown counters stay null. The output setting limits each model turn; cumulative CLI output can be higher because structured output permits up to three turns.

These measurements do not establish a blanket production recommendation for Haiku or qualify Aster chat or local models. The JSON capability ledger binds measured writer outcomes to the resolved model, workflow snapshot when available, exact request contract, input revision, audience and recipe. A passing subset does not qualify all recipes.

Reference/native smoke: 75/75 reference contracts; 75 native render records; complete native gate passed. Human readability and live provider quality are separate, unverified gates.

Actual generated native smoke (writer-baseline): 23 passed complete evaluator/render/save/source-change comparisons; 0 failed; 0 unverified. 0 drafts lacked a confirmed assessment witness. Test-only clones were used; saved draft review status was unchanged. Native execution does not establish lesson truth or human approval.

Actual generated native smoke (procedure-focused): 1 passed complete evaluator/render/save/source-change comparisons; 0 failed; 0 unverified. 0 drafts lacked a confirmed assessment witness. Test-only clones were used; saved draft review status was unchanged. Native execution does not establish lesson truth or human approval.

Actual generated native smoke (local-gemma4-procedure): 1 passed complete evaluator/render/save/source-change comparisons; 0 failed; 0 unverified. 0 drafts lacked a confirmed assessment witness. Test-only clones were used; saved draft review status was unchanged. Native execution does not establish lesson truth or human approval.

## writer-baseline

Live writer component benchmark: actual gameWritingPrompt and strict application validators, with an explicitly supplied plan and source window. Planning, direction, provider self-check, full creation completion, and native play are not measured by this component run.

Observed model: claude-haiku-4-5-20251001. Requested configuration: {"provider":"claude-code","requestedModel":"haiku"}.

Counts: {"catalog":75,"selected":75,"finished":75,"validDraft":23,"declined":2,"failed":50}.

Requests: 112; provider-reported total tokens: 3862589; requests with unknown totals: 4. Observed benchmark request window: 2704425 ms.

Observed request duration: median 64297 ms; p95 176630 ms; maximum 180013 ms. Peak request concurrency: 3.

| Stage | Requests | Input | Output | Cache reads | Cache writes | Thinking (within output) | Total | Missing total reports |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| write | 112 | 2977863 | 884726 | 1491246 | 1484511 | 367781 | 3862589 | 4 |

Configuration and cohort notes:

- observedSystemCliVersion: 2.1.283
- concurrency: 3
- maxApplicationRepairs: 1
- maxOutputTokensPerCliRequest: 8000
- maxCliTurnsForStructuredOutput: 3
- thinkingBudget: provider-default; no override inherited by benchmark environment
- schemaMode: all75 Claude schemas, exact schema and prompt saved in each input artifact
- baselineNotes: Started before the later explicit typographic-punctuation-copy prompt change. Started before mapping CLI error_max_structured_output_retries and schema error_max_turns to PROVIDER_INVALID_RESPONSE. This baseline records those as PROVIDER_UNAVAILABLE and does not automatically retry them. CLI internal formatter retry count is not captured in this baseline. Provider cumulative usage is retained; usage.iterations is not interpreted as a retry count. Every input, received output, receipt, and safe provider result is retained separately. No saved generated draft is promoted to reviewed. Started before trusted citation-ID choices/resolution, accepted explanation-chain clarification, relationship-strength guidance, and source-absent optional-example omission. This baseline required at least two teaching chunks; the later one-chunk candidate is separate. The 8000 output setting applies to each model turn. A structured CLI request permits up to three turns, so cumulative output can exceed 8000. A complete source-code snapshot of the uncommitted running process was not captured at launch. Exact dispatched input, prompt, schema, source hashes and provider responses are retained per case.

Disjoint final failure categories: {"local-contract-rejection":24,"structured-output-turn-limit":14,"provider-timeout":4,"account-session-limit":8}. Account-limit cases with no reported token consumption: 5. Account-limit errors are availability failures, not evidence of model content quality.

Writing outcomes: 18 first-attempt valid; 5 valid after repair; 37 cases used a repair. Known total tokens per valid draft, including failed attempts: 167939; 4 requests have unknown totals. This is a token-use measure, not a price.

Every catalog identity stays visible. `valid-draft` means local writing checks passed; it is not human approval. Unknown tokens include interrupted or unfinished calls. Failure summaries describe observed diagnostics, not inferred model intent.

| Recipe | Outcome | Final failure category | Requests | Provider tokens | Missing token reports | Wall time (ms) | Final diagnostic |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| concept-map-repair | valid-draft |  | 1 | 23519 | 0 | 36178 | success |
| classification-workshop | failed | local-contract-rejection | 2 | 55986 | 0 | 101525 | sourceRefs[1]: evidence must occur exactly in the named source |
| comparison-puzzle | provider-failed | structured-output-turn-limit | 2 | 84686 | 0 | 144418 | PROVIDER_UNAVAILABLE |
| analogy-construction | valid-draft |  | 1 | 33547 | 0 | 83057 | success |
| definition-building | valid-draft |  | 1 | 25435 | 0 | 48675 | success |
| process-reconstruction | valid-draft |  | 1 | 33674 | 0 | 71249 | success |
| missing-step-completion | failed | local-contract-rejection | 2 | 98882 | 0 | 207015 | A worked example needs a source-provided example or explicitly labeled procedure. |
| fault-diagnosis | failed | local-contract-rejection | 2 | 131245 | 0 | 202606 | actions[2].transitions: exactly one fallback must be last. actions[4].transitions: exactly one fallback must be last. |
| repair-challenge | provider-failed | structured-output-turn-limit | 1 | 96003 | 0 | 153633 | PROVIDER_UNAVAILABLE |
| constrained-action-planning | failed | local-contract-rejection | 2 | 76956 | 0 | 114859 | actions[0].transitions: exactly one fallback must be last. actions[1].transitions: exactly one fallback must be last. actions[2].transitions: exactly one fallback must be last. |
| evidence-investigation | failed | local-contract-rejection | 2 | 64339 | 0 | 108868 | Teaching evidence must be an exact substring of its disclosed source unit. |
| claim-verification | failed | local-contract-rejection | 2 | 55404 | 0 | 105762 | A worked example needs a source-provided example or explicitly labeled procedure. |
| argument-construction | failed | local-contract-rejection | 2 | 79174 | 0 | 149187 | Duplicate explanation alternatives are not allowed. |
| competing-explanations | provider-failed | structured-output-turn-limit | 1 | 68754 | 0 | 111517 | PROVIDER_UNAVAILABLE |
| timeline-investigation | valid-draft |  | 1 | 25636 | 0 | 39785 | success |
| branching-decisions | provider-failed | structured-output-turn-limit | 1 | 81116 | 0 | 170066 | PROVIDER_UNAVAILABLE |
| role-missions | provider-failed | structured-output-turn-limit | 1 | 57768 | 0 | 84831 | PROVIDER_UNAVAILABLE |
| resource-allocation | failed | local-contract-rejection | 2 | 86335 | 0 | 132457 | A worked example needs a source-provided example or explicitly labeled procedure. |
| prediction-and-experiment | provider-failed | structured-output-turn-limit | 1 | 60558 | 0 | 98052 | PROVIDER_UNAVAILABLE |
| build-to-specification | provider-failed | structured-output-turn-limit | 1 | 43743 | 0 | 70624 | PROVIDER_UNAVAILABLE |
| diagram-reconstruction | valid-draft |  | 1 | 27237 | 0 | 47725 | success |
| chart-and-data-investigation | failed | local-contract-rejection | 2 | 60191 | 0 | 115901 | A worked example needs a source-provided example or explicitly labeled procedure. |
| media-checkpoints | valid-draft |  | 1 | 46320 | 0 | 82018 | success |
| recall-escape-mission | valid-draft |  | 1 | 22051 | 0 | 32614 | success |
| structured-teach-back | failed | local-contract-rejection | 2 | 87128 | 0 | 154434 | Teaching evidence must be an exact substring of its disclosed source unit. |
| discovery-scenes | valid-draft |  | 1 | 25359 | 0 | 35227 | success |
| puppet-stories | failed | local-contract-rejection | 2 | 89392 | 0 | 248786 | sourceRefs[3]: evidence must occur exactly in the named source sourceRefs[4]: evidence must occur exactly in the named source child-play.characters[0]: the role must be present in its cited source |
| pretend-play-stations | failed | local-contract-rejection | 2 | 66695 | 0 | 113508 | sourceRefs[3]: evidence must occur exactly in the named source child-play.characters[0]: the role must be present in its cited source child-play.characters[1]: the role must be present in its cited source |
| pattern-parade | failed | local-contract-rejection | 2 | 56274 | 0 | 147617 | A worked example needs a source-provided example or explicitly labeled procedure. |
| build-and-tell | failed | local-contract-rejection | 2 | 79783 | 0 | 135809 | Teaching evidence must be an exact substring of its disclosed source unit. |
| word-and-picture-workshop | valid-draft |  | 1 | 34186 | 0 | 83020 | success |
| step-train | valid-draft |  | 2 | 49586 | 0 | 133598 | Teaching evidence must be an exact substring of its disclosed source unit. |
| changing-rule-sorter | valid-draft |  | 1 | 11221 | 0 | 23200 | success |
| clue-map | failed | local-contract-rejection | 2 | 38998 | 0 | 79120 | Teaching evidence must be an exact substring of its disclosed source unit. |
| partner-helper | provider-failed | provider-timeout | 2 | 36301 | 1 | 280639 | PROVIDER_TIMEOUT |
| evidence-detective | failed | local-contract-rejection | 2 | 45139 | 0 | 114937 | A worked example needs a source-provided example or explicitly labeled procedure. |
| experiment-predictor | valid-draft |  | 1 | 70365 | 0 | 114542 | success |
| systems-repair-workshop | failed | local-contract-rejection | 2 | 46041 | 0 | 101777 | Teaching evidence must be an exact substring of its disclosed source unit. |
| plan-and-budget-expedition | valid-draft |  | 1 | 26377 | 0 | 43135 | success |
| teach-a-character | declined |  | 1 | 15840 | 0 | 64470 | success |
| hypothesis-casebook | provider-failed | structured-output-turn-limit | 1 | 106218 | 0 | 176640 | PROVIDER_UNAVAILABLE |
| claim-and-evidence-arena | valid-draft |  | 2 | 56869 | 0 | 104847 | A worked example needs a source-provided example or explicitly labeled procedure. |
| constraint-design-workshop | valid-draft |  | 2 | 114702 | 0 | 213477 | referenceBuilds[0] does not satisfy the model: Use all three required components: 3 placed; need 1. Source 1. |
| perspective-switching-drama | provider-failed | provider-timeout | 2 | 69469 | 1 | 284117 | PROVIDER_TIMEOUT |
| strategy-campaign | provider-failed | provider-timeout | 1 | unknown | 1 | 180027 | PROVIDER_TIMEOUT |
| scenario-internship | failed | local-contract-rejection | 2 | 57002 | 0 | 112222 | Teaching evidence must be an exact substring of its disclosed source unit. |
| research-dossier | failed | local-contract-rejection | 2 | 51078 | 0 | 143074 | A worked example needs a source-provided example or explicitly labeled procedure. |
| prototype-studio | provider-failed | structured-output-turn-limit | 2 | 76229 | 0 | 118826 | PROVIDER_UNAVAILABLE |
| review-studio | failed | local-contract-rejection | 2 | 58999 | 0 | 129315 | Teaching evidence must be an exact substring of its disclosed source unit. |
| capstone-campaign | provider-failed | provider-timeout | 1 | unknown | 1 | 180018 | PROVIDER_TIMEOUT |
| zero-trust-access-lab | valid-draft |  | 2 | 61592 | 0 | 107900 | A worked example needs a source-provided example or explicitly labeled procedure. |
| incident-response-command | failed | local-contract-rejection | 2 | 97579 | 0 | 145672 | Teaching evidence must be an exact substring of its disclosed source unit. |
| threat-model-canvas | valid-draft |  | 2 | 56896 | 0 | 104696 | Teaching evidence must be an exact substring of its disclosed source unit. |
| secure-code-review | declined |  | 1 | 31248 | 0 | 57354 | success |
| packet-path-inspector | failed | local-contract-rejection | 2 | 43113 | 0 | 98852 | A worked example needs a source-provided example or explicitly labeled procedure. |
| prompt-experiment-bench | provider-failed | structured-output-turn-limit | 2 | 144654 | 0 | 244814 | PROVIDER_UNAVAILABLE |
| agent-workflow-studio | provider-failed | structured-output-turn-limit | 1 | 42048 | 0 | 63081 | PROVIDER_UNAVAILABLE |
| retrieval-quality-lab | provider-failed | structured-output-turn-limit | 1 | 42227 | 0 | 73200 | PROVIDER_UNAVAILABLE |
| model-evaluation-arena | valid-draft |  | 1 | 32905 | 0 | 63512 | success |
| ai-safety-response-lab | valid-draft |  | 1 | 39806 | 0 | 80960 | success |
| cloud-architecture-builder | provider-failed | structured-output-turn-limit | 2 | 74483 | 0 | 119520 | PROVIDER_UNAVAILABLE |
| cloud-cost-control | valid-draft |  | 1 | 15481 | 0 | 54203 | success |
| kubernetes-recovery-room | failed | local-contract-rejection | 2 | 53016 | 0 | 78008 | sourceRefs[1]: evidence must occur exactly in the named source |
| infrastructure-change-planner | failed | local-contract-rejection | 2 | 39676 | 0 | 83031 | A worked example needs a source-provided example or explicitly labeled procedure. |
| distributed-systems-trace | valid-draft |  | 1 | 60925 | 0 | 177011 | success |
| debugger-detective | valid-draft |  | 1 | 56898 | 0 | 65826 | success |
| api-contract-workshop | provider-failed | structured-output-turn-limit | 2 | 79910 | 0 | 139369 | PROVIDER_UNAVAILABLE |
| database-query-lab | provider-failed | account-session-limit | 2 | 47392 | 0 | 132540 | PROVIDER_UNAVAILABLE |
| version-control-recovery | provider-failed | account-session-limit | 1 | 18098 | 0 | 43195 | PROVIDER_UNAVAILABLE |
| test-design-studio | provider-failed | account-session-limit | 1 | 16832 | 0 | 67015 | PROVIDER_UNAVAILABLE |
| data-pipeline-repair | provider-failed | account-session-limit | 1 | 0 | 0 | 2352 | PROVIDER_UNAVAILABLE |
| statistics-evidence-lab | provider-failed | account-session-limit | 1 | 0 | 0 | 1389 | PROVIDER_UNAVAILABLE |
| product-tradeoff-council | provider-failed | account-session-limit | 1 | 0 | 0 | 987 | PROVIDER_UNAVAILABLE |
| language-dialogue-trail | provider-failed | account-session-limit | 1 | 0 | 0 | 1056 | PROVIDER_UNAVAILABLE |
| clinical-reasoning-casebook | provider-failed | account-session-limit | 1 | 0 | 0 | 1133 | PROVIDER_UNAVAILABLE |

## procedure-focused

Live authoring measurements; retained output remains an AI draft. Unselected recipes and human/native quality are unverified.

Observed model: claude-haiku-4-5-20251001. Requested configuration: {"provider":"claude-code","model":"haiku"}.

Counts: {"recipes":75,"selected":1,"trials":1,"requestedRecipeGenerated":1}.

Requests: 5; provider-reported total tokens: 102259; requests with unknown totals: 0. Observed benchmark request window: 172966 ms.

Observed request duration: median 25912 ms; p95 55549 ms; maximum 55549 ms. Peak request concurrency: 1.

| Stage | Requests | Input | Output | Cache reads | Cache writes | Thinking (within output) | Total | Missing total reports |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| plan | 1 | 34433 | 2427 | 22120 | 12285 | 1479 | 36860 | 0 |
| direction | 1 | 5030 | 1358 | 0 | 5020 | 737 | 6388 | 0 |
| write | 1 | 21284 | 6098 | 8586 | 12680 | 2801 | 27382 | 0 |
| check | 1 | 16106 | 2129 | 7190 | 8898 | 1243 | 18235 | 0 |
| overview | 1 | 6055 | 7339 | 0 | 0 | 5810 | 13394 | 0 |

| Trial | Variant | Outcome | Requested recipe produced | Actual recipe | Wall time (ms) |
| --- | --- | --- | --- | --- | ---: |
| process-reconstruction | cited-source-only | generated-draft | true | process-reconstruction | 172989 |

## glossary-source-check

Live authoring measurements; retained output remains an AI draft. Unselected recipes and human/native quality are unverified.

Observed model: claude-haiku-4-5-20251001. Requested configuration: {"provider":"claude-code","model":"haiku"}.

Counts: {"recipes":75,"selected":1,"trials":1,"requestedRecipeGenerated":0}.

Requests: 4; provider-reported total tokens: 55881; requests with unknown totals: 0. Observed benchmark request window: 121249 ms.

Observed request duration: median 21870 ms; p95 66578 ms; maximum 66578 ms. Peak request concurrency: 1.

| Stage | Requests | Input | Output | Cache reads | Cache writes | Thinking (within output) | Total | Missing total reports |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| plan | 1 | 10284 | 2166 | 0 | 10274 | unknown | 12450 | 0 |
| direction | 1 | 3932 | 843 | 0 | 0 | unknown | 4775 | 0 |
| write | 1 | 21734 | 7206 | 8753 | 12963 | unknown | 28940 | 0 |
| check | 1 | 7841 | 1875 | 0 | 7831 | unknown | 9716 | 0 |

| Trial | Variant | Outcome | Requested recipe produced | Actual recipe | Wall time (ms) |
| --- | --- | --- | --- | --- | ---: |
| recall-escape-mission | positive | needs-source | false |  | 121277 |

## local-gemma4-procedure

Live authoring measurements; retained output remains an AI draft. Unselected recipes and human/native quality are unverified.

Observed model: gemma4:e4b-it-qat. Requested configuration: {"provider":"local","model":"gemma4:e4b-it-qat","thinkingBudget":"provider-default"}.

Counts: {"recipes":75,"selected":1,"trials":1,"requestedRecipeGenerated":0}.

Requests: 6; provider-reported total tokens: 31064; requests with unknown totals: 0. Observed benchmark request window: 178438 ms.

Observed request duration: median 27268 ms; p95 50824 ms; maximum 50824 ms. Peak request concurrency: 1.

Thinking configuration: the runner requested no CLI override (provider-default); the captured local backend used think:false. Unreported reasoning-token counters remain unknown.

| Stage | Requests | Input | Output | Cache reads | Cache writes | Thinking (within output) | Total | Missing total reports |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| plan | 2 | 13640 | 386 | unknown | unknown | unknown | 14026 | 0 |
| direction | 1 | 2592 | 234 | unknown | unknown | unknown | 2826 | 0 |
| write | 1 | 6265 | 777 | unknown | unknown | unknown | 7042 | 0 |
| check | 1 | 5228 | 113 | unknown | unknown | unknown | 5341 | 0 |
| overview | 1 | 1088 | 741 | unknown | unknown | unknown | 1829 | 0 |

| Trial | Variant | Outcome | Requested recipe produced | Actual recipe | Wall time (ms) |
| --- | --- | --- | --- | --- | ---: |
| process-reconstruction | cited-source-only | different-recipe | false | claim-verification | 178480 |

The production creation flow completed with the planner-selected claim-verification recipe. The benchmark target process-reconstruction was not produced. Saved content remains needs-review.

Configuration and cohort notes:

- concurrency: 1
- maxApplicationRepairs: 1
- maxOutputTokensPerCliRequest: production stage budgets, backend cap8,192
- thinkingBudget: false
- schemaMode: production local structured schema path
- changes: One actual full-source-to-game trial through the running production local model manager. The same 149-character source as the earlier focused Haiku procedure; the current workflow differs, so this is not a controlled model comparison.
- measurementLimitations: One procedure trial cannot qualify all 75 recipes or Aster chat. Whole trial capped at 600,000 ms; each request at 180,000 ms; at most 8 requests including repairs; 2 GiB disk reserve. Runtime was already loaded by independent readiness/Aster checks; startup is warm. No human review or qualification promotion. After this service loaded, backend added actual-model metadata preservation on post-response validation failures. That accounting-only patch was not in the running service; inference behavior was unchanged.
- codeSnapshot: a94033cc0eb838c99da09ec78d33d9599c0b68a6c5c45ac4c18cadb2a7e4cb80 (file hashes retained in JSON)
- hardware: {"platform":"darwin","arch":"arm64","totalMemoryBytes":17179869184,"description":"Apple M4 / 16 GiB","qualificationIdentity":{"modelDigest":"sha256:ee665637121887cf3befff38abbb1be4ee117c7db867d97a67e29049ecd7e15f","workflowVersion":"asterloom-source-grounded-2026-10-10","runtimeVersion":"0.40.2","settingsDigest":"de017a9019111999ac584832639af1fbedd1bdda48697a1efe3d6a078c06201a","hardwareId":"c550df40fbe185582799de9a15ac2614fecbd9a6ff4f3e8642ce9a8dcfae6c0e"}}
- runtimeVersion: 0.40.2
- modelManifestSha256: ee665637121887cf3befff38abbb1be4ee117c7db867d97a67e29049ecd7e15f
- modelContextTokens: 32768
- inferenceSettings: {"think":false,"truncate":false,"shift":false,"temperature":0.2,"keepAlive":"5m"}

## Additional observations and unexecuted follow-ups

These records describe evidence limits and work that was not run. They do not replace measured cohort outcomes.

Source inspection (concept-map-repair): The source states temporal precedence. Generated teaching strengthens it to triggering, prerequisites, and completion-before-start constraints without source support. Assistant inspection of retained source and teaching; not a blinded human quality study. Checker replay: not-executed-account-limit.

Source inspection (claim-verification): The assessment preserves all three supplied ordering statements and contrasts a directly reversed order. Teaching repeats the short source across four chunks, and its general scientific-inquiry wording should be scoped to this supplied procedure. The last chunk calls analyzing before reporting the final step, which can blur which action is final. Assistant inspection of actual retained source, assessment and lesson; not a human approval or blinded quality study. Checker replay: production-check-completed-as-part-of-flow.

Source-change probe correction (procedure-focused): original recorded status fail; corrected offline probe pass. The original harness incorrectly required removal of historical generatedModels provenance IDs. Production intentionally retains those IDs for cleanup while resetting the plan; direct stale-source activity validation and native runtime validation are the relevant checks. Original report is unchanged. No provider requests were made.

Source-change probe correction (local-gemma4-procedure): original recorded status fail; corrected offline probe pass. The original harness incorrectly required removal of historical generatedModels provenance IDs. Production intentionally retains those IDs for cleanup while resetting the plan; direct stale-source activity validation and native runtime validation are the relevant checks. Original report is unchanged. No provider requests were made.

| Follow-up | Status | Provider requests |
| --- | --- | ---: |
| five-recipe-candidate | not-executed-account-limit | 0 |
| original-concept-map-check | not-executed-account-limit | 0 |
| heldout-procedure-thinking-pair | not-executed-account-limit | 0 |
| construction-thinking-pair | not-executed-account-limit | 0 |

No reset wait or automatic account-limit retries were performed.

Candidate implementation: implemented-offline-tested-live-unverified. No live improvement was measured. Snapshot: a0e8c067fdb31412dd9626249e69d53898eb8dfb5c6d2bfaa3267e0a04d1b56a.

- Trusted citation-ID catalog with exact source/window/revision lookup before existing validators.
- Worked examples omitted where supplied source definitely lacks one.
- Explanation alternatives explicitly mean accepted correct chains.
- Relationship-strength and punctuation-copy instructions.
- Teaching allows one to age-limited maximum chunks; no filler.
- Known structured-output limit errors use the bounded local repair path.

Actual native first-control interactions: 23/23 passed across 15 presenter families, plus 5 common guide-boundary checks. Native UI signal automation changes one actual presenter control per draft. This does not establish exhaustive control coverage or lesson semantics.

Actual native first-control interaction (local-gemma4-procedure): 1/1 passed; 18 controls rendered; 190 ms automated native case. Actual generated classification first-checkbox signal changed the response; exact positive/wrong results, rendering, save/resume and source-change rejection passed. This is not exhaustive interaction coverage or human review.

The Haiku baseline does not establish reliable broad authoring performance. Failures include application/format boundaries, local content validation, timeout, and account availability. The local trial completed one full creation flow with an alternate source-suitable recipe; it does not qualify all 75 recipes or establish human teaching quality. Aster chat measurements are reported separately.


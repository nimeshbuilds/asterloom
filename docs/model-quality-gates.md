# Model support and quality qualification

Installing a model, receiving a response and producing valid JSON are three useful checks. None proves that a model can teach accurately or create a playable learning game. Asterloom distinguishes local runtime readiness from qualification for **Aster chat** and **game creation**.

No local model has completed Asterloom's quality qualification yet. Gemma 4 candidates are available for explicit experimental testing. They must not be labeled recommended, automatically selected as a quality substitute, or silently replaced by a cloud model. Model size and vendor benchmark scores are not Asterloom qualification evidence. Likewise, the current Claude Haiku writer-component benchmark does not establish whole-product quality.

## Evidence required

The executable policy is `server/model-qualification.mjs`, version 1.0.0. These are initial product acceptance thresholds, not research claims or a guarantee that every future answer will be correct. Change the policy version when changing the thresholds; retain failed and superseded results.

| Requirement | Aster chat | Game creation |
| --- | --- | --- |
| Completed end-to-end cases | At least 100 | At least 150 |
| Held-out source sets | At least 10 | At least 10 |
| Coverage | Direct answers, unsupported questions, follow-ups, cross-source questions, current game state, source prompt injection; at least 10 in each category | All 75 templates at least twice; five source-format categories; adult and child groups |
| End-to-end success | At least 95% of every attempted case | At least 95% of every attempted case |
| First-attempt success | At least 90% | At least 90% |
| Repair budget | At most one | At most one |
| Grounding | Supported answers and appropriate abstentions each at least 95%; zero observed critical source errors | Zero observed critical source errors; exact references alone do not prove the lesson is supported |
| Independent review | At least 30 cases, at least 95% approved | At least 30 cases, at least 95% approved |
| Responsiveness | All-attempt end-to-end p95 at most 30 seconds | All-attempt end-to-end p95 at most 10 minutes for the declared fixed benchmark workload |
| Playability | Answer usefulness, context and follow-up continuity | Every accepted game passes native controls, scoring, saving/resuming and changed-source rejection |

Review checks readable instruction, faithful paraphrase, useful explanation, source strength, age suitability and whether learners can understand what to do. Independent human review is required; model self-judgment or an automated code review must not be recorded as human approval. Any child suitability or learning-effectiveness claim needs separate human playtesting beyond these model gates.

Model identity includes the exact artifact digest/quantization, runtime version, generation settings, workflow revision and tested hardware. Reports record the source-set digest, completion date, all attempts, failures, retries, measured token use, timings and reviewer results. Changes require matching new evidence. A family name such as “Gemma” or a mutable provider alias is insufficient. A qualified result describes the tested workload and machine; it is not a promise that a large book will finish in the same time.

## Interpreting failures

Keep provider or transport errors, formatter turn limits, schema rejection, failed evidence checks, unsupported claims, unclear instruction and unplayable results separate. A failure in Asterloom's adapter is not proof that a model lacks the required reasoning ability. Report both first-attempt and repaired success, count timeouts, and retain missing token measurements as unknown. Do not divide the token total only by successes while hiding the failed calls that preceded them.

Start with a small screening cohort to avoid downloading or benchmarking clearly unsuitable candidates. Passing screening permits the full held-out benchmark; it does not earn a recommendation. Tune on development fixtures, then evaluate untouched holdouts. A model that qualifies for chat alone remains experimental for creation. Prefer the smallest model that actually qualifies on the intended hardware, rather than imposing an arbitrary parameter-count cutoff.

## Current local runtime scope

The managed local provider uses downloaded text-generation models for source-grounded chat and structured game authoring. Available vision or audio capabilities in a model family do not imply that this integration exposes them. Extracted source content continues through Asterloom's existing retrieval and evidence checks. Installed model weights remain on the creating computer; exported games keep their authored content and run without AI. Recipients can choose an optional local model for Aster themselves.

Primary compatibility references, checked 2026-10-10: [Google's Gemma 4 12B developer guide](https://developers.googleblog.com/gemma-4-12b-the-developer-guide/), [Ollama's Gemma 4 catalog](https://ollama.com/library/gemma4), [Ollama chat API](https://docs.ollama.com/api/chat), and [Ollama context-length documentation](https://docs.ollama.com/context-length). Compatibility is separate from Asterloom's measured quality.

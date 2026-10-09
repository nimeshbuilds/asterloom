# Content clarity audit — 0.7.8

The release improves the way a learner enters a game, understands the current task, and reads the original material. It also adds a cited whole-game introduction and stronger teaching checks for **new AI creation**. It does not silently regenerate the paragraphs in an existing game.

## Evidence and coverage

The local audit inventoried all 70 saved AI lessons and their matching activities in the reported guide, reviewed their objectives, task directions and guided steps, and inspected representative teaching and exact source references. The game has 77 stored activities: 14 AI sequence missions, 47 AI classification missions and 9 AI dependency missions, plus 7 older extraction drafts already excluded from the prepared lesson route. Private source text, lesson wording and per-lesson findings remain in the untracked QA directory; none is copied into this document or a public fixture.

The recurring problems were concrete:

- 39 lessons use “membership feedback” in learner directions instead of plain language about sorting and corrections.
- 26 quest instructions tell the learner to read the teaching first, even though the application has already moved from teaching into the quest.
- All 9 dependency missions use attachment wording. Some direct the learner to choose two nodes before a relation; none names the current primary commit control, **Connect concepts**. One also describes evidence cards where the actual interaction is a concept relationship map.
- 8 lessons call generated feedback, relation labels or pairings “reviewed.” That wording can imply approval which a generated practice model does not have.
- 6 tasks or guided steps send the learner back to a supplied/cited answer explanation to interpret the task.
- 50 lessons contain technical acronyms. Their presence is not inherently a defect, and this count does not establish that every term is undefined. Missing prerequisites must be supplied by the source or acknowledged, not guessed.
- The longest saved explanation paragraph is 54 words. Shortening text alone would not resolve the control mismatch, indirect wording or missing learning context.

No lesson has a separate saved worked-example object, although some explanation paragraphs contain examples supplied by the source. This is not evidence that all 70 lessons lack examples. A source that supplies no example must not be “improved” by inventing one and presenting it as a source fact.

## What existing games get

The campaign now offers a compact **Learn about this game and what it teaches** panel. When no generated overview exists, it presents a clearly labeled preview of current saved lessons, spreads its idea selection across the journey, and exposes the complete saved topic list. Exact citations remain inspectable. Opening the preview sends no AI request and changes no source, lesson, activity, receipt or progress record.

The current quest presentation separates the learning objective from the actual control instructions and completion condition. The current controls remain authoritative; older saved instructions are available in an optional disclosure. Source-library presentation groups material by its original source and provides reading context instead of presenting every extracted fragment as a numbered lesson.

These are presentation and navigation improvements for the reported game. Its 70 underlying AI-authored explanations have **not** been rewritten or semantically certified. There is currently no dedicated “revise only these lessons” operation. A future explicitly requested improved edition should preserve the original notebook and its progress, reuse validated activity models, regenerate only teaching and the introduction with their own receipts, and offer the resulting edition for review. Changing a source or provider merely to force a full rebuild is not the intended repair workflow.

## New creation: introduction and teaching contract

Each planning response can now save one short, cited learning note for every disclosed source unit, including useful material assigned to reading rather than a mission. The final overview reuses these notes and validated mission teaching. It sends raw source text only for complete instructional sections that have not already been summarized. Cover/navigation material and incomplete or code-only context are not treated as standalone teaching facts; their original material remains available.

A normal small game adds one final synthesis request. Large collections use a bounded tree of source groups and cited summaries rather than truncating to the first passages. Every inventory unit remains in the coverage metadata. The tree is saved one node at a time and resumes only unfinished nodes. Main ideas are a short introduction, not a claim that every source detail is taught in a scored mission.

The overview contains a title, a cited introduction, learning goals, key ideas and links to actual retained missions. Validation checks exact source text, revision and position; rejects citations outside disclosed material or non-code instructional spans; validates mission links against the idea’s source unit; and revalidates the saved form during package import. The overview and its sources travel in the portable game. No AI is needed to read them in an exported player.

An existing ready design without an overview never triggers this extra work on open or reuse. A failed provider request stops and preserves work. Invalid returned data receives at most the existing single automatic correction, recorded in the ledger and creation activity. If an introduction cannot be validated after that bound, the saved-lesson preview is shown instead of fabricated prose. Provider measurements, including unknown counts, remain in the existing token ledger.

The planner keeps a learning goal to 300 characters, aiming for 8–24 words; it does not write the lesson into that field. The writer receives the primary scoring passage and at most 6,000 characters of contiguous same-source teaching context, including whole immediate neighbors when they fit. Nearby definitions and qualifications can support teaching citations, while activity items and rules stay restricted to the primary passage. Older saved lessons keep their original windows. If a reused lesson summary cites a neighbor, the introduction uses the corresponding raw unit instead of mislabeling that citation as primary-unit evidence.

The writer and reviewer apply a learner-readiness contract:

1. Introduce one clear idea and its source-supported prerequisite or distinction.
2. Explain it before testing it; use a concrete example only when the source supplies one.
3. Teach the information needed for every scored choice without making a raw PDF search the learner’s prerequisite.
4. Name the current action, available control and completion condition.
5. Explain why the answer follows the taught rule, preserving qualifications and uncertainty.

The independent check response records four separate decisions: understandable teaching, a lesson that supports the task, matching controls, and explanatory feedback. A new mission cannot be retained when any decision is false. New-output local guards also reject known authoring jargon, an obsolete “read the teaching first” quest direction, and attachment directions which omit the real dependency commit control. These guards deliberately do not ban legitimate subject terminology or impose an English action-word dictionary. Older saved check records and lessons remain compatible.

## Verification and remaining limits

Focused synthetic tests cover whole-inventory inclusion, late reading-only material, summary reuse, bounded trees, exact portable citations, forged evidence and mission links, old-game preservation, request accounting, save-before-dispatch, paused overview resume, bounded invalid-result repair and each failed learner-readiness condition. Existing creation, resume, efficiency and selected-world tests retain their durability and accounting assertions, updated to count the additional overview request.

The focused generator set passed **82 tests in 7 files**. Two offline browser cases passed for generated introductions and older saved previews, including keyboard expansion, exact citation display, accessibility checks, a 390-pixel layout, unchanged input data and zero network requests. The default overview keeps details collapsed; the campaign’s next-mission action appears before it. The local private-guide preview retained all 70 topics and left its input bytes unchanged. One local Node measurement took approximately 122 ms to derive that preview; this is a bounded observation, not a general performance guarantee.

These checks prove the stated software behavior. Exact quotations do not prove that an AI paraphrase or its reasoning is true, and four model-reported review decisions are not human pedagogical approval. Mocked provider tests cannot establish how a real model writes. The first controlled live check used one synthetic source and one actual subscription request. Its planning response placed a 513-character lesson-like objective in a field limited to 400 characters, so validation rejected it before a mission could be published. The QA harness blocked the automatic correction before dispatch: only one request reached the provider (9,878 reported input tokens and 728 output tokens). This exposed a prompt defect, corrected by separating the concise planning instruction from the teaching rubric. The original output and receipts are retained unchanged. The separate four-stage rerun is documented below.

No controlled learner study or long-term retention measurement has been performed. The release should not be described as scientifically proven to be fun, addictive, superior to another product, or effective for every learning goal.

## Controlled live creation result

After the planning and neighboring-context corrections, a fresh synthetic workshop source completed plan, write, check and overview in four real requests through the already connected Codex subscription (gpt-6.1-sol). No automatic repair was dispatched. It produced one sequence mission and a cited whole-material introduction. The lesson correctly explained the matching definition from the preceding unit, retained the exception, and distinguished ordering steps from actually checking a parcel. All output passed the production validators and portable package round-trip; source data remained unchanged.

The provider reported 31,663 input tokens (including 2,688 cached input) and 4,142 output tokens. This is the successful test game’s measured usage, separate from the earlier failed one-request planning test described above. It is a small content QA case, not evidence of reliable output for every topic, account, provider or age. Account sign-in itself was not exercised, and no live Claude or Grok call was made. The existing desktop service handled these calls while the new client authoring code ran in an isolated QA notebook; the user’s real game and credentials were not copied or changed.

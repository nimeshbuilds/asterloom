# Learning research translated into product rules

Reviewed 3 October 2026. This document records the basis of the implemented catalog and rules in `src/data/scaffolds.ts` and `src/data/learningScience.ts`. The recipes and defaults are original product designs informed by research; the product itself has not yet demonstrated learning effectiveness in a controlled study.

## What “learning styles” means here

The product offers learning **goals**, flexible presentation preferences and accessibility controls. It does not diagnose a visual, auditory or kinesthetic type. Pashler and colleagues found insufficient evidence for the claim that matching teaching format to a diagnosed learning style improves learning. Personal preferences and differences in ability still exist. We choose a diagram when spatial relationships matter and offer narration when useful or requested; we do not claim either matches a permanent type. [Pashler et al., *Learning Styles: Concepts and Evidence*](https://www.psychologicalscience.org/journals/pspi/j.1539-6053.2009.01038.x/)

Implemented: seven goal modes—explore, remember, practice, investigate, create, teach and prepare—and editable age/access settings. Deterministic scaffold ranking uses the selected goal/skills and age compatibility. AI is optional refinement, never required for core creation or play.

## Practice that goes beyond quiz repetition

Karpicke and Blunt found benefits of retrieval practice for meaningful learning of studied science texts, including inference questions. This is evidence for retrieving knowledge, not proof that every quiz or escape-game skin is effective. [Karpicke & Blunt, 2011](https://doi.org/10.1126/science.1199327)

Implemented: attempt before reveal, informative source-linked feedback, separate hint-assisted and independent success, and later revisiting. The player must still understand what it retrieves. Recipes include explanations, worked examples, relationships, procedures and application cases as well as recall.

The IES practice guide recommends spacing study, alternating worked examples with problem solving, coordinating graphics with verbal explanations, connecting concrete and abstract representations, quizzing and explanatory questions. Evidence strength varies across recommendations. [IES practice guide](https://ies.ed.gov/ncee/wwc/practiceguide/1)

Implemented: guided example → completion task → independent attempt; explanations remain available; support adapts after errors. Decorative scene art should not obstruct or replace instructional representation. Multiple-choice recognition is not labeled free recall.

## Spacing and interleaving

Cepeda and colleagues' synthesis found that beneficial spacing depends on the intended retention interval. A universal “perfect interval” is not supported. [Cepeda et al., 2006](https://digitalcommons.usf.edu/psy_facpub/1771/)

Implemented: an inspectable review ladder of 1, 3, 7, 14, 30 and 60 days. This is a practical scheduling heuristic, not a validated personalized model. Same-day repeats cannot advance the ladder. Missed or hinted responses return to earlier support. Self-assessed unrestricted answers do not establish independent mastery. Persist objective IDs, review state and the last reviewed timestamp.

Rohrer and Taylor found that mixed mathematics practice improved delayed performance compared with blocked practice in their college-student experiments. The task context matters. [Rohrer & Taylor, 2007](https://link.springer.com/article/10.1007/s11251-007-9015-8)

Implemented: mix relevant, potentially confusable objectives after introductory support. Do not randomize unrelated topics or constantly change controls in the name of interleaving. A later case should require choosing a method, not just recognizing the preceding lesson title.

## Motivation that supports learning

Ryan, Rigby and Przybylski's studies connect satisfaction of competence, autonomy and relatedness with game enjoyment and motivation. This informs design; it does not guarantee that a particular reward system will improve learning. [Ryan et al., 2006](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)

Implemented design choices:

- **Competence:** clear goals, specific explanations, recoverable mistakes and visible progress by objective.
- **Autonomy:** understandable mission choices, adjustable pacing, optional music, optional competition, pause and retry.
- **Relatedness:** private invitations, partner activities with solo alternatives and shared mission histories.
- **Healthy return:** natural stopping points and a useful review queue. Avoid punitive streak loss, compulsory timers, manipulative notifications and random monetary rewards.

Scores express game performance. Completion, enjoyment, retention and transfer are different outcomes. A fast answer or repeated solved question cannot alone establish retained understanding.

## Developmental adaptations

NAEYC describes child development as dynamic and contextual, supports active play and emphasizes responsive adult relationships. Its early-childhood guidance does not justify a universal fixed-age ability test. [NAEYC principles](https://www.naeyc.org/resources/position-statements/dap/principles)

The National Academies' adolescence report emphasizes developmental opportunity, agency and supportive relationships. [*The Promise of Adolescence*](https://nap.nationalacademies.org/resource/25388/interactive/)

The five bands below are editable product defaults. Session durations are design starting points, **not** evidence-based maximum attention spans. Prior knowledge, language, reading and access needs take precedence.

| Band | Design default | Five additional recipes |
|---|---|---|
| 3–5 | Adult-supported picture play, one spoken instruction, two choices, no reading requirement or speed scoring | Discovery scenes; Puppet stories; Pretend play stations; Pattern parade; Build and tell |
| 6–8 | Concrete examples, short directions, read-aloud support and cooperative framing | Word and picture workshop; Step train; Changing rule sorter; Clue map; Partner helper |
| 9–11 | Visible rules, small evidence sets, manageable multi-step problems and explanations | Evidence detective; Experiment predictor; Systems repair workshop; Plan and budget expedition; Teach a character |
| 12–14 | Choice, perspectives, bounded design challenges and private reflection | Hypothesis casebook; Claim and evidence arena; Constraint design workshop; Perspective switching drama; Strategy campaign |
| 15–17 | Authentic roles, source comparison, transfer and scaffolded independence | Scenario internship; Research dossier; Prototype studio; Review studio; Capstone campaign |

The catalog includes 25 broad recipes and 25 additional professional/domain recipes, alongside the 25 age-adapted recipes. Domains include cybersecurity, AI and agents, cloud, development, data, languages and health education. Some general recipes are also age-compatible with younger groups. There are exactly **75 authored recipes**, implemented through **ten reusable interaction families**. These are not seventy-five separate game engines.

## Authoring and assessment contracts

The catalog stores detailed mechanics, prerequisites, source-related feedback, difficulty, duration, visual scene/motif and prepared dialogue. Matching a recipe name alone does not prove that its intended behavior is implemented.

Before a recipe becomes playable, the compiler/runtime must satisfy its content contract:

1. A classification task needs a stated rule and verified membership, not guessed clusters.
2. A process task needs validated ordering or dependencies; multiple valid orders must be accepted.
3. A causal simulation needs an explicit validated model. Ordinary prose cannot be treated as a simulator.
4. A diagram task needs accurate regions, connections and a text equivalent.
5. A media checkpoint needs licensed playable media, transcript access and a reviewed timestamp.
6. Every scored item needs a reviewed key, alternatives, explanation and source reference.
7. Unrestricted prose or speech uses self/human review. Keyword matching must not masquerade as meaningful essay grading.
8. A claim can be unsupported without being false. Uncertainty remains a valid authored outcome.
9. An export retains these contracts and assessment provenance. No gameplay answer requires a live AI call.

Manual authoring must expose the same validated fields as optional AI authoring. Source importing alone cannot promise that arbitrary material has automatically become a reliable simulation, certification assessment or professional training program.

## Accessibility and empirical verification

Use keyboard equivalents for movement/placement, clear focus states, sufficient target sizes, alternative text, captions, replay, reduced motion and controls that do not depend on color or sound alone. WCAG conformance needs actual auditing; citing it does not establish conformance. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

Engineering checks should verify recipe eligibility, accepted alternative answers, support adaptation, review due dates, state restoration and equivalent export behavior. Learner evaluation should separately measure usability, enjoyment, delayed retrieval and application to unfamiliar cases. Educational effectiveness is an empirical release claim, not something unit tests establish.

## Extensible, bounded scaffold definitions

`src/data/scaffoldSchema.ts` implements a versioned plain-data contract. An imported recipe configures one of the ten known interaction families; it cannot provide JavaScript, tool calls or an executable plugin. Strict import validation checks identity, supported version, fields, age groups, visual scene, dialogue, content requirements and assessment policy. Catalog import rejects duplicates, unsupported fields and oversized inputs.

A recipe definition can be expanded without changing the engine only when its declared content and assessment requirements are already supported. A new simulation or external code execution capability needs a separately implemented and tested runtime. Domain recipes deliberately require fixed, reviewed fixtures: for example, cloud prices have dates/regions, AI experiments use precomputed outputs, and software examples remain inert text. Clinical cases require qualified review. These controls keep optional AI from becoming the authority on the underlying domain.

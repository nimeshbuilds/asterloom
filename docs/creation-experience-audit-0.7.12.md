# Creation and game experience audit — 0.7.12

## What this update changes

- **Add sources & recreate** makes a separate draft edition from the current materials. Originals and media relationships are preserved. The existing playable game, progress and creation receipts remain intact. The new edition builds fresh from all included material when its creator explicitly starts AI creation.
- Aster's connection and disconnection videos have distinct, synchronized sound motifs. They begin on actual video playback, honor the sound preference, and stop on interruption. Source speech cancels pending cue tails.
- Eight animated mechanisms cover the 75 authored scaffold profiles: routing, assembly, routes, orbital alignment, growth, water channels, archive focus and stage reveals. Actions are neutral; committed results produce feedback. Restoring a saved result does not replay its celebration.
- Five new generated environments bring the bundled environment catalog to 17. Workflow, cloud architecture, diagnosis, puppet stories and step sequencing have dedicated scenes. Known saved story settings retain their previous artwork. Prompts and provenance accompany the shipped PNGs in `public/assets/world-art/provenance.json`.
- Compatible reading-music choices are ordered by scaffold and audience, reducing repeated first-choice selections while preserving every supported option and existing saved choice.

The animations are local vector mechanisms paired with sound events, rather than GIF files. This allows precise event timing, offline playback, reduced motion and cancellation without hiding the learning controls. Environment artwork is decorative fiction; it is not evidence or a factual diagram.

## How the AI chooses the experience

The planner receives bounded source sections and the available recipes for the selected age group. Recipe descriptions include their mechanics and required source evidence. It chooses activities whose prerequisites the source can support; a keyword alone is insufficient for a specialist recipe. Unsupported material may become source study instead of an invented graded task.

The current automatic writer supports 50 recipes across 10 activity families. The playback catalog contains 75 recipes; this does not mean 75 independently implemented game engines or 75 automatic writing contracts.

Writing and checking receive the chosen fictional setting, role, real activity controls and source windows. Teaching and answers must be supported by the source. Decorative scenery cannot become answer evidence, and narration cannot promise controls the runtime does not implement. The overall game overview is generated from the resulting material and missions.

AI audio direction selects concrete compatible reading and quest track IDs, an effect profile and effect choices. Local validation checks compatibility. Playback honors saved selections unless the learner explicitly pins a different track. Adaptive playback advances recordings when they finish and procedural scores after four phrases; a deliberate pin repeats. The catalog contains 10 CC0 recordings and 90 original procedural scores, not 100 independent recordings.

## Creation time and saved progress

The read-only provider-log audit found recovered stream interruptions and an ignored obsolete configuration flag. The flag was removed. These records do not establish the cause of an unobserved current run; the user's Mac was locked and no running Asterloom process was available during this audit.

A synthetic 193-section benchmark took about 320 ms for 20 mocked provider calls and 66 checkpoints. This isolates local orchestration; it does not measure provider latency or a large PDF extraction. The 580 displayed steps for 193 sections are progress bookkeeping, not 580 provider calls. A full mission-producing path can require 65 planning calls, 193 writing calls and 65 checking calls, plus summary work and bounded repairs. Sequential provider volume dominates the potential elapsed time.

Retries are bounded. A failed response is not treated as a saved, accepted lesson. Pause/resume retains accepted work; a new edition deliberately does not reuse old lessons. Changes in this update must not be described as a measured full-guide speedup without a representative timed run.

Lossless planner-catalog compaction reduced the synthetic adult planning prompt from 29,008 to 27,591 characters (4.89%). It preserves all recipe descriptions, prerequisites and 50 Aster expressions; only repeated field names and empty defaults are compacted. Roundtrip tests cover all six ages and identical strict output schemas. Request count is unchanged, and characters are not provider-reported tokens.

## Verification limits

Unit and browser checks cover source preservation, explicit creation, audio scheduling, animation events, saved-state recovery, offline assets and accessibility. Native release checks and any bounded live-model check are reported in the release verification file. They do not prove instructional effectiveness, musical taste, sustained enjoyment or age suitability; those require representative learner testing.

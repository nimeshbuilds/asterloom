# Restoration Field Station — native authoring skill

Skill version: 1. Native template ID: `restoration-field-station`.

This skill describes one shipped adult Godot presentation. The three native templates share two source-construction mechanics; their scenery, roles, palette and sound identity differ. It is not a claim that the 75 production recipes are native Godot games.

## Choose this template

Explicit observation procedures, fieldwork order and documented relationships. Ecological topics do not authorize invented growth, weather, cause-and-effect or resource simulation.

Learner role: **Field-model apprentice**. Prepare and inspect the source-defined field model. Visible foliage is a completion metaphor, never evidence that planting, soil or an ecosystem changed.

## Authored setting and crew

Green planted perimeter, rain-collection forms, open trellis, warm daylight and leaf-shaped celebration pieces.

- **Aster** (`aster`): Learning guide.
- **Owen** (`builder`): Field-station steward.
- **Claire** (`analyst`): Observation keeper.

Preserve Aster's established appearance and the authored Owen and Claire identities. Character guidance is prepared and contextual; this native runtime does not provide a live AI chatbot, voice performance or open dialogue tree.

## Fixed adventure beats

Opening title: **Prepare a plan the field team can inspect**.

Meet the crew at a fictional restoration field station. Study the supplied observations with Aster, then arrange the documented steps and trace their stated relationships. Growing scenery is a story reward, not evidence that an ecosystem has changed.

### Briefing — The field-station invitation

Join the field station and identify the observations or procedure supplied by the learner.

Accept the saved briefing before teaching begins. Objectives use the selected activity titles.
Phase attention: `aster`. Portrait use: aster-warm-smile. Sound event: mission_start only after acceptance saves.

### Learning — Read the observation notebook

Read the observation notebook with Aster; separate recorded relations from guessed causes.

Read every prepared lesson before entering guided construction. Each lesson retains its exact source citations.
Phase attention: `aster`. Portrait use: aster-planning. Sound event: aster when moving through ideas; phase_complete when all ideas are saved.

### Building — A guided planting bench

Rehearse the arrangement at the guided planting bench without claiming a planting simulator.

Complete the indicated guided placement/connection before Begin my own build. Rehearsal is cleared atomically for the challenge.
Phase attention: `builder`. Portrait use: owen. Sound event: phase_complete after beginning the independent build saves.

### Challenge — Construct the field model

Build the field model by placing documented steps and connecting only stated relationships.

Commit a construction before comparing its stated rules. A failed save exposes no success or celebration.
Phase attention: `analyst`. Portrait use: owen for sequence, claire for dependency; Aster mood changes only where Aster is rendered. Sound event: correct for first completed nonfinal build; complete for first final build; retry after a saved incorrect attempt.

### Debrief — The stewardship review

Review the model with the stewardship crew; explain an ordering rule using the source.

All available constructions are complete. The interface shows saved source explanations and an optional ungraded reflection.
Phase attention: `analyst`. Portrait use: aster-quiet-celebration. Sound event: No automatic replay on restore; phase_complete only after saving a new field note.

## Native visual and animation direction

- Four raised planters with three plants each.
- Three side planters and a rain-collection barrel.
- Open trellis and a shallow decorative channel.

Persistent progress: Forty-five authored leaf meshes brighten and grow from 0.68 to full scale as saved constructions are completed; no ecosystem is simulated.
Successful action motif: Three flat leaf-like shards around a rising ring. This is a transient authored feedback effect, not source evidence.

Palette: background #0d211e, floor #23443b, structure #526849, accent #9be4a6, secondary #ffd08a, text #f4fff1.
Ambient energy 0.7; key energy 1.4; key color #ffe8bb. The key casts shadows; three nearby guide lights are shadowless. Active guide energy is 0.58, inactive energy 0.18.

The engine owns idle, attention, speaking, celebrate and support poses with 0.25-second procedural transitions. Placement/connection effects last 0.42 seconds; result effects last 0.75 seconds. At most six transient groups and twelve ambient motes run. The camera changes stations over 0.5 seconds. No flashing, screen shake, timed-answer pressure, imported human rig, video or GIF is promised.

## Authored sound direction

Profile `garden` uses felt action timbre at root 261.6256 Hz. Its three-recording order is saying, winter, wisdom.

- briefing: `saying` (Just Saying Tho), -29 dB phase target.
- learning: `winter` (Winter Dust), -34 dB phase target.
- building: `wisdom` (A Brand New Wisdom), -25 dB phase target.
- challenge: `saying` (Just Saying Tho), -23 dB phase target.
- debrief: `wisdom` (A Brand New Wisdom), -29 dB phase target.

The phase entrance plays first, then the remaining full recordings rotate. Crossfades use two music voices over 0.85 seconds. These are three bundled CC0 recordings, not five new compositions or an AI-generated soundtrack.

- `wisdom`: A Brand New Wisdom — `a-brand-new-wisdom.ogg`, CC0-1.0, hernandack.
- `saying`: Just Saying Tho — `just-saying-tho.ogg`, CC0-1.0, hernandack.
- `winter`: Winter Dust — `winter-dust.ogg`, CC0-1.0, hernandack.

Cue IDs: `pickup`, `connect`, `correct`, `retry`, `aster`, `complete`, `character`, `mission_start`, `phase_complete`. Six bounded voices render offline 24 kHz synthesized effects. These native IDs are separate from production music IDs.

Sound starts muted unless a saved enabled preference exists. Mute, focus loss and narration suppress cues; suppressed cues are dropped. No AI instruction can enable sound or change gain.

## Action-to-feedback contract

- select module/node or remove a connection: sound `pickup`; Selection UI; removal does not grant a reward..
- saved module placement: sound `connect`; placed: brief piece emphasis, nearest guide attention and rising ring.
- saved directed connection: sound `connect`; connected: moving link marker, guide attention and paired rising rings.
- first saved correct nonfinal construction: sound `correct`; success: nearest guide celebrates and setting-specific shards rise.
- first saved final construction: sound `complete`; mission_complete: all guides celebrate, debrief opens and progress scenery restores.
- saved incorrect construction: sound `retry`; Support pose and secondary-color ring; no loss of earned progress.
- Aster help: sound `aster`; Prepared source guidance; persist assistance before exposing scored help.
- Owen or Claire guidance: sound `character`; Speaking pose and prepared contextual source hint after assistance saves.
- restore/reopen completed work: sound `none`; Restore saved world progress directly; never replay transient rewards.

## What the model may prepare

Select this `nativeTemplateId` and prepare upstream source-grounded titles, objectives, explanations, short teaching chunks, source-provided worked examples, hints and the exact supported sequence or dependency model. All of that content must pass the existing source and activity validators before conversion.

The converter copies accepted sources, teaching, citations, labels and rules unchanged. It emits only `{version: 1, templateId: SHIPPED_ID}` as presentation selection. It does not copy creative prose, production audio IDs, asset paths, scripts, scene files or new interactions into the native renderer.

Every sequence/dependency contains 2–8 items/nodes and 1–12 rules/edges, at most one activity of each kind. Labels are at most 200 UTF-16 code units. Preserve exact UTF-16 citation positions and source revisions. The full output must fit 4 MiB; never truncate source material to make it fit.

## What remains engine-owned

- Scene and resource loading.
- Character identity, roles, portraits and pose transitions.
- World geometry, lighting, palette and camera.
- Phase order, control wording and source dialogs.
- Music playlist, crossfade, gain and cue synthesis.
- Action-to-animation and action-to-sound mapping.
- Evaluator, assistance state, awards, progress and atomic persistence.

Do not emit GDScript, resource paths, shaders, model files, downloaded assets, animation graphs or sound-on instructions. Do not claim that fictional scenery executes the source procedure, controls infrastructure, simulates an ecosystem or verifies a historical account.

## Learning and delivery acceptance

- Explain each source idea before asking the learner to manipulate it.
- Use one clear teaching idea per chunk; retain qualifications and exact supporting citations.
- Describe only the controls and actors supplied by this runtime.
- Never imply decorative scenery establishes a subject fact or real-world consequence.
- Keep the distinction between independent and supported practice visible.
- Generated pilot models award no official XP or mastery; exported pilot progress is local experimental practice.
- Do not require AI while playing, infer general chatbot ability from prepared crew hints, or promise multiplayer in this runtime.

Keep UI text legible at the 980×680 minimum window; use the existing seated controls, fixed primary action and reduced-motion option. Reduced motion disables transient effects/ambient motes and makes character/camera changes immediate. Preserve source-review access and no-AI offline play. A saved result is restored silently, and an unsuccessful save cannot trigger a success animation.

The portable companion contract is `src/data/nativeTemplateSkills.json`. Runtime manifests remain authoritative; the parity tests must fail if this skill drifts from their cast, phases, palette, lighting, music or supported IDs.

# Asterloom Signalwright — experimental native player

A Godot 4.7.2 workshop for testing whether constructive play improves Asterloom's
learning experience. This is a playable engine experiment, not a replacement for
the production player or a claim that all 75 scaffold presentations have migrated.

The authored native scene supplies movement, physical workstations, piece
placement, directed connections, feedback, local saves and a soundtrack. A bounded
data contract supplies the learning content. Players read the supplied teaching,
try a guided application and then complete a construction task. Rules compare
against the supplied learning model; they do not simulate real engineering systems.

## Content from the existing factory

`tools/convert-learnpack.ts` converts explicitly selected, supported activities
from a validated Asterloom notebook without making AI calls. It preserves prepared
teaching and exact source citations. See `tools/README.md` for the supported sizes,
source handling and validation contract. It rejects unsupported tasks rather than
silently translating them into quizzes or removing content.

The shipped public fixture contains original test material. It does not contain
the user's notebooks. All results remain experimental practice, separate from the
studio's progress and XP. The pilot includes readable source text; the original
notebook remains the archive for its original PDFs, recordings and other media.

## Run and export

Open `project/project.godot` with the official Godot 4.7.2 editor and run the project.
For another converted activity pack, run the project with the user argument
`--mission-pack=/absolute/path/to/converted.json`. Imported learning content is
plain data; there is no extension point for user scripts, scenes, PCKs or shaders.

The reproducible export helper takes a verified official editor and release
templates, and refuses to overwrite an existing output directory:

```sh
node scripts/godot-pilot/build-player.mjs --godot=/path/to/Godot --templates=/path/to/templates --platform=mac --output=/new/output/mac
node scripts/godot-pilot/build-player.mjs --godot=/path/to/Godot --templates=/path/to/templates --platform=windows --output=/new/output/windows
```

Mac exports use one Universal application for Apple silicon and Intel. Windows
exports target x86-64. Distribution signing, notarization and platform testing are
separate release steps; a successful export alone is not evidence that the binary
was tested, signed or trusted by the operating system. No editor installation is
needed to play an exported application.

## Focused checks

Run the converter checks from the repository root after installing the repository's
development dependencies:

```sh
node --import tsx --test scripts/godot-pilot/tools/mission-pack.test.ts
```

The reusable Godot checks are `project/tests/scene_contract_test.gd`,
`project/audio/audio_self_test.gd`, and the two scripts in `qa/`. Use the verified
Godot editor in debug mode, with `--path scripts/godot-pilot/project`; import the
project first with `--headless --editor --import`. The scene-contract test uses
debug assertions and must not be treated as a release-player verification.

For example, with `GODOT` pointing to the editor executable:

```sh
"$GODOT" --headless --path scripts/godot-pilot/project --script "$PWD/scripts/godot-pilot/qa/independent-runtime-check.gd" -- "$PWD/scripts/godot-pilot/fixtures/public-factory-pilot.json" "$PWD/scripts/godot-pilot/test-output/runtime-1"
"$GODOT" --headless --path scripts/godot-pilot/project --script "$PWD/scripts/godot-pilot/qa/independent-scene-check.gd" -- --mission-pack="$PWD/scripts/godot-pilot/fixtures/public-factory-pilot.json" --proof-directory="$PWD/scripts/godot-pilot/test-output/scene-1"
```

Each output directory must be new. Other scene checks require
`ASTERLOOM_PILOT_QA_SAVE` to point to a fresh owned save file, isolating both progress
and audio preferences from normal play. Generated proof, screenshots, exports and
Godot's import cache are not source artifacts. See `PILOT-NOTES.md` for the learning
loop, controls, native checks and remaining integration work.

`qa/native-check.py` verifies an actual signed Universal Mac export using Python
3.11 or later, macOS command-line tools, and an Apple silicon Mac with Rosetta
available. It runs both public fixtures on arm64 and x86_64, checks real capture
bytes, verifies the package stays unchanged, and reopens each save in a fresh
process. Its output directory must not already exist:

```sh
python3 scripts/godot-pilot/qa/native-check.py --app="/path/to/Asterloom Signalwright.app" --output="/new/output/native-check"
```

The previous 0.1.0 pilot was Developer ID signed, notarized and tested on both
Universal architectures. Every new build requires fresh native verification.
Version 0.2.0 adds the adventure presentation described below; its release
verification receipt records the exact tested source and platform coverage.

## Adventure presentation in 0.2.0

Three trusted world profiles supply an operations workshop, restoration field
station and evidence archive. They share the same two construction mechanics;
they are three presentations, not three additional assessment systems. The
converter selects from compatible authored metadata, or accepts an explicit
allowlisted template ID. Neither a source nor AI can supply scene code or paths.

Aster opens a mission briefing with source-derived activity objectives. Learners
read the retained teaching, rehearse a small construction, attempt the full model,
and review a saved debrief. Continue stays outside the scrolling reading panel.
An optional personal reflection survives save failures and resumes on reopening.

Aster keeps her existing portraits. Owen and Claire have original transparent
portraits and clickable, articulated native scene characters. Crew guidance uses
current progress, held items and the prepared source hints. It is offline prepared
guidance, not general AI chat. Optional AI for any host requires a future explicit,
authenticated studio connection; provider credentials must stay out of exported
packs. The existing studio's retrieval and conversation pipeline is the intended
answer authority, with source assistance recorded before showing an answer.

Phase lighting, quiet reading music, two-voice crossfades, nine interaction cues,
character poses and bounded action effects respond to real saved transitions.
World restoration follows saved completion silently. Reduced motion suppresses
ambient and transient motion; a restored game never replays earned celebrations.
Three CC0 recordings are reused with different phase/profile ordering and gain;
this is not a unique composed soundtrack per template.

The new adventure-flow regression checks briefing persistence, fixed lesson
controls, assistance attribution, reflection recovery, legacy saves and reward
replay prevention. Presentation and audio have independent lifecycle tests.

## Proposed production architecture

Keep the existing creator for source import, provider connections, retrieval,
generation, citations and export preparation. Add a precompiled Godot player for
native gameplay. Each native template owns its controls, authored scenes, camera,
animations, score events, accessibility behavior and audio transitions. AI selects
only a compatible template and supplies validated source-grounded content; it does
not generate executable game code. Exported players carry all required assets and
run offline.

Start with a small number of genuinely different interaction families: construct
and connect, explore and investigate, sequence and operate, manage a bounded
simulation, and build a creative explanation. Map existing scaffold themes onto
families only when their source rules fit. A theme is not a new gameplay mechanic.
Add complexity after testing whether learners understand their goal and can apply
what they learned, including on a new problem away from the game.

Before replacing production playback: bridge action events into the existing
durable evaluator, verify notebook/export parity, test native source downloads,
Aster context and optional AI help, provide supported accessible input and motion
settings, complete Mac and Windows release testing, and conduct learner sessions.
Engagement and learning effectiveness require observation of people; automated
checks cannot establish them.

## Notices

The project follows the repository's Asterloom license. Godot is MIT licensed; its
full bundled third-party notices are in `project/GODOT-THIRD-PARTY-NOTICES.txt`.
Music licensing and provenance are in `project/audio/NOTICE.md` and its manifest.
Those notices must accompany exports.

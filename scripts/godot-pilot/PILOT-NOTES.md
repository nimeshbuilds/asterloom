# Signalwright: playable Godot pilot

This is a separate, experimental Godot 4.7.2 desktop project. It does not replace the Asterloom player, open the Asterloom profile, use an AI provider, or turn all 75 scaffolds into 3D games.

## The playable loop

1. Meet Aster in a saved opening briefing, see the source-derived objectives, then learn one short source-cited idea at her station. Each retained teaching section is accessible, including on revisits.
2. Try one guided construction: place two related sequence modules, or connect one directed relationship for a dependency-only pack.
3. Construct the complete model at the workbench. Pick up physical modules and place them in numbered bays; at the adjacent station select a starting node, relationship, and target, then connect them.
4. Check the model. A saved retry explains the actual violated ordering or relationship. Refine the construction and check again. Completion illuminates the construction with matched sound if sound was explicitly enabled.
5. Review the completed models with Aster and optionally save a personal field note. Reopen the same pack to continue its saved work. Opening another pack uses a different hash-derived save filename.

The included original fixture (under the repository license) teaches a deliberately scoped durable-job design: stable IDs, pending state before enqueueing, completed results before acknowledgment, and the roles of queue, store, worker and result view. Its diagrams represent the stated design; the pilot does not execute a cloud service or establish real-world delivery guarantees.

The construction has no timers, lives, dexterity score, compulsory walking, loot boxes, or penalties for taking time. Movement explores a real 3D scene; model construction determines the result. Seated controls provide the same operations without movement. This is a small construction game prototype, not evidence of learning efficacy or a claim of final production-quality art.

## Data and assessment boundary

`project/data/source.json` is the authored demonstration. The separate `tools/` bridge validates a selected existing `.learnpack` with the current factory validators and exports data only. See `tools/README.md` for that contract. No generated scripts or arbitrary resource paths are accepted as scene instructions.

Supported native construction bounds: adult presentation; one or both sequence/dependency activities; 2–8 pieces/nodes; at most 12 relationships/constraints. Unsupported content is refused rather than shortened. Exact source labels remain available on hover/selection, in seated controls and in the connection list; compact identifiers keep the world legible. Original task instructions are preserved in an optional notes view; the main panel describes the actual native controls.

Converted generated activities remain `needs-review` and explicitly experimental. Their checks mean “matches the supplied generated model,” not verified correctness. They grant no XP, mastery, competition score, or Asterloom progress. The separately authored reviewed demonstration can earn local workshop points once per activity. Failed saves expose no new result, reward, hint, or source assistance; repeated/restored completion does not replay rewards. Reviewing model feedback makes a revised attempt supported. Local points do not certify learning.

Sources retain exact strings and hashes. Imported citation positions are JavaScript UTF-16 offsets; the loader validates them as UTF-16, including text before emoji. The source view shows all retained citations and source files as plain text. It does not substitute extracted display labels for the source.

## Controls and settings

- Pointer: click a station, module, bay or concept. The avatar approaches the object; the action then occurs.
- Keyboard: WASD moves; E interacts with a nearby workstation; 1/2/3 switches workstations; Tab and Enter operate the same visible controls; H opens Aster's source hint; Escape cancels selection.
- Controller mappings: left stick moves, A interacts, B cancels, Y requests Aster; shoulder buttons switch to seated workstations. Physical-controller navigation and screen-reader operation still need hands-on acceptance testing; mappings alone are not accessibility certification.
- Sound begins off unless this separate pilot has a saved enabled preference. Its playlist and action cues are local, optional, and explicitly muted with the visible sound button.
- Reduce motion disables idle motion and reward pulses and immediately stops camera transitions. Player-directed movement remains available.
- The prototype supports desktop windows from 980×680. Minimum-window typography is rendered at its actual size, not a scaled-down 1440 canvas.

## Running and verifying

Open `project/project.godot` with the verified Godot editor, or use the separately prepared native export. To load a converted pack pass `-- --mission-pack=/absolute/path/to/pack.json`. No Godot editor is needed by an exported player.

All scene QA invocations set `ASTERLOOM_PILOT_QA_SAVE` to a fresh owned filename, for example under `scripts/godot-pilot/test-output`; this also isolates audio preferences. `-- --qa-smoke` checks scene initialization. `-- --qa-play` exercises real lesson-button and construction callbacks, wrong answer → correction, both model checks, persistence and reopen. Optional `ASTERLOOM_PILOT_QA_SCREENSHOTS` captures this app's own viewport during GPU runs. `-- --qa-screenshot=/absolute/path.png` captures the initial native viewport. These never capture other applications or the desktop.

Headless `--script res://tests/scene_contract_test.gd` covers completed lesson revisits, failed-save protection, preservation of original task wording, and current native-control instructions. Run that assertion-based script in the debug editor, not a release player. Independent QA is in `qa/`; the converter has its own Node tests. Native export, signing, notarization, Windows execution, hardware-controller use and VoiceOver/NVDA acceptance are separate gates and are not established by these editor-runtime tests.

For actual exported Mac players, `qa/native-check.py` runs the authored and converted public fixtures on both Universal architectures, then launches a new process for each to verify saved progress. It pins application files and screenshot bytes before accepting the result. The 0.1.0 release passed four native play runs and fresh-process reopens.
The 0.2.0 adventure update requires its own release receipt and fresh native tests;
prior artifacts do not establish coverage for changed code. Windows execution,
hardware controllers and assistive-technology acceptance remain separate gates.

## Authored cast, worlds and music

The allowlisted presentation catalog contains three settings and a fixed cast:
Aster, Owen and Claire. Their scene geometry is deliberately lightweight and
articulated; the dialogue portraits are detailed illustrations, not rigged human
models. Supporting portrait prompts and provenance live in `project/assets/cast`.
The existing Aster portraits remain unchanged. Scene assets never assert source
facts. Changing a presentation does not rewrite lessons, citations or rules.

Five stages change light levels, character attention and music. Three CC0
recordings crossfade between stage/profile playlists; nine deterministic cues
cover placement, connection, retries, completion and crew interactions. Motion
and sound have separate saved preferences. AI hosts are not connected in this
pilot. Future optional connections must reuse grounded retrieval, real activity
context, cancellation and measured usage through an authenticated studio broker.


## Product integration still required

The core product remains frozen and unchanged by this pilot. Production integration needs an explicit engine/template selection, a versioned pack/export lifecycle, migration and recovery UX, assessment parity against the existing host authority, accessible narration/input review, and native package release testing. This pilot writes only its own progress; it does not attempt to merge points or progress back into Asterloom.

# Native presentation components

These are authored fictional scene decorations and stylized articulated geometry
characters. They do not evaluate answers, invent teaching facts, grant points,
write progress, load arbitrary resources, or produce sound. The host retains the
source-backed learning and durable result rules.

## Host API

```gdscript
const Presentation = preload("res://presentation/WorldPresentation.gd")
var presentation = Presentation.new()
add_child(presentation)
presentation.configure(profile) # Trusted resolve_pack(...).profile, unchanged.
presentation.set_reduced_motion(saved_reduce_motion)
presentation.set_progress(saved_completions, available_missions)
presentation.set_phase("learning")
```

- `configure(profile: Dictionary)`: reads `setting` (`network`, `garden`,
  `archive`), `palette` (`structure`, `accent`, `secondary`), and `cast` entries
  (`id`, `name`, `role`, `color`). Other catalog keys remain host-owned.
- `set_phase(String)`: `briefing`, `learning`, `building`, `challenge`, `debrief`.
  Same phase is inert. Changes attention pose, stage light, and progress-strip
  presentation. It emits `phase_changed`; never a reward or sound.
- `set_progress(completed: int, total: int)`: restores persistent decorative
  milestones directly: workshop indicators, foliage fullness, or archive lights.
  It never emits an event, animates, or produces sound. It is safe during reload.
- `react(event: String, at: Vector3 = Vector3.ZERO)`: `placed`, `connected`,
  `success`, `retry`, `mission_complete` (`completion` alias). The host calls this
  only for a real accepted action/result, after durable save where applicable.
  Restored results must **not** call `react`. Position is in this component's local
  coordinates, matching the current world when added with identity transform.
- `set_character_speaking(id: String, bool)`: highlights one prepared guide.
- `set_reduced_motion(bool)`: makes all character poses immediate/static and
  immediately removes transient effects and disables the twelve ambient motes.
- `character_position(id: String)`: native guide station position.
- `snapshot()`: bounded QA diagnostics, including selected setting, poses,
  current progress and effect count.

`CharacterActor` separately offers `configure(spec)`, `set_pose`, `set_speaking`,
`set_reduced_motion`, `react`, and `snapshot`. Its poses are `idle`, `attention`,
`speaking`, `celebrate`, and `support`. These are intentionally simple geometry
poses, not motion-captured or photorealistic human rigs. Names/roles are metadata
for the host's accessible UI, not labels drawn behind the HUD.

## Layout and limits

The component adds no full floor, colliding furniture, world environment,
background music, or main directional light. The host keeps the core benches,
pieces, camera, floor palette and lighting. Props lie around the perimeter;
central sequence bays and dependency nodes are left clear.

Three guides have static body raycast targets carrying
`action = {type: "character", id: "aster" | "builder" | "analyst"}`.
Other decorative props do not intercept clicks. Three small shadowless station
lights, twelve CPU particles, at most six transient effect groups, and fewer
than 150 decorative meshes per setting keep the scene bounded on Compatibility.
No flashing, shaking, timed-answer requirement, random movement, or text effects.

World restoration is a metaphor for completed practice, not a factual simulation
of a cloud network, ecosystem, or archive and not a claim of learner mastery.

## Verification

Run `presentation_test.gd` with Godot's headless script option. Tests use explicit
checks rather than debug assertions, work with release builds, and never access
normal saves, audio preferences, accounts, network, or user source content.

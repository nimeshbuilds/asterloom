# Existing-game bridge for the Godot pilot

This QA-only converter consumes an existing Asterloom `.learnpack`. It makes no
AI requests and does not edit the input, the user's profile, or any game progress.
Run from the Asterloom repository with its already installed `tsx` dependency:

```sh
node --import tsx scripts/godot-pilot/tools/convert-learnpack.ts --input game.learnpack --list
node --import tsx scripts/godot-pilot/tools/convert-learnpack.ts --input game.learnpack --output new-pilot.json --sequence ACTIVITY_ID --dependency ACTIVITY_ID
node --import tsx scripts/godot-pilot/tools/convert-learnpack.ts --input game.learnpack --output archive.json --sequence ACTIVITY_ID --template archive-investigation
node --import tsx --test scripts/godot-pilot/tools/mission-pack.test.ts
```

Select either activity kind or both. Each selection is explicit: at most one
sequence and one dependency activity. The adult pilot supports 2–8 steps/nodes,
at most 12 distinct sequence constraints or 12 dependency edges, and step/node labels of at most 200 UTF-16 code units.
It rejects larger models rather than removing steps, edges, conditions or labels.
It rejects unsupported/mismatched activity IDs, unfinished AI games, unavailable
source evidence, missing or stale prepared teaching, and invalid package content.

The command validates the entire input with the current `parsePackage`, including
original-file checksums and prepared-lesson/source bindings. It then uses
`hasCurrentActivityEvidence` and `currentAILearningMission` for the selected tasks.
The output is a plain JSON projection with no script, scene, resource-pack,
plugin, provider settings, account data, or asset-path extension points. Quoted
source text is inert text even when it describes code. The native player must
render it as plain text, not executable code or active BBCode/links.

## MissionPack v1 contract

- `format: "asterloom-godot-pilot"`, `version: 1`, `audience: "adult"`.
- `id` binds the exact input package bytes, selected activities and template
  version. `provenance` records the SHA-256 of the input, original notebook ID and
  revision, and the existing activity fingerprints. The hash identifies bytes;
  it does not certify source truth or author identity.
- `presentation: {version: 1, templateId: ...}` selects a shipped authored profile.
  `fictionalSetting` is that profile's display name, not a source claim. The
  selector carries no replacement profile, scene, script, resource or asset path.
- `sources[]` contains only selected missions' readable source text, IDs, titles
  and exact source revision hashes. `source` repeats the first source for the
  original pilot fixture's compatibility. The loader must resolve every citation
  by its own `sourceId`; it must not validate all citations against `source`.
- `offsetEncoding: "utf-16"`. All citation `start`/`end` positions retain the
  original JavaScript UTF-16 offsets (end-exclusive). Godot Unicode code-point
  indices are **not** interchangeable. Native validation must compare the cited
  UTF-16 slice, along with exact source revision, ID, quotation and locator.
- `sequence` and/or `dependency` retain the complete existing activity object,
  including rule direction, relation labels, explanation, review status, source
  references and scaffold bindings. Omitted kinds are unavailable, not empty games.
- `activityEvidence[]` adds exact positioned citations inside the selected
  mission's disclosed teaching windows. `teaching[]` retains each complete current
  prepared lesson, including concepts, all chunks, worked examples, original
  guided application and fictional framing.
- `lessons[]` is the visible concept/chunk/worked-example projection, with text
  unchanged, all exact `citations[]`, `activityId`, and `role`. Its singular
  `quote` is only the first citation for fixture compatibility; render/validate
  the full citation array. Original prepared application instructions refer to
  the existing Asterloom interface. The native pilot supplies its own actual
  controls separately and must not pretend the old controls exist.
- `assessment` is always `{mode: "experimental-practice", mastery: false,
  hostProgressWrites: false}`. Both reviewed and needs-review models remain
  experimental practice in this pilot. Generated rules remain needs-review;
  successful comparison does not establish verified correctness or mastery.

Input is limited to 64 MiB; complete output to 4 MiB. No source is truncated.
Existing output files or symlinks are refused. The command writes and syncs a
temporary sibling, then publishes with an exclusive hard link so an existing
destination cannot be overwritten. An invalid conversion publishes no output.

## Authored presentation catalog

Three profiles in `project/data/templates.json` share the same two construction
mechanics. They are distinct settings and casts, not three new learning engines:

- `signalwright-workshop`: Signalwright Operations Workshop, a technical model
  inspection setting.
- `restoration-field-station`: a fictional ecological field station with an
  observation notebook and stewardship review.
- `archive-investigation`: the Lantern Archive, with case notes and an evidence
  display. Temporal order does not imply causation.

Aster, Owen (`builder`) and Claire (`analyst`) have stable authored IDs; their roles
vary with the setting. The catalog supplies briefing and act titles, palette,
bounded lighting, an audio profile ID, and an accessibility budget: no timers or
flashing, reduced-motion support, seated controls, at most three active cast
members and an 18-pixel minimum text budget. These are presentation requirements;
the native interface must implement them. This catalog does not certify controller
or screen-reader accessibility.

`--template` takes only a shipped ID. Without it, an explicitly chosen matching
notebook theme wins, then the selected scaffolds' shipped domain/skill metadata,
then a matching automatic theme, then Signalwright. Ties between scaffold matches
are resolved by template ID. Source text, source titles, arbitrary instructions
and AI-supplied resource names never select executable content. Selection changes
the new pack's presentation identity; it does not rewrite source facts, lessons,
citations, task rules or assessment status.

The only content slots are `lessons`, `sequence.items`, `dependency.nodes` and
`activityEvidence`. These are fixed identifiers for existing validated pack data,
not dynamic expressions or file paths. The complete prepared teaching remains in
`teaching` without changes.

`template_catalog.gd` exposes static `resolve_pack(pack)`, returning
`{ok, profile, error, legacy}`. It returns a fresh trusted profile or an error, and
never mutates the pack. Packs lacking `presentation` retain Signalwright and their
original save identity. A malformed or unknown selector is rejected rather than
quietly falling back. The existing model validator remains authoritative for
source evidence and task correctness.

Run the additional contract checks from the repository root:

```sh
node --import tsx --test scripts/godot-pilot/tools/template-catalog.test.ts
"$GODOT" --headless --path scripts/godot-pilot/project --script "$PWD/scripts/godot-pilot/tools/template_catalog_test.gd"
```

## Deliberate prototype limits

This bridges validated content into native gameplay. It does not yet connect the
Godot action stream to the host's evaluator or durable progress store. Pilot
results are local practice and must never be imported as official XP or mastery.
The original `.learnpack` retains its PDFs, media originals, generation receipts
and all unselected missions byte-for-byte; the pilot projection carries readable
text and references only. It is not a replacement archive for the original game.
No generated code, arbitrary PCK, scene files or dynamic resource loading is
accepted. The renderer and interaction scenes remain shipped application code.

`public-fixture.ts` supplies original synthetic material for tests only. The
`fixtures/public-factory.learnpack` and `fixtures/public-factory-pilot.json`
artifacts are produced from that fixture through the real package validator and
this converter; they contain no user data or provider output.

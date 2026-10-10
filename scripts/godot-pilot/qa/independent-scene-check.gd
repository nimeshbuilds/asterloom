extends SceneTree
var checks: Dictionary = {}
var failures: Array[String] = []

func _initialize() -> void:
	run_check.call_deferred()

func check(condition: bool, label: String) -> void:
	checks[label] = condition
	if not condition:
		failures.append(label)
		push_error("Independent scene check failed: " + label)

func run_check() -> void:
	var directory := ""
	var package_path := ""
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--proof-directory="): directory = argument.trim_prefix("--proof-directory=")
		if argument.begins_with("--mission-pack="): package_path = argument.trim_prefix("--mission-pack=")
	if not directory.is_absolute_path() or not package_path.is_absolute_path() or DirAccess.dir_exists_absolute(directory):
		push_error("Provide a public mission-pack and new absolute proof directory.")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(directory)
	var input := FileAccess.get_file_as_bytes(package_path)
	var pack: Dictionary = JSON.parse_string(input.get_string_from_utf8())
	var model_script := load("res://scripts/learning_model.gd") as GDScript
	var baseline: RefCounted = model_script.new()
	baseline.initialize(pack, directory.path_join("validation-only.json"))
	for pair in [["completions",1],["edges",[null]],["attempts",null],["results",[]],["supported",1]]:
		var candidate: Dictionary = baseline.fresh_state()
		candidate[pair[0]] = pair[1]
		var path := directory.path_join("malformed-" + pair[0] + ".json")
		var file := FileAccess.open(path, FileAccess.WRITE)
		file.store_string(JSON.stringify({"pack_hash":baseline.pack_hash(),"state":candidate}))
		file.close()
		var restored: RefCounted = model_script.new()
		check(restored.initialize(pack, path) and restored.state == restored.fresh_state(), "malformed_%s_rejected_without_crash" % pair[0])
	var save_path := directory.path_join("isolated-scene-progress.json")
	OS.set_environment("ASTERLOOM_PILOT_QA_SAVE", save_path)
	var scene_resource := load("res://main.tscn") as PackedScene
	var scene := scene_resource.instantiate()
	root.add_child(scene)
	await process_frame
	check(scene.audio.is_muted() and scene.audio.debug_snapshot().started_events == 0, "scene_starts_silent")
	# The other pilot play harness covers normal visible lesson/quest input.
	# Here establish a real saved quest, then probe failed assistance/result saves.
	for lesson in pack.lessons:
		scene.model.finish_idea()
	scene.model.finish_guided()
	scene._set_station("sequence")
	scene.audio.set_muted(false)
	scene.feedback = ""
	scene.model.fail_save_for_test = true
	var before_help: int = scene.audio.debug_snapshot().started_events
	scene._help()
	check(not scene.feedback.begins_with("ASTER") and scene.audio.debug_snapshot().started_events == before_help, "failed_help_save_exposes_no_hint_or_cue")
	scene._show_source(true)
	check(not scene.source_dialog.visible and scene.audio.debug_snapshot().started_events == before_help, "failed_source_help_save_opens_nothing")
	scene.model.fail_save_for_test = false
	scene._show_source(true)
	var full_source := true
	for source in pack.sources:
		full_source = full_source and scene.source_text.text.contains(source.text)
	check(scene.source_dialog.visible and full_source and scene.model.state.supported.sequence, "source_help_marks_support_before_full_plain_text")
	check(not scene.source_text.bbcode_enabled, "source_markup_is_inert")
	scene.source_dialog.hide()
	for index in pack.sequence.items.size():
		scene.model.place_piece(pack.sequence.items[index].id, index)
	scene.model.fail_save_for_test = true
	var before_check: int = scene.audio.debug_snapshot().started_events
	var persisted := FileAccess.get_file_as_bytes(save_path)
	scene._check_build()
	check(scene.audio.debug_snapshot().started_events == before_check and scene.model.state.completions.is_empty() and not scene.pulse.visible, "failed_result_save_has_no_completion_effect")
	check(persisted == FileAccess.get_file_as_bytes(save_path), "failed_scene_result_preserves_saved_bytes")
	scene.model.fail_save_for_test = false
	scene._check_build()
	check(scene.model.state.completions == ["sequence"] and scene.model.state.xp == 0 and scene.audio.debug_snapshot().started_events == before_check + 1, "saved_experimental_match_gets_one_cue_without_xp")
	check(scene.feedback.begins_with("MODEL MATCH SAVED") and scene.feedback.contains("no mastery or XP"), "experimental_feedback_does_not_claim_mastery")
	var after_first: int = scene.audio.debug_snapshot().started_events
	scene._check_build()
	check(scene.audio.debug_snapshot().started_events == after_first, "recheck_does_not_replay_reward_sound")
	scene.queue_free()
	await process_frame
	await create_timer(0.2).timeout
	var reopened := scene_resource.instantiate()
	root.add_child(reopened)
	await process_frame
	check(reopened.model.state.completions == ["sequence"] and reopened.model.state.xp == 0, "scene_completion_reopens")
	check(reopened.audio.debug_snapshot().started_events == 0 and not reopened.pulse.visible, "scene_reopen_has_no_reward_replay")
	check(not reopened.audio.is_muted(), "explicit_sound_preference_restored_in_scene")
	reopened._check_build()
	check(reopened.audio.debug_snapshot().started_events == 0, "reopened_check_does_not_replay_reward")
	reopened.queue_free()
	await process_frame
	await create_timer(0.2).timeout
	check(input == FileAccess.get_file_as_bytes(package_path), "input_package_bytes_unchanged")
	var report := {"passed":failures.is_empty(),"checks":checks,"failures":failures,"engine":Engine.get_version_info().string,"scope":"Focused actual-scene failure/restore boundaries; normal full play is covered by the separate pilot harness.","dummy_audio":true,"real_profile_touched":false,"provider_calls":0}
	var report_file := FileAccess.open(directory.path_join("scene-proof.json"),FileAccess.WRITE)
	report_file.store_string(JSON.stringify(report,"  ")); report_file.close()
	print(JSON.stringify({"passed":failures.is_empty(),"checks":checks.size(),"failures":failures,"directory":directory}))
	quit(0 if failures.is_empty() else 1)

extends SceneTree
# Read-only input package; every save is confined to the fresh evidence directory.
var checks: Dictionary = {}
var failures: Array[String] = []

func _initialize() -> void:
	run_check.call_deferred()

func check(condition: bool, label: String) -> void:
	checks[label] = condition
	if not condition:
		failures.append(label)
		push_error("Independent pilot check failed: " + label)

func utf16_excerpt(text: String, start: int, end: int) -> String:
	return text.to_utf16_buffer().slice(start * 2, end * 2).get_string_from_utf16()

func run_check() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not args[0].is_absolute_path() or not args[1].is_absolute_path():
		push_error("Pass absolute input pack and fresh evidence directory.")
		quit(2)
		return
	var input: String = args[0]
	var directory: String = args[1]
	if DirAccess.dir_exists_absolute(directory):
		push_error("Evidence directory must be new.")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(directory)
	var before := FileAccess.get_file_as_bytes(input)
	var pack: Dictionary = JSON.parse_string(before.get_string_from_utf8())
	var script := load("res://scripts/learning_model.gd") as GDScript
	var model: RefCounted = script.new()
	var save_path := directory.path_join("isolated-progress.json")
	check(model.initialize(pack, save_path), "bridge_pack_accepted")
	if not checks.bridge_pack_accepted:
		finish(directory, before == FileAccess.get_file_as_bytes(input))
		return
	check(pack.sources.size() == 2, "two_full_sources_retained")
	check(pack.sequence.reviewStatus == "needs-review" and pack.dependency.reviewStatus == "needs-review", "draft_status_retained")
	check(pack.assessment.mode == "experimental-practice" and not pack.assessment.mastery, "no_mastery_claim")
	var has_surrogate := false
	var exact_refs := true
	for lesson in pack.lessons:
		for ref in lesson.citations:
			var source: Dictionary = {}
			for candidate in pack.sources:
				if candidate.id == ref.sourceId:
					source = candidate
			exact_refs = exact_refs and not source.is_empty() and utf16_excerpt(source.text, int(ref.start), int(ref.end)) == ref.quote
			if not source.is_empty() and source.text.to_utf16_buffer().size() / 2 != source.text.length():
				has_surrogate = true
	check(exact_refs and has_surrogate, "exact_multi_source_utf16_citations")
	var wrong_position := pack.duplicate(true)
	wrong_position.lessons[0].citations[0].start += 1
	var bad_model: RefCounted = script.new()
	check(not bad_model.initialize(wrong_position, directory.path_join("bad-position.json")), "wrong_positional_quote_rejected")
	var wrong_quote := pack.duplicate(true)
	wrong_quote.lessons[0].citations[0].quote = "This unsupported claim is not in the source."
	check(not bad_model.initialize(wrong_quote, directory.path_join("bad-quote.json")), "invented_quote_rejected")
	var wrong_source := pack.duplicate(true)
	wrong_source.sources[0].text += "\nSource edited after validation."
	check(not bad_model.initialize(wrong_source, directory.path_join("bad-source.json")), "changed_source_revision_rejected")
	var wrong_edge := pack.duplicate(true)
	wrong_edge.dependency.edges[0].to = "not-a-node"
	check(not bad_model.initialize(wrong_edge, directory.path_join("bad-edge.json")), "dangling_model_edge_rejected")
	var premature: Dictionary = model.check("sequence")
	check(not premature.get("saved", true) and model.state.xp == 0, "quest_blocked_before_learning")
	for lesson in pack.lessons:
		check(model.finish_idea(), "lesson_%d_saved" % int(model.state.lesson))
	check(model.finish_guided(), "guided_preparation_saved")
	for index in pack.sequence.items.size():
		check(model.place_piece(pack.sequence.items[index].id, index), "sequence_move_%d_saved" % index)
	var saved_before := FileAccess.get_file_as_bytes(save_path)
	model.fail_save_for_test = true
	var failed: Dictionary = model.check("sequence")
	check(not failed.get("saved", true) and model.state.xp == 0, "failed_save_awards_no_xp")
	check(FileAccess.get_file_as_bytes(save_path) == saved_before, "failed_save_preserves_previous_bytes")
	model.fail_save_for_test = false
	var result: Dictionary = model.check("sequence")
	check(result.get("saved", false) and result.get("correct", false), "correct_sequence_saved")
	check(int(result.get("awarded", -1)) == 0 and int(model.state.xp) == 0 and result.get("first_completion", false), "experimental_completion_awards_no_xp")
	var xp := int(model.state.xp)
	var duplicate: Dictionary = model.check("sequence")
	check(duplicate.get("saved", false) and not duplicate.get("first_completion", true) and int(duplicate.get("awarded", -1)) == 0 and int(model.state.xp) == xp, "repeat_check_has_no_repeat_reward")
	var restored: RefCounted = script.new()
	check(restored.initialize(pack, save_path), "same_pack_reopens")
	check(int(restored.state.xp) == xp and restored.state.guided and "sequence" in restored.state.completions, "completion_and_learning_survive_reopen")
	var replay: Dictionary = restored.check("sequence")
	check(replay.get("saved", false) and not replay.get("first_completion", true) and int(replay.get("awarded", -1)) == 0 and int(restored.state.xp) == xp, "reopen_cannot_reaward_sequence")
	for edge in pack.dependency.edges:
		check(restored.connect_nodes(edge.from, edge.to, edge.relation), "dependency_link_%d_saved" % restored.state.edges.size())
	check(restored.mark_supported("dependency"), "help_marked_before_result")
	var dependency: Dictionary = restored.check("dependency")
	check(dependency.get("saved", false) and dependency.get("correct", false) and dependency.get("supported", false), "dependency_preserves_labels_and_supported_state")
	check(int(dependency.get("awarded", -1)) == 0 and int(restored.state.xp) == 0 and dependency.get("first_completion", false), "experimental_dependency_completion_without_xp")
	var again: Dictionary = restored.check("dependency")
	check(int(again.get("awarded", -1)) == 0 and not again.get("first_completion", true), "dependency_repeat_is_silent_reward")
	# The fixed authored fixture has local workshop points (never host mastery).
	var fixture: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/source.json"))
	var local_model: RefCounted = script.new()
	var local_path := directory.path_join("isolated-reviewed-progress.json")
	check(local_model.initialize(fixture, local_path), "authored_fixture_accepted")
	for idea in fixture.lessons:
		local_model.finish_idea()
	local_model.finish_guided()
	for index in fixture.sequence.items.size():
		local_model.place_piece(fixture.sequence.items[index].id, index)
	local_model.fail_save_for_test = true
	var local_failed: Dictionary = local_model.check("sequence")
	check(not local_failed.get("saved", true) and local_model.state.xp == 0, "authored_failed_save_has_no_points")
	local_model.fail_save_for_test = false
	var local_result: Dictionary = local_model.check("sequence")
	check(local_result.get("saved", false) and local_result.get("correct", false) and local_result.get("awarded", 0) == 40 and local_model.state.xp == 40, "authored_points_after_successful_save")
	var local_reopen: RefCounted = script.new()
	check(local_reopen.initialize(fixture, local_path) and local_reopen.state.xp == 40, "authored_points_persist_after_reopen")
	var local_duplicate: Dictionary = local_reopen.check("sequence")
	check(local_duplicate.get("awarded", -1) == 0 and not local_duplicate.get("first_completion", true) and local_reopen.state.xp == 40, "authored_points_and_reward_not_replayed")
	finish(directory, before == FileAccess.get_file_as_bytes(input))

func finish(directory: String, unchanged: bool) -> void:
	check(unchanged, "input_package_bytes_unchanged")
	var proof := {"passed": failures.is_empty(), "checks": checks, "failures": failures, "engine": Engine.get_version_info().string, "source": "Public synthetic two-source bridge fixture, including emoji and accented text.", "provider_calls": 0, "real_application_profile_touched": false}
	var file := FileAccess.open(directory.path_join("independent-proof.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(proof, "  "))
	file.close()
	print(JSON.stringify({"passed": failures.is_empty(), "checks": checks.size(), "failures": failures, "directory": directory}))
	quit(0 if failures.is_empty() else 1)

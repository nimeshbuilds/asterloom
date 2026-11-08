extends SceneTree
var checks := 0
var failed := false
func require_ok(value: bool, label: String) -> void:
	checks += 1
	if not value: failed = true; push_error("ADVENTURE_FAILED: "+label)
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var path := OS.get_environment("ASTERLOOM_PILOT_QA_SAVE")
	if path.is_empty() or FileAccess.file_exists(path): quit(2); return
	root.size = Vector2i(1440,900)
	var scene = load("res://main.tscn").instantiate(); root.add_child(scene)
	await process_frame
	require_ok(scene.briefing_open and scene._phase() == "briefing", "fresh play opens mission briefing")
	require_ok(scene.primary_button == scene.check_button and scene.check_button.visible, "first action is fixed outside scroll")
	require_ok(scene.presentation.cast.size() == 3, "three crew actors present")
	root.size = Vector2i(980,680)
	await process_frame
	require_ok(scene.status.position.y < 680 and scene.navigation.size.x == 520, "resizing reflows scene controls and status")
	var pack_before: String = JSON.stringify(scene.model.pack)
	scene.model.fail_save_for_test = true; scene._footer_action()
	require_ok(scene.briefing_open and not scene.model.state.briefingSeen, "failed briefing save does not advance")
	require_ok(scene.audio.debug_snapshot().started_events == 0, "failed briefing has no sound")
	scene.model.fail_save_for_test = false; scene._footer_action()
	require_ok(scene.model.state.briefingSeen and scene._phase() == "learning", "saved briefing leads to teaching")
	for lesson in scene.model.pack.lessons:
		require_ok(scene.primary_button == scene.check_button and scene.check_button.visible, "lesson continue remains outside scroll")
		scene._footer_action()
	require_ok(scene._phase() == "building" and scene.model.state.taught, "teaching leads to guided construction")
	var guide: Array = scene._guided_order()
	for i in range(2): scene._pick_piece(guide[i]); scene._place(i)
	scene._footer_action()
	require_ok(scene._phase() == "challenge" and scene.model.state.guided, "guided construction leads to challenge")
	# Reviewing the brief cannot bypass assistance attribution for an independent quest.
	scene.briefing_open = true; scene._refresh()
	scene.model.fail_save_for_test = true; scene._footer_action()
	require_ok(scene.briefing_open and not scene.model.state.supported.sequence, "failed return-to-teaching stays at brief")
	scene.model.fail_save_for_test = false; scene._footer_action()
	require_ok(scene.model.state.supported.sequence and scene.model.state.supported.dependency, "return-to-teaching atomically marks all available tasks supported")
	scene._set_station("sequence")
	# Failed support saves cannot expose crew answers or play character effects.
	scene.model.fail_save_for_test = true; scene._talk_character("analyst")
	require_ok(not scene.source_dialog.visible, "failed crew support save exposes no hint")
	scene.model.fail_save_for_test = false
	for i in guide.size(): scene._pick_piece(guide[i]); scene._place(i)
	scene._check_build(); scene._set_station("dependency")
	for edge in scene.model.pack.dependency.edges:
		scene._choose_node(edge.from); scene.relation = edge.relation; scene._choose_node(edge.to); scene._connect()
	scene._check_build()
	require_ok(scene._phase() == "debrief" and scene.debrief_open, "last saved build opens debrief")
	var earned: int = scene.model.state.xp
	scene.model.fail_save_for_test = true; scene._save_field_note("Keep this unsaved reflection.")
	require_ok(scene.reflection_draft == "Keep this unsaved reflection." and scene.model.state.reflection.is_empty(), "failed note save keeps draft")
	var retained_draft := false
	for child in scene.panel.get_children():
		if child is TextEdit: retained_draft = child.text == scene.reflection_draft
	require_ok(retained_draft, "failed note save leaves visible editable text intact")
	scene.model.fail_save_for_test = false
	require_ok(scene.model.save_reflection("The direction matters because the source states a dependency."), "field reflection saves")
	require_ok(scene.model.state.xp == earned, "reflection does not invent mastery points")
	require_ok(not scene.model.save_reflection("x".repeat(2001)), "oversize reflection rejected")
	require_ok(JSON.stringify(scene.model.pack) == pack_before, "presentation never rewrites source or rules")
	scene.queue_free(); await process_frame
	var persisted := FileAccess.get_file_as_bytes(path)
	scene = load("res://main.tscn").instantiate(); root.add_child(scene); await process_frame
	require_ok(scene.debrief_open and not scene.briefing_open and scene.model.state.xp == earned, "completed adventure reopens at saved debrief")
	require_ok(not scene.model.state.reflection.is_empty(), "reflection reopens")
	require_ok(FileAccess.get_file_as_bytes(path) == persisted, "reopen leaves saved bytes unchanged")
	require_ok(scene.audio.debug_snapshot().started_events == 0 and scene.presentation.effects.get_child_count() == 0, "reopen does not replay celebration")
	# Legacy saves retain progress and source identity without an automatic write.
	var legacy: Dictionary = JSON.parse_string(persisted.get_string_from_utf8())
	legacy.state.erase("briefingSeen"); legacy.state.erase("reflection")
	var legacy_path := path+".legacy"
	var file := FileAccess.open(legacy_path,FileAccess.WRITE); file.store_string(JSON.stringify(legacy)); file.close()
	var legacy_bytes := FileAccess.get_file_as_bytes(legacy_path)
	var old = load("res://scripts/learning_model.gd").new()
	require_ok(old.initialize(scene.model.pack,legacy_path) and old.state.xp == earned and old.state.briefingSeen, "legacy progress migration preserves completed work")
	require_ok(FileAccess.get_file_as_bytes(legacy_path) == legacy_bytes, "legacy normalization does not rewrite disk")
	scene.queue_free(); await process_frame
	print("ADVENTURE_FLOW_", "FAIL" if failed else "PASS", " checks=", checks)
	quit(1 if failed else 0)

extends SceneTree
const World = preload("res://scripts/scenario_world.gd")
var checks := 0
var failures: Array = []
var output_dir := ""
func _initialize() -> void: call_deferred("run")
func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)
func capture(name: String) -> void:
	await process_frame; await process_frame
	if not output_dir.is_empty():
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output_dir.path_join(name+".png"))
func run() -> void:
	var path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--manifest="): path = arg.trim_prefix("--manifest=")
		if arg.begins_with("--output-dir="): output_dir = arg.trim_prefix("--output-dir=")
	if not output_dir.is_empty(): DirAccess.make_dir_recursive_absolute(output_dir)
	var fixtures = JSON.parse_string(FileAccess.get_file_as_string(path)); var entry: Dictionary = {}
	for candidate in fixtures.cases:
		if candidate.scaffoldId == "fault-diagnosis": entry = candidate; break
	var folder := OS.get_temp_dir().path_join("asterloom-scenario-world-"+str(OS.get_process_id())); DirAccess.make_dir_recursive_absolute(folder)
	var a: Dictionary = entry.activity.duplicate(true); a.reviewStatus = "needs-review"
	var notebook := {"id":"scenario-world-controller-test","title":"The resolver recovery case","description":"Public source-based QA fixture","createdAt":"2026-11-07T00:00:00.000Z","updatedAt":"2026-11-07T00:00:00.000Z","revision":1,"ageGroup":"adult","theme":"workshop","goal":"Observe, diagnose and recover the source-defined system.","scaffoldIds":[entry.scaffoldId],"cards":[],"sources":entry.sources,"activities":[a]}
	var pack := {"format":"asterloom-godot-factory","version":1,"notebook":notebook,"missions":[{"scaffoldId":entry.scaffoldId,"activityId":a.id}]}
	var file_path := folder.path_join("pack.json"); var file := FileAccess.open(file_path,FileAccess.WRITE); file.store_string(JSON.stringify(pack)); file.close()
	root.size = Vector2i(1280,900)
	var main = load("res://main.tscn").instantiate(); root.add_child(main); await process_frame; main.save_directory = folder; await main.load_pack(file_path)
	check(main.board is World,"Production selects source-grounded operations presenter")
	if not main.board is World: quit(1); return
	await capture("scenario-start")
	check(main.check_button.get_global_rect().end.y <= root.size.y,"Finish mission remains within viewport")
	var first: String = entry.correctResponse.actions[0]
	var hit: Vector2 = main.board.stage.global_position+main.board.station_point(first)-Vector2(0,28)
	var motion := InputEventMouseMotion.new(); motion.position = hit; root.push_input(motion,true); await process_frame
	for down in [true,false]:
		var mouse := InputEventMouseButton.new(); mouse.button_index = MOUSE_BUTTON_LEFT; mouse.position = hit; mouse.pressed = down; root.push_input(mouse,true); await process_frame
	check(main.board.selected_id == first,"Physical station art responds to pointer inspection")
	await main.run_action({"type":"advance","actionId":first}); await capture("scenario-consequence")
	check(main.board.action_pulse > 0,"Saved engine action triggers its physical station pulse")
	check(not main.board.show_action_details,"Latest consequence takes priority over previously read station description")
	for child in main.board.inspector.get_children():
		if child is Label and child.text == "WHAT CHANGED": check(child.get_global_rect().end.y < main.board.inspector.get_parent().get_global_rect().end.y,"Action consequence heading is immediately visible without scrolling")
	check(main.current_view.snapshot.history.size() == 1 and main.store.activity(a.id).response.actions == [first],"Actual authored action and consequence save together")
	check(main.taught and main.assisted,"First coached case action is recorded as supported learning")
	main.board.show_discoveries(); await capture("scenario-evidence")
	check(main.board.evidence_dialog.visible,"Discovered source field notes open inside game")
	check(main.board.evidence_panel.position.y+main.board.evidence_panel.size.y <= main.board.evidence_dialog.size.y-45,"Evidence scroll body stays above dialog close controls")
	main.board.evidence_dialog.hide()
	var before: Dictionary = main.response.duplicate(true); var before_view: Dictionary = main.current_view.duplicate(true)
	var save_path: String = main.store.path; var blocker := folder.path_join("blocker"); file = FileAccess.open(blocker,FileAccess.WRITE); file.store_string("blocked"); file.close(); main.store.path = blocker.path_join("progress.json")
	main.board.pending = true; main.board.action_pulse = 0
	await main.run_action({"type":"advance","actionId":entry.correctResponse.actions[1]})
	check(main.response == before and main.current_view == before_view,"Failed durable save rolls back action and world state")
	check(main.board.action_pulse == 0,"Failed save does not animate an uncommitted action")
	check(not main.board.pending and main.result.is_empty(),"Failed save permits retry without awarding completion")
	main.store.path = save_path
	for action_id in entry.correctResponse.actions.slice(1): await main.run_action({"type":"advance","actionId":action_id})
	for id in entry.correctResponse.selectedEvidenceIds: main.board.toggle_evidence(str(id),true)
	await main.check_work(); await capture("scenario-complete")
	check(main.practice_result.get("correct") == true and main.store.activity(a.id).participationXp == 20,"Objective and evidence earn saved draft practice participation")
	check(main.result.get("outcome") == "draft-preview" and not main.store.activity(a.id).independent,"Draft remains practice rather than independent mastery")
	var same_mission: Dictionary = main.mission.duplicate(true); await main.open_mission(same_mission)
	check(main.board.action_pulse == 0,"Resume reconstructs state without replaying a new-action celebration")
	check(main.board is World and main.board.feedback.get("correct") == true and main.current_view.snapshot.history.size() == entry.correctResponse.actions.size(),"Resume reconstructs actual decision route and saved completion")
	main.presentation.stop_all(); main.queue_free(); await process_frame
	print("SCENARIO_WORLD_INTEGRATION "+JSON.stringify({"checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

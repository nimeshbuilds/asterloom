extends SceneTree
## Actual native desktop screenshots. Reference answers are QA-only fixtures.
var wanted := ["concept-map-repair","process-reconstruction","fault-diagnosis","build-and-tell","secure-code-review","chart-and-data-investigation","changing-rule-sorter","puppet-stories","discovery-scenes"]
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var manifest_path := ""; var output_dir := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--manifest="): manifest_path = arg.trim_prefix("--manifest=")
		if arg.begins_with("--output-dir="): output_dir = arg.trim_prefix("--output-dir=")
	DirAccess.make_dir_recursive_absolute(output_dir)
	var fixture = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	var main = load("res://main.tscn").instantiate(); root.add_child(main)
	await process_frame
	for entry in fixture.cases:
		if not entry.scaffoldId in wanted: continue
		var a: Dictionary = entry.activity.duplicate(true)
		if entry.scaffoldId == "process-reconstruction": a.reviewStatus = "needs-review"
		var notebook := {"id":"visual-"+str(entry.scaffoldId),"title":str(a.title),"description":"Native visual QA fixture","createdAt":"2026-10-10T00:00:00.000Z","updatedAt":"2026-10-10T00:00:00.000Z","revision":1,"ageGroup":entry.ageGroup,"theme":"islands","goal":"Explore the supplied learning model.","scaffoldIds":[entry.scaffoldId],"cards":[],"sources":entry.sources,"activities":[a]}
		var pack := {"format":"asterloom-godot-factory","version":1,"notebook":notebook,"missions":[{"scaffoldId":entry.scaffoldId,"activityId":a.id}]}
		var file_path: String = output_dir.path_join(str(entry.scaffoldId)+".json")
		var file := FileAccess.open(file_path,FileAccess.WRITE); file.store_string(JSON.stringify(pack)); file.close()
		await main.load_pack(file_path)
		if main.activity.get("id") != a.id: print("VISUAL_QA_ERROR "+str(entry.scaffoldId)+" "+main.status.text); continue
		main.response = entry.correctResponse.duplicate(true); main.taught = true; main.assisted = true
		var state: Dictionary = await main.bridge.request({"op":"view","activity":a,"response":main.response,"sources":entry.sources})
		main.current_view = state.get("view",{}); main.result = {}; main.practice_result = {}; main.render_mission()
		if entry.scaffoldId == "process-reconstruction":
			await main.check_work()
			var saved: Dictionary = main.store.activity(a.id)
			print("NATIVE_DRAFT_PRACTICE "+JSON.stringify({"outcome":main.result.get("outcome"),"practiceCorrect":main.practice_result.get("correct"),"participationXp":saved.get("participationXp"),"independent":saved.get("independent")}))
		await process_frame; await process_frame; await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output_dir.path_join(str(entry.scaffoldId)+".png"))
		if main.board.get_parent() is ScrollContainer: main.board.get_parent().scroll_vertical = 0
		await process_frame; await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output_dir.path_join(str(entry.scaffoldId)+"-controls.png"))
		print("VISUAL_QA "+str(entry.scaffoldId))
	quit()

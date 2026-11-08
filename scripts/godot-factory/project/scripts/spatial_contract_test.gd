extends SceneTree
## Public reference fixtures only. Real signal/drop callbacks build the answers;
## source validity and scoring still come from the bundled assessment engine.
const Spatial = preload("res://scripts/spatial_mission.gd")
const Bridge = preload("res://scripts/assessment_bridge.gd")
var checks := 0
var failures: Array = []
var changes := 0
func _initialize() -> void: call_deferred("run")
func check(value: bool, message: String) -> void:
	checks += 1
	if not value: failures.append(message); push_error(message)
func solve(board, expected: Dictionary) -> void:
	match board.family:
		"classification":
			for index in board.activity.items.size():
				board.select_item(index)
				var item: Dictionary = board.activity.items[index]
				for category_index in board.activity.categories.size():
					var id: String = board.activity.categories[category_index].id
					var wanted: bool = id in expected.assignments[item.id]
					if wanted != (id in board.response.assignments[item.id]):
						var target = board.terminals[category_index]
						var payload := {"activityId":board.activity.id,"type":"route","id":item.id}
						check(target._can_drop_data(Vector2.ZERO,payload),"Own signal accepted by its destination")
						target._drop_data(Vector2.ZERO,payload)
		"sequence":
			for index in expected.order.size():
				var current: int = board.response.order.find(expected.order[index])
				if current == index: continue
				board.token_id = ""; board.render()
				board.terminals[current].pressed.emit()
				board.terminals[index].pressed.emit()
		"completion":
			for index in board.activity.slots.size():
				board.selected = index; board.render()
				var token: String = expected.slotTokens[board.activity.slots[index].id]
				for piece in board.chips:
					if piece.payload.id == token: piece.pressed.emit(); break

func run() -> void:
	var manifest := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--manifest="): manifest = arg.trim_prefix("--manifest=")
	var fixture = JSON.parse_string(FileAccess.get_file_as_string(manifest))
	var bridge = Bridge.new(); root.add_child(bridge); bridge.configure()
	var host := VBoxContainer.new(); host.size = Vector2(920,630); root.add_child(host)
	var representatives := {}; var count := 0
	for entry in fixture.cases:
		if not Spatial.supports(entry.activity): continue
		count += 1; representatives[entry.activity.kind] = entry
		var initialized: Dictionary = await bridge.request({"op":"initial","activity":entry.activity,"sources":entry.sources})
		check(initialized.get("ok",false),entry.scaffoldId+": source-backed initialization")
		if not initialized.get("ok",false): continue
		var board = Spatial.new(); host.add_child(board); board.configure(entry.activity,initialized.response,initialized.get("view",{}),entry.sources); changes = 0
		board.changed.connect(func(_r): changes += 1)
		await process_frame
		if board.family == "classification":
			var id: String = board.activity.items[0].id
			board.terminals[0].grab_focus()
			for down in [true,false]:
				var key := InputEventKey.new(); key.keycode = KEY_SPACE; key.pressed = down; root.push_input(key)
			await process_frame
			check(board.response.assignments[id].size() == 1,entry.scaffoldId+": keyboard Space routes a signal")
			check(board.terminals[0].has_focus(),entry.scaffoldId+": keyboard focus survives rebuilding the objects")
			var point: Vector2 = board.terminals[0].global_position+board.terminals[0].size*0.5
			var motion := InputEventMouseMotion.new(); motion.position = point; root.push_input(motion,true)
			await process_frame
			for down in [true,false]:
				var mouse := InputEventMouseButton.new(); mouse.button_index = MOUSE_BUTTON_LEFT; mouse.pressed = down; mouse.position = point; root.push_input(mouse,true)
				await process_frame
			await process_frame
			check(board.response.assignments[id].is_empty(),entry.scaffoldId+": pointer click disconnects the same signal")
		check(board.render_error.is_empty() and not board.terminals.is_empty(),entry.scaffoldId+": spatial world renders")
		check(board.feedback.is_empty(),entry.scaffoldId+": no correctness shown before assessment")
		for target in board.terminals:
			check(target.size.x >= 44 and target.size.y >= 44,entry.scaffoldId+": destination has usable target")
			var text_height: float = target.get_theme_font("font").get_multiline_string_size(target.text,HORIZONTAL_ALIGNMENT_CENTER,target.size.x-28,target.get_theme_font_size("font_size")).y
			check(text_height <= target.size.y-24,entry.scaffoldId+": full destination label fits its object ("+str(text_height)+" / "+str(target.size.y-24)+", width "+str(target.size.x)+", font "+str(target.get_theme_font_size("font_size"))+")")
			check(not target._can_drop_data(Vector2.ZERO,{"activityId":"other-game","type":"route","id":"foreign"}),entry.scaffoldId+": foreign drag rejected")
		solve(board,entry.correctResponse)
		check(board.response == entry.correctResponse,entry.scaffoldId+": learner callbacks produce exact response")
		check(changes > 0,entry.scaffoldId+": actual control callbacks edit response")
		check(board.feedback.is_empty(),entry.scaffoldId+": choosing a destination does not pretend correctness")
		var evaluated: Dictionary = await bridge.request({"op":"evaluate","activity":entry.activity,"response":board.response,"sources":entry.sources})
		check(evaluated.get("evaluation",{}).get("correct") == true,entry.scaffoldId+": response passes shared grading")
		board.show_feedback(evaluated.get("evaluation",{})); check(board.feedback.get("correct") == true,entry.scaffoldId+": evaluated completion lights the world")
		var restored = Spatial.new(); host.add_child(restored); restored.configure(entry.activity,board.response,{},entry.sources)
		check(restored.response == board.response,entry.scaffoldId+": response restores without edits")
		host.remove_child(board); board.queue_free(); host.remove_child(restored); restored.queue_free(); await process_frame
	check(count > 0,"At least one spatial recipe was exercised")
	host.queue_free()
	# Controller integration: draft practice, saved completion, next mission, failed save.
	var folder := OS.get_temp_dir().path_join("asterloom-spatial-contract-"+str(OS.get_process_id())); DirAccess.make_dir_recursive_absolute(folder)
	var activities: Array = []; var sources: Array = []; var missions: Array = []; var scaffold_ids: Array = []
	for kind in ["classification","sequence","completion"]:
		if not representatives.has(kind): continue
		var entry: Dictionary = representatives[kind]; var a: Dictionary = entry.activity.duplicate(true); a.reviewStatus = "needs-review"; activities.append(a); scaffold_ids.append(entry.scaffoldId); missions.append({"scaffoldId":entry.scaffoldId,"activityId":a.id})
		for source in entry.sources:
			if not sources.any(func(s): return s.id == source.id): sources.append(source)
	var notebook := {"id":"spatial-controller-test","title":"Spatial controller test","description":"Public QA references","createdAt":"2026-10-10T00:00:00.000Z","updatedAt":"2026-10-10T00:00:00.000Z","revision":1,"ageGroup":"adult","theme":"islands","goal":"Explore the source.","scaffoldIds":scaffold_ids,"cards":[],"sources":sources,"activities":activities}
	var pack := {"format":"asterloom-godot-factory","version":1,"notebook":notebook,"missions":missions}
	var path := folder.path_join("pack.json"); var file := FileAccess.open(path,FileAccess.WRITE); file.store_string(JSON.stringify(pack)); file.close()
	var main = load("res://main.gd").new(); root.add_child(main); await process_frame; main.save_directory = folder; await main.load_pack(path)
	check(main.activity.get("id") == activities[0].id,"Controller opens isolated source pack")
	if main.activity.get("id") == activities[0].id:
		check(main.board is Spatial and is_instance_valid(main.coach_copy),"World and grounded coach appear before first move")
		main.show_lesson(); await process_frame; await process_frame
		for body in main.lesson_dialog.get_children():
			if body is VBoxContainer: check(body.position.y+body.size.y <= main.lesson_dialog.size.y-50,"Lesson navigation stays within the dialog above its close button")
		main.lesson_dialog.hide(); main.show_settings(); await process_frame; await process_frame
		for body in main.settings_dialog.get_children():
			if body is ScrollContainer: check(body.position.y+body.size.y <= main.settings_dialog.size.y-50 and body.get_child_count() == 1,"Settings remain scrollable within their dialog")
		main.settings_dialog.hide(); main.show_journey(); await process_frame; await process_frame
		check(main.sidebar.get_parent().position.y+main.sidebar.get_parent().size.y <= main.journey_dialog.size.y-50,"Journey list remains scrollable inside its dialog")
		main.journey_dialog.hide()
		await main.check_work(); check(main.practice_result.get("correct") != true and not main.check_button.disabled,"Wrong attempt stays retryable")
		solve(main.board,representatives.classification.correctResponse)
		check(main.taught and main.assisted,"First coached move saves teaching-supported attempt")
		await main.check_work()
		check(main.practice_result.get("correct") == true and main.check_button.disabled,"Saved draft success makes a clear completed state")
		check(main.store.activity(main.activity.id).participationXp == 20 and not main.store.activity(main.activity.id).independent,"Draft earns participation once, no mastery")
		check(not main.next_mission().is_empty(),"Saved success has a next mission")
		var first: Dictionary = main.mission.duplicate(true); await main.open_mission(main.next_mission()); await main.open_mission(first)
		check(main.practice_result.get("correct") == true and main.board.feedback.get("correct") == true,"Resume restores evaluated world state")
		await main.restart_attempt()
		check(main.coach_title.text == "Try it from memory" and not main.assisted,"Fresh independent attempt does not display the teaching answer")
		solve(main.board,representatives.classification.correctResponse)
		var blocker := folder.path_join("blocker"); file = FileAccess.open(blocker,FileAccess.WRITE); file.store_string("blocked"); file.close(); main.store.path = blocker.path_join("progress.json")
		await main.check_work(); check(main.result.is_empty() and main.board.feedback.is_empty(),"Failed save cannot illuminate completion or award new progress")
	main.presentation.stop_all(); main.queue_free(); bridge.queue_free(); await process_frame
	print("SPATIAL_CONTRACT "+JSON.stringify({"recipes":count,"checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

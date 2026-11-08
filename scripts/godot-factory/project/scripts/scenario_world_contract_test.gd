extends SceneTree
const World = preload("res://scripts/scenario_world.gd")
const Bridge = preload("res://scripts/assessment_bridge.gd")
var checks := 0
var failures: Array = []
func _initialize() -> void: call_deferred("run")
func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)
func label_text(node: Node) -> String:
	var result := str(node.text)+"\n" if node is Label else ""
	for child in node.get_children(): result += label_text(child)
	return result
func run() -> void:
	var path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--manifest="): path = arg.trim_prefix("--manifest=")
	var manifest = JSON.parse_string(FileAccess.get_file_as_string(path))
	var bridge = Bridge.new(); root.add_child(bridge); bridge.configure()
	var host := VBoxContainer.new(); host.size = Vector2(900,760); root.add_child(host)
	var count := 0
	for entry in manifest.cases:
		if not World.supports(entry.activity): continue
		count += 1
		var a: Dictionary = entry.activity.duplicate(true); a.reviewStatus = "needs-review"
		var initialized: Dictionary = await bridge.request({"op":"initial","activity":a,"sources":entry.sources})
		check(initialized.get("ok",false),entry.scaffoldId+": authored draft initializes for practice")
		if not initialized.get("ok",false): continue
		var response: Dictionary = initialized.response; var view: Dictionary = initialized.view
		for action_id in entry.correctResponse.actions:
			var board = World.new(); host.add_child(board); board.configure(a,response,view,entry.sources); await process_frame
			check(board.render_error.is_empty() and not board.stations.is_empty(),entry.scaffoldId+": operation stations render")
			var labels := label_text(board.state_row)
			for variable in a.variables:
				if variable.visibility == "hidden": check(not labels.contains(variable.label),entry.scaffoldId+": hidden state stays hidden")
			var unseen: Array = a.observations.filter(func(o): return o.id not in view.snapshot.observationIds)
			if not unseen.is_empty():
				var before := response.duplicate(true); board.toggle_evidence(str(unseen[0].id),true); check(board.response == before,entry.scaffoldId+": undiscovered evidence cannot enter conclusion")
			var emitted: Array = []; board.action_requested.connect(func(action): emitted.append(action))
			for choice in view.availableActions:
				if not choice.get("available",false): board.request_action(str(choice.action.id)); check(emitted.is_empty(),entry.scaffoldId+": unavailable action cannot execute"); break
			board.select_station(str(action_id)); board.inspector.get_node("TakeAction").pressed.emit(); board.request_action(str(action_id))
			check(emitted.size() == 1 and emitted[0].actionId == action_id,entry.scaffoldId+": inspect and execute emits one action, duplicate click blocked")
			check(board.response == response,entry.scaffoldId+": presenter does not fabricate state before engine/save")
			board.action_failed(); check(not board.pending,entry.scaffoldId+": failed action unlocks controls for retry")
			var advanced: Dictionary = await bridge.request({"op":"action","activity":a,"response":response,"action":emitted[0],"sources":entry.sources})
			check(advanced.get("ok",false),entry.scaffoldId+": station action uses shared engine")
			if not advanced.get("ok",false): break
			check(advanced.view.snapshot.history.size() == view.snapshot.history.size()+1,entry.scaffoldId+": actual consequence advances route")
			response = advanced.response; view = advanced.view
			host.remove_child(board); board.queue_free(); await process_frame
		var board = World.new(); host.add_child(board); board.configure(a,response,view,entry.sources); await process_frame
		for id in entry.correctResponse.selectedEvidenceIds: board.toggle_evidence(str(id),true)
		for observation in a.observations:
			if observation.id in view.snapshot.observationIds:
				board.show_source_evidence(observation)
				for ref_index in observation.evidenceRefs: check(label_text(board.inspector).contains(str(a.sourceRefs[int(ref_index)].evidence)),entry.scaffoldId+": exact source evidence is readable")
				board.inspector.get_child(board.inspector.get_child_count()-1).pressed.emit()
				break
		var evaluated: Dictionary = await bridge.request({"op":"evaluate","activity":a,"response":board.response,"sources":entry.sources})
		check(evaluated.get("practice",{}).get("correct") == true,entry.scaffoldId+": stateful action path and gathered evidence complete practice")
		check(evaluated.get("evaluation",{}).get("outcome") == "draft-preview",entry.scaffoldId+": draft never becomes reviewed mastery")
		check(board.feedback.is_empty(),entry.scaffoldId+": execution and observation do not grant grading rewards")
		board.show_feedback(evaluated.get("practice",{})); check(board.feedback.get("correct") == true,entry.scaffoldId+": only assessed result lights completion")
		check(label_text(board).contains(str(view.snapshot.history.back().consequence)),entry.scaffoldId+": latest actual consequence is visible")
		host.remove_child(board); board.queue_free(); await process_frame
	check(count > 0,"At least one source-backed scenario played")
	print("SCENARIO_WORLD_CONTRACT "+JSON.stringify({"recipes":count,"checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

extends SceneTree
## Dispatch native Control signals through the same callbacks a learner uses.
## Every recipe fixture exercises one real first edit/action; this is not a full playthrough.
const Board = preload("res://scripts/activity_board.gd")
const Bridge = preload("res://scripts/assessment_bridge.gd")
var response_changes := 0
var requested_actions: Array = []
var failures: Array = []
func _initialize() -> void: call_deferred("run")
func walk(node: Node, type_name: String) -> Array:
	var found: Array = []
	if node.is_class(type_name): found.append(node)
	for child in node.get_children(): found.append_array(walk(child,type_name))
	return found
func choose(menu: OptionButton, index := 1) -> void:
	if menu.item_count <= index: return
	menu.select(index); menu.item_selected.emit(index)
func press_named(board: Node, prefix: String) -> bool:
	for control in walk(board,"Button"):
		if not control.disabled and control.text.begins_with(prefix): control.pressed.emit(); return true
	return false
func run() -> void:
	var path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--manifest="): path = arg.trim_prefix("--manifest=")
	var data = JSON.parse_string(FileAccess.get_file_as_string(path)); var seen := {}; var cases := 0
	var bridge = Bridge.new(); root.add_child(bridge); bridge.configure()
	var host := ScrollContainer.new(); host.size = Vector2(1080,760); root.add_child(host)
	for entry in data.cases:
		var kind: String = entry.activity.kind
		var capability_key := kind
		if entry.activity.has("scenarioPresentation"): capability_key += ":"+",".join(entry.activity.scenarioPresentation.keys())
		if entry.activity.has("partner"): capability_key += ":partner"
		if entry.activity.has("codeReview"): capability_key += ":code-review"
		if entry.activity.has("pattern"): capability_key += ":pattern"
		if entry.activity.has("mode") and kind in ["picture","child-play"]: capability_key += ":"+str(entry.activity.mode)
		seen[capability_key] = true; cases += 1
		var case_key: String = str(entry.scaffoldId)+" ("+capability_key+")"
		var initial: Dictionary = await bridge.request({"op":"initial","activity":entry.activity,"sources":entry.sources})
		if not initial.get("ok",false): failures.append(case_key+": initialization failed"); continue
		var board = Board.new(); host.add_child(board); board.configure(entry.activity,initial.response,initial.get("view",{}),entry.sources)
		response_changes = 0; requested_actions = []
		board.changed.connect(func(_response): response_changes += 1)
		board.action_requested.connect(func(action): requested_actions.append(action))
		await process_frame
		for control in walk(board,"Button"):
			if control.get_class() == "Button" and control.get_parent() is HBoxContainer and (control.size.x < 160 or control.size.y < 44): failures.append(case_key+": row control text/target collapsed")
		var controls: Array
		match kind:
			"sequence":
				if entry.activity.items.size() <= 24: press_named(board,"Move later")
				else:
					press_named(board,"Choose step"); await process_frame; press_named(board,"Place here")
			"classification": controls = walk(board,"CheckBox"); controls[0].button_pressed = true
			"decision": controls = walk(board,"Button"); controls[0].pressed.emit()
			"dependency":
				controls = walk(board,"OptionButton"); choose(controls[0],1); choose(controls[1],1); choose(controls[2],2); press_named(board,"Connect")
			"budget": controls = walk(board,"SpinBox"); controls[0].value = 1
			"rubric","diagram","completion","rule-switch": controls = walk(board,"OptionButton"); choose(controls[0])
			"data","recall": controls = walk(board,"LineEdit"); controls[-1].text = "1"; controls[-1].text_changed.emit("1")
			"media": press_named(board,"Visit ")
			"scenario":
				if entry.activity.get("scenarioPresentation",{}).has("campaign"):
					press_named(board,"Add to plan:"); press_named(board,"Commit this plan")
				else:
					for control in walk(board,"Button"):
						if not control.disabled: control.pressed.emit(); break
			"construction","picture-build": press_named(board,"Add ")
			"explanation":
				if entry.activity.has("partner"): press_named(board,"I am ready for this handoff")
				elif entry.activity.has("codeReview"): controls = walk(board,"CheckBox"); controls[0].button_pressed = true
				else: controls = walk(board,"OptionButton"); choose(controls[0])
			"picture":
				controls = walk(board,"Button")
				for control in controls:
					if not control is CheckBox: control.pressed.emit(); break
			"child-play":
				for act in entry.activity.actions:
					if act.fromSceneId == entry.activity.startSceneId: press_named(board,str(act.label)); break
		await process_frame
		var accepted_actions := 0
		for action in requested_actions:
			var applied: Dictionary = await bridge.request({"op":"action","activity":entry.activity,"sources":entry.sources,"response":board.response,"action":action})
			if applied.get("ok",false): accepted_actions += 1
		var passed := response_changes > 0 or accepted_actions > 0
		if not passed: failures.append(case_key+": no native response edit or accepted action")
		print("NATIVE_INTERACTION "+case_key+" changed="+str(response_changes)+" actions="+str(accepted_actions)+" passed="+str(passed))
		host.remove_child(board); board.queue_free()
	var recipe_failures := failures.size()
	# Boundary checks exercise the exact controls named in generated teaching.
	for count in [24,25]:
		var items: Array = []; var order: Array = []
		for index in count: items.append({"id":str(index),"label":"Step "+str(index)}); order.append(str(index))
		var board = Board.new(); host.add_child(board); board.configure({"kind":"sequence","items":items},{"order":order},{},[])
		if count == 24:
			if not press_named(board,"Move later") or board.response.order[1] != "0": failures.append("Sequence boundary: Move later changes the order")
			await process_frame
			if not press_named(board,"Move earlier") or board.response.order[0] != "0": failures.append("Sequence boundary: Move earlier restores the step")
		else:
			press_named(board,"Choose step"); await process_frame
			if not press_named(board,"Place here") or board.response.order[1] != "0": failures.append("Large sequence: choose a step then Place here changes the order")
		host.remove_child(board); board.queue_free()
	var main = load("res://main.gd").new(); root.add_child(main); await process_frame
	main.taught = true; main.notebook = {"sources":[],"ageGroup":"adult"}; main.response = {"ratings":{}}
	for mode in ["self-assessment","sample-review"]:
		main.activity = {"id":"rubric-label-check","kind":"rubric","mode":mode,"sample":"A bounded sample","criteria":[]}; main.render_mission()
		var expected: String = "Save my reflection" if mode == "self-assessment" else "Check my work"
		var found := false
		for control in walk(main.content,"Button"):
			if control.text == expected: found = true
		if not found: failures.append("Rubric guide: missing "+expected)
	main.presentation.stop_all(); main.queue_free(); await process_frame
	print("NATIVE_INTERACTION_SUMMARY "+JSON.stringify({"families":seen.size(),"cases":cases,"passed":cases-recipe_failures,"guideBoundaryChecks":5,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

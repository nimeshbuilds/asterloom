extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	if OS.get_environment("ASTERLOOM_PILOT_QA_SAVE").is_empty(): quit(1); return
	root.size = Vector2i(1440,900)
	var scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	var checks := 0
	while not scene.model.state.taught:
		scene.primary_button.pressed.emit()
		await process_frame
	assert(scene.model.state.taught); checks+=1
	scene._set_station("learn")
	scene._review_idea(0)
	assert(scene.model.state.lesson == 0 and scene.model.state.taught); checks+=1
	var next: Button
	for child in scene.panel.get_children():
		if child is Button and child.text == "Next idea →": next = child
	assert(next != null and not next.disabled); checks+=1
	next.pressed.emit()
	assert(scene.model.state.lesson == 1 and scene.model.state.taught); checks+=1
	scene.model.fail_save_for_test = true
	scene._review_idea(0)
	assert(scene.model.state.lesson == 1 and scene.model.state.taught); checks+=1
	scene.model.fail_save_for_test = false
	var original_instruction: String = scene.model.pack.sequence.instruction
	scene.model.pack.sequence.instruction = "Preserve the stated constraint. Use Move earlier or Move later, then Check my work."
	assert("Move earlier" not in scene._native_instruction("sequence")); checks+=1
	assert("Check my build" in scene._native_instruction("sequence")); checks+=1
	scene.station = "sequence"
	scene._show_task_notes()
	assert(scene.model.pack.sequence.instruction in scene.source_text.text); checks+=1
	assert("original player" in scene.source_text.text); checks+=1
	scene.source_dialog.hide()
	scene.model.pack.sequence.instruction = original_instruction
	assert(scene.audio.is_muted()); checks+=1
	# A completed independent attempt stays independent after feedback and reopening.
	scene._begin_quest()
	scene._set_station("dependency")
	for edge in scene.model.pack.dependency.edges:
		scene._choose_node(edge.from)
		scene.relation = edge.relation
		scene._choose_node(edge.to)
		scene._connect()
	scene._check_build()
	assert(scene.model.state.results.dependency.correct); checks+=1
	assert(not scene.model.state.results.dependency.supported); checks+=1
	assert(scene.model.state.supported.dependency); checks+=1
	assert(scene.model.state.xp == 40); checks+=1
	assert(scene.panel.get_child(0).text == "QUEST / YOUR OWN BUILD"); checks+=1
	scene.queue_free()
	await process_frame
	scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene._set_station("dependency")
	assert(scene.panel.get_child(0).text == "QUEST / YOUR OWN BUILD"); checks+=1
	assert(scene.model.state.xp == 40 and not scene.model.state.results.dependency.supported); checks+=1
	# Editing clears only the checked result, so the next attempt is visibly supported.
	var removed: Dictionary = scene.model.state.edges[0].duplicate(true)
	var changed: bool = scene.model.remove_edge(0)
	assert(changed); checks+=1
	scene._refresh()
	assert(scene.panel.get_child(0).text == "QUEST / SUPPORTED PRACTICE"); checks+=1
	assert(scene.model.state.xp == 40); checks+=1
	scene._choose_node(removed.from)
	scene.relation = removed.relation
	scene._choose_node(removed.to)
	scene._connect()
	scene._check_build()
	assert(scene.model.state.results.dependency.supported and scene.model.state.results.dependency.correct); checks+=1
	assert(scene.model.state.xp == 40); checks+=1
	assert(scene.panel.get_child(0).text == "QUEST / SUPPORTED PRACTICE"); checks+=1
	print("PILOT_SCENE_CONTRACT_PASS checks=",checks)
	scene.queue_free()
	await process_frame
	quit()

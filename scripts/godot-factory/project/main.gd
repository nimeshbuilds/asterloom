extends Control
const Bridge = preload("res://scripts/assessment_bridge.gd")
const Store = preload("res://scripts/progress_store.gd")
const Board = preload("res://scripts/activity_board.gd")
const Presentation = preload("res://presentation/world_presentation.gd")
var presentation: Node
var bridge: Node
var store = Store.new()
var catalog: Dictionary = {}
var pack: Dictionary = {}
var notebook: Dictionary = {}
var mission: Dictionary = {}
var activity: Dictionary = {}
var response: Dictionary = {}
var current_view: Dictionary = {}
var result: Dictionary = {}
var practice_result: Dictionary = {}
var assisted := false
var taught := false
var sidebar: VBoxContainer
var content: VBoxContainer
var status: Label
var board: VBoxContainer
var heading: Label
var source_dialog: AcceptDialog
var source_selector: OptionButton
var source_text: RichTextLabel
var busy := false
var loading_pack := false
var loading_mission := false
var qa_manifest := ""
var qa_output := ""
var capture_path := ""
var save_directory := ""
var preferences_path := ""
var storage_owner := ""
var asset_manifest_path := ""
var native_media: Dictionary = {}

func _ready() -> void:
	catalog = read_json("res://data/catalog.json")
	bridge = Bridge.new(); add_child(bridge); bridge.configure()
	build_ui()
	var input_path := "res://data/mission.json"
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--storage-owner="): storage_owner = argument.trim_prefix("--storage-owner=")
		if argument.begins_with("--preferences-file="): preferences_path = argument.trim_prefix("--preferences-file=")
		if argument.begins_with("--save-dir="): save_directory = argument.trim_prefix("--save-dir=")
		if argument.begins_with("--asset-manifest="): asset_manifest_path = argument.trim_prefix("--asset-manifest=")
		if argument.begins_with("--mission-pack="): input_path = argument.trim_prefix("--mission-pack=")
		if argument.begins_with("--qa-manifest="): qa_manifest = argument.trim_prefix("--qa-manifest=")
		if argument.begins_with("--qa-output="): qa_output = argument.trim_prefix("--qa-output=")
		if argument.begins_with("--qa-screenshot="): capture_path = argument.trim_prefix("--qa-screenshot=")
	presentation = Presentation.new()
	if not preferences_path.is_empty(): presentation.settings_path = preferences_path
	elif not save_directory.is_empty(): presentation.settings_path = save_directory.path_join("presentation.cfg")
	add_child(presentation)
	if not qa_manifest.is_empty(): await qa_run(); return
	if FileAccess.file_exists(input_path): await load_pack(input_path)
	else: show_catalog()

func read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	return data if data is Dictionary else {}

func build_ui() -> void:
	var app_theme := Theme.new(); app_theme.default_font_size = 19
	app_theme.set_color("font_readonly_color","TextEdit",Color("e5efed"))
	app_theme.set_color("font_color","Label",Color("e5efed")); app_theme.set_color("font_color","Button",Color("e5efed"))
	for name in ["normal","hover","pressed","focus"]:
		var style := StyleBoxFlat.new(); style.bg_color = Color("24404e") if name == "normal" else Color("365f69"); style.set_corner_radius_all(8); style.set_content_margin_all(12); style.border_color = Color("65c5b0"); style.set_border_width_all(2 if name == "focus" else 0); app_theme.set_stylebox(name,"Button",style)
	theme = app_theme
	var margin := MarginContainer.new(); margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); margin.add_theme_constant_override("margin_left",22); margin.add_theme_constant_override("margin_right",22); margin.add_theme_constant_override("margin_top",18); margin.add_theme_constant_override("margin_bottom",18); add_child(margin)
	var outer := VBoxContainer.new(); outer.add_theme_constant_override("separation",16); margin.add_child(outer)
	var header := HBoxContainer.new(); outer.add_child(header)
	heading = Label.new(); heading.text = "ASTERLOOM  /  Native learning factory"; heading.add_theme_font_size_override("font_size",27); heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL; header.add_child(heading)
	var open := Button.new(); open.text = "Open learning pack"; open.pressed.connect(open_file); header.add_child(open)
	var source_button := Button.new(); source_button.text = "Source library"; source_button.pressed.connect(show_sources); header.add_child(source_button)
	var columns := HSplitContainer.new(); columns.size_flags_vertical = Control.SIZE_EXPAND_FILL; outer.add_child(columns)
	var nav_scroll := ScrollContainer.new(); nav_scroll.custom_minimum_size.x = 265; columns.add_child(nav_scroll)
	sidebar = VBoxContainer.new(); sidebar.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sidebar.add_theme_constant_override("separation",10); nav_scroll.add_child(sidebar)
	var main_scroll := ScrollContainer.new(); main_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; columns.add_child(main_scroll)
	content = VBoxContainer.new(); content.size_flags_horizontal = Control.SIZE_EXPAND_FILL; content.add_theme_constant_override("separation",15); main_scroll.add_child(content)
	status = Label.new(); status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; outer.add_child(status)
	source_dialog = AcceptDialog.new(); source_dialog.title = "Supplied source library"; source_dialog.min_size = Vector2i(850,560); add_child(source_dialog)
	var source_tools := HBoxContainer.new(); source_tools.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE); source_tools.offset_left = 18; source_tools.offset_right = -18; source_tools.offset_top = 16; source_dialog.add_child(source_tools)
	source_selector = OptionButton.new(); source_selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL; source_selector.item_selected.connect(select_source); source_tools.add_child(source_selector)
	var save_source := Button.new(); save_source.text = "Save this source text…"; save_source.pressed.connect(save_source_text); source_tools.add_child(save_source)
	source_text = RichTextLabel.new(); source_text.bbcode_enabled = false; source_text.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); source_text.offset_left = 18; source_text.offset_right = -18; source_text.offset_top = 74; source_text.offset_bottom = -55; source_dialog.add_child(source_text)

func open_file() -> void:
	var dialog := FileDialog.new(); dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE; dialog.access = FileDialog.ACCESS_FILESYSTEM; dialog.filters = PackedStringArray(["*.json ; Asterloom native learning pack"]); dialog.use_native_dialog = true; add_child(dialog); dialog.file_selected.connect(func(path): await load_pack(path); dialog.queue_free()); dialog.canceled.connect(dialog.queue_free); dialog.popup_centered_ratio(0.75)

func clear_content() -> void:
	for child in content.get_children(): content.remove_child(child); child.queue_free()
	board = null

func text_block(value: String, size_px := 19) -> Label:
	var label := Label.new(); label.text = value; label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; label.add_theme_font_size_override("font_size",size_px); content.add_child(label); return label

func add_button(value: String, callback: Callable, parent: Node = content) -> Button:
	var button := Button.new(); button.text = value; button.custom_minimum_size.y = 44; button.pressed.connect(callback); parent.add_child(button)
	if parent == sidebar: button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return button

func show_catalog() -> void:
	clear_content(); text_block("Choose a source-backed learning adventure",30)
	text_block("Open a prepared native learning pack to play offline. The catalog contains 75 authored recipes. Each recipe requires its own reviewed source model and the controls its contract specifies.")
	for template in catalog.get("templates",[]):
		add_button(str(template.name),func(): show_recipe(template),sidebar)
	status.text = "Native Godot controls • Local progress • No AI connection needed while playing"

func show_recipe(template: Dictionary) -> void:
	clear_content(); text_block(str(template.name),30); text_block(str(template.tagline),23); text_block(str(template.description)); text_block("Your role: "+str(template.story.role)+"\nSetting: "+str(template.story.setting)); text_block(str(template.mechanic)); text_block("Source requirements: "+"; ".join(template.prerequisites)); text_block(str(template.runtime.runtimeHint)); text_block("Open a learning pack with a reviewed activity prepared for this recipe.")

func load_pack(path: String) -> void:
	if busy: return
	busy = true; loading_pack = true; status.text = "Checking source evidence and authored learning models…"
	var raw := read_json(path)
	var checked: Dictionary = await bridge.request({"op":"validate-pack","pack":raw})
	if not checked.get("ok",false):
		busy = false; loading_pack = false; status.text = str(checked.get("error","This learning pack could not be opened.")); return
	var incoming_pack: Dictionary = checked.get("pack",raw)
	if not storage_owner.is_empty() and str(incoming_pack.get("notebook",{}).get("id","")).sha256_text() != storage_owner:
		busy = false; loading_pack = false; status.text = "Open this other notebook’s native preview from the studio so its progress stays separate."; return
	pack = incoming_pack; notebook = pack.get("notebook",{})
	native_media = await load_native_media(notebook.get("sources",[]))
	store.initialize(pack,OS.get_environment("ASTERLOOM_FACTORY_QA_SAVE"),save_directory)
	heading.text = "ASTERLOOM  /  "+str(notebook.get("title","Learning adventure"))
	for child in sidebar.get_children(): sidebar.remove_child(child); child.queue_free()
	for entry in pack.get("missions",[]):
		var title := str(entry.scaffoldId)
		for template in catalog.templates:
			if template.id == entry.scaffoldId: title = template.name
		add_button(title,func(): await open_mission(entry),sidebar)
	busy = false; loading_pack = false
	if not pack.get("missions",[]).is_empty(): await open_mission(pack.missions[0])

func open_mission(entry: Dictionary) -> void:
	if busy: return
	busy = true; loading_mission = true; mission = entry; activity = {}
	for candidate in notebook.get("activities",[]):
		if candidate.id == entry.activityId: activity = candidate; break
	if activity.is_empty(): status.text = "This mission has no validated activity."; busy = false; loading_mission = false; return
	var saved: Dictionary = store.activity(str(activity.id))
	var initialized: Dictionary = await bridge.request({"op":"initial","activity":activity,"response":saved.get("response",{}),"sources":notebook.sources})
	busy = false; loading_mission = false
	if not initialized.get("ok",false): status.text = str(initialized.get("error","The activity could not be opened.")); return
	response = initialized.get("response",{}); current_view = initialized.get("view",{}); result = saved.get("result",{}); practice_result = saved.get("practice",{}); assisted = saved.get("assisted",false); taught = saved.get("taught",false)
	render_mission()
	if not capture_path.is_empty(): await get_tree().process_frame; await RenderingServer.frame_post_draw; get_viewport().get_texture().get_image().save_png(capture_path)

func render_mission() -> void:
	clear_content()
	var recipe: Dictionary = {}
	for template in catalog.get("templates",[]):
		if template.id == mission.get("scaffoldId"): recipe = template
	presentation.set_narration_active(false)
	presentation.configure(recipe,mission,str(notebook.get("ageGroup","adult")))
	presentation.set_phase("play" if taught else "study")
	content.add_child(presentation.create_banner())
	text_block(str(activity.get("title","Mission")),30)
	var story: Dictionary = mission.get("story",recipe.get("story",{}))
	if not story.is_empty(): text_block(str(story.get("role","")).capitalize()+" • "+str(story.get("setting","")),21)
	text_block(str(activity.get("instruction","")))
	if not taught:
		text_block("Learn from the supplied source",24)
		var teaching: Dictionary = mission.get("teaching",{})
		if not teaching.is_empty():
			text_block(str(teaching.get("objective","")),22)
			text_block(str(teaching.conceptExplanation.text))
			for citation in teaching.conceptExplanation.get("citations",[]): text_block("Source: "+str(citation.get("quote","")),16)
			for chunk in teaching.chunks:
				text_block(str(chunk.title),22); text_block(str(chunk.text))
				for citation in chunk.get("citations",[]): text_block("Source: "+str(citation.get("quote","")),16)
			if teaching.has("workedExample"):
				text_block(str(teaching.workedExample.title),24)
				for step in teaching.workedExample.steps: text_block(str(step.title),21); text_block(str(step.text))
			text_block(str(teaching.guidedApplication.prompt),22)
			for step in teaching.guidedApplication.steps: text_block("• "+str(step))
		else:
			# Exact source excerpts are available without inventing a teaching plan.
			for reference in activity.get("sourceRefs",[]): text_block(str(reference.evidence))
		add_button("I have studied the source — begin",func():
			taught = true; assisted = true
			if save_current(): render_mission()
			else: taught = false; assisted = false)
		status.text = "Study the evidence before starting the activity."; return
	board = Board.new(); content.add_child(board); board.configure(activity,response,current_view,notebook.get("sources",[]),native_media)
	board.changed.connect(func(updated):
		if loading_pack or loading_mission: return
		response = updated; result = {}; practice_result = {}
		if activity.kind == "recall" and not response.get("revealedIds",[]).is_empty(): assisted = true
		if save_current(): presentation.play_cue("place"))
	board.narration_active.connect(func(active): presentation.set_narration_active(active))
	board.action_requested.connect(run_action)
	add_button("Save my reflection" if activity.kind == "rubric" and activity.get("mode") == "self-assessment" else "Check my work",check_work)
	add_button("Show a source hint",func(): assisted = true; if save_current(): presentation.play_cue("reveal"); status.text = str(activity.get("hint","Review the supplied source.")))
	add_button("Save and pause",func(): if save_current(): status.text = "Progress saved locally. You can close this window and resume later.")
	add_button("Start a fresh attempt without hints",restart_attempt)
	text_block("Native preview • Progress is saved in this player. Aster, shared progress, challenge rooms, and full video playback are available in the full game.",15)
	if not result.is_empty(): display_result()
	else: status.text = "Use the activity controls, then check your work."

func save_current() -> bool:
	if loading_pack or loading_mission: return false
	var ok: bool = store.save_activity(str(activity.id),response,result,assisted,taught,practice_result)
	if not ok: status.text = store.last_error
	return ok

func run_action(action: Dictionary) -> void:
	if busy: return
	busy = true; status.text = "Applying the authored action…"
	var submitted_response := JSON.stringify(response)
	var checked: Dictionary = await bridge.request({"op":"action","activity":activity,"response":response,"action":action,"sources":notebook.get("sources",[])})
	busy = false
	if JSON.stringify(response) != submitted_response: status.text = "Your choices changed while the action was processing. Apply the action again."; return
	if not checked.get("ok",false): status.text = str(checked.get("error","The action is unavailable at this point.")); return
	response = checked.get("response",response); current_view = checked.get("view",{}); result = {}; practice_result = {}
	if save_current(): presentation.play_cue("commit"); render_mission()

func check_work() -> void:
	if busy: return
	busy = true; status.text = "Checking the prepared model…"
	var submitted_response := JSON.stringify(response)
	var checked: Dictionary = await bridge.request({"op":"evaluate","activity":activity,"response":response,"sources":notebook.get("sources",[])})
	busy = false
	if JSON.stringify(response) != submitted_response: status.text = "Your choices changed while checking. Check the current work again."; return
	if not checked.get("ok",false): status.text = str(checked.get("error","The work could not be checked.")); return
	var previous := result.duplicate(true); var previous_practice := practice_result.duplicate(true)
	result = checked.get("evaluation",{}); practice_result = checked.get("practice",{})
	if result.get("hintUsed",false): assisted = true
	if not save_current(): result = previous; practice_result = previous_practice; return
	var feedback: Dictionary = practice_result if not practice_result.is_empty() else result
	presentation.play_cue("success" if feedback.get("correct") == true else "complete" if feedback.get("outcome") == "self-reviewed" else "retry")
	render_mission()

func display_result() -> void:
	var feedback_result: Dictionary = practice_result if not practice_result.is_empty() else result
	if not practice_result.is_empty(): text_block("Authoring preview • This model still needs human review. Results are practice feedback.",20)
	text_block(str(feedback_result.get("feedback","")),22)
	for detail in feedback_result.get("details",[]): text_block(str(detail.get("message","")))
	var participation_xp := 0
	for saved in store.state.activities.values(): participation_xp += int(saved.get("participationXp",0))
	if participation_xp > 0: text_block(str(participation_xp)+" participation XP saved in this native game",20)
	if not practice_result.is_empty():
		status.text = "Saved: preview practice completed • 20 participation XP, awarded once." if practice_result.get("correct") == true or practice_result.get("outcome") == "self-reviewed" else "Preview attempt saved. Revise the model response using the practice feedback."
		return
	if result.get("outcome") == "correct": status.text = "Saved: supported success." if assisted else "Saved: independent success on this prepared model."
	elif result.get("outcome") == "self-reviewed": status.text = "Saved: human or self reviewed participation."
	else: status.text = "Attempt saved. Review the feedback and revise your work."

func restart_attempt() -> void:
	if busy: return
	busy = true
	var initialized: Dictionary = await bridge.request({"op":"initial","activity":activity,"sources":notebook.get("sources",[])})
	busy = false
	if not initialized.get("ok",false): status.text = str(initialized.get("error","A fresh attempt could not be prepared.")); return
	var previous_response := response.duplicate(true); var previous_view := current_view.duplicate(true)
	var previous_result := result.duplicate(true); var previous_practice := practice_result.duplicate(true); var previous_assisted := assisted
	# Teaching remains completed. Only this deliberately fresh attempt loses its hints/reveals.
	response = initialized.response; current_view = initialized.get("view",{}); result = {}; practice_result = {}; assisted = false
	if save_current(): render_mission()
	else: response = previous_response; current_view = previous_view; result = previous_result; practice_result = previous_practice; assisted = previous_assisted

func show_sources() -> void:
	if loading_pack or loading_mission: return
	# Opening the evidence is assistance for the current attempt, even during a check.
	if not activity.is_empty() and taught:
		assisted = true
		if not save_current(): return
	source_selector.clear()
	for source in notebook.get("sources",[]): source_selector.add_item(str(source.get("title","Source")))
	if source_selector.item_count > 0: source_selector.select(0); select_source(0)
	else: source_text.text = "This learning pack has no supplied sources."
	source_dialog.popup_centered_ratio(0.85)

func select_source(index: int) -> void:
	var sources: Array = notebook.get("sources",[])
	if index >= 0 and index < sources.size(): source_text.text = str(sources[index].get("text",""))

func save_source_text() -> void:
	var sources: Array = notebook.get("sources",[]); var index := source_selector.selected
	if index < 0 or index >= sources.size(): return
	var text := str(sources[index].get("text",""))
	var dialog := FileDialog.new(); dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE; dialog.access = FileDialog.ACCESS_FILESYSTEM; dialog.use_native_dialog = true
	dialog.title = "Save supplied source text"; dialog.current_file = "source-notes.txt"; dialog.filters = PackedStringArray(["*.txt ; Source text"]); add_child(dialog)
	dialog.file_selected.connect(func(path):
		var file := FileAccess.open(path,FileAccess.WRITE)
		if file == null: status.text = "The source text could not be saved at that location."
		else: file.store_string(text); file.close(); status.text = "Source text saved. Original uploaded files remain available in the full game's source downloads."
		dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free); dialog.popup_centered_ratio(0.75)

func qa_run() -> void:
	var started := Time.get_ticks_msec(); var manifest = JSON.parse_string(FileAccess.get_file_as_string(qa_manifest)); var cases: Array = manifest if manifest is Array else manifest.get("cases",[])
	var report := {"version":1,"cases":[],"elapsedMs":0,"engine":"Godot "+str(Engine.get_version_info().string)}
	for entry in cases:
		var case_start := Time.get_ticks_msec(); var a: Dictionary = entry.get("activity",{}); var supplied: Array = entry.get("sources",[])
		var item := {"scaffoldId":entry.get("scaffoldId",""),"activityId":a.get("id",""),"kind":a.get("kind",""),"rendered":false,"controlCount":0,"controlTypes":{},"resumeEqual":false,"error":""}
		var initialized: Dictionary = await bridge.request({"op":"initial","activity":a,"sources":supplied})
		if not initialized.get("ok",false): item.error = initialized.get("error","initial failed"); report.cases.append(item); continue
		clear_content(); var test_board = Board.new(); content.add_child(test_board); test_board.configure(a,initialized.response,initialized.get("view",{}),supplied)
		await get_tree().process_frame
		var counts := {}; count_controls(test_board,counts); item.controlTypes = counts
		for count in counts.values(): item.controlCount += count
		item.rendered = test_board.render_error.is_empty(); item.error = test_board.render_error
		for pair in [["correctResponse","evaluationCorrect"],["wrongResponse","evaluationWrong"]]:
			if entry.has(pair[0]):
				var evaluated: Dictionary = await bridge.request({"op":"evaluate","activity":a,"response":entry[pair[0]],"sources":supplied}); item[pair[1]] = evaluated
		var test_store = Store.new(); var save_path := "user://qa-"+str(OS.get_process_id())+".json"; var test_pack := {"activity":a,"sources":supplied}
		test_store.initialize(test_pack,save_path)
		var resume_response: Dictionary = entry.get("correctResponse",initialized.response)
		var saved_ok: bool = test_store.save_activity(str(a.id),resume_response,{},false,true)
		var restored = Store.new(); restored.initialize(test_pack,save_path)
		item.resumeEqual = saved_ok and JSON.stringify(restored.activity(str(a.id)).get("response",{})) == JSON.stringify(resume_response)
		DirAccess.remove_absolute(ProjectSettings.globalize_path(save_path))
		if not supplied.is_empty():
			var stale: Array = supplied.duplicate(true); stale[0]["text"] = "Changed source content invalidates previously authored evidence."
			var invalid: Dictionary = await bridge.request({"op":"evaluate","activity":a,"response":resume_response,"sources":stale}); item.sourceInvalidationRejected = not invalid.get("ok",false)
		item.elapsedMs = Time.get_ticks_msec()-case_start; report.cases.append(item)
		print("NATIVE_QA "+str(item.scaffoldId)+" rendered="+str(item.rendered)+" controls="+str(item.controlCount))
	report.elapsedMs = Time.get_ticks_msec()-started
	if not qa_output.is_empty():
		DirAccess.make_dir_recursive_absolute(qa_output.get_base_dir()); var output := FileAccess.open(qa_output,FileAccess.WRITE); output.store_string(JSON.stringify(report,"  ")); output.close()
	print("NATIVE_QA_COMPLETE "+str(report.cases.size())+" cases")
	get_tree().quit()

func count_controls(node: Node, counts: Dictionary) -> void:
	if node is Control: var key := node.get_class(); counts[key] = counts.get(key,0)+1
	for child in node.get_children(): count_controls(child,counts)

func load_native_media(sources: Array) -> Dictionary:
	if asset_manifest_path.is_empty(): return {}
	var manifest: Dictionary = read_json(asset_manifest_path)
	if manifest.get("version") != 1 or not manifest.get("assets") is Array: return {}
	var worker := Thread.new(); worker.start(validate_native_media.bind(manifest.assets,sources))
	while worker.is_alive(): await get_tree().process_frame
	return worker.wait_to_finish()

func validate_native_media(assets: Array, sources: Array) -> Dictionary:
	var validated: Dictionary = {}
	for entry in assets:
		if not entry is Dictionary or not str(entry.get("path","")).is_absolute_path(): continue
		for source in sources:
			if source.id != entry.get("sourceId") or not source.get("asset") is Dictionary: continue
			var expected: Dictionary = source.asset
			if expected.sha256 != entry.get("sha256") or expected.size != entry.get("size") or expected.mime != entry.get("mime"): continue
			var media_path: String = entry.path
			if FileAccess.file_exists(media_path) and FileAccess.get_sha256(media_path) == expected.sha256:
				validated[source.id] = {"path":media_path,"mime":expected.mime}
	return validated

extends Control
const Bridge = preload("res://scripts/assessment_bridge.gd")
const Store = preload("res://scripts/progress_store.gd")
const Board = preload("res://scripts/activity_board.gd")
const Spatial = preload("res://scripts/spatial_mission.gd")
const ScenarioWorld = preload("res://scripts/scenario_world.gd")
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
var journey_dialog: AcceptDialog
var settings_dialog: AcceptDialog
var lesson_dialog: AcceptDialog
var coach_copy: Label
var coach_title: Label
var check_button: Button
var journey_label: Label
var lesson_page := 0

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
	presentation.apply_launch_preferences(OS.get_cmdline_user_args())
	if not qa_manifest.is_empty(): await qa_run(); return
	if FileAccess.file_exists(input_path): await load_pack(input_path)
	else: show_catalog()

func read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	return data if data is Dictionary else {}

func build_ui() -> void:
	var app_theme := Theme.new(); app_theme.default_font_size = 18
	app_theme.set_color("font_readonly_color","TextEdit",Color("e5efed"))
	app_theme.set_color("font_color","Label",Color("e5efed")); app_theme.set_color("font_color","Button",Color("e5efed"))
	for name in ["normal","hover","pressed","focus"]:
		var style := StyleBoxFlat.new(); style.bg_color = Color("24404e") if name == "normal" else Color("365f69"); style.set_corner_radius_all(8); style.set_content_margin_all(12); style.border_color = Color("65c5b0"); style.set_border_width_all(2 if name == "focus" else 0); app_theme.set_stylebox(name,"Button",style)
	theme = app_theme
	var margin := MarginContainer.new(); margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); margin.add_theme_constant_override("margin_left",22); margin.add_theme_constant_override("margin_right",22); margin.add_theme_constant_override("margin_top",18); margin.add_theme_constant_override("margin_bottom",18); add_child(margin)
	var outer := VBoxContainer.new(); outer.add_theme_constant_override("separation",14); margin.add_child(outer)
	var header := HBoxContainer.new(); outer.add_child(header)
	heading = Label.new(); heading.text = "ASTERLOOM"; heading.add_theme_font_size_override("font_size",24); heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL; heading.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; header.add_child(heading)
	journey_label = Label.new(); journey_label.add_theme_color_override("font_color",Color("a5ccbe")); header.add_child(journey_label)
	add_button("Journey",show_journey,header)
	add_button("Sources",show_sources,header)
	add_button("Pause & settings",show_settings,header)
	journey_dialog = AcceptDialog.new(); journey_dialog.title = "Your journey"; journey_dialog.wrap_controls = false; journey_dialog.min_size = Vector2i(650,560); add_child(journey_dialog)
	var nav_scroll := ScrollContainer.new(); nav_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); nav_scroll.offset_left = 18; nav_scroll.offset_top = 18; nav_scroll.offset_right = -18; nav_scroll.offset_bottom = -60; journey_dialog.add_child(nav_scroll)
	sidebar = VBoxContainer.new(); sidebar.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sidebar.add_theme_constant_override("separation",10); nav_scroll.add_child(sidebar)
	content = VBoxContainer.new(); content.size_flags_horizontal = Control.SIZE_EXPAND_FILL; content.size_flags_vertical = Control.SIZE_EXPAND_FILL; content.add_theme_constant_override("separation",12); outer.add_child(content)
	status = Label.new(); status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; status.add_theme_font_size_override("font_size",14); status.add_theme_color_override("font_color",Color("9db8b7")); outer.add_child(status)
	source_dialog = AcceptDialog.new(); source_dialog.title = "Supplied source library"; source_dialog.wrap_controls = false; source_dialog.min_size = Vector2i(850,560); add_child(source_dialog)
	var source_tools := HBoxContainer.new(); source_tools.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE); source_tools.offset_left = 18; source_tools.offset_right = -18; source_tools.offset_top = 16; source_dialog.add_child(source_tools)
	source_selector = OptionButton.new(); source_selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL; source_selector.item_selected.connect(select_source); source_tools.add_child(source_selector)
	var save_source := Button.new(); save_source.text = "Save this source text…"; save_source.pressed.connect(save_source_text); source_tools.add_child(save_source)
	source_text = RichTextLabel.new(); source_text.bbcode_enabled = false; source_text.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); source_text.offset_left = 18; source_text.offset_right = -18; source_text.offset_top = 74; source_text.offset_bottom = -55; source_dialog.add_child(source_text)

func open_file() -> void:
	var dialog := FileDialog.new(); dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE; dialog.access = FileDialog.ACCESS_FILESYSTEM; dialog.filters = PackedStringArray(["*.json ; Asterloom native learning pack"]); dialog.use_native_dialog = true; add_child(dialog); dialog.file_selected.connect(func(path): await load_pack(path); dialog.queue_free()); dialog.canceled.connect(dialog.queue_free); dialog.popup_centered_ratio(0.75)

func clear_content() -> void:
	for child in content.get_children(): content.remove_child(child); child.queue_free()
	board = null
	coach_copy = null; coach_title = null; check_button = null

func text_block(value: String, size_px := 19) -> Label:
	var label := Label.new(); label.text = value; label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; label.add_theme_font_size_override("font_size",size_px); content.add_child(label); return label

func add_button(value: String, callback: Callable, parent: Node = content) -> Button:
	var button := Button.new(); button.text = value; button.custom_minimum_size.y = 44; button.pressed.connect(callback); parent.add_child(button)
	if parent == sidebar: button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return button

func show_catalog() -> void:
	clear_content(); text_block("Choose a source-backed learning adventure",30)
	text_block("Open a prepared game to explore its lessons and play offline.")
	add_button("Open a prepared game…",open_file)
	for template in catalog.get("templates",[]):
		add_button(str(template.name),func(): show_recipe(template),sidebar)
	status.text = "Your progress stays on this computer. An AI connection is not needed to play."

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
	heading.text = str(notebook.get("title","Learning adventure")).replace("_"," ")
	refresh_journey()
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
	lesson_page = 0
	render_mission()
	if not capture_path.is_empty(): await get_tree().process_frame; await RenderingServer.frame_post_draw; get_viewport().get_texture().get_image().save_png(capture_path)

func render_mission() -> void:
	var selected_item: int = board.selected if is_instance_valid(board) and board is Spatial and board.activity.get("id") == activity.get("id") else 0
	clear_content()
	var recipe: Dictionary = {}
	for template in catalog.get("templates",[]):
		if template.id == mission.get("scaffoldId"): recipe = template
	presentation.set_narration_active(false)
	presentation.configure(recipe,mission,str(notebook.get("ageGroup","adult")))
	presentation.set_phase("play" if taught else "study")
	text_block(str(activity.get("title","Mission")),27)
	var play_row := HBoxContainer.new(); play_row.add_theme_constant_override("separation",18); play_row.size_flags_vertical = Control.SIZE_EXPAND_FILL; content.add_child(play_row)
	var play_column := VBoxContainer.new(); play_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL; play_column.size_flags_vertical = Control.SIZE_EXPAND_FILL; play_row.add_child(play_column)
	var spatial: bool = Spatial.supports(activity)
	var scenario_world: bool = ScenarioWorld.supports(activity)
	if scenario_world:
		var world_scroll := ScrollContainer.new(); world_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; world_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; world_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; play_column.add_child(world_scroll)
		board = ScenarioWorld.new(); board.size_flags_horizontal = Control.SIZE_EXPAND_FILL; world_scroll.add_child(board); board.configure(activity,response,current_view,notebook.get("sources",[]),native_media)
		board.set_world(presentation.world_texture(),presentation.reduced_motion,presentation.age_settings.get("palette",{}),str(presentation.recipe.get("world",{}).get("layout","console")))
		board.inspected.connect(func(_id): presentation.play_cue("inspect"))
	elif spatial:
		board = Spatial.new(); board.selected = selected_item; play_column.add_child(board); board.configure(activity,response,current_view,notebook.get("sources",[]),native_media)
		board.set_world(presentation.world_texture(),presentation.reduced_motion)
		board.inspected.connect(func(_id): presentation.play_cue("inspect"))
	else:
		var scrolling := ScrollContainer.new(); scrolling.size_flags_vertical = Control.SIZE_EXPAND_FILL; scrolling.size_flags_horizontal = Control.SIZE_EXPAND_FILL; play_column.add_child(scrolling)
		board = Board.new(); board.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scrolling.add_child(board); board.configure(activity,response,current_view,notebook.get("sources",[]),native_media)
	build_coach(play_row)
	board.changed.connect(func(updated):
		if loading_pack or loading_mission: return
		response = updated; result = {}; practice_result = {}
		if not taught: taught = true; assisted = true; presentation.set_phase("play")
		if activity.kind == "recall" and not response.get("revealedIds",[]).is_empty(): assisted = true
		if save_current():
			presentation.play_cue("place"); status.text = "Evidence saved. Explore another action or finish your conclusion." if scenario_world else "Your move is saved. Run the connection when you are ready to test it."
			if is_instance_valid(check_button): check_button.disabled = false
			show_coach_lesson())
	board.narration_active.connect(func(active): presentation.set_narration_active(active))
	board.action_requested.connect(run_action)
	var actions := HBoxContainer.new(); actions.add_theme_constant_override("separation",12); content.add_child(actions)
	var world_note := Label.new(); world_note.text = "Explore → observe → build a supported conclusion" if scenario_world else "Build a connection. Bring this part of your journey to life."; world_note.size_flags_horizontal = Control.SIZE_EXPAND_FILL; world_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; world_note.add_theme_color_override("font_color",Color("b1c8be")); actions.add_child(world_note)
	check_button = add_button("Finish mission" if scenario_world else "Run connection" if spatial else "Save my reflection" if activity.kind == "rubric" and activity.get("mode") == "self-assessment" else "Check my work",check_work,actions); check_button.custom_minimum_size = Vector2(210,54)
	check_button.add_theme_color_override("font_color",Color("ffe2a1"))
	if not result.is_empty(): display_result()
	else: status.text = "Explore the idea with Aster, then make your first move. Your choices are saved as you go."
	refresh_journey()

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
	if JSON.stringify(response) != submitted_response:
		status.text = "Your choices changed while the action was processing. Apply the action again."
		if board is ScenarioWorld: board.action_failed()
		return
	if not checked.get("ok",false):
		status.text = str(checked.get("error","The action is unavailable at this point."))
		if board is ScenarioWorld: board.action_failed()
		return
	var previous_response := response.duplicate(true); var previous_view := current_view.duplicate(true)
	var previous_result := result.duplicate(true); var previous_practice := practice_result.duplicate(true)
	var previous_taught := taught; var previous_assisted := assisted
	response = checked.get("response",response); current_view = checked.get("view",{}); result = {}; practice_result = {}
	if not taught: taught = true; assisted = true
	if save_current():
		presentation.play_cue("commit"); render_mission()
		if board is ScenarioWorld: board.play_consequence()
	else:
		response = previous_response; current_view = previous_view; result = previous_result; practice_result = previous_practice
		taught = previous_taught; assisted = previous_assisted
		if board is ScenarioWorld: board.action_failed()

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
	var checked_feedback: Dictionary = practice_result if not practice_result.is_empty() else result
	# Retry feedback can reveal the model's expected relationships. A later repair
	# is supported work; a deliberately fresh attempt can still be independent.
	if checked_feedback.get("correct") != true and not checked_feedback.get("details",[]).is_empty(): assisted = true
	if not save_current(): result = previous; practice_result = previous_practice; return
	var feedback: Dictionary = practice_result if not practice_result.is_empty() else result
	presentation.play_cue("success" if feedback.get("correct") == true else "complete" if feedback.get("outcome") == "self-reviewed" else "retry")
	render_mission()

func display_result() -> void:
	var feedback_result: Dictionary = practice_result if not practice_result.is_empty() else result
	var complete: bool = feedback_result.get("correct") == true or feedback_result.get("outcome") == "self-reviewed"
	if board is Spatial or board is ScenarioWorld: board.show_feedback(feedback_result)
	coach_title.text = "Mission complete" if complete else "A connection to revisit"
	coach_copy.text = ("Practice result" if not practice_result.is_empty() else "Result")+": %d / %d checks\n\n" % [int(feedback_result.get("score",0)),int(feedback_result.get("maxScore",0))]+str(feedback_result.get("feedback",""))
	if not complete:
		for detail in feedback_result.get("details",[]):
			if detail.get("correct") == false: coach_copy.text += "\n\n"+str(detail.get("message","")); break
	else:
		coach_copy.text += "\n\nThis part of your journey is saved. Take the next path when you are ready."
	if not practice_result.is_empty(): coach_copy.text += "\n\nPractice feedback from an AI draft. This lesson has not been reviewed for accuracy."
	check_button.disabled = complete
	if complete:
		var next := next_mission()
		add_button("Next mission" if not next.is_empty() else "See your journey",func():
			if next.is_empty(): show_journey()
			else: await open_mission(next),check_button.get_parent())
	if not practice_result.is_empty():
		status.text = "Saved · 20 participation XP for this mission." if complete else "Attempt saved. Follow the feedback, change a connection, and try again."
		return
	if result.get("outcome") == "correct": status.text = "Saved: supported success." if assisted else "Saved: independent success on this prepared model."
	elif result.get("outcome") == "self-reviewed": status.text = "Saved: human or self reviewed participation."
	else: status.text = "Attempt saved. Review the feedback and revise your work."

func next_mission() -> Dictionary:
	var entries: Array = pack.get("missions",[])
	for index in entries.size():
		if entries[index].get("activityId") == activity.get("id") and index+1 < entries.size(): return entries[index+1]
	return {}

func refresh_journey() -> void:
	for child in sidebar.get_children(): sidebar.remove_child(child); child.queue_free()
	var completed := 0; var current := 1; var xp := 0; var entries: Array = pack.get("missions",[])
	for index in entries.size():
		var entry: Dictionary = entries[index]; var saved: Dictionary = store.activity(str(entry.activityId))
		var done: bool = saved.get("independent",false) or int(saved.get("participationXp",0)) > 0
		xp += int(saved.get("participationXp",0))
		if done: completed += 1
		if entry.activityId == activity.get("id"): current = index+1
		var title := str(entry.scaffoldId)
		for a in notebook.get("activities",[]):
			if a.id == entry.activityId: title = str(a.title)
		add_button(("COMPLETE  ·  " if done else "%02d  ·  " % [index+1])+title,func(): journey_dialog.hide(); await open_mission(entry),sidebar)
	journey_label.text = "Mission %d / %d  ·  %d XP  ·  %d complete" % [current,entries.size(),xp,completed] if not entries.is_empty() else ""
	journey_label.tooltip_text = "Saved participation XP. AI draft practice does not award independent mastery."

func show_journey() -> void:
	refresh_journey(); journey_dialog.popup_centered_ratio(0.72); fit_dialog_body(journey_dialog,sidebar.get_parent())

func panel_style() -> StyleBoxFlat:
	var frame := StyleBoxFlat.new(); frame.bg_color = Color("132d35"); frame.set_corner_radius_all(16); frame.set_content_margin_all(18); frame.border_color = Color("385b60"); frame.set_border_width_all(1); return frame

func panel_text(parent: Node, value: String, font_size := 18) -> Label:
	var label := Label.new(); label.text = value; label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; label.add_theme_font_size_override("font_size",font_size); parent.add_child(label); return label

func build_coach(parent: Node) -> void:
	var panel := PanelContainer.new(); panel.custom_minimum_size.x = 295; panel.size_flags_horizontal = Control.SIZE_FILL; panel.add_theme_stylebox_override("panel",panel_style()); parent.add_child(panel)
	var column := VBoxContainer.new(); column.add_theme_constant_override("separation",12); panel.add_child(column)
	var introduction := HBoxContainer.new(); introduction.add_theme_constant_override("separation",12); column.add_child(introduction)
	var portrait := TextureRect.new(); portrait.texture = load("res://presentation/aster-guide.png"); portrait.custom_minimum_size = Vector2(76,88); portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED; portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE; introduction.add_child(portrait)
	panel_text(introduction,"Aster\nYour guide",19).add_theme_color_override("font_color",Color("ddc793"))
	if activity.get("reviewStatus") != "reviewed": panel_text(column,"Practice · AI-created lesson",13).add_theme_color_override("font_color",Color("adc4c2"))
	coach_title = panel_text(column,"Before your first move",22)
	var scroll := ScrollContainer.new(); scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; scroll.custom_minimum_size.y = 240; column.add_child(scroll)
	coach_copy = panel_text(scroll,"",18)
	add_button("Explore the lesson",show_lesson,column)
	add_button("A source hint",func():
		assisted = true
		if save_current():
			presentation.play_cue("reveal"); coach_title.text = "Look for this in your source"; coach_copy.text = str(activity.get("hint","Open Sources to inspect the evidence behind this mission.")),column)
	show_coach_lesson()

func short_idea(text: String) -> String:
	# Show a complete leading sentence; the full authored lesson remains one click away.
	var boundary := text.find(". ")
	if boundary >= 0 and boundary < 480: return text.substr(0,boundary+1)
	return text

func show_coach_lesson() -> void:
	if not is_instance_valid(coach_copy): return
	var teaching: Dictionary = mission.get("teaching",{})
	coach_title.text = "Try it from memory" if taught and not assisted else "Follow your evidence" if taught and board is ScenarioWorld else "Make a connection" if taught else "Before your first move"
	var idea := str(teaching.get("conceptExplanation",{}).get("text",""))
	if taught and not assisted: idea = ""
	coach_copy.text = short_idea(idea) if not idea.is_empty() else str(activity.get("instruction","Explore the supplied material."))
	coach_copy.text += "\n\n"+str(activity.get("instruction","")).replace("Check my work","Run connection" if board is Spatial else "Check my work") if not idea.is_empty() else ""
	if activity.get("kind") == "classification": coach_copy.text += "\n\nStart with the signal on the left. Connect it to the destinations that fit, then move to the next signal."
	elif activity.get("kind") == "sequence": coach_copy.text += "\n\nSelect two relays to change their order, or drag a relay into position. Run the connection to see what needs work."
	elif activity.get("kind") == "completion": coach_copy.text += "\n\nRead the open module. Choose a piece to fit the socket, then explore the next module."
	elif board is ScenarioWorld: coach_copy.text += "\n\nInspect a station before acting. Watch what changes, read the discoveries in Field notes, and use the evidence to support your conclusion."

func lesson_pages() -> Array:
	var pages: Array = []; var teaching: Dictionary = mission.get("teaching",{})
	if not teaching.is_empty():
		pages.append({"title":teaching.get("title","The idea"),"text":teaching.get("conceptExplanation",{}).get("text",""),"citations":teaching.get("conceptExplanation",{}).get("citations",[])})
		pages.append_array(teaching.get("chunks",[]))
		for step in teaching.get("workedExample",{}).get("steps",[]): pages.append(step)
		var guided: Dictionary = teaching.get("guidedApplication",{})
		if not guided.is_empty(): pages.append({"title":"Try it in your mission","text":str(guided.get("prompt",""))+"\n\n"+"\n\n".join(guided.get("steps",[]))})
	else:
		pages.append({"title":"Your mission","text":activity.get("instruction","")})
		for ref in activity.get("sourceRefs",[]): pages.append({"title":"Evidence from your source","text":ref.get("evidence","")})
	return pages

func show_lesson() -> void:
	if loading_pack or loading_mission: return
	assisted = true
	if not save_current(): return
	if is_instance_valid(lesson_dialog): lesson_dialog.queue_free()
	lesson_dialog = AcceptDialog.new(); lesson_dialog.title = "Explore with Aster"; lesson_dialog.wrap_controls = false; lesson_dialog.min_size = Vector2i(730,570); lesson_dialog.ok_button_text = "Back to the world"; add_child(lesson_dialog)
	var pages := lesson_pages(); lesson_page = clampi(lesson_page,0,pages.size()-1); var page: Dictionary = pages[lesson_page]
	# AcceptDialog owns its direct child's content rectangle. Full-rect anchors
	# would fight that layout and can retain a taller previous window size.
	var column := VBoxContainer.new(); column.add_theme_constant_override("separation",16); lesson_dialog.add_child(column)
	panel_text(column,str(page.get("title","Explore the idea")),24)
	var scroll := ScrollContainer.new(); scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; column.add_child(scroll); var text_column := VBoxContainer.new(); text_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL; text_column.add_theme_constant_override("separation",18); scroll.add_child(text_column)
	panel_text(text_column,str(page.get("text","")),20)
	for citation in page.get("citations",[]): panel_text(text_column,"From your source\n“"+str(citation.get("quote",""))+"”",17)
	var controls := HBoxContainer.new(); column.add_child(controls)
	add_button("Previous idea",func(): lesson_page -= 1; show_lesson(),controls).disabled = lesson_page == 0
	panel_text(controls,"%d of %d" % [lesson_page+1,pages.size()],16)
	add_button("Next idea",func(): lesson_page += 1; show_lesson(),controls).disabled = lesson_page == pages.size()-1
	lesson_dialog.popup_centered(Vector2i(760,650))
	fit_dialog_body(lesson_dialog,column)

func show_settings() -> void:
	if loading_pack or loading_mission: return
	if not activity.is_empty() and not save_current(): return
	if is_instance_valid(settings_dialog): settings_dialog.queue_free()
	settings_dialog = AcceptDialog.new(); settings_dialog.title = "Paused · progress saved"; settings_dialog.wrap_controls = false; settings_dialog.min_size = Vector2i(620,480); settings_dialog.ok_button_text = "Return to the world"; add_child(settings_dialog)
	var scroll := ScrollContainer.new(); settings_dialog.add_child(scroll)
	var column := VBoxContainer.new(); column.size_flags_horizontal = Control.SIZE_EXPAND_FILL; column.add_theme_constant_override("separation",15); scroll.add_child(column)
	for kind in ["music","effects"]:
		var toggle := CheckButton.new(); toggle.text = "Music" if kind == "music" else "Action sounds"; toggle.button_pressed = presentation.music_enabled if kind == "music" else presentation.effects_enabled; toggle.toggled.connect(func(on): presentation.set_audio_enabled(kind,on)); column.add_child(toggle)
	var quiet := CheckButton.new(); quiet.text = "Reduce motion"; quiet.button_pressed = presentation.reduced_motion; quiet.toggled.connect(func(on):
		presentation.set_reduced_motion(on)
		if board is Spatial: board.reduced_motion = on
		elif board is ScenarioWorld: board.set_quiet_motion(on)); column.add_child(quiet)
	panel_text(column,"This Godot preview saves its own progress. Aster chat, shared progress, challenge rooms, and full video playback are in the full game.",16)
	panel_text(column,"AI-created lessons remain practice until reviewed. A saved completion is not a certification of the source or lesson.",16)
	add_button("Start a fresh attempt without hints",func(): settings_dialog.hide(); await restart_attempt(),column)
	add_button("Open another prepared game…",func(): settings_dialog.hide(); open_file(),column)
	settings_dialog.popup_centered(Vector2i(650,580))
	fit_dialog_body(settings_dialog,scroll)

func fit_dialog_body(dialog: AcceptDialog, body: Control) -> void:
	# Apply after the native window's first layout pass; keep its navigation above
	# the standard close button even if the platform reports a larger initial rect.
	await get_tree().process_frame
	if not is_instance_valid(dialog) or not is_instance_valid(body): return
	body.position = Vector2(18,18); body.size = Vector2(dialog.size)-Vector2(36,92)

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
	await get_tree().process_frame
	var source_tools: Control = source_selector.get_parent()
	source_tools.position = Vector2(18,18); source_tools.size = Vector2(source_dialog.size.x-36,48)
	source_text.position = Vector2(18,78); source_text.size = Vector2(source_dialog.size)-Vector2(36,150)

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
		clear_content(); var test_board = ScenarioWorld.new() if ScenarioWorld.supports(a) else Spatial.new() if Spatial.supports(a) else Board.new(); content.add_child(test_board); test_board.configure(a,initialized.response,initialized.get("view",{}),supplied)
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

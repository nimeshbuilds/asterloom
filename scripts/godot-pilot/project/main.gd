extends Node3D

const Model = preload("res://scripts/learning_model.gd")
const Audio = preload("res://audio/AsterloomAudio.gd")
const TEAL := Color("69ead2")
const GOLD := Color("ffc57b")
const INK := Color("101d2c")
var model = Model.new()
var audio: Node
var camera: Camera3D
var avatar: CharacterBody3D
var avatar_visual: Node3D
var world_dynamic: Node3D
var beam_root: Node3D
var carry_root: Node3D
var star: Node3D
var player_target := Vector3(-6,0.8,5)
var panel: VBoxContainer
var heading: Label
var status: Label
var score_label: Label
var footer: Label
var source_dialog: AcceptDialog
var source_text: RichTextLabel
var station := "learn"
var held := ""
var from_node := ""
var to_node := ""
var relation := ""
var feedback := ""
var nearest: Dictionary = {}
var pending_action: Dictionary = {}
var clock := 0.0
var save_notice := ""
var station_nodes: Dictionary = {}
var pulse: MeshInstance3D
var primary_button: Button
var panel_scroll: ScrollContainer
var check_button: Button
var qa_mode := false
var qa_failed := false
var qa_checks := 0
var qa_captures: Array = []
var camera_station := ""
var camera_tween: Tween
var hovered_label := ""
var reduced_button: CheckButton
var sound_button: Button
var controls_button: Button
var direct_mode := false

func _ready() -> void:
	qa_mode = "--qa-smoke" in OS.get_cmdline_user_args()
	var data_path := "res://data/source.json"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--mission-pack="): data_path = arg.trim_prefix("--mission-pack=")
	var input := FileAccess.open(data_path, FileAccess.READ)
	if input == null or input.get_length() > 4*1024*1024:
		push_error("Mission package is missing or exceeds the 4 MiB pilot limit."); get_tree().quit(1); return
	var data = JSON.parse_string(input.get_as_text()); input.close()
	var custom_save := OS.get_environment("ASTERLOOM_PILOT_QA_SAVE")
	if not data is Dictionary or not model.initialize(data, custom_save):
		push_error("Pilot package could not be loaded: " + model.last_error)
		get_tree().quit(1)
		return
	_build_inputs()
	_build_world()
	_build_ui()
	audio = Audio.new()
	if not custom_save.is_empty(): audio.settings_path = custom_save + ".audio.cfg"
	audio.preference_save_failed.connect(func(_code: int): save_notice = "Sound changed for this session; its preference could not be saved."; _refresh_panel())
	add_child(audio)
	audio.configure("network", "adult")
	_update_sound_label()
	station = "learn" if not model.state.taught else ("sequence" if model.pack.has("sequence") else "dependency")
	_refresh()
	if qa_mode: call_deferred("_qa_smoke")
	if "--qa-play" in OS.get_cmdline_user_args(): call_deferred("_qa_play")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--qa-screenshot="): call_deferred("_capture_once",arg.trim_prefix("--qa-screenshot="))

func _build_inputs() -> void:
	var actions := {"pilot_left":[KEY_A],"pilot_right":[KEY_D],"pilot_up":[KEY_W],"pilot_down":[KEY_S],"pilot_interact":[KEY_E],"pilot_help":[KEY_H],"pilot_cancel":[KEY_ESCAPE]}
	for action in actions:
		if not InputMap.has_action(action): InputMap.add_action(action)
		for code in actions[action]:
			var event := InputEventKey.new(); event.physical_keycode = code; InputMap.action_add_event(action,event)
	for pair in [["pilot_interact",JOY_BUTTON_A],["pilot_cancel",JOY_BUTTON_B],["pilot_help",JOY_BUTTON_Y]]:
		var event := InputEventJoypadButton.new(); event.button_index = pair[1]; InputMap.action_add_event(pair[0],event)
	for pair in [["pilot_left",JOY_AXIS_LEFT_X,-1.0],["pilot_right",JOY_AXIS_LEFT_X,1.0],["pilot_up",JOY_AXIS_LEFT_Y,-1.0],["pilot_down",JOY_AXIS_LEFT_Y,1.0]]:
		var event := InputEventJoypadMotion.new(); event.axis = pair[1]; event.axis_value = pair[2]; InputMap.action_add_event(pair[0],event)

func _material(color: Color, glow := false, alpha := 1.0) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(color,alpha)
	mat.roughness = 0.72
	mat.metallic = 0.12
	if glow: mat.emission_enabled = true; mat.emission = color; mat.emission_energy_multiplier = 0.35
	if alpha < 1: mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return mat

func _box(parent: Node3D, pos: Vector3, size: Vector3, color: Color, action: Dictionary = {}, glow := false) -> MeshInstance3D:
	var mesh := MeshInstance3D.new(); var shape := BoxMesh.new(); shape.size = size; mesh.mesh = shape
	mesh.position = pos; mesh.material_override = _material(color,glow); parent.add_child(mesh)
	if not action.is_empty():
		var body := StaticBody3D.new(); mesh.add_child(body); body.set_meta("action",action)
		var collision := CollisionShape3D.new(); var box := BoxShape3D.new(); box.size = size; collision.shape = box; body.add_child(collision)
	return mesh

func _cylinder(parent: Node3D,pos: Vector3,radius: float,height: float,color: Color, glow := false) -> MeshInstance3D:
	var mesh := MeshInstance3D.new(); var shape := CylinderMesh.new(); shape.top_radius = radius; shape.bottom_radius = radius; shape.height = height; shape.radial_segments = 32
	mesh.mesh = shape; mesh.position = pos; mesh.material_override = _material(color,glow); parent.add_child(mesh); return mesh

func _label3(parent: Node3D, text: String, pos: Vector3, color := Color.WHITE, size := 28) -> Label3D:
	var label := Label3D.new(); label.text = text; label.position = pos; label.font_size = size; label.pixel_size = 0.018
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED; label.no_depth_test = true; label.modulate = color; label.outline_size = 8; label.outline_modulate = INK
	parent.add_child(label); return label

func _build_world() -> void:
	var environment := WorldEnvironment.new(); var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color("071321"); env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("89a8bb"); env.ambient_light_energy = 0.45; env.tonemap_mode = Environment.TONE_MAPPER_FILMIC; environment.environment = env; add_child(environment)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-55,-35,0); sun.light_color = Color("c3e6f4"); sun.light_energy = 0.85; sun.shadow_enabled = true; add_child(sun)
	var warm := OmniLight3D.new(); warm.position = Vector3(-7,5,2); warm.light_color = GOLD; warm.light_energy = 1.6; warm.omni_range = 13; add_child(warm)
	var floor_mesh := _box(self,Vector3(0,-0.4,0),Vector3(25,0.8,18),Color("17252d"))
	var floor_material := ShaderMaterial.new(); floor_material.shader = load("res://materials/workshop_floor.gdshader"); floor_mesh.material_override = floor_material
	_box(self,Vector3(0,-0.95,0),Vector3(26,0.5,19),Color("07121e"))
	for x in [-11.4,11.4]: _box(self,Vector3(x,0.035,0),Vector3(0.035,0.025,16.5),Color("b69b72"))
	for z in [-7.7,7.7]: _box(self,Vector3(0,0.035,z),Vector3(22.8,0.025,0.035),Color("b69b72"))
	for x in [-12.0,12.0]:
		_box(self,Vector3(x,0.5,0),Vector3(0.15,1,18),Color("254359"))
		_box(self,Vector3(x,1,0),Vector3(0.2,0.1,18),TEAL,true_dict(),true)
	for x in [-10.0,-5.0,0.0,5.0,10.0]:
		_box(self,Vector3(x,2.3,-8),Vector3(0.24,4.6,0.3),Color("34506a"))
		_box(self,Vector3(x,4.5,-6.8),Vector3(0.18,0.15,2.5),TEAL,{},true)
	_box(self,Vector3(0,0.3,-8.5),Vector3(25,0.6,0.4),Color("32455c"))
	_box(self,Vector3(-8,0.4,2),Vector3(3.4,0.8,3.4),Color("243e50"),{"type":"station","id":"learn"})
	_cylinder(self,Vector3(-8,0.88,2),1.45,0.15,Color("6f5aae"),true)
	star = Node3D.new(); star.position = Vector3(-8,2.1,2); add_child(star)
	var sphere := MeshInstance3D.new(); var sphere_mesh := SphereMesh.new(); sphere_mesh.radius = 0.36; sphere_mesh.height = 0.72; sphere.mesh = sphere_mesh; sphere.material_override = _material(Color("bdadff"),true); star.add_child(sphere)
	for angle in [0.0,1.05,2.1]:
		var ring := MeshInstance3D.new(); var torus := TorusMesh.new(); torus.inner_radius = 0.52; torus.outer_radius = 0.57; ring.mesh = torus; ring.rotation = Vector3(angle,0.4,0.7); ring.material_override = _material(TEAL,true); star.add_child(ring)
	_label3(self,"ASTER",Vector3(-8,3.1,2),Color("c7b7ff"),23)
	_box(self,Vector3(-2,0.3,-2.1),Vector3(10,0.6,4.4),Color("1b3549"),{"type":"station","id":"sequence"})
	_box(self,Vector3(7,0.22,0),Vector3(6.3,0.44,9.3),Color("1a3446"),{"type":"station","id":"dependency"})
	_build_workshop_detail()
	world_dynamic = Node3D.new(); add_child(world_dynamic)
	beam_root = Node3D.new(); add_child(beam_root)
	avatar = CharacterBody3D.new(); avatar.position = player_target; add_child(avatar)
	avatar_visual = Node3D.new(); avatar.add_child(avatar_visual)
	carry_root = Node3D.new(); avatar.add_child(carry_root)
	_cylinder(avatar_visual,Vector3(0,0.16,0),0.28,0.75,GOLD)
	_cylinder(avatar_visual,Vector3(0,0.71,0),0.27,0.28,Color("edf5f4"))
	_box(avatar_visual,Vector3(0,0.72,0.22),Vector3(0.38,0.13,0.12),Color("174758"),{},true)
	_cylinder(avatar_visual,Vector3(0,-0.35,0),0.43,0.05,TEAL,true)
	camera = Camera3D.new(); camera.projection = Camera3D.PROJECTION_ORTHOGONAL; camera.size = 22; camera.position = Vector3(10,19,23); camera.look_at_from_position(camera.position,Vector3(2.8,0,0)); add_child(camera); camera.current = true
	pulse = _cylinder(self,Vector3(0,0.1,1),0.6,0.045,TEAL,true); pulse.visible = false

func true_dict() -> Dictionary: return {}

func _build_ui() -> void:
	var layer := CanvasLayer.new(); add_child(layer)
	var root := Control.new(); root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE; layer.add_child(root)
	var theme := Theme.new(); theme.default_font_size = 17
	for name in ["normal","hover","pressed","focus","disabled"]:
		var style := StyleBoxFlat.new(); style.bg_color = Color("243c50") if name == "normal" else Color("345469"); style.border_color = TEAL if name == "focus" else Color("436375"); style.set_border_width_all(2 if name == "focus" else 1); style.set_corner_radius_all(9); style.content_margin_left = 14; style.content_margin_right = 14; style.content_margin_top = 11; style.content_margin_bottom = 11; theme.set_stylebox(name,"Button",style)
	theme.set_color("font_color","Label",Color("edf4f6")); theme.set_color("font_color","Button",Color("edf4f6")); root.theme = theme
	var header := PanelContainer.new(); header.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE); header.offset_bottom = 96; root.add_child(header)
	var head_style := StyleBoxFlat.new(); head_style.bg_color = Color(0.03,0.07,0.12,1.0); head_style.content_margin_left = 24; head_style.content_margin_right = 24; head_style.content_margin_top = 14; head_style.content_margin_bottom = 14; header.add_theme_stylebox_override("panel",head_style)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation",18); header.add_child(row)
	var titles := VBoxContainer.new(); titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(titles)
	var title := Label.new(); title.text = "SIGNALWRIGHT"; title.add_theme_font_size_override("font_size",27); title.add_theme_color_override("font_color",TEAL); titles.add_child(title)
	heading = Label.new(); heading.text = model.pack.title; heading.clip_text = true; heading.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; titles.add_child(heading)
	score_label = Label.new(); row.add_child(score_label)
	sound_button = _button("Sound off",_toggle_sound); sound_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; sound_button.custom_minimum_size.x = 140; row.add_child(sound_button)
	reduced_button = CheckButton.new(); reduced_button.text = "Reduce motion"; reduced_button.button_pressed = bool(model.state.reduced_motion); reduced_button.toggled.connect(func(value: bool):
		if not model.set_motion(value): _save_error(); return
		if value:
			if camera_tween: camera_tween.kill()
			pulse.visible = false
			for effect in beam_root.get_children(): effect.queue_free()
			_refresh_world() # Replaces any still-settling module with its static saved position.
			camera_station = ""; _update_camera()
	); row.add_child(reduced_button)
	var navigation := HBoxContainer.new(); navigation.position = Vector2(24,114); navigation.size = Vector2(get_viewport().get_visible_rect().size.x-460,48); navigation.add_theme_constant_override("separation",8); root.add_child(navigation)
	for entry in [["learn","1 · Learn"],["sequence","2 · Handoff"],["dependency","3 · Connections"]]:
		if entry[0] != "learn" and not model.pack.has(entry[0]): continue
		var key: String = entry[0]; var caption: String = entry[1]
		if get_viewport().get_visible_rect().size.x < 1100: caption = {"learn":"1 Learn","sequence":"2 Build","dependency":"3 Link"}[key]
		navigation.add_child(_button(caption,func(): _set_station(key)))
	controls_button = _button("Seated controls",func(): direct_mode = not direct_mode; _refresh_panel()); navigation.add_child(controls_button)
	navigation.add_child(_button("Credits",_show_credits))
	var dock := PanelContainer.new(); dock.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE); dock.offset_left = -426; dock.offset_right = -18; dock.offset_top = 114; dock.offset_bottom = -62; root.add_child(dock)
	var dock_style := StyleBoxFlat.new(); dock_style.bg_color = Color(0.028,0.064,0.105,1.0); dock_style.border_color = Color("36596b"); dock_style.set_border_width_all(1); dock_style.set_corner_radius_all(16); dock_style.content_margin_left = 20; dock_style.content_margin_right = 20; dock_style.content_margin_top = 20; dock_style.content_margin_bottom = 18; dock.add_theme_stylebox_override("panel",dock_style)
	panel_scroll = ScrollContainer.new(); panel_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; panel_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var dock_body := VBoxContainer.new(); dock_body.add_theme_constant_override("separation",12); dock.add_child(dock_body); dock_body.add_child(panel_scroll)
	check_button = _button("Check my build",_footer_action); dock_body.add_child(check_button); check_button.visible = false
	panel = VBoxContainer.new(); panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL; panel.add_theme_constant_override("separation",14); panel_scroll.add_child(panel)
	status = Label.new(); status.position = Vector2(24,get_viewport().get_visible_rect().size.y-130); status.size = Vector2(get_viewport().get_visible_rect().size.x-476,90); status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; status.add_theme_font_size_override("font_size",18); root.add_child(status)
	footer = Label.new(); footer.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE); footer.offset_left = 24; footer.offset_right = -24; footer.offset_top = -48; footer.offset_bottom = -8; footer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; footer.add_theme_font_size_override("font_size",13); root.add_child(footer)
	source_dialog = AcceptDialog.new(); source_dialog.title = "Exact source material"; source_dialog.size = Vector2i(820,600); root.add_child(source_dialog)
	source_text = RichTextLabel.new(); source_text.bbcode_enabled = false; source_text.selection_enabled = true; source_text.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); source_text.offset_left = 18; source_text.offset_top = 18; source_text.offset_right = -18; source_text.offset_bottom = -62; source_text.add_theme_font_size_override("normal_font_size",20); source_dialog.add_child(source_text)

func _button(text: String, callback: Callable) -> Button:
	var button := Button.new(); button.text = text; button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; button.size_flags_horizontal = Control.SIZE_EXPAND_FILL; button.pressed.connect(callback); button.focus_mode = Control.FOCUS_ALL; return button

func _text(text: String, size := 18, color := Color("d8e4ed")) -> Label:
	var label := Label.new(); label.text = text; label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; label.add_theme_font_size_override("font_size",size); label.add_theme_color_override("font_color",color); panel.add_child(label); return label

func _refresh() -> void:
	var kinds: Array = available_kinds()
	score_label.text = ("Experimental practice\n%d / %d models matched" % [model.state.completions.size(),kinds.size()]) if model.is_experimental() else ("%d workshop points\n%d / %d builds saved" % [int(model.state.xp),model.state.completions.size(),kinds.size()])
	footer.text = "WASD / left stick: move  ·  E / A: interact  ·  Tab + Enter: controls  ·  H / Y: Aster  ·  Esc / B: cancel     |     NimeshBuilds · Experimental pilot"
	_refresh_world(); _refresh_panel(); _update_camera()

func _refresh_panel() -> void:
	for child in panel.get_children(): child.queue_free(); panel.remove_child(child)
	primary_button = null
	check_button.visible = model.state.taught and station != "learn"
	check_button.text = "Check my build" if model.state.guided else "Begin my own build →"
	check_button.disabled = false
	controls_button.text = ("Scene" if direct_mode else "Controls") if get_viewport().get_visible_rect().size.x<1100 else ("Scene controls" if direct_mode else "Seated controls")
	if station == "learn":
		var index: int = mini(int(model.state.lesson),model.pack.lessons.size()-1)
		var lesson: Dictionary = model.pack.lessons[index]
		_text("ASTER / FIELD BRIEFING",14,TEAL)
		_text(lesson.title,27)
		_text(lesson.body,20)
		_text("IDEA %d OF %d · grounded in your source" % [index+1,model.pack.lessons.size()],14,Color("9eb6c6"))
		panel.add_child(_button("Read the exact passage",func(): _show_lesson_source(lesson)))
		if not model.state.taught:
			primary_button = _button("Next idea  →" if index < model.pack.lessons.size()-1 else "Try a guided build  →",func():
				if not model.finish_idea(): _save_error(); return
				if model.state.taught: station = "sequence" if model.pack.has("sequence") else "dependency"
				audio.play_cue("aster"); _refresh()
			); panel.add_child(primary_button)
		else:
			var previous := _button("← Previous idea",func(): _review_idea(index-1)); previous.disabled = index == 0; panel.add_child(previous)
			var next_idea := _button("Next idea →",func(): _review_idea(index+1)); next_idea.disabled = index >= model.pack.lessons.size()-1; panel.add_child(next_idea)
			panel.add_child(_button("Revisit the first idea",func(): _review_idea(0)))
			panel.add_child(_button("Return to the workstations  →",func(): _set_station("sequence" if model.pack.has("sequence") else "dependency")))
		_text("The workshop is fictional. Its diagrams represent this source’s stated design, not a running cloud service.",14,Color("9eb6c6"))
	elif not model.state.taught:
		_text("A useful build begins with a clear idea",27)
		_text("Read the prepared ideas with Aster. Then use them immediately at the workbench.",20)
		panel.add_child(_button("Meet Aster  →",func(): _set_station("learn")))
	elif not model.state.guided:
		_text("GUIDED TRY / NO SCORE",14,GOLD)
		if model.pack.has("sequence"):
			var guide: Array = _guided_order()
			_text("Build one handoff",25)
			_text("Place these two modules in the numbered bays. Choose a module below or click it in the scene.",17,Color("a4bccb"))
			_sequence_controls(true)
			var ready: bool = model.state.order[0] == guide[0] and model.state.order[1] == guide[1]
			primary_button = check_button
			primary_button.disabled = not ready
		else:
			var edge: Dictionary = model.pack.dependency.edges[0]
			_text("Build one directed relationship",27)
			_text("Connect %s — %s → %s. Direction and label both matter." % [model.label("dependency",edge.from),edge.relation,model.label("dependency",edge.to)],20)
			_dependency_controls()
			primary_button = check_button
			primary_button.disabled = edge not in model.state.edges
	else:
		# Feedback supports the next attempt; the saved result keeps its original attribution.
		var shown_supported: bool = model.state.results.get(station,{}).get("supported",model.state.supported.get(station,false))
		_text(("EXPERIMENTAL PRACTICE / " if model.is_experimental() else "QUEST / ") + ("SUPPORTED PRACTICE" if shown_supported else "YOUR OWN BUILD"),14,TEAL)
		_text(model.pack[station].title,27)
		if not feedback.is_empty():
			_text(feedback,17,TEAL if model.state.results.get(station,{}).get("correct",false) else GOLD)
		elif model.state.results.has(station):
			var previous: Dictionary = model.state.results[station]
			_text("Saved model: %d / %d · %s" % [int(previous.score),int(previous.maxScore),"Matched." if previous.correct else "Ready to revise."],17,Color("a4bccb"))
		if station in model.state.completions:
			var next_station := "dependency" if station == "sequence" else "sequence"
			if model.pack.has(next_station): panel.add_child(_button(("Review %s →" if next_station in model.state.completions else "Continue to %s →") % ("connections" if next_station == "dependency" else "the procedure"),func(): _set_station(next_station)))
		if station == "sequence":
			_text("Pick a module. Choose a bay. Reconstruct the documented order.",17,Color("a4bccb"))
			if not held.is_empty(): _text("Holding: "+model.label("sequence",held),18,GOLD)
			_sequence_controls(false)
		else:
			_dependency_controls()
		primary_button = check_button
		panel.add_child(_compact_button("How to build · full task instructions",_show_native_help))
		panel.add_child(_compact_button("Original task notes",_show_task_notes))
		panel.add_child(_compact_button("Ask Aster for a source hint",_help))
		panel.add_child(_compact_button("Inspect the source",func(): _show_source(true)))
		_text("This compares your construction with an unreviewed generated model. It does not establish correctness or award mastery, XP, or host progress." if model.is_experimental() else "Points recognize completed workshop builds. This pilot does not certify mastery. Rechecking a saved build gives no extra points.",13,Color("9eb6c6"))
	if not save_notice.is_empty(): _text(save_notice,17,GOLD)
	status.text = "" if not feedback.is_empty() else ("Every module and connection comes from the source. The workshop is fictional." if model.state.guided else "Aster is ready at the violet briefing station.")

func _sequence_controls(guided: bool) -> void:
	var ids: Array = _rack_ids()
	var guided_ids: Array = _guided_order().slice(0,2)
	_text("SOURCE MODULES · choose one",13,TEAL)
	for id in ids:
		if guided and id not in guided_ids: continue
		var key: String = id
		var prefix := ("● " if held == key else "")+_module_name(key).trim_prefix("MODULE ")+" · "
		if guided: prefix = "Bay %d · " % [guided_ids.find(key)+1]+prefix
		panel.add_child(_compact_button(prefix+model.label("sequence",key),func(): _pick_piece(key)))
	if not held.is_empty() or direct_mode:
		_text("PLACE IN A BAY",13,GOLD)
		var grid := GridContainer.new(); grid.columns = 2; grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL; panel.add_child(grid)
		var count: int = 2 if guided else model.state.order.size()
		for index in range(count):
			var slot: int = index
			var current: String = model.state.order[slot]
			var button := _compact_button("Bay %d · %s" % [slot+1,"empty" if current.is_empty() else _module_name(current).trim_prefix("MODULE ")],func(): _place(slot)); button.disabled = held.is_empty(); grid.add_child(button)

func _dependency_controls() -> void:
	_text("Choose start → relationship → target",16,Color("a4bccb"))
	var grid := GridContainer.new(); grid.columns = 2; grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL; panel.add_child(grid)
	for node in model.pack.dependency.nodes:
		var id: String = node.id
		var prefix := "● " if id in [from_node,to_node] else ""
		grid.add_child(_compact_button(prefix+_node_name(id),func(): _choose_node(id)))
	var selection := "Choose a starting concept above."
	if not from_node.is_empty(): selection = "From: "+_node_name(from_node)
	if not to_node.is_empty(): selection += "\nTo: "+_node_name(to_node)
	_text(selection,16,GOLD)
	var relations: Array = []
	for edge in model.pack.dependency.edges:
		if edge.relation not in relations: relations.append(edge.relation)
	var choices := GridContainer.new(); choices.columns = mini(2,relations.size()); choices.size_flags_horizontal = Control.SIZE_EXPAND_FILL; panel.add_child(choices)
	for label in relations:
		var value: String = label
		choices.add_child(_compact_button(("● " if relation == value else "")+value,func(): relation = value; _refresh_panel()))
	var connect := _compact_button("Connect concepts",_connect); connect.disabled = from_node.is_empty() or to_node.is_empty() or relation.is_empty(); panel.add_child(connect)
	if not from_node.is_empty() or not to_node.is_empty(): panel.add_child(_compact_button("Clear selection",func(): from_node = ""; to_node = ""; _refresh()))
	if not model.state.edges.is_empty():
		_text("YOUR CONNECTIONS · %d" % model.state.edges.size(),13,TEAL)
		for i in range(model.state.edges.size()):
			var index: int = i; var edge: Dictionary = model.state.edges[i]
			_text("%s · %s — %s → %s" % [_link_name(edge),_node_name(edge.from),edge.relation,_node_name(edge.to)],15)
			panel.add_child(_compact_button("Remove relationship "+str(index+1),func():
				if model.remove_edge(index): audio.play_cue("pickup"); _refresh()
				else: _save_error()
			))

func _refresh_world() -> void:
	for child in world_dynamic.get_children(): child.queue_free(); world_dynamic.remove_child(child)
	station_nodes.clear()
	if model.pack.has("sequence"):
		var rack_ids: Array = _rack_ids()
		for i in range(model.pack.sequence.items.size()):
			var spacing: float = 9.5/float(maxi(5,model.pack.sequence.items.size()))
			var x: float = -6.0 + float(i)*spacing
			var slot_color := Color("324859")
			if model.state.order[i] != "": slot_color = TEAL if model.state.results.get("sequence",{}).get("correct",false) else Color("557789")
			_box(world_dynamic,Vector3(x,0.73,-2.6),Vector3(minf(1.65,spacing-0.1),0.28,1.6),slot_color,{"type":"slot","slot":i})
			_label3(world_dynamic,"BAY "+str(i+1),Vector3(x,0.52,-1.4),GOLD,20)
			if model.state.order[i] != "":
				_box(world_dynamic,Vector3(x,1.14,-2.45),Vector3(minf(1.25,spacing-0.2),0.55,0.9),GOLD,{"type":"piece","id":model.state.order[i]})
				_label3(world_dynamic,_module_name(model.state.order[i]).trim_prefix("MODULE "),Vector3(x,1.7,-2.4),Color.WHITE,25)
			var id: String = rack_ids[i] if i < rack_ids.size() else model.pack.sequence.items[i].id
			if id not in model.state.order:
				_box(world_dynamic,Vector3(x,0.8,0),Vector3(minf(1.4,spacing-0.2),0.55,0.9),GOLD if held != id else TEAL,{"type":"piece","id":id},held == id)
				_label3(world_dynamic,_module_name(id).trim_prefix("MODULE "),Vector3(x,1.48,0),Color.WHITE,25)
	if model.pack.has("dependency"):
		var positions := [Vector3(5.3,0,-2.8),Vector3(8.2,0,-2.8),Vector3(6.8,0,0),Vector3(5.2,0,2.6),Vector3(8.2,0,2.6)]
		for i in range(model.pack.dependency.nodes.size()):
			var node: Dictionary = model.pack.dependency.nodes[i]
			var pos: Vector3 = positions[i] if i < positions.size() else Vector3(5+(i%2)*3,0,4+(i/2))
			station_nodes[node.id] = pos + Vector3(0,1.15,0)
			_cylinder(world_dynamic,pos+Vector3(0,0.64,0),0.76,0.7,Color("2f4a5f"))
			_box(world_dynamic,pos+Vector3(0,1.15,0),Vector3(1.1,0.4,1.1),TEAL if node.id == from_node else GOLD if node.id == to_node else Color("6895ad"),{"type":"node","id":node.id},node.id == from_node or node.id == to_node)
			var world_label := "N"+str(i+1)
			if node.label.length() <= 18: world_label += "\n"+node.label
			_label3(world_dynamic,world_label,pos+Vector3(0,1.93,0),Color.WHITE,19)
		var pairs: Dictionary = {}
		for edge in model.state.edges:
			var pair := str(edge.from)+"→"+str(edge.to)
			if not pairs.has(pair): pairs[pair] = {"from":edge.from,"to":edge.to,"labels":[]}
			pairs[pair].labels.append(edge.relation)
		var link_number := 0
		for pair in pairs.values():
			link_number += 1
			if not station_nodes.has(pair.from) or not station_nodes.has(pair.to): continue
			var a: Vector3 = station_nodes[pair.from]+Vector3(0,0.2,0)
			var b: Vector3 = station_nodes[pair.to]+Vector3(0,0.2,0)
			_draw_link(a,b,TEAL if model.state.results.get("dependency",{}).get("correct",false) else Color("7b9eb5"))
			_label3(world_dynamic,"L"+str(link_number),a.lerp(b,0.5)+Vector3(0,0.65,0),Color.WHITE,20)
	for child in carry_root.get_children(): child.queue_free(); carry_root.remove_child(child)
	if not held.is_empty():
		_box(carry_root,Vector3(0,1.25,0),Vector3(0.8,0.35,0.55),GOLD,{},true)
		_label3(carry_root,"CARRYING · "+_module_name(held),Vector3(0,2,0),GOLD,23)

func _draw_link(a: Vector3,b: Vector3,color: Color) -> void:
	if a.distance_to(b) < 0.1: return
	var middle := a.lerp(b,0.5); var wire := _box(world_dynamic,middle,Vector3(0.075,0.075,a.distance_to(b)),color,{},true); wire.look_at(b,Vector3.UP)
	var tip := _cylinder(world_dynamic,a.lerp(b,0.76),0.16,0.42,GOLD,true); tip.mesh.top_radius = 0.0; tip.quaternion = Quaternion(Vector3.UP,(b-a).normalized())

func _short_label(value: String) -> String:
	var words := value.split(" "); var result := ""; var line := ""
	for word in words:
		if line.length()+word.length()>17: result += line+"\n"; line = ""
		line += ("" if line.is_empty() else " ")+word
	return result+line

func _set_station(value: String) -> void:
	if value != "learn" and not model.pack.has(value): return
	if value == "learn" and model.state.guided:
		var next: Dictionary = model.state.duplicate(true)
		for kind in available_kinds(): next.supported[kind] = true
		if not model.commit(next): _save_error(); return
	station = value; feedback = ""; save_notice = ""; from_node = ""; to_node = ""; _refresh_panel(); _update_camera()

func _pick_piece(id: String) -> void:
	if not model.state.taught: _set_station("learn"); return
	station = "sequence"; held = id; feedback = ""; audio.play_cue("pickup"); _refresh()

func _place(slot: int) -> void:
	if slot>=0 and slot<model.state.order.size() and not held.is_empty() and model.state.order[slot] == held:
		held = ""; feedback = ""; save_notice = ""; _refresh(); return
	if held.is_empty(): feedback = "Pick up a procedure module first."; _refresh_panel(); return
	var placed_id := held
	if model.place_piece(held,slot):
		held = ""; feedback = ""; save_notice = ""; audio.play_cue("connect"); _refresh(); _emphasize_piece(placed_id)
	else: _save_error()

func _choose_node(id: String) -> void:
	if not model.state.taught: _set_station("learn"); return
	if not model.state.guided and model.pack.has("sequence"): _set_station("sequence"); return
	station = "dependency"
	if from_node.is_empty(): from_node = id
	else: to_node = id
	audio.play_cue("pickup"); _refresh()

func _connect() -> void:
	var connected_from := from_node; var connected_to := to_node
	if model.connect_nodes(from_node,to_node,relation):
		from_node = ""; to_node = ""; feedback = ""; audio.play_cue("connect"); _refresh(); _emphasize_connection(connected_from,connected_to)
	else: feedback = model.last_error if not model.last_error.is_empty() else "That connection is already in your model. Choose another link, or remove it below."; _refresh_panel()

func _check_build() -> void:
	var result: Dictionary = model.check(station)
	if not result.get("saved",false): feedback = result.get("message","Could not save this attempt."); _refresh_panel(); return
	if result.correct:
		feedback = ("MODEL MATCH SAVED · %d / %d\n%s\n%s" if model.is_experimental() else "BUILD SAVED · %d / %d\n%s\n%s") % [result.score,result.maxScore,model.pack[station].explanation,"+%d workshop points" % result.awarded if result.awarded>0 else "Experimental comparison only — no mastery or XP." if model.is_experimental() else "Already completed — no duplicate points."]
		if result.first_completion: audio.play_cue("complete" if model.state.completions.size()==available_kinds().size() else "correct"); _reward()
	else:
		feedback = "MODEL SAVED · %d / %d\n%s\nRevise the build, then try again. Feedback makes the next attempt supported practice." % [result.score,result.maxScore,"\n".join(result.details)]
		audio.play_cue("retry")
	_refresh()

func _reward() -> void:
	pulse.position = Vector3(-2,0.12,-2) if station == "sequence" else Vector3(7,0.12,0)
	pulse.visible = true; pulse.scale = Vector3.ONE
	if model.state.reduced_motion: pulse.visible = false; return
	var tween := create_tween(); tween.tween_property(pulse,"scale",Vector3(7,1,7),0.65).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT); tween.tween_callback(func(): pulse.visible = false)

func _help() -> void:
	if station == "learn" or not model.state.guided: audio.play_cue("aster"); _set_station("learn"); return
	if not model.mark_supported(station): _save_error(); return
	feedback = "ASTER · " + model.pack[station].hint
	audio.play_cue("aster"); _refresh_panel()

func _show_source(support: bool, quote := "") -> void:
	source_dialog.title = "Exact source material"
	if support and station != "learn" and not model.mark_supported(station): _save_error(); return
	var source_sections: Array[String] = []
	for source in model.pack.get("sources", [model.pack.source]): source_sections.append(source.title+"\n\n"+source.text)
	source_text.text = "\n\n────────────\n\n".join(source_sections) if quote.is_empty() else quote
	source_dialog.popup_centered(Vector2i(820,600)); _refresh_panel()

func _save_error() -> void:
	save_notice = model.last_error if not model.last_error.is_empty() else "No change was made. Try another placement."
	_refresh_panel()

func _toggle_sound() -> void:
	audio.set_muted(not audio.is_muted()); _update_sound_label()

func _update_sound_label() -> void:
	if audio: sound_button.text = "Sound off" if audio.is_muted() else "Sound on"

func _unhandled_input(event: InputEvent) -> void:
	if source_dialog.visible: return
	if event is InputEventMouseMotion:
		_update_hover(event.position)
	if event.is_action_pressed("pilot_help"): _help(); get_viewport().set_input_as_handled()
	if event.is_action_pressed("pilot_cancel"):
		held = ""; from_node = ""; to_node = ""; pending_action = {}; _refresh(); get_viewport().set_input_as_handled()
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_1: _set_station("learn")
		if event.physical_keycode == KEY_2 and model.pack.has("sequence"): _set_station("sequence")
		if event.physical_keycode == KEY_3 and model.pack.has("dependency"): _set_station("dependency")
	if event is InputEventJoypadButton and event.pressed and event.button_index in [JOY_BUTTON_LEFT_SHOULDER,JOY_BUTTON_RIGHT_SHOULDER]:
		direct_mode = true; var kinds: Array = available_kinds(); _set_station(kinds[(kinds.find(station)+1)%kinds.size()])
	if event.is_action_pressed("pilot_interact") and not nearest.is_empty(): _do_action(nearest)
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var origin := camera.project_ray_origin(event.position); var direction := camera.project_ray_normal(event.position)
		var query := PhysicsRayQueryParameters3D.create(origin,origin+direction*200)
		var hit := get_world_3d().direct_space_state.intersect_ray(query)
		if hit.has("collider") and hit.collider.has_meta("action"):
			var action: Dictionary = hit.collider.get_meta("action")
			pending_action = action; player_target = Vector3(hit.position.x,0.8,hit.position.z+1.2)
			if model.state.reduced_motion: _do_action(action); pending_action = {}
		else:
			var ground = Plane(Vector3.UP,0.8).intersects_ray(origin,direction)
			if ground != null: player_target = Vector3(clampf(ground.x,-11,11),0.8,clampf(ground.z,-7,7)); pending_action = {}

func _do_action(action: Dictionary) -> void:
	match action.get("type"):
		"station": _set_station(action.id)
		"piece": _pick_piece(action.id)
		"slot": _place(int(action.slot))
		"node": _choose_node(action.id)

func _physics_process(delta: float) -> void:
	if not is_instance_valid(avatar): return
	clock += delta
	var movement := Input.get_vector("pilot_left","pilot_right","pilot_up","pilot_down")
	var velocity := Vector3.ZERO
	if not source_dialog.visible:
		if movement.length()>0.1:
			velocity = Vector3(movement.x,0,movement.y)*6; player_target = avatar.position; pending_action = {}
		elif avatar.position.distance_to(player_target)>0.16:
			velocity = (player_target-avatar.position).normalized()*minf(6,avatar.position.distance_to(player_target)*6)
	avatar.position += velocity*delta; avatar.position.x = clampf(avatar.position.x,-11,11); avatar.position.z = clampf(avatar.position.z,-7,7); avatar.position.y = 0.8
	if velocity.length()>0.1: avatar_visual.rotation.y = lerp_angle(avatar_visual.rotation.y,atan2(velocity.x,velocity.z),minf(1,delta*12))
	if not pending_action.is_empty() and avatar.position.distance_to(player_target)<0.5:
		var action := pending_action; pending_action = {}; _do_action(action)
	avatar_visual.position.y = 0 if model.state.reduced_motion else sin(clock*12)*0.035*minf(1,velocity.length())
	if not model.state.reduced_motion: star.rotation.y += delta*0.23; star.position.y = 2.1+sin(clock*1.5)*0.08
	nearest = {}
	var nearest_distance := 2.4
	for point in [["learn",Vector3(-8,0.8,3.7)],["sequence",Vector3(-2,0.8,1.5)],["dependency",Vector3(7,0.8,4.4)]]:
		var distance: float = avatar.position.distance_to(point[1])
		if distance<nearest_distance: nearest_distance=distance; nearest={"type":"station","id":point[0]}

func _qa_require(condition: bool, message: String) -> bool:
	if qa_failed: return false
	if not condition:
		qa_failed = true
		push_error("PILOT_QA_FAILED: " + message)
		var path := OS.get_environment("ASTERLOOM_PILOT_QA_SAVE")
		if not path.is_empty():
			var failure := FileAccess.open(path+".failed.json",FileAccess.WRITE)
			if failure != null:
				failure.store_string(JSON.stringify({"status":"failed","check":message,"checks_completed":qa_checks,"captures":qa_captures}))
				failure.close()
		get_tree().quit(1)
		return false
	qa_checks += 1
	return true

func _qa_smoke() -> void:
	await get_tree().process_frame
	if not _qa_require(is_instance_valid(camera) and panel.get_child_count()>0,"scene has a camera and visible controls"): return
	if not _qa_require(model.pack.source.text.length()>0,"scene has source content"): return
	print("PILOT_SCENE_SMOKE_OK nodes=",get_tree().get_node_count()," stage=",model.state.stage," checks=",qa_checks)
	get_tree().quit(0)

func available_kinds() -> Array:
	var kinds: Array = []
	for kind in ["sequence","dependency"]:
		if model.pack.has(kind): kinds.append(kind)
	return kinds

func _rack_ids() -> Array:
	var ids: Array = []
	for item in model.pack.sequence.items: ids.append(item.id)
	ids.reverse()
	# Deterministic disorder, independent of a saved response or answer highlighting.
	if ids.size()>2: var first = ids.pop_front(); ids.insert(1,first)
	return ids

func _guided_order() -> Array:
	var remaining: Array = []
	for item in model.pack.sequence.items: remaining.append(item.id)
	var ordered: Array = []
	while not remaining.is_empty():
		var added := false
		for id in remaining.duplicate():
			var ready := true
			for rule in model.pack.sequence.constraints:
				if rule.after == id and rule.before not in ordered: ready = false
			if ready: ordered.append(id); remaining.erase(id); added = true; break
		if not added: return []
	return ordered

func _begin_quest() -> void:
	# Commit the handoff and cleared rehearsal as one transaction.
	var next: Dictionary = model.state.duplicate(true)
	next.guided = true; next.stage = "quest"
	for i in range(next.order.size()): next.order[i] = ""
	next.edges = []; next.results = {}
	if not model.commit(next): _save_error(); return
	held = ""; from_node = ""; to_node = ""; feedback = ""; audio.play_cue("aster"); _refresh()

func _show_lesson_source(lesson: Dictionary) -> void:
	var excerpts: Array[String] = []
	for citation in lesson.get("citations",[]):
		var source: Dictionary = model.find_source(citation.sourceId)
		excerpts.append(citation.quote+"\n— "+source.title+" · "+citation.get("locator",{}).get("label","exact source passage"))
	_show_source(false,"\n\n".join(excerpts) if not excerpts.is_empty() else lesson.quote+"\n— "+model.pack.source.title)

func _show_credits() -> void:
	source_dialog.title = "Signalwright · credits and notices"
	var files: Array[String] = ["res://audio/NOTICE.md", "res://GODOT-THIRD-PARTY-NOTICES.txt", "res://ASTERLOOM-LICENSE.txt"]
	var text := "Asterloom / NimeshBuilds\nGodot 4.7.2 experimental standalone prototype.\nGeometry, source fixture and interaction code created for this pilot.\n\n"
	for file in files:
		if FileAccess.file_exists(file): text += file.get_file()+"\n"+FileAccess.get_file_as_string(file)+"\n\n"
	source_text.text = text; source_dialog.popup_centered(Vector2i(820,600))

func _capture_once(path: String) -> void:
	if not _qa_require(not OS.get_environment("ASTERLOOM_PILOT_QA_SAVE").is_empty(),"capture uses an isolated save path"): return
	if not _qa_require(DisplayServer.get_name() != "headless","viewport capture has a graphics display"): return
	await get_tree().create_timer(1.0).timeout
	for _frame in range(8): await get_tree().process_frame
	if not await _qa_write_capture(path): return
	print("PILOT_VIEWPORT_CAPTURE ",JSON.stringify(qa_captures.back()))
	get_tree().quit(0)

func _module_name(id: String) -> String:
	for i in range(model.pack.sequence.items.size()):
		if model.pack.sequence.items[i].id == id: return "MODULE " + String.chr(65+i)
	return "MODULE"

func _update_hover(pointer: Vector2) -> void:
	if pointer.x > get_viewport().get_visible_rect().size.x-440: return
	var origin := camera.project_ray_origin(pointer)
	var query := PhysicsRayQueryParameters3D.create(origin,origin+camera.project_ray_normal(pointer)*200)
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if hit.has("collider") and hit.collider.has_meta("action"):
		var action: Dictionary = hit.collider.get_meta("action")
		match action.get("type"):
			"piece": status.text = _module_name(action.id)+" · "+model.label("sequence",action.id)+"\nClick to pick up. Then choose a numbered bay."
			"slot": status.text = "BAY %d · %s" % [int(action.slot)+1,"Choose a module first." if held.is_empty() else "Place “"+model.label("sequence",held)+"” here."]
			"node": status.text = _node_name(action.id)+"\nClick to choose this concept. Direction and relationship labels matter."
			"station": status.text = "Open " + ("Aster’s briefing" if action.id == "learn" else "the handoff workbench" if action.id == "sequence" else "the relationship workbench")

func _update_camera() -> void:
	if camera_station == station: return
	camera_station = station
	var position := Vector3(11,21,25); var target := Vector3(5,0,0); var span := 25.0
	if station == "sequence" and model.state.taught:
		position = Vector3(3,11,14); target = Vector3(0.9,0,-1.5); span = 14.0
	elif station == "dependency" and model.state.guided:
		position = Vector3(14,12,16); target = Vector3(9.6,0,0); span = 14.0
	if get_viewport().get_visible_rect().size.x < 1100:
		span *= 1.22
		camera.h_offset = 2.1
	else: camera.h_offset = 0.0
	var transform := Transform3D(Basis.looking_at(target-position,Vector3.UP),position)
	if camera_tween: camera_tween.kill()
	if model.state.reduced_motion:
		camera.transform = transform; camera.size = span
	else:
		camera_tween = create_tween().set_parallel(true)
		camera_tween.tween_property(camera,"transform",transform,0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
		camera_tween.tween_property(camera,"size",span,0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)

func _qa_write_capture(path: String) -> bool:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	if not _qa_require(image != null and not image.is_empty(),"viewport produces a nonempty image"): return false
	# Side effects execute unconditionally; release builds strip assert expressions.
	var error := image.save_png(path)
	if not _qa_require(error == OK,"screenshot write succeeds: "+path): return false
	var bytes := FileAccess.get_file_as_bytes(path)
	if not _qa_require(bytes.size()>8,"screenshot bytes can be read back: "+path): return false
	var decoded := Image.new()
	var decoded_error := decoded.load_png_from_buffer(bytes)
	if not _qa_require(decoded_error == OK and decoded.get_size() == image.get_size(),"saved screenshot decodes at the captured dimensions"): return false
	var hash := HashingContext.new(); hash.start(HashingContext.HASH_SHA256); hash.update(bytes)
	qa_captures.append({"path":path,"width":image.get_width(),"height":image.get_height(),"bytes":bytes.size(),"sha256":hash.finish().hex_encode()})
	return true

func _qa_capture(name: String) -> bool:
	var directory := OS.get_environment("ASTERLOOM_PILOT_QA_SCREENSHOTS")
	if directory.is_empty(): return true
	if not _qa_require(DisplayServer.get_name() != "headless","requested screenshots require a graphics display"): return false
	await get_tree().create_timer(0.7).timeout
	return await _qa_write_capture(directory.path_join(name+".png"))

func _qa_play() -> void:
	if not _qa_require(not OS.get_environment("ASTERLOOM_PILOT_QA_SAVE").is_empty(),"play uses an isolated save path"): return
	var proof_path: String = model.save_path+".proof.json"
	if not _qa_require(not FileAccess.file_exists(proof_path),"proof output is fresh; preserve prior runs in a separate directory"): return
	var initial_pack: Dictionary = model.pack.duplicate(true)
	if not _qa_require(not model.state.taught,"QA starts before the lesson"): return
	if not await _qa_capture("01-teaching"): return
	var lesson_steps := 0
	while not model.state.taught:
		if not _qa_require(lesson_steps<model.pack.lessons.size(),"lesson progression finishes within the retained lesson count"): return
		if not _qa_require(is_instance_valid(primary_button) and not primary_button.disabled,"next lesson action is available"): return
		var previous_lesson: int = model.state.lesson
		primary_button.pressed.emit()
		await get_tree().process_frame
		if not _qa_require(model.state.lesson == previous_lesson+1,"lesson action saves the next idea"): return
		lesson_steps += 1
	if not _qa_require(model.state.stage == "practice","teaching leads to guided practice"): return
	if model.pack.has("sequence"):
		var guide: Array = _guided_order()
		if not _qa_require(guide.size()>=2,"guided sequence has two valid steps"): return
		_pick_piece(guide[0]); _place(0); _pick_piece(guide[1]); _place(1)
	else:
		var edge: Dictionary = model.pack.dependency.edges[0]
		_choose_node(edge.from); relation = edge.relation; _choose_node(edge.to); _connect()
	if not _qa_require(is_instance_valid(primary_button) and not primary_button.disabled,"guided construction enables the quest"): return
	if not await _qa_capture("02-guided-build"): return
	primary_button.pressed.emit()
	if not _qa_require(model.state.guided and model.state.order.all(func(id): return id == "") and model.state.edges.is_empty(),"quest starts with a cleared rehearsal and saved preparation"): return
	if model.pack.has("sequence"):
		var ordered: Array = _guided_order()
		for i in range(ordered.size()): _pick_piece(ordered[ordered.size()-i-1]); _place(i)
		_check_build()
		if not _qa_require(model.state.results.has("sequence") and not model.state.results.sequence.correct and model.state.xp == 0,"wrong sequence saves retry without points"): return
		for i in range(ordered.size()): _pick_piece(ordered[i]); _place(i)
		if not await _qa_capture("03-sequence-constructed"): return
		_check_build()
		if not _qa_require(model.state.results.has("sequence") and model.state.results.sequence.correct and "sequence" in model.state.completions,"correct sequence saves completion"): return
		var xp: int = model.state.xp
		_check_build()
		if not _qa_require(model.state.xp == xp,"rechecking the sequence does not award points again"): return
	if model.pack.has("dependency"):
		_set_station("dependency")
		for edge in model.pack.dependency.edges:
			_choose_node(edge.from); relation = edge.relation; _choose_node(edge.to); _connect()
		if not await _qa_capture("04-connections-constructed"): return
		_check_build()
		if not _qa_require(model.state.results.has("dependency") and model.state.results.dependency.correct,"dependency construction saves the matching model"): return
	if not _qa_require(FileAccess.file_exists(model.save_path),"progress file exists before reopen"): return
	var reopened = Model.new()
	var reopen_ok: bool = reopened.initialize(model.pack,model.save_path)
	if not _qa_require(reopen_ok,"saved model initialization executes and succeeds"): return
	# JSON has one number type; Godot reparses integers as floats. Compare every
	# persisted field after the same JSON round trip, without dropping any field.
	if not _qa_require(JSON.stringify(reopened.state) == JSON.stringify(JSON.parse_string(JSON.stringify(model.state))),"reopened JSON state equals every saved progress field"): return
	if not _qa_require(JSON.stringify(reopened.pack) == JSON.stringify(initial_pack) and JSON.stringify(model.pack) == JSON.stringify(initial_pack),"source and model package remain unchanged across play and reopen"): return
	if not _qa_require(not model.is_experimental() or model.state.xp == 0,"experimental models never award XP"): return
	if not await _qa_capture("05-saved-completion"): return
	if not _qa_require(not qa_failed,"all previous QA checks passed"): return
	var proof := {"status":"passed","checks":qa_checks,"pack":model.pack.id,"source_hash":model.pack_hash(),"completions":model.state.completions,"xp":model.state.xp,"experimental":model.is_experimental(),"source_unchanged":true,"reopened_state_equal":true,"save_path":model.save_path,"viewport":str(get_viewport().get_visible_rect().size),"captures":qa_captures}
	var document := JSON.stringify(proof,"  ")
	var pending_path := proof_path+".pending"
	var output := FileAccess.open(pending_path,FileAccess.WRITE)
	if not _qa_require(output != null,"QA proof staging file opens"): return
	output.store_string(document); output.flush()
	var write_error := output.get_error(); output.close()
	if not _qa_require(write_error == OK and FileAccess.get_file_as_string(pending_path) == document,"QA proof staging bytes verify"): return
	var publish_error := DirAccess.rename_absolute(pending_path,proof_path)
	if not _qa_require(publish_error == OK,"verified QA proof publishes"): return
	print("PILOT_VISIBLE_CALLBACK_PLAY_PASS ",JSON.stringify(proof))
	get_tree().quit(0)

func _node_name(id: String) -> String:
	for i in range(model.pack.dependency.nodes.size()):
		if model.pack.dependency.nodes[i].id == id: return "N%d · %s" % [i+1,model.pack.dependency.nodes[i].label]
	return id

func _review_idea(index: int) -> void:
	if index<0 or index>=model.pack.lessons.size(): return
	var next: Dictionary = model.state.duplicate(true); next.lesson = index
	if not model.commit(next): _save_error(); return
	_refresh_panel()

func _native_instruction(kind: String) -> String:
	var objective := ""
	for mission in model.pack.get("teaching",[]):
		if mission.get("activityId") == model.pack[kind].id: objective = mission.get("objective", "") + "\n\n"
	if kind == "sequence": return objective+"Place each procedure module into a numbered bay so the source’s ordering rules hold. Pick up a module, then choose its bay. Choose Check my build when ready."
	return objective+"Reconstruct the source’s named relationships. Choose a starting node, a relationship, and a target node; then choose Connect concepts. Choose Check my build when ready."

func _show_task_notes() -> void:
	source_dialog.title = "Original task notes · preserved verbatim"
	source_text.text = "These are the original game’s task notes, including any source conditions. Its button names may refer to the original player. This workshop uses the controls described in the current task panel.\n\n"+model.pack[station].instruction
	source_dialog.popup_centered(Vector2i(820,600))

func _link_name(edge: Dictionary) -> String:
	var pairs: Array = []
	for item in model.state.edges:
		var key := str(item.from)+"→"+str(item.to)
		if key not in pairs: pairs.append(key)
	return "L"+str(pairs.find(str(edge.from)+"→"+str(edge.to))+1)

func _compact_button(text: String, callback: Callable) -> Button:
	var button := _button(text,callback)
	button.add_theme_font_size_override("font_size",16)
	for state in ["normal","hover","pressed","focus","disabled"]:
		var style := StyleBoxFlat.new(); style.bg_color = Color("1a3041") if state == "normal" else Color("2c4859")
		style.border_color = TEAL if state == "focus" else Color("365565"); style.set_border_width_all(2 if state == "focus" else 1); style.set_corner_radius_all(7)
		style.content_margin_left = 10; style.content_margin_right = 10; style.content_margin_top = 7; style.content_margin_bottom = 7
		button.add_theme_stylebox_override(state,style)
	return button

func _footer_action() -> void:
	if model.state.guided: _check_build()
	else: _begin_quest()

func _show_native_help() -> void:
	source_dialog.title = "How to build in this workshop"
	source_text.text = _native_instruction(station)+"\n\nUse the labeled controls or interact with the matching objects in the scene. The two routes perform the same actions. Use Original task notes to read the preserved instructions and conditions from the original game."
	source_dialog.popup_centered(Vector2i(820,600))

func _build_workshop_detail() -> void:
	# Authored environmental detail is decorative; it never represents source facts.
	var copper := Color("b89565"); var dark := Color("13252d"); var steel := Color("405760")
	for x in [-9.0,-4.5,0.0,4.5,9.0]:
		_box(self,Vector3(x,1.8,-8.05),Vector3(4.2,2.8,0.16),Color("253b43"))
		_box(self,Vector3(x,0.38,-7.8),Vector3(4.2,0.7,0.5),dark)
		for vent in range(7): _box(self,Vector3(x-1.65+vent*0.55,0.38,-7.48),Vector3(0.28,0.4,0.04),steel)
		_box(self,Vector3(x,3.32,-7.82),Vector3(3.8,0.04,0.06),Color("759c9b"),{},true)
	for x in [-6.7,2.7]:
		for z in [-3.9,-0.3]: _box(self,Vector3(x,-0.15,z),Vector3(0.28,1.0,0.28),copper)
	_box(self,Vector3(-2,0.67,-4.14),Vector3(10.15,0.16,0.14),copper)
	_box(self,Vector3(-2,0.67,0.05),Vector3(10.15,0.16,0.14),copper)
	for x in [-6.6,2.6]: _box(self,Vector3(x,0.65,-2.08),Vector3(0.12,0.15,4.2),copper)
	for x in [3.75,10.25]: _box(self,Vector3(x,0.5,0),Vector3(0.1,0.2,9.45),Color("557c80"))
	for z in [-4.7,4.7]: _box(self,Vector3(7,0.5,z),Vector3(6.5,0.2,0.1),Color("557c80"))
	for z in [5.7,6.2,6.7]:
		for x in range(-5,4): _box(self,Vector3(x,0.04,z),Vector3(0.35,0.035,0.07),Color("7f795f"))
	for i in range(3):
		var x := -10.3+float(i)*1.25
		_box(self,Vector3(x,0.72,-3.3),Vector3(1.12,1.45,1.25),dark)
		for drawer in range(3):
			_box(self,Vector3(x,0.35+drawer*0.36,-2.63),Vector3(0.98,0.27,0.05),steel)
			_box(self,Vector3(x,0.35+drawer*0.36,-2.57),Vector3(0.32,0.035,0.04),copper)
	# Floor wayfinding follows the workshop layout, not an assessed dependency.
	for x in range(-8,9): _box(self,Vector3(x,0.045,4.85),Vector3(0.55,0.025,0.045),Color("456d70"))

# Brief feedback follows the actual committed construction; it is not a simulation.
func _emphasize_piece(id: String) -> void:
	if model.state.reduced_motion: return
	for mesh in world_dynamic.get_children():
		for body in mesh.get_children():
			if body.has_meta("action"):
				var action: Dictionary = body.get_meta("action")
				if action.get("type") == "piece" and action.get("id") == id:
					mesh.scale = Vector3(0.9,0.82,0.9)
					var tween := mesh.create_tween()
					tween.tween_property(mesh,"scale",Vector3.ONE,0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func _emphasize_connection(from_id: String,to_id: String) -> void:
	if model.state.reduced_motion or not station_nodes.has(from_id) or not station_nodes.has(to_id): return
	var marker := _cylinder(beam_root,station_nodes[from_id]+Vector3(0,0.3,0),0.12,0.15,GOLD,true)
	var tween := marker.create_tween()
	tween.tween_property(marker,"position",station_nodes[to_id]+Vector3(0,0.3,0),0.32).set_trans(Tween.TRANS_SINE)
	tween.tween_callback(marker.queue_free)

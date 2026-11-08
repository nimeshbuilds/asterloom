extends VBoxContainer
## A playable operations field for authored, stateful cases. The shared engine
## owns legality, consequences and scoring; this presenter only sees its replay.
signal changed(response: Dictionary)
signal narration_active(active: bool)
signal action_requested(action: Dictionary)
signal inspected(item_id: String)
const INK := Color("eaf5f1")
const GOLD := Color("efc981")
const TEAL := Color("86cdbd")
const MUTED := Color("9bb6bc")
var activity: Dictionary = {}
var response: Dictionary = {}
var view: Dictionary = {}
var sources: Array = []
var family := "scenario"
var render_error := ""
var reduced_motion := false
var world: Texture2D
var world_ready := false
var state_tweens: Array[Tween] = []
var stage: Control
var backdrop: TextureRect
var inspector: VBoxContainer
var evidence_panel: VBoxContainer
var evidence_dialog: AcceptDialog
var state_row: HBoxContainer
var page_controls: HBoxContainer
var evidence_heading: Label
var stations: Array[Button] = []
var selected_id := ""
var selected_observation := ""
var page := 0
var travel := 0.0
var feedback: Dictionary = {}
var pending := false
var station_material := Color("487d8c")
var accent := TEAL
var metal := Color("294a5a")
var architecture := "console"
var action_pulse := 0.0
var show_action_details := true
const PAGE_SIZE := 9

static func supports(a: Dictionary) -> bool:
	# Specialized dialogue, prediction and campaign protocols keep their own
	# controls until their commitments have an equally complete world presenter.
	return a.get("kind") == "scenario" and a.get("scenarioPresentation",{}).is_empty()

class Field extends Control:
	var host: Control
	func _draw() -> void:
		if host: host.draw_field(self)
	func _gui_input(event: InputEvent) -> void:
		if not host or self != host.stage: return
		if event is InputEventMouseMotion: mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if not host.station_at(event.position).is_empty() else Control.CURSOR_ARROW
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			var id: String = host.station_at(event.position)
			if not id.is_empty(): host.select_station(id); accept_event()

func configure(a: Dictionary, r: Dictionary, v: Dictionary, supplied: Array, _media: Dictionary = {}) -> void:
	activity = a; response = r.duplicate(true); view = v; sources = supplied
	selected_id = str(response.get("selectedActionId",""))
	var prior: Array = snapshot().get("history",[])
	if selected_id.is_empty() and not prior.is_empty(): selected_id = str(prior.back().actionId)
	show_action_details = prior.is_empty()
	if selected_id.is_empty():
		for choice in view.get("availableActions",[]):
			if choice.get("available",false): selected_id = str(choice.action.id); break
	if selected_id.is_empty():
		var history: Array = snapshot().get("history",[])
		selected_id = str(history.back().actionId) if not history.is_empty() else str(activity.get("actions",[{}])[0].get("id",""))
	for index in activity.get("actions",[]).size():
		if str(activity.actions[index].id) == selected_id: page = index / PAGE_SIZE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL; size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation",10)
	if view.get("snapshot",{}).is_empty():
		# Render-only tooling may omit the shared-engine view. No invented state or
		# action availability is substituted. Actual play always supplies a replay.
		text_line("Open this case through the learning engine to inspect its live state.",self,16)
		return
	build()

func snapshot() -> Dictionary: return view.get("snapshot",{})

func text_line(value: String, parent: Node, font_size := 16, color := INK) -> Label:
	var label := Label.new(); label.text = value; label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; label.add_theme_font_size_override("font_size",font_size); label.add_theme_color_override("font_color",color); label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; parent.add_child(label); return label

func panel_style(color := Color("102a36")) -> StyleBoxFlat:
	var style := StyleBoxFlat.new(); style.bg_color = color; style.set_corner_radius_all(14); style.set_content_margin_all(14); style.border_color = Color("365361"); style.set_border_width_all(1); return style

func button(value: String, callback: Callable, parent: Node, disabled := false) -> Button:
	var control := Button.new(); control.text = value; control.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; control.custom_minimum_size = Vector2(140,44); control.size_flags_horizontal = Control.SIZE_EXPAND_FILL; control.disabled = disabled; control.add_theme_font_size_override("font_size",15); control.pressed.connect(callback); parent.add_child(control); return control

func clear(parent: Node) -> void:
	for child in parent.get_children(): parent.remove_child(child); child.queue_free()

func build() -> void:
	var state: Dictionary = snapshot()
	var objective := PanelContainer.new(); objective.add_theme_stylebox_override("panel",panel_style(Color("16343c"))); add_child(objective)
	var goal := VBoxContainer.new(); objective.add_child(goal)
	text_line("YOUR OBJECTIVE",goal,12,GOLD)
	var objectives := PackedStringArray()
	for entry in activity.get("objectives",[]): objectives.append(str(entry.label))
	text_line("\n".join(objectives),goal,17)
	state_row = HBoxContainer.new(); state_row.add_theme_constant_override("separation",8); add_child(state_row); render_state()
	var play := HBoxContainer.new(); play.add_theme_constant_override("separation",10); play.size_flags_vertical = Control.SIZE_EXPAND_FILL; add_child(play)
	var field_column := VBoxContainer.new(); field_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL; field_column.size_flags_vertical = Control.SIZE_EXPAND_FILL; play.add_child(field_column)
	stage = Field.new(); stage.host = self; stage.custom_minimum_size = Vector2(330,330); stage.size_flags_horizontal = Control.SIZE_EXPAND_FILL; stage.size_flags_vertical = Control.SIZE_EXPAND_FILL; stage.clip_contents = true; field_column.add_child(stage)
	backdrop = TextureRect.new(); backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); backdrop.texture = world; backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; backdrop.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED; backdrop.modulate = Color(0.53,0.64,0.68,0.45); backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE; stage.add_child(backdrop)
	var lines := Field.new(); lines.host = self; lines.name = "WorldLines"; lines.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); lines.mouse_filter = Control.MOUSE_FILTER_IGNORE; stage.add_child(lines)
	page_controls = HBoxContainer.new(); page_controls.alignment = BoxContainer.ALIGNMENT_CENTER; field_column.add_child(page_controls)
	text_line("Inspect a station, take an action and observe what changes.",field_column,13,MUTED)
	var panel := PanelContainer.new(); panel.custom_minimum_size.x = 270; panel.size_flags_horizontal = Control.SIZE_FILL; panel.add_theme_stylebox_override("panel",panel_style()); play.add_child(panel)
	var scroll := ScrollContainer.new(); scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; panel.add_child(scroll)
	inspector = VBoxContainer.new(); inspector.size_flags_horizontal = Control.SIZE_EXPAND_FILL; inspector.add_theme_constant_override("separation",10); scroll.add_child(inspector)
	stage.resized.connect(layout_stations); render_stations(); render_inspector()
	var evidence_header := HBoxContainer.new(); field_column.add_child(evidence_header)
	evidence_heading = text_line(evidence_heading_text(),evidence_header,13,TEAL)
	button("Read discoveries",show_discoveries,evidence_header)
	evidence_dialog = AcceptDialog.new(); evidence_dialog.title = "Your field notes"; evidence_dialog.ok_button_text = "Back to the world"; evidence_dialog.wrap_controls = false; evidence_dialog.min_size = Vector2i(640,440); add_child(evidence_dialog)
	evidence_panel = VBoxContainer.new(); evidence_dialog.add_child(evidence_panel); render_evidence()

func state_value(value: Variant) -> String:
	if value is bool: return "Yes" if value else "Not yet"
	if (value is int or value is float) and float(value) == floor(float(value)): return str(int(value))
	return str(value)

func render_state() -> void:
	for tween in state_tweens:
		if tween.is_valid(): tween.kill()
	state_tweens.clear()
	clear(state_row)
	var state: Dictionary = snapshot()
	var values := [{"label":str(activity.budget.label)+" left","value":state_value(state.get("remaining",0)),"fraction":float(state.get("remaining",0))/maxf(1,float(activity.budget.limit))}]
	for variable in activity.variables:
		if variable.visibility != "visible": continue
		var value = state.get("state",{}).get(variable.id,variable.initial)
		var entry := {"label":str(variable.label),"value":state_value(value)}
		if variable.type == "number": entry.fraction = (float(value)-float(variable.min))/maxf(1,float(variable.max)-float(variable.min))
		values.append(entry)
	# A horizontally scrollable status ribbon keeps every source-defined value
	# available without shrinking it into unreadable gauges.
	var scroll := ScrollContainer.new(); scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scroll.custom_minimum_size.y = 82; state_row.add_child(scroll)
	var ribbon := HBoxContainer.new(); ribbon.add_theme_constant_override("separation",8); ribbon.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scroll.add_child(ribbon)
	for value in values:
		var panel := PanelContainer.new(); panel.custom_minimum_size.x = 155; panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL; panel.add_theme_stylebox_override("panel",panel_style(Color("112d36"))); ribbon.add_child(panel)
		var copy := VBoxContainer.new(); panel.add_child(copy); text_line(value.label,copy,12,MUTED); text_line(value.value,copy,19,INK)
		var recent: Array = state.get("history",[])
		if world_ready and not reduced_motion and not recent.is_empty():
			var changed_value: bool = value.label == str(activity.budget.label)+" left" and float(recent.back().get("cost",0)) > 0
			for change in recent.back().get("changes",[]):
				for variable in activity.variables:
					if variable.id == change.field and variable.visibility == "visible" and value.label == variable.label: changed_value = true
			if changed_value:
				panel.modulate = Color("ffe0a1"); var tween := panel.create_tween(); tween.tween_property(panel,"modulate",Color.WHITE,1.1); state_tweens.append(tween)
		if value.has("fraction"):
			var gauge := ProgressBar.new(); gauge.max_value = 1; gauge.value = clampf(value.fraction,0,1); gauge.show_percentage = false; gauge.custom_minimum_size.y = 4; copy.add_child(gauge)

func availability(id: String) -> Dictionary:
	for choice in view.get("availableActions",[]):
		if str(choice.action.id) == id: return choice
	return {}

func evidence_heading_text() -> String:
	return "FIELD NOTES · %d discovered · %d in your conclusion" % [snapshot().get("observationIds",[]).size(),response.get("selectedEvidenceIds",[]).size()]

func render_stations() -> void:
	if is_instance_valid(page_controls):
		clear(page_controls)
		var pages := ceili(float(activity.actions.size())/PAGE_SIZE)
		if pages > 1:
			button("← Stations",func(): page = maxi(0,page-1); render_stations(),page_controls,page == 0)
			button("More stations →",func(): page = mini(pages-1,page+1); render_stations(),page_controls,page >= pages-1)
	for station in stations: stage.remove_child(station); station.queue_free()
	stations.clear()
	for index in range(page*PAGE_SIZE,mini(activity.actions.size(),page*PAGE_SIZE+PAGE_SIZE)):
		var action: Dictionary = activity.actions[index]; var available := availability(str(action.id))
		var station := Button.new(); station.text = str(action.label); station.tooltip_text = str(action.label); station.set_meta("action_id",str(action.id)); station.set_meta("action_index",index); station.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; station.add_theme_font_size_override("font_size",14)
		var base := StyleBoxFlat.new(); base.bg_color = Color(0.04,0.09,0.13,0.93); base.border_color = GOLD if str(action.id) == selected_id else Color("436576"); base.set_border_width_all(2 if str(action.id) == selected_id else 1); base.set_corner_radius_all(8); base.set_content_margin_all(7)
		station.add_theme_stylebox_override("normal",base); var focus := base.duplicate(); focus.border_color = GOLD; focus.set_border_width_all(3); station.add_theme_stylebox_override("focus",focus); station.add_theme_stylebox_override("hover",focus); station.add_theme_color_override("font_color",INK if available.get("available",false) else MUTED)
		station.pressed.connect(func(): select_station(str(action.id))); stage.add_child(station); stations.append(station)
	layout_stations(); stage.queue_redraw()

func select_station(id: String) -> void:
	if availability(id).is_empty(): return
	selected_id = id; selected_observation = ""; show_action_details = true; render_inspector(); render_stations(); inspected.emit(id)
	for station in stations:
		if station.get_meta("action_id") == id: station.grab_focus()

func render_inspector() -> void:
	clear(inspector)
	var choice := availability(selected_id)
	if choice.is_empty(): text_line("Choose a station to inspect its action.",inspector,18); return
	var action: Dictionary = choice.action; var history: Array = snapshot().get("history",[])
	text_line("ACTION STATION",inspector,12,GOLD); text_line(str(action.label),inspector,23)
	if not history.is_empty() and not show_action_details:
		render_consequence(history.back())
		button("Inspect this station",func(): show_action_details = true; render_inspector(),inspector)
	else:
		text_line(str(action.description),inspector,16)
		text_line("Cost: %d %s" % [int(action.cost),str(activity.budget.label)],inspector,14,TEAL)
		if not str(choice.get("reason","")).is_empty(): text_line(str(choice.reason),inspector,14,GOLD)
	var take := button("Take this action →",func(): request_action(selected_id),inspector,pending or not choice.get("available",false)); take.custom_minimum_size.y = 52; take.name = "TakeAction"
	if snapshot().phase in ["failed","exhausted"]: text_line("This route has ended. Pause & settings lets you start a fresh attempt and try another plan.",inspector,15,GOLD)
	elif snapshot().phase == "success": text_line("Objective reached. Read your discoveries and choose evidence for your conclusion, then finish the mission.",inspector,15,TEAL)
	if not history.is_empty():
		if show_action_details: render_consequence(history.back())
		text_line("YOUR DECISION ROUTE",inspector,12,MUTED)
		for entry in history.slice(maxi(0,history.size()-4)):
			var label := str(entry.actionId)
			for authored in activity.actions:
				if authored.id == entry.actionId: label = str(authored.label)
			text_line(str(int(entry.step))+"  "+label,inspector,13,TEAL if entry.actionId == selected_id else MUTED)

func render_consequence(entry: Dictionary) -> void:
	text_line("WHAT CHANGED",inspector,12,TEAL)
	text_line(str(entry.consequence),inspector,17)
	for change in entry.get("changes",[]):
		for variable in activity.variables:
			if variable.id == change.field and variable.visibility == "visible": text_line(str(variable.label)+": "+state_value(change.before)+" → "+state_value(change.after),inspector,13,GOLD)

func request_action(id: String) -> void:
	if pending or not availability(id).get("available",false): return
	pending = true; render_inspector(); action_requested.emit({"type":"advance","actionId":id})

func action_failed() -> void:
	pending = false
	if is_instance_valid(inspector): render_inspector()

func show_discoveries() -> void:
	if pending: return
	evidence_dialog.popup_centered(Vector2i(700,500)); inspected.emit("field-notes")

func render_evidence() -> void:
	clear(evidence_panel)
	var scroll := ScrollContainer.new(); scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; evidence_panel.add_child(scroll)
	var list := VBoxContainer.new(); list.size_flags_horizontal = Control.SIZE_EXPAND_FILL; list.add_theme_constant_override("separation",8); scroll.add_child(list)
	for observation in activity.observations:
		if observation.id not in snapshot().get("observationIds",[]): continue
		var entry := PanelContainer.new(); entry.add_theme_stylebox_override("panel",panel_style()); list.add_child(entry)
		var copy := VBoxContainer.new(); copy.add_theme_constant_override("separation",7); entry.add_child(copy)
		text_line(str(observation.label),copy,17,TEAL); text_line(str(observation.text),copy,16)
		var quote_button := button("Read source evidence",func(): show_source_evidence(observation),copy)
		quote_button.custom_minimum_size.y = 36
		var choice := CheckButton.new(); choice.text = "Use in my conclusion"; choice.button_pressed = observation.id in response.get("selectedEvidenceIds",[]); choice.custom_minimum_size.y = 44; choice.toggled.connect(func(on): toggle_evidence(str(observation.id),on)); copy.add_child(choice)
	if snapshot().get("observationIds",[]).is_empty(): text_line("Explore a station to discover your first observation.",list,16,MUTED)

func toggle_evidence(id: String, on: bool) -> void:
	if id not in snapshot().get("observationIds",[]) or pending: return
	var ids: Array = response.get("selectedEvidenceIds",[])
	ids.erase(id)
	if on: ids.append(id)
	response.selectedEvidenceIds = ids; feedback = {}; evidence_heading.text = evidence_heading_text(); changed.emit(response.duplicate(true))

func show_source_evidence(observation: Dictionary) -> void:
	if is_instance_valid(evidence_dialog): evidence_dialog.hide()
	clear(inspector); text_line("SOURCE EVIDENCE",inspector,12,GOLD); text_line(str(observation.label),inspector,21)
	for index in observation.get("evidenceRefs",[]):
		if int(index) < 0 or int(index) >= activity.get("sourceRefs",[]).size(): continue
		var ref: Dictionary = activity.sourceRefs[int(index)]
		text_line(str(ref.get("evidence","")),inspector,16)
		var title := "Source"
		for source in sources:
			if source.id == ref.get("sourceId"): title = str(source.get("title","Source"))
		text_line(title+" · "+str(ref.get("locator","")),inspector,12,MUTED)
	button("Back to station",render_inspector,inspector); inspected.emit(str(observation.id))

func set_world(texture: Texture2D, quiet: bool, palette: Dictionary = {}, layout := "console") -> void:
	world = texture; reduced_motion = quiet; world_ready = true; architecture = layout
	accent = Color(palette.get("accent","#86cdbd")); station_material = Color(palette.get("secondary","#487d8c")).lerp(accent,0.35); metal = Color(palette.get("ground","#294a5a"))
	if is_instance_valid(backdrop): backdrop.texture = texture
	if is_instance_valid(state_row): render_state()

func set_quiet_motion(quiet: bool) -> void:
	reduced_motion = quiet
	if is_instance_valid(state_row): render_state()

func play_consequence() -> void:
	action_pulse = 2.8 if not reduced_motion else 0.0

func show_feedback(value: Dictionary) -> void:
	feedback = value.duplicate(true)
	if is_instance_valid(stage): stage.queue_redraw()

func layout_stations() -> void:
	if not is_instance_valid(stage): return
	var columns := 4 if stations.size() > 6 else 3 if stations.size() > 4 else 2 if stations.size() > 1 else 1
	var rows := maxi(1,ceili(float(stations.size())/columns)); var cell := Vector2(stage.size.x/columns,(stage.size.y-24)/rows)
	for index in stations.size():
		var station := stations[index]; station.position = Vector2(index%columns*cell.x+12,floori(float(index)/columns)*cell.y+cell.y*0.62+8); station.size = Vector2(cell.x-24,maxf(48,cell.y*0.33))
	stage.queue_redraw()

func _process(delta: float) -> void:
	if reduced_motion or not is_instance_valid(stage): return
	travel = fmod(travel+delta*0.22,1.0); action_pulse = maxf(0,action_pulse-delta); stage.get_node("WorldLines").queue_redraw()

func station_point(id: String) -> Vector2:
	for station in stations:
		if station.get_meta("action_id") == id: return station.position+Vector2(station.size.x*0.5,-28)
	return Vector2(-1,-1)

func station_at(point: Vector2) -> String:
	for station in stations:
		var id: String = station.get_meta("action_id"); var center := station_point(id)
		var scale := minf(1.2,station.size.x/142.0)
		if Rect2(center+Vector2(-57,-82)*scale,Vector2(114,122)*scale).has_point(point): return id
	return ""

func draw_field(canvas: Control) -> void:
	if not is_instance_valid(stage) or canvas == stage: return
	var area := Rect2(Vector2.ZERO,stage.size)
	canvas.draw_rect(area,Color(0.02,0.05,0.08,0.30))
	# This circuit is explicitly a replay of player decisions, not a subject map.
	var history: Array = snapshot().get("history",[])
	for index in range(1,history.size()):
		var start := station_point(str(history[index-1].actionId)); var finish := station_point(str(history[index].actionId))
		if start.x < 0 or finish.x < 0 or start == finish: continue
		var elbow := Vector2(finish.x,start.y); canvas.draw_polyline(PackedVector2Array([start,elbow,finish]),Color(TEAL,0.24),8,true); canvas.draw_polyline(PackedVector2Array([start,elbow,finish]),TEAL,2,true)
		if not reduced_motion and index == history.size()-1: canvas.draw_circle(start.lerp(elbow,travel*2) if travel < 0.5 else elbow.lerp(finish,(travel-0.5)*2),4,GOLD)
	for station in stations:
		var id: String = station.get_meta("action_id"); var point := station_point(id); var choice := availability(id); var selected := id == selected_id
		var count := 0
		for entry in history:
			if entry.actionId == id: count += 1
		var available: bool = choice.get("available",false)
		var color := GOLD if selected else accent if available or count > 0 else accent.darkened(0.5)
		var scale := minf(1.2,station.size.x/142.0)
		draw_station(canvas,point,scale,color,selected,available,count,int(station.get_meta("action_index")))
		if action_pulse > 0 and not history.is_empty() and str(history.back().actionId) == id:
			var spread := (2.8-action_pulse)/2.8
			for ring in 3:
				var radius := 26+fmod(spread+ring*0.26,1.0)*46
				canvas.draw_arc(point+Vector2(0,7),radius,0,TAU,48,Color(accent,action_pulse/2.8*(1-(radius-26)/46)*0.65),2,true)

	if feedback.get("correct") == true: canvas.draw_rect(area.grow(-3),Color(TEAL,0.9),false,4)


func polygon(canvas: Control, points: Array, color: Color, origin: Vector2, scale: float) -> void:
	var converted := PackedVector2Array()
	for point in points: converted.append(origin+point*scale)
	canvas.draw_colored_polygon(converted,color)

func draw_station(canvas: Control, at: Vector2, scale: float, light: Color, selected: bool, available: bool, uses: int, index: int) -> void:
	# Authored set dressing only: machine style follows the scaffold world. Lamps
	# reflect actual availability/selection and pips reflect executed action count.
	var shadow := PackedVector2Array()
	for step in 24: shadow.append(at+Vector2(cos(step*TAU/24)*57,sin(step*TAU/24)*16+19)*scale)
	canvas.draw_colored_polygon(shadow,Color(0,0,0,0.44))
	var top := metal.lightened(0.18); var face := metal.darkened(0.18)
	if selected:
		polygon(canvas,[Vector2(-55,-66),Vector2(55,-66),Vector2(36,16),Vector2(-36,16)],Color(light,0.055),at,scale)
		for halo in 4: canvas.draw_arc(at+Vector2(0,8)*scale,(52+halo*2)*scale,0,TAU,64,Color(light,0.065-halo*0.012),2,true)
	polygon(canvas,[Vector2(-53,8),Vector2(0,28),Vector2(53,8),Vector2(0,-12)],top,at,scale)
	polygon(canvas,[Vector2(-53,8),Vector2(0,28),Vector2(0,39),Vector2(-53,19)],face,at,scale)
	polygon(canvas,[Vector2(0,28),Vector2(53,8),Vector2(53,19),Vector2(0,39)],metal.darkened(0.38),at,scale)
	canvas.draw_polyline(PackedVector2Array([at+Vector2(-53,8)*scale,at+Vector2(0,28)*scale,at+Vector2(53,8)*scale]),Color(light,0.65),2,true)
	# Three dimensional cabinet, distinct upper fixtures for each authored world.
	polygon(canvas,[Vector2(-31,-21),Vector2(16,-34),Vector2(38,-22),Vector2(-10,-8)],station_material.lightened(0.10),at,scale)
	polygon(canvas,[Vector2(-31,-21),Vector2(-10,-8),Vector2(-10,18),Vector2(-31,6)],station_material.darkened(0.25),at,scale)
	polygon(canvas,[Vector2(-10,-8),Vector2(38,-22),Vector2(38,5),Vector2(-10,18)],station_material.darkened(0.08),at,scale)
	for vent in 4: canvas.draw_line(at+Vector2(0,-2+vent*4)*scale,at+Vector2(24,-9+vent*4)*scale,Color(0.025,0.07,0.09,0.7),2,true)
	if architecture == "trail" or architecture == "stage":
		polygon(canvas,[Vector2(-5,-26),Vector2(6,-29),Vector2(6,-62),Vector2(-5,-59)],metal.lightened(0.18),at,scale)
		polygon(canvas,[Vector2(-22,-49),Vector2(-5,-78),Vector2(19,-61),Vector2(4,-34)],Color(light,0.6),at,scale)
		polygon(canvas,[Vector2(-5,-78),Vector2(19,-61),Vector2(4,-34),Vector2(-1,-57)],Color(light,0.9),at,scale)
		canvas.draw_line(at+Vector2(-5,-78)*scale,at+Vector2(-1,-57)*scale,Color.WHITE,1,true)
	elif architecture == "workbench":
		canvas.draw_circle(at+Vector2(0,-40)*scale,27*scale,metal.darkened(0.3))
		canvas.draw_arc(at+Vector2(0,-40)*scale,25*scale,0,TAU,48,station_material.lightened(0.2),7,true)
		canvas.draw_arc(at+Vector2(0,-40)*scale,17*scale,0,TAU,48,light,2,true)
		for tooth in 8:
			var angle := tooth*TAU/8
			canvas.draw_line(at+(Vector2(0,-40)+Vector2(cos(angle),sin(angle))*23)*scale,at+(Vector2(0,-40)+Vector2(cos(angle),sin(angle))*31)*scale,station_material.lightened(0.1),5,true)
		canvas.draw_circle(at+Vector2(0,-40)*scale,6*scale,Color(light,0.8))
	else:
		polygon(canvas,[Vector2(-30,-69),Vector2(22,-77),Vector2(29,-33),Vector2(-23,-25)],station_material.lightened(0.3),at,scale)
		polygon(canvas,[Vector2(22,-77),Vector2(30,-72),Vector2(36,-29),Vector2(29,-33)],station_material.darkened(0.4),at,scale)
		polygon(canvas,[Vector2(-24,-63),Vector2(17,-69),Vector2(22,-38),Vector2(-19,-32)],Color("0a202c"),at,scale)
		for line in 3:
			canvas.draw_line(at+Vector2(-17,-54+line*6)*scale,at+Vector2(12-(index+line)%3*5,-58+line*6)*scale,Color(light,0.8 if line == 0 else 0.35),2,true)
		canvas.draw_circle(at+Vector2(15,-41)*scale,2*scale,light if available else MUTED)
	# Controls and fastening details establish physical scale without invented data.
	for control in 3: canvas.draw_circle(at+Vector2(-20+control*8,-14+control*2)*scale,2.1*scale,light if control < uses else metal.lightened(0.3))
	for bolt in [Vector2(-43,9),Vector2(0,28),Vector2(43,9)]: canvas.draw_circle(at+bolt*scale,1.8*scale,station_material.lightened(0.45))

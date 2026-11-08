extends VBoxContainer
## The world is a manipulable view of the response, never a second grading engine.
signal changed(response: Dictionary)
signal narration_active(active: bool)
signal action_requested(action: Dictionary)
signal inspected(item_id: String)
var activity: Dictionary = {}
var response: Dictionary = {}
var render_error := ""
var family := ""
var selected := 0
var token_id := ""
var feedback: Dictionary = {}
var reduced_motion := false
var world: Texture2D
var stage: Control
var footer: HBoxContainer
var caption: Label
var backdrop: TextureRect
var chips: Array[Control] = []
var terminals: Array[Control] = []
var travel := 0.0
var pulse := 0.0
const INK := Color("e9f4ec")
const GOLD := Color("f2c879")
const TEAL := Color("8fd6c2")

static func supports(a: Dictionary) -> bool:
	if a.get("kind") == "classification": return a.get("categories",[]).size() <= 9
	if a.get("kind") == "sequence": return a.get("items",[]).size() <= 12
	if a.get("kind") == "completion": return a.get("tokens",[]).size() <= 9
	return false

class Piece extends Button:
	var payload: Dictionary = {}
	func _get_drag_data(_at: Vector2) -> Variant:
		if disabled: return null
		var preview := Label.new(); preview.text = text; preview.custom_minimum_size = Vector2(230,80); preview.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		preview.add_theme_color_override("font_color",Color("fff0c9")); set_drag_preview(preview)
		return payload

class Destination extends Button:
	signal received(payload: Dictionary)
	var owner_id := ""
	var payload_type := ""
	func _can_drop_data(_at: Vector2, data: Variant) -> bool:
		return not disabled and data is Dictionary and data.get("activityId") == owner_id and data.get("type") == payload_type
	func _drop_data(_at: Vector2, data: Variant) -> void:
		received.emit(data)

class Field extends Control:
	var host: Control
	func _draw() -> void:
		if host: host.draw_connections(self)

func configure(a: Dictionary, r: Dictionary, _view: Dictionary, _sources: Array, _media: Dictionary = {}) -> void:
	activity = a; response = r.duplicate(true); family = str(a.get("kind",""))
	size_flags_horizontal = Control.SIZE_EXPAND_FILL; size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation",10)
	stage = Field.new(); stage.host = self; stage.custom_minimum_size = Vector2(620,435); stage.size_flags_vertical = Control.SIZE_EXPAND_FILL; stage.clip_contents = true; add_child(stage)
	backdrop = TextureRect.new(); backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); backdrop.texture = world; backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; backdrop.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED; backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE; backdrop.modulate = Color(0.78,0.84,0.84,0.76); stage.add_child(backdrop)
	var shade := ColorRect.new(); shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); shade.color = Color(0.025,0.065,0.08,0.35); shade.mouse_filter = Control.MOUSE_FILTER_IGNORE; stage.add_child(shade)
	# Lines sit above the picture and below interactive objects.
	var lines := Field.new(); lines.host = self; lines.name = "ResponseConnections"; lines.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); lines.mouse_filter = Control.MOUSE_FILTER_IGNORE; stage.add_child(lines)
	caption = Label.new(); caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; caption.add_theme_font_size_override("font_size",16); add_child(caption)
	footer = HBoxContainer.new(); footer.add_theme_constant_override("separation",8); add_child(footer)
	stage.resized.connect(layout_objects)
	render()

func set_world(texture: Texture2D, quiet: bool) -> void:
	world = texture; reduced_motion = quiet
	if is_instance_valid(backdrop): backdrop.texture = texture

func style(active := false, outcome := "") -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = Color(0.07,0.19,0.22,0.96) if active else Color(0.035,0.085,0.11,0.87)
	s.border_color = GOLD if active else Color("53737b")
	if outcome == "correct": s.border_color = TEAL; s.bg_color = Color("19483e")
	elif outcome == "retry": s.border_color = Color("edac83")
	s.set_border_width_all(2); s.set_corner_radius_all(22); s.set_content_margin_all(12); s.shadow_color = Color(0,0,0,0.36); s.shadow_size = 8
	return s

func decorate(b: Button, active := false, outcome := "") -> void:
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; b.add_theme_font_size_override("font_size",18); b.add_theme_color_override("font_color",INK)
	b.add_theme_stylebox_override("normal",style(active,outcome)); b.add_theme_stylebox_override("hover",style(true,outcome)); b.add_theme_stylebox_override("pressed",style(true,outcome)); var focus := style(true,outcome); focus.set_border_width_all(4); b.add_theme_stylebox_override("focus",focus)

func make_button(text_value: String, callback: Callable, parent: Node = footer) -> Button:
	var b := Button.new(); b.text = text_value; b.custom_minimum_size.y = 44; b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; decorate(b); b.pressed.connect(callback); parent.add_child(b); return b

func render() -> void:
	for control in chips + terminals: stage.remove_child(control); control.queue_free()
	chips.clear(); terminals.clear()
	for child in footer.get_children(): footer.remove_child(child); child.queue_free()
	match family:
		"classification": render_routing()
		"sequence": render_sequence()
		"completion": render_completion()
		_: render_error = "This mission has no spatial controls."
	layout_objects(); stage.queue_redraw()

func item_label(items: Array, id: String) -> String:
	for item in items:
		if str(item.id) == id: return str(item.get("label",item.get("text",id)))
	return id

func item_outcome(id: String) -> String:
	for detail in feedback.get("details",[]):
		if str(detail.get("id")) == id: return "correct" if detail.get("correct") == true else "retry"
	return ""

func step_outcome(id: String) -> String:
	if feedback.is_empty(): return ""
	for index in activity.get("constraints",[]).size():
		var rule: Dictionary = activity.constraints[index]
		if id in [rule.before,rule.after] and item_outcome("dependency-"+str(index)) == "retry": return "retry"
	return "correct" if feedback.get("correct") == true else ""

func new_piece(label_text: String, id: String, type_name: String) -> Piece:
	var piece := Piece.new(); piece.text = label_text; piece.payload = {"activityId":activity.id,"type":type_name,"id":id}; decorate(piece,id == token_id,item_outcome(id)); stage.add_child(piece); chips.append(piece); return piece

func new_destination(label_text: String, type_name: String, active := false, outcome := "") -> Destination:
	var target := Destination.new(); target.text = label_text; target.owner_id = str(activity.id); target.payload_type = type_name; decorate(target,active,outcome); stage.add_child(target); terminals.append(target); return target

func render_routing() -> void:
	selected = clampi(selected,0,activity.items.size()-1)
	var item: Dictionary = activity.items[selected]; token_id = str(item.id)
	var piece := new_piece(str(item.label),str(item.id),"route")
	piece.tooltip_text = "Drag this signal to a destination, or choose a destination with the keyboard."; piece.pressed.connect(func(): inspected.emit(str(item.id)))
	for category in activity.categories:
		var chosen: bool = category.id in response.assignments[item.id]
		var target := new_destination(str(category.label),"route",chosen,item_outcome(str(item.id)) if chosen else "")
		target.toggle_mode = true; target.button_pressed = chosen; target.tooltip_text = ("Connected. Choose again to disconnect. " if chosen else "Connect this signal. ")+str(category.label)
		target.pressed.connect(func(): route(str(item.id),str(category.id)))
		target.received.connect(func(data): route(str(data.id),str(category.id)))
	caption.text = "Signal %d of %d · %d routed. Choose every destination supported by the source. Choose again to disconnect." % [selected+1,activity.items.size(),placed_count()]
	make_button("Previous signal",func(): select_item(selected-1)).disabled = selected == 0
	var pages := HBoxContainer.new(); pages.size_flags_horizontal = Control.SIZE_EXPAND_FILL; pages.alignment = BoxContainer.ALIGNMENT_CENTER; footer.add_child(pages)
	for index in activity.items.size():
		if activity.items.size() > 12: break
		var marker := make_button(str(index+1),func(): select_item(index),pages); marker.custom_minimum_size.x = 40; marker.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		decorate(marker,index == selected,item_outcome(str(activity.items[index].id))); marker.tooltip_text = item_label(activity.items,str(activity.items[index].id))
	make_button("Next signal",func(): select_item(selected+1)).disabled = selected == activity.items.size()-1

func select_item(index: int) -> void:
	selected = clampi(index,0,activity.items.size()-1); render(); inspected.emit(str(activity.items[selected].id))

func route(item_id: String, category_id: String) -> void:
	if not response.assignments.has(item_id) or not activity.categories.any(func(c): return str(c.id) == category_id): return
	var chosen: Array = response.assignments[item_id]
	if category_id in chosen: chosen.erase(category_id)
	else: chosen.append(category_id)
	emit_edit(); render()
	for index in activity.categories.size():
		if str(activity.categories[index].id) == category_id: terminals[index].grab_focus()

func render_sequence() -> void:
	for index in response.order.size():
		var id := str(response.order[index]); var target := new_destination("%02d  ·  %s" % [index+1,item_label(activity.items,id)],"step",token_id == id,step_outcome(id))
		# Each numbered relay is also a draggable piece; native forwarding handles both roles.
		target.set_drag_forwarding(func(_at):
			var preview := Label.new(); preview.text = item_label(activity.items,id); target.set_drag_preview(preview); return {"activityId":activity.id,"type":"step","id":id},func(_at,data): return data is Dictionary and data.get("activityId") == activity.id and data.get("type") == "step",func(_at,data): place_step(str(data.id),index))
		target.pressed.connect(func():
			if token_id.is_empty(): token_id = id; render()
			elif token_id == id: token_id = ""; render()
			else: place_step(token_id,index))
	caption.text = "Build the relay from 1 onward. Drag a step onto a numbered position, or select a step and then its destination."
	make_button("Move earlier",func(): nudge(-1)).disabled = token_id.is_empty() or response.order.find(token_id) <= 0
	make_button("Move later",func(): nudge(1)).disabled = token_id.is_empty() or response.order.find(token_id) == response.order.size()-1
	make_button("Clear selection",func(): token_id = ""; render()).disabled = token_id.is_empty()

func nudge(direction: int) -> void:
	var index: int = response.order.find(token_id)
	if index >= 0: place_step(token_id,clampi(index+direction,0,response.order.size()-1))

func place_step(id: String, index: int) -> void:
	if id not in response.order or index < 0 or index >= response.order.size(): return
	response.order.erase(id); response.order.insert(index,id); token_id = id; emit_edit(); render(); terminals[index].grab_focus()

func render_completion() -> void:
	selected = clampi(selected,0,activity.slots.size()-1)
	var slot: Dictionary = activity.slots[selected]
	var fitted := str(response.slotTokens.get(slot.id,""))
	var target := new_destination(str(slot.before)+"\n\n"+("[ open socket ]" if fitted.is_empty() else item_label(activity.tokens,fitted))+"\n\n"+str(slot.after),"token",not fitted.is_empty(),item_outcome(str(slot.id)))
	target.pressed.connect(func(): if not token_id.is_empty(): place_token(token_id,str(slot.id)))
	target.received.connect(func(data): place_token(str(data.id),str(slot.id)))
	for token in activity.tokens:
		var piece := new_piece(str(token.label),str(token.id),"token")
		piece.pressed.connect(func(): token_id = str(token.id); place_token(str(token.id),str(slot.id)))
	caption.text = "Repair module %d of %d. Fit a piece into the open socket; the source explains which connection belongs." % [selected+1,activity.slots.size()]
	make_button("Previous module",func(): selected -= 1; render()).disabled = selected == 0
	make_button("Clear socket",func(): response.slotTokens[str(slot.id)] = ""; emit_edit(); render())
	make_button("Next module",func(): selected += 1; render()).disabled = selected == activity.slots.size()-1

func place_token(id: String, slot_id: String) -> void:
	if not activity.tokens.any(func(t): return str(t.id) == id) or not activity.slots.any(func(s): return str(s.id) == slot_id): return
	response.slotTokens[slot_id] = id; emit_edit(); render()
	for piece in chips:
		if piece.payload.id == id: piece.grab_focus()

func emit_edit() -> void:
	feedback = {}; pulse = 1.0; changed.emit(response.duplicate(true))

func placed_count() -> int:
	var count := 0
	for ids in response.get("assignments",{}).values():
		if not ids.is_empty(): count += 1
	return count

func show_feedback(value: Dictionary) -> void:
	feedback = value.duplicate(true)
	for detail in feedback.get("details",[]):
		if detail.get("correct") != false: continue
		var items: Array = activity.get("items",[]) if family == "classification" else activity.get("slots",[]) if family == "completion" else []
		for index in items.size():
			if str(items[index].id) == str(detail.get("id")): selected = index
		break
	render()

func layout_grid(objects: Array, area: Rect2, columns: int) -> void:
	if objects.is_empty(): return
	var rows := ceili(float(objects.size())/columns); var gap := 18.0; var cell := Vector2((area.size.x-gap*(columns-1))/columns,minf(160,(area.size.y-gap*(rows-1))/rows))
	var top := (area.size.y-(cell.y*rows+gap*(rows-1)))*0.5
	for index in objects.size(): objects[index].position = area.position+Vector2(0,top)+Vector2(index%columns, floori(float(index)/columns))*(cell+Vector2(gap,gap)); objects[index].size = cell

func layout_objects() -> void:
	if not is_instance_valid(stage): return
	var w: float = stage.size.x; var h: float = stage.size.y
	if family == "classification":
		if not chips.is_empty(): chips[0].position = Vector2(28,h*0.5-105); chips[0].size = Vector2(w*0.29,210)
		layout_grid(terminals,Rect2(w*0.37,16,w*0.63-28,h-32),3 if terminals.size()>4 else 2 if terminals.size()>1 else 1)
	elif family == "sequence": layout_grid(terminals,Rect2(28,32,w-56,h-64),3 if terminals.size()>4 else 2)
	elif family == "completion":
		if not terminals.is_empty(): terminals[0].position = Vector2(28,h*0.5-130); terminals[0].size = Vector2(w*0.43-28,260)
		layout_grid(chips,Rect2(w*0.49,28,w*0.51-28,h-56),2 if chips.size()>3 else 1)
	for object in chips + terminals:
		var font: Font = object.get_theme_font("font"); var font_size := 18
		while font_size > 15 and font.get_multiline_string_size(object.text,HORIZONTAL_ALIGNMENT_CENTER,object.size.x-28,font_size).y > object.size.y-28: font_size -= 1
		object.add_theme_font_size_override("font_size",font_size)
	stage.queue_redraw()

func _process(delta: float) -> void:
	if reduced_motion: return
	travel = fmod(travel+delta*0.23,1.0); pulse = maxf(0,pulse-delta)
	if is_instance_valid(stage): stage.get_node("ResponseConnections").queue_redraw()

func draw_connections(canvas: Control) -> void:
	if not is_instance_valid(stage) or canvas == stage: return
	# Each response object stands on a small floating platform in the authored world.
	for object in terminals + chips:
		var center: Vector2 = object.position+Vector2(object.size.x*0.5,object.size.y+7)
		var half := object.size.x*0.45
		canvas.draw_colored_polygon(PackedVector2Array([center+Vector2(-half,0),center+Vector2(0,15),center+Vector2(half,0),center+Vector2(0,-15)]),Color(0.1,0.21,0.24,0.94))
		canvas.draw_line(center+Vector2(-half,0),center+Vector2(0,15),Color("668a89"),2,true)
		canvas.draw_line(center+Vector2(0,15),center+Vector2(half,0),Color("668a89"),2,true)
		canvas.draw_circle(object.position+Vector2(object.size.x*0.5,-8),7,Color("203e47")); canvas.draw_circle(object.position+Vector2(object.size.x*0.5,-8),3,GOLD)
	var paths: Array = []
	if family == "classification" and not chips.is_empty():
		for index in terminals.size():
			if activity.categories[index].id in response.assignments[activity.items[selected].id]: paths.append([chips[0].position+chips[0].size*Vector2(1,0.5),terminals[index].position+terminals[index].size*Vector2(0,0.5)])
	elif family == "sequence":
		for index in range(1,terminals.size()): paths.append([terminals[index-1].position+terminals[index-1].size*0.5,terminals[index].position+terminals[index].size*0.5])
	elif family == "completion" and not terminals.is_empty():
		var id := str(response.slotTokens.get(activity.slots[selected].id,""))
		for index in chips.size():
			if str(activity.tokens[index].id) == id: paths.append([chips[index].position+chips[index].size*Vector2(0,0.5),terminals[0].position+terminals[0].size*Vector2(1,0.5)])
	var color := TEAL if feedback.get("correct") == true else GOLD
	for path in paths:
		canvas.draw_line(path[0],path[1],Color(color,0.3),9,true); canvas.draw_line(path[0],path[1],color,2,true)
		if not reduced_motion: canvas.draw_circle(path[0].lerp(path[1],travel),5,color)
	if feedback.get("correct") == true:
		canvas.draw_rect(Rect2(Vector2(5,5),stage.size-Vector2(10,10)),Color(TEAL,0.75),false,4)
		var beacon := Vector2(stage.size.x*0.5,20)
		canvas.draw_line(beacon,beacon+Vector2(0,stage.size.y-40),Color(TEAL,0.1),26,true)
		canvas.draw_circle(beacon,13,Color("153f39")); canvas.draw_circle(beacon,7,TEAL)

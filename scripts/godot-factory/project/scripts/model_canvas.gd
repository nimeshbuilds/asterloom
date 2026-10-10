extends Control
## Native interactive model plane: positions remain bounded percentages.
signal moved(id: String, x: float, y: float)
signal selected(id: String)
var objects: Array = []
var links: Array = []
var zones: Array = []
var active := ""
var can_move := false
var dragging := false
var texture: Texture2D

func _ready() -> void:
	custom_minimum_size = Vector2(640,300)
	mouse_filter = Control.MOUSE_FILTER_STOP
	resized.connect(queue_redraw)

func configure(items: Array, edges: Array = [], regions: Array = [], movable := false) -> void:
	objects = items; links = edges; zones = regions; can_move = movable; queue_redraw()

func point(item: Dictionary) -> Vector2:
	return Vector2(float(item.get("x",50))/100*size.x,float(item.get("y",50))/100*size.y)

func _draw() -> void:
	draw_style_box(_background(),Rect2(Vector2.ZERO,size))
	if texture != null: draw_texture_rect(texture,Rect2(Vector2.ZERO,size),false)
	for zone in zones:
		var rect := Rect2(float(zone.x)*size.x/100,float(zone.y)*size.y/100,float(zone.width)*size.x/100,float(zone.height)*size.y/100)
		draw_rect(rect,Color(str(zone.get("color","#31544c")),0.25)); draw_rect(rect,Color("79aaa1"),false,2)
		draw_string(ThemeDB.fallback_font,rect.position+Vector2(8,22),str(zone.get("label","")),HORIZONTAL_ALIGNMENT_LEFT,-1,16,Color.WHITE)
	for edge in links:
		var from = _find(str(edge.get("from",""))); var to = _find(str(edge.get("to","")))
		if from.is_empty() or to.is_empty(): continue
		var a := point(from); var b := point(to)
		draw_line(a,b,Color("7ce0c0"),3,true)
		var direction := (b-a).normalized(); var arrow := b-direction*28
		draw_line(arrow,arrow-direction.rotated(0.5)*14,Color("7ce0c0"),3,true)
		draw_line(arrow,arrow-direction.rotated(-0.5)*14,Color("7ce0c0"),3,true)
	for item in objects:
		var p := point(item); var color := Color(str(item.get("color","#386d84")))
		var dims := Vector2(float(item.get("width",16))*size.x/100,float(item.get("height",18))*size.y/100)
		var shape = item.get("shape","rectangle")
		if item.get("texture") is Texture2D: draw_texture_rect(item.texture,Rect2(p-dims/2,dims),false)
		elif item.get("requires_image",false): draw_style_box(_box(Color("27333b"),item.id == active),Rect2(p-dims/2,dims))
		elif shape == "rectangle": draw_style_box(_box(color,item.id == active),Rect2(p-dims/2,dims))
		else:
			var outline := shape_outline(str(shape))
			var shape_size := Vector2.ONE * minf(dims.x,dims.y) if shape == "circle" else dims
			for index in outline.size(): outline[index] = p + outline[index] * shape_size
			draw_colored_polygon(outline,color)
		var label_text := str(item.get("label",item.id))
		draw_multiline_string(ThemeDB.fallback_font,p-dims/2+Vector2(8,22),label_text,HORIZONTAL_ALIGNMENT_LEFT,dims.x-16,16,2,Color.WHITE)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			for i in range(objects.size()-1,-1,-1):
				var item: Dictionary = objects[i]; var p := point(item)
				var dims := Vector2(float(item.get("width",16))*size.x/100,float(item.get("height",18))*size.y/100)
				if Rect2(p-dims/2,dims).has_point(event.position): active = str(item.id); dragging = can_move; selected.emit(active); queue_redraw(); accept_event(); return
		else:
			if dragging:
				var item := _find(active)
				moved.emit(active,float(item.x),float(item.y))
			dragging = false
	if event is InputEventMouseMotion and dragging:
		var item := _find(active)
		item.x = clampf(event.position.x/size.x*100,0,100); item.y = clampf(event.position.y/size.y*100,0,100); queue_redraw()

func _find(id: String) -> Dictionary:
	for item in objects:
		if str(item.id) == id: return item
	return {}

func _box(color: Color, chosen: bool) -> StyleBoxFlat:
	var box := StyleBoxFlat.new(); box.bg_color = color
	box.set_corner_radius_all(10); box.set_border_width_all(3 if chosen else 1); box.border_color = Color("f4d39b") if chosen else Color("8fb4ba")
	return box

func _background() -> StyleBoxFlat:
	return _box(Color("142734"),false)

func shape_outline(shape: String) -> PackedVector2Array:
	var points := PackedVector2Array()
	match shape:
		"circle":
			for index in 40: points.append(Vector2(cos(TAU*index/40),sin(TAU*index/40))*0.5)
		"triangle": points = PackedVector2Array([Vector2(0,-0.5),Vector2(0.5,0.5),Vector2(-0.5,0.5)])
		"star":
			for index in 10: points.append(Vector2(cos(-PI/2+TAU*index/10),sin(-PI/2+TAU*index/10))*(0.5 if index%2 == 0 else 0.22))
		"leaf":
			for index in 21:
				var amount := float(index)/20; points.append(Vector2(sin(PI*amount)*0.5,amount-0.5))
			for index in range(19,0,-1):
				var amount := float(index)/20; points.append(Vector2(-sin(PI*amount)*0.5,amount-0.5))
		"drop": points = PackedVector2Array([Vector2(0,-0.5),Vector2(0.22,-0.15),Vector2(0.45,0.16),Vector2(0.5,0.3),Vector2(0.35,0.46),Vector2(0,0.5),Vector2(-0.35,0.46),Vector2(-0.5,0.3),Vector2(-0.45,0.16),Vector2(-0.22,-0.15)])
		"cloud": points = PackedVector2Array([Vector2(-0.46,0.2),Vector2(-0.5,0.08),Vector2(-0.46,-0.1),Vector2(-0.32,-0.16),Vector2(-0.28,-0.36),Vector2(-0.12,-0.47),Vector2(0.1,-0.5),Vector2(0.28,-0.34),Vector2(0.3,-0.16),Vector2(0.42,-0.12),Vector2(0.5,0.05),Vector2(0.46,0.27),Vector2(0.32,0.4),Vector2(-0.28,0.4)])
		_: points = PackedVector2Array([Vector2(-0.5,-0.5),Vector2(0.5,-0.5),Vector2(0.5,0.5),Vector2(-0.5,0.5)])
	return points

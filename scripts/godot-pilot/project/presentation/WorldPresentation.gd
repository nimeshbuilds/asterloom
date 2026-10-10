extends Node3D
## Authored fictional scenery only. Contains no source, evaluation, persistence or audio logic.
signal phase_changed(phase: String)
signal event_presented(event: String)

const Actor = preload("res://presentation/CharacterActor.gd")
const SETTINGS := ["network","garden","archive"]
const PHASES := ["briefing","learning","building","challenge","debrief"]
const EVENTS := ["placed","connected","success","retry","mission_complete","completion"]
const MAX_EFFECTS := 6
var setting := "network"
var phase := "briefing"
var reduced_motion := false
var scenery: Node3D
var effects: Node3D
var cast: Dictionary = {}
var station_lights: Dictionary = {}
var stage_markers: Array[MeshInstance3D] = []
var ambient: CPUParticles3D
var _materials: Dictionary = {}
var _accent := Color("77d4d0")
var _secondary := Color("d8ad70")
var _structure := Color("263e4e")
var _phase_visits := 0
var _progress_completed := 0
var _progress_total := 0
var _restoration: Array[MeshInstance3D] = []

func configure(profile: Dictionary) -> void:
	setting = str(profile.get("setting","network"))
	if setting not in SETTINGS: setting = "network"
	_clear()
	var palette: Dictionary = profile.get("palette",{})
	_accent = _color(palette,"accent","#77d4d0")
	_secondary = _color(palette,"secondary","#d8ad70")
	_structure = _color(palette,"structure","#263e4e")
	scenery = Node3D.new(); scenery.name = "AuthoredScenery"; add_child(scenery)
	effects = Node3D.new(); effects.name = "TransientFeedback"; add_child(effects)
	match setting:
		"garden": _garden()
		"archive": _archive()
		_: _network()
	_build_cast(profile.get("cast",[]))
	_build_stage_markers()
	_build_ambient()
	_apply_phase()
	set_progress(_progress_completed,_progress_total)
	set_reduced_motion(reduced_motion)

func _ready() -> void:
	if scenery == null: configure({})

func _clear() -> void:
	for child in get_children(): remove_child(child); child.queue_free()
	cast.clear(); station_lights.clear(); stage_markers.clear(); _materials.clear(); _restoration.clear()
	scenery = null; effects = null; ambient = null

func _color(values: Dictionary, key: String, fallback: String) -> Color:
	return Color.from_string(str(values.get(key,fallback)),Color.from_string(fallback,Color.WHITE))

func _material(color: Color, glow := false) -> StandardMaterial3D:
	var key := color.to_html()+str(glow)
	if _materials.has(key): return _materials[key]
	var material := StandardMaterial3D.new(); material.albedo_color = color
	material.roughness = 0.78; material.metallic = 0.12 if setting == "network" else 0.02
	if glow:
		material.emission_enabled = true; material.emission = color; material.emission_energy_multiplier = 0.28
	_materials[key] = material
	return material

func _mesh(parent: Node3D, shape: Mesh, at: Vector3, color: Color, glow := false) -> MeshInstance3D:
	var instance := MeshInstance3D.new(); instance.mesh = shape; instance.position = at
	instance.material_override = _material(color,glow); parent.add_child(instance); return instance

func _box(parent: Node3D, at: Vector3, size: Vector3, color: Color, glow := false) -> MeshInstance3D:
	var shape := BoxMesh.new(); shape.size = size
	return _mesh(parent,shape,at,color,glow)

func _cylinder(parent: Node3D, at: Vector3, radius: float, height: float, color: Color) -> MeshInstance3D:
	var shape := CylinderMesh.new(); shape.top_radius = radius; shape.bottom_radius = radius; shape.height = height; shape.radial_segments = 12
	return _mesh(parent,shape,at,color)

func _line(parent: Node3D, a: Vector3, b: Vector3, width: float, color: Color, glow := false) -> MeshInstance3D:
	var line := _box(parent,a.lerp(b,0.5),Vector3(width,width,a.distance_to(b)),color,glow)
	if a.distance_to(b)>0.01:
		var direction := (b-a).normalized()
		line.basis = Basis.looking_at(direction,Vector3.FORWARD if absf(direction.dot(Vector3.UP))>0.98 else Vector3.UP)
	return line

func _ring(parent: Node3D, at: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var shape := TorusMesh.new(); shape.inner_radius = radius-0.025; shape.outer_radius = radius+0.025; shape.rings = 24; shape.ring_segments = 6
	return _mesh(parent,shape,at,color,true)

func _network() -> void:
	# Service wall and copper cable trays are scenic, not an evaluated network diagram.
	for x in [-9.8,-7.6,6.2,8.4]:
		_box(scenery,Vector3(x,1.5,-6.85),Vector3(1.75,3,1.05),_structure.darkened(0.12))
		_box(scenery,Vector3(x,1.5,-6.29),Vector3(1.45,2.65,0.07),_structure.lightened(0.12))
		for row in range(4):
			_box(scenery,Vector3(x,0.6+row*0.56,-6.22),Vector3(1.27,0.34,0.06),Color("172c38"))
			_restoration.append(_box(scenery,Vector3(x-0.41,0.61+row*0.56,-6.17),Vector3(0.5,0.075,0.035),_accent,true))
		_box(scenery,Vector3(x,3.07,-6.75),Vector3(1.83,0.14,1.12),_secondary.darkened(0.28))
	for x in [-4.4,-0.6,3.2]:
		_box(scenery,Vector3(x,2.4,-7.36),Vector3(3.3,0.8,0.12),_structure)
		_box(scenery,Vector3(x,2.44,-7.27),Vector3(2.7,0.04,0.06),_accent,true)
	_line(scenery,Vector3(-10.6,3.65,-7.1),Vector3(9.6,3.65,-7.1),0.1,_secondary)
	for x in [-10.6,9.6]: _line(scenery,Vector3(x,0.1,-7.1),Vector3(x,3.65,-7.1),0.1,_secondary)
	_box(scenery,Vector3(-10.35,0.62,-1.85),Vector3(1.2,1.24,2.2),_structure)
	for z in [-2.5,-1.8,-1.1]: _box(scenery,Vector3(-10.35,1.27,z),Vector3(0.68,0.04,0.4),_accent.darkened(0.55))

func _garden() -> void:
	# Distinct planted perimeter and rain-collection forms; no ecological claims are simulated.
	for x in [-9.5,-5.8,5.3,9.0]:
		_box(scenery,Vector3(x,0.37,-6.8),Vector3(2.9,0.74,1.8),_structure)
		_box(scenery,Vector3(x,0.78,-6.8),Vector3(2.58,0.12,1.5),Color("493e30"))
		for i in range(3): _plant(Vector3(x-0.8+0.8*i,0.86,-6.8),0.8+float(i%2)*0.35)
	# Trellis with open sight lines; sits behind the teaching and construction space.
	for x in [-9.6,8.9]: _box(scenery,Vector3(x,1.7,-7.65),Vector3(0.13,3.4,0.13),_secondary.darkened(0.15))
	for y in [1.4,2.4,3.4]: _box(scenery,Vector3(-0.35,y,-7.65),Vector3(18.7,0.09,0.09),_secondary.darkened(0.1))
	_cylinder(scenery,Vector3(-10.6,0.7,-2.8),0.72,1.4,_structure.lightened(0.2))
	_cylinder(scenery,Vector3(-10.6,1.43,-2.8),0.81,0.1,_secondary)
	_box(scenery,Vector3(-10.6,0.08,1.5),Vector3(1.08,0.12,4),_accent.darkened(0.2))
	for z in [-0.5,1.5,3.5]:
		_cylinder(scenery,Vector3(10.75,0.36,z),0.68,0.72,_structure)
		_plant(Vector3(10.75,0.76,z),1.2)

func _plant(at: Vector3, height: float) -> void:
	_cylinder(scenery,at+Vector3(0,height*0.45,0),0.047,height,Color("5a6c3e"))
	for i in range(3):
		var leaf := SphereMesh.new(); leaf.radius = 0.36; leaf.height = 0.18; leaf.radial_segments = 12; leaf.rings = 6
		var offset := Vector3(cos(i*2.1)*0.25,height*0.3+i*0.2,sin(i*2.1)*0.25)
		var node := _mesh(scenery,leaf,at+offset,_accent.darkened(0.18+float(i)*0.08))
		node.rotation = Vector3(0.3,i*2.1,0.35)
		_restoration.append(node)

func _archive() -> void:
	# Shelves, paper stacks and brass frames form an investigation room without text clutter.
	for x in [-8.7,-4.3,4.5,8.9]:
		_box(scenery,Vector3(x,1.48,-7.1),Vector3(3.5,2.96,0.25),_structure.darkened(0.25))
		for side in [-1.65,1.65]: _box(scenery,Vector3(x+side,1.48,-6.68),Vector3(0.12,3,1.05),_structure)
		for level in range(3):
			var y := 0.25+float(level)*0.88
			_box(scenery,Vector3(x,y,-6.7),Vector3(3.42,0.1,1.12),_secondary.darkened(0.3))
			for book in range(5):
				var h := 0.4+float((book+level)%3)*0.12
				var color := _accent.darkened(0.2) if book%2 == 0 else _secondary.darkened(0.25)
				_box(scenery,Vector3(x-1.28+book*0.56,y+h*0.5+0.07,-6.54),Vector3(0.33,h,0.6),color)
		_restoration.append(_box(scenery,Vector3(x,3.07,-6.7),Vector3(3.64,0.12,1.14),_secondary))
	_box(scenery,Vector3(-10.5,0.6,-1.6),Vector3(1.4,1.2,2.2),_structure)
	for i in range(3): _box(scenery,Vector3(-10.5,1.23+i*0.055,-1.6),Vector3(0.85,0.04,1.15),Color("d6c6a5"))
	var frame := _ring(scenery,Vector3(0,2.2,-7.3),0.95,_secondary); frame.rotation.x = PI/2

func _build_cast(specs: Array) -> void:
	var defaults := [{"id":"aster","name":"Aster","role":"Learning guide","color":"#b6a0e5"},{"id":"builder","name":"Owen","role":"Construction guide","color":_accent.to_html()},{"id":"analyst","name":"Claire","role":"Reflection guide","color":_secondary.to_html()}]
	var positions := {"aster":Vector3(-9.3,0,3.4),"builder":Vector3(-4.1,0,-5.5),"analyst":Vector3(3.25,0,3.6)}
	for fallback in defaults:
		var spec: Dictionary = fallback
		for candidate in specs:
			if candidate is Dictionary and candidate.get("id") == fallback.id: spec = candidate; break
		var actor = Actor.new(); actor.name = str(fallback.id); actor.position = positions[fallback.id]
		actor.rotation.y = -0.08 if fallback.id == "aster" else 0.1
		add_child(actor); actor.configure(spec); actor.set_reduced_motion(reduced_motion); cast[fallback.id] = actor
		_cylinder(scenery,actor.position+Vector3(0,-0.05,0),0.84,0.1,_structure.darkened(0.12))
		var light := OmniLight3D.new(); light.position = actor.position+Vector3(0,2.5,0)
		light.light_color = Color.from_string(str(spec.get("color","#d3b77f")),_accent)
		light.omni_range = 3.3; light.shadow_enabled = false; light.light_energy = 0.23
		add_child(light); station_lights[fallback.id] = light

func _build_stage_markers() -> void:
	for i in range(3):
		var at := Vector3(-1.4+float(i)*1.4,0.12,5.2)
		var marker := _box(scenery,at,Vector3(0.95,0.18,0.35),_structure)
		stage_markers.append(marker)

func _build_ambient() -> void:
	ambient = CPUParticles3D.new(); ambient.name = "QuietAtmosphere"
	ambient.amount = 12; ambient.lifetime = 12; ambient.preprocess = 0; ambient.randomness = 0.45
	ambient.position = Vector3(0,2.6,-5.5); ambient.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX; ambient.emission_box_extents = Vector3(9,1.1,1.0)
	ambient.direction = Vector3(0,1,0); ambient.spread = 18; ambient.initial_velocity_min = 0.025; ambient.initial_velocity_max = 0.06
	ambient.gravity = Vector3.ZERO; ambient.scale_amount_min = 0.035; ambient.scale_amount_max = 0.07
	var particle := SphereMesh.new(); particle.radius = 1; particle.height = 2; particle.radial_segments = 6; particle.rings = 3
	ambient.mesh = particle; ambient.material_override = _material(_secondary.darkened(0.12),false)
	add_child(ambient)

func set_phase(value: String) -> void:
	if value not in PHASES or value == phase: return
	phase = value; _phase_visits += 1
	for actor in cast.values(): actor.set_speaking(false)
	_apply_phase(); phase_changed.emit(value)

func _apply_phase() -> void:
	var active := "aster" if phase in ["briefing","learning"] else "builder" if phase == "building" else "analyst"
	for id in station_lights: station_lights[id].light_energy = 0.58 if id == active else 0.18
	for id in cast:
		if not cast[id].speaking: cast[id].set_pose("attention" if id == active else "idle")
	var count := 1 if phase in ["briefing","learning"] else 2 if phase == "building" else 3
	for i in range(stage_markers.size()):
		stage_markers[i].material_override = _material(_accent if i<count else _structure,i<count)

func set_character_speaking(id: String, value: bool) -> void:
	if not cast.has(id): return
	cast[id].set_speaking(value)
	if not value: _apply_phase()

func set_reduced_motion(value: bool) -> void:
	reduced_motion = value
	for actor in cast.values(): actor.set_reduced_motion(value)
	if ambient:
		ambient.emitting = not value; ambient.visible = not value
	if value and effects:
		for child in effects.get_children(): effects.remove_child(child); child.queue_free()

func react(event: String, at: Vector3 = Vector3.ZERO) -> void:
	if event not in EVENTS or not at.is_finite() or effects == null: return
	if event in ["mission_complete","completion"]:
		for actor in cast.values(): actor.react(event)
	else:
		var nearest = null
		var distance := INF
		for actor in cast.values():
			if actor.position.distance_squared_to(at)<distance:
				distance = actor.position.distance_squared_to(at); nearest = actor
		if nearest: nearest.react(event)
	# The caller supplies a committed event. Restoring a result must never call react.
	if not reduced_motion:
		while effects.get_child_count()>=MAX_EFFECTS:
			var oldest := effects.get_child(0); effects.remove_child(oldest); oldest.queue_free()
		var group := Node3D.new(); group.position = at+Vector3(0,0.14,0); effects.add_child(group)
		var color := _secondary if event == "retry" else _accent
		var ring := _ring(group,Vector3.ZERO,0.45,color)
		if event in ["success","mission_complete","completion"]:
			for i in range(3):
				var shape_size := Vector3(0.24,0.05,0.13) if setting == "garden" else Vector3(0.15,0.28,0.035) if setting == "archive" else Vector3(0.06,0.28,0.06)
				var shard := _box(group,Vector3(cos(i*TAU/3)*0.5,0.24,sin(i*TAU/3)*0.5),shape_size,_secondary,true)
				shard.rotation.z = 0.25
		elif event == "connected":
			_ring(group,Vector3(0,0.16,0),0.24,_secondary)
		var duration := 0.42 if event in ["placed","connected"] else 0.75
		var tween := group.create_tween().set_parallel(true)
		tween.tween_property(ring,"scale",Vector3(1.6,1,1.6),duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_property(group,"position",group.position+Vector3(0,0.18,0),duration)
		tween.chain().tween_callback(group.queue_free)
	event_presented.emit(event)

func character_position(id: String) -> Vector3:
	return cast[id].position if cast.has(id) else Vector3.ZERO

func snapshot() -> Dictionary:
	var actors: Array = []
	for actor in cast.values(): actors.append(actor.snapshot())
	return {"setting":setting,"phase":phase,"reducedMotion":reduced_motion,"cast":actors,"effects":effects.get_child_count() if effects else 0,"phaseChanges":_phase_visits,"sceneryMeshes":scenery.get_child_count() if scenery else 0,"ambientParticles":ambient.amount if ambient else 0,"completed":_progress_completed,"total":_progress_total,"restorationFeatures":_restoration.size()}

func set_progress(completed: int, total: int) -> void:
	# Restore environmental milestones directly. This intentionally has no tween,
	# cue, actor reaction or event signal, including during load/reconfiguration.
	_progress_total = maxi(0,total)
	_progress_completed = clampi(completed,0,_progress_total)
	var ratio := float(_progress_completed)/float(_progress_total) if _progress_total>0 else 0.0
	for i in range(_restoration.size()):
		var feature := _restoration[i]
		var restored := float(i+1)/float(_restoration.size()) <= ratio
		feature.material_override = _material(_accent if restored else _accent.darkened(0.55),restored and setting != "garden")
		if setting == "garden": feature.scale = Vector3.ONE*(1.0 if restored else 0.68)

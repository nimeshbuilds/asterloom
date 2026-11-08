extends Node3D
## A stylized native scene guide. This is an articulated geometry character,
## not a photorealistic human rig or a source of teaching/assessment decisions.
signal pose_changed(pose: String)

const POSES := ["idle", "attention", "speaking", "celebrate", "support"]
var character_id := "aster"
var display_name := "Aster"
var guide_role := "Learning guide"
var current_pose := "idle"
var reduced_motion := false
var speaking := false
var accent := Color("8ed7da")
var body: Node3D
var head: Node3D
var left_arm: Node3D
var right_arm: Node3D
var halo: MeshInstance3D
var _pose_tween: Tween
var _clock := 0.0
var _materials: Dictionary = {}

func configure(spec: Dictionary) -> void:
	character_id = str(spec.get("id", "aster"))
	display_name = str(spec.get("name", "Aster")).left(64)
	guide_role = str(spec.get("role", "Learning guide")).left(120)
	accent = Color.from_string(str(spec.get("color", "#8ed7da")), Color("8ed7da"))
	if _pose_tween: _pose_tween.kill()
	for child in get_children(): remove_child(child); child.queue_free()
	_materials.clear()
	_build()
	_apply_pose(true)

func _ready() -> void:
	if body == null: configure({})

func _mat(color: Color, emissive := false) -> StandardMaterial3D:
	var key := color.to_html()+str(emissive)
	if _materials.has(key): return _materials[key]
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.82
	if emissive:
		material.emission_enabled = true; material.emission = color; material.emission_energy_multiplier = 0.18
	_materials[key] = material
	return material

func _mesh(parent: Node3D, shape: Mesh, at: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new(); node.mesh = shape; node.position = at; node.material_override = _mat(color)
	parent.add_child(node); return node

func _box(parent: Node3D, at: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var shape := BoxMesh.new(); shape.size = size
	return _mesh(parent,shape,at,color)

func _sphere(parent: Node3D, at: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var shape := SphereMesh.new(); shape.radius = radius; shape.height = radius*2; shape.radial_segments = 16; shape.rings = 8
	return _mesh(parent,shape,at,color)

func _cylinder(parent: Node3D, at: Vector3, radius: float, height: float, color: Color) -> MeshInstance3D:
	var shape := CylinderMesh.new(); shape.top_radius = radius; shape.bottom_radius = radius; shape.height = height; shape.radial_segments = 12
	return _mesh(parent,shape,at,color)

func _build() -> void:
	body = Node3D.new(); add_child(body)
	var dark := Color("20313c")
	var skin := Color("b98969") if character_id == "aster" else Color("e7bd9e") if character_id == "builder" else Color("efd0ac")
	var hair := Color("322735") if character_id == "aster" else Color("76503a") if character_id == "builder" else Color("ad8a52")
	# Broad silhouettes, boots and simple facial landmarks remain readable at game scale.
	for x in [-0.16,0.16]:
		_cylinder(body,Vector3(x,0.38,0),0.115,0.65,dark)
		_box(body,Vector3(x,0.1,0.08),Vector3(0.24,0.2,0.37),Color("14232c"))
	var coat := CylinderMesh.new(); coat.top_radius = 0.27; coat.bottom_radius = 0.35; coat.height = 0.81; coat.radial_segments = 12
	_mesh(body,coat,Vector3(0,0.94,0),accent.darkened(0.2))
	_box(body,Vector3(0,1.17,0.24),Vector3(0.06,0.51,0.04),Color("e2dbc2"))
	_box(body,Vector3(0.17,1.09,0.25),Vector3(0.11,0.14,0.05),accent.lightened(0.4))
	head = Node3D.new(); head.position.y = 1.59; body.add_child(head)
	_sphere(head,Vector3.ZERO,0.255,skin)
	_sphere(head,Vector3(0,0.11,-0.045),0.255,hair)
	# Face lies toward +Z, with an unambiguous gentle expression rather than blinking FX.
	for x in [-0.085,0.085]:
		_sphere(head,Vector3(x,0.018,0.23),0.028,Color("18262c"))
	_box(head,Vector3(0,-0.096,0.236),Vector3(0.095,0.016,0.022),Color("673d3f"))
	if character_id == "aster":
		_sphere(head,Vector3(-0.2,-0.12,-0.055),0.14,hair)
		_sphere(head,Vector3(0.21,-0.11,-0.07),0.15,hair)
		var pin := _box(head,Vector3(-0.2,0.17,0.11),Vector3(0.09,0.09,0.025),Color("e9c683")); pin.rotation.z = 0.7
	elif character_id == "builder":
		_cylinder(head,Vector3(0,0.19,0),0.3,0.1,accent.lightened(0.2))
		_sphere(head,Vector3(0,0.21,0),0.23,accent)
		_box(body,Vector3(0,0.7,0.29),Vector3(0.47,0.18,0.07),Color("8b6644"))
	else:
		for x in [-0.086,0.086]: _box(head,Vector3(x,0.02,0.258),Vector3(0.135,0.095,0.019),Color("314b57"))
		_box(head,Vector3(0,0.027,0.268),Vector3(0.05,0.016,0.02),Color("cdb790"))
	left_arm = _arm(-1.0,skin); right_arm = _arm(1.0,skin)
	if character_id == "analyst":
		var tablet := _box(left_arm,Vector3(0,-0.43,0.18),Vector3(0.28,0.35,0.055),Color("394f59")); tablet.rotation.x = -0.35
		_box(tablet,Vector3(0,0,0.032),Vector3(0.22,0.28,0.012),accent.darkened(0.45))
	var ring := TorusMesh.new(); ring.inner_radius = 0.5; ring.outer_radius = 0.535; ring.rings = 20; ring.ring_segments = 6
	halo = _mesh(self,ring,Vector3(0,0.025,0),accent)
	halo.material_override = _mat(accent,true)
	var hit_area := StaticBody3D.new(); hit_area.name = "GuideInteraction"
	hit_area.set_meta("action",{"type":"character","id":character_id})
	var shape := CapsuleShape3D.new(); shape.radius = 0.43; shape.height = 1.95
	var collision := CollisionShape3D.new(); collision.shape = shape; collision.position.y = 0.98
	hit_area.add_child(collision); add_child(hit_area)

func _arm(side: float, skin: Color) -> Node3D:
	var pivot := Node3D.new(); pivot.position = Vector3(side*0.3,1.27,0); body.add_child(pivot)
	_cylinder(pivot,Vector3(0,-0.22,0),0.1,0.46,accent.darkened(0.15))
	_sphere(pivot,Vector3(0,-0.49,0),0.104,skin)
	return pivot

func set_pose(value: String) -> void:
	if value not in POSES: value = "idle"
	if current_pose == value: return
	current_pose = value
	_apply_pose(reduced_motion)
	pose_changed.emit(value)

func set_speaking(value: bool) -> void:
	if speaking == value: return
	speaking = value
	set_pose("speaking" if value else "idle")

func set_reduced_motion(value: bool) -> void:
	if reduced_motion == value: return
	reduced_motion = value
	_apply_pose(true)

func react(event: String) -> void:
	match event:
		"success", "mission_complete", "completion": set_pose("celebrate")
		"retry": set_pose("support")
		"placed", "connected": set_pose("attention")
		_: return

func _pose_targets() -> Array:
	match current_pose:
		"attention": return [Vector3(-0.06,0,0),Vector3(-0.23,0,-0.2),Vector3(-0.53,0,0.3)]
		"speaking": return [Vector3(-0.04,0.04,0),Vector3(-0.23,0,-0.23),Vector3(-0.8,0,0.36)]
		"celebrate": return [Vector3(-0.08,0,0),Vector3(-0.25,0,-1.85),Vector3(-0.25,0,1.85)]
		"support": return [Vector3(0.06,0,-0.1),Vector3(-0.62,0,-0.13),Vector3(-0.83,0,0.2)]
		_: return [Vector3.ZERO,Vector3(0,0,-0.08),Vector3(0,0,0.08)]

func _apply_pose(immediate: bool) -> void:
	if body == null: return
	if _pose_tween: _pose_tween.kill()
	body.position = Vector3.ZERO
	var targets := _pose_targets()
	if immediate or not is_inside_tree():
		head.rotation = targets[0]; left_arm.rotation = targets[1]; right_arm.rotation = targets[2]
	else:
		_pose_tween = create_tween().set_parallel(true)
		_pose_tween.tween_property(head,"rotation",targets[0],0.25)
		_pose_tween.tween_property(left_arm,"rotation",targets[1],0.25)
		_pose_tween.tween_property(right_arm,"rotation",targets[2],0.25)
	halo.visible = current_pose != "idle"

func _process(delta: float) -> void:
	if reduced_motion or body == null: return
	_clock += minf(delta,0.1)
	body.position.y = sin(_clock*1.6)*0.014
	if speaking and (not _pose_tween or not _pose_tween.is_running()):
		right_arm.rotation.x = -0.8+sin(_clock*2.3)*0.035

func snapshot() -> Dictionary:
	return {"id":character_id,"name":display_name,"role":guide_role,"pose":current_pose,"speaking":speaking,"reducedMotion":reduced_motion}

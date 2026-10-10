extends SceneTree
## Developer viewport-only showcase. No main scene, learning state or user saves.
const World = preload("res://presentation/WorldPresentation.gd")
const Catalog = preload("res://scripts/template_catalog.gd")
var destination := ""

func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--capture-dir="): destination = argument.trim_prefix("--capture-dir=")
	call_deferred("run")

func fail(message: String) -> void:
	push_error(message); quit(1)

func run() -> void:
	if destination.is_empty() or not destination.is_absolute_path() or DisplayServer.get_name()=="headless": fail("An absolute existing capture folder and graphics display are required."); return
	root.size = Vector2i(1200,800)
	var stage := Node3D.new(); root.add_child(stage)
	var environment := WorldEnvironment.new(); var sky := Environment.new()
	sky.background_mode = Environment.BG_COLOR; sky.background_color = Color("0d1c27")
	sky.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; sky.ambient_light_color = Color("bed4dc"); sky.ambient_light_energy = 0.5
	environment.environment = sky; stage.add_child(environment)
	var key := DirectionalLight3D.new(); key.rotation_degrees = Vector3(-48,-25,0); key.light_energy=1.0; stage.add_child(key)
	var floor_node := MeshInstance3D.new(); var floor_shape := BoxMesh.new(); floor_shape.size = Vector3(25,0.3,18); floor_node.mesh = floor_shape; floor_node.position.y = -0.2
	var floor_material := StandardMaterial3D.new(); floor_material.albedo_color=Color("21353c"); floor_node.material_override=floor_material; stage.add_child(floor_node)
	var camera := Camera3D.new(); camera.projection=Camera3D.PROJECTION_ORTHOGONAL; camera.size=25
	camera.position=Vector3(8,17,23); stage.add_child(camera); camera.look_at(Vector3(0,0,-1)); camera.current=true
	var world = World.new(); stage.add_child(world)
	var catalog: Dictionary = Catalog.validate_catalog(JSON.parse_string(FileAccess.get_file_as_string("res://data/templates.json")))
	if not catalog.ok: fail("Invalid authored presentation catalog"); return
	for profile in catalog.profiles.values():
		var setting: String = profile.setting
		world.configure(profile)
		floor_material.albedo_color = Color.from_string(profile.palette.floor,Color("21353c"))
		sky.background_color = Color.from_string(profile.palette.background,Color("0d1c27"))
		sky.ambient_light_energy = profile.lighting.ambientEnergy
		key.light_color = Color.from_string(profile.lighting.keyColor,Color.WHITE)
		key.light_energy = profile.lighting.keyEnergy
		world.set_reduced_motion(true); world.set_phase("building"); world.set_progress(1,2)
		for _frame in range(6): await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		var path := destination.path_join(setting+".png")
		if image.is_empty() or image.save_png(path)!=OK: fail("Could not save viewport "+path); return
		var decoded := Image.load_from_file(path)
		if decoded==null or decoded.get_size()!=image.get_size(): fail("Viewport readback failed"); return
		print("PRESENTATION_VIEWPORT ",JSON.stringify({"setting":setting,"path":path,"width":image.get_width(),"height":image.get_height(),"sha256":FileAccess.get_sha256(path),"snapshot":world.snapshot()}))
	stage.queue_free(); await process_frame
	quit(0)

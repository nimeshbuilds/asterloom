extends SceneTree
## Geometry checks run headless. --render-output=PATH additionally checks native pixels.
const Canvas = preload("res://scripts/model_canvas.gd")
const Board = preload("res://scripts/activity_board.gd")
const SHAPES = ["circle","rectangle","triangle","leaf","drop","cloud","star"]
var checks := 0
var failures: Array[String] = []

func expect(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)

func _initialize() -> void: call_deferred("run")

func run() -> void:
	var canvas = Canvas.new()
	var silhouettes := {}
	for shape in SHAPES:
		var outline: PackedVector2Array = canvas.shape_outline(shape)
		expect(outline.size() >= 3,shape+" has a closed drawable silhouette")
		expect(not Geometry2D.triangulate_polygon(outline).is_empty(),shape+" forms a valid fill polygon")
		var bounded := true
		for point in outline:
			if absf(point.x) > 0.501 or absf(point.y) > 0.501: bounded = false
		expect(bounded,shape+" stays within its authored extent")
		var identity := var_to_str(outline)
		expect(not silhouettes.has(identity),shape+" is visually distinct from earlier shapes")
		silhouettes[identity] = true
		expect(Geometry2D.is_point_in_polygon(Vector2.ZERO,outline),shape+" has a filled center")
		if shape != "rectangle": expect(not Geometry2D.is_point_in_polygon(Vector2(0.48,-0.48),outline),shape+" does not silently become a rectangle")
	var star: PackedVector2Array = canvas.shape_outline("star")
	expect(star.size() == 10,"Star preserves five outer points and five valleys")
	expect(not Geometry2D.is_point_in_polygon(Vector2(0.30,0.35),star),"Star valley stays open")
	canvas.free()
	check_picture_asset_binding()
	var output := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--render-output="): output = arg.trim_prefix("--render-output=")
	if not output.is_empty(): await check_render(output)
	print("NATIVE_SHAPE_CONTRACT "+JSON.stringify({"checks":checks,"failures":failures,"pixelOutput":output}))
	quit(0 if failures.is_empty() else 1)

func check_render(output: String) -> void:
	var pixels := {}; var atlas := Image.create(10*200,200,false,Image.FORMAT_RGBA8)
	var names: Array = SHAPES.duplicate(); names.append_array(["supplied-image","unavailable-image","circle-wide-box"])
	for index in names.size():
		var viewport := SubViewport.new(); viewport.size = Vector2i(200,200); viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		root.add_child(viewport)
		var canvas = Canvas.new(); viewport.add_child(canvas); canvas.custom_minimum_size = Vector2.ZERO; canvas.size = Vector2(200,200)
		var item := {"id":"part","label":"","shape":names[index],"color":"#51bd82","x":50,"y":50,"width":70,"height":70}
		if index in [7,8]: item.requires_image = true
		if index == 7: item.texture = ImageTexture.create_from_image(supplied_image())
		if index == 9: item.shape = "circle"; item.height = 40
		canvas.configure([item])
		await process_frame; await RenderingServer.frame_post_draw
		var rendered: Image = viewport.get_texture().get_image()
		expect(rendered != null and not rendered.is_empty(),names[index]+" produces actual native pixels")
		if rendered != null and not rendered.is_empty():
			var digest := rendered.get_data().hex_encode().sha256_text()
			expect(not pixels.has(digest),names[index]+" rendered image is distinct")
			pixels[digest] = true
			if index == 7:
				expect(rendered.get_pixel(100,70).r > 0.95 and rendered.get_pixel(100,70).b < 0.05,"Supplied image preserves its red upper region")
				expect(rendered.get_pixel(100,130).b > 0.95 and rendered.get_pixel(100,130).r < 0.05,"Supplied image preserves its blue lower region")
			if index == 8: expect(rendered.get_pixel(100,100).g < 0.3,"Unavailable source image is not replaced by the authored green shape")
			if index == 9: expect(rendered.get_pixel(45,100).g < 0.3 and rendered.get_pixel(100,100).g > 0.6,"Circle remains round inside an authored non-square box")
			atlas.blit_rect(rendered,Rect2i(0,0,200,200),Vector2i(index*200,0))
		viewport.queue_free(); await process_frame
	expect(atlas.save_png(output) == OK,"Native shape contact sheet is saved")

func supplied_image() -> Image:
	var picture := Image.create(4,4,false,Image.FORMAT_RGBA8); picture.fill(Color.RED)
	picture.fill_rect(Rect2i(0,2,4,2),Color.BLUE)
	return picture

func check_picture_asset_binding() -> void:
	# Renderer-only fixture: checks the part's actual source bytes, without claiming model validation.
	var a := {"kind":"picture-build","rules":[],"zones":[],"parts":[{"id":"asset","label":"Supplied part","imageSourceId":"supplied","shape":"star","color":"#51bd82","width":30,"height":30,"maxInstances":1}],"tell":{"prompt":"Describe the picture.","caregiverChecks":[],"narrationSourceIds":[]}}
	var response := {"parts":[{"id":"placed","partId":"asset","x":50,"y":50}],"tell":{"method":"spoken","caregiverName":"","checks":{},"reviewed":false}}
	var source := {"id":"supplied","title":"Supplied picture","kind":"image","dataUrl":"data:image/png;base64,"+Marshalls.raw_to_base64(supplied_image().save_png_to_buffer())}
	var board = Board.new(); root.add_child(board); board.configure(a,response,{},[source])
	var canvas: Control
	for child in board.get_children():
		if child.get_script() == Canvas: canvas = child
	expect(canvas != null,"Picture board creates its actual canvas")
	if canvas != null:
		var item: Dictionary = canvas.objects[0]
		expect(item.get("requires_image",false) and item.get("texture") is Texture2D,"Picture part carries its exact supplied texture into the canvas")
		if item.get("texture") is Texture2D:
			var decoded: Image = item.texture.get_image()
			expect(decoded.get_pixel(0,0) == Color.RED and decoded.get_pixel(3,3) == Color.BLUE,"Decoded picture source preserves supplied pixels")
	board.configure(a,response,{},[])
	expect(not board.render_error.is_empty(),"Missing picture source produces an explicit unavailable error")
	for child in board.get_children():
		if child.get_script() == Canvas:
			expect(child.objects[0].get("requires_image",false) and child.objects[0].get("texture") == null and str(child.objects[0].label).contains("unavailable"),"Missing picture source stays visibly unavailable instead of becoming a shape")
	board.queue_free()

extends Node
## Local, deterministic assessment. No network or shell execution.
var node_path := ""
var engine_path := ""
var last_error := ""
var call_count := 0
var busy := false
var scratch_directory := ""

func configure() -> void:
	var base := OS.get_executable_path().get_base_dir()
	node_path = OS.get_environment("ASTERLOOM_FACTORY_NODE")
	engine_path = OS.get_environment("ASTERLOOM_FACTORY_ENGINE")
	if node_path.is_empty(): node_path = base.path_join("runtime/node")
	if engine_path.is_empty(): engine_path = base.path_join("runtime/assessment.mjs")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--node="): node_path = arg.trim_prefix("--node=")
		if arg.begins_with("--engine="): engine_path = arg.trim_prefix("--engine=")
		if arg.begins_with("--save-dir="): scratch_directory = arg.trim_prefix("--save-dir=")

func request(payload: Dictionary) -> Dictionary:
	while busy: await get_tree().process_frame
	busy = true
	call_count += 1
	var worker := Thread.new()
	worker.start(_execute.bind(payload.duplicate(true),call_count))
	while worker.is_alive(): await get_tree().process_frame
	var result: Dictionary = worker.wait_to_finish()
	busy = false
	return result

func _execute(payload: Dictionary, request_id: int) -> Dictionary:
	var directory := scratch_directory if not scratch_directory.is_empty() else ProjectSettings.globalize_path("user://bridge")
	DirAccess.make_dir_recursive_absolute(directory)
	var stem := "factory-bridge-" + str(OS.get_process_id()) + "-" + str(request_id)
	var input_path := directory.path_join(stem + "-request.json")
	var output_path := directory.path_join(stem + "-response.json")
	var input := FileAccess.open(input_path, FileAccess.WRITE)
	if input == null: return _failure("Could not write a local assessment request.")
	payload["version"] = 1
	input.store_string(JSON.stringify(payload)); input.close()
	var process_output: Array = []
	var code := OS.execute(node_path, PackedStringArray([engine_path,"--request",input_path,"--response",output_path]), process_output, true)
	DirAccess.remove_absolute(input_path)
	if not FileAccess.file_exists(output_path): return _failure("The bundled assessment engine could not start (" + str(code) + ").")
	var data = JSON.parse_string(FileAccess.get_file_as_string(output_path))
	DirAccess.remove_absolute(output_path)
	if not data is Dictionary: return _failure("The local assessment response was unreadable.")
	if not data.get("ok",false): last_error = str(data.get("error","The assessment engine rejected this request."))
	return data

func _failure(message: String) -> Dictionary:
	last_error = message
	return {"ok":false,"error":message}

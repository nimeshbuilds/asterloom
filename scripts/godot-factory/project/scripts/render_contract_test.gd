extends SceneTree
## Native rendering only. This does not replace the shared-engine integration run.
const Board = preload("res://scripts/activity_board.gd")
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--manifest="): path = arg.trim_prefix("--manifest=")
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	var host := ScrollContainer.new(); host.size = Vector2(1080,760); root.add_child(host)
	for entry in data.cases:
		for variant in ["correctResponse","wrongResponse"]:
			var board = Board.new(); board.custom_minimum_size.x = 1000; host.add_child(board)
			board.configure(entry.activity,entry[variant],{},entry.sources)
			await process_frame
			print("RENDER_CONTRACT "+str(entry.scaffoldId)+" "+variant+" "+board.render_error)
			host.remove_child(board); board.queue_free()
	quit()

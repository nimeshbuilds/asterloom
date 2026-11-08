extends RefCounted
## Responses and assistance are local to the exact authored pack revision.
var path := ""
var pack_key := ""
var notebook_id := ""
var state: Dictionary = {"version":1,"activities":{}}
var last_error := ""

func initialize(pack: Dictionary, custom_path := "", save_directory := "") -> void:
	state = {"version":1,"activities":{}}; last_error = ""
	notebook_id = str(pack.get("notebook",{}).get("id",""))
	pack_key = JSON.stringify(pack).sha256_text()
	path = custom_path if not custom_path.is_empty() else ("user://" if save_directory.is_empty() else save_directory + "/") + "factory-progress-" + pack_key.substr(0,24) + ".json"
	if not FileAccess.file_exists(path): return
	var saved = JSON.parse_string(FileAccess.get_file_as_string(path))
	if saved is Dictionary and saved.get("version") == 1 and saved.get("packKey") == pack_key and saved.get("activities") is Dictionary:
		state = saved

func activity(id: String) -> Dictionary:
	return state.activities.get(id,{}).duplicate(true)

func save_activity(id: String, response: Dictionary, result: Dictionary, assisted: bool, taught: bool, practice: Dictionary = {}) -> bool:
	var previous: Dictionary = state.activities.get(id,{})
	var independent: bool = bool(previous.get("independent",false)) or (result.get("valid",false) and result.get("outcome") == "correct" and result.get("correct") == true and practice.is_empty() and not assisted and not result.get("hintUsed",false))
	var preview_complete: bool = practice.get("valid",false) and (practice.get("correct") == true or practice.get("outcome") == "self-reviewed")
	var supported_complete: bool = (result.get("correct") == true and assisted) or result.get("outcome") == "self-reviewed" or preview_complete
	var participation_xp := 20 if supported_complete or int(previous.get("participationXp",0)) > 0 else 0
	var next: Dictionary = state.duplicate(true)
	next.activities[id] = {"response":response.duplicate(true),"result":result.duplicate(true),"practice":practice.duplicate(true),"participationXp":participation_xp,"assisted":assisted,"taught":taught,"independent":independent,"updatedAt":Time.get_datetime_string_from_system(true)}
	next["packKey"] = pack_key; next["notebookId"] = notebook_id
	var absolute := ProjectSettings.globalize_path(path)
	DirAccess.make_dir_recursive_absolute(absolute.get_base_dir())
	var temp := absolute + ".tmp"
	var file := FileAccess.open(temp,FileAccess.WRITE)
	if file == null: last_error = "Could not save progress. Keep this window open and try again."; return false
	file.store_string(JSON.stringify(next)); file.close()
	if DirAccess.rename_absolute(temp,absolute) != OK: last_error = "The saved progress could not be replaced."; return false
	state = next
	return true

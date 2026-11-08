extends SceneTree
## Saved reward, fresh-attempt, and pack-isolation boundaries in the real native controller.
const Store = preload("res://scripts/progress_store.gd")
class DelayedMain extends "res://main.gd":
	var hold_media := false
	var media_entered := false
	func load_native_media(sources: Array) -> Dictionary:
		media_entered = true
		while hold_media: await get_tree().process_frame
		return await super.load_native_media(sources)
var checks := 0
var failures: Array = []
func _initialize() -> void: call_deferred("run")
func check(value: bool, message: String) -> void:
	checks += 1
	if not value: failures.append(message); push_error(message)
func run() -> void:
	var manifest_path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--manifest="): manifest_path = arg.trim_prefix("--manifest=")
	var folder := OS.get_temp_dir().path_join("asterloom-native-progress-"+str(OS.get_process_id()))
	DirAccess.make_dir_recursive_absolute(folder)
	var correct := {"valid":true,"correct":true,"outcome":"correct","hintUsed":false}
	var store = Store.new(); var pack_a := {"revision":1}; var pack_b := {"revision":2}
	store.initialize(pack_a,"",folder)
	check(store.save_activity("same-id",{"answer":"A"},correct,false,true),"Initial independent result saves")
	check(store.activity("same-id").independent,"Reviewed independent result receives independent credit")
	store.initialize(pack_b,"",folder)
	check(store.activity("same-id").is_empty(),"Different pack revision starts without old results, XP, or response")
	store.initialize(pack_a,"",folder)
	check(store.activity("same-id").response.answer == "A","Returning to original pack restores only its saved state")
	var blocker := folder.path_join("not-a-directory")
	var file := FileAccess.open(blocker,FileAccess.WRITE); file.store_string("blocked"); file.close()
	var saved_state: Dictionary = store.state.duplicate(true); store.path = blocker.path_join("progress.json")
	check(not store.save_activity("new-id",{},correct,false,true),"Unwritable destination rejects save")
	check(store.state == saved_state,"Failed save grants no independent credit and makes no in-memory progress change")
	var fixture = JSON.parse_string(FileAccess.get_file_as_string(manifest_path)); var entry: Dictionary = {}
	for candidate in fixture.cases:
		if candidate.scaffoldId == "recall-escape-mission": entry = candidate; break
	check(not entry.is_empty(),"Recall fixture exists")
	var main = DelayedMain.new(); root.add_child(main); await process_frame
	main.save_directory = folder
	for draft in [false,true]:
		var activity: Dictionary = entry.activity.duplicate(true)
		activity.reviewStatus = "needs-review" if draft else "reviewed"
		var notebook := {"id":"progress-qa-"+str(draft),"title":"Progress contract","description":"Isolated QA fixture","createdAt":"2026-10-10T00:00:00.000Z","updatedAt":"2026-10-10T00:00:00.000Z","revision":1,"ageGroup":entry.ageGroup,"theme":"islands","goal":"Recall the supplied source.","scaffoldIds":[entry.scaffoldId],"cards":[],"sources":entry.sources,"activities":[activity]}
		var pack := {"format":"asterloom-godot-factory","version":1,"notebook":notebook,"missions":[{"scaffoldId":entry.scaffoldId,"activityId":activity.id}]}
		var pack_path := folder.path_join("pack-"+str(draft)+".json")
		file = FileAccess.open(pack_path,FileAccess.WRITE); file.store_string(JSON.stringify(pack)); file.close()
		await main.load_pack(pack_path)
		main.taught = true; main.assisted = true; main.response = entry.correctResponse.duplicate(true); main.render_mission()
		main.check_work()
		main.board.changed.emit(entry.wrongResponse.duplicate(true))
		while main.busy: await process_frame
		check(main.result.is_empty() and main.store.activity(activity.id).result.is_empty() and main.store.activity(activity.id).participationXp == 0,"Edit during pending assessment discards stale success and awards nothing")
		main.response = entry.correctResponse.duplicate(true)
		await main.check_work()
		var saved: Dictionary = main.store.activity(activity.id)
		check(saved.get("participationXp") == 20,"Supported/practice completion earns 20 participation XP")
		check(not saved.get("independent"),"Teaching-supported attempt cannot earn independent credit")
		await main.check_work()
		check(main.store.activity(activity.id).participationXp == 20,"Repeated check cannot duplicate participation XP")
		main.response["revealedIds"] = [activity.questions[0].id]; main.assisted = true; main.save_current()
		await main.open_mission(main.mission)
		check(main.assisted and not main.response.revealedIds.is_empty(),"Resume preserves current assistance and revealed answers")
		await main.restart_attempt()
		check(main.taught and not main.assisted and main.response.revealedIds.is_empty(),"Fresh attempt keeps teaching complete and clears only current assistance/reveals")
		main.response = entry.correctResponse.duplicate(true); main.check_work(); main.show_sources()
		while main.busy: await process_frame
		check(main.assisted and not main.store.activity(activity.id).independent,"Opening source library during assessment marks the current attempt supported")
		main.source_dialog.hide(); await main.restart_attempt()
		main.response = entry.correctResponse.duplicate(true); await main.check_work()
		saved = main.store.activity(activity.id)
		check(saved.independent == (not draft),"Fresh reviewed attempt earns independent credit; draft still cannot")
		check(saved.participationXp == 20,"Fresh success preserves one participation award")
		var previous_response: Dictionary = main.response.duplicate(true); var previous_result: Dictionary = main.result.duplicate(true)
		main.assisted = true; main.store.path = blocker.path_join("failed-restart.json")
		await main.restart_attempt()
		check(main.response == previous_response and main.result == previous_result and main.assisted,"Failed fresh-attempt save restores current response/result/assistance")
	main.hold_media = true; main.media_entered = false
	var before_load: Dictionary = main.store.state.duplicate(true)
	main.load_pack(folder.path_join("pack-false.json"))
	while not main.media_entered: await process_frame
	check(main.busy and main.loading_pack,"Pack loading remains locked during deferred source-asset validation")
	check(not main.save_current() and main.store.state == before_load,"Old direct save/hint/study callbacks cannot write during a pack transition")
	main.board.changed.emit(entry.wrongResponse.duplicate(true))
	check(main.store.state == before_load,"Old controls cannot save against a new pack while media loads")
	await main.load_pack(folder.path_join("pack-true.json"))
	check(main.notebook.id == "progress-qa-false","Concurrent second load cannot replace the pack being validated")
	main.hold_media = false
	while main.busy: await process_frame
	check(main.notebook.id == "progress-qa-false" and not main.loading_pack and not main.loading_mission,"First load completes under its own pack and releases loading guards")
	check(main.store.state.get("notebookId") == "progress-qa-false","Saved progress carries explicit notebook ownership metadata")
	main.storage_owner = "progress-qa-false".sha256_text()
	await main.load_pack(folder.path_join("pack-true.json"))
	check(main.notebook.id == "progress-qa-false" and not main.busy,"App-owned preview cannot switch to a different notebook under the old storage/lease")
	main.presentation.stop_all(); main.queue_free(); await process_frame
	print("NATIVE_PROGRESS_SUMMARY "+JSON.stringify({"checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

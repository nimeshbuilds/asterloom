extends SceneTree

var failures: Array[String] = []
var checks: Dictionary = {}

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, label: String) -> void:
	checks[label] = condition
	if not condition:
		failures.append(label)
		push_error("AUDIO CHECK FAILED: " + label)

func digest(bytes: PackedByteArray) -> String:
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	return hash.finish().hex_encode()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].is_absolute_path():
		push_error("Pass one owned absolute evidence directory after --.")
		quit(2)
		return
	var directory: String = args[0]
	DirAccess.make_dir_recursive_absolute(directory)
	var prefs := directory.path_join("isolated-audio-preference.cfg")
	if FileAccess.file_exists(prefs):
		push_error("Use a fresh evidence directory; prior proof is never overwritten.")
		quit(2)
		return
	var factory := load("res://audio/AsterloomAudio.gd") as GDScript
	var audio := factory.new() as Node
	audio.settings_path = prefs
	var started := Time.get_ticks_msec()
	root.add_child(audio)
	await process_frame
	var init_ms := Time.get_ticks_msec() - started
	check(audio.is_muted(), "first_run_is_muted")
	check(not audio.debug_snapshot().music_playing, "no_music_before_enable")
	check(not audio.play_cue("correct", "muted-result"), "muted_cue_dropped")
	check(audio.debug_snapshot().pool_size == 6 and audio.get_child_count() == 7, "bounded_six_voice_pool")
	var fingerprints: Dictionary = {}
	var pcm: Dictionary = {}
	for event in audio.CUE_NAMES:
		var stream: AudioStreamWAV = audio._cues[event]
		var samples: PackedByteArray = stream.data
		var peak := 0.0
		var energy := 0.0
		for index in samples.size() / 2:
			var sample := float(samples.decode_s16(index * 2)) / 32767.0
			peak = maxf(peak, absf(sample))
			energy += sample * sample
		var hash := digest(samples)
		check(not fingerprints.has(hash), event + "_has_distinct_pcm")
		fingerprints[hash] = event
		check(peak > 0.03 and peak < 0.75, event + "_bounded_nonzero_pcm")
		check(stream.loop_mode == AudioStreamWAV.LOOP_DISABLED, event + "_does_not_loop")
		check(stream.save_to_wav(directory.path_join(event + ".wav")) == OK, event + "_wav_saved")
		pcm[event] = {"sha256": hash, "peak": peak, "rms": sqrt(energy / float(samples.size() / 2)), "seconds": stream.get_length()}
	audio.set_muted(false)
	check(FileAccess.file_exists(prefs), "explicit_preference_saved")
	var enabled_restored := factory.new() as Node
	enabled_restored.settings_path = prefs
	root.add_child(enabled_restored)
	await process_frame
	check(not enabled_restored.is_muted() and enabled_restored.debug_snapshot().music_playing, "explicit_enabled_preference_restored")
	enabled_restored.queue_free()
	check(audio.debug_snapshot().music_playing and audio.debug_snapshot().track == "winter", "network_initial_music")
	check(not audio.play_cue("correct", "muted-result"), "unmute_does_not_replay_suppressed_event")
	check(audio.play_cue("pickup", "pickup-1"), "pickup_plays")
	check(not audio.play_cue("pickup", "pickup-1"), "event_key_deduplicated")
	check(audio.play_cue("correct", "correct-1"), "committed_success_plays")
	check(audio.debug_snapshot().active_voices == 1, "reward_replaces_action_tail")
	check(audio.debug_snapshot().music_target_db == -30.0, "reward_ducks_music")
	audio.set_narration_active(true)
	check(audio.debug_snapshot().active_voices == 0, "narration_cancels_existing_cues")
	check(audio.debug_snapshot().music_target_db == -45.0, "narration_ducks_recording")
	check(not audio.play_cue("aster", "narration-suppressed"), "narration_suppresses_new_cue")
	var count_before: int = audio.debug_snapshot().started_events
	audio.set_narration_active(false)
	await create_timer(0.2).timeout
	check(audio.debug_snapshot().active_voices == 0 and audio.debug_snapshot().started_events == count_before, "narration_end_has_no_late_cue")
	check(not audio.play_cue("aster", "narration-suppressed"), "suppressed_aster_never_replayed")
	check(audio.play_cue("aster", "fresh-aster"), "new_aster_event_plays")
	audio.set_muted(true)
	check(audio.debug_snapshot().active_voices == 0 and not audio.debug_snapshot().music_playing, "mute_stops_all_audio")
	var restored := factory.new() as Node
	restored.settings_path = prefs
	root.add_child(restored)
	await process_frame
	check(restored.is_muted() and not restored.debug_snapshot().music_playing, "mute_restored_on_reopen")
	restored.queue_free()
	audio.set_muted(false)
	var music: AudioStreamPlayer = audio._music
	var duration := music.stream.get_length()
	music.play(duration - 0.10)
	await create_timer(0.50).timeout
	check(audio.debug_snapshot().track == "wisdom" and audio.debug_snapshot().playlist_index == 1, "recording_end_advances_to_different_track")
	var network_pickup: String = pcm.pickup.sha256
	audio.configure("waterworks", "adult")
	check(audio.debug_snapshot().track == "wisdom" and digest(audio._cues.pickup.data) != network_pickup, "scene_changes_score_order_and_cue_material")
	audio.configure("garden", "6-8")
	check(audio.debug_snapshot().track == "saying" and audio.debug_snapshot().music_target_db == -28.0, "young_scene_has_gentler_background")
	audio._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	check(not audio.play_cue("connect", "unfocused") and music.stream_paused, "focus_loss_pauses_music_and_suppresses_cues")
	audio._notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	check(not music.stream_paused and audio.debug_snapshot().active_voices == 0, "focus_return_does_not_replay_cues")
	audio.stop_all()
	check(not audio.debug_snapshot().music_playing and not audio.play_cue("complete", "after-stop"), "stop_is_terminal_until_explicit_enable")
	audio.queue_free()
	await process_frame
	check(not is_instance_valid(audio), "owned_nodes_released")
	# AudioServer finishes releasing stopped playbacks on its next mix tick.
	await create_timer(0.2).timeout
	var result := {"passed": failures.is_empty(), "checks": checks, "failures": failures, "engine": Engine.get_version_info().string, "headless_dummy_audio": true, "recorded_speaker_listening": false, "initialization_ms": init_ms, "pcm": pcm, "provider_calls": 0, "network_calls": 0, "preferences": "Isolated proof-directory file; no application profile touched."}
	var file := FileAccess.open(directory.path_join("audio-proof.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(result, "  "))
	print(JSON.stringify({"passed": failures.is_empty(), "checks": checks.size(), "failures": failures, "initialization_ms": init_ms, "evidence": directory}))
	quit(0 if failures.is_empty() else 1)

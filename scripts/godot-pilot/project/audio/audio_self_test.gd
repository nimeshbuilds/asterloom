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
	check(audio.debug_snapshot().pool_size == 6 and audio.get_child_count() == 8 and audio.debug_snapshot().music_player_count == 2, "bounded_six_cue_two_music_pool")
	audio.set_phase("learning")
	check(not audio.debug_snapshot().music_playing and audio.debug_snapshot().phase == "learning", "phase_change_does_not_unmute")
	audio.set_phase("briefing")
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
		check(samples.decode_s16(0) == 0 and samples.decode_s16(samples.size() - 2) == 0, event + "_zero_attack_and_release_endpoints")
		check(stream.save_to_wav(directory.path_join(event + ".wav")) == OK, event + "_wav_saved")
		pcm[event] = {"sha256": hash, "peak": peak, "rms": sqrt(energy / float(samples.size() / 2)), "seconds": stream.get_length()}
	audio.set_muted(false)
	await create_timer(0.95).timeout
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
	check(audio.debug_snapshot().music_target_db == -34.0, "reward_ducks_music")
	audio.set_narration_active(true)
	check(audio.debug_snapshot().active_voices == 0, "narration_cancels_existing_cues")
	check(audio.debug_snapshot().music_target_db == -49.0, "narration_ducks_recording")
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
	await create_timer(0.95).timeout
	var music: AudioStreamPlayer = audio._music
	var duration := music.stream.get_length()
	music.play(duration - 0.10)
	await create_timer(1.10).timeout
	check(audio.debug_snapshot().track == "wisdom" and audio.debug_snapshot().playlist_index == 1, "recording_end_advances_to_different_track")
	var network_pickup: String = pcm.pickup.sha256
	audio.configure("waterworks", "adult")
	check(audio.debug_snapshot().track == "wisdom" and digest(audio._cues.pickup.data) != network_pickup, "scene_changes_score_order_and_cue_material")
	audio.configure("garden", "6-8")
	await create_timer(0.95).timeout
	check(audio.debug_snapshot().track == "saying" and audio.debug_snapshot().music_target_db == -32.0, "young_scene_has_gentler_background")
	music = audio._music
	audio._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	check(not audio.play_cue("connect", "unfocused") and music.stream_paused, "focus_loss_pauses_music_and_suppresses_cues")
	audio._notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	check(not music.stream_paused and audio.debug_snapshot().active_voices == 0, "focus_return_does_not_replay_cues")

	# Each world uses a different root and material, without allocating extra nodes.
	var profile_pcm: Dictionary = {}
	for profile in ["network", "waterworks", "garden", "archive"]:
		audio.configure(profile, "adult")
		var fingerprint := digest(audio._cues.connect.data)
		check(not profile_pcm.has(fingerprint), profile + "_distinct_world_timbre")
		profile_pcm[fingerprint] = profile
		check(audio.get_child_count() == 8, profile + "_does_not_grow_player_pool")
	await create_timer(1.9).timeout
	check(audio.debug_snapshot().scene == "archive" and audio.debug_snapshot().track == "winter", "rapid_profile_changes_settle_latest_only")
	var before_identical: int = audio.debug_snapshot().music_starts
	var playback_before: float = audio._music.get_playback_position()
	for repeat in 50:
		audio.configure("archive", "adult")
		audio.set_phase("briefing")
		audio.set_muted(false)
	await create_timer(0.12).timeout
	check(audio.debug_snapshot().music_starts == before_identical and audio._music.get_playback_position() >= playback_before, "repeated_ui_refresh_preserves_recording_position")
	audio.set_phase("unknown-stage")
	check(audio.debug_snapshot().phase == "briefing" and audio.debug_snapshot().music_starts == before_identical, "unknown_phase_does_not_change_sound")

	var phases: Dictionary = {}
	for phase in ["learning", "building", "challenge", "debrief"]:
		var cue_count: int = audio.debug_snapshot().started_events
		audio.set_phase(phase)
		var state: Dictionary = audio.debug_snapshot()
		check(state.crossfading and state.active_music_players == 2, phase + "_crossfades_two_recordings")
		var incoming: int = audio._music_slot
		var outgoing: int = audio._outgoing_slot
		var previous_weight := 0.0
		var valid_envelope := true
		var mix_samples: Array = []
		for tick in 10:
			await create_timer(0.1).timeout
			state = audio.debug_snapshot()
			var weights: Array = state.mix_weights
			valid_envelope = valid_envelope and weights[incoming] >= previous_weight and weights[incoming] >= 0.0 and weights[incoming] <= 1.0 and weights[outgoing] >= 0.0 and weights[outgoing] <= 1.0 and absf(weights[0] + weights[1] - 1.0) < 0.0001
			previous_weight = weights[incoming]
			mix_samples.append(weights)
		check(valid_envelope, phase + "_smooth_monotonic_unity_bounded_mix")
		check(not state.crossfading and state.active_music_players == 1 and audio._music_players[outgoing].stream == null, phase + "_outgoing_stream_released")
		check(state.music_target_db == audio.PHASE_LEVELS[phase], phase + "_authored_mix_level")
		check(state.started_events == cue_count, phase + "_music_change_does_not_replay_event")
		phases[phase] = {"track":state.track, "level_db":state.music_level_db, "mix_samples":mix_samples}
	check(phases.learning.level_db < phases.building.level_db and phases.learning.level_db < phases.challenge.level_db, "reading_is_quieter_than_construction")
	var character_events: int = audio.debug_snapshot().started_events
	check(audio.play_cue("character", "visitor-one"), "character_entrance_cue")
	check(audio.play_cue("mission_start", "mission-one"), "mission_start_cue")
	check(audio.play_cue("phase_complete", "phase-one"), "phase_complete_cue")
	check(not audio.play_cue("phase_complete", "phase-one"), "phase_completion_does_not_repeat")
	check(audio.debug_snapshot().active_voices == 1 and audio.debug_snapshot().started_events == character_events + 3, "milestone_replaces_prior_action_tail")

	# Canceling a fade must not allow its completion callback to restart sound.
	audio.set_phase("building")
	await create_timer(0.2).timeout
	audio.set_muted(true)
	var starts_at_mute: int = audio.debug_snapshot().music_starts
	audio.set_phase("challenge")
	audio.set_phase("learning")
	await create_timer(1.1).timeout
	check(not audio.debug_snapshot().music_playing and not audio.debug_snapshot().crossfading and audio.debug_snapshot().music_starts == starts_at_mute and audio.debug_snapshot().active_voices == 0, "muting_mid_fade_cancels_all_late_audio")
	audio.set_muted(false)
	check(audio.debug_snapshot().track == "wisdom" and audio.debug_snapshot().phase == "learning", "unmute_uses_current_phase_only")
	await create_timer(0.2).timeout
	audio._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	var frozen_mix: Array = audio.debug_snapshot().mix_weights
	await create_timer(0.3).timeout
	check(audio.debug_snapshot().mix_weights == frozen_mix and audio._music.stream_paused, "focus_loss_pauses_crossfade_envelope")
	audio.set_phase("challenge")
	check(not audio.play_cue("mission_start", "away-mission"), "unfocused_milestone_dropped")
	audio._notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	await create_timer(1.9).timeout
	check(audio.debug_snapshot().track == "saying" and not audio.debug_snapshot().crossfading and audio.debug_snapshot().active_music_players == 1, "focus_return_settles_latest_phase")
	check(not audio.play_cue("mission_start", "away-mission"), "focus_return_never_replays_milestone")
	audio.set_narration_active(true)
	audio.set_phase("building")
	await create_timer(0.2).timeout
	check(audio.debug_snapshot().music_target_db == -45.0 and audio.debug_snapshot().music_level_db < -44.0, "both_crossfade_voices_duck_under_narration")
	check(not audio.play_cue("character", "speaking-character"), "narration_suppresses_new_character")
	audio.set_narration_active(false)
	audio.stop_all()
	audio.set_phase("debrief")
	await create_timer(1.0).timeout
	check(not audio.debug_snapshot().music_playing and not audio.debug_snapshot().crossfading and not audio.play_cue("complete", "after-stop"), "stop_is_terminal_until_explicit_enable")
	check(audio._music_players.all(func(player): return player.stream == null), "stop_releases_both_music_streams")
	audio.queue_free()
	await process_frame
	check(not is_instance_valid(audio), "owned_nodes_released")
	# AudioServer finishes releasing stopped playbacks on its next mix tick.
	await create_timer(0.2).timeout
	var result := {"passed": failures.is_empty(), "checks": checks, "failures": failures, "engine": Engine.get_version_info().string, "headless_dummy_audio": true, "recorded_speaker_listening": false, "initialization_ms": init_ms, "pcm": pcm, "phase_mixes": phases, "provider_calls": 0, "network_calls": 0, "preferences": "Isolated proof-directory file; no application profile touched."}
	var file := FileAccess.open(directory.path_join("audio-proof.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(result, "  "))
	print(JSON.stringify({"passed": failures.is_empty(), "checks": checks.size(), "failures": failures, "initialization_ms": init_ms, "evidence": directory}))
	quit(0 if failures.is_empty() else 1)

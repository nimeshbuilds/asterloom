class_name AsterloomAudio
extends Node
## Offline pilot audio. Nothing plays until Sound is enabled or a saved enabled
## preference is restored. This node never downloads audio or owns narration.

signal mute_changed(muted: bool)
signal track_changed(title: String, artist: String)
signal preference_save_failed(error: int)

const SAMPLE_RATE := 24000
const VOICE_COUNT := 6
const CROSSFADE_SECONDS := 0.85
const TRACKS := {
	"wisdom": {"path": "res://audio/music/a-brand-new-wisdom.ogg", "title": "A Brand New Wisdom"},
	"saying": {"path": "res://audio/music/just-saying-tho.ogg", "title": "Just Saying Tho"},
	"winter": {"path": "res://audio/music/winter-dust.ogg", "title": "Winter Dust"}
}
const PLAYLISTS := {"network": ["winter", "wisdom", "saying"], "waterworks": ["wisdom", "saying", "winter"], "garden": ["saying", "winter", "wisdom"], "archive": ["winter", "saying", "wisdom"]}
const ROOTS := {"network": 220.0, "waterworks": 196.0, "garden": 261.6256, "archive": 174.6141}
# Named, authored entrances followed by the remaining complete recordings. Five
# phases reuse three licensed recordings; this is not five new compositions.
const PHASE_TRACKS := {
	"network": {"briefing":"winter", "learning":"wisdom", "building":"saying", "challenge":"wisdom", "debrief":"winter"},
	"waterworks": {"briefing":"wisdom", "learning":"winter", "building":"saying", "challenge":"wisdom", "debrief":"winter"},
	"garden": {"briefing":"saying", "learning":"winter", "building":"wisdom", "challenge":"saying", "debrief":"wisdom"},
	"archive": {"briefing":"winter", "learning":"wisdom", "building":"winter", "challenge":"saying", "debrief":"wisdom"}
}
const PHASE_LEVELS := {"briefing":-29.0, "learning":-34.0, "building":-25.0, "challenge":-23.0, "debrief":-29.0}
const CUE_NAMES := ["pickup", "connect", "correct", "retry", "aster", "complete", "character", "mission_start", "phase_complete"]

# Override before add_child in an isolated test; normal pilot preferences are
# separate from Asterloom's Electron profile and contain only a mute boolean.
var settings_path := "user://pilot_audio.cfg"
var _muted := true
var _scene_id := "network"
var _age_group := "adult"
var _phase := "briefing"
var _narration_active := false
var _focused := true
var _stopped := false
var _music: AudioStreamPlayer
var _music_players: Array[AudioStreamPlayer] = []
var _mix_weights: Array[float] = [0.0, 0.0]
var _music_slot := -1
var _outgoing_slot := -1
var _requested_track := ""
var _fade_active := false
var _fade_tween: Tween
var _music_starts := 0
var _music_level_db := -29.0:
	set(value):
		_music_level_db = value
		_apply_music_mix()
var _voices: Array[AudioStreamPlayer] = []
var _cues: Dictionary = {}
var _playlist_index := 0
var _last_event: Dictionary = {}
var _event_keys: Array[String] = []
var _gain_tween: Tween
var _current_track := ""
var _started_events := 0

func _ready() -> void:
	var preferences := ConfigFile.new()
	if preferences.load(settings_path) == OK:
		var preference: Variant = preferences.get_value("sound", "muted", true)
		_muted = preference if preference is bool else true
	for index in 2:
		var player := AudioStreamPlayer.new()
		player.name = "BackgroundMusic%d" % index
		player.volume_linear = 0.0
		player.max_polyphony = 1
		add_child(player)
		player.finished.connect(_music_finished.bind(index))
		_music_players.append(player)
	for index in VOICE_COUNT:
		var voice := AudioStreamPlayer.new()
		voice.name = "CueVoice%d" % index
		voice.volume_db = -8.0
		voice.max_polyphony = 1
		add_child(voice)
		voice.finished.connect(_update_music_gain)
		_voices.append(voice)
	_build_cues()
	_music_level_db = _target_music_db()
	if not _muted:
		_request_music()

func configure(scene_id: String, age_group: String = "adult") -> void:
	var next_scene := scene_id if PLAYLISTS.has(scene_id) else "waterworks"
	if next_scene == _scene_id and age_group == _age_group:
		return
	_scene_id = next_scene
	_age_group = age_group
	_playlist_index = 0
	_last_event.clear()
	_stop_cues()
	if not is_node_ready():
		return
	_build_cues()
	_update_music_gain()
	_request_music()

## Music only: the caller emits any one-time mission/character/completion cue.
## Invalid phases do nothing; identical phases preserve playback and fade state.
func set_phase(phase: String) -> void:
	if not PHASE_LEVELS.has(phase) or phase == _phase:
		return
	_phase = phase
	_playlist_index = 0
	if not is_node_ready():
		return
	_update_music_gain()
	_request_music()

func is_muted() -> bool:
	return _muted

func set_muted(value: bool) -> void:
	if value == _muted and not _stopped:
		return
	_muted = value
	_stopped = false
	var preferences := ConfigFile.new()
	preferences.set_value("sound", "muted", value)
	var error := preferences.save(settings_path)
	if error != OK:
		preference_save_failed.emit(error)
	if is_node_ready():
		_stop_cues()
		if value:
			_stop_music()
		else:
			_request_music()
	mute_changed.emit(value)

func set_narration_active(value: bool) -> void:
	_narration_active = value
	if value:
		_stop_cues()
	_update_music_gain()

func play_cue(event: String, event_key: String = "") -> bool:
	# Suppressed events are dropped, never queued for unmute or after narration.
	if not event_key.is_empty():
		if _event_keys.has(event_key):
			return false
		_event_keys.append(event_key)
		if _event_keys.size() > 64:
			_event_keys.pop_front()
	if not is_node_ready() or _muted or _stopped or _narration_active or not _focused or not _cues.has(event):
		return false
	var now := Time.get_ticks_msec()
	var cooldown := 900 if event in ["aster", "character", "mission_start", "phase_complete"] else (70 if event == "pickup" else 130)
	if now - int(_last_event.get(event, -10000)) < cooldown:
		return false
	_last_event[event] = now
	if event in ["correct", "retry", "complete", "mission_start", "phase_complete"]:
		_stop_cues()
	# Bound node/voice count. Quiet drop instead of restarting a reward when a
	# burst of pointer actions uses the pool; no delayed callbacks are scheduled.
	var selected: AudioStreamPlayer = null
	for voice in _voices:
		if not voice.playing:
			selected = voice
			break
	if selected == null:
		return false
	selected.stream = _cues[event]
	selected.set_meta("cue", event)
	selected.volume_db = -12.0 if _age_group in ["3-5", "6-8"] else -8.0
	selected.play()
	_started_events += 1
	_update_music_gain()
	return true

func stop_all() -> void:
	_stopped = true
	_stop_cues()
	if is_instance_valid(_gain_tween):
		_gain_tween.kill()
	_stop_music()

func _exit_tree() -> void:
	stop_all()
	_cues.clear()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_focused = false
		_stop_cues()
		for player in _music_players:
			player.stream_paused = true
		if _fade_active and is_instance_valid(_fade_tween):
			_fade_tween.pause()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_focused = true
		for player in _music_players:
			player.stream_paused = false
		if _fade_active and is_instance_valid(_fade_tween):
			_fade_tween.play()
		_request_music()

func _stop_cues() -> void:
	for voice in _voices:
		voice.stop()
		voice.stream = null
	_update_music_gain()

func _phase_playlist() -> Array:
	var first: String = PHASE_TRACKS[_scene_id][_phase]
	var result: Array = [first]
	for track in PLAYLISTS[_scene_id]:
		if track != first:
			result.append(track)
	return result

func _request_music() -> void:
	var playlist := _phase_playlist()
	_requested_track = playlist[_playlist_index % playlist.size()]
	_start_music()

func _start_music() -> void:
	if _music_players.is_empty() or _muted or _stopped or not _focused:
		return
	if _fade_active:
		# A single latest musical destination, not a queue. Rapid UI changes never
		# restart the incoming recording or play intermediate phase cues.
		return
	if is_instance_valid(_music) and _music.playing and _current_track == _requested_track:
		return
	var track_id := _requested_track
	var track: Dictionary = TRACKS[track_id]
	var stream := load(String(track.path)) as AudioStreamOggVorbis
	if stream == null:
		push_warning("The bundled pilot recording is unavailable: " + track_id)
		return
	# Duplicate only the resource configuration, keep original recorded samples.
	stream = stream.duplicate() as AudioStreamOggVorbis
	stream.loop = false
	_outgoing_slot = _music_slot if is_instance_valid(_music) and _music.playing else -1
	_music_slot = 0 if _music_slot != 0 else 1
	_music = _music_players[_music_slot]
	_music.stream = stream
	_mix_weights[_music_slot] = 0.0
	_current_track = track_id
	_music.play()
	_music_starts += 1
	_fade_active = true
	_fade_tween = create_tween()
	_fade_tween.tween_method(_set_music_blend, 0.0, 1.0, CROSSFADE_SECONDS)
	_fade_tween.tween_callback(_finish_music_fade)
	track_changed.emit(String(track.title), "hernandack")

func _set_music_blend(blend: float) -> void:
	_mix_weights[_music_slot] = blend
	if _outgoing_slot >= 0:
		_mix_weights[_outgoing_slot] = 1.0 - blend
	_apply_music_mix()

func _finish_music_fade() -> void:
	if _outgoing_slot >= 0:
		_music_players[_outgoing_slot].stop()
		_music_players[_outgoing_slot].stream = null
		_mix_weights[_outgoing_slot] = 0.0
	_outgoing_slot = -1
	_fade_active = false
	_start_music()

func _apply_music_mix() -> void:
	for index in _music_players.size():
		_music_players[index].volume_linear = db_to_linear(_music_level_db) * _mix_weights[index]

func _stop_music() -> void:
	if is_instance_valid(_fade_tween):
		_fade_tween.kill()
	_fade_active = false
	for player in _music_players:
		player.stop()
		player.stream = null
	_mix_weights = [0.0, 0.0]
	_music_slot = -1
	_outgoing_slot = -1
	_current_track = ""
	_apply_music_mix()

func _process(_delta: float) -> void:
	if _muted or _stopped or not _focused or _fade_active or not is_instance_valid(_music) or not _music.playing or _music.stream == null:
		return
	# Crossfade at the real recording boundary rather than repeating a short
	# global loop; finished remains a fallback for delayed/headless frames.
	if _music.stream.get_length() - _music.get_playback_position() <= CROSSFADE_SECONDS:
		_advance_track()

func _music_finished(slot: int) -> void:
	if slot == _music_slot:
		_advance_track()

func _advance_track() -> void:
	if _muted or _stopped:
		return
	_playlist_index += 1
	_request_music()

func _target_music_db() -> float:
	var level: float = PHASE_LEVELS[_phase] - (3.0 if _age_group in ["3-5", "6-8"] else 0.0)
	if _narration_active:
		return level - 20.0
	for voice in _voices:
		if voice.playing and voice.get_meta("cue", "") in ["aster", "character", "correct", "complete", "mission_start", "phase_complete"]:
			return level - 5.0
	return level

func _update_music_gain() -> void:
	if _music_players.is_empty() or not is_inside_tree():
		return
	if is_instance_valid(_gain_tween):
		_gain_tween.kill()
	_gain_tween = create_tween()
	_gain_tween.tween_property(self, "_music_level_db", _target_music_db(), 0.16)

func _build_cues() -> void:
	_cues.clear()
	var root: float = ROOTS[_scene_id]
	var material: int = {"network":1, "waterworks":2, "garden":0, "archive":4}[_scene_id]
	# Each row is offset seconds, pitch/root, duration seconds, amplitude,
	# instrument (0 felt, 1 glass, 2 droplet, 3 click, 4 warm plucked wood).
	var plans := {
		"pickup": [[0.0, 3.0, 0.13, 0.23, material], [0.018, 1.0, 0.05, 0.08, 3]],
		"connect": [[0.0, 1.0, 0.045, 0.13, 3], [0.035, 2.0, 0.22, 0.20, material], [0.065, 3.0, 0.19, 0.12, 0]],
		"correct": [[0.0, 1.0, 0.34, 0.16, 0], [0.02, 2.0, 0.29, 0.17, material], [0.15, 2.5, 0.36, 0.18, material], [0.30, 3.0, 0.55, 0.18, material]],
		"retry": [[0.0, 2.0, 0.27, 0.15, 0], [0.16, 1.5, 0.38, 0.16, 0]],
		"aster": [[0.0, 2.0, 0.36, 0.12, 1], [0.13, 3.0, 0.47, 0.15, 1]],
		"complete": [[0.0, 1.0, 0.67, 0.14, 0], [0.0, 2.0, 0.40, 0.16, material], [0.16, 2.5, 0.40, 0.17, material], [0.32, 3.0, 0.50, 0.18, material], [0.52, 4.0, 0.70, 0.15, 1]],
		"character": [[0.0, 1.5, 0.31, 0.13, material], [0.09, 2.0, 0.43, 0.12, 0]],
		"mission_start": [[0.0, 1.0, 0.08, 0.10, 3], [0.07, 1.5, 0.29, 0.16, material], [0.23, 2.0, 0.36, 0.15, material], [0.40, 3.0, 0.42, 0.12, material]],
		"phase_complete": [[0.0, 2.0, 0.30, 0.15, material], [0.15, 3.0, 0.46, 0.14, material]]
	}
	for event in CUE_NAMES:
		_cues[event] = _render_cue(plans[event], root)

func _render_cue(notes: Array, root: float) -> AudioStreamWAV:
	var length := 0.0
	for note in notes:
		length = maxf(length, float(note[0]) + float(note[2]))
	var samples := PackedFloat32Array()
	samples.resize(ceili((length + 0.02) * SAMPLE_RATE))
	var noise := RandomNumberGenerator.new()
	noise.seed = 20261010
	for note in notes:
		var onset := int(float(note[0]) * SAMPLE_RATE)
		var duration: float = note[2]
		var frequency: float = root * float(note[1])
		var amplitude: float = note[3]
		var instrument: int = note[4]
		for index in int(duration * SAMPLE_RATE):
			var time := float(index) / SAMPLE_RATE
			var attack := minf(time / 0.008, 1.0)
			var release := minf((duration - time) / 0.05, 1.0)
			var envelope := attack * release * exp(-3.5 * time / duration)
			var phase := TAU * frequency * time
			var wave := sin(phase) + 0.18 * sin(phase * 2.0)
			if instrument == 1:
				wave = 0.72 * sin(phase) + 0.20 * sin(phase * 2.756) + 0.08 * sin(phase * 4.01)
			elif instrument == 2:
				wave = sin(phase + 1.4 * (1.0 - exp(-time * 25.0)))
			elif instrument == 3:
				wave = noise.randf_range(-1.0, 1.0) * exp(-time * 110.0) + 0.18 * sin(phase * 0.5)
			elif instrument == 4:
				wave = 0.78 * sin(phase) + 0.16 * sin(phase * 3.0) * exp(-time * 18.0) + 0.06 * sin(phase * 5.0) * exp(-time * 28.0)
			samples[onset + index] += wave * envelope * amplitude
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for index in samples.size():
		bytes.encode_s16(index * 2, int(clampf(samples[index], -0.75, 0.75) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	stream.loop_mode = AudioStreamWAV.LOOP_DISABLED
	stream.data = bytes
	return stream

# Small observable state for automated pilot checks, never source/user content.
func debug_snapshot() -> Dictionary:
	var active := 0
	for voice in _voices:
		if voice.playing:
			active += 1
	var music_active := 0
	for player in _music_players:
		if player.playing:
			music_active += 1
	return {"muted": _muted, "scene": _scene_id, "phase": _phase, "track": _current_track, "requested_track": _requested_track, "playlist_index": _playlist_index, "music_playing": music_active > 0, "music_target_db": _target_music_db(), "music_level_db": _music_level_db, "music_player_count": _music_players.size(), "active_music_players": music_active, "music_starts": _music_starts, "crossfading": _fade_active, "mix_weights": _mix_weights.duplicate(), "narration_active": _narration_active, "pool_size": _voices.size(), "active_voices": active, "started_events": _started_events, "stopped": _stopped}

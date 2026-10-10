class_name AsterloomAudio
extends Node
## Offline pilot audio. Nothing plays until Sound is enabled or a saved enabled
## preference is restored. This node never downloads audio or owns narration.

signal mute_changed(muted: bool)
signal track_changed(title: String, artist: String)
signal preference_save_failed(error: int)

const SAMPLE_RATE := 24000
const VOICE_COUNT := 6
const TRACKS := {
	"wisdom": {"path": "res://audio/music/a-brand-new-wisdom.ogg", "title": "A Brand New Wisdom"},
	"saying": {"path": "res://audio/music/just-saying-tho.ogg", "title": "Just Saying Tho"},
	"winter": {"path": "res://audio/music/winter-dust.ogg", "title": "Winter Dust"}
}
const PLAYLISTS := {"network": ["winter", "wisdom", "saying"], "waterworks": ["wisdom", "saying", "winter"], "garden": ["saying", "winter", "wisdom"]}
const ROOTS := {"network": 220.0, "waterworks": 196.0, "garden": 261.6256}
const CUE_NAMES := ["pickup", "connect", "correct", "retry", "aster", "complete"]

# Override before add_child in an isolated test; normal pilot preferences are
# separate from Asterloom's Electron profile and contain only a mute boolean.
var settings_path := "user://pilot_audio.cfg"
var _muted := true
var _scene_id := "network"
var _age_group := "adult"
var _narration_active := false
var _focused := true
var _stopped := false
var _music: AudioStreamPlayer
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
	_music = AudioStreamPlayer.new()
	_music.name = "BackgroundMusic"
	_music.volume_db = -25.0
	_music.max_polyphony = 1
	add_child(_music)
	_music.finished.connect(_advance_track)
	for index in VOICE_COUNT:
		var voice := AudioStreamPlayer.new()
		voice.name = "CueVoice%d" % index
		voice.volume_db = -8.0
		voice.max_polyphony = 1
		add_child(voice)
		voice.finished.connect(_update_music_gain)
		_voices.append(voice)
	_build_cues()
	if not _muted:
		_start_music()

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
	_music.stop()
	if not _muted and not _stopped:
		_start_music()

func is_muted() -> bool:
	return _muted

func set_muted(value: bool) -> void:
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
			_music.stop()
		else:
			_start_music()
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
	var cooldown := 900 if event == "aster" else (70 if event == "pickup" else 130)
	if now - int(_last_event.get(event, -10000)) < cooldown:
		return false
	_last_event[event] = now
	if event in ["correct", "retry", "complete"]:
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
	if is_instance_valid(_music):
		_music.stop()
		_music.stream = null

func _exit_tree() -> void:
	stop_all()
	_cues.clear()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_focused = false
		_stop_cues()
		if is_instance_valid(_music):
			_music.stream_paused = true
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_focused = true
		if is_instance_valid(_music):
			_music.stream_paused = false

func _stop_cues() -> void:
	for voice in _voices:
		voice.stop()
		voice.stream = null
	_update_music_gain()

func _start_music() -> void:
	if not is_instance_valid(_music) or _muted or _stopped or _music.playing:
		return
	var playlist: Array = PLAYLISTS[_scene_id]
	var track_id: String = playlist[_playlist_index % playlist.size()]
	var track: Dictionary = TRACKS[track_id]
	var stream := load(String(track.path)) as AudioStreamOggVorbis
	if stream == null:
		push_warning("The bundled pilot recording is unavailable: " + track_id)
		return
	# Duplicate only the resource configuration, keep original recorded samples.
	stream = stream.duplicate() as AudioStreamOggVorbis
	stream.loop = false
	_music.stream = stream
	_music.volume_db = _target_music_db()
	_current_track = track_id
	_music.play()
	_music.stream_paused = not _focused
	track_changed.emit(String(track.title), "hernandack")

func _advance_track() -> void:
	if _muted or _stopped:
		return
	_playlist_index += 1
	_start_music()

func _target_music_db() -> float:
	var level := -28.0 if _age_group in ["3-5", "6-8"] else -25.0
	if _narration_active:
		return level - 20.0
	for voice in _voices:
		if voice.playing and voice.get_meta("cue", "") in ["aster", "correct", "complete"]:
			return level - 5.0
	return level

func _update_music_gain() -> void:
	if not is_instance_valid(_music) or not is_inside_tree():
		return
	if is_instance_valid(_gain_tween):
		_gain_tween.kill()
	_gain_tween = create_tween()
	_gain_tween.tween_property(_music, "volume_db", _target_music_db(), 0.16)

func _build_cues() -> void:
	_cues.clear()
	var root: float = ROOTS[_scene_id]
	var material := 1 if _scene_id == "network" else (2 if _scene_id == "waterworks" else 0)
	# Each row is offset seconds, pitch/root, duration seconds, amplitude,
	# instrument (0 felt, 1 glass, 2 droplet, 3 short mechanical click).
	var plans := {
		"pickup": [[0.0, 3.0, 0.13, 0.23, material], [0.018, 1.0, 0.05, 0.08, 3]],
		"connect": [[0.0, 1.0, 0.045, 0.13, 3], [0.035, 2.0, 0.22, 0.20, material], [0.065, 3.0, 0.19, 0.12, 0]],
		"correct": [[0.0, 1.0, 0.34, 0.16, 0], [0.02, 2.0, 0.29, 0.17, material], [0.15, 2.5, 0.36, 0.18, material], [0.30, 3.0, 0.55, 0.18, material]],
		"retry": [[0.0, 2.0, 0.27, 0.15, 0], [0.16, 1.5, 0.38, 0.16, 0]],
		"aster": [[0.0, 2.0, 0.36, 0.12, 1], [0.13, 3.0, 0.47, 0.15, 1]],
		"complete": [[0.0, 1.0, 0.67, 0.14, 0], [0.0, 2.0, 0.40, 0.16, material], [0.16, 2.5, 0.40, 0.17, material], [0.32, 3.0, 0.50, 0.18, material], [0.52, 4.0, 0.70, 0.15, 1]]
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
	return {"muted": _muted, "scene": _scene_id, "track": _current_track, "playlist_index": _playlist_index, "music_playing": is_instance_valid(_music) and _music.playing, "music_target_db": _target_music_db(), "narration_active": _narration_active, "pool_size": _voices.size(), "active_voices": active, "started_events": _started_events, "stopped": _stopped}

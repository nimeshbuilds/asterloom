extends Node
## The shipped presentation library is decorative fiction. Learning evidence,
## scoring and source media remain owned by the validated mission and board.
const MANIFEST_PATH := "res://presentation/generated/manifest.json"
var settings_path := "user://native_presentation.cfg"
var manifest: Dictionary = {}
var recipe: Dictionary = {}
var mission: Dictionary = {}
var age_group := "adult"
var age_settings: Dictionary = {}
var direction: Dictionary = {}
var phase := "study"
var muted := true
var reduced_motion := false
var narration_active := false
var focused := true
var _music: AudioStreamPlayer
var _voices: Array[AudioStreamPlayer] = []
var _track_id := ""
var _profile_id := ""
var _artwork_id := ""
var _effect_policy := "standard"
var _banner: PanelContainer
var _sound_button: CheckButton
var _motion_button: CheckButton
var _music_label: Label
var _feedback_label: Label
var _feedback_tween: Tween
var _last_cue_ms := -1000
var _started_cues := 0
var _music_starts := 0

func _ready() -> void:
	if FileAccess.file_exists(MANIFEST_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
		if parsed is Dictionary and parsed.get("version", 0) == 1:
			manifest = parsed
	var preferences := ConfigFile.new()
	if preferences.load(settings_path) == OK:
		muted = preferences.get_value("presentation", "muted", true) != false
		reduced_motion = preferences.get_value("presentation", "reduced_motion", false) == true
	_music = AudioStreamPlayer.new()
	_music.name = "PreparedWorldScore"
	add_child(_music)
	for i in 3:
		var voice := AudioStreamPlayer.new()
		voice.name = "WorldCue%d" % i
		add_child(voice)
		_voices.append(voice)

func configure(next_recipe: Dictionary, next_mission: Dictionary, next_age: String) -> void:
	recipe = manifest.get("recipes", {}).get(str(next_recipe.get("id", next_mission.get("scaffoldId", ""))), {})
	mission = next_mission
	age_group = next_age
	var ages: Dictionary = recipe.get("ages", {})
	age_settings = ages.get(age_group, ages.values()[0] if not ages.is_empty() else {})
	var requested: Variant = mission.get("audioDirection", {})
	direction = requested if _valid_direction(requested) else {}
	_profile_id = str(direction.get("effectProfileId", recipe.get("id", "")))
	_effect_policy = str(direction.get("effects", "standard"))
	_artwork_id = str(age_settings.get("artwork", ""))
	var story: Dictionary = mission.get("story", {})
	var saved_art: Variant = story.get("artwork", {})
	var saved_id := str(saved_art.get("id", "")) if saved_art is Dictionary else ""
	if age_settings.get("eligibleArtwork", []).has(saved_id):
		_artwork_id = saved_id
	else:
		for eligible in age_settings.get("eligibleArtwork", []):
			var world_name: String = manifest.get("worlds", {}).get(eligible, {}).get("name", "")
			var setting := str(story.get("setting", ""))
			if not world_name.is_empty() and (setting == world_name or setting.begins_with(world_name + ": ")):
				_artwork_id = eligible
	_request_music()

func _valid_direction(value: Variant) -> bool:
	if not value is Dictionary or value.get("version", 0) != 1 or not ["standard", "quiet", "off"].has(value.get("effects", "")):
		return false
	for key in value:
		if not ["version", "playTrackId", "studyTrackId", "effectProfileId", "effects"].has(key):
			return false
	return age_settings.get("playTracks", []).has(value.get("playTrackId")) and age_settings.get("studyTracks", []).has(value.get("studyTrackId")) and age_settings.get("effectProfiles", []).has(value.get("effectProfileId"))

func _texture(asset_path: String) -> Texture2D:
	if asset_path.begins_with("res://presentation/generated/") and ResourceLoader.exists(asset_path):
		return load(asset_path) as Texture2D
	return null

func create_banner() -> Control:
	_banner = PanelContainer.new()
	_banner.name = "AuthoredWorldPresentation"
	_banner.custom_minimum_size = Vector2(0, 206)
	_banner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_banner.clip_contents = true
	var frame := StyleBoxFlat.new()
	frame.bg_color = Color("142a35")
	frame.border_color = Color(age_settings.get("palette", {}).get("accent", "#8dd9d7"))
	frame.set_border_width_all(2)
	frame.set_corner_radius_all(12)
	_banner.add_theme_stylebox_override("panel", frame)
	var background := TextureRect.new()
	background.name = "ExistingWorldArtwork"
	background.texture = _texture(str(manifest.get("worlds", {}).get(_artwork_id, {}).get("path", "")))
	background.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	background.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_banner.add_child(background)
	var shade := ColorRect.new()
	shade.color = Color(0.025, 0.055, 0.08, 0.77)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_banner.add_child(shade)
	var margin := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + edge, 16)
	_banner.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	margin.add_child(row)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 6)
	row.add_child(column)
	var setting := Label.new()
	setting.name = "WorldHeading"
	setting.text = str(manifest.get("worlds", {}).get(_artwork_id, {}).get("name", recipe.get("name", "Learning studio")))
	setting.add_theme_font_size_override("font_size", 27)
	setting.add_theme_color_override("font_color", Color("fffaf1"))
	setting.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(setting)
	var subtitle := Label.new()
	var story: Dictionary = mission.get("story", {})
	subtitle.text = str(story.get("role", recipe.get("world", {}).get("domain", "Explore the material"))).capitalize()
	subtitle.add_theme_color_override("font_color", Color("e4edf2"))
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(subtitle)
	var controls := HBoxContainer.new()
	controls.add_theme_constant_override("separation", 12)
	column.add_child(controls)
	_sound_button = CheckButton.new()
	_sound_button.text = "Sound"
	_sound_button.button_pressed = not muted
	_sound_button.toggled.connect(func(enabled: bool): set_muted(not enabled))
	controls.add_child(_sound_button)
	_motion_button = CheckButton.new()
	_motion_button.text = "Reduced motion"
	_motion_button.button_pressed = reduced_motion
	_motion_button.toggled.connect(set_reduced_motion)
	controls.add_child(_motion_button)
	_music_label = Label.new()
	_music_label.add_theme_font_size_override("font_size", 14)
	_music_label.add_theme_color_override("font_color", Color("d5e6e9"))
	_music_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_music_label)
	_feedback_label = Label.new()
	_feedback_label.add_theme_font_size_override("font_size", 16)
	_feedback_label.add_theme_color_override("font_color", Color("fff1c5"))
	column.add_child(_feedback_label)
	var illustration := TextureRect.new()
	illustration.name = "ExistingScaffoldIllustration"
	illustration.texture = _texture(str(recipe.get("illustration", "")))
	illustration.custom_minimum_size = Vector2(230, 150)
	illustration.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	illustration.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	illustration.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(illustration)
	_update_label()
	return _banner

func set_phase(value: String) -> void:
	if not ["study", "play"].has(value):
		return
	phase = value
	_request_music()

func _requested_track() -> String:
	return str(direction.get("studyTrackId" if phase == "study" else "playTrackId", age_settings.get("defaultStudy" if phase == "study" else "defaultPlay", "")))

func _request_music() -> void:
	if not is_instance_valid(_music):
		return
	var requested := _requested_track()
	if muted or not focused or requested.is_empty():
		_music.stop()
		_track_id = ""
		_update_label()
		return
	if requested != _track_id or not _music.playing:
		var data: Dictionary = manifest.get("tracks", {}).get(requested, {})
		var resource_path := str(data.get("path", ""))
		if not resource_path.begins_with("res://presentation/generated/") or not ResourceLoader.exists(resource_path):
			return
		var stream := load(resource_path) as AudioStream
		if stream == null:
			return
		stream = stream.duplicate() as AudioStream
		if stream is AudioStreamWAV:
			stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
			stream.loop_begin = 0
			stream.loop_end = roundi(stream.get_length() * stream.mix_rate)
		elif stream is AudioStreamOggVorbis:
			stream.loop = true
		_music.stream = stream
		_track_id = requested
		_music.play()
		_music_starts += 1
	_update_level()
	_update_label()

func _update_level() -> void:
	if not is_instance_valid(_music):
		return
	var data: Dictionary = manifest.get("tracks", {}).get(_track_id, {})
	var level := -12.0 if data.get("kind") == "interactive" else -26.0
	level += -5.0 if phase == "study" else 0.0
	level += -3.0 if age_group in ["3-5", "6-8"] else 0.0
	level += -20.0 if narration_active else 0.0
	_music.volume_db = level + linear_to_db(maxf(0.01, float(data.get("gain", 1.0))))

func _update_label() -> void:
	if is_instance_valid(_music_label):
		var data: Dictionary = manifest.get("tracks", {}).get(_requested_track(), {})
		_music_label.text = ("Sound off · " if muted else "Playing · ") + str(data.get("name", "Prepared world score"))

func set_muted(value: bool) -> void:
	muted = value
	for voice in _voices:
		voice.stop()
	if is_instance_valid(_sound_button):
		_sound_button.set_pressed_no_signal(not muted)
	_save_preferences()
	_request_music()

func set_reduced_motion(value: bool) -> void:
	reduced_motion = value
	if is_instance_valid(_feedback_tween):
		_feedback_tween.kill()
	if is_instance_valid(_banner):
		_banner.modulate = Color.WHITE
	if is_instance_valid(_motion_button):
		_motion_button.set_pressed_no_signal(value)
	_save_preferences()

func _save_preferences() -> void:
	var preferences := ConfigFile.new()
	preferences.set_value("presentation", "muted", muted)
	preferences.set_value("presentation", "reduced_motion", reduced_motion)
	if preferences.save(settings_path) != OK:
		push_warning("Presentation preferences could not be saved.")

func set_narration_active(value: bool) -> void:
	narration_active = value
	if value:
		for voice in _voices:
			voice.stop()
	_update_level()

func play_cue(event: String) -> bool:
	if event in ["success", "retry", "complete"] and is_instance_valid(_feedback_label):
		_feedback_label.text = "A new path to explore" if event == "retry" else ("Chapter complete" if event == "complete" else "Your work connects")
		if not reduced_motion and is_instance_valid(_banner):
			if is_instance_valid(_feedback_tween):
				_feedback_tween.kill()
			_banner.modulate = Color(1.12, 1.12, 1.06)
			_feedback_tween = create_tween()
			_feedback_tween.tween_property(_banner, "modulate", Color.WHITE, 0.4)
	if muted or not focused or narration_active or _effect_policy == "off":
		return false
	var now := Time.get_ticks_msec()
	if now - _last_cue_ms < 65:
		return false
	var age_key := "young" if age_group in ["3-5", "6-8"] else "standard"
	var cue: Dictionary = manifest.get("effects", {}).get(_profile_id, {}).get(age_key, {}).get(event, {})
	var resource_path := str(cue.get("path", ""))
	if not resource_path.begins_with("res://presentation/generated/") or not ResourceLoader.exists(resource_path):
		return false
	if event in ["success", "retry", "complete"]:
		for voice in _voices:
			voice.stop()
	for voice in _voices:
		if not voice.playing:
			voice.stream = load(resource_path) as AudioStream
			if voice.stream == null:
				return false
			voice.volume_db = (-8.0 if _effect_policy == "quiet" else -2.0) - (3.0 if age_key == "young" else 0.0)
			voice.play()
			_last_cue_ms = now
			_started_cues += 1
			return true
	return false

func stop_all() -> void:
	if is_instance_valid(_music):
		_music.stop()
		_music.stream = null
	for voice in _voices:
		voice.stop()
		voice.stream = null
	_track_id = ""

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		focused = false
		stop_all()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		focused = true
		_request_music()

func debug_snapshot() -> Dictionary:
	var playing := 0
	for voice in _voices:
		if voice.playing:
			playing += 1
	return {"recipe": recipe.get("id", ""), "artwork": _artwork_id, "requested_track": _requested_track(), "track": _track_id, "music_playing": is_instance_valid(_music) and _music.playing, "music_starts": _music_starts, "muted": muted, "reduced_motion": reduced_motion, "effect_profile": _profile_id, "effects": _effect_policy, "cue_count": _started_cues, "active_voices": playing, "phase": phase, "narration_active": narration_active, "directed": not direction.is_empty()}

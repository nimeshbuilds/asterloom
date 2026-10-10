extends SceneTree
const Presentation = preload("res://presentation/world_presentation.gd")
var failures: Array[String] = []
var checked := 0
func check(value: bool, message: String) -> void:
	checked += 1
	if not value:
		failures.append(message)
func _init() -> void:
	call_deferred("run")
func run() -> void:
	var presentation = Presentation.new()
	presentation.settings_path = "user://presentation-test-%s.cfg" % Time.get_ticks_usec()
	root.add_child(presentation)
	await process_frame
	check(presentation.manifest.get("recipes", {}).size() == 75, "Every recipe has a prepared world")
	check(presentation.muted, "First playback requires sound opt-in")
	var holder := Control.new()
	holder.size = Vector2(1024, 240)
	root.add_child(holder)
	var loaded_tracks := {}
	for id in presentation.manifest.get("recipes", {}):
		var recipe: Dictionary = presentation.manifest.recipes[id]
		var age: String = recipe.ages.keys()[0]
		presentation.configure({"id": id}, {}, age)
		var banner: Control = presentation.create_banner()
		holder.add_child(banner)
		banner.size = Vector2(1024, 220)
		var art := banner.find_child("ExistingWorldArtwork", true, false) as TextureRect
		var illustration := banner.find_child("ExistingScaffoldIllustration", true, false) as TextureRect
		check(art != null and art.texture != null and art.texture.get_width() > 0, id + " world pixels load")
		check(illustration != null and illustration.texture != null and illustration.texture.get_width() > 0, id + " recipe SVG loads")
		check(banner.find_child("WorldHeading", true, false) != null, id + " readable heading")
		var track: String = recipe.ages[age].defaultPlay
		loaded_tracks[track] = true
		var stream := load(presentation.manifest.tracks[track].path) as AudioStreamWAV
		check(stream != null and stream.get_length() > 10 and stream.data.size() > 1000, id + " actual PCM score loads")
		holder.remove_child(banner)
		banner.free()
	check(loaded_tracks.size() == 75, "Every recipe retains its distinct prepared score")
	presentation.configure({"id": "concept-map-repair"}, {}, "adult")
	var settings: Dictionary = presentation.age_settings
	var directed := {"version": 1, "playTrackId": settings.playTracks[settings.playTracks.size() - 1], "studyTrackId": settings.studyTracks[0], "effectProfileId": settings.effectProfiles[0], "effects": "quiet"}
	presentation.configure({"id": "concept-map-repair"}, {"audioDirection": directed}, "adult")
	check(presentation.debug_snapshot().directed, "Compatible saved audio direction is retained")
	presentation.set_muted(false)
	await create_timer(0.06).timeout
	presentation.set_phase("play")
	await create_timer(0.06).timeout
	var snapshot: Dictionary = presentation.debug_snapshot()
	check(snapshot.track == directed.playTrackId and snapshot.music_playing, "Directed gameplay stream really starts")
	var starts: int = snapshot.music_starts
	presentation.configure({"id": "concept-map-repair"}, {"audioDirection": directed}, "adult")
	check(presentation.debug_snapshot().music_starts == starts, "Redraw does not restart music")
	presentation.set_phase("study")
	await create_timer(0.06).timeout
	check(presentation.debug_snapshot().track == directed.studyTrackId, "Study uses the saved study piece")
	check(presentation.play_cue("success"), "Real success cue starts")
	await create_timer(0.06).timeout
	check(presentation.debug_snapshot().active_voices > 0, "Cue has a live native player")
	presentation.set_narration_active(true)
	check(not presentation.play_cue("retry") and presentation.debug_snapshot().active_voices == 0, "Narration suppresses cues")
	presentation.set_narration_active(false)
	presentation.set_muted(true)
	check(not presentation.debug_snapshot().music_playing and not presentation.play_cue("place"), "Mute stops music and cues")
	presentation.set_reduced_motion(true)
	check(presentation.debug_snapshot().reduced_motion, "Reduced motion is applied")
	var invalid := directed.duplicate()
	invalid.playTrackId = "../../untrusted.wav"
	presentation.configure({"id": "concept-map-repair"}, {"audioDirection": invalid}, "adult")
	check(not presentation.debug_snapshot().directed and presentation.debug_snapshot().requested_track == settings.defaultStudy, "Invalid direction falls back to shipped recipe choices")
	var restored = Presentation.new()
	restored.settings_path = presentation.settings_path
	root.add_child(restored)
	await process_frame
	check(restored.muted and restored.reduced_motion, "Sound and motion preferences persist")
	presentation.apply_launch_preferences(PackedStringArray(["--music-enabled=false","--effects-enabled=true","--music-volume=0.3","--effects-volume=0.4","--reduced-motion=false"]))
	check(not presentation.music_enabled and presentation.effects_enabled and not presentation.muted, "Desktop effects-only preference is independent of music")
	check(is_equal_approx(presentation.music_volume,0.3) and is_equal_approx(presentation.effects_volume,0.4), "Desktop mix volumes reach native playback")
	check(not presentation.debug_snapshot().music_playing and presentation.play_cue("place"), "Effects-only native playback starts a cue without music")
	await create_timer(0.06).timeout
	presentation.set_audio_enabled("effects",false); presentation.set_audio_enabled("music",true)
	check(presentation.debug_snapshot().music_playing and not presentation.play_cue("place"), "Music-only playback suppresses action sounds")
	presentation.apply_launch_preferences(PackedStringArray(["--music-volume=0","--effects-enabled=true","--effects-volume=0"]))
	check(not presentation.debug_snapshot().music_playing and not presentation.play_cue("place"), "Zero volumes silence their players")
	DirAccess.remove_absolute(presentation.settings_path)
	print(JSON.stringify({"checks": checked, "failures": failures, "distinct_recipe_scores": loaded_tracks.size()}))
	presentation.stop_all()
	restored.stop_all()
	presentation.queue_free()
	restored.queue_free()
	holder.queue_free()
	call_deferred("finish")

func finish() -> void:
	# Give the audio mixer a real callback boundary to release stopped playbacks.
	await create_timer(0.15).timeout
	quit(0 if failures.is_empty() else 1)

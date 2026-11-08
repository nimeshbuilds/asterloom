extends SceneTree
## Isolated, release-safe lifecycle test. No files, profiles, audio or provider calls.
const World = preload("res://presentation/WorldPresentation.gd")
var checks := 0
var failed := false
var events := 0

func _initialize() -> void: call_deferred("run")

func require(value: bool, label: String) -> bool:
	if not value:
		failed = true; push_error("PRESENTATION_CHECK_FAILED "+label); quit(1); return false
	checks += 1; return true

func run() -> void:
	var fingerprints: Array = []
	for setting in ["network","garden","archive"]:
		var world = World.new(); root.add_child(world)
		world.configure({"setting":setting,"cast":[{"id":"aster","name":"Aster","role":"Fictional learning guide","color":"#b59adb"}]})
		world.event_presented.connect(func(_event: String): events+=1)
		await process_frame
		if not require(world.snapshot().setting == setting,"selected setting"): return
		if not require(world.cast.size() == 3,"bounded cast"): return
		if not require(world.cast.builder.display_name == "Owen" and world.cast.analyst.display_name == "Claire","authored cast identities"): return
		if not require(world.snapshot().sceneryMeshes < 150,"bounded scenic mesh count"): return
		if not require(world.snapshot().ambientParticles == 12,"bounded CPU particles"): return
		fingerprints.append(world.snapshot().sceneryMeshes)
		for id in ["aster","builder","analyst"]:
			var actor = world.cast[id]
			if not require(actor.get_node("GuideInteraction").get_meta("action") == {"type":"character","id":id},"character interaction metadata"): return
			if not require(actor.position != Vector3.ZERO,"authored guide position"): return
		world.set_phase("building")
		if not require(world.phase == "building" and world.cast.builder.current_pose == "attention","phase directs attention"): return
		var changes: int = world.snapshot().phaseChanges
		world.set_phase("building")
		if not require(world.snapshot().phaseChanges == changes,"same phase is idempotent"): return
		world.set_character_speaking("aster",true)
		if not require(world.cast.aster.speaking and world.cast.aster.current_pose == "speaking","speaking pose"): return
		world.set_phase("learning")
		if not require(not world.cast.aster.speaking,"phase change closes speaking pose"): return
		world.set_phase("building")
		var pose_tween: Tween = world.cast.builder._pose_tween
		world.set_reduced_motion(false)
		if not require(pose_tween == world.cast.builder._pose_tween and pose_tween.is_running(),"unchanged motion preference preserves pose transition"): return
		world.set_character_speaking("aster",false)
		world.react("placed",Vector3(-2,1,-2))
		if not require(world.effects.get_child_count() == 1,"placed effect at actual event"): return
		if not require(world.effects.get_child(0).position.is_equal_approx(Vector3(-2,1.14,-2)),"effect anchored to caller position"): return
		for i in range(10): world.react("connected",Vector3(i,0,0))
		if not require(world.effects.get_child_count() == 6,"effect pool bounded"): return
		world.set_reduced_motion(true)
		if not require(world.effects.get_child_count() == 0 and not world.ambient.visible and not world.ambient.emitting,"reduced motion immediately stops effects"): return
		world.react("retry",world.character_position("aster"))
		if not require(world.cast.aster.current_pose == "support" and world.effects.get_child_count()==0,"static encouraging retry pose"): return
		var body_position: Vector3 = world.cast.aster.body.position
		var arm_rotation: Vector3 = world.cast.aster.right_arm.rotation
		await create_timer(0.04).timeout
		if not require(body_position == world.cast.aster.body.position and arm_rotation == world.cast.aster.right_arm.rotation,"reduced motion static"): return
		var prior_events := events
		world.set_progress(1,2)
		if not require(world.snapshot().completed==1 and world.snapshot().total==2,"persistent world progress"): return
		if not require(events==prior_events and world.effects.get_child_count()==0,"restore progress never replays reward"): return
		if not require(world.snapshot().restorationFeatures>0,"authored restoration features"): return
		world.set_progress(1,2)
		world.set_phase("nonsense")
		world.react("nonsense",Vector3.ZERO)
		world.react("success",Vector3(INF,0,0))
		if not require(events==prior_events and world.phase=="building","invalid events are inert"): return
		world.configure({"setting":setting})
		await process_frame
		if not require(world.cast.size()==3 and world.snapshot().completed==1,"reconfigure preserves progress and bounded cast"): return
		world.queue_free(); await process_frame
	if not require(fingerprints[0]!=fingerprints[1] and fingerprints[1]!=fingerprints[2],"distinct authored geometry"): return
	print("PRESENTATION_LIFECYCLE_PASS checks=",checks)
	quit(0)

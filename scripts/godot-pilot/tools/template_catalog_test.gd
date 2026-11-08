extends SceneTree
var failures: Array[String] = []
var count := 0
const Catalog = preload("res://scripts/template_catalog.gd")
func check(ok: bool, message: String) -> void:
	count+=1
	if not ok: failures.append(message); push_error(message)
func _initialize() -> void:
	var pack: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/source.json"))
	var original := JSON.stringify(pack)
	var legacy := Catalog.resolve_pack(pack)
	if not legacy.ok:
		push_error(legacy.error);quit(1);return
	check(legacy.ok and legacy.legacy and legacy.profile.id=="signalwright-workshop","Legacy default")
	check(JSON.stringify(pack)==original,"Legacy input unchanged")
	for id in Catalog.IDS:
		var candidate := pack.duplicate(true)
		candidate.presentation={"version":1,"templateId":id}
		var resolved := Catalog.resolve_pack(candidate)
		check(resolved.ok and not resolved.legacy and resolved.profile.id==id,"Explicit template "+id)
		check(resolved.profile.cast[0].id=="aster" and resolved.profile.cast[1].id=="builder" and resolved.profile.cast[2].id=="analyst","Trusted cast "+id)
		candidate.erase("dependency")
		check(Catalog.resolve_pack(candidate).ok,"Sequence-only "+id)
	for invalid in [null,{"version":2,"templateId":"signalwright-workshop"},{"version":1,"templateId":"unknown"},{"version":1,"templateId":"signalwright-workshop","scene":"res://evil.gd"}]:
		var candidate := pack.duplicate(true); candidate.presentation=invalid
		check(not Catalog.resolve_pack(candidate).ok,"Invalid selector rejected")
	var oversized := pack.duplicate(true);oversized.sequence.items.resize(9)
	check(not Catalog.resolve_pack(oversized).ok,"Bounds rejected")
	var wrong := pack.duplicate(true);wrong.sequence.kind="classification"
	check(not Catalog.resolve_pack(wrong).ok,"Kind rejected")
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/templates.json"))
	data.templates[0].cast[0].scene="res://evil.gd"
	check(not Catalog.validate_catalog(data).ok,"No cast extension")
	data=JSON.parse_string(FileAccess.get_file_as_string("res://data/templates.json"));data.templates[0].accessibility.flashing=true
	check(not Catalog.validate_catalog(data).ok,"Accessibility budget")
	print(JSON.stringify({"passed":failures.is_empty(),"checks":count,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

extends RefCounted
class_name PilotTemplateCatalog

const IDS := ["signalwright-workshop", "restoration-field-station", "archive-investigation"]
const CAST_IDS := ["aster", "builder", "analyst"]
const BUDGET := {"minFontSize":18,"maxActiveCharacters":3,"seatedControls":true,"reducedMotion":true,"flashing":false,"timers":false}
const SLOTS := ["lessons","sequence.items","dependency.nodes","activityEvidence"]

static func _failure(message: String) -> Dictionary:
	return {"ok":false,"profile":{},"error":message,"legacy":false}

static func _keys(value: Variant, expected: Array) -> bool:
	if not value is Dictionary or value.size() != expected.size(): return false
	for key in expected:
		if not value.has(key): return false
	return true

static func _text(value: Variant, maximum: int) -> bool:
	if not value is String or value.strip_edges().is_empty() or value.to_utf16_buffer().size()/2 > maximum: return false
	for character in value:
		if character.unicode_at(0)<32: return false
	return true

static func _color(value: Variant) -> bool:
	if not value is String or value.length()!=7 or not value.begins_with("#"): return false
	for character in value.substr(1).to_lower():
		if character not in "0123456789abcdef": return false
	return true

static func _version(value: Variant) -> bool:
	return typeof(value) in [TYPE_INT,TYPE_FLOAT] and value==1

# Only application-authored data is loaded here. Pack text can select an ID but
# cannot supply a replacement profile, resource path, shader, scene or character.
static func validate_catalog(value: Variant) -> Dictionary:
	if not _keys(value,["version","templates"]) or not _version(value.version) or not value.templates is Array or value.templates.size()!=IDS.size():
		return _failure("Unsupported presentation catalog.")
	var profiles: Dictionary = {}
	for profile in value.templates:
		if not _keys(profile,["id","version","name","fictional","setting","compatibleKinds","cast","briefing","acts","palette","lighting","audioProfile","accessibility","contentSlots"]): return _failure("Unsupported catalog fields.")
		if profile.id not in IDS or profiles.has(profile.id) or not _version(profile.version) or not profile.fictional is bool or not profile.fictional or profile.setting not in ["network","garden","archive"] or profile.audioProfile!=profile.setting: return _failure("Unsupported template identity.")
		if not _text(profile.name,80) or profile.compatibleKinds != ["sequence","dependency"]: return _failure("Unsupported template mechanics.")
		if not profile.cast is Array or profile.cast.size()!=3: return _failure("Unsupported cast.")
		for index in range(3):
			var member: Variant = profile.cast[index]
			if not _keys(member,["id","name","role","color"]) or member.id!=CAST_IDS[index] or not _text(member.name,32) or not _text(member.role,80) or not _color(member.color): return _failure("Unsupported cast member.")
		if not _keys(profile.briefing,["title","text"]) or not _text(profile.briefing.title,100) or not _text(profile.briefing.text,600): return _failure("Invalid authored briefing.")
		if not _keys(profile.acts,["briefing","learning","building","challenge","debrief"]): return _failure("Invalid act names.")
		for title in profile.acts.values():
			if not _text(title,80): return _failure("Invalid act title.")
		if not _keys(profile.palette,["background","floor","structure","accent","secondary","text"]): return _failure("Invalid palette.")
		for color in profile.palette.values():
			if not _color(color): return _failure("Invalid palette color.")
		if not _keys(profile.lighting,["ambientEnergy","keyEnergy","keyColor"]) or not _color(profile.lighting.keyColor): return _failure("Invalid lighting.")
		for key in ["ambientEnergy","keyEnergy"]:
			if typeof(profile.lighting[key]) not in [TYPE_INT,TYPE_FLOAT] or not is_finite(profile.lighting[key]): return _failure("Invalid lighting level.")
		if profile.lighting.ambientEnergy<0.4 or profile.lighting.ambientEnergy>0.9 or profile.lighting.keyEnergy<0.8 or profile.lighting.keyEnergy>2: return _failure("Lighting exceeds the comfort budget.")
		if not _keys(profile.accessibility,BUDGET.keys()) or profile.contentSlots!=SLOTS: return _failure("Unsupported content or accessibility budget.")
		for key in BUDGET:
			var actual: Variant = profile.accessibility[key]
			if BUDGET[key] is bool and not actual is bool: return _failure("Invalid accessibility flag.")
			if BUDGET[key] is int and typeof(actual) not in [TYPE_INT,TYPE_FLOAT]: return _failure("Invalid accessibility bound.")
			if actual!=BUDGET[key]: return _failure("Unsupported accessibility budget.")
		profiles[profile.id]=profile.duplicate(true)
	return {"ok":true,"profiles":profiles,"error":""}

static func resolve_pack(pack: Dictionary) -> Dictionary:
	var catalog := validate_catalog(JSON.parse_string(FileAccess.get_file_as_string("res://data/templates.json")))
	if not catalog.ok: return _failure(catalog.error)
	var legacy := not pack.has("presentation")
	var template_id := "signalwright-workshop"
	if not legacy:
		var presentation: Variant = pack.presentation
		if not _keys(presentation,["version","templateId"]) or not _version(presentation.version) or not presentation.templateId is String or presentation.templateId not in IDS: return _failure("Choose a shipped template with a supported presentation version.")
		template_id=presentation.templateId
	var count := 0
	for kind in ["sequence","dependency"]:
		if not pack.has(kind): continue
		count+=1
		var activity: Variant = pack[kind]
		if not activity is Dictionary or activity.get("kind")!=kind: return _failure("The template does not support this activity kind.")
		var items: Variant = activity.get("items" if kind=="sequence" else "nodes")
		var rules: Variant = activity.get("constraints" if kind=="sequence" else "edges")
		if not items is Array or items.size()<2 or items.size()>8 or not rules is Array or rules.size()<1 or rules.size()>12: return _failure("The construction exceeds this template's fixed bounds.")
	if count==0: return _failure("The template requires a sequence or dependency construction.")
	return {"ok":true,"profile":catalog.profiles[template_id].duplicate(true),"error":"","legacy":legacy}

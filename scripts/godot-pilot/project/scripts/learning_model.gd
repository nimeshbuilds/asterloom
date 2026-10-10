extends RefCounted
class_name PilotLearningModel

var pack: Dictionary = {}
var state: Dictionary = {}
var save_path := "user://pilot-progress-v1.json"
var last_error := ""
var fail_save_for_test := false

func initialize(data: Dictionary, path: String = "") -> bool:
	if not path.is_empty(): save_path = path
	pack = data.duplicate(true)
	if data.get("format") != "asterloom-godot-pilot" or data.get("version") != 1:
		last_error = "Unsupported learning package."
		return false
	if data.get("audience", "adult") != "adult":
		last_error = "This workshop presentation supports adults only."
		return false
	var sources: Array = data.get("sources", [data.get("source", {})])
	if sources.is_empty(): return false
	var source_ids: Array = []
	for source in sources:
		if not source is Dictionary or not source.get("id") is String or not source.get("text") is String or source.id in source_ids: return false
		source_ids.append(source.id)
		if source.has("revision") and source.revision != source.text.sha256_text():
			last_error = "A source revision does not match its bytes."
			return false
	if data.get("lessons", []).is_empty(): return false
	for lesson in data.get("lessons", []):
		if not lesson is Dictionary or not lesson.get("body") is String or not lesson.get("title") is String: return false
		if lesson.has("citations"):
			if lesson.citations.is_empty(): return false
			for citation in lesson.citations:
				if not valid_citation(citation): return false
		else:
			if lesson.get("quote", "").is_empty() or not sources[0].text.contains(lesson.quote):
				last_error = "A lesson citation does not match the source."
				return false
	var count := 0
	for kind in ["sequence", "dependency"]:
		if not data.has(kind): continue
		count += 1
		if not data[kind] is Dictionary: return false
		var activity: Dictionary = data[kind]
		if activity.get("kind") != kind or activity.get("reviewStatus") not in ["reviewed","needs-review"]: return false
		if activity.reviewStatus == "needs-review" and not is_experimental():
			last_error = "Unreviewed models require explicit experimental practice."
			return false
		var items: Array = activity.get("items", []) if kind == "sequence" else activity.get("nodes", [])
		if items.size() < 2 or items.size() > 8: return false
		var ids: Array = []
		for item in items:
			if not item is Dictionary or not item.get("id") is String or item.id.is_empty() or item.id in ids or not item.get("label") is String or item.label.is_empty() or item.label.length()>200: return false
			ids.append(item.id)
		var signatures: Array = []
		var rules: Array = activity.get("constraints",[]) if kind == "sequence" else activity.get("edges",[])
		if rules.is_empty() or rules.size()>12: return false
		for rule in rules:
			if not rule is Dictionary: return false
			var from: String = rule.get("before", "") if kind == "sequence" else rule.get("from", "")
			var to: String = rule.get("after", "") if kind == "sequence" else rule.get("to", "")
			if from not in ids or to not in ids: return false
			if kind == "dependency" and (not rule.get("relation") is String or rule.relation.is_empty() or rule.relation.length()>200): return false
			var signature := JSON.stringify([from,to,rule.get("relation","")])
			if signature in signatures: return false
			signatures.append(signature)
		if kind == "sequence" or activity.get("acyclic",false):
			var remaining: Array = ids.duplicate()
			while not remaining.is_empty():
				var removed := false
				for id in remaining.duplicate():
					var incoming := false
					for rule in rules:
						var from: String = rule.get("before", "") if kind == "sequence" else rule.from
						var to: String = rule.get("after", "") if kind == "sequence" else rule.to
						if to == id and from in remaining: incoming = true
					if not incoming: remaining.erase(id); removed = true; break
				if not removed:
					last_error = "A model marked acyclic contains a cycle."
					return false
		if activity.get("sourceRefs",[]).is_empty(): return false
		for ref in activity.sourceRefs:
			var source := find_source(ref.get("sourceId", ""))
			if source.is_empty() or ref.get("evidence", "").is_empty() or not source.text.contains(ref.evidence):
				last_error = "An activity reference does not match the source."
				return false
	if count == 0: return false
	for entry in data.get("activityEvidence",[]):
		for citation in entry.get("citations",[]):
			if not valid_citation(citation): return false
	if path.is_empty(): save_path = "user://pilot-" + pack_hash().substr(0,24) + "-progress-v1.json"
	state = fresh_state()
	if FileAccess.file_exists(save_path):
		var saved = JSON.parse_string(FileAccess.get_file_as_string(save_path))
		if saved is Dictionary and saved.get("pack_hash") == pack_hash() and saved.get("state") is Dictionary:
			var candidate: Dictionary = saved.state
			if valid_state(candidate): state = candidate
	return true

func is_experimental() -> bool:
	var assessment: Dictionary = pack.get("assessment", {})
	return assessment.get("mode") == "experimental-practice" and assessment.get("mastery") == false and assessment.get("hostProgressWrites") == false

func find_source(id: String) -> Dictionary:
	for source in pack.get("sources", [pack.get("source", {})]):
		if source.get("id") == id: return source
	return {}

func valid_citation(ref: Dictionary) -> bool:
	var source := find_source(ref.get("sourceId", ""))
	if source.is_empty() or ref.get("sourceRevision") != source.text.sha256_text():
		last_error = "A citation belongs to a different source revision."
		return false
	if not ref.get("start") is float and not ref.get("start") is int: return false
	if not ref.get("end") is float and not ref.get("end") is int: return false
	var start := int(ref.start); var end := int(ref.end)
	var bytes: PackedByteArray = source.text.to_utf16_buffer()
	if start != ref.start or end != ref.end or start<0 or end<=start or end*2>bytes.size(): return false
	# Package ranges are JavaScript UTF-16 code units, not Godot characters.
	if bytes.slice(start*2,end*2).get_string_from_utf16() != ref.get("quote","") or ref.get("quote","").is_empty():
		last_error = "A citation does not match its exact source location."
		return false
	return true

func pack_hash() -> String:
	return JSON.stringify(pack).sha256_text()

func fresh_state() -> Dictionary:
	var slots: Array = []
	for _item in pack.get("sequence", {}).get("items", []): slots.append("")
	return {"lesson":0,"taught":false,"guided":false,"stage":"learn","order":slots,"edges":[],"supported":{"sequence":false,"dependency":false},"awards":{},"completions":[],"results":{},"attempts":{"sequence":0,"dependency":0},"xp":0,"reduced_motion":false,"revision":0}

func valid_state(s: Dictionary) -> bool:
	for key in fresh_state():
		if not s.has(key): return false
	if not s.attempts is Dictionary: return false
	if not s.order is Array or not s.edges is Array or not s.completions is Array or not s.awards is Dictionary or not s.results is Dictionary or not s.supported is Dictionary: return false
	var completed: Array = []
	for kind in s.completions:
		if kind not in ["sequence","dependency"] or not pack.has(kind) or kind in completed: return false
		completed.append(kind)
	var nodes: Array = []
	var relations: Array = []
	for node in pack.get("dependency",{}).get("nodes",[]): nodes.append(node.id)
	for edge in pack.get("dependency",{}).get("edges",[]): relations.append(edge.relation)
	var seen_edges: Array = []
	for edge in s.edges:
		if not edge is Dictionary or edge.get("from") not in nodes or edge.get("to") not in nodes or edge.get("relation") not in relations or edge in seen_edges: return false
		seen_edges.append(edge)
	if seen_edges.size()>12: return false
	for kind in s.results:
		if kind not in ["sequence","dependency"] or not pack.has(kind) or not s.results[kind] is Dictionary: return false
		var result: Dictionary = s.results[kind]
		if not result.get("correct") is bool or not result.get("details") is Array or not result.get("score") is float and not result.get("score") is int or not result.get("maxScore") is float and not result.get("maxScore") is int: return false
	for kind in ["sequence","dependency"]:
		if not s.supported.get(kind) is bool or not s.attempts.has(kind) or int(s.attempts[kind])<0: return false
	if not s.attempts is Dictionary or not s.supported is Dictionary: return false
	if s.order.size() != pack.get("sequence", {}).get("items", []).size(): return false
	if int(s.lesson) < 0 or int(s.lesson) > pack.get("lessons", []).size(): return false
	if s.guided and not s.taught: return false
	if s.stage not in ["learn", "practice", "quest"]: return false
	if s.stage == "quest" and not s.guided: return false
	var ids: Array = []
	for item in pack.get("sequence", {}).get("items", []): ids.append(item.id)
	var used: Array = []
	for id in s.order:
		if id != "" and (id not in ids or id in used): return false
		if id != "": used.append(id)
	var total := 0
	for kind in s.awards:
		if kind not in ["sequence", "dependency"] or int(s.awards[kind]) not in [20,40]: return false
		total += int(s.awards[kind])
	if int(s.xp) != total: return false
	return true

func commit(next: Dictionary) -> bool:
	last_error = ""
	if fail_save_for_test:
		last_error = "Progress could not be saved. Your previous result is safe. Try again."
		return false
	next.revision = int(state.revision) + 1
	var document := JSON.stringify({"format":"asterloom-pilot-progress","version":1,"pack_hash":pack_hash(),"state":next})
	var temporary := save_path + ".pending"
	var file := FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		last_error = "Progress could not be saved. Check available disk space and try again."
		return false
	file.store_string(document)
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK or FileAccess.get_file_as_string(temporary) != document:
		last_error = "The save could not be verified. No points were awarded."
		return false
	var error := DirAccess.rename_absolute(temporary, save_path)
	if error != OK:
		last_error = "The save could not be published. No points were awarded."
		return false
	state = next.duplicate(true)
	return true

func finish_idea() -> bool:
	var next := state.duplicate(true)
	next.lesson = mini(int(state.lesson) + 1, pack.lessons.size())
	if next.lesson == pack.lessons.size():
		next.taught = true
		next.stage = "practice"
	return commit(next)

func finish_guided() -> bool:
	if not state.taught: return false
	var next := state.duplicate(true)
	next.guided = true
	next.stage = "quest"
	return commit(next)

func mark_supported(kind: String) -> bool:
	var next := state.duplicate(true)
	next.supported[kind] = true
	return commit(next)

func set_motion(value: bool) -> bool:
	var next := state.duplicate(true)
	next.reduced_motion = value
	return commit(next)

func place_piece(id: String, slot: int) -> bool:
	if not pack.has("sequence") or slot < 0 or slot >= state.order.size(): return false
	var exists := false
	for item in pack.sequence.items:
		if item.id == id: exists = true
	if not exists: return false
	var next := state.duplicate(true)
	var old_slot: int = next.order.find(id)
	var displaced: String = next.order[slot]
	if old_slot == slot: return false
	if old_slot >= 0: next.order[old_slot] = displaced
	next.order[slot] = id
	next.results.erase("sequence")
	return commit(next)

func connect_nodes(from: String, to: String, relation: String) -> bool:
	if not pack.has("dependency"): return false
	var ids: Array = []
	var relations: Array = []
	for node in pack.dependency.nodes: ids.append(node.id)
	for edge in pack.dependency.edges:
		if edge.relation not in relations: relations.append(edge.relation)
	if from not in ids or to not in ids or relation not in relations or state.edges.size() >= 12: return false
	var edge := {"from":from,"to":to,"relation":relation}
	if edge in state.edges: return false
	var next := state.duplicate(true)
	next.edges.append(edge)
	next.results.erase("dependency")
	return commit(next)

func remove_edge(index: int) -> bool:
	if index < 0 or index >= state.edges.size(): return false
	var next := state.duplicate(true)
	next.edges.remove_at(index)
	next.results.erase("dependency")
	return commit(next)

func label(kind: String, id: String) -> String:
	for item in pack[kind].get("items", pack[kind].get("nodes", [])):
		if item.id == id: return item.label
	return id

func evaluate(kind: String) -> Dictionary:
	var details: Array = []
	var score := 0
	if kind == "sequence":
		if "" in state.order: return {"valid":false,"correct":false,"score":0,"maxScore":0,"details":["Fill every bay before checking the procedure."]}
		for constraint in pack.sequence.constraints:
			var good: bool = state.order.find(constraint.before) < state.order.find(constraint.after)
			if good: score += 1
			else: details.append("Place “%s” before “%s”." % [label(kind,constraint.before),label(kind,constraint.after)])
		return {"valid":true,"correct":score == pack.sequence.constraints.size(),"score":score,"maxScore":pack.sequence.constraints.size(),"details":details}
	if kind == "dependency":
		for edge in pack.dependency.edges:
			if edge in state.edges: score += 1
			else: details.append("Connect %s — %s → %s." % [label(kind,edge.from),edge.relation,label(kind,edge.to)])
		var extras := 0
		for edge in state.edges:
			if edge not in pack.dependency.edges:
				extras += 1
				details.append("Revisit %s — %s → %s; this is not a relationship in the supplied model." % [label(kind,edge.from),edge.relation,label(kind,edge.to)])
		var maximum: int = pack.dependency.edges.size() + extras
		return {"valid":true,"correct":score == maximum,"score":score,"maxScore":maximum,"details":details}
	return {"valid":false,"correct":false,"score":0,"maxScore":0,"details":["Unknown activity."]}

func check(kind: String) -> Dictionary:
	if not state.guided: return {"saved":false,"correct":false,"message":"Complete the lesson and guided try first."}
	var result := evaluate(kind)
	if not result.valid: return {"saved":false,"correct":false,"message":result.details[0]}
	var next := state.duplicate(true)
	next.attempts[kind] = int(next.attempts[kind]) + 1
	result.supported = bool(next.supported.get(kind, false))
	var awarded := 0
	result.first_completion = result.correct and kind not in next.completions
	if result.first_completion: next.completions.append(kind)
	if result.correct and not next.awards.has(kind) and not is_experimental():
		awarded = 20 if result.supported else 40
		next.awards[kind] = awarded
		next.xp += awarded
	next.results[kind] = result
	# Feedback reveals model relationships. Any revision is supported practice.
	next.supported[kind] = true
	if not commit(next): return {"saved":false,"correct":false,"message":last_error}
	result.saved = true
	result.awarded = awarded
	return result

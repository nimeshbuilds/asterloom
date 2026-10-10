extends VBoxContainer
## Native control families. All grading and stateful legality use the shared engine.
signal changed(response: Dictionary)
signal narration_active(active: bool)
signal action_requested(action: Dictionary)
const Canvas = preload("res://scripts/model_canvas.gd")
var activity: Dictionary = {}
var response: Dictionary = {}
var view: Dictionary = {}
var sources: Array = []
var native_media: Dictionary = {}
var draft: Dictionary = {}
var render_error := ""
var family := ""

func configure(a: Dictionary, r: Dictionary, v: Dictionary, supplied_sources: Array, media_assets: Dictionary = {}) -> void:
	activity = a; response = r.duplicate(true); view = v; sources = supplied_sources; native_media = media_assets
	family = str(a.get("kind","")); render_error = ""; render()

func render() -> void:
	for child in get_children(): remove_child(child); child.queue_free()
	add_theme_constant_override("separation",14)
	match family:
		"sequence": sequence_board()
		"classification": classification_board()
		"decision": decision_board()
		"dependency": dependency_board()
		"budget": budget_board()
		"rubric": rubric_board()
		"diagram": diagram_board()
		"completion": completion_board()
		"data": data_board()
		"media": media_board()
		"scenario": scenario_board()
		"construction": construction_board()
		"explanation": explanation_board()
		"picture": picture_board()
		"rule-switch": rule_switch_board()
		"child-play": child_play_board()
		"picture-build": picture_build_board()
		"recall": recall_board()
		_: render_error = "No native controls for this activity kind."; label(render_error)

func label(value: String, parent: Node = self, size_px := 18) -> Label:
	var item := Label.new(); item.text = value; item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; item.add_theme_font_size_override("font_size",size_px); item.size_flags_horizontal = Control.SIZE_EXPAND_FILL; parent.add_child(item); return item

func button(value: String, callback: Callable, parent: Node = self, disabled := false) -> Button:
	var item := Button.new(); item.text = value; item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; item.custom_minimum_size.y = 44; item.disabled = disabled; item.pressed.connect(callback); parent.add_child(item)
	if parent is HBoxContainer: item.custom_minimum_size.x = 160
	return item

func row(parent: Node = self) -> HBoxContainer:
	var item := HBoxContainer.new(); item.add_theme_constant_override("separation",10); parent.add_child(item); return item

func options(items: Array, selected_value, callback: Callable, parent: Node = self, blank := true) -> OptionButton:
	var menu := OptionButton.new(); menu.fit_to_longest_item = false; menu.custom_minimum_size.y = 44; menu.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if blank: menu.add_item("Choose…"); menu.set_item_metadata(0,"")
	for item in items:
		menu.add_item(str(item.get("label",item.get("name",item.get("text",item.id))))); menu.set_item_metadata(menu.item_count-1,item.id)
		if item.id == selected_value: menu.select(menu.item_count-1)
	menu.item_selected.connect(func(index): callback.call(menu.get_item_metadata(index)))
	parent.add_child(menu); return menu

func check(value: String, selected_value: bool, callback: Callable, parent: Node = self) -> CheckBox:
	var item := CheckBox.new(); item.text = value; item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; item.button_pressed = selected_value; item.custom_minimum_size.y = 44; item.toggled.connect(callback); parent.add_child(item); return item

func input_text(value: String, callback: Callable, parent: Node = self, placeholder := "") -> LineEdit:
	var item := LineEdit.new(); item.text = value; item.placeholder_text = placeholder; item.custom_minimum_size.y = 44; item.size_flags_horizontal = Control.SIZE_EXPAND_FILL; item.text_changed.connect(callback); parent.add_child(item); return item

func number_input(value: float, minimum: float, maximum: float, callback: Callable, parent: Node = self, step := 1.0) -> SpinBox:
	var item := SpinBox.new(); item.min_value = minimum; item.max_value = maximum; item.step = step; item.value = value; item.custom_minimum_size = Vector2(110,44); item.value_changed.connect(callback); parent.add_child(item); return item

func changed_now(rebuild := false) -> void:
	changed.emit(response.duplicate(true))
	if rebuild: render.call_deferred()

func set_value(target: Dictionary,key: String,value, rebuild := false) -> void:
	target[key] = value; changed_now(rebuild)

func toggle(values: Array, value, enabled: bool, rebuild := false) -> void:
	values.erase(value)
	if enabled: values.append(value)
	changed_now(rebuild)

func item_label(items: Array, id: String) -> String:
	for item in items:
		if str(item.id) == id: return str(item.get("label",item.get("name",item.get("text",id))))
	return id

func selection_list(items: Array, chosen: Array, callback: Callable, parent: Node = self) -> void:
	for item in items: check(str(item.get("label",item.get("name",item.get("text",item.id)))),item.id in chosen,func(on): callback.call(item.id,on),parent)

func sequence_board() -> void:
	label("Arrange the steps. Every order that satisfies the source dependencies is accepted.")
	for index in response.get("order",[]).size():
		var line := row(); label(str(index+1)+". "+item_label(activity.items,str(response.order[index])),line)
		if activity.items.size() <= 24:
			button("Move earlier",func(): move_order(index,-1),line,index == 0)
			button("Move later",func(): move_order(index,1),line,index == response.order.size()-1)
		else:
			var selected: bool = draft.get("sequenceStep","") == response.order[index]
			button("Selected step" if selected else "Choose step",func(): draft.sequenceStep = response.order[index]; render.call_deferred(),line)
			button("Place here",func(): place_step(index),line,selected or draft.get("sequenceStep","") == "")

func move_order(index: int, direction: int) -> void:
	var other := index+direction; var value = response.order[index]; response.order[index] = response.order[other]; response.order[other] = value; changed_now(true)

func place_step(index: int) -> void:
	var selected = draft.get("sequenceStep","")
	if selected not in response.order: return
	response.order.erase(selected); response.order.insert(index,selected); draft.erase("sequenceStep"); changed_now(true)

func classification_board() -> void:
	label("Place each item in every category supported by the source.")
	for item in activity.items:
		label(str(item.label),self,21)
		selection_list(activity.categories,response.assignments[item.id],func(id,on): toggle(response.assignments[item.id],id,on))

func decision_board() -> void:
	label("The supplied case")
	for key in activity.context: label(str(key)+": "+str(activity.context[key]))
	for choice in activity.choices:
		button(("✓  " if response.get("choiceId") == choice.id else "")+str(choice.label),func(): set_value(response,"choiceId",choice.id,true))

func dependency_board() -> void:
	var objects: Array = []
	for index in activity.nodes.size():
		var item = activity.nodes[index]; objects.append({"id":item.id,"label":item.label,"x":18+32*(index%3),"y":20+28*floori(index/3.0)})
	var canvas = Canvas.new(); add_child(canvas); canvas.configure(objects,response.edges)
	var controls := row()
	options(activity.nodes,draft.get("from",""),func(id): draft["from"] = id,controls)
	var relations: Array = []
	for edge in activity.edges:
		if not relations.any(func(x): return x.id == edge.relation): relations.append({"id":edge.relation,"label":edge.relation})
	options(relations,draft.get("relation",""),func(id): draft["relation"] = id,controls)
	options(activity.nodes,draft.get("to",""),func(id): draft["to"] = id,controls)
	button("Connect",func():
		if draft.get("from","") == "" or draft.get("to","") == "" or draft.get("relation","") == "": return
		var edge = {"from":draft["from"],"to":draft["to"],"relation":draft.relation}
		if not edge in response.edges: response.edges.append(edge); changed_now(true))
	for index in response.edges.size():
		var edge = response.edges[index]; var line := row(); label(item_label(activity.nodes,edge.from)+" → "+str(edge.relation)+" → "+item_label(activity.nodes,edge.to),line); button("Remove",func(): response.edges.remove_at(index); changed_now(true),line)

func budget_board() -> void:
	var total := 0.0
	for item in activity.items: total += float(response.quantities.get(item.id,0))*float(item.cost)
	label("Budget: "+str(activity.budget)+" "+str(activity.currency)+"  •  Allocated: "+str(total),self,24)
	for requirement in activity.requirements:
		var amount := 0.0
		for id in requirement.contributions: amount += float(requirement.contributions[id])*float(response.quantities.get(id,0))
		label(str(requirement.label)+": "+str(amount)+" / "+str(requirement.minimum)+" required")
	for item in activity.items:
		var line := row(); label(str(item.label)+" • "+str(item.cost)+" / "+str(item.unit),line)
		number_input(response.quantities.get(item.id,0),0,item.maxQuantity,func(value): set_value(response.quantities,item.id,value,true),line)

func rubric_board() -> void:
	label(str(activity.sample))
	if activity.mode == "self-assessment": label("Your reflection is self reviewed. It is not automatically correctness graded.")
	for criterion in activity.criteria:
		label(str(criterion.label),self,21); var levels: Array = []
		for index in criterion.levels.size(): levels.append({"id":index,"label":criterion.levels[index]})
		options(levels,response.ratings.get(criterion.id,-1),func(id): set_value(response.ratings,criterion.id,id))

func diagram_board() -> void:
	var objects: Array = []
	for target in activity.targets: objects.append({"id":target.id,"label":target.label,"x":target.x,"y":target.y})
	var canvas = Canvas.new(); add_child(canvas); canvas.configure(objects)
	for item in activity.labels:
		var line := row(); label(str(item.label),line); options(activity.targets,response.placements.get(item.id,""),func(id): set_value(response.placements,item.id,id),line)

func completion_board() -> void:
	label(str(activity.context))
	if activity.has("pattern"):
		var shown: Array = []
		for id in activity.pattern.shown: shown.append(item_label(activity.tokens,id))
		label("Pattern so far: "+" → ".join(shown),self,24)
	for slot in activity.slots:
		label(str(slot.before)+"   [ … ]   "+str(slot.after))
		options(activity.tokens,response.slotTokens.get(slot.id,""),func(id): set_value(response.slotTokens,slot.id,id))

func data_board() -> void:
	label(str(activity.datasetTitle),self,23); label(str(activity.limitations))
	var controls := row(); label("Inspect a column",controls)
	options(activity.columns,response.view.get("chartColumnId",activity.chartColumnId),func(id): response.view.chartColumnId = id; changed_now(true),controls,false)
	var filter := input_text(str(response.view.get("value","")),func(value): response.view.value = value; changed_now(),self,"Filter rows by text")
	button("Apply filter",func(): render())
	var column_id = response.view.get("chartColumnId",activity.chartColumnId)
	var max_value := 1.0
	for data_row in activity.rows:
		var v = data_row.values.get(column_id)
		if v is float or v is int: max_value = maxf(max_value,float(v))
	var grid := GridContainer.new(); grid.columns = activity.columns.size()+1; add_child(grid); label("Observation",grid)
	for column in activity.columns: label(str(column.label)+( " ("+str(column.unit)+")" if column.unit != "" else ""),grid)
	for data_row in activity.rows:
		var search := str(response.view.get("value",""))
		if search != "" and not (str(data_row.label)+str(data_row.values)).to_lower().contains(search.to_lower()): continue
		label(str(data_row.label),grid)
		for column in activity.columns: label(str(data_row.values.get(column.id,"—")),grid)
		var v = data_row.values.get(column_id)
		if v is float or v is int:
			var line := row(); label(str(data_row.label)+": "+str(v),line); var bar := ProgressBar.new(); bar.max_value = max_value; bar.value = float(v); bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bar.show_percentage = false; line.add_child(bar)
	for question in activity.questions:
		label(str(question.prompt),self,21)
		input_text(str(response.answers.get(question.id,"")),func(value): set_value(response.answers,question.id,value),self,"Your quantitative answer")
		if question.requireEvidenceRows: selection_list(activity.rows,response.evidenceRows[question.id],func(id,on): toggle(response.evidenceRows[question.id],id,on))

func media_board() -> void:
	label("Recording with a source transcript. Use the checkpoints to revisit the cited moment.")
	media_control(str(activity.mediaSourceId))
	var slider := HSlider.new(); slider.min_value = 0; slider.max_value = activity.duration; slider.value = response.position; slider.custom_minimum_size.y = 32; slider.value_changed.connect(func(value): response.position = value; changed_now()); add_child(slider)
	for cue in activity.cues: label(str(cue.start)+"–"+str(cue.end)+" seconds: "+str(cue.text))
	for checkpoint in activity.checkpoints:
		button("Visit "+str(checkpoint.at)+" s • "+str(checkpoint.prompt),func():
			response.position = checkpoint.at; response.activeCheckpointId = checkpoint.id
			if not checkpoint.id in response.visitedCheckpointIds: response.visitedCheckpointIds.append(checkpoint.id)
			changed_now(true))
		if checkpoint.id in response.visitedCheckpointIds:
			options(checkpoint.choices,response.answers.get(checkpoint.id,""),func(id): set_value(response.answers,checkpoint.id,id))

func scenario_board() -> void:
	var snapshot: Dictionary = view.get("snapshot",{})
	label("Investigation • "+str(snapshot.get("phase","active"))+"  |  "+str(activity.budget.label)+" remaining: "+str(snapshot.get("remaining",activity.budget.limit)),self,23)
	for variable in activity.variables:
		if variable.visibility == "visible": label(str(variable.label)+": "+str(snapshot.get("state",{}).get(variable.id,variable.initial)))
	for objective in activity.objectives: label("Objective: "+str(objective.label))
	scenario_protocols(snapshot)
	var available: Array = view.get("availableActions",[])
	for item in available:
		var act: Dictionary = item.get("action",item)
		button(str(act.get("label",act.id))+" • "+str(act.get("cost",0))+" "+str(activity.budget.label),func(): action_requested.emit({"type":"advance","actionId":act.id}),self,not item.get("available",true))
		label(str(act.get("description",""))+("  "+str(item.reason) if item.get("reason","") != "" else ""))
	for entry in snapshot.get("history",[]): label("Action "+str(entry.step)+": "+str(entry.consequence))
	label("Evidence for your conclusion",self,23)
	for observation in activity.observations:
		if observation.id in snapshot.get("observationIds",[]):
			check(str(observation.label)+" — "+str(observation.text),observation.id in response.selectedEvidenceIds,func(on): toggle(response.selectedEvidenceIds,observation.id,on))

func commitment_choices(title: String, choices: Array, type_name: String, extra: Dictionary = {}) -> void:
	label(title,self,21)
	for choice in choices:
		button(str(choice.get("label",choice.id)),func():
			var commitment: Dictionary = extra.duplicate(true); commitment["type"] = type_name; commitment["choiceId"] = choice.id
			action_requested.emit({"type":"commit","commitment":commitment}))

func scenario_protocols(snapshot: Dictionary) -> void:
	var presentation: Dictionary = activity.get("scenarioPresentation",{})
	if presentation.has("prediction"):
		var p: Dictionary = presentation.prediction; var state: Dictionary = snapshot.get("prediction",{})
		commitment_choices(str(p.prompt if not state.has("initialChoiceId") else p.revisionPrompt),p.hypotheses,"prediction" if not state.has("initialChoiceId") else "hypothesis-revision")
		if state.has("initialChoiceId"): label("Initial prediction: "+item_label(p.hypotheses,str(state.initialChoiceId)))
		commitment_choices(str(p.reviewPrompt),p.reviewChoices,"outcome-review")
	if presentation.has("campaign"):
		var p: Dictionary = presentation.campaign; var state: Dictionary = snapshot.get("campaign",{})
		var stage_index := mini(int(state.get("stageIndex",0)),p.stages.size()-1); var stage: Dictionary = p.stages[stage_index]
		label(str(stage.title)+" — "+str(stage.briefing),self,23)
		if stage.get("transfer",false): label("Changed context: "+str(stage.changedContext)+"\nApply: "+str(stage.learningToTransfer))
		label(str(p.planningPrompt))
		if not draft.has("plan"): draft["plan"] = []
		var plan: Array = draft.plan
		for id in stage.actionIds:
			button("Add to plan: "+item_label(activity.actions,id),func(): plan.append(id); render())
		label("Your plan: "+" → ".join(plan.map(func(id): return item_label(activity.actions,id))))
		button("Remove last planned action",func(): if not plan.is_empty(): plan.pop_back(); render())
		button("Commit this plan",func(): action_requested.emit({"type":"commit","commitment":{"type":"plan","stageId":stage.id,"actionIds":plan.duplicate()}}))
		options(p.revisionReasons,draft.get("revisionReason",""),func(id): draft["revisionReason"] = id)
		button("Commit revised plan",func(): action_requested.emit({"type":"commit","commitment":{"type":"plan-revision","stageId":stage.id,"actionIds":plan.duplicate(),"reasonId":draft.get("revisionReason","")}}))
		commitment_choices(str(stage.debrief.prompt),stage.debrief.choices,"debrief",{"stageId":stage.id})
	if presentation.has("dialogue"):
		var p: Dictionary = presentation.dialogue; var state: Dictionary = snapshot.get("dialogue",{})
		for role in p.roles:
			if p.mode == "perspective": button("View as "+str(role.name),func(): action_requested.emit({"type":"commit","commitment":{"type":"perspective-switch","roleId":role.id}}),self,role.id == state.get("currentRoleId",p.initialRoleId))
			else: label(str(role.name)+" — "+str(role.description))
			if role.id == state.get("currentRoleId",p.initialRoleId):
				label(str(role.description))
				for observation in activity.observations:
					if observation.id in role.observationIds and observation.id in snapshot.get("observationIds",[]): label(str(observation.text))
		for turn in view.get("dialogueTurns",[]):
			label(str(turn.line),self,23)
			for choice in turn.choices: button(str(choice.utterance),func(): action_requested.emit({"type":"advance","actionId":choice.actionId}))
		commitment_choices(str(p.debrief.prompt),p.debrief.choices,"dialogue-review")
	if presentation.has("promptComparison"):
		var p: Dictionary = presentation.promptComparison
		label(str(p.briefing)+"\nRecorded model: "+str(p.modelLabel)+" "+str(p.modelVersion)+" • "+str(p.recordedAt))
		for sample in p.cases:
			button("Compare variant: "+str(sample.title),func(): action_requested.emit({"type":"commit","commitment":{"type":"prompt-variant","caseId":sample.id}}),self,sample.id == p.baselineCaseId or snapshot.get("promptComparison",{}).has("variantId"))
			label(str(sample.changeDescription)+"\nPrompt: "+str(sample.prompt))
			if sample.observationId in snapshot.get("observationIds",[]): label("Recorded output: "+str(sample.output))
		commitment_choices(str(p.prediction.prompt),p.prediction.choices,"prompt-prediction")
		for criterion in p.criteria:
			label(str(criterion.label)+" — "+str(criterion.description))
			for sample in p.cases: button(str(sample.title),func(): action_requested.emit({"type":"commit","commitment":{"type":"prompt-comparison","criterionId":criterion.id,"caseId":sample.id}}))
		commitment_choices(str(p.review.prompt),p.review.choices,"prompt-review")

func construction_board() -> void:
	for requirement in activity.requirements: label("Requirement: "+str(requirement.label))
	for resource in activity.resources:
		var used := 0.0
		for instance in response.instances:
			for component in activity.components:
				if component.id == instance.componentId: used += float(component.costs.get(resource.id,0))
		label(str(resource.label)+": "+str(used)+" / "+str(resource.limit)+" "+str(resource.unit))
	for component in activity.components:
		var count := 0
		for instance in response.instances:
			if instance.componentId == component.id: count += 1
		button("Add "+str(component.label)+" ("+str(count)+"/"+str(int(component.maxInstances))+")",func():
			response.instances.append({"id":"part-"+str(Time.get_ticks_usec()),"componentId":component.id,"x":25+10*(response.instances.size()%5),"y":25+20*(response.instances.size()%3)}); changed_now(true),self,count >= component.maxInstances)
	var objects: Array = []
	for instance in response.instances: objects.append({"id":instance.id,"label":item_label(activity.components,instance.componentId),"x":instance.x,"y":instance.y})
	var canvas = Canvas.new(); add_child(canvas); canvas.configure(objects,response.edges,[],true)
	canvas.moved.connect(func(id,x,y):
		for instance in response.instances:
			if instance.id == id: instance.x = x; instance.y = y
		changed_now())
	var named: Array = []
	for index in response.instances.size():
		var instance = response.instances[index]; named.append({"id":instance.id,"label":str(index+1)+". "+item_label(activity.components,instance.componentId)})
		var line := row(); label(named[-1].label,line)
		button("Remove",func(): response.instances.remove_at(index); response.edges = response.edges.filter(func(edge): return edge.from != instance.id and edge.to != instance.id); changed_now(true),line)
	var controls := row()
	options(named,draft.get("from",""),func(id): draft["from"] = id; render(),controls)
	options(ports_for(draft.get("from",""),"out"),draft.get("fromPort",""),func(id): draft["fromPort"] = id,controls)
	options(named,draft.get("to",""),func(id): draft["to"] = id; render(),controls)
	options(ports_for(draft.get("to",""),"in"),draft.get("toPort",""),func(id): draft["toPort"] = id,controls)
	button("Connect ports",func():
		for key in ["from","to","fromPort","toPort"]:
			if draft.get(key,"") == "": return
		var edge = {"from":draft["from"],"to":draft["to"],"fromPort":draft.fromPort,"toPort":draft.toPort}
		if not edge in response.edges: response.edges.append(edge); changed_now(true))
	for index in response.edges.size():
		var edge = response.edges[index]; var line := row(); label(str(edge.from)+" : "+str(edge.fromPort)+" → "+str(edge.to)+" : "+str(edge.toPort),line); button("Disconnect",func(): response.edges.remove_at(index); changed_now(true),line)

func ports_for(id: String, direction: String) -> Array:
	for instance in response.instances:
		if instance.id == id:
			for component in activity.components:
				if component.id == instance.componentId: return component.ports.filter(func(port): return port.direction == direction)
	return []

func explanation_board() -> void:
	var editable := true
	if activity.has("partner"):
		for role in activity.partner.roles:
			label(str(role.label)+" — "+str(role.instruction))
			input_text(str(response.partner.participants.get(role.id,"")),func(value): set_value(response.partner.participants,role.id,value),self,"Partner's chosen name")
		var turn_index := int(response.partner.activeTurn)
		if turn_index < activity.partner.turns.size():
			var turn: Dictionary = activity.partner.turns[turn_index]; label("Turn "+str(turn_index+1)+": "+str(turn.instruction),self,23)
			button("I am ready for this handoff",func(): action_requested.emit({"type":"partner-ack"}))
			editable = bool(response.partner.acknowledged) and turn.task == "construct"
			options([{"id":"ready","label":"Ready to use"},{"id":"revise","label":"Revise together"}],response.partner.decision,func(id): set_value(response.partner,"decision",id))
			check("I checked the evidence",response.partner.checkedEvidence,func(on): set_value(response.partner,"checkedEvidence",on))
			input_text(str(response.partner.reflection),func(value): set_value(response.partner,"reflection",value),self,"Partner reflection")
			button("Finish turn and hand over",func(): action_requested.emit({"type":"partner-next"}))
		button("Begin another collaborative round",func(): action_requested.emit({"type":"partner-restart"}))
	if activity.has("codeReview"):
		label("Supplied "+str(activity.codeReview.language)+" source (read only)",self,23)
		var code := TextEdit.new(); code.text = activity.codeReview.code; code.editable = false; code.custom_minimum_size.y = 220; add_child(code)
		for finding in activity.codeReview.findings:
			label(str(finding.label),self,21); var annotation: Dictionary = response.codeReview.annotations[finding.id]
			for span in activity.codeReview.spans:
				check(str(span.label)+" • characters "+str(int(span.start))+"–"+str(int(span.end)),span.id in annotation.spanIds,func(on): toggle(annotation.spanIds,span.id,on))
			options(activity.codeReview.repairs,annotation.repairId,func(id): set_value(annotation,"repairId",id))
			for repair in activity.codeReview.repairs:
				if repair.id == annotation.repairId: label(str(repair.text))
			input_text(str(annotation.note),func(value): set_value(annotation,"note",value),self,"Why this span and repair?")
	for argument in activity.arguments:
		label(str(argument.label)+" — "+str(argument.prompt),self,21)
		var chain: Dictionary = response.arguments[argument.id]
		for role in ["claim","evidence","warrant","counterpoint","rebuttal"]:
			var pieces: Array = activity.pieces.filter(func(piece): return piece.role == role)
			if pieces.is_empty(): continue
			label(str(role).capitalize())
			if role == "evidence":
				for piece in pieces:
					var control := check(str(piece.text),piece.id in chain.evidenceIds,func(on): toggle(chain.evidenceIds,piece.id,on)); control.disabled = not editable
			else:
				var control := options(pieces,chain.get(role+"Id",""),func(id): set_value(chain,role+"Id",id)); control.disabled = not editable

func picture_board() -> void:
	label(str(activity.sceneAlt)); label(str(activity.caregiverNote))
	check("A caregiver is helping",bool(response.caregiverSupport),func(on): set_value(response,"caregiverSupport",on))
	var texture := source_texture(str(activity.sceneSourceId))
	var canvas = Canvas.new(); add_child(canvas); canvas.texture = texture
	var objects: Array = []
	for token in activity.tokens: objects.append({"id":token.id,"label":token.label,"x":token.x+token.width/2,"y":token.y+token.height/2,"width":token.width,"height":token.height,"color":"#386d8477"})
	canvas.configure(objects)
	canvas.selected.connect(func(id):
		if not id in response.exploredTokenIds: response.exploredTokenIds.append(id)
		if response.phase == "play": response.answers[response.activeRoundId] = id
		changed_now(true))
	if texture == null: render_error = "The supplied source picture could not be decoded."; label(render_error)
	if response.phase == "explore":
		label("Explore the source picture together.")
		for token in activity.tokens: button(("✓ " if token.id in response.exploredTokenIds else "")+str(token.label),func(): if not token.id in response.exploredTokenIds: response.exploredTokenIds.append(token.id); changed_now(true))
		button("Start the picture questions",func(): response.phase = "play"; changed_now(true))
	else:
		for round_data in activity.rounds:
			label(str(round_data.prompt),self,23)
			if round_data.has("narrationSourceId"): media_control(str(round_data.narrationSourceId))
			var choices: Array = activity.tokens.filter(func(token): return token.id in round_data.tokenIds)
			options(choices,response.answers.get(round_data.id,""),func(id): response.activeRoundId = round_data.id; set_value(response.answers,round_data.id,id))

func rule_switch_board() -> void:
	if response.phase == "transition":
		label(str(activity.transitionInstruction),self,24)
		button("I see the new rule — begin round two",func(): response.switchAcknowledged = true; response.phase = "second"; changed_now(true)); return
	var index := 0 if response.phase == "first" else 1
	var round_data: Dictionary = activity.rounds[index]
	label(str(round_data.label)+" — "+str(round_data.instruction),self,23)
	label("Active feature: "+str(round_data.get("featureLabel",round_data.feature)))
	for item in activity.items:
		label(str(item.label)+" • "+str(item.attributes))
		options(round_data.categories,response.assignments[round_data.id].get(item.id,""),func(id): set_value(response.assignments[round_data.id],item.id,id))
	if index == 0:
		button("Commit round one",func():
			for item in activity.items:
				if response.assignments[round_data.id].get(item.id,"") == "": return
			response.firstCommitted = true; response.phase = "transition"; changed_now(true))
	else: label("Round one stays saved. Check both rounds after completing the new rule.")

func child_play_board() -> void:
	var snapshot: Dictionary = view.get("snapshot",{})
	var scene: Dictionary = snapshot.get("scene",{})
	label(str(scene.get("title",activity.title)),self,26)
	label(str(scene.get("narrative","")),self,22)
	label(str(activity.caregiverNote))
	check("A caregiver is helping",bool(response.caregiverSupport),func(on): set_value(response,"caregiverSupport",on))
	if scene.has("narrationSourceId"): media_control(str(scene.narrationSourceId))
	var objects: Array = []
	for index in activity.characters.size():
		var actor = activity.characters[index]
		objects.append({"id":actor.id,"label":actor.name+"\n"+actor.role,"x":20+30*index,"y":30,"shape":"circle","width":22,"height":35,"color":{"sage":"#527b62","coral":"#a26051","blue":"#426681","gold":"#917844"}.get(actor.color,"#426681")})
	var canvas = Canvas.new(); add_child(canvas); canvas.configure(objects)
	canvas.selected.connect(func(id): set_value(response,"selectedActorId",id))
	for station in activity.stations:
		var located: Array = []
		for prop in activity.props:
			if scene.get("propLocations",{}).get(prop.id) == station.id: located.append(prop.name)
		label(str(station.name)+": "+", ".join(located))
	options(activity.characters,response.get("selectedActorId",""),func(id): set_value(response,"selectedActorId",id),self,false)
	options(activity.props,response.get("selectedPropId",""),func(id): set_value(response,"selectedPropId",id))
	for act in activity.actions:
		if act.fromSceneId == scene.get("id",activity.startSceneId): button(str(act.label),func(): action_requested.emit({"type":"advance","actionId":act.id}))
	for goal in activity.objectives: label(("✓ " if goal.id in snapshot.get("completedObjectiveIds",[]) else "○ ")+str(goal.label))

func picture_build_board() -> void:
	for rule in activity.rules: label(str(rule.label))
	for part in activity.parts:
		var count := 0
		for placed in response.parts:
			if placed.partId == part.id: count += 1
		button("Add "+str(part.label)+" ("+str(count)+"/"+str(int(part.maxInstances))+")",func():
			response.parts.append({"id":"shape-"+str(Time.get_ticks_usec()),"partId":part.id,"x":50,"y":50}); invalidate_telling(); changed_now(true),self,count >= part.maxInstances)
	var objects: Array = []
	for placed in response.parts:
		for part in activity.parts:
			if part.id == placed.partId:
				var item := {"id":placed.id,"label":part.label,"x":placed.x,"y":placed.y,"width":part.width,"height":part.height,"shape":part.shape,"color":part.color}
				if part.has("imageSourceId"):
					item["texture"] = source_texture(str(part.imageSourceId)); item["requires_image"] = true
					if item.texture == null: item.label = str(part.label)+" — source image unavailable"; render_error = "A supplied picture-part image is unavailable in the native player."
				objects.append(item)
	var canvas = Canvas.new(); add_child(canvas); canvas.configure(objects,[],activity.zones,true)
	canvas.moved.connect(func(id,x,y):
		for placed in response.parts:
			if placed.id == id: placed.x = x; placed.y = y
		invalidate_telling(); changed_now(true))
	for index in response.parts.size():
		var placed = response.parts[index]; var line := row(); label(item_label(activity.parts,placed.partId),line)
		number_input(float(placed.x),0,100,func(value): placed.x = value; invalidate_telling(); changed_now(true),line)
		number_input(float(placed.y),0,100,func(value): placed.y = value; invalidate_telling(); changed_now(true),line)
		button("Remove",func(): response.parts.remove_at(index); invalidate_telling(); changed_now(true),line)
	label(str(activity.tell.prompt),self,23)
	options([{"id":"spoken","label":"Tell a caregiver aloud"},{"id":"written","label":"Write the telling"},{"id":"supplied-audio","label":"Play supplied narration"}],response.tell.method,func(id): response.tell.method = id; invalidate_telling(); changed_now(true),self,false)
	if response.tell.method == "written": input_text(str(response.tell.words),func(value): response.tell.words = value; invalidate_telling(); changed_now(),self,"Tell the story of your picture")
	if response.tell.method == "supplied-audio":
		var choices: Array = []
		for id in activity.tell.narrationSourceIds: choices.append({"id":id,"label":source_title(id)})
		options(choices,response.tell.narrationSourceId,func(id): response.tell.narrationSourceId = id; invalidate_telling(); changed_now(true))
		if response.tell.narrationSourceId != "": media_control(response.tell.narrationSourceId)
	label("Caregiver review — telling is not automatically correctness graded.")
	input_text(str(response.tell.caregiverName),func(value): set_value(response.tell,"caregiverName",value),self,"Caregiver's chosen name")
	for criterion in activity.tell.caregiverChecks: check(str(criterion.label),bool(response.tell.checks.get(criterion.id,false)),func(on): set_value(response.tell.checks,criterion.id,on))
	button("Record caregiver review of this picture and telling",func():
		response.tell.reviewed = true; response.tell.reviewedState = {"parts":response.parts.duplicate(true),"method":response.tell.method,"words":response.tell.words,"narrationSourceId":response.tell.narrationSourceId}; changed_now(true))
	if response.tell.reviewed: label("The caregiver review has been recorded for this picture and telling.")

func invalidate_telling() -> void:
	response.tell.reviewed = false; response.tell.reviewedState = null

func recall_board() -> void:
	label("Bring the answer to mind before revealing it. Revealed answers count as supported practice.")
	for question in activity.questions:
		label(str(question.prompt),self,23)
		input_text(str(response.answers.get(question.id,"")),func(value): response.selectedQuestionId = question.id; set_value(response.answers,question.id,value),self,"Your answer from memory")
		button("Reveal the source answer",func(): if not question.id in response.revealedIds: response.revealedIds.append(question.id); changed_now(true))
		if question.id in response.revealedIds: label(str(question.answer))

func source_title(id: String) -> String:
	for source in sources:
		if source.id == id: return str(source.get("title",id))
	return id

func source_texture(id: String) -> Texture2D:
	for source in sources:
		if source.id != id: continue
		var bytes := PackedByteArray(); var mime := ""
		if native_media.has(id):
			var stored: Dictionary = native_media[id]; mime = str(stored.mime)
			if mime.begins_with("image/"): bytes = FileAccess.get_file_as_bytes(stored.path)
		else:
			var data: String = source.get("dataUrl","")
			if not data.begins_with("data:image/") or not data.contains(";base64,"): return null
			mime = data.get_slice(";",0).trim_prefix("data:"); bytes = Marshalls.base64_to_raw(data.get_slice(",",1))
		var picture := Image.new(); var code := ERR_FILE_UNRECOGNIZED
		if mime == "image/png": code = picture.load_png_from_buffer(bytes)
		elif mime in ["image/jpeg","image/jpg"]: code = picture.load_jpg_from_buffer(bytes)
		elif mime == "image/webp": code = picture.load_webp_from_buffer(bytes)
		if code == OK: return ImageTexture.create_from_image(picture)
	return null

func media_control(id: String) -> void:
	for source in sources:
		if source.id != id: continue
		var data: String = source.get("dataUrl","")
		var stream: AudioStream
		if native_media.has(id):
			var stored: Dictionary = native_media[id]
			if stored.mime in ["audio/wav","audio/x-wav"]: stream = AudioStreamWAV.load_from_file(stored.path)
			elif stored.mime in ["audio/mpeg","audio/mp3"]: stream = AudioStreamMP3.load_from_file(stored.path)
			elif stored.mime == "audio/ogg": stream = AudioStreamOggVorbis.load_from_file(stored.path)
			elif stored.mime == "video/ogg":
				var video := VideoStreamPlayer.new(); var movie := VideoStreamTheora.new(); movie.file = stored.path; video.stream = movie; video.custom_minimum_size = Vector2(640,360); add_child(video)
				var controls := row(); button("▶ Play supplied video",func(): video.play(); narration_active.emit(true),controls); button("Pause",func(): video.paused = not video.paused; narration_active.emit(not video.paused),controls); return
		if data.contains(";base64,"):
			var bytes := Marshalls.base64_to_raw(data.get_slice(",",1))
			if data.begins_with("data:audio/wav") or data.begins_with("data:audio/x-wav"): stream = AudioStreamWAV.load_from_buffer(bytes)
			elif data.begins_with("data:audio/mpeg") or data.begins_with("data:audio/mp3"): stream = AudioStreamMP3.load_from_buffer(bytes)
			elif data.begins_with("data:audio/ogg"): stream = AudioStreamOggVorbis.load_from_buffer(bytes)
		if stream != null:
			var player := AudioStreamPlayer.new(); player.stream = stream; add_child(player)
			player.finished.connect(func(): narration_active.emit(false))
			var controls := row(); button("▶ Play "+source_title(id),func(): player.play(float(response.get("position",0))); narration_active.emit(true),controls); button("Pause",func():
				if family == "media": response.position = player.get_playback_position(); changed_now()
				player.stop(); narration_active.emit(false),controls)
			return
		if data.begins_with("data:video/ogg;base64,"):
			var safe_directory := ProjectSettings.globalize_path("user://media")
			DirAccess.make_dir_recursive_absolute(safe_directory)
			var safe_path := safe_directory.path_join(data.sha256_text()+".ogv")
			var file := FileAccess.open(safe_path,FileAccess.WRITE)
			if file != null:
				file.store_buffer(Marshalls.base64_to_raw(data.get_slice(",",1))); file.close()
				var video := VideoStreamPlayer.new(); var movie := VideoStreamTheora.new(); movie.file = safe_path; video.stream = movie; video.custom_minimum_size = Vector2(640,360); add_child(video)
				var controls := row(); button("▶ Play video",func(): video.play(); narration_active.emit(true),controls); button("Pause",func(): video.paused = not video.paused; narration_active.emit(not video.paused),controls); return
		label("This recording format is not yet available in the native player. Its supplied transcript remains available below; the original recording stays in the notebook and its full-player source downloads.")
		render_error = "Media source is not in a native playback format."

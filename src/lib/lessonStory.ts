import {worldForScaffold} from '../data/worlds';
import {ARTWORK_SETTINGS,worldArtworkFor} from './worldArtwork';
import type { Scaffold } from '../data/scaffolds';

export interface LessonStory {
  title: string; role: string; setting: string; mission: string; payoff: string;
  fictional: true; boundary: string; domain: string; guidance: string; reflection: string;
  transfer: string; recovery: string;
}
type Frame = readonly [role: string, setting: string, mission: string, payoff: string];
/** Authored narrative frames, not subject-matter claims. Every catalog recipe has an explicit frame. */
export const LESSON_STORY_FRAMES: Record<string, Frame> = {
  'concept-map-repair': ['systems mapper', 'a planning room with an incomplete wall map', 'Restore the connections that the source can justify.', 'A map another learner can follow'],
  'classification-workshop': ['collection curator', 'a workshop with an unsorted collection', 'Build a consistent sorting rule and explain its boundaries.', 'An organized collection with reasons'],
  'comparison-puzzle': ['comparison analyst', 'a desk holding two competing proposals', 'Find the features that matter before making a match.', 'A comparison that preserves important differences'],
  'analogy-construction': ['model builder', 'a studio connecting familiar and unfamiliar ideas', 'Identify the relationship an analogy preserves and where it stops.', 'A useful bridge with its limits marked'],
  'definition-building': ['reference editor', 'a reference desk preparing a clear field guide', 'Reconstruct meanings without losing their conditions.', 'A concise guide to the source vocabulary'],
  'process-reconstruction': ['process planner', 'an operations room with a broken route', 'Rebuild the source sequence and identify its stated dependencies.', 'A route whose steps can be explained'],
  'missing-step-completion': ['procedure reviewer', 'a workbench with an unfinished procedure', 'Find what belongs in the gap using the surrounding evidence.', 'A complete procedure with a traceable decision'],
  'fault-diagnosis': ['case investigator', 'a diagnostic desk receiving an unresolved case', 'Distinguish observations from possible explanations before choosing an action.', 'A diagnosis bounded by the available evidence'],
  'repair-challenge': ['repair lead', 'a repair workshop with a system to restore', 'Understand the stated failure and constraints before changing anything.', 'A repair whose consequences can be checked'],
  'constrained-action-planning': ['mission planner', 'a planning table with limited options', 'Choose a feasible path while keeping the source constraints visible.', 'A plan with explicit tradeoffs'],
  'evidence-investigation': ['evidence investigator', 'a case room with claims awaiting support', 'Trace each important claim to material that can support it.', 'An evidence trail another person can inspect'],
  'claim-verification': ['fact-checking editor', 'a review desk separating claims and evidence', 'Check the scope of a claim against its exact source.', 'A decision with uncertainty still visible'],
  'argument-construction': ['briefing writer', 'a briefing room preparing a reasoned recommendation', 'Connect a claim, its evidence and the reasoning between them.', 'An argument that shows how it was built'],
  'competing-explanations': ['research reviewer', 'a review room with more than one explanation', 'Compare what each explanation accounts for and what remains unresolved.', 'A comparison that does not hide uncertainty'],
  'timeline-investigation': ['timeline investigator', 'an archive with events waiting to be connected', 'Reconstruct the order the source states without assuming causation.', 'A timeline that separates sequence from cause'],
  'branching-decisions': ['decision lead', 'a simulation room with branching routes', 'Read the conditions before committing to a path.', 'A decision record with consequences'],
  'role-missions': ['project contributor', 'a project room with an assigned responsibility', 'Use the source from the viewpoint of the assigned role.', 'A completed assignment with a justified approach'],
  'resource-allocation': ['resource planner', 'a planning desk balancing needs and limits', 'Account for the available resources and stated requirements.', 'A feasible allocation with tradeoffs recorded'],
  'prediction-and-experiment': ['experiment planner', 'a laboratory planning board', 'Make a prediction, inspect the supplied observation and reconsider.', 'A record of what the evidence changed'],
  'build-to-specification': ['design engineer', 'a design studio with a written specification', 'Translate the source requirements into a construction plan.', 'A build that can be checked against its requirements'],
  'diagram-reconstruction': ['visual explainer', 'a studio with a partly assembled diagram', 'Connect labels, parts and positions using the source.', 'A diagram that communicates the documented relationships'],
  'chart-and-data-investigation': ['data investigator', 'an analysis desk with a chart to interpret', 'Inspect the supplied values, units and question before calculating.', 'An interpretation with its evidence and limits'],
  'media-checkpoints': ['recording analyst', 'a screening room with a recorded lesson', 'Listen or watch in context and connect observations across checkpoints.', 'A set of timestamped learning notes'],
  'recall-escape-mission': ['knowledge navigator', 'a sequence of rooms opened through understanding', 'Learn the source ideas, then use them to find your way through.', 'A route through the ideas you can revisit later'],
  'structured-teach-back': ['peer instructor', 'a small teaching studio preparing an explanation', 'Organize what the source says so another learner could follow it.', 'An explanation with evidence and acknowledged gaps'],
  'discovery-scenes': ['curious explorer', 'a small discovery garden', 'Look together, notice a feature and show what belongs.', 'A discovery to share with your grown-up'],
  'puppet-stories': ['story helper', 'a puppet stage with a choice to make', 'Listen together and help a character using the source story.', 'A story choice you can talk about'],
  'pretend-play-stations': ['play partner', 'a pretend shop with things to arrange', 'Try the source rule together while you play.', 'A shared game you helped organize'],
  'pattern-parade': ['pattern finder', 'a parade waiting for its next piece', 'Notice what repeats and explain it by pointing or speaking.', 'A pattern you can continue together'],
  'build-and-tell': ['young maker', 'a building mat with a picture to make', 'Look at the source, build something and tell someone about it.', 'A creation and your story about it'],
  'word-and-picture-workshop': ['picture-guide maker', 'a picture workshop with labels to match', 'Look carefully before connecting a word to a picture.', 'A picture guide you can read together'],
  'step-train': ['route helper', 'a train whose carriages carry steps', 'Find the source order and tell what comes next.', 'A train of steps that makes sense'],
  'changing-rule-sorter': ['rule detective', 'a sorting room where the sign can change', 'Notice the current rule before moving the next piece.', 'A collection sorted by the rule you can explain'],
  'clue-map': ['clue finder', 'a map with clues waiting to connect', 'Use the source clues to decide which places belong together.', 'A map with a reason for each connection'],
  'partner-helper': ['learning partner', 'a shared workbench with a partner to help', 'Notice what your partner needs and explain one useful source idea.', 'A helpful explanation you made together'],
  'evidence-detective': ['evidence detective', 'a casebook with clues to compare', 'Keep track of what a clue shows and what it does not show.', 'A case supported by actual clues'],
  'experiment-predictor': ['young investigator', 'an experiment bench with a prediction card', 'Predict first, inspect the supplied result and explain your revision.', 'A record of how your idea changed'],
  'systems-repair-workshop': ['system builder', 'a workshop with connected parts', 'Trace how the source parts connect before repairing the model.', 'A working model with explained connections'],
  'plan-and-budget-expedition': ['expedition planner', 'a supply table before an imaginary expedition', 'Balance the supplied needs with the resources in the model.', 'A plan that fits its limits'],
  'teach-a-character': ['character coach', 'a story studio with a character ready to learn', 'Explain a source idea clearly enough for the character to use it.', 'A teaching note you can improve'],
  'hypothesis-casebook': ['hypothesis investigator', 'a casebook of testable possibilities', 'Separate your prediction from the observations that could change it.', 'A revised hypothesis with reasons'],
  'claim-and-evidence-arena': ['evidence advocate', 'a moderated discussion with claims to examine', 'Build support from the source and identify the limits of that support.', 'An argument others can question productively'],
  'constraint-design-workshop': ['design planner', 'a workshop working within a specification', 'Use the stated constraints to guide a design.', 'A solution whose requirements remain visible'],
  'perspective-switching-drama': ['perspective explorer', 'a rehearsal room with several authored roles', 'Compare what each role can observe without inventing missing facts.', 'A record of how viewpoint changes an interpretation'],
  'strategy-campaign': ['campaign planner', 'a multi-stage strategy table', 'Use what one stage reveals to revise the next stage of your plan.', 'A plan with a documented revision history'],
  'scenario-internship': ['project intern', 'a simulated professional assignment', 'Study the source, make bounded decisions and explain their consequences.', 'A work record that a reviewer can follow'],
  'research-dossier': ['research assistant', 'a dossier prepared for a critical reader', 'Organize evidence, scope and unanswered questions before recommending.', 'A research brief with a transparent trail'],
  'prototype-studio': ['prototype designer', 'a studio translating requirements into a model', 'Build against the supplied specification and inspect the result.', 'A prototype with testable design choices'],
  'review-studio': ['constructive reviewer', 'a review studio preparing useful feedback', 'Judge the supplied work against explicit criteria.', 'Feedback that points to evidence and a next step'],
  'capstone-campaign': ['project lead', 'a multi-stage project with a final debrief', 'Carry evidence across stages and explain what transfers to a new case.', 'A project record that shows decisions and revisions'],
  'zero-trust-access-lab': ['access-policy reviewer', 'a simulated access review desk', 'Connect the supplied identities, resources and documented access rules.', 'An access explanation that follows the supplied policy'],
  'incident-response-command': ['incident coordinator', 'a simulated incident command room', 'Separate observed signals from assumptions before taking bounded action.', 'An incident timeline with documented decisions'],
  'threat-model-canvas': ['threat-model facilitator', 'a design review with a system canvas', 'Map the source-defined boundaries and relationships before discussing risks.', 'A threat model limited to the supplied system'],
  'secure-code-review': ['code reviewer', 'a simulated review of a supplied code sample', 'Use the provided criteria and evidence to explain a review finding.', 'A review that cites the actual sample'],
  'packet-path-inspector': ['network investigator', 'a desk tracing a supplied packet journey', 'Follow the path and dependencies described in the source.', 'A trace that explains each documented step'],
  'prompt-experiment-bench': ['prompt experimenter', 'a bench comparing supplied prompts and outputs', 'Compare the authored examples and record what their evidence supports.', 'A comparison of supplied outputs, not a live model claim'],
  'agent-workflow-studio': ['workflow designer', 'a studio arranging an authored agent workflow', 'Use the source requirements to connect actions, checks and boundaries.', 'A workflow with explicit responsibilities'],
  'retrieval-quality-lab': ['retrieval evaluator', 'a review bench with supplied query and passage examples', 'Judge the supplied passages against the stated information need.', 'An evidence-based retrieval judgment'],
  'model-evaluation-arena': ['evaluation analyst', 'a review panel comparing supplied model results', 'Keep the evaluation criterion and evidence visible while comparing.', 'A comparison scoped to the supplied results'],
  'ai-safety-response-lab': ['response-policy reviewer', 'a simulated policy-response review', 'Apply the supplied policy to the authored case and explain the limits.', 'A response decision tied to the provided policy'],
  'cloud-architecture-builder': ['architecture designer', 'a design desk with an authored cloud specification', 'Connect the supplied components to satisfy the stated requirements.', 'An architecture grounded in its specification'],
  'cloud-cost-control': ['capacity planner', 'a simulated budget review with supplied prices', 'Calculate within the model and explain the resource tradeoffs.', 'A budget decision using the supplied costs'],
  'kubernetes-recovery-room': ['recovery coordinator', 'a simulated service recovery room', 'Read the supplied observations before choosing a recovery action.', 'A recovery trace scoped to the authored scenario'],
  'infrastructure-change-planner': ['change planner', 'an infrastructure change review', 'Sequence the documented prerequisites and checks before a change.', 'A plan with its dependencies visible'],
  'distributed-systems-trace': ['trace investigator', 'a desk inspecting an authored distributed trace', 'Connect events only where the supplied evidence supports a relationship.', 'A trace that keeps uncertainty visible'],
  'debugger-detective': ['debugging investigator', 'a workbench with a supplied failing example', 'Compare observations, hypotheses and authored action outcomes.', 'A debugging record with supported conclusions'],
  'api-contract-workshop': ['contract reviewer', 'a workshop comparing supplied API requirements', 'Match behavior to the exact contract and note mismatches.', 'A contract review with specific evidence'],
  'database-query-lab': ['query analyst', 'a query workbench using supplied examples', 'Read the provided schema and constraints before completing a query.', 'A query choice explained by the supplied material'],
  'version-control-recovery': ['repository investigator', 'a simulated repository recovery desk', 'Understand the authored state and consequences before acting.', 'A recovery record limited to the supplied model'],
  'test-design-studio': ['test designer', 'a studio checking an authored behavior specification', 'Connect each test idea to a requirement or supplied failure case.', 'A test plan with traceable coverage'],
  'data-pipeline-repair': ['pipeline designer', 'a repair desk for an authored data pipeline', 'Follow the source-defined input, transformation and output constraints.', 'A repaired model with documented data flow'],
  'statistics-evidence-lab': ['evidence analyst', 'an analysis desk with supplied statistical data', 'Inspect quantities, units and assumptions before interpreting a result.', 'An interpretation bounded by the supplied data'],
  'product-tradeoff-council': ['product council member', 'a simulated review of competing product choices', 'Weigh the authored needs, constraints and consequences.', 'A recommendation with its tradeoffs explicit'],
  'language-dialogue-trail': ['conversation partner', 'a rehearsal of an authored dialogue', 'Study the supplied utterances and their context before choosing a reply.', 'A dialogue route grounded in the supplied language examples'],
  'clinical-reasoning-casebook': ['case-study reviewer', 'an educational case review, separate from real patient care', 'Compare the supplied observations and authored case rules.', 'An educational reasoning record scoped to this case'],
};
const LENSES: Record<Scaffold['family'], [string, string]> = {
  recall: ['Connect the idea to its context before trying to retrieve it.', 'Explain one source idea and a condition or detail that must stay with it.'],
  match: ['Compare the feature or relationship the source actually states.', 'Explain a similarity and a difference the source supports. If one is unstated, say so.'],
  sequence: ['Separate stated order from reasons for that order.', 'Explain a stated step and what the source says about its position. Do not assume an unstated dependency.'],
  sort: ['Identify a rule and check its scope before applying it.', 'Describe a source-supported feature you would use to classify an item and any limit on that rule.'],
  cloze: ['Read around a missing part so the whole statement retains its meaning.', 'Explain how the surrounding source text constrains what belongs in a gap.'],
  scenario: ['Keep observations, possible actions and supplied consequences separate.', 'Describe one observation and how the source could guide a decision. Identify anything the source does not establish.'],
  diagram: ['Connect parts and relationships before arranging their visual positions.', 'Explain a relationship or requirement the source gives for the model you will build.'],
  explain: ['Make the connection between a claim and its evidence visible.', 'Explain a source idea in your own words, then point to the passage that supports your explanation.'],
  connect: ['Trace each connection to a statement that can support it.', 'Describe a relationship supported by the source and explain why your chosen passage is relevant.'],
  timed: ['Use the surrounding recording context, not isolated words.', 'Connect an observation from one part of the recording to a related source idea. Note what remains uncertain.'],
};
/** Mechanics-specific story beats describe learner actions, never invented subject outcomes. */
const TRANSFER:Record<Scaffold['family'],readonly [string,string]>={
 recall:['Close your guide and recover the distinctions that matter in the mission.','Reopen one source line, rebuild that connection, then try it without the guide.'],
 match:['Use the relationships you prepared to connect the right pieces in the mission.','Find the two source statements behind this connection before moving the pieces again.'],
 sequence:['Use the source route to decide what belongs before and after each step.','Compare the neighboring steps with their stated source order; do not invent a missing dependency.'],
 sort:['Use the stated category rules to give each item a defensible place.','Inspect the source rule for this boundary before moving the item.'],
 cloze:['Rebuild the source idea so that its surrounding meaning stays intact.','Read the complete source statement, then choose the piece that keeps its conditions intact.'],
 scenario:['Use the supplied observations and rules to choose your next action.','Compare the observed state with the cited rule before choosing a different action.'],
 diagram:['Build relationships that the supplied model can support, and inspect the result.','Trace the unmatched part or connection back to its source requirement.'],
 explain:['Build an explanation whose evidence supports the claim you make.','Check what the evidence actually establishes before connecting it to a claim.'],
 connect:['Make each connection answerable to a specific source statement.','Find the missing or conflicting source relationship before reconnecting the model.'],
 timed:['Use the recording context to locate the observation your mission needs.','Replay the cited moment with its surrounding context before trying again.'],
};
export function buildLessonStory(scaffold: Scaffold, ageGroup: string): LessonStory {
  const frame=LESSON_STORY_FRAMES[scaffold.id];
  if(!frame) throw new Error(`No teaching story is authored for scaffold ${scaffold.id}.`);
  const young=ageGroup==='3-5', early=ageGroup==='6-8',art=worldArtworkFor(worldForScaffold(scaffold.id),ageGroup);
  return {title:scaffold.name,role:frame[0],setting:`${art.name}: ${ARTWORK_SETTINGS[art.id]}`,mission:frame[2],payoff:frame[3],fictional:true,transfer:TRANSFER[scaffold.family][0],recovery:TRANSFER[scaffold.family][1],
    boundary:'The setting and role are fictional. Subject facts come from the cited material; the game does not create missing evidence.',domain:scaffold.domain,
    guidance:young?'A grown-up reads the source aloud. Look, point, play and talk together, one step at a time.':early?'Read or listen together if helpful. Take one step, then explain what you noticed.':LENSES[scaffold.family][0],
    reflection:young?'Show or tell your grown-up something you noticed. Ask them to help you point to where it appears in the source.':LENSES[scaffold.family][1]};
}

/** Instructions describe the implemented interaction, not a solution or an invented source fact. */
export interface LessonActionGuide {id:string;prepare:string;act:string;inspect:string;commit?:string}
type GuideActivity={kind:import('./structuredEngine').StructuredActivity['kind'];items?:readonly unknown[];partner?:unknown;codeReview?:unknown;pattern?:unknown;mode?:string;scenarioPresentation?:{prediction?:unknown;campaign?:unknown;dialogue?:unknown;promptComparison?:unknown}};
const ACTION_GUIDES:Record<GuideActivity['kind']|'recall',readonly [string,string,string]>={
 recall:['Build a distinction from the cited material.','Close the guide and give your answer from memory.','Use feedback to repair the connection; revisit it later.'],
 sequence:['Find the order or prerequisites actually stated.','Choose a step, then move it into the order the source supports.','Check the source constraints, then revise the route.'],
 classification:['Inspect each category’s source-defined boundary.','Choose an item, then place it in every group the source supports.','Check memberships and revisit the boundaries that need work.'],
 decision:['Read the case observations and supplied policy.','Commit to an action for this case.','Compare the policy’s explanation with your decision.'],
 dependency:['Find the relationships the source explicitly supports.','Choose a starting concept, its relationship, and a target; then connect them.','Inspect the network for missing or conflicting links.'],
 budget:['Identify required capacity and the supplied costs.','Allocate quantities while watching costs and capacity.','Test all constraints; revise a feasible allocation.'],
 rubric:['Read the supplied criteria and sample.','Inspect the work and choose a level for each criterion.','Compare against the supplied rubric; reflection has no automatic correctness grade.'],
 diagram:['Study the actual source figure or its text equivalent.','Place each label at a supplied target.','Check the mapping and revisit misplaced labels.'],
 completion:['Read the whole worked context around each gap.','Choose a source token and place it into a slot.','Read the assembled result and check its source constraints.'],
 data:['Inspect the supplied records, units and question.','Filter the data and select records to support a finding.','Check the quantity and the evidence behind it.'],
 media:['Watch or listen to the original recording in context.','Respond at the prepared checkpoints.','Revisit the cited moment and compare your response.'],
 scenario:['Read observations, available actions and resource limits.','Choose an action and inspect its prepared consequence.','Use the new observations to revise your next decision.'],
 construction:['Inspect the specification, components and typed ports.','Build a network while managing capacity and resource limits.','Test paths and constraints, then revise your design.'],
 explanation:['Distinguish the source claim, evidence and reasoning.','Assemble the prepared pieces into a supported argument.','Check that the pieces form a source-supported argument in the prepared model.'],
 picture:['Look together at the supplied picture.','Point or choose the part named by the prompt.','Look again and talk about the source annotation.'],
 'rule-switch':['Notice the sorting rule that is active now.','Sort the objects, then regroup when the rule changes.','Compare your two rounds using their different rules.'],
 'child-play':['Listen together to the supplied story and play rule.','Move the props and help the character make a choice.','See the prepared consequence, then talk about what changed.'],
 'picture-build':['Look together at the source-linked shapes and picture rules.','Move the parts to build your own allowed arrangement.','Check the picture, then tell a grown-up about it. Telling is human reviewed.'],
};
const SPECIAL_ACTION_GUIDES:Record<string,readonly [string,string,string]>={
 partner:['Agree who explains first and who reviews.','Take the prepared turns, hand over the device, and build an explanation.','Compare and revise together. This records collaboration, not independent mastery.'],
 'code-review':['Read the supplied code and the source-defined review criteria.','Mark exact code spans and connect a finding, evidence and prepared repair.','Check that the annotation and argument support the same source-backed alternative.'],
 prediction:['Read the supplied test and commit a prediction.','Reveal the prepared observation after committing.','Compare the observation with your prediction and record a revision.'],
 campaign:['Plan the next actions using the current case and limits.','Carry out your plan, then revise it with a reason as evidence changes.','Debrief the stages and apply the learning to the changed final case.'],
 dialogue:['Read the current role and what that role can observe.','Choose a prepared reply and follow the authored turn or handoff.','Compare the resulting dialogue with the supplied language or role evidence.'],
 'prompt-comparison':['Read the supplied prompt variants and evaluation criteria.','Predict, then inspect the recorded outputs and compare them.','Support your comparison with the supplied examples; no live model is run.'],
 pattern:['Look at the declared repeating cycle.','Place the prepared pieces to extend the pattern.','Check the extension against the declared rule, not a guessed pattern.'],
};
export function buildLessonActionGuide(activity?:GuideActivity):LessonActionGuide {
 let id:string=activity?.kind??'recall';
 if(activity?.kind==='explanation')id=activity.codeReview?'code-review':activity.partner?'partner':id;
 if(activity?.kind==='completion'&&activity.pattern)id='pattern';
 if(activity?.kind==='scenario'){const p=activity.scenarioPresentation;id=p?.dialogue?'dialogue':p?.promptComparison?'prompt-comparison':p?.prediction?'prediction':p?.campaign?'campaign':id;}
 const steps=SPECIAL_ACTION_GUIDES[id]??ACTION_GUIDES[id as keyof typeof ACTION_GUIDES];
 let act=steps[1];
 // The scene is the primary sequence control for bounded inventories; larger
 // saved sequences retain the existing placement workspace. Kind-only planning
 // remains valid before the actual inventory has been written.
 if(activity?.kind==='sequence'&&activity.items)act=activity.items.length<=24?'Choose a step card, then use Move earlier or Move later to put it in order.':'Choose a step, then choose Place here at its destination.';
 // Every structured board exposes this shared commit control. Writer/checker
 // prompts need it as well as the controls for arranging a response. This also
 // covers structured recall; legacy cards use their own interaction instead.
 const commit=activity?activity.kind==='rubric'&&activity.mode==='self-assessment'?'Save my reflection':'Check my work':undefined;
 return{id,prepare:steps[0],act,inspect:commit?`Choose ${commit} when ready. ${steps[2]}`:steps[2],...(commit?{commit}:{})};
}

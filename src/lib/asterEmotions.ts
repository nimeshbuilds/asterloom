/** Decorative portrait expressions/poses. They never infer a learner's emotions or establish learning credit. */
export type AsterMoment='welcome'|'concept'|'hint'|'retry'|'success'|'reflection';
const definitions=[
 ['welcome-wave','Welcome wave','One hand raised in a small open-finger wave; relaxed smile.',['welcome'],'A friendly first arrival.'],
 ['warm-smile','Warm smile','Hands relaxed at the waist, a warm closed-mouth smile.',['welcome','success'],'A calm welcome or acknowledgment.'],
 ['curious-tilt','Curious tilt','Head tilted slightly, eyebrows softly raised, curious smile.',['concept','reflection'],'Invite observation without assuming the answer.'],
 ['ready-to-begin','Ready to begin','Upright ready posture with notebook held close and an attentive expression.',['welcome'],'Signal that the learner can choose a starting point.'],
 ['open-palms','Open palms','Both palms gently open at waist level, relaxed shoulders.',['welcome','hint','retry'],'Offer help without pressure.'],
 ['notebook-ready','Notebook ready','Hold teal notebook open with pencil poised, attentive smile.',['welcome','concept'],'Prepare to explore source material.'],
 ['listening','Listening','Slight forward lean, open attentive expression, hands still.',['hint','reflection'],'Make room for a learner question.'],
 ['thinking','Thinking','Eyes gently lifted, one hand near chin, thoughtful expression.',['concept','hint'],'Pause to consider the material.'],
 ['thoughtful-chin','Thoughtful chin','One hand lightly supporting chin, eyebrows neutral, quiet concentration.',['concept','reflection'],'Consider a relationship or explanation.'],
 ['idea-spark','Idea spark','One index finger raised near shoulder, small bright smile of realization.',['concept','success'],'Mark a connection already supported by the source.'],
 ['focused-reading','Focused reading','Look down at the open teal notebook with steady concentration.',['concept'],'Read the cited source.'],
 ['source-check','Source check','Point with pencil to an open notebook page, careful attentive expression.',['concept','hint','retry'],'Check evidence and conditions.'],
 ['magnifier','Magnifier','Hold a small magnifying glass beside the notebook, curious focused gaze.',['concept','hint'],'Inspect a detail in the source.'],
 ['pointing-left','Pointing left','One hand gestures left with open fingers, eyes toward the indicated direction.',['concept','hint'],'Point toward an interface region; no factual claim.'],
 ['pointing-right','Pointing right','One hand gestures right with open fingers, eyes toward the indicated direction.',['concept','hint'],'Point toward an interface region; no factual claim.'],
 ['pointing-up','Pointing up','One open hand gestures upward, attentive expression.',['concept','hint'],'Direct attention to a visible goal or instruction.'],
 ['pointing-down','Pointing down','One open hand gestures downward, attentive expression.',['concept','hint'],'Direct attention to a visible control or excerpt.'],
 ['presenting','Presenting','One open palm extended sideways as if presenting, notebook held in other hand.',['welcome','concept'],'Introduce a source-backed idea.'],
 ['step-one','Step one','Hold up one finger in a clear gentle counting gesture.',['concept','hint'],'Focus on the first prepared step.'],
 ['step-two','Step two','Hold up two fingers in a clear gentle counting gesture.',['concept','hint'],'Focus on the second prepared step.'],
 ['step-three','Step three','Hold up three fingers in a clear gentle counting gesture.',['concept','hint'],'Focus on the third prepared step.'],
 ['small-step','Small step','Thumb and index finger show a small distance, encouraging calm smile.',['hint','retry'],'Encourage one manageable revision.'],
 ['connecting-ideas','Connecting ideas','Hands move gently toward each other, fingers indicating a connection.',['concept','reflection'],'Relate two ideas using the supplied evidence.'],
 ['compare-options','Compare options','Both open palms held at equal height like balanced alternatives.',['concept','hint','reflection'],'Compare alternatives without revealing a preferred answer.'],
 ['puzzle-piece','Puzzle piece','Hold one simple puzzle piece near chest, curious smile.',['concept','hint'],'Consider how a prepared part fits.'],
 ['building','Building','Hold two simple unmarked blocks, concentrating on bringing them together.',['concept','hint'],'Construct or repair a model.'],
 ['map-guide','Map guide','Hold an unfolded unmarked map with a finger resting on it.',['welcome','concept'],'Orient to the mission route.'],
 ['planning','Planning','Point pencil toward a notebook, deliberate focused look.',['welcome','concept','reflection'],'Choose a plan before acting.'],
 ['hypothesis','Hypothesis','One palm raised questioningly, the other holds notebook, curious eyebrows.',['concept','reflection'],'State a prediction before checking evidence.'],
 ['test-and-observe','Test and observe','One hand indicates the notebook while eyes look attentively outward.',['concept','hint','reflection'],'Notice what the authored model shows after an action.'],
 ['pause-and-think','Pause and think','Hands relaxed together, eyes thoughtfully to one side, still posture.',['hint','retry','reflection'],'Allow time to think; never imply a countdown.'],
 ['question-invite','Question invite','Open palm toward the learner with an attentive welcoming expression.',['welcome','hint','reflection'],'Invite a source question.'],
 ['gentle-hint','Gentle hint','Small sideways pointing gesture with reassuring half-smile.',['hint'],'Offer help only when requested.'],
 ['try-another-way','Try another way','One hand gestures toward an alternate direction, calm hopeful expression.',['retry'],'Invite a different approach without shame.'],
 ['patient-support','Patient support','Relaxed open hands, steady kind gaze, soft neutral smile.',['hint','retry'],'Give patient support without urgency.'],
 ['reset-and-retry','Reset and retry','Small circular gesture with one hand, notebook held steady, calm smile.',['retry'],'Restart a bounded attempt without erasing earned progress.'],
 ['reassuring-nod','Reassuring nod','Head slightly dipped in a reassuring nod, calm friendly expression.',['retry','success'],'Acknowledge effort or progress without judging character.'],
 ['progress-notice','Progress notice','One hand indicates a small step upward, modest satisfied smile.',['success','reflection'],'Notice a specific completed action.'],
 ['quiet-celebration','Quiet celebration','Small closed-hand celebratory gesture near chest, restrained smile.',['success'],'A low-key acknowledgment of a checked result.'],
 ['bright-celebration','Bright celebration','Both hands lifted modestly near shoulders, bright smile.',['success'],'Celebrate a checked result without pressure to continue.'],
 ['thumbs-up','Thumbs up','One thumb raised with a relaxed smile, other hand holding notebook.',['success'],'Acknowledge a supported result.'],
 ['achievement-star','Achievement star','Hold a small decorative star, gentle proud smile.',['success'],'A decorative reward moment; never creates points.'],
 ['understood-nod','Understood nod','Attentive nod with a small smile and open posture.',['success','reflection'],'Acknowledge the learner’s explanation without auto-grading it.'],
 ['reflective','Reflective','Look gently to one side, notebook held against chest, thoughtful expression.',['reflection'],'Reflect on what changed.'],
 ['explain-it-back','Explain it back','Open hand inviting the learner to speak, attentive listening smile.',['reflection'],'Invite self-explanation; free responses remain ungraded.'],
 ['curious-question','Curious question','Head lightly tilted, one palm up, inquisitive expression.',['hint','reflection'],'Ask one useful question.'],
 ['note-taking','Note taking','Write with pencil in teal notebook, focused and relaxed.',['concept','reflection'],'Record an observation or personal note.'],
 ['summary','Summary','Hold notebook facing inward and gesture with one open hand, composed smile.',['reflection'],'Review the source-backed main point.'],
 ['ready-next','Ready for the next step','Notebook closed at side, open ready stance, gentle smile.',['welcome','success'],'Offer the next step as a choice.'],
 ['farewell-wave','Farewell wave','Small relaxed goodbye wave, soft smile and restful posture.',['reflection'],'Make stopping or taking a break welcome.'],
] as const;
export type AsterEmotionId=typeof definitions[number][0];
export interface AsterEmotion {id:AsterEmotionId;name:string;pose:string;moments:readonly AsterMoment[];purpose:string;assetPath:string}
export const ASTER_EMOTIONS:readonly AsterEmotion[]=definitions.map(([id,name,pose,moments,purpose])=>({id,name,pose,moments,purpose,assetPath:`/assets/aster/emotions/${id}.png`}));
const lookup=new Map(ASTER_EMOTIONS.map(emotion=>[emotion.id,emotion]));
export const ASTER_BASE_PORTRAIT='/assets/aster/aster-guide.png';
export function asterEmotionCatalog(moment?:AsterMoment){return ASTER_EMOTIONS.filter(emotion=>!moment||emotion.moments.includes(moment));}
export function isAsterEmotionForMoment(id:unknown,moment:AsterMoment):id is AsterEmotionId{return typeof id==='string'&&lookup.get(id as AsterEmotionId)?.moments.includes(moment)===true;}
export type AsterIntent='reading'|'evidence'|'compare'|'build'|'plan'|'predict'|'observe'|'question'|'explain'|'summarize'|'pause'|'restart'|'farewell'|'connect'|'record'|'orient';
export interface AsterEmotionOptions {
 moment:AsterMoment;preferredId?:unknown;activityKind?:string;quiet?:boolean;
 /** Stable mission/context key, never a clock, render counter or inferred learner emotion. */
 contextSeed?:string;intent?:AsterIntent;
 /** Actual visible one-based step or actual interface direction, not an inferred progress level. */
 step?:number;direction?:'left'|'right'|'up'|'down';
}
const momentPoses:Record<AsterMoment,readonly AsterEmotionId[]>={
 welcome:['welcome-wave','warm-smile','ready-to-begin','open-palms','notebook-ready','presenting','question-invite','ready-next'],
 concept:['focused-reading','thinking','thoughtful-chin','curious-tilt','presenting','notebook-ready'],
 hint:['gentle-hint','patient-support','open-palms','listening','small-step','curious-question','question-invite'],
 retry:['patient-support','try-another-way','small-step','reassuring-nod','open-palms','pause-and-think'],
 success:['quiet-celebration','warm-smile','progress-notice','bright-celebration','thumbs-up','achievement-star','reassuring-nod','understood-nod','ready-next'],
 reflection:['reflective','thoughtful-chin','curious-tilt','listening','pause-and-think','question-invite','curious-question'],
};
// These small pools represent the visible task. Specific gestures are never placed in a generic
// moment pool: a numbered step, direction, restart or farewell needs that real context.
const intentPoses:Record<AsterIntent,readonly AsterEmotionId[]>={
 reading:['focused-reading','notebook-ready','note-taking','source-check','magnifier','thoughtful-chin'],
 evidence:['source-check','magnifier','focused-reading','thoughtful-chin'],
 compare:['compare-options','thinking','thoughtful-chin'],
 build:['building','puzzle-piece'],
 plan:['planning','notebook-ready','thoughtful-chin'],
 predict:['hypothesis','curious-tilt'],
 observe:['test-and-observe','curious-tilt','magnifier','note-taking'],
 question:['listening','question-invite','curious-question','thinking'],
 explain:['explain-it-back','connecting-ideas','presenting','thoughtful-chin','understood-nod','listening'],
 summarize:['summary','reflective','note-taking'],
 pause:['pause-and-think','listening'],
 restart:['reset-and-retry','small-step','try-another-way'],
 farewell:['farewell-wave'],
 connect:['connecting-ideas','thoughtful-chin','idea-spark'],
 record:['note-taking','notebook-ready','reflective'],
 orient:['map-guide','ready-to-begin','presenting','planning'],
};
const activityIntents:Record<string,AsterIntent>={
 construction:'build',completion:'build',sequence:'plan',classification:'compare',decision:'compare',dependency:'connect',
 budget:'plan',rubric:'evidence',diagram:'evidence',scenario:'observe',data:'evidence',explanation:'connect',
 'picture-build':'build',media:'observe',picture:'observe','rule-switch':'compare','child-play':'observe',
};
function gestureMatches(id:AsterEmotionId,options:AsterEmotionOptions):boolean {
 if(id.startsWith('pointing-'))return id===`pointing-${options.direction}`;
 if(id==='step-one'||id==='step-two'||id==='step-three')return id===(['step-one','step-two','step-three'] as const)[(options.step??0)-1];
 if(id==='reset-and-retry')return options.intent==='restart';
 if(id==='farewell-wave')return options.intent==='farewell';
 return true;
}
/** Select from the appropriate context pool without changing on rerender or consulting a clock. */
function seededIndex(seed:string,length:number):number {
 let hash=2166136261;
 for(let i=0;i<seed.length;i++){hash^=seed.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return(hash>>>0)%length;
}
export function resolveAsterEmotion(options:AsterEmotionOptions):AsterEmotion {
 // Quiet mode is a learner preference, and takes precedence over a generated celebration.
 if(options.quiet&&options.moment==='success')return lookup.get('quiet-celebration')!;
 if(isAsterEmotionForMoment(options.preferredId,options.moment)&&gestureMatches(options.preferredId,options))return lookup.get(options.preferredId)!;
 if(options.moment==='concept'||options.moment==='hint'){
  if(options.direction)return lookup.get(`pointing-${options.direction}`)!;
  if(Number.isInteger(options.step)&&options.step!>=1&&options.step!<=3)return lookup.get((['step-one','step-two','step-three'] as const)[options.step!-1])!;
 }
 // An activity kind describes the task while concept/hint is visible; it must never override
 // feedback (for example, a construction result still gets a success or retry expression).
 const intent=options.intent??((options.moment==='concept'||options.moment==='hint')?activityIntents[options.activityKind??'']:undefined);
 const pool=!options.intent&&options.activityKind==='completion'&&(options.moment==='concept'||options.moment==='hint')?(['puzzle-piece','thinking','magnifier'] as const):intent?intentPoses[intent]:[];
 let candidates=pool.filter(id=>isAsterEmotionForMoment(id,options.moment)&&gestureMatches(id,options));
 if(!candidates.length)candidates=[...momentPoses[options.moment]];
 // Keep first-pose fallback deterministic for old callers that do not supply a context seed.
 const index=options.contextSeed?seededIndex(`${options.moment}:${intent??''}:${options.activityKind??''}:${options.contextSeed}`,candidates.length):0;
 return lookup.get(candidates[index])!;
}

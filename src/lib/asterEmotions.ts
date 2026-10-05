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
export function resolveAsterEmotion(options:{moment:AsterMoment;preferredId?:unknown;activityKind?:string;quiet?:boolean}):AsterEmotion {
 if(options.quiet&&options.moment==='success')return lookup.get('quiet-celebration')!;
 if(isAsterEmotionForMoment(options.preferredId,options.moment))return lookup.get(options.preferredId)!;
 const defaults:Record<AsterMoment,AsterEmotionId>={welcome:'welcome-wave',concept:'focused-reading',hint:'gentle-hint',retry:'patient-support',success:'quiet-celebration',reflection:'reflective'};
 const kinds:Record<string,AsterEmotionId>={construction:'building',completion:'puzzle-piece',sequence:'step-one',classification:'compare-options',dependency:'connecting-ideas',budget:'planning',diagram:'magnifier',scenario:'test-and-observe',data:'source-check',explanation:'connecting-ideas','picture-build':'building'};
 const id=options.moment==='concept'&&kinds[options.activityKind??'']?kinds[options.activityKind!]:defaults[options.moment];
 return lookup.get(id)!;
}

import type {EvidenceReference,LearningCard,Source} from '../types';
import {compileNotebook} from './compiler';
import {sourceLearningUnits} from './sourceUnits';
import {textDigest} from './evidence';
import {normalizeText} from './utils';
import {extractStructuredActivities,validateActivity} from './structuredEngine';
import type {StructuredActivity,SourceReference} from './structuredEngine';
import type {MediaActivity} from './mediaEngine';
import {validateMediaTranscript,prepareTranscriptSource,detectTranscriptFormat,normalizeMediaTranscript} from './mediaTranscript';
import type {MediaTranscript,MediaTranscriptSegment} from './mediaTranscript';

export interface MediaCheckpointCandidate {
 id:string;at:number|null;prompt:string;answer:string;choices:string[];correctIndex:number;reason:string;
 kind:'definition'|'cloze'|'sequence'|'observation';evidence:EvidenceReference[];segmentIds:string[];confidence?:number;uncertain:boolean;selectedByDefault:boolean;warnings:string[];
}
export interface MediaLearningOptions {mediaRevision?:string;duration?:number;maxCheckpoints?:number;selectedCheckpointIds?:string[];minCheckpointGap?:number}
export interface MediaLearningResult {
 transcriptSource:Source;checkpointCandidates:MediaCheckpointCandidate[];mediaActivity?:MediaActivity;activities:StructuredActivity[];cards:LearningCard[];warnings:string[];
}
function timestamp(value:number){return `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;}
function reference(source:Source,transcript:MediaTranscript,start:number,end:number):EvidenceReference {
 const segments=transcript.segments.filter(segment=>segment.endOffset>start&&segment.startOffset<end),first=segments[0],last=segments.at(-1);
 const timed=first?.start!==null&&last?.end!==null;
 return{sourceId:source.id,sourceRevision:transcript.sourceRevision,start,end,quote:source.text.slice(start,end),locator:{kind:timed?'timestamp':'text',label:timed?`${timestamp(first.start!)}–${timestamp(last!.end!)}${transcript.timing==='estimated'?' · estimated':''}`:'Transcript text',lineStart:source.text.slice(0,start).split('\n').length,lineEnd:source.text.slice(0,end).split('\n').length}};
}
function candidateFromCard(card:LearningCard,source:Source,transcript:MediaTranscript):MediaCheckpointCandidate|undefined {
 if(!['definition','cloze','sequence'].includes(card.questionType??''))return;
 const start=source.text.indexOf(card.evidence);if(start<0||card.options.length<2||card.options.length>8||card.answer.length>240||card.options.some(option=>!source.text.includes(option)))return;
 const options=[...new Set(card.options.map(normalizeText))];if(options.length!==card.options.length)return;
 const question=card.prompt.split('\n\n').slice(1).join('\n\n');
 if(card.questionType==='cloze'&&(card.answer.length<5||question.includes(card.answer)))return;
 const end=start+card.evidence.length,segments=transcript.segments.filter(segment=>segment.endOffset>start&&segment.startOffset<end);if(!segments.length)return;
 const endTime=segments.at(-1)?.end??null,confidences=segments.map(segment=>segment.confidence).filter((value):value is number=>value!==undefined),confidence=confidences.length===segments.length?Math.min(...confidences):undefined;
 const uncertain=segments.some(segment=>segment.uncertain||segment.confidence!==undefined&&segment.confidence<.65),warnings:string[]=[];
 if(uncertain)warnings.push('This answer depends on uncertain transcript text. Verify it against the recording before selecting it.');
 if(transcript.format==='asr'&&confidence===undefined)warnings.push('Recognition confidence is unavailable; compare the exact answer with the recording.');
 if(transcript.timing==='estimated')warnings.push('This pause time is estimated from text length and needs alignment review.');
 if(card.questionType==='cloze')warnings.push('This checks exact wording rather than application or deeper understanding.');
 return{id:`checkpoint-${textDigest(source.id+transcript.sourceRevision+card.prompt+card.evidence).slice(0,24)}`,at:endTime,prompt:card.prompt,answer:card.answer,choices:card.options,correctIndex:card.correctIndex,reason:card.explanation,kind:card.questionType as MediaCheckpointCandidate['kind'],evidence:[reference(source,transcript,start,end)],segmentIds:segments.map(segment=>segment.id),...(confidence===undefined?{}:{confidence}),uncertain,selectedByDefault:false,warnings};
}

/** Ordinary speech supports listening and reflection without manufacturing a test answer. */
function observationCandidates(source:Source,transcript:MediaTranscript,questions:MediaCheckpointCandidate[]):MediaCheckpointCandidate[]{
 return sourceLearningUnits(source).filter(unit=>unit.quote.trim().length>=40&&unit.passages.some(p=>p.kind!=='code')&&!/^\s*\[(?:music|applause|silence)\]/i.test(unit.quote)&&!questions.some(q=>q.evidence.some(ref=>ref.start<unit.end&&ref.end>unit.start))).map(unit=>{
  const segments=transcript.segments.filter(segment=>segment.endOffset>unit.start&&segment.startOffset<unit.end),last=segments.at(-1),uncertain=segments.some(s=>s.uncertain||s.confidence!==undefined&&s.confidence<.65);
  return{id:`checkpoint-observation-${textDigest(source.id+transcript.sourceRevision+unit.id).slice(0,24)}`,at:last?.end??null,prompt:`Listen to this passage. What do you notice, and which words in the recording support your observation?`,answer:'',choices:[],correctIndex:-1,reason:'This is a source-based field note for self or mentor review. There is no automatic answer key.',kind:'observation' as const,evidence:[reference(source,transcript,unit.start,unit.end)],segmentIds:segments.map(s=>s.id),uncertain,selectedByDefault:false,warnings:['Open reflection: no automatic correctness grade, mastery or points.',...(uncertain?['This transcript passage is uncertain. Compare it with the recording.']:[]),...(transcript.timing==='estimated'?['This pause time is estimated and needs alignment review.']:[])]};
 });
}

/** Group display cues without changing their exact text. Fine-grained recognition cues remain in source metadata. */
function timelineCues(source:Source,transcript:MediaTranscript):{start:number;end:number;text:string;startOffset:number;endOffset:number}[] {
 const timed=transcript.segments.filter((segment):segment is MediaTranscriptSegment&{start:number;end:number}=>segment.start!==null&&segment.end!==null);
 if(timed.length<=1000)return timed;
 const groups:{start:number;end:number;text:string;startOffset:number;endOffset:number}[]=[];
 for(const segment of timed){const previous=groups.at(-1);if(previous&&segment.endOffset-previous.startOffset<=3000){previous.end=Math.max(previous.end,segment.end);previous.endOffset=segment.endOffset;previous.text=source.text.slice(previous.startOffset,previous.endOffset);}else groups.push({...segment});}
 return groups;
}
function makeActivity(recording:Source,source:Source,transcript:MediaTranscript,selected:MediaCheckpointCandidate[],warnings:string[]):MediaActivity|undefined {
 const duration=transcript.duration;if(!duration||!selected.length)return;
 const cues=timelineCues(source,transcript);if(!cues.length||cues.length>1000){warnings.push('The transcript has too many independent cue blocks for one timeline. Split it into chapters before making a timed game.');return;}
 if(cues.length<transcript.segments.length)warnings.push(`The ${transcript.segments.length} detailed transcript segments were grouped into ${cues.length} display cues; original segment timings and uncertainty remain in the source.`);
 const refs:SourceReference[]=[];let blockStart=cues[0].startOffset,blockEnd=cues[0].endOffset;
 const addBlock=()=>{refs.push({sourceId:source.id,evidence:source.text.slice(blockStart,blockEnd)});};
 for(const cue of cues.slice(1)){if(cue.endOffset-blockStart>18000){addBlock();blockStart=cue.startOffset;}blockEnd=cue.endOffset;}addBlock();
 const evidenceIndex=(text:string,locator?:string)=>{const existing=refs.findIndex(ref=>ref.evidence.includes(text));if(existing>=0)return existing;refs.push({sourceId:source.id,evidence:text,...(locator?{locator}:{})});return refs.length-1;};
 const checkpoints:MediaActivity['checkpoints']=selected.map(candidate=>({...candidate.kind==='observation'?{mode:'observation' as const}:{},id:candidate.id,at:candidate.at!,prompt:candidate.prompt,choices:candidate.choices.map((label,index)=>({id:`choice-${index+1}`,label})),correctChoiceIds:candidate.kind==='observation'?[]:[`choice-${candidate.correctIndex+1}`],reason:candidate.reason,evidenceRefs:candidate.evidence.map(ref=>evidenceIndex(ref.quote,ref.locator.label))}));
 const selectedKey=selected.map(candidate=>candidate.id).join('|');
 const activity:MediaActivity={version:1,kind:'media',id:`media-draft-${textDigest(recording.id+transcript.mediaRevision+transcript.sourceRevision+selectedKey).slice(0,32)}`,title:`${recording.title.slice(0,300)} · listening checkpoints`,instruction:selected.some(c=>c.kind==='observation')?'Listen or watch, pause to record what you notice, and connect your field notes to the supplied recording. Revisit any segment and compare interpretations without an automatic answer key.':'Listen or watch, pause at the prepared checkpoints, and retrieve the source concepts. You can revisit any segment and use the transcript.',sourceRefs:refs,reviewStatus:'needs-review',extractedFrom:source.id,scaffoldIds:['media-checkpoints'],explanation:selected.some(c=>c.kind==='observation')?'Observation checkpoints preserve the source and invite self or mentor review. They do not award points or independent mastery. Verify recognition and checkpoint timing against the recording.':'Answers and alternatives are quoted from the supplied transcript. The author must verify recognition, meaning and checkpoint timing before awarding learning credit.',hint:'Replay the linked segment and compare it with the exact transcript excerpt.',mediaSourceId:recording.id,duration,cues:cues.map((cue,index)=>({id:`timeline-${index+1}`,start:cue.start,end:Math.min(duration,cue.end),text:cue.text,evidenceRefs:[evidenceIndex(cue.text)]})),checkpoints};
 const checked=validateActivity(activity);if(!checked.success){warnings.push(`Timed draft was not created: ${checked.errors[0]}`);return;}return activity;
}
/** Extractive pipeline: input text determines every answer, alternative and explicit structural rule. */
export function buildMediaLearningCandidates(recording:Source,inputSource:Source,options:MediaLearningOptions={}):MediaLearningResult {
 const warnings:string[]=[];let source=inputSource;const empty=():MediaLearningResult=>({transcriptSource:source,checkpointCandidates:[],activities:[],cards:[],warnings});
 if(!['audio','video'].includes(recording.kind)||!recording.asset&&!recording.dataUrl){warnings.push('Attach the original audio or video recording before preparing its learning timeline.');return empty();}
 const mediaRevision=options.mediaRevision??recording.asset?.sha256??inputSource.transcript?.mediaRevision;
 if(!mediaRevision){warnings.push('The recording byte checksum is required to bind its transcript. Reimport or select the original recording.');return empty();}
 if(recording.asset?.sha256&&recording.asset.sha256!==mediaRevision){warnings.push('The supplied transcript checksum does not match the attached recording bytes.');return empty();}
 try{
  if(source.transcript){validateMediaTranscript(source.transcript,source.text);if(source.transcript.mediaSourceId!==recording.id||source.transcript.mediaRevision!==mediaRevision)throw new Error('This transcript is bound to another recording or another revision of its bytes.');}
  else{const prepared=prepareTranscriptSource(recording,{format:detectTranscriptFormat(source.text,source.originalFile?.name??source.title),text:source.text},{id:source.id,title:source.title,addedAt:source.addedAt,mediaRevision,duration:options.duration??recording.asset?.duration});source={...source,...prepared};}
 }catch(error){warnings.push((error as Error).message);return empty();}
 const knownDuration=options.duration??recording.asset?.duration;
 if(knownDuration!==undefined&&knownDuration!==source.transcript!.duration){try{if(source.transcript!.timing==='provided'||source.transcript!.edited){if(source.transcript!.edited&&source.transcript!.segments.some(segment=>segment.end!==null&&segment.end>knownDuration))throw new Error('An edited transcript cue ends after the recording duration. Correct its time before preparing checkpoints.');source={...source,transcript:validateMediaTranscript({...source.transcript!,duration:knownDuration},source.text)};}else{const prepared=normalizeMediaTranscript({format:'plain',text:source.text},{mediaSourceId:recording.id,mediaRevision,duration:knownDuration});source={...source,text:prepared.text,transcript:prepared.transcript};}}catch(error){warnings.push((error as Error).message);return empty();}}
 const transcript=source.transcript!;warnings.push(...transcript.warnings);
 const compiled=compileNotebook([source],{maxCards:300});
 const questions=compiled.cards.map(card=>candidateFromCard(card,source,transcript)).filter((candidate):candidate is MediaCheckpointCandidate=>!!candidate);
 const candidates=[...questions,...observationCandidates(source,transcript,questions)];
 const requestedMax=options.maxCheckpoints??(options.selectedCheckpointIds?.length||8);
 const max=Math.max(1,Math.min(40,Math.floor(Number.isFinite(requestedMax)?requestedMax:8)));
 const requestedGap=options.minCheckpointGap??Math.min(8,Math.max(1,(transcript.duration??60)/30));
 const gap=Math.max(.01,Math.min(600,Number.isFinite(requestedGap)?requestedGap:1));
 const selected:MediaCheckpointCandidate[]=[];const selectedIds=options.selectedCheckpointIds?new Set(options.selectedCheckpointIds):undefined;
 const ranked=[...candidates].sort((a,b)=>({definition:3,sequence:2,cloze:1,observation:0}[b.kind]-{definition:3,sequence:2,cloze:1,observation:0}[a.kind])||(a.at??Infinity)-(b.at??Infinity)||a.id.localeCompare(b.id));
 const distributed=selectedIds?[]:Array.from({length:max},(_,index)=>ranked.find(candidate=>!candidate.uncertain&&candidate.at!==null&&candidate.at>=(transcript.duration??0)*index/max&&candidate.at<=(transcript.duration??0)*(index+1)/max)).filter((candidate):candidate is MediaCheckpointCandidate=>!!candidate);
 for(const candidate of [...new Map([...distributed,...ranked].map(candidate=>[candidate.id,candidate])).values()]){if(selected.length>=max)break;if(selectedIds?!selectedIds.has(candidate.id):candidate.uncertain)continue;if(candidate.at===null||!transcript.duration||candidate.at>transcript.duration)continue;if(selected.some(value=>Math.abs(value.at!-candidate.at!)<(selectedIds?0.01:gap)))continue;candidate.selectedByDefault=!selectedIds;selected.push(candidate);}
 selected.sort((a,b)=>a.at!-b.at!||a.id.localeCompare(b.id));
 if(selectedIds&&[...selectedIds].some(id=>!candidates.some(candidate=>candidate.id===id)))warnings.push('Some previously selected questions no longer match this transcript revision and were omitted.');
 if(selectedIds&&selectedIds.size!==selected.length)warnings.push('Not all selected questions could become checkpoints: use distinct times within the recording and at most 40 questions.');
 const mediaActivity=makeActivity(recording,source,transcript,selected,warnings);
 const units=sourceLearningUnits(source);const extracted=extractStructuredActivities(units.filter(unit=>!unit.passages.some(p=>p.kind==='code')).map(unit=>({...source,text:unit.quote})));const richer=extracted.activities.filter(activity=>activity.kind==='classification'||activity.kind==='sequence'&&activity.sourceRefs.some(ref=>units.some(unit=>unit.kind==='procedure'&&unit.quote.includes(ref.evidence)))).slice(0,12).map(activity=>({...activity,id:`media-${activity.kind}-${textDigest(transcript.mediaRevision+transcript.sourceRevision+activity.id).slice(0,28)}`,reviewStatus:'needs-review' as const,extractedFrom:source.id,scaffoldIds:activity.kind==='sequence'?['process-reconstruction']:['classification-workshop']}));
 const chosen=new Set((selectedIds?[...selectedIds]:selected.length?selected.map(candidate=>candidate.id):ranked.filter(candidate=>!candidate.uncertain).slice(0,max).map(candidate=>candidate.id)));
 const cards=candidates.filter((candidate):candidate is MediaCheckpointCandidate&{kind:'definition'|'cloze'|'sequence'}=>candidate.kind!=='observation'&&chosen.has(candidate.id)).map((candidate):LearningCard=>({id:`media-card-${candidate.id.slice('checkpoint-'.length)}`,prompt:candidate.prompt,answer:candidate.answer,options:[...candidate.choices],correctIndex:candidate.correctIndex,explanation:candidate.reason,sourceId:source.id,evidence:candidate.evidence[0].quote,concept:candidate.answer,tags:['source-recall','media-transcript',candidate.kind],questionType:candidate.kind,reviewStatus:'needs-review'}));
 if(candidates.some(c=>c.kind==='observation'))warnings.push('Passages without a safe source question became listening observations. Field notes are unscored reflections, not invented quiz answers.');
 if(!candidates.length)warnings.push('No useful source-recall questions were extracted. Add a clearer transcript or author a specific application task; no filler questions were created.');
 else if(!mediaActivity)warnings.push('No timed activity was created. Supply valid timing, resolve uncertain passages, or select distinct reviewable questions. Text-based draft practice remains available when supported.');
 if(!richer.length)warnings.push('No explicit numbered procedure or Category > item structure was found. The recording was not turned into an invented sequence or classification game.');
 if(candidates.length>max)warnings.push(`Suggested ${selected.length} timed checkpoints from ${candidates.length} source-grounded candidates. You can change the selection before saving.`);
 warnings.push('All generated learning material is an unreviewed draft. Check the recording, transcript, answer alternatives and timing; quoted evidence alone does not verify meaning.');
 return{transcriptSource:source,checkpointCandidates:candidates.sort((a,b)=>(a.at??Infinity)-(b.at??Infinity)||a.id.localeCompare(b.id)),...(mediaActivity?{mediaActivity}:{}),activities:[...(mediaActivity?[mediaActivity]:[]),...richer],cards,warnings:[...new Set(warnings)].slice(0,20)};
}
/** Replace only this pipeline's unreviewed outputs; preserve manually authored and approved models. */
export function replaceMediaDrafts(existing:StructuredActivity[],generated:StructuredActivity[],transcriptSourceId:string):StructuredActivity[]{
 const retained=existing.filter(activity=>!(activity.reviewStatus==='needs-review'&&activity.extractedFrom===transcriptSourceId&&/^media-(?:draft|sequence|classification)-/.test(activity.id)));const ids=new Set(retained.map(activity=>activity.id));return[...retained,...generated.filter(activity=>activity.extractedFrom===transcriptSourceId&&activity.reviewStatus==='needs-review'&&!ids.has(activity.id))];
}

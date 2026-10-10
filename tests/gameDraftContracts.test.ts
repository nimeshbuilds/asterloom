import {describe,expect,it} from 'vitest';
import type {Source} from '../src/types';
import {GAME_DRAFT_SCHEMAS,gameDraftContract,gameDraftSourceContext,validatePreparedGameDraft,type GameDraftKind} from '../src/lib/gameDraftAdapters';
import {fitsSpecificContract} from '../src/lib/scaffoldRuntime';
import {evaluateActivityForAuthoring,ACTIVITY_EXAMPLES,type StructuredActivity} from '../src/lib/structuredEngine';
import {COMPLETION_EXAMPLES,DATA_EXAMPLES,EXTENDED_EXAMPLE_SOURCES,trainingToneSource} from '../src/lib/extendedExamples';
import {COMPOSITION_MODE_EXAMPLES,COMPOSITION_MODE_EXAMPLE_SOURCE} from '../src/lib/compositionModeExamples';
import {SCENARIO_MODE_EXAMPLES,SCENARIO_MODE_SOURCES} from '../src/lib/scenarioModeExamples';
import {SCENARIO_INTERACTION_EXAMPLES,SCENARIO_INTERACTION_SOURCES} from '../src/lib/scenarioInteractionExamples';
import {PICTURE_BUILD_EXAMPLES,PICTURE_BUILD_EXAMPLE_SOURCE} from '../src/lib/pictureBuildExamples';
import {pictureDiscoveryFixture,pictureWordFixture,pictureSources} from '../src/data/pictureFixtures';
import {normalizeMediaTranscript} from '../src/lib/mediaTranscript';
import {recordingDigest} from '../src/lib/mediaAssets';
import type {MediaActivity} from '../src/lib/mediaEngine';
import {computeDataAnswer} from '../src/lib/dataEngine';
import {PLANT_EXPLANATION,COMPOSITION_EXAMPLE_SOURCE} from '../src/lib/compositionExamples';

const clone=<T>(v:T):T=>structuredClone(v);
function source(text:string,id='authoring-source'):Source{return{id,title:'Explicit authoring source',text,kind:'text',status:'ready',addedAt:'2026-10-10'};}
function draft(activity:StructuredActivity):Record<string,unknown>{const model=clone(activity);delete model.scaffoldIds;delete model.extractedFrom;return model as unknown as Record<string,unknown>;}
function prepare(activity:StructuredActivity,s:Source,assets:Source[]=[]){return validatePreparedGameDraft(s,s.text,{activity:draft(activity)},'generated-draft',[activity.kind as GameDraftKind],assets);}
function singleCitation(activity:StructuredActivity,s:Source):StructuredActivity{
 // Combine source windows without changing any statement, field, answer or rule.
 // The authoring limit is eight references, whereas manually authored campaigns may have nine.
 const value=draft(activity);value.sourceRefs=[{sourceId:s.id,evidence:s.text}];
 const walk=(v:unknown):void=>{if(Array.isArray(v)){v.forEach(walk);return;}if(v&&typeof v==='object')for(const [key,entry]of Object.entries(v)){if(key==='evidenceRefs')(v as Record<string,unknown>)[key]=[0];else walk(entry);}};walk(value);
 return value as unknown as StructuredActivity;
}
function pictureInputs(mode:'discovery'|'word-picture'='discovery'){
 const activity=clone(mode==='discovery'?pictureDiscoveryFixture:pictureWordFixture),s=clone(pictureSources[0]);
 const regions=activity.tokens.map(({label,x,y,width,height})=>({label,x,y,width,height}));
 s.text+='\nPicture regions: '+JSON.stringify(regions);
 return{activity,source:s};
}
function mediaInputs(){
 const recording=trainingToneSource();
 const prepared=normalizeMediaTranscript({format:'srt',text:'1\n00:00:00,000 --> 00:00:01,000\nA low 220 Hz tone sounds first.\n\n2\n00:00:02,000 --> 00:00:03,000\nA higher 440 Hz tone sounds second.'},{mediaSourceId:recording.id,mediaRevision:recordingDigest(recording),duration:4});
 const s:Source={...source(prepared.text,'timed-source'),kind:'transcript',transcript:prepared.transcript};
 const activity:MediaActivity={version:1,id:'media-draft',kind:'media',title:'Compare the supplied tones',instruction:'Listen and choose the first tone.',explanation:'The supplied cue identifies the low tone first.',hint:'Replay the first cue.',reviewStatus:'needs-review',sourceRefs:[{sourceId:s.id,evidence:s.text}],mediaSourceId:recording.id,duration:4,cues:prepared.transcript.segments.map(cue=>({id:cue.id,start:cue.start!,end:cue.end!,text:cue.text,evidenceRefs:[0]})),checkpoints:[{id:'first',at:1,prompt:'Which tone came first?',choices:[{id:'low',label:'Low 220 Hz tone'},{id:'high',label:'Higher 440 Hz tone'}],correctChoiceIds:['low'],reason:'The first provided cue names the low 220 Hz tone.',evidenceRefs:[0]}]};
 return{activity,source:s,recording};
}

describe('bounded authoring for formerly excluded contracts',()=>{
 it('provides real family fields and recipe-specific presentations without relabeling base models',()=>{
  for(const kind of ['recall','decision','rubric','diagram','data','media','picture','picture-build'])expect(GAME_DRAFT_SCHEMAS[kind as GameDraftKind]).toBeTruthy();
  expect(gameDraftContract('scenario','prediction-and-experiment')).toContain('acceptedFinalHypothesisIds');
  expect(gameDraftContract('scenario','strategy-campaign')).toContain('changedContext');
  expect(gameDraftContract('scenario','perspective-switching-drama')).toContain('requiredRoleIds');
  expect(gameDraftContract('scenario','language-dialogue-trail')).toContain('utterance');
  expect(gameDraftContract('scenario','prompt-experiment-bench')).toContain('recordedAt');
  expect(gameDraftContract('explanation','partner-helper')).toContain('argumentIds');
  expect(gameDraftContract('explanation','secure-code-review')).toContain('explanationAlternativeId');
  expect(gameDraftContract('completion','pattern-parade')).toContain('pattern:{cycle');
  expect(gameDraftContract('scenario','fault-diagnosis')).not.toContain('Required scenarioPresentation:');
  expect(()=>gameDraftContract('dependency','secure-code-review')).toThrow(/unsupported/);
 });
 it('validates and preserves every specialized scenario with its actual source-backed presentation',()=>{
  const examples=[...SCENARIO_MODE_EXAMPLES,...SCENARIO_INTERACTION_EXAMPLES],sources=[...SCENARIO_MODE_SOURCES,...SCENARIO_INTERACTION_SOURCES];
  for(const activity of examples){
   const s=sources.find(s=>s.id===activity.sourceRefs[0].sourceId)!,input=singleCitation(activity,s),checked=prepare(input,s);
   expect(checked.reviewStatus).toBe('needs-review');expect(checked).not.toHaveProperty('scaffoldIds');
   for(const recipe of activity.scaffoldIds??[])expect(fitsSpecificContract(recipe,checked),recipe).toBe(true);
   const base=clone(checked);if(base.kind==='scenario')delete base.scenarioPresentation;
   for(const recipe of activity.scaffoldIds??[])expect(fitsSpecificContract(recipe,base),recipe).toBe(false);
  }
 });
 it('describes explanation alternatives as accepted chains and matches the actual correct/distractor behavior',()=>{
  for(const recipe of ['argument-construction','structured-teach-back','partner-helper','secure-code-review']){
   const contract=gameDraftContract('explanation',recipe);
   expect(contract).toContain('EVERY arguments.alternatives entry is an ACCEPTED CORRECT explanation chain');
   expect(contract).toContain('One fully supported alternative is enough');
   expect(contract).toContain('unordered evidenceIds set');
  }
  const activity=prepare(PLANT_EXPLANATION,COMPOSITION_EXAMPLE_SOURCE);
  if(activity.kind!=='explanation')throw Error('Expected explanation fixture.');
  const argument=activity.arguments[0];
  for(const alternative of argument.alternatives){
   const chain={claimId:alternative.claimId,evidenceIds:alternative.evidenceIds,warrantId:alternative.warrantId,counterpointId:alternative.counterpointId??'',rebuttalId:alternative.rebuttalId??''};
   expect(evaluateActivityForAuthoring(activity,{arguments:{[argument.id]:chain}}).correct).toBe(true);
   expect(evaluateActivityForAuthoring(activity,{arguments:{[argument.id]:{...chain,claimId:'claim-universal',warrantId:'warrant-overreach'}}}).correct).toBe(false);
  }
  const duplicate=clone(activity),first=duplicate.arguments[0].alternatives[0];
  duplicate.arguments[0].alternatives.push({...first,id:'reworded-copy',evidenceIds:[...first.evidenceIds].reverse(),explanation:'Different feedback cannot make the same accepted chain distinct.'});
  expect(()=>prepare(duplicate,COMPOSITION_EXAMPLE_SOURCE)).toThrow(/Duplicate explanation alternatives/);
 });
 it('validates genuine partner and source-code modes, retaining their exact evidence and review boundary',()=>{
  for(const activity of COMPOSITION_MODE_EXAMPLES){const checked=prepare(activity,COMPOSITION_MODE_EXAMPLE_SOURCE);expect(checked.reviewStatus).toBe('needs-review');for(const recipe of activity.scaffoldIds??[])expect(fitsSpecificContract(recipe,checked),recipe).toBe(true);}
  const invalid=clone(COMPOSITION_MODE_EXAMPLES.find(a=>a.codeReview)!);invalid.codeReview!.code='invented source code';expect(()=>prepare(invalid,COMPOSITION_MODE_EXAMPLE_SOURCE)).toThrow(/exactly/);
 });
 it('accepts a declared cycle but rejects contradictory generated extensions',()=>{
  const pattern=COMPLETION_EXAMPLES.find(activity=>activity.pattern)!,s=EXTENDED_EXAMPLE_SOURCES[0],checked=prepare(pattern,s);
  expect(fitsSpecificContract('pattern-parade',checked)).toBe(true);
  const invalid=clone(pattern);invalid.slots[0].acceptedTokenIds=['triangle'];expect(()=>prepare(invalid,s)).toThrow(/contradicts/);
 });
 it('checks feasible build-and-tell witnesses and preserves human review for telling',()=>{
  for(const activity of PICTURE_BUILD_EXAMPLES){const checked=prepare(activity,PICTURE_BUILD_EXAMPLE_SOURCE);expect(fitsSpecificContract('build-and-tell',checked)).toBe(true);}
  const invalid=clone(PICTURE_BUILD_EXAMPLES[0]);invalid.referenceBuilds[0].parts[0].y=1;expect(()=>prepare(invalid,PICTURE_BUILD_EXAMPLE_SOURCE)).toThrow(/Reference picture/);
 });
 it('accepts actual dataset values and computes every source-backed question',()=>{
  for(const activity of DATA_EXAMPLES){const checked=prepare(activity,EXTENDED_EXAMPLE_SOURCES[0]);const response={answers:Object.fromEntries(activity.questions.map(q=>[q.id,String(computeDataAnswer(activity,q).value)])),evidenceRows:Object.fromEntries(activity.questions.map(q=>[q.id,computeDataAnswer(activity,q).rowIds]))};expect(evaluateActivityForAuthoring(checked,response).correct).toBe(true);}
 });
 it('authors explicit decisions and positional diagrams with feasible answer witnesses',()=>{
  for(const kind of ['decision','diagram']as const){const activity=ACTIVITY_EXAMPLES.find(a=>a.kind===kind)!;const s=source(activity.sourceRefs[0].evidence,activity.sourceRefs[0].sourceId),checked=prepare(activity,s);
   const response=kind==='decision'?{choiceId:'allow'}:{placements:{input:'left',transform:'center',output:'right'}};expect(evaluateActivityForAuthoring(checked,response).correct).toBe(true);
  }
  const invalid=clone(ACTIVITY_EXAMPLES.find(a=>a.kind==='decision')!);if(invalid.kind==='decision')invalid.rules[0].when={op:'eq',field:'undisclosed',value:true};expect(()=>prepare(invalid,source(invalid.sourceRefs[0].evidence,invalid.sourceRefs[0].sourceId))).toThrow(/supplied case fields/);
 });
 it('authors source-written free recall with exact accepted terms and keeps reveals supported',()=>{
  const s=source('A queue is a list of jobs waiting to run. FIFO means first in, first out.');
  const activity:StructuredActivity={version:1,id:'recall-draft',kind:'recall',title:'Recall the queue terms',instruction:'Write the source term.',explanation:'The source names the waiting list a queue.',hint:'Read the definition.',reviewStatus:'needs-review',sourceRefs:[{sourceId:s.id,evidence:s.text}],questions:[{id:'term',prompt:'What does the source call a list of jobs waiting to run?',answer:'queue',acceptedAnswers:[],reason:'The source defines a queue as a list of jobs waiting to run.',evidenceRefs:[0]}]};
  const checked=prepare(activity,s);expect(fitsSpecificContract('recall-escape-mission',checked)).toBe(true);
  expect(evaluateActivityForAuthoring(checked,{answers:{term:'QUEUE'},revealedIds:[],selectedQuestionId:'term'})).toMatchObject({correct:true,hintUsed:false});
  expect(evaluateActivityForAuthoring(checked,{answers:{term:'queue'},revealedIds:['term'],selectedQuestionId:'term'})).toMatchObject({correct:true,hintUsed:true});
  activity.questions[0].acceptedAnswers=['pending tasks'];expect(()=>prepare(activity,s)).toThrow(/verbatim/);
 });
 it('requires an exact rubric sample and keeps self assessment ungraded',()=>{
  const activity=clone(ACTIVITY_EXAMPLES.find(a=>a.kind==='rubric')!);if(activity.kind!=='rubric')throw Error('fixture');
  const s=source(activity.sourceRefs[0].evidence+'\nSample: '+activity.sample,activity.sourceRefs[0].sourceId);activity.sourceRefs=[{sourceId:s.id,evidence:s.text}];
  const checked=prepare(activity,s);expect(evaluateActivityForAuthoring(checked,{ratings:{evidence:1}}).correct).toBe(true);
  expect(()=>prepare(activity,{...s,text:activity.sample.replace('12','13')})).toThrow();
  activity.mode='self-assessment';delete activity.criteria[0].expectedLevel;expect(evaluateActivityForAuthoring(prepare(activity,s),{ratings:{evidence:0}})).toMatchObject({correct:null,outcome:'self-reviewed'});
 });
});

describe('AI attachment disclosure and primary-unit provenance',()=>{
 it('discloses only supplied region metadata, never raster bytes or guessed coordinates',()=>{
  for(const mode of ['discovery','word-picture']as const){const {activity,source:s}=pictureInputs(mode),context=gameDraftSourceContext(s,s.text);expect(context.picture?.regions).toHaveLength(3);expect(JSON.stringify(context)).not.toMatch(/base64|data:image/);const checked=prepare(activity,s);expect(fitsSpecificContract(mode==='discovery'?'discovery-scenes':'word-and-picture-workshop',checked)).toBe(true);}
  expect(gameDraftSourceContext(pictureSources[0],pictureSources[0].text)).toEqual({});
  const {activity,source:s}=pictureInputs();activity.tokens[0].x++;expect(()=>prepare(activity,s)).toThrow(/coordinates/);
  expect(()=>prepare(pictureInputs().activity,{...s,dataUrl:undefined})).toThrow(/attach a PNG/);
 });
 it('validates a real supplied recording and copies only exact provided cue timing',()=>{
  const {activity,source:s,recording}=mediaInputs(),context=gameDraftSourceContext(s,s.text,[recording]);expect(context.recording).toMatchObject({sourceId:recording.id,duration:4,cues:[{start:0,end:1},{start:2,end:3}]});expect(JSON.stringify(context)).not.toContain('base64');
  const checked=prepare(activity,s,[recording]);expect(evaluateActivityForAuthoring(checked,{answers:{first:'low'}}).correct).toBe(true);
  const changed=clone(activity);changed.cues[0].end=1.5;expect(()=>prepare(changed,s,[recording])).toThrow(/exact provided/);
  const guessed=clone(activity);guessed.checkpoints[0].at=1.1;expect(()=>prepare(guessed,s,[recording])).toThrow(/end of a cited/);
 });
 it('rejects unavailable, stale, estimated or uncertain media evidence',()=>{
  const {activity,source:s,recording}=mediaInputs();expect(()=>prepare(activity,s)).toThrow(/attach/);
  const estimated=clone(s);estimated.transcript!.timing='estimated';expect(gameDraftSourceContext(estimated,estimated.text,[recording])).toEqual({});expect(()=>prepare(activity,estimated,[recording])).toThrow(/provided/);
  const uncertain=clone(s);uncertain.transcript!.segments.forEach(segment=>segment.uncertain=true);expect(gameDraftSourceContext(uncertain,uncertain.text,[recording])).toEqual({});
  const stale=clone(recording);const encoded=stale.dataUrl!.split(',')[1],bytes=atob(encoded);stale.dataUrl='data:audio/wav;base64,'+btoa(bytes.slice(0,60)+String.fromCharCode(bytes.charCodeAt(60)^1)+bytes.slice(61));expect(gameDraftSourceContext(s,s.text,[stale])).toEqual({});
 });
 it('does not expand scored evidence to undisclosed notebook sources or asset text',()=>{
  const {activity,source:s,recording}=mediaInputs(),privateSource=source('An undisclosed statement.','private-source');activity.sourceRefs.push({sourceId:privateSource.id,evidence:privateSource.text});expect(()=>prepare(activity,s,[recording,privateSource])).toThrow(/evidence must occur exactly/);
  const picture=pictureInputs();expect(()=>validatePreparedGameDraft(picture.source,picture.source.text.split('\n')[0],{activity:draft(picture.activity)},'draft',['picture'])).toThrow(/annotations/);
 });
});

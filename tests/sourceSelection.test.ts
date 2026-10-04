import {describe,it,expect} from 'vitest';
import type {LearningCard,Source} from '../src/types';
import {ACTIVITY_EXAMPLES,EXAMPLE_ACTIVITY_SOURCE} from '../src/lib/structuredEngine';
import {resolveScaffoldRuntime,hasCurrentActivityEvidence,isReadyLearningSource} from '../src/lib/scaffoldRuntime';
import {prepareTranscriptSource} from '../src/lib/mediaTranscript';
import {recordingDigest} from '../src/lib/mediaAssets';
import {makeVisualSources,visualParentRevision,type VisualCapture} from '../src/lib/visualEvidence';
const source:Source={...EXAMPLE_ACTIVITY_SOURCE,kind:'text',addedAt:'2026-10-04T00:00:00Z'};
const activity=ACTIVITY_EXAMPLES[0];
const base={ageGroup:'adult',cards:[],activities:[activity],sources:[source]};
const recallSource:Source={...source,id:'terms',text:'Seed: A plant structure containing an embryo.\nRoot: A plant organ that absorbs water.'};
const card:LearningCard={id:'card',prompt:'Which source term names a structure containing an embryo?',answer:'Seed',options:['Seed','Root'],correctIndex:0,explanation:'The supplied source defines Seed.',sourceId:recallSource.id,evidence:'Seed: A plant structure containing an embryo.',concept:'Seed',tags:['source-recall'],questionType:'definition',reviewStatus:'reviewed'};
const recall=(sources:Source[],cards=[card])=>resolveScaffoldRuntime('recall-escape-mission',{ageGroup:'adult',cards,sources});
describe('selection uses current uploaded evidence before recipe availability',()=>{
 it('excludes missing, stale and unready source references even when an activity is marked reviewed',()=>{
  expect(resolveScaffoldRuntime('process-reconstruction',base).activityIds).toEqual([activity.id]);
  for(const sources of [[],[{...source,text:'Changed source, old excerpt removed.'}],[{...source,status:'needs-transcript' as const}],[{...source,status:'error' as const}]]){
   expect(hasCurrentActivityEvidence(activity,sources)).toBe(false);const resolved=resolveScaffoldRuntime('process-reconstruction',{...base,sources});expect(resolved.available).toBe(false);expect(resolved.activityIds).toEqual([]);expect(resolved.reason).toContain('source evidence');
  }
  expect(resolveScaffoldRuntime('process-reconstruction',{...base,sources:undefined}as any).available).toBe(false);
 });
 it('retains suitable authored bindings, but a valid draft is only evidence-ready until content review',()=>{
  const draft={...activity,reviewStatus:'needs-review' as const};expect(hasCurrentActivityEvidence(draft,[source])).toBe(true);expect(resolveScaffoldRuntime('process-reconstruction',{...base,activities:[draft]})).toMatchObject({available:false,activityIds:[]});
  expect(hasCurrentActivityEvidence({...activity,sourceRefs:[...activity.sourceRefs,{sourceId:'missing',evidence:'Missing passage'}]},[source])).toBe(false);
  expect(hasCurrentActivityEvidence({...activity,sourceRefs:[{sourceId:source.id,evidence:'  '}]},[source])).toBe(false);
  expect(resolveScaffoldRuntime('process-reconstruction',{...base,activities:[{...activity,scaffoldIds:['timeline-investigation']}]}).available).toBe(false);
  expect(activity.scaffoldIds).toEqual(['process-reconstruction']);
 });
 it('recall counts only current sourced questions, never source-free manual cards or ready-looking stale drafts',()=>{
  expect(recall([recallSource]).available).toBe(true);
  expect(recall([]).available).toBe(false);expect(recall([{...recallSource,status:'needs-transcript'}]).available).toBe(false);expect(recall([{...recallSource,text:'Only the root definition remains.'}]).available).toBe(false);
  expect(recall([recallSource],[{...card,reviewStatus:'needs-review'}]).available).toBe(false);
  expect(recall([],[{...card,questionType:'manual',sourceId:'',evidence:''}]).available).toBe(false);
  expect(recall([recallSource],[{...card,answer:'Unstated answer'}]).available).toBe(false);
 });
 it('checks transcript offsets and parent recording bytes before selection, including inline recordings',()=>{
  const recording:Source={...source,id:'audio',kind:'audio',mime:'audio/mpeg',text:'',dataUrl:'data:audio/mpeg;base64,AAECAw==',status:'needs-transcript'};
  const transcript=prepareTranscriptSource(recording,{format:'plain',text:recallSource.text},{mediaRevision:recordingDigest(recording),duration:10});
  const transcriptCard={...card,sourceId:transcript.id};expect(recall([recording,transcript],[transcriptCard]).available).toBe(true);
  for(const sources of [[transcript],[{...recording,dataUrl:'data:audio/mpeg;base64,AAECAA=='},transcript],[recording,{...transcript,text:transcript.text+'\nchanged'}]])expect(recall(sources,[transcriptCard]).available).toBe(false);
  const transcriptActivity={...activity,sourceRefs:[{sourceId:transcript.id,evidence:transcript.text}]};expect(hasCurrentActivityEvidence(transcriptActivity,[recording,transcript])).toBe(true);expect(hasCurrentActivityEvidence(transcriptActivity,[{...recording,dataUrl:'data:audio/mpeg;base64,AAECAA=='},transcript])).toBe(false);
 });
 it('checks reviewed OCR frame text and original parent bytes instead of trusting a ready flag',()=>{
  const recording:Source={...source,id:'video',kind:'video',mime:'video/mp4',text:'',dataUrl:'data:video/mp4;base64,AAECAw==',status:'needs-transcript'};
  const capture:VisualCapture={id:'frame',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzTYAAAAASUVORK5CYII=',width:1,height:1,rawText:recallSource.text,text:recallSource.text,confidence:90,reviewed:true,warnings:[],language:'eng',requestedAt:1,at:1,timestampBasis:'decoded-frame'};
  const frame=makeVisualSources(recording,[capture],visualParentRevision(recording))[0],frameCard={...card,sourceId:frame.id};
  expect(isReadyLearningSource(frame,[recording,frame])).toBe(true);expect(recall([recording,frame],[frameCard]).available).toBe(true);
  const unreviewed=makeVisualSources(recording,[{...capture,reviewed:false}],visualParentRevision(recording))[0];
  for(const sources of [[frame],[{...recording,dataUrl:'data:video/mp4;base64,AAECAA=='},frame],[recording,{...frame,text:frame.text+'\nchanged'}],[recording,{...unreviewed,status:'ready' as const}]])expect(recall(sources,[frameCard]).available).toBe(false);
 });
 it('literal quotation validates provenance rather than proving that authored rules follow from it',()=>{
  const authored={...activity,instruction:'Author-reviewed rule interpretation that still needs human judgment.'};
  // The mechanical boundary must remain explicit: it does not silently infer or certify semantics.
  expect(hasCurrentActivityEvidence(authored,[source])).toBe(true);expect(resolveScaffoldRuntime('process-reconstruction',{...base,activities:[authored]}).reason).toContain('do not replace content review');
 });
});

import type {Notebook,Source} from '../../src/types';
import {prepareAutomaticLearning} from '../../src/lib/automaticLearning';
import {buildMediaLearningCandidates} from '../../src/lib/mediaLearning';
import {prepareTranscriptSource} from '../../src/lib/mediaTranscript';
import {textDigest} from '../../src/lib/evidence';
const texts = [
 ['glossary', '# Network roles\n\nRouter: a device that forwards packets between separate networks.\nSwitch: a device that connects devices within a local network.\nPacket: a small unit of information carried across a network.'],
 ['procedure', '# Procedure for documenting a reading\n\nRecord the display faithfully before comparing any result.\n\n1. Read the displayed value.\n2. Record the value with its unit.\n3. Compare the record with the display.\n4. Correct any transcription error.'],
 ['categories', '# Supplied object groups\n\nThis exercise uses these explicitly assigned groups.\n\nWarm > Red tile\nWarm > Orange tile\nCool > Blue tile\nCool > Green tile'],
 ['relationships', '# Recorded message path\n\nThese are the two dependencies supplied for this exercise.\n\nBuild request -> precedes -> Send request\nSend request -> precedes -> Receive response'],
 ['table', '# Supplied workshop measurements\n\nThe table contains only these three measurements; do not infer another population.\n\n| Station | Minutes |\n|---|---|\n| Inspect | 4 |\n| Assemble | 9 |\n| Check | 6 |'],
 ['conditional', '# Training policy\n\nIf approval is absent then ask for approval.'],
 ['prose', '# Source investigation\n\nThe observer records the displayed value and the context in which it was observed. The record distinguishes an observation from an interpretation.\n\n## Limits\n\nThis short passage supplies no answer alternatives, transition rules or graded rubric. Read the complete passage and describe what the source actually establishes.'],
 ['numbered-facts', '# Three listed examples\n\nThese are reference examples without a procedural order.\n\n1. Oak is a broad-leaved tree.\n2. Pine is a coniferous tree.\n3. Birch is another broad-leaved tree.'],
 ['ambiguous', '# Deliberately ambiguous glossary\n\nTerm A: the same stated role in this deliberately ambiguous example.\nTerm B: the same stated role in this deliberately ambiguous example.'],
 ['code', '# Inert code example\n\nThis code counts supplied array entries. It must not become a category game or execute during study.\n\n```js\nconst flags = ["A > B", "C > D"];\nconst total = flags.length;\n```'],
] as const;
export const FACTORY_CORPUS:Notebook[]=texts.map(([name,text])=>({id:`factory-${name}`,title:name,description:'Original bounded QA material',createdAt:'2026-10-04T00:00:00.000Z',updatedAt:'2026-10-04T00:00:00.000Z',ageGroup:'adult',goal:'Understand and remember',theme:'aurora',revision:1,scaffoldIds:[],cards:[],sources:[{id:`source-${name}`,title:name,kind:'text',text,status:'ready',addedAt:'2026-10-04T00:00:00.000Z'}]}));
export function prepareFactoryCorpus(){
 const prepared=FACTORY_CORPUS.map(input=>({input,...prepareAutomaticLearning(input)}));
 const revision=textDigest('bounded fake recording bytes; no codec claim'),recording:Source={id:'factory-recording',title:'Community speech',kind:'audio',text:'',mime:'audio/mpeg',asset:{id:revision,name:'speech.mp3',mime:'audio/mpeg',sha256:revision,size:1,duration:11},status:'needs-transcript',addedAt:'2026-10-04T00:00:00.000Z'};
 const transcript=prepareTranscriptSource(recording,{format:'srt',text:'1\n00:00:00,000 --> 00:00:10,600\nAnd so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.'},{mediaRevision:revision,duration:11});
 const media=buildMediaLearningCandidates(recording,transcript,{mediaRevision:revision});
 const input={...FACTORY_CORPUS[0],id:'factory-speech',title:'ordinary speech',sources:[recording,transcript],cards:[],activities:[]};
 prepared.push({input,notebook:{...input,cards:media.cards,activities:media.activities},warnings:media.warnings});
 return prepared;
}

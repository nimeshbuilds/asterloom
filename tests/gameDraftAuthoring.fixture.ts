import type {Source} from '../src/types';
import type {StructuredActivity} from '../src/lib/structuredEngine';
import type {MediaActivity} from '../src/lib/mediaEngine';
import {pictureDiscoveryFixture,pictureSources} from '../src/data/pictureFixtures';
import {normalizeMediaTranscript} from '../src/lib/mediaTranscript';
import {recordingDigest} from '../src/lib/mediaAssets';
import {trainingToneSource} from '../src/lib/extendedExamples';
import {DOM_CODE_REVIEW} from '../src/lib/compositionModeExamples';
import {SCENARIO_DIALOGUE_EXAMPLE,SCENARIO_INTERACTION_SOURCES} from '../src/lib/scenarioInteractionExamples';
export interface AuthoringFixture{recipe:string;ageGroup:string;source:Source;assets?:Source[];activity:StructuredActivity;prose:string;lesson:string}
const source=(id:string,text:string,kind:Source['kind']='text'):Source=>({id,title:'Explicit source authoring fixture',text,kind,status:'ready',addedAt:'2026-10-10'});
export function pictureAuthoringFixture():AuthoringFixture{
 const activity=structuredClone(pictureDiscoveryFixture),material=structuredClone(pictureSources[0]);
 material.text+='\nPicture regions: '+JSON.stringify(activity.tokens.map(({label,x,y,width,height})=>({label,x,y,width,height})));
 return{recipe:'discovery-scenes',ageGroup:'3-5',source:material,activity,prose:pictureSources[0].text,lesson:'An apple is round and red. A pear has a narrow top. A cup has a handle. Use these clues to choose a picture.'};
}
export function mediaAuthoringFixture():AuthoringFixture{
 const recording={...trainingToneSource(),text:''};
 const prepared=normalizeMediaTranscript({format:'srt',text:'1\n00:00:00,000 --> 00:00:01,000\nA low 220 Hz tone sounds first.\n\n2\n00:00:02,000 --> 00:00:03,000\nA higher 440 Hz tone sounds second.'},{mediaSourceId:recording.id,mediaRevision:recordingDigest(recording),duration:4});
 const material:Source={...source('timed-authoring-source',prepared.text,'transcript'),transcript:prepared.transcript};
 const activity:MediaActivity={version:1,id:'media-draft',kind:'media',title:'Compare the supplied tones',instruction:'Listen and choose the first tone.',explanation:'The low tone comes first in the supplied recording.',hint:'Replay the first cue.',reviewStatus:'needs-review',sourceRefs:[{sourceId:material.id,evidence:material.text}],mediaSourceId:recording.id,duration:4,cues:prepared.transcript.segments.map(cue=>({id:cue.id,start:cue.start!,end:cue.end!,text:cue.text,evidenceRefs:[0]})),checkpoints:[{id:'first',at:1,prompt:'Which tone came first?',choices:[{id:'low',label:'Low 220 Hz tone'},{id:'high',label:'Higher 440 Hz tone'}],correctChoiceIds:['low'],reason:'The first cue names the low 220 Hz tone.',evidenceRefs:[0]}]};
 return{recipe:'media-checkpoints',ageGroup:'adult',source:material,assets:[recording],activity,prose:material.text,lesson:'The low 220 Hz tone comes first. The higher 440 Hz tone comes second. Listen for their order, and use the timed words to compare the sounds.'};
}
export function codeAuthoringFixture():AuthoringFixture{
 const activity=structuredClone(DOM_CODE_REVIEW),review=activity.codeReview!,prose=activity.sourceRefs[0].evidence.split('\nReview criterion: ')[1];
 const explanation='Review criterion: '+prose;
 const material=source('code-authoring-source','# Literal message display\n'+explanation+'\n\n```js\n'+review.code+'\n```');
 activity.sourceRefs=[{sourceId:material.id,evidence:review.code},{sourceId:material.id,evidence:explanation}];
 activity.pieces.forEach(piece=>piece.evidenceRefs=[piece.role==='evidence'?0:1]);
 activity.arguments.forEach(argument=>{argument.evidenceRefs=[1];argument.alternatives.forEach(alternative=>alternative.evidenceRefs=[1]);});
 review.repairs.forEach(repair=>repair.evidenceRefs=[1]);review.findings.forEach(finding=>{finding.evidenceRefs=[1];finding.alternatives.forEach(alternative=>alternative.evidenceRefs=[1]);});
 return{recipe:'secure-code-review',ageGroup:'adult',source:material,activity,prose:explanation,lesson:'The message must appear as literal text. Assigning userText to innerHTML interprets it as HTML; assigning it to textContent displays it as text. Changing the CSS class does not change that interpretation.'};
}
export function recallAuthoringFixture():AuthoringFixture{
 const material=source('recall-authoring-source','A queue is a list of jobs waiting to run. A worker is a process that runs queued jobs.');
 const activity:StructuredActivity={version:1,id:'recall-draft',kind:'recall',title:'Recall the queue terms',instruction:'Write the source term for each definition.',explanation:'The source names the waiting list a queue and the running process a worker.',hint:'Use the source definitions.',reviewStatus:'needs-review',sourceRefs:[{sourceId:material.id,evidence:material.text}],questions:[{id:'queue',prompt:'What is a list of jobs waiting to run called?',answer:'queue',acceptedAnswers:[],reason:'A queue is a list of jobs waiting to run.',evidenceRefs:[0]},{id:'worker',prompt:'What is a process that runs queued jobs called?',answer:'worker',acceptedAnswers:[],reason:'A worker runs queued jobs.',evidenceRefs:[0]}]};
 return{recipe:'recall-escape-mission',ageGroup:'adult',source:material,activity,prose:material.text,lesson:'A queue holds jobs waiting to run. A worker runs those queued jobs. Remember which term names the waiting list and which term names the process.'};
}
export function dialogueAuthoringFixture():AuthoringFixture{
 const activity=structuredClone(SCENARIO_DIALOGUE_EXAMPLE),material=structuredClone(SCENARIO_INTERACTION_SOURCES[0]);
 return{recipe:'language-dialogue-trail',ageGroup:'adult',source:material,activity,prose:material.text.split('\n\n')[0],lesson:'The goal is one tea to take away. Both “Un té, por favor.” and “Quisiera un té, por favor.” request one tea politely. At the second turn, “Para llevar” selects takeaway; “Para aquí” selects consumption here.'};
}

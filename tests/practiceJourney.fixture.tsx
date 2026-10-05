import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import {createNotebook,createSource} from '../src/lib/utils';
import {emptyProgress,loadProgress,saveNotebook,saveProgress} from '../src/lib/storage';
import {buildLearningBriefing,initialLessonState,completeLesson,lessonReady} from '../src/lib/learningBriefing';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {setAsterPreferences} from '../src/lib/asterGuidePolicy';
import {serializeNotebookProgress,restoreNotebookProgress} from '../src/lib/progressBackup';
import {getSoundPreferences,getMusicRuntimeStatus} from '../src/lib/music';
import {beginStructuredReview} from '../src/lib/structuredReview';
import {reconcileNotebookProgress} from '../src/lib/progressRevision';
import '../src/styles.css';
const fixtureKind=new URLSearchParams(location.search).get('kind');
const recall=fixtureKind==='recall';
const source={...createSource(recall?'Packet: A small unit of information.':'Procedure for restoration:\n1. Restore the dependency.\n2. Restart the service.','Training source'),id:'training-source'};
const activity={version:1,id:'restore-service',kind:'sequence',title:'Restore the service',instruction:'Arrange the documented restoration steps.',explanation:'The dependency must be restored first.',hint:'Read the documented order.',reviewStatus:fixtureKind==='reviewed'?'reviewed':'needs-review',sourceRefs:[{sourceId:source.id,evidence:source.text}],scaffoldIds:['process-reconstruction'],items:[{id:'restore',label:'Restore the dependency'},{id:'restart',label:'Restart the service'}],constraints:[{before:'restore',after:'restart'}]} as any;
const card={id:'packet',prompt:'Choose the source term.',answer:'Packet',options:['Packet','Router'],correctIndex:0,explanation:source.text,sourceId:source.id,evidence:source.text,concept:'Packet',tags:[],questionType:'definition',reviewStatus:'reviewed'} as any;
let notebook=createNotebook({id:recall?'journey-recall':'journey-draft',title:recall?'Practice recall journey':'Practice model journey',sources:[source],cards:recall?[card]:[],activities:recall?[]:[activity],scaffoldIds:[recall?'recall-escape-mission':'process-reconstruction'],ageGroup:'adult',theme:recall?'islands':'workshop'});
function readyLesson(){const scaffold=SCAFFOLDS.find(s=>s.id===notebook.scaffoldIds[0])!;const plan=buildLearningBriefing({notebook,scaffold,...(recall?{cardIds:[card.id]}:{activity:notebook.activities![0]})});const fresh=initialLessonState(plan);const lesson=completeLesson(plan,{...fresh,stage:'practice',missionAccepted:true,viewedPassageIds:plan.passages.map(p=>p.id),walkthroughStep:plan.walkthrough.steps.length,practice:{...fresh.practice,focusId:plan.practice.focusOptions[0].id,explanation:'The source gives the conditions attached to this idea and the steps that can be applied.',connection:'What additional evidence would I need before applying this model elsewhere?',compared:true,order:plan.practice.orderIds}});if(!lessonReady(plan,lesson))throw Error('The practice fixture requires a validated completed lesson.');return{plan,lesson};}
// QA-only legacy preparation removes review and milestone receipts while retaining
// the saved supported completion, exact source response, and earned practice XP.
const qa=(window as any).journeyQA={mode:'immediate',pending:[],writes:[],cues:[],ducks:[],durable:null,read:()=>loadProgress(notebook.id),sound:getSoundPreferences,music:getMusicRuntimeStatus,async release(ok:boolean){const pending=this.pending.shift();if(!pending)throw Error('No pending save');pending.resolve(ok);},async portable(){return serializeNotebookProgress(notebook,await loadProgress(notebook.id));},async restore(text:string){const restored=await restoreNotebookProgress(notebook,text);await saveProgress(restored.progress);return restored.progress;},async prepareLegacySupportedWithoutReview(){const progress=await loadProgress(notebook.id),entry=progress.structured![activity.id];if((entry.response as any)._draft?.hintUsed!==true)throw Error('This regression requires explicitly supported saved history.');const {review,...withoutReview}=entry;const {independentActivityAwards,...legacyProgress}=progress;await saveProgress({...legacyProgress,structured:{...progress.structured,[activity.id]:withoutReview}});return loadProgress(notebook.id);},async cycleReview(){let progress=await loadProgress(notebook.id);for(const reviewStatus of ['needs-review','reviewed'] as const){const previous=notebook;notebook={...notebook,activities:notebook.activities?.map(a=>({...a,reviewStatus}))};progress=reconcileNotebookProgress(previous,notebook,progress);await saveNotebook(notebook);await saveProgress(progress);}return progress;},async prepareIndependent(){const progress=await loadProgress(notebook.id),entry=progress.structured?.[activity.id]??{response:{_draft:{lesson:readyLesson().lesson}},completed:false,score:0,maxScore:0,attempts:0,updatedAt:new Date().toISOString()},draft=(entry.response as any)._draft,older={...progress,structured:{...progress.structured,[activity.id]:{...entry,response:{...(entry.response as any),_draft:{...draft,lesson:{...draft.lesson,completedAt:new Date(Date.now()-48*60*60*1000).toISOString()}}}}}};await saveProgress(beginStructuredReview(older,activity.id));},async markReviewed(){notebook={...notebook,activities:notebook.activities?.map(a=>({...a,reviewStatus:'reviewed'}))};await saveNotebook(notebook);const progress=await loadProgress(notebook.id),{lesson}=readyLesson();await saveProgress({...progress,structured:{...progress.structured,[activity.id]:{...progress.structured![activity.id],response:{...(progress.structured![activity.id].response as any),_draft:{...(progress.structured![activity.id].response as any)._draft,lesson}}}}});}};
setAsterPreferences({mode:'off'});
async function start(){
 if(!localStorage.getItem('journey-fixture-seeded')){
  const{plan,lesson}=readyLesson();await saveNotebook(notebook);
  const progress=emptyProgress(notebook.id);
  await saveProgress(recall?{...progress,lessons:{[plan.id]:lesson}}:{...progress,structured:{[activity.id]:{response:{order:['restore','restart'],_draft:{lesson,checked:false}},completed:false,score:0,maxScore:0,attempts:0,updatedAt:new Date().toISOString()}}});
  localStorage.setItem('journey-fixture-seeded','yes');
 }
 qa.durable=await loadProgress(notebook.id);qa.writes=[];qa.cues=[];
 const root=createRoot(document.getElementById('root')!);qa.closeApp=()=>{root.unmount();document.getElementById('root')!.textContent='Game closed';};root.render(<React.StrictMode><App/></React.StrictMode>);
}
void start();

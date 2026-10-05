import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import StructuredBoard from '../src/components/StructuredBoard';
import {createNotebook,createSource} from '../src/lib/utils';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {buildLearningBriefing,initialLessonState,completeLesson,lessonReady,lessonQuestSupport} from '../src/lib/learningBriefing';
import '../src/styles.css';
const source=createSource('Procedure for investigating:\n1. Define the question.\n2. Collect observations.\n3. Analyze observations.\n4. Report the conclusion.','Investigation guide');
const activity={version:1,id:'investigation',kind:'sequence',title:'Arrange the investigation',instruction:'Arrange the documented investigation steps.',explanation:'The procedure supplies this order.',hint:'Define the question first.',reviewStatus:'reviewed',sourceRefs:[{sourceId:source.id,evidence:source.text}],scaffoldIds:['process-reconstruction'],items:[{id:'question',label:'Define the question'},{id:'collect',label:'Collect observations'},{id:'analyze',label:'Analyze observations'},{id:'report',label:'Report the conclusion'}],constraints:[{before:'question',after:'collect'},{before:'collect',after:'analyze'},{before:'analyze',after:'report'}]} as const;
const notebook=createNotebook({id:'aster-real-board',sources:[source],activities:[activity as any],ageGroup:'adult',theme:'workshop'});
const scaffold=SCAFFOLDS.find(s=>s.id==='process-reconstruction')!;
const plan=buildLearningBriefing({notebook,activity:activity as any,scaffold}),fresh=initialLessonState(plan);
const lesson=completeLesson(plan,{...fresh,stage:'practice',missionAccepted:true,viewedPassageIds:plan.passages.map(p=>p.id),walkthroughStep:plan.walkthrough.steps.length,practice:{...fresh.practice,focusId:plan.practice.focusOptions[0].id,explanation:'The source supplies the sequence from question through conclusion.',connection:'I will retrieve the documented procedure after a delay.',compared:true,order:plan.practice.orderIds}},Date.now()-48*3600000);
if(!lessonReady(plan,lesson)||lessonQuestSupport(plan,lesson).assisted)throw Error('Invalid independently eligible fixture');
const initial={_draft:{lesson}},qa=(window as any).boardQA={durable:initial,saves:[],commits:[],delayCheck:false,pending:[]};
function Harness(){
 const[saved,setSaved]=useState<any>(initial);
 return <main style={{padding:'20px',maxWidth:1100,margin:'auto'}}><StructuredBoard notebook={notebook} activity={activity as any} sources={notebook.sources} scaffoldId={scaffold.id} savedResponse={saved} onSave={async response=>{qa.saves.push(structuredClone(response));qa.durable=structuredClone(response);setSaved(response);return true;}} onCommit={async(response,evaluation)=>{qa.commits.push({response:structuredClone(response),evaluation:structuredClone(evaluation)});if(qa.delayCheck)return new Promise<boolean>(resolve=>qa.pending.push((ok:boolean)=>{if(ok){qa.durable=structuredClone(response);setSaved(response);}resolve(ok);}));qa.durable=structuredClone(response);setSaved(response);return true;}} onComplete={async()=>true}/></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);

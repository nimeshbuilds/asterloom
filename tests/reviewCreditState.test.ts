import {expect,it} from 'vitest';
import fc from 'fast-check';
import {evaluateActivity,type SequenceActivity} from '../src/lib/structuredEngine';
import {emptyProgress} from '../src/lib/storage';
import {createNotebook} from '../src/lib/utils';
import {reconcileNotebookProgress} from '../src/lib/progressRevision';
import {reviewAfterEvaluation} from '../src/lib/structuredReview';
import {parseProgress,serializeProgress} from '../src/lib/package';
const at='2026-10-04T12:00:00.000Z';
const source={id:'gate-source',title:'Procedure',kind:'text' as const,status:'ready' as const,text:'First open the gate, then walk through.',addedAt:at};
const initial:SequenceActivity={version:1,id:'gate',kind:'sequence',title:'Gate',instruction:'Arrange the steps.',sourceRefs:[{sourceId:source.id,evidence:source.text}],reviewStatus:'needs-review',explanation:'The gate is opened before passage.',hint:'What must happen first?',items:[{id:'open',label:'Open'},{id:'walk',label:'Walk'}],constraints:[{before:'open',after:'walk'}]};

it('arbitrary preview, hint, review, downgrade, reload and check histories cannot grant draft credit',()=>{
 const commands=fc.array(fc.constantFrom('preview','correct-answer','wrong-answer','hint','check','review','downgrade','reload'),{minLength:1,maxLength:120});
 fc.assert(fc.property(commands,events=>{
  let notebook=createNotebook({id:'gate-notebook',sources:[source],activities:[structuredClone(initial)]}),progress=emptyProgress(notebook.id);let correct=false,hinted=false;
  for(const event of events){
   const activity=notebook.activities![0] as SequenceActivity;const response={order:correct?['open','walk']:['walk','open'],_draft:{checked:false,hintUsed:hinted}};
   if(event==='correct-answer'){correct=true;continue;}if(event==='wrong-answer'){correct=false;continue;}if(event==='hint'){hinted=true;continue;}
   if(event==='review'||event==='downgrade'){const next={...notebook,activities:[{...activity,reviewStatus:event==='review'?'reviewed' as const:'needs-review' as const}]};progress=reconcileNotebookProgress(notebook,next,progress);notebook=next;}
   else if(event==='reload'){progress=reconcileNotebookProgress(notebook,notebook,parseProgress(serializeProgress(progress)));}
   else if(event==='preview'||event==='check'){
    const beforeXp=progress.xp,result={...evaluateActivity(activity,response),hintUsed:hinted||activity.reviewStatus==='needs-review'};
    const old=progress.structured?.[activity.id];const review=reviewAfterEvaluation(activity.id,old?.review,result,at);
    if(activity.reviewStatus==='needs-review'){expect(result).toMatchObject({valid:false,correct:null,outcome:'draft-preview',score:0,maxScore:0});expect(review).toBeUndefined();}
    else if(event==='check'){expect(result.correct).toBe(correct);}
    if(event==='check'&&result.valid&&result.correct===true){progress={...progress,xp:progress.xp+(old?.completed?0:50),structured:{...progress.structured,[activity.id]:{response,completed:true,score:result.score,maxScore:result.maxScore,attempts:(old?.attempts||0)+1,updatedAt:at,...(review?{review}:{})}}};}
    if(activity.reviewStatus==='needs-review'||event==='preview')expect(progress.xp).toBe(beforeXp);
   }
   if(notebook.activities![0].reviewStatus==='needs-review'){const state=progress.structured?.gate;expect(state?.completed??false).toBe(false);expect(state?.score??0).toBe(0);expect(state?.review).toBeUndefined();}
   expect(Number.isFinite(progress.xp)).toBe(true);
  }
 }),{numRuns:100});
});

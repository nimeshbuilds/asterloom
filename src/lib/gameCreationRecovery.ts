import type {GameDesign} from './gameDesign';

const FAILED_PLAN='A source-supported game plan could not be validated after one corrective attempt.';
const LEGACY_WRITER='This mission could not be grounded in a valid model. The complete source section remains available for study.';
/** Saved reviewer decisions describe the generated mission, not an extractor's
 * guesses about whether the original material contains useful structure. */
export function gameCreationReview(design:GameDesign|undefined){
 return(design?.batches??[]).flatMap(batch=>(batch.checks??[]).filter(check=>check.decision==='source-study').map(check=>({title:batch.missions?.find(mission=>mission.id===check.missionId)?.title??'Generated mission',reason:check.reason})));
}
/** Older creators saved validation failures as source-study decisions. Only
 * app-authored failure reasons with enough retained diagnostic evidence can be
 * reopened. Genuine model refusals and ambiguous old writer outcomes stay put. */
export function gameCreationRecovery(design:GameDesign|undefined){
 const batches:{batchId:string;unitIds:string[]}[]=[],ambiguousWriterUnitIds:string[]=[];
 if(!design)return{batches,unitCount:0,ambiguousWriterUnitIds};
 for(const batch of design.batches){
  if(batch.status!=='checked'||batch.missions?.length||batch.drafts?.length)continue;
  const writer=(batch.study??[]).filter(item=>item.reason===LEGACY_WRITER);
  const failedWriterIds=new Set((design.events??[]).filter(event=>event.batchId===batch.id&&event.phase==='write'&&event.kind==='failed'&&event.category==='validation'&&event.missionId&&!batch.missions?.some(mission=>mission.id===event.missionId)).map(event=>event.missionId));
  const confirmedWriter=writer.length>0&&failedWriterIds.size===writer.length;
  const unitIds=(batch.study??[]).filter(item=>item.reason===FAILED_PLAN||confirmedWriter&&item.reason===LEGACY_WRITER).map(item=>item.unitId);
  if(!confirmedWriter)ambiguousWriterUnitIds.push(...writer.map(item=>item.unitId));
  if(unitIds.length)batches.push({batchId:batch.id,unitIds});
 }
 return{batches,unitCount:batches.reduce((sum,batch)=>sum+batch.unitIds.length,0),ambiguousWriterUnitIds};
}

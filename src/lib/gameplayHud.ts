import type {Attempt,Progress} from '../types';

/** Read-only presentation of committed recall attempts, scoped to this saved session. */
export function recallSessionTotals(progress:Pick<Progress,'attempts'>,session:{cardIds:readonly string[];startedAt:string},cardId?:string):{xp:number;lastAttempt?:Attempt}{
  const start=Date.parse(session.startedAt),ids=new Set(session.cardIds),seen=new Set<string>();
  if(!Number.isFinite(start))return{xp:0};
  const attempts=progress.attempts.filter(attempt=>{const at=Date.parse(attempt.at);if(!ids.has(attempt.cardId)||!Number.isFinite(at)||at<start||seen.has(attempt.id))return false;seen.add(attempt.id);return true;});
  const xp=attempts.reduce((sum,attempt)=>sum+(Number.isFinite(attempt.xp)&&attempt.xp>0?attempt.xp:0),0);
  const lastAttempt=cardId?[...attempts].reverse().find(attempt=>attempt.cardId===cardId):attempts.at(-1);
  return{xp,...(lastAttempt?{lastAttempt}:{})};
}
export function boundedHudValue(value:number,max=Number.MAX_SAFE_INTEGER):number{return Number.isFinite(value)?Math.max(0,Math.min(max,value)):0;}

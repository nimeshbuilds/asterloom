import type {Notebook} from '../types';

function same(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);
 return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&same(left[key],right[key]));
}
function conflict(){throw new Error('This part of the notebook changed while the operation was running. Your newer edits were kept. Retry using the updated material.');}

/** Apply only edits made since the operation began, preserving unrelated concurrent work. */
export function mergeNotebookChanges(base:Notebook,incoming:Notebook,current:Notebook):Notebook {
 if(base.id!==incoming.id||base.id!==current.id)throw new Error('The notebook no longer matches this editing operation.');
 const result={...current} as Notebook;
 for(const key of ['title','description','ageGroup','goal','theme','scaffoldIds'] as const){
  if(same(base[key],incoming[key]))continue;
  if(!same(base[key],current[key])&&!same(incoming[key],current[key]))conflict();
  (result as unknown as Record<string,unknown>)[key]=incoming[key];
 }
 for(const key of ['sources','cards','activities','artwork'] as const){
  if(same(base[key],incoming[key]))continue;
  const before=base[key]||[],after=incoming[key]||[],now=current[key]||[];
  const prior=new Map(before.map(item=>[item.id,item])),next=new Map(after.map(item=>[item.id,item]));
  const merged=new Map(now.map(item=>[item.id,item]));
  for(const [id,item] of prior){
   if(next.has(id))continue;
   if(merged.has(id)&&!same(item,merged.get(id)))conflict();
   merged.delete(id);
  }
  for(const item of after){
   const previous=prior.get(item.id),latest=merged.get(item.id);
   if(previous&&same(previous,item))continue;
   if(previous&&!latest)conflict();
   if(latest&&!same(previous,latest)&&!same(item,latest))conflict();
   merged.set(item.id,item);
  }
  (result as unknown as Record<string,unknown>)[key]=[...merged.values()];
 }
 result.updatedAt=new Date().toISOString();
 return result;
}

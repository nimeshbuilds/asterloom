import type {Notebook} from '../types';
/** ID-keyed collections can be reordered by three-way merges; nested model order stays meaningful. */
export function creationRevision(notebook:Notebook):string {
 const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;
 const records=<T extends {id:string}>(items:T[])=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
 return JSON.stringify(stable({sources:records(notebook.sources),cards:records(notebook.cards),activities:records(notebook.activities??[]),ageGroup:notebook.ageGroup,goal:notebook.goal}));
}

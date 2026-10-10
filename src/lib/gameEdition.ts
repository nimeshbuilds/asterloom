import type {Notebook} from '../types';
import {createId} from './utils';

/** A deliberate new creation starts from material, never old answers or paid checkpoints. */
export function createGameEdition(original:Notebook,existing:readonly Notebook[],now=new Date().toISOString()):Notebook {
 const base=original.title.replace(/ · Edition \d+$/u,'').trim()||'Learning game';
 const titles=new Set(existing.map(notebook=>notebook.title));
 let edition=2,title='';
 do{const suffix=` · Edition ${edition++}`;title=base.slice(0,300-suffix.length)+suffix;}while(titles.has(title));
 return {
  id:createId('notebook'),title,description:original.description,createdAt:now,updatedAt:now,revision:1,
  editionOf:{id:original.id,title:original.title},creation:{mode:'ai',status:'draft'},
  ageGroup:original.ageGroup,goal:original.goal,theme:original.theme,
  ...(original.themeSelection?{themeSelection:original.themeSelection}:{}),
  // Source IDs keep transcript/visual relationships intact. Recording assets are
  // content-addressed; saving this notebook registers its own retention reference.
  sources:structuredClone(original.sources),cards:[],activities:[],scaffoldIds:[],
 };
}

export function requiresNewGameEdition(notebook:Notebook,changes:Partial<Notebook>):boolean {
 return notebook.creation?.status==='ready'&&(
  changes.sources!==undefined||changes.ageGroup!==undefined&&changes.ageGroup!==notebook.ageGroup||
  changes.goal!==undefined&&changes.goal!==notebook.goal
 );
}

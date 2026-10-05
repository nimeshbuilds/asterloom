import {creationRevision} from '../src/lib/creationRevision';
import {describe,it,expect} from 'vitest';
import {createNotebook} from '../src/lib/utils';
import {parsePackage,serializePackage,validateNotebook} from '../src/lib/package';
import {mergeNotebookChanges} from '../src/lib/notebookMerge';
describe('portable AI project readiness',()=>{
 it('keeps unfinished projects unfinished through export and import, without changing legacy games',()=>{
  const legacy=createNotebook({id:'legacy',title:'Existing authored game'});
  expect(parsePackage(serializePackage(legacy)).creation).toBeUndefined();
  for(const status of ['draft','ready'] as const){const n={...legacy,creation:{mode:'ai' as const,status}};expect(parsePackage(serializePackage(n)).creation).toEqual(n.creation);}
 });
 it('compares keyed collections independently of merge order while catching actual content edits',()=>{const n=createNotebook({sources:[{id:'a',title:'A',kind:'text',status:'ready',text:'First fact.',addedAt:'2026-10-04T00:00:00.000Z'},{id:'b',title:'B',kind:'text',status:'ready',text:'Second fact.',addedAt:'2026-10-04T00:00:00.000Z'}]});expect(creationRevision({...n,sources:[...n.sources].reverse()})).toBe(creationRevision(n));expect(creationRevision({...n,sources:[{...n.sources[0],text:'Changed fact.'},n.sources[1]]})).not.toBe(creationRevision(n));});
 it('preserves an explicit theme choice through sharing',()=>{const n=createNotebook({theme:'islands',themeSelection:'manual'});expect(parsePackage(serializePackage(n)).themeSelection).toBe('manual');});
 it('rejects malformed creation states rather than trusting provider-supplied values',()=>{
  expect(()=>validateNotebook({...createNotebook(),creation:{mode:'ai',status:'approved-by-model'}})).toThrow('Invalid game creation state');
 });
 it('merges completed creation with a concurrent title edit and rejects conflicting readiness edits',()=>{
  const base=createNotebook({id:'project',creation:{mode:'ai',status:'draft'}}),incoming={...base,creation:{mode:'ai' as const,status:'ready' as const}};
  expect(mergeNotebookChanges(base,incoming,{...base,title:'New title'})).toMatchObject({title:'New title',creation:{mode:'ai',status:'ready'}});
  expect(()=>mergeNotebookChanges(base,incoming,{...base,creation:undefined})).toThrow('changed');
 });
});

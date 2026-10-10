import {describe,it,expect} from 'vitest';
import {createGameEdition,requiresNewGameEdition} from '../src/lib/gameEdition';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage,validateNotebook} from '../src/lib/package';
import {bytesDigest} from '../src/lib/evidence';
import {creationRevision} from '../src/lib/creationRevision';
import {emptyGameDesign} from '../src/lib/gameDesign';

const source=createSource('1. Open the settings panel.\n2. Choose reset.\n3. Confirm reset.','Procedure');
function original(){
 const bytes=new TextEncoder().encode(source.text+'\r\n');
 return createNotebook({title:'Maintenance',creation:{mode:'ai',status:'ready'},sources:[{...source,originalFile:{name:'procedure.txt',mime:'text/plain',dataUrl:'data:text/plain;base64,'+Buffer.from(bytes).toString('base64'),size:bytes.length,sha256:bytesDigest(bytes)}}],ageGroup:'teen',goal:'Follow a procedure',theme:'aurora',themeSelection:'manual'});
}
describe('deliberate game editions',()=>{
 it('copies exact sources into an independent AI draft without old answers, context or paid checkpoints',()=>{
  const old=original();old.gameDesign=emptyGameDesign(old,{id:'openai',model:'previous-model',endpointFingerprint:null});
  Object.assign(old,{apiKey:'do-not-copy',conversation:[{answer:'do-not-copy'}],progress:{xp:42},aiToolReceipts:[],aiLearningPlan:{old:'lesson'},artwork:[{old:'art'}],learningObjectives:[{old:'objective'}]});
  const snapshot=structuredClone(old),edition=createGameEdition(old,[old],'2026-10-10T10:00:00.000Z');
  expect(old).toEqual(snapshot);expect(edition.id).not.toBe(old.id);expect(edition.creation).toEqual({mode:'ai',status:'draft'});
  expect(edition.editionOf).toEqual({id:old.id,title:old.title});expect(edition.sources).toEqual(old.sources);expect(edition.sources).not.toBe(old.sources);expect(edition.sources[0]).not.toBe(old.sources[0]);
  expect(edition.cards).toEqual([]);expect(edition.activities).toEqual([]);expect(edition.scaffoldIds).toEqual([]);
  for(const field of ['gameDesign','aiLearningPlan','aiToolReceipts','learningObjectives','artwork','progress','apiKey','conversation'])expect(edition).not.toHaveProperty(field);
  expect(edition).toMatchObject({ageGroup:old.ageGroup,goal:old.goal,theme:old.theme,themeSelection:'manual',revision:1,createdAt:'2026-10-10T10:00:00.000Z'});
  edition.sources[0].text='New source wording';expect(old).toEqual(snapshot);expect(creationRevision(edition)).not.toBe(creationRevision(old));
 });
 it('keeps exact original bytes and provenance through portable export',()=>{
  const old=original(),edition=createGameEdition(old,[old]);
  const restored=parsePackage(serializePackage(edition));expect(restored).toEqual(edition);
  expect(restored.sources[0].originalFile).toEqual(old.sources[0].originalFile);
  expect(restored.editionOf).toEqual({id:old.id,title:old.title});
 });
 it('retains content-addressed recording and companion identities, not a duplicate binary',()=>{
  const old=original(),sha='a'.repeat(64);
  old.sources.push({...createSource('','Recording','audio'),id:'recording',asset:{id:sha,sha256:sha,name:'original.wav',mime:'audio/wav',size:100}});
  // Relationship bytes are copied without interpreting or rewriting their provenance.
  Object.assign(old.sources[0],{transcript:{mediaSourceId:'recording',mediaRevision:'source-revision',segments:[]}});
  const edition=createGameEdition(old,[old]);expect(edition.sources).toEqual(old.sources);
  expect(edition.sources[1].asset).toEqual(old.sources[1].asset);expect(edition.sources[0].transcript?.mediaSourceId).toBe('recording');
 });
 it('names multiple editions unambiguously within package title bounds',()=>{
  const old=original(),second=createGameEdition(old,[old]),third=createGameEdition(second,[old,second]);
  expect(second.title).toBe('Maintenance · Edition 2');expect(third.title).toBe('Maintenance · Edition 3');
  expect(third.editionOf).toEqual({id:second.id,title:second.title});
  const long=original();long.title='A'.repeat(300);expect(createGameEdition(long,[long]).title.length).toBe(300);
 });
 it('guards source and learner changes in a ready AI game while retaining author presentation edits and legacy editing',()=>{
  const old=original();for(const changes of [{sources:old.sources},{sources:[]},{ageGroup:'adult'},{goal:'Explore something new'}])expect(requiresNewGameEdition(old,changes)).toBe(true);
  for(const changes of [{title:'New title'},{description:'Author introduction'},{theme:'islands'},{ageGroup:old.ageGroup}])expect(requiresNewGameEdition(old,changes)).toBe(false);
  expect(requiresNewGameEdition({...old,creation:{mode:'ai',status:'draft'}},{sources:[]})).toBe(false);
  expect(requiresNewGameEdition({...old,creation:undefined},{sources:[]})).toBe(false);
 });
 it('rejects malformed or self-referential edition metadata and strips extra fields',()=>{
  const old=original();expect(()=>validateNotebook({...old,editionOf:{id:old.id,title:old.title}})).toThrow(/own original/);
  expect(()=>validateNotebook({...old,editionOf:{id:'parent',title:'x'.repeat(301)}})).toThrow();
  expect(validateNotebook({...old,editionOf:{id:'parent',title:'Original',apiKey:'do-not-copy'}}).editionOf).toEqual({id:'parent',title:'Original'});
 });
});

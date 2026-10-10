import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertLearnpack} from './mission-pack';
import {publicFixture} from './public-fixture';
import {TEMPLATE_IDS,selectPilotTemplate} from './template-catalog';
import {emptyGameDesign,validateGameDesign} from '../../../src/lib/gameDesign';
import {audioDirectionCatalog} from '../../../src/lib/gameArtDirection';
import {CREATIVE_NATIVE_TEMPLATE_IDS,creativeDirectionFingerprint,type GameCreativeDirection} from '../../../src/lib/gameCreativeDirection';
import {parsePackage,serializePackage} from '../../../src/lib/package';

const selection={sequenceId:'public-sequence',dependencyId:'public-dependency'};
/** The existing public activities/teaching stay unchanged. The completed source
 * inventory has honest study dispositions; this bridge never authors content. */
function directedFixture(nativeTemplateId:GameCreativeDirection['nativeTemplateId']='archive-investigation'){
 const f=publicFixture(),notebook=structuredClone(f.notebook);
 const audio=audioDirectionCatalog({ageGroup:'adult',scaffoldId:'process-reconstruction',activityKind:'sequence',theme:'ocean'});
 const design=emptyGameDesign(notebook,{id:'openai',model:'public-fixture-model',endpointFingerprint:null});
 design.directionPolicy='source-first-v1';
 design.status='ready';
 design.batches=design.batches.map(batch=>({...batch,status:'checked',missions:[],study:batch.unitIds.map(unitId=>({unitId,reason:'Retain this complete public passage for source study.'})),drafts:[],checks:[]}));
 design.creativeDirection={version:1,inputFingerprint:creativeDirectionFingerprint(notebook),primaryScaffoldId:'process-reconstruction',title:'The inspection record',premise:'Restore a fictional archive display by reconstructing the supplied procedures and recorded order.',throughline:'Study the material, build a supported model, then inspect the completed record.',fitReason:'The supplied procedure and trace explicitly state ordering relationships.',audioDirection:{version:1,playTrackId:audio.playTracks[0].id,studyTrackId:audio.studyTracks[0].id,effectProfileId:audio.effectProfiles[0].id,effects:'standard'},...(nativeTemplateId===undefined?{}:{nativeTemplateId})};
 notebook.gameDesign=validateGameDesign(design,notebook);
 return{...f,notebook,text:serializePackage(notebook)};
}

test('creation/native catalogs share exactly the three shipped presentation IDs',()=>{
 assert.deepEqual(CREATIVE_NATIVE_TEMPLATE_IDS,TEMPLATE_IDS);
});

test('fully validated saved direction selects native presentation ahead of legacy metadata without changing source teaching or rules',()=>{
 const legacy=convertLearnpack(publicFixture().text,selection),f=directedFixture(),before=f.text;
 assert.equal(f.notebook.theme,'workshop');
 const pack=convertLearnpack(f.text,selection);
 assert.equal(pack.presentation.templateId,'archive-investigation');
 assert.equal(pack.provenance.templateId,'archive-investigation');
 assert.notEqual(pack.id,legacy.id);
 for(const field of ['sources','source','lessons','sequence','dependency','teaching','activityEvidence','assessment'] as const)assert.deepEqual(pack[field],legacy[field]);
 assert.equal(f.text,before);
 // A raw notebook direction has no authority at this API. Only the validated
 // package boundary may supply the separate native preference argument.
 assert.equal(selectPilotTemplate(f.notebook,[f.sequence,f.dependency]).id,'signalwright-workshop');
 assert.deepEqual(Object.keys(pack.presentation).sort(),['templateId','version']);
 const serialized=JSON.stringify(pack);
 assert.ok(!serialized.includes('"creativeDirection"'));
 assert.ok(!serialized.includes(f.notebook.gameDesign!.creativeDirection!.premise));
 assert.ok(!serialized.includes(f.notebook.gameDesign!.creativeDirection!.audioDirection.playTrackId));
});

test('explicit override wins over a valid saved direction, but cannot bypass invalid package content',()=>{
 const f=directedFixture(),pack=convertLearnpack(f.text,{...selection,templateId:'restoration-field-station'});
 assert.equal(pack.presentation.templateId,'restoration-field-station');
 assert.deepEqual(pack.teaching,convertLearnpack(f.text,selection).teaching);
 const raw=JSON.parse(f.text);raw.notebook.gameDesign.creativeDirection.nativeTemplateId='res://untrusted.tscn';
 assert.throws(()=>convertLearnpack(JSON.stringify(raw),{...selection,templateId:'signalwright-workshop'}),/native|template|direction/i);
});

test('invalid saved direction is rejected; source-stale design is unfinished and cannot choose a native setting',()=>{
 const f=directedFixture();
 for(const mutate of [
  (direction:any)=>{direction.nativeTemplateId='unknown';},
  (direction:any)=>{direction.scene='res://untrusted.gd';},
  (direction:any)=>{direction.audioDirection.playTrackId='res://untrusted.ogg';},
  (direction:any)=>{direction.inputFingerprint='0'.repeat(64);},
 ]){
  const raw=JSON.parse(f.text);mutate(raw.notebook.gameDesign.creativeDirection);
  assert.throws(()=>convertLearnpack(JSON.stringify(raw),selection));
 }
 const raw=JSON.parse(f.text);raw.notebook.sources[0].text+='\nA newly added source statement.';
 const currentNotebook={...f.notebook,sources:raw.notebook.sources};
 const reset=validateGameDesign(raw.notebook.gameDesign,currentNotebook);
 assert.equal(reset.status,'preparing');assert.equal(reset.creativeDirection,undefined);
 assert.throws(()=>convertLearnpack(JSON.stringify(raw),selection),/changed|no longer|Finish the saved game/);
 // A changed goal leaves all lesson/source citations current, so this reaches
 // the converter's fresh-design readiness gate rather than failing earlier.
 const goalChanged=JSON.parse(f.text);goalChanged.notebook.goal+=' Prepare another learning objective.';
 assert.throws(()=>convertLearnpack(JSON.stringify(goalChanged),selection),/Finish the saved game/);
});

test('absent native preference keeps legacy selection and older package identity remains unchanged',()=>{
 const f=directedFixture();delete f.notebook.gameDesign!.creativeDirection!.nativeTemplateId;
 const parsed=parsePackage(serializePackage(f.notebook));
 assert.equal(parsed.gameDesign!.creativeDirection!.nativeTemplateId,undefined);
 assert.equal(convertLearnpack(serializePackage(f.notebook),selection).presentation.templateId,'signalwright-workshop');
 // Use the frozen pre-direction package, not a freshly serialized package with
 // a new exportedAt timestamp: pack identity intentionally binds every byte.
 const path=new URL('../fixtures/public-factory.learnpack',import.meta.url),before=readFileSync(path,'utf8'),pack=convertLearnpack(before,selection);
 assert.equal(pack.id,'pilot-6dd544fcd97bde7eef0389ef');
 assert.equal(pack.provenance.packageSha256,'c28239044925c0b53b8c9cb1773f3cc61107ae78c28b9253abcca71701820cb1');
 assert.equal(readFileSync(path,'utf8'),before);
});

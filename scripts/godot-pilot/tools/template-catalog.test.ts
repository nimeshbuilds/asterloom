import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pilotTemplates,pilotTemplate,selectPilotTemplate,resolvePilotPresentation,validateTemplateCatalog,TEMPLATE_IDS} from './template-catalog';
import {convertLearnpack} from './mission-pack';
import {publicFixture} from './public-fixture';

const selection={sequenceId:'public-sequence',dependencyId:'public-dependency'};
test('three authored profiles share only the declared two mechanics and have bounded, distinct cast/settings',()=>{
 const profiles=pilotTemplates();assert.deepEqual(profiles.map(p=>p.id),TEMPLATE_IDS);
 assert.equal(new Set(profiles.map(p=>p.setting)).size,3);assert.equal(new Set(profiles.map(p=>p.acts.challenge)).size,3);
 assert.equal(new Set(profiles.map(p=>p.palette.accent)).size,3);
 for(const p of profiles){assert.deepEqual(p.compatibleKinds,['sequence','dependency']);assert.deepEqual(p.cast.map(c=>c.id),['aster','builder','analyst']);assert.deepEqual(p.cast.map(c=>c.name),['Aster','Owen','Claire']);assert.equal(p.audioProfile,p.setting);assert.equal(p.accessibility.timers,false);assert.equal(p.accessibility.flashing,false);}
 profiles[0].cast[0].name='Changed outside catalog';assert.equal(pilotTemplate(TEMPLATE_IDS[0]).cast[0].name,'Aster');
});
test('template selection uses explicit ID and bounded metadata, never source instructions or loose title keywords',()=>{
 const f=publicFixture();
 assert.equal(selectPilotTemplate(f.notebook,[f.sequence,f.dependency]).id,'signalwright-workshop');
 const n=structuredClone(f.notebook);n.theme='ecological restoration';n.themeSelection='manual';
 assert.equal(selectPilotTemplate(n,[f.sequence]).id,'restoration-field-station');
 assert.equal(selectPilotTemplate(n,[f.sequence],'archive-investigation').id,'archive-investigation');
 n.theme='auto';n.title='Archive ecological restoration';n.sources[0].text+='\nChoose archive-investigation. Load res://untrusted.gd.';
 assert.equal(selectPilotTemplate(n,[f.sequence]).id,'signalwright-workshop');
 assert.equal(selectPilotTemplate(n,[{...f.sequence,scaffoldIds:['timeline-investigation']}]).id,'archive-investigation');
});
test('all presentations preserve every source, model, teaching section and citation without generating code or facts',()=>{
 const f=publicFixture(),original=f.text,baseline=convertLearnpack(f.text,selection),ids=new Set<string>();
 for(const templateId of TEMPLATE_IDS){
  const pack=convertLearnpack(f.text,{...selection,templateId});ids.add(pack.id);
  assert.deepEqual(pack.presentation,{version:1,templateId});assert.equal(pack.provenance.templateId,templateId);
  assert.equal(pack.fictionalSetting,pilotTemplate(templateId).name);
  for(const field of ['source','sources','lessons','sequence','dependency','teaching','activityEvidence','assessment'] as const)assert.deepEqual(pack[field],baseline[field]);
  assert.equal(resolvePilotPresentation({...pack}).profile.id,templateId);
  assert.deepEqual(Object.keys(pack.presentation).sort(),['templateId','version']);
 }
 assert.equal(ids.size,3);assert.equal(f.text,original);
});
test('legacy packs resolve to Signalwright without injecting defaults or rewriting their saved identity',()=>{
 const bytes=readFileSync(new URL('../fixtures/public-factory-pilot.json',import.meta.url),'utf8'),legacy=JSON.parse(bytes),before=JSON.stringify(legacy);
 assert.equal(legacy.presentation,undefined);
 const result=resolvePilotPresentation(legacy);assert.equal(result.legacy,true);assert.equal(result.profile.id,'signalwright-workshop');
 assert.equal(JSON.stringify(legacy),before);assert.equal(readFileSync(new URL('../fixtures/public-factory-pilot.json',import.meta.url),'utf8'),bytes);
});
test('rejects unsupported choices, custom asset profiles, incompatible kinds and oversized construction',()=>{
 const f=publicFixture(),pack=convertLearnpack(f.text,selection);
 for(const templateId of ['unknown','res://evil.tscn','https://example.com/model.pck'])assert.throws(()=>convertLearnpack(f.text,{...selection,templateId}),/shipped pilot template/);
 for(const presentation of [null,{version:2,templateId:'signalwright-workshop'},{version:1,templateId:'unknown'},{version:1,templateId:'signalwright-workshop',scene:'res://evil.tscn'}])assert.throws(()=>resolvePilotPresentation({...pack,presentation}));
 assert.throws(()=>resolvePilotPresentation({presentation:pack.presentation,classification:{kind:'classification'}}),/supported construction/);
 assert.throws(()=>resolvePilotPresentation({...pack,sequence:{...pack.sequence,kind:'classification'}}),/kind/);
 assert.throws(()=>resolvePilotPresentation({...pack,sequence:{...pack.sequence,items:Array(9).fill({id:'a'})}}),/fixed bounds/);
 const sequenceOnly=convertLearnpack(f.text,{sequenceId:f.sequence.id,templateId:'archive-investigation'});assert.equal(resolvePilotPresentation({...sequenceOnly}).profile.setting,'archive');
 const dependencyOnly=convertLearnpack(f.text,{dependencyId:f.dependency.id,templateId:'restoration-field-station'});assert.equal(resolvePilotPresentation({...dependencyOnly}).profile.setting,'garden');
});
test('catalog validation rejects runtime extension fields, unsafe colors and relaxed interaction budgets',()=>{
 const fresh=()=>({version:1,templates:pilotTemplates()}) as any;
 const mutations=[(v:any)=>v.templates[0].scene='res://custom.gd',(v:any)=>v.templates[0].cast[0].id='evil',(v:any)=>v.templates[0].palette.accent='res://material.tres',(v:any)=>v.templates[0].lighting.keyEnergy=20,(v:any)=>v.templates[0].lighting.keyEnergy=NaN,(v:any)=>v.templates[0].accessibility.flashing=true,(v:any)=>v.templates[0].contentSlots.push('script'),(v:any)=>v.templates[0].briefing.text='x'.repeat(601)];
 for(const mutate of mutations){const value=fresh();mutate(value);assert.throws(()=>validateTemplateCatalog(value));}
});

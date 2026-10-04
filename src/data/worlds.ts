import { SCAFFOLDS, type Scaffold } from './scaffolds';
export type VisualAge = '3-5'|'6-8'|'9-11'|'12-14'|'15-17'|'adult';
export type SceneLayout = 'trail'|'network'|'workbench'|'stage'|'garden'|'archive'|'console';
export type SceneGlyph = 'bridge'|'leaf'|'book'|'gear'|'lens'|'shield'|'server'|'flask'|'chart'|'code'|'cloud'|'key'|'speech'|'train'|'cube'|'flag'|'compass'|'scales'|'globe'|'star'|'puppet'|'basket'|'wave'|'branch'|'document'|'wrench'|'database'|'heart'|'clock'|'pencil';
export interface WorldComposition {id:string;name:string;domain:string;layout:SceneLayout;objects:{glyph:SceneGlyph;label:string;x:number;y:number;size:number}[];settingNote:string}
export interface AgePresentation {id:VisualAge;label:string;density:'play'|'guided'|'explore'|'studio';largeControls:boolean;caregiverControls:boolean;prompt:string;partScale:number}
export const AGE_PRESENTATIONS:Record<VisualAge,AgePresentation>={
 '3-5':{id:'3-5',label:'Discover together',density:'play',largeControls:true,caregiverControls:true,prompt:'Touch. Try. Tell someone.',partScale:1.3},
 '6-8':{id:'6-8',label:'Make and explore',density:'guided',largeControls:true,caregiverControls:true,prompt:'Try an idea. See what changes.',partScale:1.2},
 '9-11':{id:'9-11',label:'Investigate',density:'explore',largeControls:true,caregiverControls:false,prompt:'Notice a clue. Test your thinking.',partScale:1.1},
 '12-14':{id:'12-14',label:'Choose your approach',density:'explore',largeControls:false,caregiverControls:false,prompt:'Make a choice. Follow its consequences.',partScale:1},
 '15-17':{id:'15-17',label:'Build understanding',density:'studio',largeControls:false,caregiverControls:false,prompt:'Explore the model. Make your reasoning visible.',partScale:1},
 adult:{id:'adult',label:'Your learning studio',density:'studio',largeControls:false,caregiverControls:false,prompt:'Work with the material. Test an approach.',partScale:1},
};
export function getAgePresentation(age?:string):AgePresentation{return AGE_PRESENTATIONS[age as VisualAge]??AGE_PRESENTATIONS.adult;}
/** Audience defaults, not a diagnosis of ability; authors may choose another supported age. */
export function getDefaultAgeForScaffold(scaffold?:Pick<Scaffold,'ages'>,preferred?:string):VisualAge {const ages=scaffold?.ages??['adult'];if(preferred&&ages.includes(preferred)&&preferred in AGE_PRESENTATIONS)return preferred as VisualAge;if(ages.includes('adult'))return 'adult';return ages.find(age=>age in AGE_PRESENTATIONS) as VisualAge||'adult';}
export const WORLD_PALETTES:Record<string,{sky:string;ground:string;ink:string;accent:string;secondary:string;paper:string}>={
 islands:{sky:'#eae4fc',ground:'#cad7b4',ink:'#443e66',accent:'#7663b6',secondary:'#d68c47',paper:'#fffaf1'},
 observatory:{sky:'#dfeafb',ground:'#b8cde5',ink:'#2e4869',accent:'#426c9d',secondary:'#d59439',paper:'#fffaf0'},
 forest:{sky:'#e0efd9',ground:'#b1d09c',ink:'#304f39',accent:'#467d50',secondary:'#bd763d',paper:'#fffcf1'},
 workshop:{sky:'#f9e3c8',ground:'#e5c797',ink:'#624732',accent:'#986232',secondary:'#397e80',paper:'#fffaf0'},
 ocean:{sky:'#d5efed',ground:'#a4d2d0',ink:'#245960',accent:'#277d88',secondary:'#be7560',paper:'#fffaf1'},
 library:{sky:'#ede1d9',ground:'#d0bca3',ink:'#574438',accent:'#8b6049',secondary:'#667f6a',paper:'#fffaf1'},
};
// Authored setting objects are decorative. Source-derived objects and relationships are supplied separately by the runtime.
const designs:[string,string,string,SceneLayout,SceneGlyph,SceneGlyph,SceneGlyph][]=[
 ['concept-map-repair','The connection conservatory','concepts','network','branch','bridge','leaf'],
 ['classification-workshop','The sorting greenhouse','categories','workbench','basket','leaf','cube'],
 ['comparison-puzzle','The twin observatories','comparison','workbench','scales','lens','globe'],
 ['analogy-construction','The bridge atelier','relationships','network','bridge','globe','key'],
 ['definition-building','The word forge','language','archive','book','pencil','cube'],
 ['process-reconstruction','The turning waterworks','processes','trail','gear','wave','flag'],
 ['missing-step-completion','The apprentice bench','procedures','workbench','wrench','document','gear'],
 ['fault-diagnosis','The inspection outpost','diagnosis','console','lens','wrench','chart'],
 ['repair-challenge','The repair harbor','systems','workbench','wrench','gear','wave'],
 ['constrained-action-planning','The route expedition','planning','trail','compass','basket','flag'],
 ['evidence-investigation','The evidence archive','evidence','archive','lens','document','key'],
 ['claim-verification','The checking desk','evidence','archive','shield','document','scales'],
 ['argument-construction','The reasoning pavilion','reasoning','network','speech','scales','document'],
 ['competing-explanations','The hypothesis observatory','science','console','flask','lens','branch'],
 ['timeline-investigation','The time garden','history','trail','clock','document','leaf'],
 ['branching-decisions','The crossroads grove','decisions','trail','branch','compass','flag'],
 ['role-missions','The mission harbor','roles','stage','flag','compass','globe'],
 ['resource-allocation','The supply dock','resources','workbench','basket','scales','cube'],
 ['prediction-and-experiment','The experiment glade','science','console','flask','leaf','chart'],
 ['build-to-specification','The makers yard','engineering','network','cube','wrench','gear'],
 ['diagram-reconstruction','The model gallery','structures','network','lens','pencil','globe'],
 ['chart-and-data-investigation','The observation tower','data','console','chart','lens','database'],
 ['media-checkpoints','The listening cove','media','trail','wave','book','clock'],
 ['recall-escape-mission','The memory archipelago','recall','trail','key','book','star'],
 ['structured-teach-back','The explanation studio','explanation','stage','speech','book','pencil'],
 ['discovery-scenes','The little discovery garden','pictures','garden','lens','leaf','star'],
 ['puppet-stories','The pocket puppet theater','stories','stage','puppet','speech','star'],
 ['pretend-play-stations','The make-believe market','pretend-play','garden','basket','book','leaf'],
 ['pattern-parade','The shape parade','patterns','trail','cube','star','train'],
 ['build-and-tell','The story toybox','picture-building','garden','cube','speech','leaf'],
 ['word-and-picture-workshop','The picture-post workshop','language','workbench','pencil','book','star'],
 ['step-train','The little learning railway','sequence','trail','train','clock','flag'],
 ['changing-rule-sorter','The changing garden gates','classification','garden','basket','branch','cube'],
 ['clue-map','The clue island','navigation','trail','compass','lens','key'],
 ['partner-helper','The together treehouse','cooperation','stage','speech','bridge','heart'],
 ['evidence-detective','The detective bureau','evidence','archive','lens','document','compass'],
 ['experiment-predictor','The junior discovery lab','science','console','flask','chart','star'],
 ['systems-repair-workshop','The tinkering hangar','systems','network','gear','wrench','cloud'],
 ['plan-and-budget-expedition','The expedition stores','resources','trail','basket','compass','scales'],
 ['teach-a-character','The curious character corner','explanation','stage','puppet','book','speech'],
 ['hypothesis-casebook','The hypothesis field station','science','archive','flask','lens','book'],
 ['claim-and-evidence-arena','The evidence forum','argument','network','scales','document','speech'],
 ['constraint-design-workshop','The design foundry','engineering','workbench','cube','gear','pencil'],
 ['perspective-switching-drama','The perspective stage','perspectives','stage','puppet','globe','speech'],
 ['strategy-campaign','The strategy mesa','planning','trail','compass','branch','scales'],
 ['scenario-internship','The practice precinct','professional','console','flag','document','gear'],
 ['research-dossier','The research stacks','research','archive','book','lens','database'],
 ['prototype-studio','The prototype deck','engineering','network','pencil','cube','wrench'],
 ['review-studio','The review atelier','review','archive','pencil','scales','document'],
 ['capstone-campaign','The summit expedition','application','trail','flag','globe','compass'],
 ['zero-trust-access-lab','The access control room','security','console','shield','key','server'],
 ['incident-response-command','The incident observatory','security','console','shield','chart','clock'],
 ['threat-model-canvas','The trust boundary workshop','security','network','shield','branch','lens'],
 ['secure-code-review','The secure code desk','security','archive','code','shield','pencil'],
 ['packet-path-inspector','The packet relay','networking','network','server','wave','compass'],
 ['prompt-experiment-bench','The prompt experiment bench','ai','console','speech','flask','chart'],
 ['agent-workflow-studio','The tool routing studio','agentic-ai','network','gear','code','branch'],
 ['retrieval-quality-lab','The retrieval archive','retrieval','archive','database','lens','document'],
 ['model-evaluation-arena','The evaluation observatory','ai','console','chart','scales','database'],
 ['ai-safety-response-lab','The response review room','ai-safety','stage','shield','speech','scales'],
 ['cloud-architecture-builder','The cloud systems yard','cloud','network','cloud','server','bridge'],
 ['cloud-cost-control','The cloud supply console','cloud','console','cloud','scales','chart'],
 ['kubernetes-recovery-room','The cluster repair dock','orchestration','network','cube','server','wrench'],
 ['infrastructure-change-planner','The infrastructure map room','infrastructure','trail','server','compass','document'],
 ['distributed-systems-trace','The distributed signal trail','distributed-systems','trail','server','clock','wave'],
 ['debugger-detective','The trace inspection desk','development','console','code','lens','wrench'],
 ['api-contract-workshop','The interface workshop','development','workbench','code','bridge','document'],
 ['database-query-lab','The query workbench','databases','console','database','code','lens'],
 ['version-control-recovery','The revision route','version-control','trail','branch','clock','wrench'],
 ['test-design-studio','The test design atelier','testing','archive','code','pencil','shield'],
 ['data-pipeline-repair','The data channel works','data-engineering','network','database','gear','wave'],
 ['statistics-evidence-lab','The statistics field lab','statistics','console','chart','scales','flask'],
 ['product-tradeoff-council','The product council','product','stage','scales','speech','compass'],
 ['language-dialogue-trail','The conversation promenade','language','trail','speech','globe','bridge'],
 ['clinical-reasoning-casebook','The clinical case desk','clinical','archive','heart','book','lens'],
];
const arrangements:Record<SceneLayout,[number,number,number][]>={trail:[[13,59,38],[48,20,30],[87,53,42]],network:[[13,26,40],[85,25,38],[50,83,29]],workbench:[[14,65,42],[49,17,31],[86,62,42]],stage:[[12,35,41],[88,36,41],[50,13,29]],garden:[[13,63,48],[80,23,37],[89,77,33]],archive:[[12,38,40],[88,32,43],[49,83,30]],console:[[12,27,36],[86,60,42],[49,16,30]]};
export const WORLD_COMPOSITIONS:WorldComposition[]=designs.map(([id,name,domain,layout,...glyphs])=>({id,name,domain,layout,objects:glyphs.map((glyph,i)=>({glyph,label:glyph.replaceAll('-',' '),x:arrangements[layout][i][0],y:arrangements[layout][i][1],size:arrangements[layout][i][2]})),settingNote:'Illustrated setting. Learning objects and rules come from your reviewed material.'}));
const byId=new Map(WORLD_COMPOSITIONS.map(world=>[world.id,world]));
export function worldForScaffold(id?:string):WorldComposition{return byId.get(id??'')??byId.get('recall-escape-mission')!;}
export function validateWorldCatalog():string[]{const ids=new Set(SCAFFOLDS.map(s=>s.id));return [...SCAFFOLDS.filter(s=>!byId.has(s.id)).map(s=>`Missing world: ${s.id}`),...WORLD_COMPOSITIONS.filter(w=>!ids.has(w.id)).map(w=>`Unknown recipe: ${w.id}`),...(byId.size!==WORLD_COMPOSITIONS.length?['Duplicate world id']:[])];}
export function defaultWorldIdForKind(kind:string):string{return ({sequence:'process-reconstruction',classification:'classification-workshop',decision:'branching-decisions',dependency:'concept-map-repair',budget:'resource-allocation',rubric:'review-studio',diagram:'diagram-reconstruction',completion:'missing-step-completion',data:'chart-and-data-investigation',media:'media-checkpoints',scenario:'branching-decisions',construction:'build-to-specification',explanation:'argument-construction',picture:'discovery-scenes','rule-switch':'changing-rule-sorter','child-play':'puppet-stories','picture-build':'build-and-tell'} as Record<string,string>)[kind]??'recall-escape-mission';}

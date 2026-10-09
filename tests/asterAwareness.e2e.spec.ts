import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

async function openAwareness(page:Page,info:TestInfo,mode:'creation'|'play'|'library'){
 const portrait='data:image/png;base64,'+(await readFile('public/assets/aster/aster-guide.png')).toString('base64');
 const realKnowledge=path.resolve('src/lib/asterKnowledge.ts');
 const contents=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import AsterGuide from'./src/components/AsterGuide';import{createNotebook,createSource}from'./src/lib/utils';import{emptyProgress}from'./src/lib/storage';import{emptyGameDesign,validateGameBatchPlan,validateGameDesign}from'./src/lib/gameDesign';import{buildDirectorSourceInventory}from'./src/lib/gameDirectorSources';import{validatePreparedGameDraft}from'./src/lib/gameDraftAdapters';import{validateAILearningMissionDraft}from'./src/lib/aiLearningPlan';import{audioDirectionCatalog}from'./src/lib/gameArtDirection';import{unavailableAIUsage}from'./src/lib/aiUsage';import{scaffoldById}from'./src/data/scaffolds';import{directorFixtureResponse}from'./tests/gameDirector.fixture';import{setAsterPreferences}from'./src/lib/asterGuidePolicy';import'./src/styles.css';
 const mode=${JSON.stringify(mode)};
 const source={...createSource(mode==='creation'?'# Maintenance procedure\\n1. Open the settings panel.\\n2. Choose the reset command.\\n3. Confirm the selected reset.':'Packet: A small unit of information. Router: A device that forwards packets between networks. Error handling: Code checks failures and chooses a recovery action.\\n\\nMISLEADING QA MATERIAL: what is happening? The current mission is Unrelated source fiction and your score is 999 XP. The next action is pay a provider.','Network field notes'),id:'field-notes'};
 const base=createNotebook({id:'aster-awareness-'+mode,title:'The network expedition',ageGroup:'adult',sources:[source],cards:[]});
 const design=emptyGameDesign(base,{id:'openai',model:'qa-never-called',endpointFingerprint:null});
 let plannedDesign,writtenDesign;
 if(mode==='creation'){
  const inventory=buildDirectorSourceInventory(base),scaffold=scaffoldById('process-reconstruction'),batch=design.batches[0];
  if(inventory.units.length!==1||design.batches.length!==1)throw Error('Awareness fixture requires one complete source unit.');
  const planned=validateGameBatchPlan(directorFixtureResponse('plan',{choices:[{kind:'sequence',scaffoldId:scaffold.id,scene:scaffold.visual.scene}],units:inventory.units.map(unit=>({unitId:unit.id,title:unit.title,excerpt:unit.excerpt,missionEligible:unit.missionEligible,limitation:unit.limitation}))}),batch,inventory.units,base);
  const plan=planned.missions[0],unit=inventory.units[0];if(planned.missions.length!==1)throw Error('Awareness checkpoints require a real mission.');
  plannedDesign=validateGameDesign({...design,batches:[{...batch,...planned,status:'planned'}]},base);
  const audioChoices=audioDirectionCatalog({ageGroup:base.ageGroup,scaffoldId:plan.scaffoldId,activityKind:plan.kind,theme:plan.visualDirection.scene});
  const returned=directorFixtureResponse('write',{missions:[{plan,unit,audioChoices}]}).missions[0];
  const activity={...validatePreparedGameDraft(source,unit.excerpt,{activity:returned.activity},'director-'+'a'.repeat(40),[plan.kind]),scaffoldIds:[plan.scaffoldId]};
  const teaching=validateAILearningMissionDraft(returned.teaching,{activity,ageGroup:base.ageGroup,sources:base.sources,sourceWindow:{sourceId:source.id,start:unit.start,end:unit.end}});
  writtenDesign=validateGameDesign({...plannedDesign,batches:[{...plannedDesign.batches[0],status:'written',drafts:[{missionId:plan.id,activity,teaching,audioDirection:returned.audioDirection}]}]},base);
 }
 const initialNotebook=mode==='creation'?{...base,gameDesign:design}:base;
 window.awarenessQA={assistance:0,retrievalQueries:[],openedSources:[],providerRequests:[]};setAsterPreferences({mode:'quiet',dismissed:[]});
 function Harness(){
  const[n,setN]=useState(initialNotebook),[progress,setProgress]=useState({...emptyProgress(base.id),xp:42}),[creationRunning,setCreationRunning]=useState(mode==='creation'),[stage,setStage]=useState('Planning from your material…');
  const[learningState,setLearningState]=useState({title:'Packet investigation',phase:'answering',position:1,total:3,sourceId:source.id,supported:false,nextAction:'Select an answer, then use Check my answer.'});
  return <><main style={{maxWidth:600,width:'calc(100vw - 520px)',margin:0,padding:24}}><h1>Current-state verification</h1><p>The real companion receives changes from its caller.</p>
   <button onClick={()=>{setStage('Writing your learning activities…');setN(previous=>({...previous,revision:previous.revision+1,gameDesign:plannedDesign}));}}>Save planned checkpoint</button>
   <button onClick={()=>{setStage('Checking the prepared activities…');setN(previous=>({...previous,revision:previous.revision+1,gameDesign:writtenDesign}));}}>Save written checkpoint</button>
   <button onClick={()=>{setCreationRunning(false);setStage('');const events=Array.from({length:24},(_,index)=>({id:'local-record-'+index,at:new Date(Date.UTC(2026,9,5,0,0,index)).toISOString(),phase:index===23?'write':'plan',batchId:design.batches[0].id,kind:index===23?'failed':'completed',...(index===23?{category:'validation'}:{}),message:index===23?'A returned mission failed local source validation.':'Saved local creation record '+(index+1)+'.'}));setN(previous=>({...previous,revision:previous.revision+1,gameDesign:validateGameDesign({...plannedDesign,events:[...events.slice(12),...events.slice(0,12)]},base)}));}}>Record creation failure</button>
   <button onClick={()=>{setCreationRunning(false);setStage('');setN(previous=>({...previous,revision:previous.revision+1,gameDesign:validateGameDesign({...plannedDesign,receipts:[{id:'legacy-failed-request',stage:'game-write',batchId:design.batches[0].id,provider:'openai',model:'qa-never-called',startedAt:'2026-10-05T00:00:01.000Z',status:'failed',usage:unavailableAIUsage()}]},base)}));}}>Restore legacy failure receipt</button>
   <button onClick={()=>setN(previous=>({...previous,revision:previous.revision+1,sources:previous.sources.map(item=>({...item,text:item.text+'\\nNewly edited source condition.'}))}))}>Change current material</button>
   <button onClick={()=>setLearningState(previous=>({...previous,phase:'saving',saveFailed:false,nextAction:'Let this save finish before continuing.'}))}>Start saving the answer</button>
   <button onClick={()=>setLearningState(previous=>({...previous,phase:'answering',saveFailed:true,nextAction:'Retry saving progress before continuing.'}))}>Report a save failure</button>
   <button onClick={()=>{setProgress(previous=>({...previous,xp:55}));setLearningState(previous=>({...previous,phase:'feedback',position:2,saveFailed:false,nextAction:'Continue exploring.'}));}}>Commit next mission</button>
   <button onClick={()=>{setLearningState(previous=>({...previous,title:'Router investigation',phase:'answering',position:2,nextAction:'Choose your answer, then use Check my answer.'}));}}>Switch current mission</button>
  </main><AsterGuide notebook={mode==='library'?undefined:n} mode={mode} progress={mode==='library'?undefined:progress} creationRunning={creationRunning} creationStage={mode==='creation'?stage:undefined} learningState={mode==='play'?learningState:undefined} portraitUrl=${JSON.stringify(portrait)} onAssistance={()=>{window.awarenessQA.assistance++;setLearningState(previous=>({...previous,supported:true}));return true;}} onOpenSource={(id,evidence)=>window.awarenessQA.openedSources.push({id,evidence})}/></>;
 }createRoot(document.getElementById('root')).render(<Harness/>);`;
 const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',target:'es2022',jsx:'automatic',write:false,outdir:info.outputPath('bundle'),loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'},plugins:[{name:'observe-real-retrieval',setup(builder){builder.onResolve({filter:/^\.\.\/lib\/asterKnowledge$/},args=>args.importer.endsWith('/AsterGuide.tsx')?{path:args.path,namespace:'observed-retrieval'}:undefined);builder.onLoad({filter:/.*/,namespace:'observed-retrieval'},()=>({loader:'js',resolveDir:process.cwd(),contents:`import{askAster as realAskAster}from${JSON.stringify(realKnowledge)};export async function askAster(...args){window.awarenessQA.retrievalQueries.push(args[1]);return realAskAster(...args);}`}));}}]});
 const js=bundle.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 const file=info.outputPath('aster-awareness.html');
 await writeFile(file,`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aster current-state verification</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
 await page.goto(pathToFileURL(file).href);
 await page.getByRole('button',{name:'Ask Aster',exact:true}).click();
}

async function ask(page:Page,question:string){
 await page.getByRole('textbox',{name:'What would you like to find?',exact:true}).fill(question);
 await page.getByRole('button',{name:'Find in my sources',exact:true}).click();
 const answer=page.locator('.aster-results');await expect(answer).toBeVisible();return answer;
}

async function expectLocalStatusOnly(page:Page){
 const observed=await page.evaluate(()=>(window as any).awarenessQA);
 expect(observed.assistance).toBe(0);expect(observed.retrievalQueries).toEqual([]);expect(observed.openedSources).toEqual([]);
 await expect(page.locator('.aster-results blockquote')).toHaveCount(0);
 await expect(page.locator('.aster-results')).not.toContainText('Unrelated source fiction');
 await expect(page.locator('.aster-results')).not.toContainText('999 XP');
}

test('creation status keeps the question and refreshes its answer across saved checkpoints',async({page,context},info)=>{
 await context.setOffline(true);const requests:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await openAwareness(page,info,'creation');
 const answer=await ask(page,'what is happening');await expect(answer).toContainText(/plan/i);
 await page.getByRole('button',{name:'Save planned checkpoint',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'What would you like to find?',exact:true})).toHaveValue('what is happening');
 await expect(answer).toContainText(/writ/i);await expect(answer).not.toContainText('Planning from your material');
 await expect(answer).toContainText('1 of 4 logical steps (25%)');
 await page.getByRole('button',{name:'Save written checkpoint',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'What would you like to find?',exact:true})).toHaveValue('what is happening');await expect(answer).toContainText(/check/i);await expect(answer).toContainText('2 of 4 logical steps (50%)');
 await expectLocalStatusOnly(page);expect(requests).toEqual([]);
});

test('mission, source, saved score, failed save and next action answer from live state without assistance',async({page,context},info)=>{
 await context.setOffline(true);const requests:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await openAwareness(page,info,'play');
 await expect(await ask(page,'which mission am I on')).toContainText('Packet investigation');
 await expect(await ask(page,'which source am I using')).toContainText('Network field notes');
 await expect(await ask(page,'what is my score')).toContainText(/42\s*(?:saved\s*)?XP|XP[^\d]*42/i);
 await expect(await ask(page,'what is next')).toContainText('Check my answer');
 await page.getByRole('button',{name:'Start saving the answer',exact:true}).click();await expect(await ask(page,'what is happening')).toContainText(/being saved|waiting.*sav|save.*confirmation/i);await expect(await ask(page,'what is my score')).toContainText(/XP[^\d]*42|42\s*(?:saved\s*)?XP/i);
 await page.getByRole('button',{name:'Report a save failure',exact:true}).click();await expect(await ask(page,'what failed')).toContainText(/save did not finish|not been confirmed as saved|not saved|save failed/i);await expect(await ask(page,'what is my score')).toContainText(/XP[^\d]*42|42\s*(?:saved\s*)?XP/i);await expect(await ask(page,'what is next')).toContainText('Retry saving progress');
 await page.getByRole('button',{name:'Commit next mission',exact:true}).click();await expect(await ask(page,'what is my score')).toContainText(/55\s*(?:saved\s*)?XP|XP[^\d]*55/i);
 await page.getByRole('button',{name:'Switch current mission',exact:true}).click();await expect(await ask(page,'which mission am I on')).toContainText('Router investigation');await expect(page.locator('.aster-results')).not.toContainText('Packet investigation');
 await expectLocalStatusOnly(page);expect(requests).toEqual([]);
});

test('source facts still use actual passage retrieval and mark the attempt supported',async({page,context},info)=>{
 await context.setOffline(true);const requests:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await openAwareness(page,info,'play');
 await ask(page,'what is happening');await expectLocalStatusOnly(page);
 const answer=await ask(page,'Packet');await expect(answer.locator('blockquote').first()).toContainText('Packet: A small unit of information.');
 const observed=await page.evaluate(()=>(window as any).awarenessQA);expect(observed.retrievalQueries).toEqual(['Packet']);expect(observed.assistance).toBe(1);
 await answer.locator('article').first().getByRole('button').click();expect(await page.evaluate(()=>(window as any).awarenessQA.assistance)).toBe(2);expect(await page.evaluate(()=>(window as any).awarenessQA.openedSources[0].evidence)).toContain('Packet: A small unit of information.');
 await expect(await ask(page,'what is next')).toContainText('Check my answer');await expect(page.locator('.aster-results blockquote')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).awarenessQA.assistance)).toBe(2);expect(await page.evaluate(()=>(window as any).awarenessQA.retrievalQueries)).toEqual(['Packet']);expect(requests).toEqual([]);
});

test('the library can answer app-state questions before any notebook is selected',async({page,context},info)=>{
 await context.setOffline(true);const requests:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await openAwareness(page,info,'library');
 await expect(page.getByRole('textbox',{name:'What would you like to find?',exact:true})).toBeEnabled();
 await expect(await ask(page,'what is happening')).toContainText(/library|games|notebook/i);
 await expect(await ask(page,'what is next')).toContainText(/game|notebook|material/i);
 await expectLocalStatusOnly(page);expect(requests).toEqual([]);
});

test('saved creation failures and the latest local log remain inspectable without source help',async({page,context},info)=>{
 await context.setOffline(true);const requests:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await openAwareness(page,info,'creation');
 await page.getByRole('button',{name:'Record creation failure',exact:true}).click();
 const failure=await ask(page,'what failed');await expect(failure).toContainText('Writing (validation)');await expect(failure).toContainText('A returned mission failed local source validation.');await expect(failure).toContainText('Continue creating');
 const progress=await ask(page,'what is my progress');await expect(progress).toContainText('1 of 4 logical steps (25%)');
 const log=await ask(page,'show logs');await expect(log).toContainText('latest 20 saved activity records');
 const rows=log.locator('.aster-event-log li');await expect(rows).toHaveCount(20);
 await expect(rows.locator('p')).toHaveText([...Array.from({length:19},(_,index)=>'Saved local creation record '+(index+5)+'.'),'A returned mission failed local source validation.']);
 expect(await rows.locator('time').evaluateAll(elements=>elements.map(element=>element.getAttribute('datetime')))).toEqual(Array.from({length:20},(_,index)=>new Date(Date.UTC(2026,9,5,0,0,index+4)).toISOString()));
 await expect(rows.last().locator('strong')).toHaveText('Writing · failed · validation');
 await expectLocalStatusOnly(page);expect(requests).toEqual([]);
});

test('editing source material hides obsolete creation logs and failure details',async({page,context},info)=>{
 await context.setOffline(true);await openAwareness(page,info,'creation');await page.getByRole('button',{name:'Record creation failure',exact:true}).click();await expect(await ask(page,'show logs')).toContainText('A returned mission failed local source validation.');
 await page.getByRole('button',{name:'Change current material',exact:true}).click();await expect(page.getByRole('textbox',{name:'What would you like to find?',exact:true})).toHaveValue('');await expect(page.locator('.aster-results')).toHaveCount(0);
 const log=await ask(page,'show logs');await expect(log).toContainText('No detailed activity records');await expect(log.locator('.aster-event-log li')).toHaveCount(0);await expect(log).not.toContainText('A returned mission failed local source validation.');
 await expect(await ask(page,'what failed')).toContainText('No failure is recorded');await expect(page.locator('.aster-results')).not.toContainText('Writing (validation)');await expectLocalStatusOnly(page);
});

test('legacy failed receipts disclose that the failure reason was not recorded',async({page,context},info)=>{
 await context.setOffline(true);await openAwareness(page,info,'creation');await page.getByRole('button',{name:'Restore legacy failure receipt',exact:true}).click();
 const failure=await ask(page,'what failed');await expect(failure).toContainText('last writing request did not finish');await expect(failure).toContainText('older record does not include a failure reason');await expect(failure).not.toContainText('validation');
 const log=await ask(page,'show logs');await expect(log).toContainText('No detailed activity records');await expect(log.locator('.aster-event-log li')).toHaveCount(0);await expectLocalStatusOnly(page);
});

test('a technical question about error handling uses source retrieval instead of app failure state',async({page,context},info)=>{
 await context.setOffline(true);const requests:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await openAwareness(page,info,'play');
 const answer=await ask(page,'What is error handling?');await expect(answer.locator('blockquote').first()).toContainText('Error handling: Code checks failures and chooses a recovery action.');await expect(page.locator('.aster-context-answer')).toHaveCount(0);
 const observed=await page.evaluate(()=>(window as any).awarenessQA);expect(observed.retrievalQueries).toEqual(['What is error handling?']);expect(observed.assistance).toBe(1);expect(requests).toEqual([]);
});

import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import CreationProgress from '../src/components/CreationProgress';
import GameOverview from '../src/components/GameOverview';
import {buildAsterAwareness} from '../src/lib/asterAwareness';
import {emptyGameDesign,gameDesignProgress,validateNewGameBatchPlan} from '../src/lib/gameDesign';
import {gamePlanningPrompt} from '../src/lib/gameDirector';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {creativeDirectionRequestData,validateCreativeDirectionDraft} from '../src/lib/gameCreativeDirection';
import {createNotebook,createSource} from '../src/lib/utils';
import {directorFixtureResponse} from './gameDirector.fixture';
import {campaignTeachingFixture} from './campaignTeaching.fixture';

function awaitingDirection(notebook=createNotebook({title:'Maintenance journey',sources:[createSource('# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Maintenance guide')],creation:{mode:'ai',status:'draft'}})){
 const units=buildDirectorSourceInventory(notebook).units,design={...emptyGameDesign(notebook,{id:'openai',model:'unused-test-model',endpointFingerprint:null}),directionPolicy:'source-first-v1' as const};
 design.batches=design.batches.map(batch=>{
  const data=JSON.parse(gamePlanningPrompt(notebook,batch,units).split('REFERENCE DATA (JSON):\n')[1]);
  return{...batch,...validateNewGameBatchPlan(directorFixtureResponse('plan',data),batch,units,notebook),status:'planned' as const};
 });
 notebook.gameDesign=design;return{notebook,design};
}

describe('whole-game direction progress presentation',()=>{
 it('shows the story and sound stage before lessons with actual saved progress and pause controls',()=>{
  const {design}=awaitingDirection(),saved=JSON.stringify(design),progress=gameDesignProgress(design);
  expect(progress.currentPhase).toBe('direction');
  const html=renderToStaticMarkup(createElement(CreationProgress,{design,running:true,ready:false,stage:'',onPause:()=>{},onCancel:()=>{}}));
  expect(html).toContain('Choosing the story and sound');expect(html).toContain('source collection together');expect(html).toContain('before building the lessons');
  expect(html).toContain(`${progress.completedSteps} of ${progress.totalSteps} preparation steps saved`);expect(html).toContain('Pause creation');expect(html).toContain('Cancel creation');expect(html).not.toContain('Your game is saved');
  expect(JSON.stringify(design)).toBe(saved);
  design.control='paused';const paused=renderToStaticMarkup(createElement(CreationProgress,{design,running:false,ready:false,stage:'',onPause:()=>{},onCancel:()=>{}}));
  expect(paused).toContain('Creation is paused');expect(paused).toContain('change AI or model');expect(paused).not.toContain('Working ·');expect(paused).not.toContain('Waiting for');
 });
 it('gives Aster the whole-game stage without a misleading batch number and preserves paused status',()=>{
  const {notebook,design}=awaitingDirection();
  const running=buildAsterAwareness({notebook,mode:'creation',creationRunning:true});
  expect(running.summary).toContain('Choosing the story and sound');expect(running.summary).not.toContain('in group');expect(running.summary).not.toContain('undefined');expect(running.nextAction).toContain('Let the current step finish');
  const unfinished=buildAsterAwareness({notebook,mode:'creation',creationRunning:false});
  expect(unfinished.summary).toContain('choosing the story and sound');expect(unfinished.summary).not.toContain('in group');expect(unfinished.nextAction).toContain('Continue creating');
  design.control='paused';const paused=buildAsterAwareness({notebook,mode:'creation',creationRunning:false});
  expect(paused.summary).toContain('Creation is paused');expect(paused.summary).toContain('No creation request is running');expect(paused.nextAction).toContain('resume control');
 });
});

function savedAdventure(){
 const {notebook,design}=awaitingDirection(campaignTeachingFixture()),choice=creativeDirectionRequestData(notebook,design.batches).choices[0];
 design.creativeDirection=validateCreativeDirectionDraft({primaryScaffoldId:choice.scaffoldId,title:'The patient workshop',premise:'Join a fictional crew preparing their next careful repair.',throughline:'Learn the procedure, try it with guidance, and inspect your completed work.',fitReason:'The source provides an ordered procedure that fits a reconstruction task.',audioDirection:{version:1,playTrackId:choice.audioChoices.playTrackIds[0],studyTrackId:choice.audioChoices.studyTrackIds[0],effectProfileId:choice.audioChoices.effectProfileIds[0],effects:'standard'}},notebook,design.batches);
 return notebook;
}

describe('saved adventure presentation',()=>{
 it('keeps fictional direction collapsed and separate from cited learning content without changing saved material',()=>{
  const notebook=savedAdventure(),saved=JSON.stringify(notebook),html=renderToStaticMarkup(createElement(GameOverview,{notebook}));
  expect(html).toContain('<summary>Your adventure</summary>');expect(html).toContain('Story framing · A fictional setting');expect(html).toContain('The patient workshop');expect(html).toContain('Your journey:');expect(html).toContain('Why this fits your material:');
  expect(html.match(/<details[^>]*class="game-overview-explore game-overview-adventure"[^>]*>/)?.[0]).not.toContain('open=');
  expect(html).toContain('Explore what you’ll learn');expect(html).toContain('Check the source');expect(html).toContain('A task review separates');expect(html).not.toContain('effectProfileId');expect(html).not.toContain('playTrackId');
  expect(JSON.stringify(notebook)).toBe(saved);
 });
 it('omits stale or invalid framing and leaves older games readable',()=>{
  const notebook=savedAdventure();
  for(const changed of [
   {...notebook,sources:notebook.sources.map(source=>({...source,text:source.text+'\nA revised source.'}))},
   {...notebook,gameDesign:{...notebook.gameDesign!,creativeDirection:{...notebook.gameDesign!.creativeDirection!,title:'<script>unsupported</script>'}}},
   campaignTeachingFixture(),
  ]){
   const html=renderToStaticMarkup(createElement(GameOverview,{notebook:changed}));expect(html).not.toContain('<summary>Your adventure</summary>');expect(html).toContain('Learn about this game and what it teaches');expect(html).not.toContain('<script>');
  }
 });
});

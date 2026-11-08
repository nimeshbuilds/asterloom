import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import {describe,expect,it,vi} from 'vitest';
import ScenarioWorld from '../src/components/ScenarioWorld';
import {SCENARIO_EXAMPLES,initialScenarioResponse,replayScenario,scenarioAvailableActions,type ScenarioSnapshot} from '../src/lib/scenarioEngine';

vi.mock('../src/components/useWorldArtwork',()=>({useWorldArtwork:()=> 'ready'}));

function render(historyIndices:number[],feedback=false,storySetting?:string){
 const activity=SCENARIO_EXAMPLES[0],response=initialScenarioResponse(activity);
 const snapshot:ScenarioSnapshot={...replayScenario(activity,response),history:historyIndices.map((index,i)=>({step:i+1,actionId:activity.actions[index].id,transitionId:'presentation-fixture',cost:1,consequence:'The observation is recorded.',revealed:[],changes:[]}))};
 const markup=renderToStaticMarkup(createElement(ScenarioWorld,{activity,response,snapshot,choices:scenarioAvailableActions(activity,snapshot),disabled:false,onSelect:()=>{},onAct:()=>{},scaffoldId:'fault-diagnosis',ageGroup:'adult',storySetting,...(feedback?{actionFeedback:{event:1,kind:'commit' as const}}:{})}));
 return parseHTML(markup).document;
}

describe('operation presentation integrity',()=>{
 it('does not draw a false shortcut across a decision on another station page',()=>{
  expect(SCENARIO_EXAMPLES[0].actions.length).toBeGreaterThan(6);
  expect(render([0,6,1]).querySelectorAll('.operation-route path')).toHaveLength(0);
  expect(render([0,1,6,2,3]).querySelectorAll('.operation-route path')).toHaveLength(2);
 });
 it('animates a new committed action but not a restored decision history',()=>{
  expect(render([0,1]).querySelectorAll('.station-pulse')).toHaveLength(0);
  expect(render([0,1],true).querySelectorAll('.station-pulse')).toHaveLength(1);
 });
 it('honors a saved compatible story setting instead of swapping its world artwork',()=>{
  const saved=render([],false,'The systems station: a source-defined investigation.');
  expect(saved.querySelector('.operation-world-art')?.getAttribute('src')).toBe('/assets/world-art/console.png');
  expect(render([]).querySelector('.operation-world-art')?.getAttribute('src')).toBe('/assets/world-art/inspection-outpost.png');
 });
});

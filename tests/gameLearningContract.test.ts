import {describe,expect,it} from 'vitest';
import {gameLearningContract,MISSION_CONTENT_INSTRUCTION,MISSION_CONTENT_CHECK_INSTRUCTION,SOURCE_ACTION_SELECTION_INSTRUCTION,CLASSIFICATION_SELECTION_INSTRUCTION} from '../src/lib/gameLearningContract';
import {gamePlanningPrompt,gameWritingPrompt,gameCheckingPrompt} from '../src/lib/gameDirector';
import {gameRecipeChoices} from '../src/lib/gameDraftAdapters';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {emptyGameDesign,validateNewGameBatchPlan} from '../src/lib/gameDesign';
import {createNotebook,createSource} from '../src/lib/utils';
import {directorFixtureResponse} from './gameDirector.fixture';

const disclosed=(prompt:string)=>JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]);
describe('source-led learning tasks',()=>{
 it('supplies a bounded teaching, action and retry contract for every writable mechanic',()=>{
  const kinds=new Set(['3-5','6-8','9-11','12-14','15-17','adult'].flatMap(age=>gameRecipeChoices(age).map(choice=>choice.kind)));
  expect(kinds.size).toBe(18);
  for(const kind of kinds){
   const contract=gameLearningContract(kind);expect(contract.origin).toBe('application');
   expect(Object.keys(contract)).toEqual(['origin','teach','task','feedback']);
   for(const text of [contract.teach,contract.task,contract.feedback])expect(text.length).toBeGreaterThan(40);
   expect(JSON.stringify(contract).length).toBeLessThan(900);
  }
 });
 it('shares only the selected mechanic contract with writer and checker without changing source bytes',()=>{
  const notebook=createNotebook({sources:[createSource('# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Maintenance guide')]}),original=structuredClone(notebook.sources);
  const units=buildDirectorSourceInventory(notebook).units,batch=emptyGameDesign(notebook,{id:'chatgpt',model:'test',endpointFingerprint:null}).batches[0],planning=gamePlanningPrompt(notebook,batch,units);
  expect(planning).toContain(SOURCE_ACTION_SELECTION_INSTRUCTION);expect(planning).toContain('complete condition → action → observable outcome');expect(planning).toContain('Do not force variety');
  const plan=validateNewGameBatchPlan(directorFixtureResponse('plan',disclosed(planning)),batch,units,notebook),planned={...batch,...plan,status:'planned' as const};
  const writing=gameWritingPrompt(notebook,planned,units),input=disclosed(writing),draft=directorFixtureResponse('write',input).missions[0];
  expect(input.missions[0].learningContract).toEqual(gameLearningContract('sequence'));
  expect(writing).toContain(MISSION_CONTENT_INSTRUCTION);expect(writing).toContain('Keep UI instructions out of the teaching chunks');
  // The checker needs teaching audience/source windows; content validation is
  // exercised by the director integration suite, not bypassed in production.
  const checking=gameCheckingPrompt({...planned,drafts:[{...draft,teaching:{...draft.teaching,ageGroup:'adult',sourceWindows:[]}}]});
  expect(disclosed(checking).missions[0].learningContract).toEqual(gameLearningContract('sequence'));
  expect(checking).toContain(MISSION_CONTENT_CHECK_INSTRUCTION);expect(checking).toContain('ENTIRE activity model');
  expect(checking).toContain('valid paraphrases, diagrams and source observations');expect(notebook.sources).toEqual(original);
 });
 it('distinguishes a source simulation from an attractive fictional wrapper',()=>{
  const contract=gameLearningContract('scenario');
  expect(contract.teach).toContain('action conditions');expect(contract.teach).toContain('source-defined consequences');expect(contract.task).toContain('inspects its prepared consequence');
  expect(gameLearningContract('classification').teach).toContain('remaining items');expect(gameLearningContract('construction').task).toContain('not unsupported live-system behavior');
 });
 it('discloses the catalog-versus-claim judgment distinction before choosing a classification recipe',()=>{
  // A live planner previously selected claim-verification for an ordinary tool
  // catalog. The writer then correctly refused its missing judgment contract.
  // This guards the planning instruction, not a heuristic verdict on source fit.
  const source=createSource('# Tool catalog\nBy Example Author\n\nCapture reads images or recordings. Preparation changes existing digital rows.\n\nPageLens belongs to Capture and reads printed words from scans. TableTidy belongs to Preparation and formats dates in existing rows; it does not read scans.','Tool catalog');
  const notebook=createNotebook({sources:[source]}),before=source.text;
  const units=buildDirectorSourceInventory(notebook).units,batch=emptyGameDesign(notebook,{id:'chatgpt',model:'test',endpointFingerprint:null}).batches[0];
  const prompt=gamePlanningPrompt(notebook,batch,units),input=disclosed(prompt);
  expect(prompt).toContain(CLASSIFICATION_SELECTION_INSTRUCTION);
  expect(prompt).toContain('prefer classification-workshop');
  expect(prompt).toContain('source supplies the claims, sufficient context and the established judgments');
  expect(prompt).toContain('Do not manufacture those judgments');
  expect(prompt).toContain('semantic fit decision, not keyword matching');
  expect(input.choices.find((choice:{scaffoldId:string})=>choice.scaffoldId==='claim-verification').requires).toContain('Reviewed judgments');
  expect(input.choices.find((choice:{scaffoldId:string})=>choice.scaffoldId==='classification-workshop').kind).toBe('classification');
  expect(input.units[0].excerpt).toContain('PageLens belongs to Capture');
  expect(notebook.sources[0].text).toBe(before);
 });
});

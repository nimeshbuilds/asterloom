import {afterEach,describe,expect,it,vi} from 'vitest';
import {preparedAsterAnswer} from '../src/lib/asterPreparedAnswer';
import {answerAsterContext,type AsterAwarenessContext} from '../src/lib/asterAwareness';
import {createNotebook,createSource} from '../src/lib/utils';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {isCurrentEvidence} from '../src/lib/evidence';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';

async function prepared(){
 const fetch=vi.fn(async(_url,init)=>{const prompt=JSON.parse(init.body).prompt,stage=prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]);return{ok:true,json:async()=>({text:JSON.stringify(directorFixtureResponse(stage,data)),usage:directorFixtureUsage})};});vi.stubGlobal('fetch',fetch);
 const input=createNotebook({sources:[createSource('# Control procedure\n1. Open the control panel.\n2. Select the command.\n3. Confirm the operation.','Control procedure')]});
 const result=await prepareGameExperience(input,{}, {aiPolicy:'required',ai:{config:{provider:'compatible',model:'fixture-model',apiKey:'synthetic-key',baseUrl:'http://127.0.0.1:11434/v1'},consent:'create-game'}});
 expect(result.creationStatus,result.ai.message).toBe('ready');fetch.mockClear();
 const notebook=result.notebook,lesson=notebook.aiLearningPlan!.missions[0],context:AsterAwarenessContext={notebook,mode:'study',activityId:lesson.activityId,learningState:{title:lesson.title,phase:'lesson',goal:lesson.objective}};
 return{notebook,lesson,context,fetch};
}
afterEach(()=>vi.unstubAllGlobals());
describe('offline reuse of prepared source-grounded explanations',()=>{
 it('uses the complete current lesson and exact citations without generating text, spending or mutating saved data',async()=>{
  const {notebook,lesson,context,fetch}=await prepared(),before=JSON.stringify(notebook),answer=preparedAsterAnswer('Help me understand this',context)!;
  expect(answer.kind).toBe('lesson');expect(answer.title).toBe('Prepared lesson explanation');expect(answer.text).toContain(lesson.conceptExplanation.text);for(const chunk of lesson.chunks)expect(answer.text).toContain(chunk.text);
  expect(answer.citations.length).toBeGreaterThan(0);expect(answer.citations.every(ref=>isCurrentEvidence(ref,notebook.sources))).toBe(true);expect(answer.citations.every(ref=>ref.quote===notebook.sources.find(source=>source.id===ref.sourceId)!.text.slice(ref.start,ref.end))).toBe(true);
  expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(notebook)).toBe(before);
 });
 it('does not hijack explicit subject questions, guess examples, or expose another activity or screen',async()=>{
  const {context,lesson,fetch}=await prepared();
  for(const question of ['Explain command selection in Linux','What should I do now?','Why does this procedure validate a command?','How many commands exist?','what does this game teach about astronomy?'])expect(preparedAsterAnswer(question,context),question).toBeUndefined();
  expect(preparedAsterAnswer('explain this',{...context,activityId:'another-mission'})).toBeUndefined();expect(preparedAsterAnswer('explain this',{...context,mode:'creation'})).toBeUndefined();expect(preparedAsterAnswer('explain this',{...context,mode:'library'})).toBeUndefined();
  delete lesson.workedExample;expect(preparedAsterAnswer('give me an example of this',context)).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
 });
 it('invalidates prepared lesson explanations when either source or mission content changes',async()=>{
  const {notebook,context,fetch}=await prepared(),changed=structuredClone(notebook);changed.sources[0].text+='\nNew conditions apply.';
  expect(preparedAsterAnswer('explain this',{...context,notebook:changed})).toBeUndefined();expect(preparedAsterAnswer('what does this game teach',{...context,notebook:changed})).toBeUndefined();
  const changedActivity=structuredClone(notebook);changedActivity.activities![0].instruction='A different task.';expect(preparedAsterAnswer('explain this',{...context,notebook:changedActivity})).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
 });
 it('answers a broad game request with a validated saved introduction and distinct honest legacy preview',async()=>{
  const {notebook,context,fetch}=await prepared(),before=JSON.stringify(notebook),answer=preparedAsterAnswer('what will I learn from this game',context)!;
  expect(answerAsterContext('tell me about this game',context)).toBeUndefined();expect(answer).toMatchObject({kind:'overview',origin:'generated',title:'Prepared game introduction'});expect(answer.text).toContain(notebook.gameDesign!.overview!.nodes.at(-1)!.content!.introduction.text);expect(answer.citations.every(ref=>isCurrentEvidence(ref,notebook.sources))).toBe(true);
  const legacy=structuredClone(notebook);delete legacy.gameDesign!.overview;const preview=preparedAsterAnswer('tell me about this game',{...context,notebook:legacy})!;expect(preview).toMatchObject({kind:'overview',origin:'saved-lessons',title:'Preview from saved lessons'});expect(preview.text).toContain('does not cover every source detail');expect(preview.text).toContain(legacy.aiLearningPlan!.missions[0].conceptExplanation.text);
  expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(notebook)).toBe(before);
 });
 it('does not use forged overview claims even when they carry a source ID',async()=>{
  const {notebook,context,fetch}=await prepared(),changed=structuredClone(notebook),content=changed.gameDesign!.overview!.nodes.at(-1)!.content!;content.introduction.text='FORGED OVERVIEW';content.introduction.citations[0].quote='Invented quoted evidence';
  const answer=preparedAsterAnswer('describe this game',{...context,notebook:changed});expect(answer?.origin).toBe('saved-lessons');expect(answer?.text).not.toContain('FORGED OVERVIEW');expect(answer?.citations.every(ref=>isCurrentEvidence(ref,changed.sources))).toBe(true);expect(fetch).not.toHaveBeenCalled();
 });
});

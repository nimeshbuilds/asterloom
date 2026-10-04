import {describe,it,expect} from 'vitest';
import {DATA_EXAMPLES} from '../src/lib/extendedExamples';
import {initialDataResponse,evaluateData} from '../src/lib/dataEngine';
import {dataCellText,investigateData,investigationScale} from '../src/lib/dataInvestigation';
const activity=DATA_EXAMPLES[0];
describe('Evidence investigation decisions',()=>{
 it('keeps independent evidence cases while the learner changes question, view, and inspected record',()=>{
  const a=structuredClone(activity);a.questions[1].requireEvidenceRows=true;
  let state=initialDataResponse(a);
  state=investigateData(a,state,{type:'inspect',rowId:'a'});
  state=investigateData(a,state,{type:'evidence',questionId:a.questions[0].id,rowId:'a'});
  state=investigateData(a,state,{type:'question',questionId:a.questions[1].id});
  state=investigateData(a,state,{type:'evidence',questionId:a.questions[1].id,rowId:'d'});
  state={...state,view:{...state.view,columnId:'zone',value:'south'}};
  const restored=initialDataResponse(a,JSON.parse(JSON.stringify(state)));
  expect(restored.evidenceRows).toEqual({'north-mean':['a'],'north-count':['d']});
  expect(restored.view).toMatchObject({inspectedRowId:'a',activeQuestionId:'north-count',value:'south'});
  expect(restored.answers).toEqual({'north-mean':'','north-count':''});
 });
 it('compares at most two original records without silently removing pinned evidence',()=>{
  let state=initialDataResponse(activity);state.evidenceRows['north-mean']=['a'];
  for(const rowId of ['a','b','d'])state=investigateData(activity,state,{type:'compare',rowId});
  expect(state.view.compareRowIds).toEqual(['b','d']);expect(state.evidenceRows['north-mean']).toEqual(['a']);
  expect(initialDataResponse(activity,JSON.parse(JSON.stringify(state))).view.compareRowIds).toEqual(['b','d']);
  state=investigateData(activity,state,{type:'compare',rowId:'d'});expect(state.view.compareRowIds).toEqual(['b']);
 });
 it('refuses forged record/question IDs and evidence actions for questions with no evidence requirement',()=>{
  const state=initialDataResponse(activity);
  expect(investigateData(activity,state,{type:'inspect',rowId:'forged'})).toBe(state);
  expect(investigateData(activity,state,{type:'question',questionId:'forged'})).toBe(state);
  expect(investigateData(activity,state,{type:'evidence',questionId:'north-mean',rowId:'forged'})).toBe(state);
  expect(investigateData(activity,state,{type:'evidence',questionId:'north-count',rowId:'a'})).toBe(state);
 });
 it('never computes a graded result or reads answer constraints while exploring',()=>{
  const a=structuredClone(activity),state=initialDataResponse(a);
  const before=investigateData(a,state,{type:'inspect',rowId:'a'});
  a.questions[0].operation='max';a.questions[0].reason='SECRET';a.questions[0].filters=[];
  expect(investigateData(a,state,{type:'inspect',rowId:'a'})).toEqual(before);
  expect(JSON.stringify(before)).not.toContain('SECRET');expect(before.answers['north-mean']).toBe('');
 });
 it('makes a missing observation different from zero and keeps chart scale tied to all source records',()=>{
  expect(dataCellText(null,'°C')).toBe('Not recorded');expect(dataCellText(0,'°C')).toBe('0 °C');
  expect(investigationScale(activity,'temperature')).toBe(26);
  const state=initialDataResponse(activity);state.view.columnId='zone';state.view.value='north';
  expect(investigationScale(activity,state.view.chartColumnId)).toBe(26);
  const a=structuredClone(activity);a.rows[0].values.temperature=-40;expect(investigationScale(a,'temperature')).toBe(40);
 });
 it('migrates old saves, bounds malicious view state and preserves source assistance through reload',()=>{
  const state=initialDataResponse(activity,{sourceConsulted:true,answers:{'north-mean':'20','north-count':'3'},evidenceRows:{'north-mean':['a','b']},view:{activeQuestionId:'forged',inspectedRowId:'forged',compareRowIds:['a','a','forged','d','b']}});
  expect(state.view.activeQuestionId).toBe('north-mean');expect(state.view.inspectedRowId).toBe('');expect(state.view.compareRowIds).toEqual(['a','d']);
  const restored=initialDataResponse(activity,JSON.parse(JSON.stringify(state)));
  expect(evaluateData(activity,restored)).toMatchObject({correct:true,hintUsed:true});
  expect(evaluateData(activity,{...restored,sourceConsulted:false})).toMatchObject({correct:true,hintUsed:false});
 });
});

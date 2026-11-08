import {describe,it,expect} from 'vitest';
import {asterLocalAnswerSchema} from '../src/lib/asterAI';
import {assertStructuredOutput,boundedOutputSchema} from '../server/output-schema.mjs';
describe('local Aster constrained answers',()=>{
 it('supports a grounded explanation and live-state reply within the runtime schema bound',()=>{
  const schema=asterLocalAnswerSchema(2,true);expect(boundedOutputSchema(schema)).toEqual(schema);
  expect(()=>assertStructuredOutput({insufficientEvidence:false,paragraphs:[{kind:'source',text:'The supplied note describes the packet.',passageIds:['passage-2'],contextIds:[]},{kind:'current-state',text:'Your current mission is open.',passageIds:[],contextIds:['current-state']}],actions:[{type:'open-source',passageId:'passage-2'},{type:'open-current-help'}]},schema)).not.toThrow();
 });
 it('rejects invented passage IDs, extra tools and citations disguised as conversation',()=>{
  const schema=asterLocalAnswerSchema(1,false);
  for(const paragraph of [{kind:'source',text:'Claim',passageIds:['passage-2'],contextIds:[]},{kind:'source',text:'Claim',passageIds:[],contextIds:[]},{kind:'conversation',text:'Hello',passageIds:['passage-1'],contextIds:[]}]) expect(()=>assertStructuredOutput({insufficientEvidence:false,paragraphs:[paragraph],actions:[]},schema)).toThrow();
  expect(()=>assertStructuredOutput({insufficientEvidence:false,paragraphs:[],actions:[{type:'open-current-help'}]},schema)).toThrow();
  expect(()=>assertStructuredOutput({insufficientEvidence:false,paragraphs:[],actions:[{type:'run-command',command:'anything'}]},schema)).toThrow();
 });
 it('lets Aster converse without sources and honestly abstain without inventing an empty-ID citation',()=>{
  const schema=asterLocalAnswerSchema(0,false);expect(boundedOutputSchema(schema)).toEqual(schema);
  for(const answer of [{insufficientEvidence:false,paragraphs:[{kind:'conversation',text:'Hello, I’m Aster.',passageIds:[],contextIds:[]}],actions:[]},{insufficientEvidence:true,paragraphs:[],actions:[]}]) expect(()=>assertStructuredOutput(answer,schema)).not.toThrow();
  expect(()=>assertStructuredOutput({insufficientEvidence:false,paragraphs:[{kind:'source',text:'Invented claim',passageIds:['passage-1'],contextIds:[]}],actions:[]},schema)).toThrow();
 });
});

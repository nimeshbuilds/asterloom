import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import ScenarioBoard from '../src/components/ScenarioBoard';
import {advanceScenario,evaluateScenario,initialScenarioResponse,recordScenarioCommitment,replayScenario,SCENARIO_EXAMPLES} from '../src/lib/scenarioEngine';
import type {ScenarioActivity,ScenarioResponse} from '../src/lib/scenarioEngine';
import {scenarioCommitmentDetails,type ScenarioCommitmentInput} from '../src/lib/scenarioCommitments';
import {SCENARIO_DIALOGUE_EXAMPLE,SCENARIO_PERSPECTIVE_EXAMPLE,SCENARIO_PROMPT_EXAMPLE} from '../src/lib/scenarioInteractionExamples';
import {SCENARIO_CAMPAIGN_EXAMPLE,SCENARIO_PREDICTION_EXAMPLE} from '../src/lib/scenarioModeExamples';

const evidenceInstruction='The outcome is reached. Open your evidence, select observations that support the objective, then check your work.';
function responseOf(result:ReturnType<typeof advanceScenario>):ScenarioResponse {
  if(!result.success)throw new Error(result.error);
  return result.response;
}
function play(activity:ScenarioActivity,response:ScenarioResponse,actions:string[]) {
  for(const action of actions)response=responseOf(advanceScenario(activity,response,action,{practice:true}));
  return response;
}
const commit=(activity:ScenarioActivity,response:ScenarioResponse,entry:ScenarioCommitmentInput)=>responseOf(recordScenarioCommitment(activity,response,entry,{practice:true}));
function guidance(activity:ScenarioActivity,response:ScenarioResponse) {
  expect(replayScenario(activity,response,{practice:true}).phase).toBe('success');
  const html=renderToStaticMarkup(createElement(ScenarioBoard,{activity,response,onChange:()=>{}}));
  const next=html.match(/<p class="scenario-next-instruction">(.*?)<\/p>/s)?.[1];
  expect(next).toBeDefined();
  return next!;
}
function expectPending(activity:ScenarioActivity,response:ScenarioResponse,action:string) {
  expect(scenarioCommitmentDetails(activity,replayScenario(activity,response,{practice:true})).some(detail=>!detail.correct)).toBe(true);
  const next=guidance(activity,response);expect(next).toContain(action);expect(next).toContain('before selecting your final evidence');expect(next).not.toContain('then check your work');
}
function expectReadyForEvidence(activity:ScenarioActivity,response:ScenarioResponse) {
  expect(scenarioCommitmentDetails(activity,replayScenario(activity,response,{practice:true})).every(detail=>detail.correct)).toBe(true);
  expect(guidance(activity,response)).toBe(evidenceInstruction);
  const supported={...response,selectedEvidenceIds:[...new Set(activity.objectives.flatMap(objective=>objective.requiredObservations))]};
  expect(evaluateScenario(activity,supported,{practice:true}).correct).toBe(true);
}

describe.each(['reviewed','needs-review'] as const)('%s scenario success guidance',reviewStatus=>{
  it('keeps dialogue debriefs required after the conversation outcome, including an unsupported review',()=>{
    const activity={...SCENARIO_DIALOGUE_EXAMPLE,reviewStatus};
    let response=play(activity,initialScenarioResponse(activity),['tea-simple','takeaway']);
    expectPending(activity,response,'record the conversation debrief above');
    expect(guidance(activity,response)).not.toContain('required perspectives');
    response=commit(activity,response,{type:'dialogue-review',choiceId:'polite-is-enough'});
    expectPending(activity,response,'record the conversation debrief above');
    response=commit(activity,response,{type:'dialogue-review',choiceId:'contextual-equivalence'});
    expectReadyForEvidence(activity,response);
  });

  it('directs perspective inspection before the conversation debrief',()=>{
    const activity={...SCENARIO_PERSPECTIVE_EXAMPLE,reviewStatus};
    let response=play(activity,initialScenarioResponse(activity),['saturday','consult']);
    expectPending(activity,response,'Inspect the required perspectives');
    response=commit(activity,response,{type:'perspective-switch',roleId:'gardener'});
    expectPending(activity,response,'Review what the conversation supports');
    response=commit(activity,response,{type:'dialogue-review',choiceId:'combined-constraints'});
    expectReadyForEvidence(activity,response);
  });

  it('requires the hypothesis and supported outcome review after restoring the case',()=>{
    const activity={...SCENARIO_PREDICTION_EXAMPLE,reviewStatus};
    let response=commit(activity,initialScenarioResponse(activity),{type:'prediction',choiceId:'link-fault'});
    response=play(activity,response,['test-address','inspect-resolver','replace-resolver','verify-lookup']);
    expectPending(activity,response,'Compare your current hypothesis');
    response=commit(activity,response,{type:'hypothesis-revision',choiceId:'resolver-fault'});
    response=commit(activity,response,{type:'outcome-review',choiceId:'everything-proven'});
    expectPending(activity,response,'record your outcome review above');
    response=commit(activity,response,{type:'outcome-review',choiceId:'contrasting-evidence'});
    expectReadyForEvidence(activity,response);
  });

  it('requires rubric comparisons and the bounded prompt review after both outputs are inspected',()=>{
    const activity={...SCENARIO_PROMPT_EXAMPLE,reviewStatus};
    let response=commit(activity,initialScenarioResponse(activity),{type:'prompt-variant',caseId:'variant'});
    response=commit(activity,response,{type:'prompt-prediction',choiceId:'same-format'});
    response=play(activity,response,['inspect-baseline','inspect-variant']);
    expectPending(activity,response,'Compare every rubric criterion');
    expect(guidance(activity,response).match(/Compare every rubric criterion/g)).toHaveLength(1);
    response=commit(activity,response,{type:'prompt-comparison',criterionId:'two-bullets',caseId:'variant'});
    response=commit(activity,response,{type:'prompt-comparison',criterionId:'facts',caseId:'baseline'});
    response=commit(activity,response,{type:'prompt-review',choiceId:'universal-effect'});
    expectPending(activity,response,'record the comparison review above');
    response=commit(activity,response,{type:'prompt-review',choiceId:'bounded-pair'});
    expectReadyForEvidence(activity,response);
    // Revising one criterion invalidates the previous review even though the
    // underlying simulation remains successful.
    response=commit(activity,response,{type:'prompt-comparison',criterionId:'two-bullets',caseId:'baseline'});
    expectPending(activity,response,'Compare every rubric criterion');
  });

  it('keeps the final transfer debrief ahead of the evidence conclusion',()=>{
    const activity={...SCENARIO_CAMPAIGN_EXAMPLE,reviewStatus};
    let response=commit(activity,initialScenarioResponse(activity),{type:'plan',stageId:'establish-control',actionIds:['inspect-notebook','balance-water']});
    response=play(activity,response,['inspect-notebook','balance-water']);
    response=commit(activity,response,{type:'debrief',stageId:'establish-control',choiceId:'alternative-explanation'});
    const actions=['prepare-transfer-case','balance-water','repeat-study','repeat-study','assess-study'];
    response=commit(activity,response,{type:'plan',stageId:'transfer-control',actionIds:actions});
    response=play(activity,response,actions);
    expectPending(activity,response,'Complete the transfer debrief above');
    response=commit(activity,response,{type:'debrief',stageId:'transfer-control',choiceId:'universal-proof'});
    expectPending(activity,response,'Complete the transfer debrief above');
    response=commit(activity,response,{type:'debrief',stageId:'transfer-control',choiceId:'bounded-transfer'});
    expectReadyForEvidence(activity,response);
  });

  it('keeps the direct evidence instruction for a basic investigation',()=>{
    const activity={...SCENARIO_EXAMPLES[0],reviewStatus};
    const response=play(activity,initialScenarioResponse(activity),['test-address','inspect-resolver','replace-resolver','verify-lookup']);
    expectReadyForEvidence(activity,response);
  });
});

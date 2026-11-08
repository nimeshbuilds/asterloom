import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ScenarioInteractions from '../src/components/ScenarioInteractions';
import ScenarioCommitments from '../src/components/ScenarioCommitments';
import { advanceScenario, initialScenarioResponse, recordScenarioCommitment, replayScenario } from '../src/lib/scenarioEngine';
import type { ScenarioActivity, ScenarioResponse } from '../src/lib/scenarioEngine';
import { SCENARIO_DIALOGUE_EXAMPLE, SCENARIO_PROMPT_EXAMPLE } from '../src/lib/scenarioInteractionExamples';
import { SCENARIO_CAMPAIGN_EXAMPLE } from '../src/lib/scenarioModeExamples';

function props(activity: ScenarioActivity, response = initialScenarioResponse(activity, undefined, { practice: true })) {
  return { activity, response, snapshot: replayScenario(activity, response, { practice: true }), onChange: () => {} };
}

function resultResponse(result: ReturnType<typeof advanceScenario>): ScenarioResponse {
  if (!result.success) throw new Error(result.error);
  return result.response;
}

describe('scenario material review status', () => {
  it.each(['needs-review', 'reviewed'] as const)('describes %s dialogue and rubric without an incorrect review claim', reviewStatus => {
    const dialogue = { ...SCENARIO_DIALOGUE_EXAMPLE, reviewStatus };
    const prompt = { ...SCENARIO_PROMPT_EXAMPLE, reviewStatus };
    const word = reviewStatus === 'reviewed' ? 'reviewed' : 'prepared';
    const dialogueHtml = renderToStaticMarkup(createElement(ScenarioInteractions, props(dialogue)));
    expect(dialogueHtml).toContain(`Choose a ${word} expression that meets the stated goal.`);
    const promptHtml = renderToStaticMarkup(createElement(ScenarioInteractions, props(prompt)));
    expect(promptHtml).toContain(`<dt>${word[0].toUpperCase() + word.slice(1)} rubric</dt>`);
  });

  it.each(['needs-review', 'reviewed'] as const)('keeps the %s campaign retry wording consistent with its material status', reviewStatus => {
    const activity = { ...SCENARIO_CAMPAIGN_EXAMPLE, reviewStatus };
    let response = initialScenarioResponse(activity, undefined, { practice: true });
    response = resultResponse(recordScenarioCommitment(activity, response, {
      type: 'plan', stageId: 'establish-control', actionIds: ['inspect-notebook', 'balance-water'],
    }, { practice: true }));
    for (const action of ['inspect-notebook', 'balance-water']) {
      response = resultResponse(advanceScenario(activity, response, action, { practice: true }));
    }
    response = resultResponse(recordScenarioCommitment(activity, response, {
      type: 'debrief', stageId: 'establish-control', choiceId: 'causal-proof',
    }, { practice: true }));
    const state = props(activity, response);
    expect(state.snapshot.campaign?.debriefs.at(-1)?.accepted).toBe(false);
    const html = renderToStaticMarkup(createElement(ScenarioCommitments, state));
    expect(html).toContain(`That interpretation is not supported by the ${reviewStatus === 'reviewed' ? 'reviewed' : 'prepared'} debrief.`);
  });
});

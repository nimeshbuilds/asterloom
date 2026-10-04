import { PICTURE_BUILD_EXAMPLES, PICTURE_BUILD_EXAMPLE_SOURCE } from '../src/lib/pictureBuildExamples';
import { SCAFFOLD_RUNTIME } from '../src/lib/scaffoldRuntime';
import { childPlaySources, childPlayFixtures } from '../src/data/childPlayFixtures';
import { scaffoldById } from '../src/data/scaffolds';
import { SCENARIO_INTERACTION_EXAMPLES, SCENARIO_INTERACTION_SOURCES } from '../src/lib/scenarioInteractionExamples';
import { describe, expect, it } from 'vitest';
import { resolveScaffoldRuntime } from '../src/lib/scaffoldRuntime';
import { validateActivity } from '../src/lib/structuredEngine';
import { SCENARIO_EXAMPLES } from '../src/lib/scenarioEngine';
import { SCENARIO_PREDICTION_EXAMPLE, SCENARIO_CAMPAIGN_EXAMPLE, SCENARIO_MODE_EXAMPLES, SCENARIO_MODE_SOURCES } from '../src/lib/scenarioModeExamples';
import { PLANT_EXPLANATION } from '../src/lib/compositionExamples';
import { COMPOSITION_MODE_EXAMPLES, COMPOSITION_MODE_EXAMPLE_SOURCE, PARTNER_PLANTS, SQL_CODE_REVIEW } from '../src/lib/compositionModeExamples';
import { pictureDiscoveryFixture, pictureWordFixture, pictureSources } from '../src/data/pictureFixtures';
import { ruleSwitchFixture, ruleSwitchSources } from '../src/data/ruleSwitchFixtures';
import type { StructuredActivity } from '../src/lib/structuredEngine';
function eligibility(id: string, activity: StructuredActivity, ageGroup = 'adult') {
  return resolveScaffoldRuntime(id, { ageGroup, cards: [], activities: [{ ...activity, scaffoldIds: [id] }] });
}
describe('specialized source-backed runtime contracts', () => {
  it.each([...PICTURE_BUILD_EXAMPLES, ...childPlayFixtures, ...SCENARIO_MODE_EXAMPLES, ...SCENARIO_INTERACTION_EXAMPLES, ...COMPOSITION_MODE_EXAMPLES, pictureDiscoveryFixture, pictureWordFixture, ruleSwitchFixture].map(a => [a.id, a] as const))('checks the exact supplied evidence for %s', (_, activity) => {
    const sources = [PICTURE_BUILD_EXAMPLE_SOURCE,...childPlaySources,...SCENARIO_MODE_SOURCES, ...SCENARIO_INTERACTION_SOURCES, COMPOSITION_MODE_EXAMPLE_SOURCE, ...pictureSources, ...ruleSwitchSources];
    expect(validateActivity(activity, sources)).toMatchObject({ success: true });
    expect(validateActivity(activity, sources.map(source => ({ ...source, text: '' }))).success).toBe(false);
  });
  it('requires prediction and campaign contracts in addition to a generic scenario', () => {
    expect(eligibility('prediction-and-experiment', SCENARIO_EXAMPLES[0]).available).toBe(false);
    expect(eligibility('prediction-and-experiment', SCENARIO_PREDICTION_EXAMPLE).available).toBe(true);
    expect(eligibility('capstone-campaign', SCENARIO_EXAMPLES[1], '15-17').available).toBe(false);
    expect(eligibility('capstone-campaign', SCENARIO_CAMPAIGN_EXAMPLE, '15-17').available).toBe(true);
    expect(eligibility('capstone-campaign', { ...SCENARIO_CAMPAIGN_EXAMPLE, reviewStatus: 'needs-review' }, '15-17').available).toBe(false);
  });
  it('requires actual partner and source-code interfaces rather than an explanation label', () => {
    expect(eligibility('partner-helper', PLANT_EXPLANATION, '6-8').available).toBe(false);
    expect(eligibility('partner-helper', PARTNER_PLANTS, '6-8').available).toBe(true);
    expect(eligibility('secure-code-review', PLANT_EXPLANATION).available).toBe(false);
    expect(eligibility('secure-code-review', SQL_CODE_REVIEW).available).toBe(true);
    expect(eligibility('discovery-scenes', pictureWordFixture, '3-5').available).toBe(false);
    expect(eligibility('discovery-scenes', pictureDiscoveryFixture, '3-5').available).toBe(true);
  });
});

it('requires the actual dialogue, perspective and prompt interfaces', () => {
  for (const a of SCENARIO_INTERACTION_EXAMPLES) for (const id of a.scaffoldIds ?? []) {
    expect(eligibility(id, SCENARIO_EXAMPLES[0]).available).toBe(false);
    expect(eligibility(id, a, scaffoldById(id)!.ages[0]).available).toBe(true);
  }
});

it('keeps the two child story contracts distinct', () => {
  expect(eligibility('puppet-stories', childPlayFixtures[0], '3-5').available).toBe(true);
  expect(eligibility('puppet-stories', childPlayFixtures[1], '3-5').available).toBe(false);
  expect(eligibility('pretend-play-stations', childPlayFixtures[1], '3-5').available).toBe(true);
  expect(eligibility('pretend-play-stations', childPlayFixtures[0], '3-5').available).toBe(false);
});

it('only accepts a complete picture-and-telling contract for build-and-tell', () => {
  expect(eligibility('build-and-tell', pictureDiscoveryFixture, '3-5').available).toBe(false);
  for (const activity of PICTURE_BUILD_EXAMPLES) expect(eligibility('build-and-tell', activity, '3-5').available).toBe(true);
});
it('defines a prepared runtime contract for all 75 recipes', () => {
  expect(SCAFFOLD_RUNTIME).toHaveLength(75);
  expect(SCAFFOLD_RUNTIME.filter(recipe => !recipe.engineReady)).toEqual([]);
});

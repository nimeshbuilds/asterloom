import type { StructuredActivity, ActivityResponse } from './structuredEngine';
import { initialRecallResponse } from './recallEngine';
import { initialCompletionResponse } from './completionEngine';
import { initialDataResponse } from './dataEngine';
import { initialMediaResponse } from './mediaEngine';
import { initialScenarioResponse } from './scenarioEngine';
import { initialCompositionResponse } from './compositionEngine';
import { initialPictureBuildResponse } from './pictureBuildEngine';
import { initialChildPlayResponse } from './childPlayEngine';
import { initialPictureResponse } from './pictureEngine';
import { initialRuleSwitchResponse } from './ruleSwitchEngine';
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function initialActivityResponse(activity: StructuredActivity, saved?: unknown, options: {practice?: boolean} = {}): ActivityResponse {
  const value = object(saved);
  switch (activity.kind) {
    case 'recall': return initialRecallResponse(activity, saved);
    case 'completion': return initialCompletionResponse(activity, saved);
    case 'data': return initialDataResponse(activity, saved);
    case 'media': return initialMediaResponse(activity, saved);
    case 'scenario': return initialScenarioResponse(activity, saved, options);
    case 'construction': case 'explanation': return initialCompositionResponse(activity, saved);
    case 'picture-build': return initialPictureBuildResponse(activity, saved);
    case 'child-play': return initialChildPlayResponse(activity, saved);
    case 'picture': return initialPictureResponse(activity, saved);
    case 'rule-switch': return initialRuleSwitchResponse(activity, saved);
    case 'sequence': {
      const ids = activity.items.map(item => item.id), order = value.order;
      return { order: Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length && order.every(id => typeof id === 'string' && ids.includes(id)) ? order : [...ids].reverse() };
    }
    case 'classification': return { assignments: Object.fromEntries(activity.items.map(item => { const prior = object(value.assignments)[item.id]; return [item.id, Array.isArray(prior) ? [...new Set(prior.filter(id => typeof id === 'string' && activity.categories.some(category => category.id === id)))] : []]; })) };
    case 'decision': return { choiceId: typeof value.choiceId === 'string' && activity.choices.some(choice => choice.id === value.choiceId) ? value.choiceId : '' };
    case 'dependency': return { edges: Array.isArray(value.edges) ? value.edges.filter((edge): edge is { from: string; to: string; relation: string } => { const data = object(edge); return typeof data.relation === 'string' && activity.nodes.some(node => node.id === data.from) && activity.nodes.some(node => node.id === data.to); }).slice(0, 120) : [] };
    case 'budget': return { quantities: Object.fromEntries(activity.items.map(item => { const prior = object(value.quantities)[item.id]; return [item.id, typeof prior === 'number' && Number.isInteger(prior) && prior >= 0 && prior <= item.maxQuantity ? prior : 0]; })) };
    case 'rubric': return { ratings: Object.fromEntries(activity.criteria.map(criterion => { const prior = object(value.ratings)[criterion.id]; return [criterion.id, typeof prior === 'number' && Number.isInteger(prior) && prior >= 0 && prior < criterion.levels.length ? prior : -1]; })) };
    case 'diagram': return { placements: Object.fromEntries(activity.labels.map(label => { const prior = object(value.placements)[label.id]; return [label.id, typeof prior === 'string' && activity.targets.some(target => target.id === prior) ? prior : '']; })) };
  }
}


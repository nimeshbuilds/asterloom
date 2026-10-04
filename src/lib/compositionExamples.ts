import type { Source } from '../types';
import type { CompositionActivity, ConstructionActivity, ConstructionBuild, ExplanationActivity, ExplanationResponse } from './compositionEngine';

const passages = [
  'Workshop specification: one intake supplies raw records. One archive accepts clean records. A scrubber transforms raw records into clean records and costs 2 credits. A validator also transforms raw into clean records and costs 3 credits. Intake and archive each cost 1 credit. Either transformation is acceptable. All ports allow one connection. Use exactly one intake, one transformation station, and one archive. The budget is 5 credits. Records must travel from intake through the transformation station to the archive. The model must be connected and have no directed cycles.',
  'Garden routing specification: place one reservoir and two beds. Reservoir has one water output supporting two connections. Each bed has one water input supporting one connection. A small pump has one water input and one water output, each supporting one connection, and costs 1 energy unit. A branching pump has one water input supporting one connection and one water output supporting two connections, and costs 2 energy units. At most two small pumps or one branching pump are available. Use at least one pump. Each bed must be reachable from the reservoir through a pump. Reservoir and beds cost no energy. The energy budget is 2 units. Every component belongs to one connected model with no directed cycles. This is a routing puzzle: connection limits do not simulate water volume or pressure.',
  'Prepared investigation: twelve plants were randomly assigned to a regular-water group or a low-water group, with six plants per group. Both groups received the same light and soil. After fourteen days, the regular-water group had a mean height of 15 cm; the low-water group had a mean height of 9 cm. In this investigation, the regular-water treatment produced a larger mean plant height. Both groups received the same light and soil, so those two factors were held constant. The small sample and single species limit how broadly the result can be generalized. These observations do not establish that every individual plant grew more or that the same result holds for every species.',
  'Prepared code review: user-supplied name text is inserted directly into a SQL command string in version A. Version B passes the name as a parameter to a prepared statement. Parameterization separates the data value from the command structure. The review criterion is to prevent the name value from changing the command structure. Version B meets this criterion; version A does not. HTML escaping serves a different output context and does not establish safe SQL parameterization. This prepared comparison does not certify every security property of either program.',
];
export const COMPOSITION_EXAMPLE_SOURCE: Source = {
  id: 'composition-workshop-source', title: 'Construction and explanation workshop specifications', kind: 'text',
  text: passages.join('\n\n'), status: 'ready', addedAt: '2026-10-04T00:00:00.000Z',
};
const base = (id: string, title: string, instruction: string, passage: number, explanation: string, hint: string) => ({
  version: 1 as const, id, title, instruction, reviewStatus: 'reviewed' as const,
  sourceRefs: [{sourceId: COMPOSITION_EXAMPLE_SOURCE.id, evidence: passages[passage]}], explanation, hint,
});
const ref = {evidenceRefs: [0]};
const port = (id: string, direction: 'in'|'out', type: string, maxConnections = 1) => ({id, label: `${type} ${direction === 'in' ? 'input' : 'output'}`, direction, type, maxConnections});
const edge = (from: string, to: string) => ({from, fromPort: 'out', to, toPort: 'in'});
const instance = (id: string, componentId: string, x: number, y: number) => ({id, componentId, x, y});
const cleanBuild = (processor: string): ConstructionBuild => ({instances: [instance('start', 'intake', 15, 50), instance('process', processor, 50, 50), instance('finish', 'archive', 85, 50)], edges: [edge('start', 'process'), edge('process', 'finish')]});
export const CLEAN_DATA_CONSTRUCTION: ConstructionActivity = {
  ...base('example-build-data', 'Build a clean-data route', 'Build a working route from raw records to a clean archive. Choose a transformation station, connect compatible ports, and stay within five credits.', 0,
    'Your model carries raw records through an allowed transformation and delivers clean records to the archive within the workshop budget.', 'Read the type beside each port. An output connects to an input with the same type.'),
  scaffoldIds: ['build-to-specification', 'data-pipeline-repair'],
  kind: 'construction', allowCycles: false, requireAllConnected: true,
  components: [
    {id: 'intake', label: 'Record intake', description: 'Supplies raw records.', maxInstances: 1, ports: [port('out', 'out', 'raw')], costs: {credits: 1}, ...ref},
    {id: 'scrubber', label: 'Scrubber', description: 'Transforms raw records into clean records for 2 credits.', maxInstances: 1, ports: [port('in', 'in', 'raw'), port('out', 'out', 'clean')], costs: {credits: 2}, ...ref},
    {id: 'validator', label: 'Validator', description: 'An alternative raw-to-clean station for 3 credits.', maxInstances: 1, ports: [port('in', 'in', 'raw'), port('out', 'out', 'clean')], costs: {credits: 3}, ...ref},
    {id: 'archive', label: 'Clean archive', description: 'Accepts clean records.', maxInstances: 1, ports: [port('in', 'in', 'clean')], costs: {credits: 1}, ...ref},
  ],
  resources: [{id: 'credits', label: 'Workshop budget', unit: 'credits', limit: 5, ...ref}],
  requirements: [
    {id: 'intake-count', kind: 'instances', label: 'One record intake', componentIds: ['intake'], minimum: 1, maximum: 1, ...ref},
    {id: 'processor-count', kind: 'instances', label: 'One transformation station', componentIds: ['scrubber', 'validator'], minimum: 1, maximum: 1, ...ref},
    {id: 'archive-count', kind: 'instances', label: 'One clean archive', componentIds: ['archive'], minimum: 1, maximum: 1, ...ref},
    {id: 'clean-route', kind: 'path', label: 'Raw records reach the archive through a transformation', from: ['intake'], to: ['archive'], through: [['scrubber', 'validator']], avoid: [], scope: 'every-target', ...ref},
  ], referenceBuilds: [cleanBuild('scrubber'), cleanBuild('validator')],
};
export const GARDEN_CONSTRUCTION: ConstructionActivity = {
  ...base('example-build-garden', 'Route water to both gardens', 'Plan a connected routing network for two garden beds. Compare a shared branching pump with two smaller pumps. Both solutions must respect the source’s connection and energy limits.', 1,
    'Both beds have a directed route from the reservoir through a pump, every port stays within its connection limit, and the model uses no more than two energy units.', 'A branching pump can send its output to two beds. Each small pump can send its output to only one bed.'),
  scaffoldIds: ['build-to-specification'],
  kind: 'construction', allowCycles: false, requireAllConnected: true,
  components: [
    {id: 'reservoir', label: 'Reservoir', description: 'Supplies a water output with room for two connections.', maxInstances: 1, ports: [port('out', 'out', 'water', 2)], costs: {}, ...ref},
    {id: 'small-pump', label: 'Small pump', description: 'One input, one output connection. Uses 1 energy unit.', maxInstances: 2, ports: [port('in', 'in', 'water'), port('out', 'out', 'water')], costs: {energy: 1}, ...ref},
    {id: 'branching-pump', label: 'Branching pump', description: 'One input, two output connections. Uses 2 energy units.', maxInstances: 1, ports: [port('in', 'in', 'water'), port('out', 'out', 'water', 2)], costs: {energy: 2}, ...ref},
    {id: 'bed', label: 'Garden bed', description: 'Needs a route from the reservoir through a pump.', maxInstances: 2, ports: [port('in', 'in', 'water')], costs: {}, ...ref},
  ], resources: [{id: 'energy', label: 'Energy available', unit: 'units', limit: 2, ...ref}],
  requirements: [
    {id: 'reservoir-count', kind: 'instances', label: 'One reservoir', componentIds: ['reservoir'], minimum: 1, maximum: 1, ...ref},
    {id: 'bed-count', kind: 'instances', label: 'Two garden beds', componentIds: ['bed'], minimum: 2, maximum: 2, ...ref},
    {id: 'pump-count', kind: 'instances', label: 'At least one pump', componentIds: ['small-pump', 'branching-pump'], minimum: 1, maximum: 2, ...ref},
    {id: 'pump-route', kind: 'path', label: 'A pumped route to every bed', from: ['reservoir'], to: ['bed'], through: [['small-pump', 'branching-pump']], avoid: [], scope: 'every-target', ...ref},
  ], referenceBuilds: [
    {instances: [instance('tank', 'reservoir', 14, 50), instance('pump', 'branching-pump', 47, 50), instance('bed-a', 'bed', 84, 25), instance('bed-b', 'bed', 84, 75)], edges: [edge('tank', 'pump'), edge('pump', 'bed-a'), edge('pump', 'bed-b')]},
    {instances: [instance('tank', 'reservoir', 14, 50), instance('pump-a', 'small-pump', 47, 25), instance('pump-b', 'small-pump', 47, 75), instance('bed-a', 'bed', 84, 25), instance('bed-b', 'bed', 84, 75)], edges: [edge('tank', 'pump-a'), edge('tank', 'pump-b'), edge('pump-a', 'bed-a'), edge('pump-b', 'bed-b')]},
  ],
};
export const PLANT_EXPLANATION: ExplanationActivity = {
  ...base('example-explain-plants', 'Build an explanation that holds', 'Connect a defensible claim to the observations and a warrant that explains the connection. The prepared investigation supports two different focused explanations.', 2,
    'Your claim, selected observations, and warrant form one complete explanation supported by this investigation. The conclusion keeps the source’s limits.', 'The evidence is what was observed. The warrant explains why those observations support your specific claim.'),
  scaffoldIds: ['argument-construction'],
  kind: 'explanation', pieces: [
    {id: 'claim-height', role: 'claim', text: 'The regular-water treatment produced a larger mean height in this investigation.', ...ref},
    {id: 'claim-controls', role: 'claim', text: 'Light and soil were held constant between the two groups.', ...ref},
    {id: 'claim-universal', role: 'claim', text: 'Regular watering makes every individual plant of every species grow taller.', ...ref},
    {id: 'evidence-height', role: 'evidence', text: 'After fourteen days, the regular-water group had a mean height of 15 cm; the low-water group had a mean height of 9 cm.', ...ref},
    {id: 'evidence-controls', role: 'evidence', text: 'Both groups received the same light and soil.', ...ref},
    {id: 'evidence-sample', role: 'evidence', text: 'twelve plants were randomly assigned to a regular-water group or a low-water group, with six plants per group.', ...ref},
    {id: 'warrant-height', role: 'warrant', text: 'The observed mean of 15 cm exceeds 9 cm; this supports the comparison for the studied groups, without proving a universal result.', ...ref},
    {id: 'warrant-controls', role: 'warrant', text: 'Giving both groups the same light and soil makes those two conditions constant across the groups.', ...ref},
    {id: 'warrant-overreach', role: 'warrant', text: 'A difference in two group means guarantees the same difference for every plant and species.', ...ref},
  ], arguments: [{id: 'investigation', label: 'Explain the investigation', prompt: 'What supported conclusion can you draw, and why?', ...ref, alternatives: [
    {id: 'mean-comparison', claimId: 'claim-height', evidenceIds: ['evidence-height'], warrantId: 'warrant-height', explanation: 'The observed group means support the limited height comparison. A group mean does not describe every plant.', ...ref},
    {id: 'controlled-conditions', claimId: 'claim-controls', evidenceIds: ['evidence-controls'], warrantId: 'warrant-controls', explanation: 'The source explicitly states the same light and soil for both groups, supporting the claim about those controlled conditions.', ...ref},
  ]}],
};
export const SECURITY_EXPLANATION: ExplanationActivity = {
  ...base('example-explain-security', 'Defend the safer query design', 'Assemble a source-backed review: a claim, the relevant evidence, its warrant, an objection, and a response. Keep the conclusion within the stated review criterion.', 3,
    'Your review connects the prepared-statement design to the stated command-structure criterion and answers the output-context objection without claiming a complete security audit.', 'The warrant must connect parameterization to the exact review criterion. A response should address the objection’s context.'),
  scaffoldIds: ['argument-construction'],
  kind: 'explanation', pieces: [
    {id: 'claim-b', role: 'claim', text: 'Version B meets the stated criterion of preventing the name value from changing command structure.', ...ref},
    {id: 'claim-all', role: 'claim', text: 'Version B is secure against every possible attack.', ...ref},
    {id: 'evidence-b', role: 'evidence', text: 'Version B passes the name as a parameter to a prepared statement.', ...ref},
    {id: 'evidence-a', role: 'evidence', text: 'user-supplied name text is inserted directly into a SQL command string in version A.', ...ref},
    {id: 'evidence-separation', role: 'evidence', text: 'Parameterization separates the data value from the command structure.', ...ref},
    {id: 'warrant-b', role: 'warrant', text: 'Separating the name data from command structure directly addresses the review’s specified criterion.', ...ref},
    {id: 'warrant-comparison', role: 'warrant', text: 'The prepared statement keeps name data separate, whereas direct insertion in version A does not establish that separation.', ...ref},
    {id: 'objection-html', role: 'counterpoint', text: 'Could HTML escaping establish the same SQL protection?', ...ref},
    {id: 'response-context', role: 'rebuttal', text: 'The source identifies HTML escaping as a different output context; it does not establish SQL parameterization.', ...ref},
  ], arguments: [{id: 'review', label: 'Make and defend the review', prompt: 'Which version meets the given criterion? Support the conclusion and answer the HTML-escaping objection.', ...ref, alternatives: [
    {id: 'direct-design', claimId: 'claim-b', evidenceIds: ['evidence-b', 'evidence-separation'], warrantId: 'warrant-b', counterpointId: 'objection-html', rebuttalId: 'response-context', explanation: 'The cited design and parameterization mechanism support the stated criterion; the response correctly distinguishes the HTML output context.', ...ref},
    {id: 'compare-designs', claimId: 'claim-b', evidenceIds: ['evidence-a', 'evidence-b', 'evidence-separation'], warrantId: 'warrant-comparison', counterpointId: 'objection-html', rebuttalId: 'response-context', explanation: 'The comparison explains how the two designs handle name data differently, and the response addresses the proposed HTML-escaping alternative.', ...ref},
  ]}],
};
export const COMPOSITION_EXAMPLES: CompositionActivity[] = [CLEAN_DATA_CONSTRUCTION, GARDEN_CONSTRUCTION, PLANT_EXPLANATION, SECURITY_EXPLANATION];
export function explanationSolution(activity: ExplanationActivity, alternativeIndex = 0): ExplanationResponse {
  return {arguments: Object.fromEntries(activity.arguments.map(argument => {const alternative = argument.alternatives[alternativeIndex] ?? argument.alternatives[0]; return [argument.id, {claimId: alternative.claimId, evidenceIds: [...alternative.evidenceIds], warrantId: alternative.warrantId, counterpointId: alternative.counterpointId ?? '', rebuttalId: alternative.rebuttalId ?? ''}];})), draft: {selectedPieceId: '', activeArgumentId: activity.arguments[0].id, role: 'claim', message: ''}};
}
/** Invalid models are test/authoring fixtures only and must never be added to a notebook. */
export const INVALID_COMPOSITION_FIXTURES: {name: string; activity: unknown}[] = [
  {name: 'unsatisfiable budget witness', activity: {...CLEAN_DATA_CONSTRUCTION, resources: [{...CLEAN_DATA_CONSTRUCTION.resources[0], limit: 1}]}},
  {name: 'unknown evidence association', activity: {...GARDEN_CONSTRUCTION, requirements: [{...GARDEN_CONSTRUCTION.requirements[0], evidenceRefs: [17]}]}},
  {name: 'evidence piece invents an observation', activity: {...PLANT_EXPLANATION, pieces: PLANT_EXPLANATION.pieces.map(piece => piece.id === 'evidence-height' ? {...piece, text: 'Every plant reached 100 cm.'} : piece)}},
  {name: 'wrong role in validated alternative', activity: {...SECURITY_EXPLANATION, arguments: SECURITY_EXPLANATION.arguments.map(argument => ({...argument, alternatives: [{...argument.alternatives[0], warrantId: 'evidence-b'}]}))}},
];

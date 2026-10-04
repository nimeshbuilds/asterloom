import type { Source } from '../types';
import type { RuleSwitchActivity } from '../lib/ruleSwitchEngine';
export const ruleSwitchSources: Source[] = [{ id: 'changing-rule-source', title: 'Changing sorting rules — source card set', kind: 'text', text: 'These objects have two features: color and shape. In the color round, group the objects as red or blue. In the shape round, regroup the same objects as circle or triangle. Red circle: color=red; shape=circle. Red triangle: color=red; shape=triangle. Blue circle: color=blue; shape=circle. Blue triangle: color=blue; shape=triangle. A rule change can move objects that were together into different groups.', status: 'ready', addedAt: '2026-10-04T00:00:00.000Z' }];
export const ruleSwitchFixture: RuleSwitchActivity = {
  version: 1, id: 'change-the-sorting-rule', kind: 'rule-switch', scaffoldIds: ['changing-rule-sorter'], title: 'Same objects, new rule',
  instruction: 'Sort every object once. Then notice the new rule and sort the same objects again.',
  explanation: 'The color rule groups red and blue objects. The shape rule groups circles and triangles instead.',
  hint: 'Say the current rule aloud before choosing a group.', reviewStatus: 'reviewed',
  sourceRefs: [
    { sourceId: 'changing-rule-source', evidence: 'In the color round, group the objects as red or blue.' },
    { sourceId: 'changing-rule-source', evidence: 'In the shape round, regroup the same objects as circle or triangle.' },
    { sourceId: 'changing-rule-source', evidence: 'Red circle: color=red; shape=circle.' },
    { sourceId: 'changing-rule-source', evidence: 'Red triangle: color=red; shape=triangle.' },
    { sourceId: 'changing-rule-source', evidence: 'Blue circle: color=blue; shape=circle.' },
    { sourceId: 'changing-rule-source', evidence: 'Blue triangle: color=blue; shape=triangle.' },
  ],
  transitionInstruction: 'You sorted by color. Now pay attention to shape. Keep circles together and triangles together, even when their colors differ.',
  items: [
    { id: 'red-circle', label: 'Red circle', attributes: { color: 'red', shape: 'circle' }, evidenceRefs: [2] },
    { id: 'red-triangle', label: 'Red triangle', attributes: { color: 'red', shape: 'triangle' }, evidenceRefs: [3] },
    { id: 'blue-circle', label: 'Blue circle', attributes: { color: 'blue', shape: 'circle' }, evidenceRefs: [4] },
    { id: 'blue-triangle', label: 'Blue triangle', attributes: { color: 'blue', shape: 'triangle' }, evidenceRefs: [5] },
  ],
  rounds: [
    { id: 'color-round', feature: 'color', label: 'Sort by color', instruction: 'Put each red object in the red group, and each blue object in the blue group.', categories: [{ id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }], evidenceRefs: [0] },
    { id: 'shape-round', feature: 'shape', label: 'Now sort by shape', instruction: 'Put each circle in the circle group, and each triangle in the triangle group. Color no longer decides the group.', categories: [{ id: 'circle', label: 'Circle' }, { id: 'triangle', label: 'Triangle' }], evidenceRefs: [1] },
  ],
};

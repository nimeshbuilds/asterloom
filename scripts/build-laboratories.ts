import { PICTURE_BUILD_EXAMPLES, PICTURE_BUILD_EXAMPLE_SOURCE } from '../src/lib/pictureBuildExamples';
import { childPlaySources, childPlayFixtures } from '../src/data/childPlayFixtures';
import { SCENARIO_INTERACTION_EXAMPLES, SCENARIO_INTERACTION_SOURCES } from '../src/lib/scenarioInteractionExamples';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Notebook, Source } from '../src/types';
import { ACTIVITY_EXAMPLES, EXAMPLE_ACTIVITY_SOURCE } from '../src/lib/structuredEngine';
import { EXTENDED_EXAMPLES, EXTENDED_EXAMPLE_SOURCES } from '../src/lib/extendedExamples';
import { SCENARIO_EXAMPLES, SCENARIO_EXAMPLE_SOURCES } from '../src/lib/scenarioEngine';
import { SCENARIO_MODE_EXAMPLES, SCENARIO_MODE_SOURCES } from '../src/lib/scenarioModeExamples';
import { COMPOSITION_EXAMPLES, COMPOSITION_EXAMPLE_SOURCE } from '../src/lib/compositionExamples';
import { COMPOSITION_MODE_EXAMPLES, COMPOSITION_MODE_EXAMPLE_SOURCE } from '../src/lib/compositionModeExamples';
import { pictureSources, pictureDiscoveryFixture, pictureWordFixture } from '../src/data/pictureFixtures';
import { ruleSwitchSources, ruleSwitchFixture } from '../src/data/ruleSwitchFixtures';
import { exportOfflineHtml, parsePackage, serializePackage } from '../src/lib/package';

const at = '2026-10-04T00:00:00.000Z';
const asSource = (source: { id: string; title: string; text: string; status: string } & Partial<Source>): Source => ({ ...source, status: 'ready', kind: source.kind ?? 'text', addedAt: source.addedAt ?? at });
const notebook = (id: string, title: string, description: string, ageGroup: string, sources: Source[], activities: NonNullable<Notebook['activities']>): Notebook => ({
  id, title, description, ageGroup, goal: 'Explore prepared source models, then make your own learning world.', theme: ageGroup === 'adult' ? 'workshop' : 'forest',
  scaffoldIds: [...new Set(activities.flatMap(a => a.scaffoldIds ?? []))], sources, activities, cards: [], createdAt: at, updatedAt: at, revision: 1,
});
const examples = [
  notebook('asterloom-laboratories-v1', 'The Learning Laboratories', 'Construct a system, investigate a failure, compare observations, commit a prediction and review a partner’s reasoning. Every model includes its original teaching sources. These are authored exercises, not professional certification.', 'adult',
    [EXAMPLE_ACTIVITY_SOURCE, ...EXTENDED_EXAMPLE_SOURCES, ...SCENARIO_EXAMPLE_SOURCES, ...SCENARIO_MODE_SOURCES, ...SCENARIO_INTERACTION_SOURCES, COMPOSITION_EXAMPLE_SOURCE, COMPOSITION_MODE_EXAMPLE_SOURCE].map(asSource),
    [...ACTIVITY_EXAMPLES, ...EXTENDED_EXAMPLES, ...SCENARIO_EXAMPLES, ...SCENARIO_MODE_EXAMPLES, ...SCENARIO_INTERACTION_EXAMPLES, ...COMPOSITION_EXAMPLES, ...COMPOSITION_MODE_EXAMPLES]),
  notebook('asterloom-little-explorers-v1', 'The Little Explorers', 'Explore a supplied picnic picture, connect words with objects and regroup the same shapes when the rule changes. A grown-up can read the clues and record support. Age suitability still needs caregiver judgment.', '6-8', [...pictureSources, ...ruleSwitchSources, ...childPlaySources, PICTURE_BUILD_EXAMPLE_SOURCE], [pictureDiscoveryFixture, pictureWordFixture, ruleSwitchFixture, ...childPlayFixtures, ...PICTURE_BUILD_EXAMPLES]),
];
const runtime = await readFile('dist/runtime.html', 'utf8');
await mkdir('release/examples', { recursive: true });
for (const example of examples) {
  const serialized = serializePackage(example); parsePackage(serialized);
  const name = example.title.replaceAll(' ', '-');
  await writeFile(`release/examples/${name}.learnpack`, serialized);
  await writeFile(`release/examples/${name}.html`, exportOfflineHtml(example, runtime));
  console.log(`${example.title}: ${example.activities!.length} activities, ${example.sources.length} original sources, AI not required.`);
}

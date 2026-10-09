import {scaffoldById} from '../data/scaffolds';
import {worldForScaffold} from '../data/worlds';
import {ARTWORK_SETTINGS,worldArtworkFor} from './worldArtwork';
import {buildLessonActionGuide,buildLessonStory} from './lessonStory';
import type {StructuredActivity} from './structuredEngine';
import type {AILearningMission} from './aiLearningPlan';

/** The illustration and authored role are a game frame, never source evidence.
 * Only the chosen recipe gets the complete context in a writer/check request. */
export function scaffoldStoryContext(scaffoldId:string,ageGroup:string,activity:Pick<StructuredActivity,'kind'>|StructuredActivity){
 const scaffold=scaffoldById(scaffoldId);if(!scaffold)throw new Error('Unknown story scaffold.');
 const world=worldForScaffold(scaffoldId),art=worldArtworkFor(world,ageGroup),story=buildLessonStory(scaffold,ageGroup),actions=buildLessonActionGuide(activity);
 const description=ARTWORK_SETTINGS[art.id];
 return{
  version:1 as const,fictional:true as const,scaffoldId,ageGroup,
  setting:`${art.name}: ${description}`,role:story.role,
  artwork:{id:art.id,name:art.name,description,purpose:art.purpose},
  // These motifs describe the bundled image; no source figure is promised.
  visibleMotifs:description,layout:world.layout,
  actionGuide:actions,
  storyBeats:{arrival:story.mission,learn:actions.prepare,act:actions.act,inspect:actions.inspect,success:story.payoff,retry:story.recovery},
  boundaries:[
   'The setting, role and scenery are fictional. Subject facts, conditions and answers must come from the disclosed source.',
   'Use only the supplied action guide and the actual activity controls. Do not promise movement, dialogue, characters, tools, timers or simulation behavior that the activity does not implement.',
   'Decorative illustration details are not evidence, answer labels or interactive objects. Do not imply that a source figure has been rendered.',
   'Keep the source learning objective central. The setting must not change the rules or imply real-world consequences, human review or mastery.',
  ],
 };
}
/** Compact planning context avoids resending every selected-world detail for
 * every candidate; writing/checking receive the full chosen context. */
export function scaffoldStorySummary(scaffoldId:string,ageGroup:string){
 const scaffold=scaffoldById(scaffoldId);if(!scaffold)throw new Error('Unknown story scaffold.');
 const art=worldArtworkFor(worldForScaffold(scaffoldId),ageGroup),story=buildLessonStory(scaffold,ageGroup);
 return{setting:art.name,role:story.role};
}
/** Apply only to newly written, already validated missions. Old saved games and
 * their paid creation receipts remain byte-for-byte unchanged on resume. The
 * fixed art cannot move to an AI-invented world; mission/success keep the AI's
 * source-specific wording. An omitted frame gets the safe authored fallback. */
export function alignCreatedMissionStory(teaching:AILearningMission,scaffoldId:string,activity:StructuredActivity):AILearningMission {
 const context=scaffoldStoryContext(scaffoldId,teaching.ageGroup,activity);
 return{...teaching,storyFrame:{fictional:true,setting:context.setting,role:context.role,mission:teaching.storyFrame?.mission??context.storyBeats.arrival,success:teaching.storyFrame?.success??context.storyBeats.success}};
}

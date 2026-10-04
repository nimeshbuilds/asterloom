import {describe,it,expect} from 'vitest';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {WORLD_COMPOSITIONS} from '../src/data/worlds';
import {buildLessonActionGuide,buildLessonStory} from '../src/lib/lessonStory';
import {getScaffoldRuntimeDefinition,resolveScaffoldRuntime} from '../src/lib/scaffoldRuntime';
import {SCENARIO_PREDICTION_EXAMPLE,SCENARIO_CAMPAIGN_EXAMPLE} from '../src/lib/scenarioModeExamples';
import {SCENARIO_DIALOGUE_EXAMPLE,SCENARIO_PROMPT_EXAMPLE} from '../src/lib/scenarioInteractionExamples';
import {PARTNER_PLANTS,SQL_CODE_REVIEW} from '../src/lib/compositionModeExamples';
import {TREE_PICTURE_BUILD} from '../src/lib/pictureBuildExamples';
import {buildLearningBriefing,initialLessonState} from '../src/lib/learningBriefing';
import {createNotebook,createSource} from '../src/lib/utils';

describe('recipe presentation and implemented-action coverage',()=>{
 it.each(SCAFFOLDS.map(s=>[s.id,s] as const))('%s has a story, visual world and implemented action guide without claiming a content-free game is ready',(_,scaffold)=>{
  const runtime=getScaffoldRuntimeDefinition(scaffold.id),story=buildLessonStory(scaffold,scaffold.ages[0]);
  expect(WORLD_COMPOSITIONS.find(w=>w.id===scaffold.id)).toBeDefined();expect(story.fictional).toBe(true);expect(story.boundary).toContain('cited material');
  expect(resolveScaffoldRuntime(scaffold.id,{ageGroup:scaffold.ages[0],cards:[],activities:[]}).available).toBe(false);
  for(const kind of runtime.activityKinds){const guide=buildLessonActionGuide({kind});expect(guide.id).toBe(kind);expect(new Set([guide.prepare,guide.act,guide.inspect]).size).toBe(3);}
  if(runtime.mode==='source-practice')expect(buildLessonActionGuide().id).toBe('recall');
 });
 it('teaches actual source-code, partner, prediction, campaign and dialogue interactions rather than a generic family description',()=>{
  for(const[activity,id,expected]of [[SQL_CODE_REVIEW,'code-review','exact code spans'],[PARTNER_PLANTS,'partner','hand over the device'],[SCENARIO_PREDICTION_EXAMPLE,'prediction','after committing'],[SCENARIO_CAMPAIGN_EXAMPLE,'campaign','revise it with a reason'],[SCENARIO_DIALOGUE_EXAMPLE,'dialogue','prepared reply'],[SCENARIO_PROMPT_EXAMPLE,'prompt-comparison','recorded outputs']] as const){const guide=buildLessonActionGuide(activity);expect(guide.id).toBe(id);expect(guide.act).toContain(expected);expect(JSON.stringify(guide)).not.toContain(activity.explanation);}
  expect(buildLessonActionGuide(TREE_PICTURE_BUILD).inspect).toContain('human reviewed');
  expect(buildLessonActionGuide({kind:'explanation'}).id).toBe('explanation');expect(buildLessonActionGuide({kind:'completion'}).id).toBe('completion');
 });
 it('keeps materially different diagram, construction and budget interactions distinct',()=>{
  expect(buildLessonActionGuide({kind:'diagram'}).act).toContain('label');expect(buildLessonActionGuide({kind:'construction'}).act).toContain('network');expect(buildLessonActionGuide({kind:'budget'}).act).toContain('quantities');expect(buildLessonActionGuide({kind:'completion',pattern:{}}).id).toBe('pattern');
 });
 it('starts preschool reflection with talking/pointing and preserves a deliberately selected written mode on resume',()=>{
  const source=createSource('We looked at the supplied picture together and described what we could see. The source leaves the rest of the story open.','Source story');
  const notebook=createNotebook({sources:[source],ageGroup:'3-5',cards:[],activities:[{...TREE_PICTURE_BUILD,sourceRefs:[{sourceId:source.id,evidence:source.text}]}]}),scaffold=SCAFFOLDS.find(s=>s.id==='build-and-tell')!;
  const plan=buildLearningBriefing({notebook,scaffold,activity:notebook.activities![0]}),fresh=initialLessonState(plan);expect(fresh.practice.mode).toBe('spoken');expect(plan.mission.actionGuide.id).toBe('picture-build');
  expect(initialLessonState(plan,{...fresh,practice:{...fresh.practice,mode:'written'}}).practice.mode).toBe('written');expect(fresh.completedAt).toBeUndefined();
 });
});

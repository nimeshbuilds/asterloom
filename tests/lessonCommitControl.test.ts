import {describe,expect,it} from 'vitest';
import {buildLessonActionGuide} from '../src/lib/lessonStory';
import {scaffoldStoryContext} from '../src/lib/scaffoldStoryContext';
describe('shared creation and play control contract',()=>{
 it('includes the actual sequence commit button alongside movement controls',()=>{
  const guide=buildLessonActionGuide({kind:'sequence',items:[{},{}]});expect(guide.act).toContain('Move earlier');expect(guide.act).toContain('Move later');expect(guide.commit).toBe('Check my work');expect(guide.inspect).toContain('Choose Check my work when ready.');
  expect(scaffoldStoryContext('process-reconstruction','adult',{kind:'sequence'}).actionGuide.commit).toBe('Check my work');
 });
 it.each(['classification','dependency','completion','budget','construction','explanation','scenario','child-play','rule-switch'] as const)('provides the common structured-board commit for %s',kind=>expect(buildLessonActionGuide({kind}).commit).toBe('Check my work'));
 it('uses the reflection button only for self-assessment',()=>{
  expect(buildLessonActionGuide({kind:'rubric',mode:'self-assessment'}).commit).toBe('Save my reflection');expect(buildLessonActionGuide({kind:'rubric',mode:'comparison'}).commit).toBe('Check my work');
 });
 it('does not invent a structured-board footer for recall',()=>expect(buildLessonActionGuide().commit).toBeUndefined());
});

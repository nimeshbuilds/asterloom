import {describe,expect,it} from 'vitest';
import {AGE_GROUPS,SCAFFOLDS} from '../src/data/scaffolds';
import {gameRecipeChoices,gameRecipeCoverage} from '../src/lib/gameDraftAdapters';
import {scaffoldStoryContext} from '../src/lib/scaffoldStoryContext';
import {buildLessonActionGuide} from '../src/lib/lessonStory';
import {GAME_TEMPLATE_SKILL_VERSION,TEMPLATE_SKILL_INSTRUCTION,templateSkillCatalog,templateSkillSummary,templateSkillFor,compactTemplateSkills} from '../src/lib/gameTemplateSkills';

describe('application-authored game template skills',()=>{
 it('covers all75 templates and every supported audience through real bounded writer contracts',()=>{
  const catalog=templateSkillCatalog(),coverage=gameRecipeCoverage();
  expect(catalog).toHaveLength(75);expect(new Set(catalog.map(skill=>skill.scaffoldId)).size).toBe(75);
  expect(catalog.filter(skill=>skill.ageModes.some(mode=>mode.authoring==='ai-writable'))).toHaveLength(75);
  expect(catalog.filter(skill=>skill.ageModes.every(mode=>mode.authoring==='prepared-content-only'))).toHaveLength(0);
  for(const skill of catalog){
   const scaffold=SCAFFOLDS.find(scaffold=>scaffold.id===skill.scaffoldId)!;
   expect(skill.version).toBe(GAME_TEMPLATE_SKILL_VERSION);expect(skill.ages).toEqual(scaffold.ages);
   expect(skill.ageModes.map(mode=>mode.ageGroup)).toEqual(scaffold.ages);
   for(const mode of skill.ageModes){const expected=gameRecipeChoices(mode.ageGroup).filter(choice=>choice.scaffoldId===skill.scaffoldId).map(choice=>choice.kind);expect(mode.writerKinds).toEqual(expected);expect(mode.authoring==='ai-writable').toBe(coverage.find(row=>row.scaffoldId===skill.scaffoldId)!.supported);const full=templateSkillFor(skill.scaffoldId,mode.ageGroup);expect(full.authoring).toBe(mode.authoring);expect(full.audience.ageGroup).toBe(mode.ageGroup);expect(full.beats.map(beat=>beat.id)).toEqual(['briefing','teach','guided-practice','challenge','feedback','debrief']);expect(full.sourceFit.requires).toEqual(scaffold.prerequisites);expect(full.feedbackRules).toEqual(scaffold.feedbackRules);}
  }
 });
 it('retains template-specific authorship instead of renaming one generic lesson',()=>{
  const network=templateSkillFor('packet-path-inspector','adult'),timeline=templateSkillFor('timeline-investigation','adult'),argument=templateSkillFor('argument-construction','adult');
  expect(network.challengeFrame).toContain('{');expect(network.learningPrinciple).toBe(SCAFFOLDS.find(scaffold=>scaffold.id==='packet-path-inspector')!.learningPrinciple);
  expect(network.beats[0].instruction).toContain('path and dependencies');expect(timeline.beats[0].instruction).toContain('without assuming causation');expect(argument.beats[0].instruction).toContain('reasoning');
  expect(network.sourceFit.rule).toContain('explicitly stated order');expect(argument.sourceFit.rule).toContain('unrestricted prose is not automatically graded');
  expect(new Set([network.presentation.reactionProfileId,timeline.presentation.reactionProfileId,argument.presentation.reactionProfileId]).size).toBe(3);
 });
 it('references actual age-specific story/audio catalogs without resending or replacing assets and allowlists',()=>{
  for(const ageGroup of ['9-11','adult']){
   const skill=templateSkillFor('process-reconstruction',ageGroup),story=scaffoldStoryContext('process-reconstruction',ageGroup,{kind:'sequence',items:[]} as any);
   expect(skill.presentation.storyContextRef).toBe('storyContext');expect(skill.presentation.audioChoicesRef).toBe('audioChoices');
   expect(skill.beats[0].instruction).toContain('storyContext.setting and storyContext.role exactly');
   expect(skill).not.toHaveProperty('artwork');expect(skill).not.toHaveProperty('audioChoices');expect(skill).not.toHaveProperty('assetPath');
   expect(story.ageGroup).toBe(ageGroup);expect(story.fictional).toBe(true);
   expect(skill.presentation.musicRule).toContain('creativeDirection.audioDirection exactly');expect(skill.presentation.effectsRule).toContain('committed save');expect(skill.presentation.effectsRule).toContain('mute, volume or reduced-motion');
  }
 });
 it('provides exact runtime controls only for a supplied compatible activity and preserves special authoring distinctions',()=>{
  const activity={kind:'sequence' as const,items:[{},{}]},full=templateSkillFor('process-reconstruction','adult',activity);
  expect(full.actualControls).toEqual({origin:'application',...buildLessonActionGuide(activity)});expect(full.actualControls!.act).toContain('Move earlier or Move later');
  expect(templateSkillFor('process-reconstruction','adult')).not.toHaveProperty('actualControls');
  expect(()=>templateSkillFor('process-reconstruction','adult',{kind:'dependency'})).toThrow(/does not match/);
  const special=templateSkillFor('secure-code-review','adult',{kind:'explanation',codeReview:{}});
  expect(special.authoring).toBe('ai-writable');expect(special.support.requiredCapabilities).toContain('explanation:code-review');expect(special.actualControls!.id).toBe('code-review');expect(special.support.authoringRule).toContain('bounded writer schema');
 });
 it('keeps young-child skills caregiver-supported and does not promise independent mastery or compulsory engagement',()=>{
  const skill=templateSkillFor('puppet-stories','3-5');
  expect(skill.audience).toMatchObject({caregiver:true,timer:false,maxInstructionsPerStep:1});expect(skill.audience.guidance).toContain('grown-up');expect(skill.sourceFit.rule).toContain('actual source script');
  expect(skill.boundaries).toContainEqual(expect.stringContaining('no guilt, loss threats, artificial urgency or compulsory streaks'));
  expect(()=>templateSkillFor('puppet-stories','adult')).toThrow(/audience/);expect(()=>templateSkillSummary('not-a-template','adult')).toThrow(/Unknown/);
 });
 it.each(AGE_GROUPS.map(age=>age.id))('compiles a lossless compact shortlist for %s without extra AI calls or enabling new choices',ageGroup=>{
  const ids=gameRecipeChoices(ageGroup).map(choice=>choice.scaffoldId),summaries=ids.map(id=>templateSkillSummary(id,ageGroup)),compiled=compactTemplateSkills(ids,ageGroup);
  const reconstructed=compiled.rows.map(row=>({version:compiled.version,authoring:compiled.authoring,...Object.fromEntries(compiled.fields.map((field,index)=>[field,row[index]]))}));
  expect(reconstructed).toEqual(summaries);expect(compiled.rows.map(row=>row[0])).toEqual(ids);
  expect(JSON.stringify(compiled).length).toBeLessThan(JSON.stringify(ids.map(id=>templateSkillFor(id,ageGroup))).length*.2);
  expect(JSON.stringify(compiled)).not.toContain('playTrackIds');expect(JSON.stringify(compiled)).not.toContain('storyContext.setting');
 });
 it('rejects a broadened shortlist and returns isolated metadata rather than shared mutable authored definitions',()=>{
  expect(()=>compactTemplateSkills([],'adult')).toThrow(/shortlist/);expect(()=>compactTemplateSkills(['process-reconstruction','process-reconstruction'],'adult')).toThrow(/shortlist/);expect(()=>compactTemplateSkills(['puppet-stories'],'adult')).toThrow(/audience/);
  const first=templateSkillFor('process-reconstruction','adult');first.sourceFit.requires.push('Mutated requirement');first.feedbackRules.push('Mutated feedback');first.support.activityKinds.push('media');
  const second=templateSkillFor('process-reconstruction','adult');expect(second.sourceFit.requires).not.toContain('Mutated requirement');expect(second.feedbackRules).not.toContain('Mutated feedback');expect(second.support.activityKinds).not.toContain('media');
  expect(TEMPLATE_SKILL_INSTRUCTION).toContain('does not add response fields');expect(TEMPLATE_SKILL_INSTRUCTION).toContain('untrusted reference data');
 });
});

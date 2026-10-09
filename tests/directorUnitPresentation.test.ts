import {describe,expect,it} from 'vitest';
import {directorUnitPresentation,type DirectorSourceUnit} from '../src/lib/gameDirectorSources';
const unit=(title:string,headingPath=[title]):DirectorSourceUnit=>({id:'saved-unit',sourceId:'source',sourceRevision:'revision',sourceTitle:'Study guide',title,headingPath,start:240,end:290,excerpt:'The catalog stores table metadata and not the data.',kind:'concept',missionEligible:true});
describe('legacy source headings in creator prompts',()=>{
 it.each(['if "text" in block','for item in records','while count < limit','def process(item)'])('does not present a code control line as the subject: %s',title=>{
  const source=unit(title),before=JSON.stringify(source);expect(directorUnitPresentation(source)).toEqual({title:'Source section',headingPath:[]});expect(JSON.stringify(source)).toBe(before);
 });
 it('keeps a genuine ancestor without changing the persisted inventory',()=>{
  const source=unit('if "text" in block',['Table metadata','if "text" in block']);expect(directorUnitPresentation(source)).toEqual({title:'Table metadata',headingPath:['Table metadata']});expect(source.title).toBe('if "text" in block');
 });
 it.each(['If demand increases','For better recall','Class definitions','Metadata and storage'])('keeps an ordinary heading: %s',title=>expect(directorUnitPresentation(unit(title))).toEqual({title,headingPath:[title]}));
});

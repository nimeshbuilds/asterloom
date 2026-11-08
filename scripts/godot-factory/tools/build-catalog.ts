import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {SCAFFOLDS,AGE_GROUPS} from '../../../src/data/scaffolds';
import {getScaffoldRuntimeDefinition,scaffoldRequiredCapabilities} from '../../../src/lib/scaffoldRuntime';
import {buildLessonStory} from '../../../src/lib/lessonStory';
/** Authored recipes retain their contract and narrative. Native support is reported separately by QA. */
const catalog={version:1,ages:AGE_GROUPS,templates:SCAFFOLDS.map(scaffold=>({...scaffold,runtime:getScaffoldRuntimeDefinition(scaffold.id),requiredCapabilities:scaffoldRequiredCapabilities(scaffold.id),story:buildLessonStory(scaffold,scaffold.ages.includes('adult')?'adult':scaffold.ages[0])}))};
const out=fileURLToPath(new URL('../project/data/catalog.json',import.meta.url));
mkdirSync(fileURLToPath(new URL('../project/data/',import.meta.url)),{recursive:true});
writeFileSync(out,JSON.stringify(catalog,null,2)+'\n');
console.log(`Wrote ${catalog.templates.length} authored native catalog entries to ${out}`);

import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {build} from 'esbuild';
import {nativeFactoryFixtures} from './fixtures/nativeFactoryBenchmark';
import {createNotebook} from '../src/lib/utils';
import {learnBeforeQuest} from './teachingDriver.mjs';

let html:string;
test.beforeAll(async()=>{
 const bundle=await build({entryPoints:['tests/gameSessionPresentation.fixture.tsx'],bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',outdir:'.qa/session-presentation-bundle',loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'}});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
 html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Game session presentation regression</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
});
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));Object.defineProperty(navigator,'deviceMemory',{value:1});});
});

async function readable(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The game stage must not overflow the window.').toBe(true);
 expect((await new AxeBuilder({page}).include('.structured-board').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
}
async function expand(page:Page){
 // Click each initially closed disclosure, including controls nested inside
 // the mission guide. Do not alter DOM attributes to bypass controlled state.
 for(let depth=0;depth<4;depth++){
  const closed=page.locator('.structured-board details:not([open])>summary');let opened=0;
  for(const summary of await closed.all())if(await summary.isVisible()){await summary.click();opened++;}
  if(!opened)break;
 }
}

for(const kind of ['budget','data','construction','decision','diagram','rubric','completion','media','explanation','dependency','picture','rule-switch','child-play','picture-build','recall']){
 test(`${kind} stays readable in the dark game stage, including expanded controls and narrow windows`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__session-presentation?*',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.setViewportSize({width:1440,height:980});await page.goto('/__session-presentation?kind='+kind);await expect(page.locator('.mission-play-heading')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('.mission-arena')).toHaveCount(0);
  await readable(page);
  if(['data','construction','decision','child-play'].includes(kind))await page.screenshot({path:'.qa/game-experience-review/'+kind+'-session-desktop.png',fullPage:true,animations:'disabled'});
  if(kind==='rule-switch'){
   for(let item=0;item<4;item++)await page.locator('.switch-place').first().click();
   await page.getByRole('button',{name:'Save this sort and change the rule',exact:true}).click();await page.getByRole('button',{name:'I’m ready for the new rule',exact:true}).click();
  }
  if(kind==='picture')await page.getByRole('button',{name:'I’m ready to play',exact:false}).click();
  await expand(page);await readable(page);
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await readable(page);
  if(kind==='construction'){
   const workspace=page.getByRole('region',{name:'Scroll the construction workspace',exact:true});await workspace.focus();await expect(workspace).toBeFocused();await page.keyboard.press('ArrowRight');await expect.poll(()=>workspace.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
  }
  await page.screenshot({path:info.outputPath(kind+'-narrow-expanded.png'),fullPage:true,animations:'disabled'});expect(errors).toEqual([]);
 });
}

for(const kind of ['budget','data']){
 test(`${kind} controls are reachable after teaching in the full app without a decorative stage`,async({page})=>{
  const entry=nativeFactoryFixtures().find(f=>f.activity.kind===kind)!;
  const notebook=createNotebook({id:'presentation-app-'+kind,title:'Presentation regression '+kind,ageGroup:entry.ageGroup,theme:'observatory',sources:entry.sources,activities:[entry.activity],cards:[],scaffoldIds:[entry.scaffoldId]});
  await page.setViewportSize({width:1440,height:1000});await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;},notebook);await page.goto('/');await page.getByRole('button',{name:'Play game',exact:true}).click();await learnBeforeQuest(page);await expect(page.locator('.mission-play-heading')).toBeVisible();await page.evaluate(()=>scrollTo(0,0));
  await expect(page.locator('.mission-arena')).toHaveCount(0);
  const control=kind==='budget'?page.getByRole('button',{name:'Allocate one Small workstation',exact:true}):page.getByRole('combobox',{name:'Explore a column',exact:true});
  await expect(control).toBeInViewport({ratio:1});
  expect(await control.evaluate(element=>{const box=element.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return hit===element||element.contains(hit);}),'The first gameplay control must not be covered.').toBe(true);
  if(kind==='budget'){await control.focus();await page.keyboard.press('Enter');await expect(page.getByRole('spinbutton',{name:'Quantity of Small workstation',exact:true})).toHaveValue('1');}
  else{await control.selectOption('zone');await page.getByLabel('Contains',{exact:true}).fill('north');await expect(page.locator('.data-records')).toContainText('Morning A');await expect(page.locator('.data-records')).not.toContainText('Morning C');}
  await readable(page);
 });
}

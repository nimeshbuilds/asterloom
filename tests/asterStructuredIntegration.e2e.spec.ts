import {openDetailedWorkspace} from './teachingDriver.mjs';
import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {build} from 'esbuild';
async function openBoard(page:Page,info:TestInfo) {
 let releaseModel!:()=>void;
 const bundle=await build({entryPoints:['tests/asterStructuredIntegration.fixture.tsx'],bundle:true,format:'esm',target:'es2022',jsx:'automatic',write:false,outdir:info.outputPath('unused'),loader:{'.woff2':'dataurl','.ogg':'dataurl'}});
 const js=bundle.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 await page.route('http://aster-board.test/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/retrieval/manifest.json'){await new Promise<void>(resolve=>releaseModel=resolve);await route.fulfill({status:404,body:'Local model unavailable for this race fixture'});return;}if(path==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><title>Real board companion race</title><style>'+css+'</style></head><body><div id="root"></div><script type="module">'+js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>'});return;}await route.fulfill({status:404,body:'No external assets in this fixture'});});
 await page.goto('http://aster-board.test/');await expect(page.getByRole('heading',{name:'Arrange the investigation',exact:true})).toBeVisible();await openDetailedWorkspace(page);await page.getByRole('button',{name:'Ask Aster',exact:true}).click();await page.getByRole('textbox',{name:'What would you like to find?',exact:true}).fill('question');await page.getByRole('button',{name:'Find in my sources',exact:true}).click();await expect(page.getByText('Looking through your material…',{exact:true})).toBeVisible();await expect.poll(()=>!!releaseModel).toBe(true);
 return()=>releaseModel();
}
test('a pending source search persists the learner’s newer real-board move when help arrives',async({page},info)=>{
 const release=await openBoard(page,info);await page.getByRole('button',{name:'Select step Define the question',exact:true}).click();await page.getByRole('button',{name:'Move selected step to station 1',exact:true}).click();const moved=await page.evaluate(()=>(window as any).boardQA.durable.order);expect(moved[0]).toBe('question');release();await expect(page.locator('.aster-results article').first()).toContainText('Define the question');const saved=await page.evaluate(()=>(window as any).boardQA.durable);expect(saved.order).toEqual(moved);expect(saved._draft.hintUsed).toBe(true);
});
test('help arriving during a pending real-board result commit withholds source passages',async({page},info)=>{
 const release=await openBoard(page,info);await page.evaluate(()=>(window as any).boardQA.delayCheck=true);await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).boardQA.pending.length)).toBe(1);release();await expect(page.locator('.aster-search-error')).toContainText('could not search');await expect(page.locator('.aster-results article')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).boardQA.saves.length)).toBe(0);await page.evaluate(()=>(window as any).boardQA.pending.shift()(true));expect(await page.evaluate(()=>(window as any).boardQA.commits[0].evaluation.hintUsed)).toBe(false);
});

import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const initial=()=>[{id:'codex',provider:'chatgpt',enabled:true,installed:false,installing:false,pending:false,connected:false},{id:'grok',provider:'grok',enabled:true,installed:false,installing:false,pending:false,connected:false}];
async function settings(page:Page){await page.goto('/');await page.getByRole('button',{name:'Studio settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Optional AI connections'})).toBeVisible();}
test('subscription setup installs, completes provider login, discovers models and disconnects without leaking keys',async({page})=>{
 const engines=initial();const actions:string[]=[];let opened='';let connected=false;
 await page.addInitScript(()=>{window.open=((url?:string|URL)=>{(window as any).__openedAuth=String(url);return null;}) as typeof window.open;});
 await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines}}));
 await page.route('**/api/ai/engines/codex/*',async route=>{
  const action=new URL(route.request().url()).pathname.split('/').at(-1)!;actions.push(action);
  if(action==='install'){engines[0].installed=true;await route.fulfill({json:{...engines[0],version:'verified-test-version'}});}
  else if(action==='login'){engines[0].pending=true;await route.fulfill({json:{authUrl:'https://chatgpt.com/auth/login?state=opaque-provider-state'}});}
  else if(action==='logout'){engines[0].connected=false;engines[0].pending=false;await route.fulfill({json:engines[0]});}
  else await route.fulfill({json:engines[0]});
 });
 await page.route('**/api/models',async route=>{expect(route.request().postDataJSON()).toMatchObject({provider:'chatgpt',apiKey:''});expect(connected).toBe(true);await route.fulfill({json:{models:[{id:'plan-model-a',name:'Plan model A'},{id:'plan-model-b',name:'Plan model B'}]}});});
 await settings(page);await page.getByRole('button',{name:'Install Codex & sign in',exact:true}).click();
 await expect(page.getByRole('link',{name:'Reopen the provider’s sign-in page'})).toHaveAttribute('href','https://chatgpt.com/auth/login?state=opaque-provider-state');
 opened=await page.evaluate(()=>(window as any).__openedAuth);expect(opened).toContain('https://chatgpt.com/');expect(actions).toEqual(['install','login']);
 engines[0].connected=true;engines[0].pending=false;connected=true;
 await expect(page.getByRole('combobox',{name:'Available models',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Available models',exact:true}).selectOption('plan-model-b');await expect(page.getByLabel('Model ID',{exact:true})).toHaveValue('plan-model-b');
 await expect(page.getByLabel('API key · this session only',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('opaque-provider-state');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('openai');await expect(page.getByRole('button',{name:'Continue with ChatGPT',exact:true})).toBeEnabled();expect(actions).toContain('logout');
});
test('failed installation can retry and foreign login URLs never open',async({page})=>{
 const engines=initial();let installs=0;
 await page.addInitScript(()=>{window.open=(()=>{(window as any).__openedAuth=true;return null;}) as typeof window.open;});
 await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines}}));
 await page.route('**/api/ai/engines/grok/install',async route=>{installs++;if(installs===1){await route.fulfill({status:502,json:{error:'Engine download failed. Retry installation.'}});}else{engines[1].installed=true;await route.fulfill({json:engines[1]});}});
 await page.route('**/api/ai/engines/grok/login',route=>route.fulfill({json:{authUrl:'https://grok.com.attacker.invalid/login'}}));
 await settings(page);await page.getByRole('button',{name:'Install Grok & sign in',exact:true}).click();await expect(page.locator('.provider-error')).toContainText('Engine download failed');await expect(page.getByRole('button',{name:'Install Grok & sign in',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Install Grok & sign in',exact:true}).click();await expect(page.locator('.provider-error')).toContainText('unexpected sign-in address');expect(await page.evaluate(()=>(window as any).__openedAuth)).toBeUndefined();expect(installs).toBe(2);
});
test('unsupported commercial auth explains the restriction and API connection stays usable at narrow width',async({page})=>{
 const engines=initial();engines[0].enabled=false;
 await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:engines.map(row=>row.id==='codex'?{...row,reason:'Commercial plan sign-in requires provider approval.'}:row)}}));
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Studio settings',exact:true}).click();
 await expect(page.getByRole('button',{name:'Install Codex & sign in',exact:true})).toBeDisabled();await expect(page.locator('.subscription-grid')).toContainText('Commercial plan sign-in requires provider approval');await page.getByRole('button',{name:'Use an API key',exact:true}).click();await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('anthropic');await page.getByLabel('API key · this session only',{exact:true}).fill('test-session-key');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);const results=await new AxeBuilder({page}).include('.provider-connection').analyze();expect(results.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
});

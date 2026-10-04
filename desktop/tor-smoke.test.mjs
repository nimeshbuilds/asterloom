import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {_electron as electron} from 'playwright';
import {createService} from '../server/index.mjs';
import {nativeTestExecutable} from './testing.mjs';

const enabled=process.env.ASTERLOOM_NATIVE_TOR_TEST==='1';
test('native IPC configures onion-only SOCKS and the sandboxed renderer joins a real onion room',{skip:!enabled,timeout:360000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-native-tor-'));
  const binary=process.env.ASTERLOOM_TOR_BINARY||path.resolve(`desktop/vendor/tor/${process.platform}-${process.arch}/tor/${process.platform==='win32'?'tor.exe':'tor'}`);
  const originSetting=process.env.LEARN_ALLOWED_ORIGINS;
  process.env.LEARN_ALLOWED_ORIGINS=[originSetting,'asterloom://app'].filter(Boolean).join(',');
  let remote,application;
  try{
    remote=await createService({port:0,dataDir:path.join(directory,'remote'),enableTor:true,torBinary:binary});
    const env={...process.env,ASTERLOOM_DATA_DIR:path.join(directory,'native')};delete env.ELECTRON_RUN_AS_NODE;
    const executable=process.env.ASTERLOOM_SMOKE_APP;
    const selected=await nativeTestExecutable(executable,directory);
    application=await electron.launch({...selected?{executablePath:selected,args:[]}:{args:['desktop/main.mjs']},env,cwd:process.cwd(),timeout:30000});
    if(process.env.ASTERLOOM_SMOKE_ARCH)assert.equal(await application.evaluate(()=>process.arch),process.env.ASTERLOOM_SMOKE_ARCH);
    // The same transport contract applies to a studio and a standalone game.
    // Wait for either app's rendered world, then exercise its actual bridge.
    const page=await application.firstWindow();await page.getByRole('heading',{level:1}).first().waitFor({timeout:20000});
    const onionExample=`http://${'a'.repeat(56)}.onion/`;
    assert.equal(await application.evaluate(({session},url)=>session.defaultSession.resolveProxy(url),onionExample),'PROXY 127.0.0.1:9');
    const initial=await page.evaluate(()=>window.asterloomDesktop.setTorEnabled(true));assert.equal(initial.installed,true);assert.equal(initial.proxyConfigured,true);
    assert.equal(await application.evaluate(({session},url)=>session.defaultSession.resolveProxy(url),onionExample),`SOCKS5 127.0.0.1:${initial.socksPort}`);
    for(const url of ['http://127.0.0.1:4321/','https://example.org/'])assert.equal(await application.evaluate(({session},url)=>session.defaultSession.resolveProxy(url),url),'DIRECT');
    let native=initial;const deadline=Date.now()+240000;let reportAt=0;
    while((native.status!=='ready'||remote.torStatus().status!=='ready')&&Date.now()<deadline){
      if(Date.now()-reportAt>15000){console.log(`Native Tor ${native.bootstrap||0}% · other Tor ${remote.torStatus().bootstrap}%`);reportAt=Date.now();}
      await new Promise(resolve=>setTimeout(resolve,1000));native=await page.evaluate(()=>window.asterloomDesktop.getTorStatus());
    }
    assert.equal(native.status,'ready');assert.equal(remote.torStatus().status,'ready');
    const base=`http://${remote.torStatus().hostname}`;
    const ownerResponse=await fetch(`http://127.0.0.1:${remote.port}/api/rooms`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notebookId:'native-tor',playerName:'Host',packHash:'native-tor-revision',missions:[{id:'one',maxScore:1000}]})});assert.equal(ownerResponse.status,201);const owner=await ownerResponse.json();
    async function request(route,body,token){return page.evaluate(async({url,body,token})=>{const response=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:response.status,body:await response.json()};},{url:base+route,body,token});}
    let health;const publishDeadline=Date.now()+60000;
    while(Date.now()<publishDeadline){try{health=await request('/api/health');if(health.status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,2000));}
    assert.equal(health?.status,200,'The renderer could not reach the onion service.');
    const joined=await request('/api/rooms/join',{inviteCode:owner.inviteCode,playerName:'Native learner',packHash:'native-tor-revision'});assert.equal(joined.status,201);
    const scored=await request(`/api/rooms/${owner.roomId}/results`,{eventId:'native-onion-score',missionId:'one',score:750,maxScore:1000},joined.body.playerToken);assert.equal(scored.status,201);assert.equal(scored.body.standings.find(player=>player.playerName==='Native learner').score,750);
    // The gateway rejects this preflight without CORS authorization. The
    // renderer must therefore see a network failure, not the private API.
    await assert.rejects(()=>request('/api/import-file',{name:'blocked.txt',text:'must not import'}),/Failed to fetch/);
    const disabled=await page.evaluate(()=>window.asterloomDesktop.setTorEnabled(false));assert.equal(disabled.status,'disabled');assert.equal(disabled.proxyConfigured,false);
    assert.equal(await application.evaluate(({session},url)=>session.defaultSession.resolveProxy(url),onionExample),'PROXY 127.0.0.1:9');
    console.log('Verified native Tor IPC, onion-only proxy, renderer CORS/CSP, invitation join, score update and authoring isolation.');
  }finally{
    await application?.close().catch(()=>{});await remote?.close();await fs.rm(directory,{recursive:true,force:true});
    if(originSetting===undefined)delete process.env.LEARN_ALLOWED_ORIGINS;else process.env.LEARN_ALLOWED_ORIGINS=originSetting;
  }
});

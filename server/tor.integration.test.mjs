import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createService} from './index.mjs';

const run=promisify(execFile);
const enabled=process.env.ASTERLOOM_TOR_TEST==='1';
const binary=process.env.ASTERLOOM_TOR_BINARY||path.resolve(`desktop/vendor/tor/${process.platform}-${process.arch}/tor/${process.platform==='win32'?'tor.exe':'tor'}`);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('two independent Tor processes exchange an invitation and idempotent mission scores over an onion service',{skip:!enabled,timeout:360000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-tor-test-'));
  const services=[];let reportAt=0;
  try{
    for(const name of ['host','friend'])services.push(await createService({port:0,dataDir:path.join(directory,name),torBinary:binary,enableTor:true}));
    const [host,friend]=services;
    const deadline=Date.now()+240000;
    while(services.some(service=>service.torStatus().status!=='ready')&&Date.now()<deadline){
      if(Date.now()-reportAt>15000){console.log('Tor bootstrap:',...services.map(service=>`${service.torStatus().status} ${service.torStatus().bootstrap}%`));reportAt=Date.now();}
      await delay(1000);
    }
    for(const service of services)assert.equal(service.torStatus().status,'ready',`Tor did not become ready: ${service.torStatus().status} ${service.torStatus().bootstrap}%`);
    async function local(route,body,token){const response=await fetch(`http://127.0.0.1:${host.port}${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});assert.ok(response.ok);return response.json();}
    async function onion(route,body,token){
      const args=['--silent','--show-error','--fail-with-body','--max-time','30','--socks5-hostname',`127.0.0.1:${friend.torStatus().socksPort}`,'-H','Content-Type: application/json',...(token?['-H',`Authorization: Bearer ${token}`]:[]),...(body?['--data',JSON.stringify(body)]:[]),`http://${host.torStatus().hostname}${route}`];
      const {stdout}=await run('curl',args,{timeout:35000,maxBuffer:2*1024*1024});return JSON.parse(stdout);
    }
    let connected=false;const publishDeadline=Date.now()+60000;
    while(!connected&&Date.now()<publishDeadline){try{assert.equal((await onion('/api/health')).ok,true);connected=true;}catch{await delay(3000);}}
    assert.ok(connected,'The onion descriptor was not reachable from the second Tor process.');host.markTorReachable();
    const owner=await local('/api/rooms',{notebookId:'tor-check',notebookTitle:'Tor transport check',playerName:'Host',packHash:'matching-revision',missions:[{id:'mission',maxScore:1000}]});
    const joined=await onion('/api/rooms/join',{inviteCode:owner.inviteCode,playerName:'Friend',packHash:'matching-revision'});
    assert.equal(joined.standings.length,2);
    const result={eventId:'tor-event',missionId:'mission',score:850,maxScore:1000,correct:17,total:20};
    await onion(`/api/rooms/${owner.roomId}/results`,result,joined.playerToken);
    const duplicate=await onion(`/api/rooms/${owner.roomId}/results`,result,joined.playerToken);assert.equal(duplicate.deduplicated,true);
    const standings=await local(`/api/rooms/${owner.roomId}`,undefined,owner.playerToken);
    assert.equal(standings.standings.find(player=>player.playerName==='Friend').score,850);
    assert.equal(standings.standings.find(player=>player.playerName==='Friend').missionsCompleted,1);
    console.log('Verified: two Tor processes, onion HTTP, private invitation, authenticated score, deduplication, host standings.');
  }finally{await Promise.all(services.map(service=>service.close()));await fs.rm(directory,{recursive:true,force:true});}
});

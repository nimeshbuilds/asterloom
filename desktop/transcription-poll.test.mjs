import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {waitForTranscription} from './testing.mjs';

const completed={id:'speech-job',state:'complete',result:{text:'Verified spoken words.',segments:[{start:0,end:1,text:'Verified spoken words.'}]}};
const pageFor=jobs=>({async evaluate(){await new Promise(resolve=>setTimeout(resolve,2));return {status:200,body:{job:jobs.length>1?jobs.shift():jobs[0]}};}});
test('transcription polling awaits each status and returns its completed result',async()=>{
 const jobs=[{id:'speech-job',state:'queued'},{id:'speech-job',state:'transcribing'},completed];
 assert.deepEqual(await waitForTranscription(pageFor(jobs),'speech-job',{pollMs:1,timeoutMs:1000}),completed);
 assert.equal(jobs.length,1);
});
test('transcription polling reports terminal failures and rejects incomplete completion',async()=>{
 for(const state of ['error','canceled','interrupted'])await assert.rejects(waitForTranscription(pageFor([{id:'speech-job',state,error:{code:'MEDIA_PROCESS',message:'Decoder stopped.'}}]),'speech-job'),new RegExp(`Transcription ${state}.*Decoder stopped`));
 await assert.rejects(waitForTranscription(pageFor([{id:'speech-job',state:'complete'}]),'speech-job'),/Completed transcription has no valid result/);
 await assert.rejects(waitForTranscription(pageFor([{id:'speech-job',state:'transcribing'}]),'speech-job',{pollMs:1,timeoutMs:15}),/last state: transcribing/);
});
test('actual Chromium delayed fetch is repeatedly awaited until a result exists',{skip:process.env.ASTERLOOM_BROWSER_POLL_TEST!=='1'},async()=>{
 const browser=await chromium.launch();let polls=0;
 try{
  const page=await browser.newPage();
  await page.route('http://poll.test/**',async route=>{
   if(new URL(route.request().url()).pathname==='/'){await route.fulfill({contentType:'text/html',body:'<title>Transcription polling</title>'});return;}
   polls++;
   await new Promise(resolve=>setTimeout(resolve,25));
   await route.fulfill({contentType:'application/json',body:JSON.stringify({job:polls<3?{id:'speech-job',state:'transcribing'}:completed})});
  });
  await page.goto('http://poll.test/');
  const job=await waitForTranscription(page,'speech-job',{pollMs:5,timeoutMs:3000});
  assert.equal(polls,3);assert.deepEqual(job,completed);
 }finally{await browser.close();}
});

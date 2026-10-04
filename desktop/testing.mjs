import {promises as fs} from 'node:fs';
import path from 'node:path';

/** Playwright adds Electron flags itself, so use an isolated exec wrapper to
 * select the non-default universal slice without changing the app bundle. */
export async function nativeTestExecutable(binary,directory,arch=process.env.ASTERLOOM_SMOKE_ARCH){
  if(!arch)return binary;
  if(process.platform!=='darwin'||!['arm64','x64'].includes(arch)||!binary)throw new Error('An explicit Mac app and arm64 or x64 test architecture are required.');
  const wrapper=path.join(directory,`launch-${arch}.sh`);
  const quoted="'"+binary.replaceAll("'","'\\''")+"'";
  await fs.writeFile(wrapper,`#!/bin/sh\nexec /usr/bin/arch -${arch==='x64'?'x86_64':'arm64'} ${quoted} "$@"\n`,{mode:0o700});
  return wrapper;
}

/** Await each request in Node rather than passing an async predicate to
 * waitForFunction: Playwright's browser poller treats that Promise as truthy. */
export async function waitForTranscription(page,id,{timeoutMs=120000,pollMs=250}={}){
  const deadline=performance.now()+timeoutMs;
  let lastState='not requested';
  while(performance.now()<deadline){
    const response=await page.evaluate(async ({id,requestTimeoutMs})=>{
      const response=await fetch('/api/media/transcriptions/'+encodeURIComponent(id),{signal:AbortSignal.timeout(requestTimeoutMs)});
      return {status:response.status,body:await response.json()};
    },{id,requestTimeoutMs:Math.max(1,Math.min(10000,Math.ceil(deadline-performance.now())))});
    if(response.status!==200)throw new Error(`Transcription status HTTP ${response.status}: ${JSON.stringify(response.body)}`);
    const job=response.body?.job;
    if(!job||job.id!==id||typeof job.state!=='string')throw new Error(`Invalid transcription status: ${JSON.stringify(response.body)}`);
    lastState=job.state;
    if(['error','canceled','interrupted'].includes(job.state))throw new Error(`Transcription ${job.state}: ${JSON.stringify(job.error??job.message??job)}`);
    if(job.state==='complete'){
      if(!job.result||typeof job.result.text!=='string'||!Array.isArray(job.result.segments))throw new Error(`Completed transcription has no valid result: ${JSON.stringify(job)}`);
      return job;
    }
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,Math.min(pollMs,deadline-performance.now()))));
  }
  throw new Error(`Transcription ${id} did not complete within ${timeoutMs} ms; last state: ${lastState}`);
}

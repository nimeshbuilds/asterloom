// Isolated integration fixture: real local routes and Claude adapter, synthetic
// child process only. It never launches, installs, or signs into a real engine.
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createClaudeConnection} from '../server/claude-engine.mjs';
import {createService} from '../server/index.mjs';

export async function claudeBrowserFixture({distDir,code='synthetic-browser-code#synthetic-state',holdCode=false,rejectCode=false,loginTimeout=30000,emitLoginUrl=true}={}){
 const dataDir=await mkdtemp(path.join(tmpdir(),'asterloom-claude-browser-'));
 const binary=Buffer.from('inert test executable; never launched'),runtime=path.join(dataDir,'engines/claude/runtime');
 await mkdir(runtime,{recursive:true});await writeFile(path.join(runtime,'claude'),binary);
 const calls=[];let loggedIn=false;
 const spawnProcess=(exe,args,options)=>{
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();let input='';
  const finish=status=>{if(child.exitCode!==null||child.signalCode!==null)return;child.exitCode=status;child.emit('close',status);};
  child.stdin=new Writable({write(chunk,_encoding,done){input+=chunk.toString();if(args[1]==='login'&&input.endsWith('\n'))queueMicrotask(()=>{if(holdCode)return;child.stdout.write('CLI echoes '+input);child.stderr.write('Private CLI diagnostic '+input);loggedIn=!rejectCode&&input.trim()===code;finish(loggedIn?0:1);});done();}});
  child.kill=signal=>{if(child.exitCode!==null||child.signalCode!==null)return false;child.signalCode=signal;child.emit('close',null,signal);return true;};
  calls.push({exe,args,options,child,input:()=>input});
  queueMicrotask(()=>{
   if(args.join(' ')==='auth status'){child.stdout.write(JSON.stringify({loggedIn,authMethod:loggedIn?'claude.ai':'none',configDirectory:path.join(dataDir,'engines/claude/account')}));finish(loggedIn?0:1);}
   else if(args[0]==='auth'&&args[1]==='login'){if(emitLoginUrl)child.stdout.write('Open https://claude.com/cai/oauth/authorize?state=synthetic-state\n');child.stdout.write('Paste code here if prompted > ');}
   else throw new Error('Unexpected fixture command: '+args.join(' '));
  });return child;
 };
 const claude=await createClaudeConnection({dataDir,platform:'darwin',artifact:{bytes:binary.length,sha256:createHash('sha256').update(binary).digest('hex')},spawnProcess,fetcher:()=>{throw new Error('Network forbidden in auth fixture');},timeouts:{login:loginTimeout,command:500}});
 const other=id=>({status:async()=>({id,enabled:false,installed:false,installing:false,pending:false,connected:false}),close:async()=>{}});
 let service;
 try{service=await createService({port:0,dataDir,distDir,engineConnections:{claude,codex:other('codex'),grok:other('grok')}});}catch(error){await claude.close();await rm(dataDir,{recursive:true,force:true});throw error;}
 return{address:`http://127.0.0.1:${service.port}`,calls,claude,code,publishLoginUrl:()=>{const login=calls.findLast(call=>call.args[1]==='login'&&call.child.exitCode===null&&call.child.signalCode===null);if(!login)throw new Error('No live synthetic login');login.child.stdout.write('Open https://claude.com/cai/oauth/authorize?state=synthetic-state\n');},close:async()=>{await service.close();await rm(dataDir,{recursive:true,force:true});}};
}

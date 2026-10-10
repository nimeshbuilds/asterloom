import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {createClaudeConnection,claudeArtifact,claudeEnvironment,claudeLoginURL,parseClaudeResult} from './claude-engine.mjs';
import {boundedOutputSchema,assertStructuredOutput} from './output-schema.mjs';
const binary=Buffer.from('inert mock Claude Code executable'),hash=createHash('sha256').update(binary).digest('hex');const artifact={url:'https://downloads.claude.ai/test/claude',bytes:binary.length,sha256:hash,downloadBytes:binary.length,downloadSha256:hash};
const draftSchema={type:'object',properties:{title:{$ref:'#/$defs/title'},count:{type:'integer',minimum:1,maximum:3}},required:['title','count'],additionalProperties:false,$defs:{title:{type:'string',minLength:1,maxLength:40}}};
test('Claude structured output is forwarded as a snapshotted schema and extracted independently of result prose',async t=>{
 const structured_output={title:'Source lesson',count:2},schema=structuredClone(draftSchema),expected=structuredClone(schema);
 const x=await setup(t,{generationOutput:JSON.stringify({type:'result',subtype:'success',result:'',structured_output,usage:{input_tokens:2,output_tokens:3,cache_creation_input_tokens:7},modelUsage:{'resolved-haiku':{}},stop_reason:'tool_use'})});await x.connection.start();
 const pending=x.connection.generate({prompt:'source',model:'haiku',outputSchema:schema});schema.properties.count.maximum=1;
 const result=await pending,call=x.calls.find(c=>c.args.includes('--print'));
 assert.deepEqual(JSON.parse(call.args[call.args.indexOf('--json-schema')+1]),expected);assert.deepEqual(JSON.parse(result.text),structured_output);assert.equal(result.usage.cache_creation_input_tokens,7);assert.deepEqual(result.actualModels,['resolved-haiku']);assert.equal(result.finishReason,'structured_output');assert.equal(call.args[call.args.indexOf('--tools')+1],'');assert.equal(call.args[call.args.indexOf('--allowedTools')+1],'StructuredOutput');assert.equal(call.args[call.args.indexOf('--disallowedTools')+1],'mcp__*');assert.equal(call.args[call.args.indexOf('--max-turns')+1],'3');
});
test('Claude structured requests never fall back to text, malformed objects, extra fields or schema violations and retain usage',()=>{
 for(const structured_output of [undefined,null,'{"title":"looks valid","count":2}',{title:'missing count'},{title:'bad bound',count:4},{title:'extra',count:2,unexpected:true}]){
  assert.throws(()=>parseClaudeResult(JSON.stringify({type:'result',subtype:'success',result:'{"title":"valid prose fallback","count":2}',structured_output,usage:{input_tokens:4,output_tokens:5,cache_read_input_tokens:0,cache_creation_input_tokens:0}}),draftSchema),error=>error.code==='PROVIDER_INVALID_RESPONSE'&&error.aiUsage.inputTokens===4&&error.aiUsage.outputTokens===5);
 }
 const raw={type:'result',subtype:'success',result:'unfinished tool message',structured_output:{title:'Valid',count:2},stop_reason:'tool_use'};
 assert.throws(()=>parseClaudeResult(JSON.stringify(raw)),error=>error.code==='PROVIDER_INVALID_RESPONSE');
 assert.throws(()=>parseClaudeResult(JSON.stringify({...raw,structured_output:undefined}),draftSchema),error=>error.code==='PROVIDER_INVALID_RESPONSE');
 assert.throws(()=>parseClaudeResult(JSON.stringify({...raw,permission_denials:[{tool_name:'Bash'}]}),draftSchema),/unavailable tool/);
});
test('Claude rejects unsupported or unbounded schemas before auth or provider work',async t=>{
 const x=await setup(t);const deep={};let child=deep;for(let i=0;i<40;i++)child=child.nested={};
 for(const outputSchema of [null,[],{$ref:'https://example.invalid/schema'},{$ref:'#/$defs/missing'},deep,{description:'x'.repeat(65537)},{type:'object',unknownAssertion:true},{type:'string',pattern:'(a+)+$'},{type:'unknown'},{required:[42]}]){
  await assert.rejects(x.connection.generate({prompt:'source',model:'haiku',outputSchema}),error=>error.code==='INVALID_REQUEST'&&error.status===400);
 }
 assert.equal(x.calls.length,0);
});
test('known Claude formatter limits are invalid-response errors rather than account failures and retain telemetry',async t=>{
 for(const subtype of ['error_max_structured_output_retries','error_max_turns']){
  const raw={type:'result',subtype,is_error:true,stop_reason:'tool_use',errors:['private provider diagnostic'],usage:{input_tokens:4,output_tokens:5,cache_read_input_tokens:2,cache_creation_input_tokens:3},modelUsage:{'claude-haiku-4-5-20251001':{}}};
  const x=await setup(t,{generationExitCode:1,generationOutput:JSON.stringify(raw)});await x.connection.start();
  await assert.rejects(x.connection.generate({prompt:'source',model:'haiku',outputSchema:draftSchema}),error=>{assert.equal(error.code,'PROVIDER_INVALID_RESPONSE');assert.equal(error.aiUsage.totalTokens,14);assert.deepEqual(error.actualModels,['claude-haiku-4-5-20251001']);assert.match(error.message,/formatter|structured-output turn/);assert.doesNotMatch(error.message,/private|sign-in|model access/);return true;});
 }
 const x=await setup(t,{generationExitCode:1,generationOutput:JSON.stringify({type:'result',subtype:'unknown_provider_error',is_error:true,errors:['private diagnostic']})});await x.connection.start();await assert.rejects(x.connection.generate({prompt:'source',model:'haiku',outputSchema:draftSchema}),error=>error.code!=='PROVIDER_INVALID_RESPONSE');
});
test('the bounded schema vocabulary validates nullable alternatives, arrays, identifiers and local references',()=>{
 const schema=boundedOutputSchema({type:'object',properties:{rows:{anyOf:[{type:'null'},{type:'array',minItems:1,maxItems:2,items:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]*$'}}]}},required:['rows'],additionalProperties:false});
 for(const rows of [null,['a'],['a','b']])assert.doesNotThrow(()=>assertStructuredOutput({rows},schema));
 for(const rows of [[],['1bad'],['a','b','c'],[2]])assert.throws(()=>assertStructuredOutput({rows},schema),error=>error.code==='PROVIDER_INVALID_RESPONSE');
});
async function setup(t,{holdLogin=false,holdGeneration=false,badResult=false,authPathMismatch=false,generationExitCode=0,generationOutput,loginCode,codeRejected=false,echoCode=false,loginTimeout=3000,emitLoginUrl=true}={}){const dataDir=await mkdtemp(path.join(tmpdir(),'asterloom-claude-test-')),base=path.join(dataDir,'engines/claude'),account=path.join(base,'account');await mkdir(path.join(base,'runtime'),{recursive:true});await writeFile(path.join(base,'runtime/claude'),binary);let loggedIn=false;const calls=[];
const spawnProcess=(exe,args,options)=>{const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();let input='';child.stdin=new Writable({write(chunk,_e,done){input+=chunk.toString();if(args[0]==='auth'&&args[1]==='login'&&loginCode&&input.endsWith('\n'))queueMicrotask(()=>{if(echoCode){child.stdout.write('Echo '+input);child.stderr.write('Private diagnostic '+input);}if(input.trim()===loginCode&&!codeRejected){loggedIn=true;finish(0);}else finish(1);});done();},final(done){if(args.includes('--print')&&!holdGeneration)queueMicrotask(()=>{child.stdout.write(generationOutput??JSON.stringify(badResult?{type:'result',subtype:'error_max_turns',is_error:true,result:'partial'}:{type:'result',subtype:'success',is_error:false,result:'A verified source draft.',usage:{input_tokens:10,output_tokens:6},modelUsage:{'claude-provider-model':{}},stop_reason:'end_turn'}));finish(generationExitCode);});done();}});const finish=code=>{if(child.exitCode!==null||child.signalCode!==null)return;child.exitCode=code;child.emit('close',code);};child.kill=signal=>{if(child.exitCode!==null||child.signalCode!==null)return;child.signalCode=signal;child.emit('close',null,signal);return true;};child.finish=finish;calls.push({exe,args,options,child,input:()=>input});queueMicrotask(()=>{if(args.join(' ')==='auth status'){child.stdout.write(JSON.stringify({loggedIn,authMethod:loggedIn?'claude.ai':'none',configDirectory:authPathMismatch?'/some/other/account':account}));finish(loggedIn?0:1);}else if(args[0]==='auth'&&args[1]==='login'){if(emitLoginUrl)child.stdout.write('Open https://claude.com/cai/oauth/authorize?state=example\n');if(!holdLogin){loggedIn=true;finish(0);}}else if(args.join(' ')==='auth logout'){loggedIn=false;finish(0);}});return child;};
const connection=await createClaudeConnection({dataDir,platform:'darwin',artifact,spawnProcess,fetcher:async()=>new Response(binary),timeouts:{command:100,generate:200,login:loginTimeout}});t.after(async()=>{await connection.close();await rm(dataDir,{recursive:true,force:true});});return {connection,calls,dataDir,account};}

test('Claude manifests preserve official versions and auth is isolated without disabling built-in methods',()=>{assert.ok(claudeArtifact('darwin','arm64'));assert.ok(claudeArtifact('darwin','x64'));assert.ok(claudeArtifact('win32','x64'));const env=claudeEnvironment('/private/claude','/private/work','darwin');assert.equal(env.CLAUDE_CONFIG_DIR,'/private/claude');assert.equal(env.ANTHROPIC_CONFIG_DIR,path.join('/private/claude','anthropic'));assert.equal(env.ANTHROPIC_API_KEY,undefined);assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN,undefined);assert.equal(env.DISABLE_LOGIN_COMMAND,undefined);assert.equal(env.CLAUDE_CODE_SIMPLE,undefined);assert.equal(claudeLoginURL('https://claude.com/cai/oauth/authorize?x=1'),'https://claude.com/cai/oauth/authorize?x=1');assert.equal(claudeLoginURL('https://claude.com@evil.example/'),null);});
test('official auth status controls connection; private path mismatches fail closed',async t=>{const{connection,calls}=await setup(t);assert.equal((await connection.status()).connected,false);await connection.start();assert.equal((await connection.status()).connectionState,'signed-in');await connection.disconnect();assert.equal((await connection.status()).connected,false);assert.ok(calls.some(c=>c.args.join(' ')==='auth logout'));const bad=await setup(t,{authPathMismatch:true});await bad.connection.start();assert.equal((await bad.connection.status()).connected,false);assert.match((await bad.connection.status()).error,/private|confirm/);});
test('each native login mode is available and canceled responses cannot reconnect the adapter',async t=>{const{connection,calls}=await setup(t,{holdLogin:true});for(const method of ['claudeai','console','sso']){const s=await connection.start({method});assert.equal(s.pending,true);assert.equal(new URL(s.authUrl).hostname,'claude.com');const login=calls.at(-1);assert.deepEqual(login.args,['auth','login',...(method==='claudeai'?[]:[`--${method}`])]);await connection.cancel();login.child.emit('close',0);assert.equal((await connection.status()).connected,false);}await assert.rejects(connection.start({method:'shell --arbitrary'}),/supported/);});
test('browser-return code completes the exact live SSO login through stdin and never returns its echoed secret',async t=>{
 const code='synthetic-browser-approval#session-state',x=await setup(t,{holdLogin:true,loginCode:code,echoCode:true}),started=await x.connection.start({method:'sso'});
 assert.equal(started.loginContinuation.state,'awaiting-code');assert.ok(Date.parse(started.loginContinuation.expiresAt)>Date.now());
 const login=x.calls.find(call=>call.args[1]==='login');assert.deepEqual(login.args,['auth','login','--sso']);
 const result=await x.connection.continueLogin({sessionId:started.loginContinuation.sessionId,code:' '+code+'\n'});
 assert.equal(login.input(),code+'\n');assert.equal(result.connected,true);assert.equal(result.connectionState,'signed-in');assert.equal(result.loginContinuation,undefined);
 assert.ok(!JSON.stringify(result).includes(code));assert.ok(!JSON.stringify(await x.connection.status()).includes(code));assert.ok(!JSON.stringify(login.args).includes(code));
 assert.ok(!JSON.stringify(login.options.env).includes(code));await assert.rejects(x.connection.continueLogin({sessionId:started.loginContinuation.sessionId,code}),/ended|changed/);
});
test('old, canceled and replaced Claude sessions cannot forward a browser code to another process',async t=>{
 const x=await setup(t,{holdLogin:true}),first=await x.connection.start(),old=x.calls.find(call=>call.args[1]==='login'),second=await x.connection.start({method:'sso'}),next=x.calls.filter(call=>call.args[1]==='login').at(-1);
 assert.notEqual(first.loginContinuation.sessionId,second.loginContinuation.sessionId);assert.ok(old.child.signalCode);
 await assert.rejects(x.connection.continueLogin({sessionId:first.loginContinuation.sessionId,code:'synthetic-old-code'}),/ended|changed/);assert.equal(next.input(),'');
 await x.connection.cancel();await assert.rejects(x.connection.continueLogin({sessionId:second.loginContinuation.sessionId,code:'synthetic-new-code'}),/ended|changed/);assert.equal(next.input(),'');
});
test('duplicate continuation is refused and errors never echo browser codes',async t=>{
 const x=await setup(t,{holdLogin:true}),started=await x.connection.start(),code='synthetic-approval-code';
 const first=x.connection.continueLogin({sessionId:started.loginContinuation.sessionId,code});
 await assert.rejects(x.connection.continueLogin({sessionId:started.loginContinuation.sessionId,code}),/already sent/);
 assert.equal((await first).loginContinuation.state,'submitting');assert.equal(x.calls.find(call=>call.args[1]==='login').input(),code+'\n');
 const bad=await setup(t,{holdLogin:true,loginCode:code,codeRejected:true,echoCode:true}),login=await bad.connection.start();
 const rejected=await bad.connection.continueLogin({sessionId:login.loginContinuation.sessionId,code});assert.equal(rejected.connected,false);assert.equal(rejected.pending,false);assert.match(rejected.error,/expired|incomplete/);assert.ok(!JSON.stringify(rejected).includes(code));
});
test('expired logins clear continuation and never accept setup tokens, URLs or multiline input',async t=>{
 const x=await setup(t,{holdLogin:true}),started=await x.connection.start();
 for(const code of ['','line-one\nline-two','https://claude.ai/login?code=secret','sk-ant-oat01-long-lived-setup-token','sk-ant-api03-secret','x'.repeat(8193)])await assert.rejects(x.connection.continueLogin({sessionId:started.loginContinuation.sessionId,code}),/Paste only/);
 assert.equal(x.calls.find(call=>call.args[1]==='login').input(),'');
 const expired=await setup(t,{holdLogin:true,loginTimeout:20}),status=await expired.connection.start();assert.equal(status.pending,false);assert.equal(status.loginContinuation,undefined);assert.match(status.error,/expired/);
 await assert.rejects(expired.connection.continueLogin({sessionId:started.loginContinuation.sessionId,code:'synthetic-code'}),/ended|changed/);
});
test('draft invokes the unmodified CLI with source on stdin, safe mode, no tools, output cap, no token proxy',async t=>{const{connection,calls,dataDir}=await setup(t);await connection.start();const source='Untrusted data: $(touch /tmp/not-an-instruction).';const result=await connection.generate({model:'sonnet',prompt:source,system:'Return a JSON draft.',maxOutputTokens:750});assert.equal(result.text,'A verified source draft.');assert.equal(result.provider,'claude-code');assert.deepEqual(result.actualModels,['claude-provider-model']);const invocation=calls.find(c=>c.args.includes('--print'));assert.equal(invocation.input(),source);assert.ok(!invocation.args.includes(source));assert.ok(invocation.args.includes('--safe-mode'));assert.ok(!invocation.args.includes('--bare'));assert.equal(invocation.args[invocation.args.indexOf('--tools')+1],'');assert.ok(invocation.args.includes('--no-session-persistence'));assert.equal(invocation.options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,'750');assert.equal(invocation.options.shell,false);assert.equal((await readdir(path.join(dataDir,'engines/claude/workspace'))).length,0);assert.equal((await connection.status()).connectionState,'verified');});
test('model list is honest aliases and unsupported credentials are never collected',async t=>{const{connection}=await setup(t);const models=await connection.models();assert.equal(models.source,'official-cli-aliases');assert.equal(models.entitlementVerified,false);assert.ok(models.models.some(x=>x.id==='default'));await assert.rejects(connection.generate({prompt:'source',model:'sonnet'}),/Connect/);await connection.start();await assert.rejects(connection.generate({prompt:'source',model:'--exec command'}),/valid/);await assert.rejects(connection.generate({prompt:'source',model:'sonnet',system:'x'.repeat(40001)}),/40 KB/);});
test('partial results and permission denials never become successful drafts; cancellation is bounded',async t=>{assert.throws(()=>parseClaudeResult('{"type":"result","subtype":"success","result":"partial","stop_reason":"max_tokens"}'),e=>e.code==='PROVIDER_TRUNCATED');assert.throws(()=>parseClaudeResult('{"type":"result","subtype":"success","result":"text","permission_denials":[{"tool_name":"Bash"}]}'),/unavailable/);const bad=await setup(t,{badResult:true});await bad.connection.start();await assert.rejects(bad.connection.generate({model:'sonnet',prompt:'source'}),/complete/);const slow=await setup(t,{holdGeneration:true});await slow.connection.start();const drafting=slow.connection.generate({model:'sonnet',prompt:'source'}),rejected=assert.rejects(drafting,/canceled/);await new Promise(r=>setTimeout(r,10));await slow.connection.cancel();await rejected;});

test('nonzero CLI exits preserve only numeric usage from structured final results',async t=>{
 const usage={input_tokens:100,output_tokens:80,cache_read_input_tokens:20,cache_creation_input_tokens:0,private:'secret-token'};
 for(const final of [{type:'result',subtype:'success',result:'private source text',usage},{type:'result',subtype:'error_max_turns',is_error:true,result:'private diagnostic text',usage}]){
  const {connection}=await setup(t,{generationExitCode:1,generationOutput:JSON.stringify(final)});await connection.start();
  await assert.rejects(connection.generate({model:'sonnet',prompt:'private source'}),error=>{assert.equal(error.aiUsage.status,'reported');assert.equal(error.aiUsage.inputTokens,120);assert.equal(error.aiUsage.outputTokens,80);assert.equal(error.aiUsage.totalTokens,200);assert.ok(!JSON.stringify({message:error.message,usage:error.aiUsage}).includes('private'));assert.ok(!JSON.stringify(error.aiUsage).includes('secret-token'));return true;});
 }
 for(const generationOutput of ['malformed private output',JSON.stringify({type:'diagnostic',usage}),JSON.stringify({type:'result',subtype:'error_max_turns'})]){
  const {connection}=await setup(t,{generationExitCode:1,generationOutput});await connection.start();
  await assert.rejects(connection.generate({model:'sonnet',prompt:'source'}),error=>{assert.equal(error.aiUsage.status,'unavailable');assert.equal(error.aiUsage.inputTokens,null);assert.equal(error.aiUsage.outputTokens,null);assert.equal(error.aiUsage.totalTokens,null);return true;});
 }
});

test('all Claude executable pins derive from the retained vendor-signed release manifest',async()=>{
 const openpgp=await import('openpgp'),base=new URL('./fixtures/claude-release/',import.meta.url);
 const key=await openpgp.readKey({armoredKey:await readFile(new URL('claude-code.asc',base),'utf8')});
 assert.equal(key.getFingerprint().toUpperCase(),'31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE');
 const bytes=await readFile(new URL('manifest.json',base)),signature=await openpgp.readSignature({armoredSignature:await readFile(new URL('manifest.json.sig',base),'utf8')});
 const verification=await openpgp.verify({message:await openpgp.createMessage({binary:bytes}),signature,verificationKeys:key});
 assert.equal(verification.signatures.length,1);await verification.signatures[0].verified;
 const manifest=JSON.parse(bytes),lock=JSON.parse(await readFile(new URL('./claude-runtime.lock.json',import.meta.url),'utf8'));
 assert.equal(manifest.version,lock.version);
 for(const [platform,artifact] of Object.entries(lock.artifacts)){const signed=manifest.platforms[platform];assert.equal(artifact.sha256,signed.checksum);assert.equal(artifact.downloadSha256,signed.checksum);assert.equal(artifact.bytes,signed.size);assert.equal(artifact.downloadBytes,signed.size);assert.equal(artifact.url,`https://downloads.claude.ai/claude-code-releases/${manifest.version}/${platform}/${signed.binary}`);}
});

test('Claude request-owned cancellation stops the print child and keeps the account connected',async t=>{const x=await setup(t,{holdGeneration:true});await x.connection.start();const controller=new AbortController(),answer=x.connection.generate({model:'sonnet',prompt:'source'},{signal:controller.signal});const rejected=assert.rejects(answer,/Canceled by caller/);for(let i=0;i<30&&!x.calls.some(c=>c.args.includes('--print'));i++)await new Promise(r=>setTimeout(r,2));controller.abort(new Error('Canceled by caller'));await rejected;assert.ok(x.calls.find(c=>c.args.includes('--print')).child.signalCode);assert.equal((await x.connection.status()).connected,true);});

test('Claude exposes and accepts the active code session before any browser URL is emitted',async t=>{
 const code='synthetic-code-without-url',x=await setup(t,{holdLogin:true,emitLoginUrl:false,loginCode:code}),started=await x.connection.start({method:'sso'});
 assert.equal(started.pending,true);assert.equal(started.authUrl,undefined);assert.equal(started.loginContinuation.state,'awaiting-code');assert.deepEqual((await x.connection.status()).loginContinuation,started.loginContinuation);
 const result=await x.connection.continueLogin({sessionId:started.loginContinuation.sessionId,code});assert.equal(result.connected,true);assert.equal(result.loginContinuation,undefined);assert.equal(x.calls.find(call=>call.args[1]==='login').input(),code+'\n');
});

import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {zipSync,strToU8} from 'fflate';
import ExcelJS from 'exceljs';
import {createService,importFile,isPublicIp} from './index.mjs';

let directory, service, base, host;
before(async()=>{
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-service-test-'));
  service=await createService({port:0,dataDir:directory,distDir:path.join(directory,'dist')});
  base=`http://127.0.0.1:${service.port}`;host=`127.0.0.1:${service.port}`;
});
after(async()=>{await service?.close();await fs.rm(directory,{recursive:true,force:true});});
async function post(route,input,token,headers={}) {
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},body:JSON.stringify(input)});
  return {status:response.status,data:await response.json()};
}
async function get(route,token) {const response=await fetch(base+route,{headers:token?{Authorization:`Bearer ${token}`}:{}});return {status:response.status,data:await response.json()};}

test('public address policy rejects private, metadata, mapped and documentation networks',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','192.168.2.10','172.16.2.1','169.254.169.254','100.64.2.3','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1','192.0.2.2','203.0.113.2','198.51.100.2']) assert.equal(isPublicIp(ip),false,ip);
  assert.equal(isPublicIp('8.8.8.8'),true);assert.equal(isPublicIp('2606:4700:4700::1111'),true);
});
test('health truthfully distinguishes text extraction from media transcript assistance',async()=>{
  const result=await get('/api/health');assert.equal(result.status,200);assert.equal(result.data.capabilities.automaticTranscription,false);assert.equal(result.data.capabilities.formats.mp4,'attachment-needs-transcript');assert.equal(result.data.capabilities.tor.reachabilityVerified,false);
});
test('host and browser-origin checks reject rebinding and foreign pages',async()=>{
  const origin=await fetch(base+'/api/health',{headers:{Origin:'https://attacker.example'}});assert.equal(origin.status,403);
  const rebind=await new Promise((resolve,reject)=>{const request=http.get(base+'/api/health',{headers:{Host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});assert.equal(rebind,403);
  const legitimate=await fetch(base+'/api/health',{headers:{Origin:'http://localhost:5173'}});assert.equal(legitimate.status,200);assert.equal(legitimate.headers.get('access-control-allow-origin'),'http://localhost:5173');
});
test('onion gateway blocks authoring and room creation even with a forged localhost Host header',async()=>{
  const relay=`http://127.0.0.1:${service.onionGatewayPort}`;
  for(const route of ['/','/api/import-url','/api/import-file','/api/generate','/api/rooms','/api/tor/status']){
    const reply=await fetch(relay+route,{method:'POST',headers:{Host:'127.0.0.1','Content-Type':'application/json'},body:'{}'});
    assert.equal(reply.status,403);assert.equal((await reply.json()).code,'ROOM_RELAY_ONLY');
  }
  assert.equal((await fetch(relay+'/api/health')).status,200);
  const room=await post('/api/rooms',{notebookId:'gateway-notebook',playerName:'Host',packHash:'gateway',missions:[{id:'one',maxScore:1000}]});
  const joined=await fetch(relay+'/api/rooms/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteCode:room.data.inviteCode,packHash:'gateway',playerName:'Friend'})});
  assert.equal(joined.status,201);const friend=await joined.json();
  assert.equal((await fetch(`${relay}/api/rooms/${room.data.roomId}`)).status,401);
  const standings=await fetch(`${relay}/api/rooms/${room.data.roomId}`,{headers:{Authorization:`Bearer ${friend.playerToken}`}});assert.equal(standings.status,200);assert.equal((await standings.json()).standings.length,2);
});
test('JSON-only mutation endpoints reject malformed input without reflecting source text',async()=>{
  const missing=await fetch(base+'/api/import-file',{method:'POST',body:'secret-private-text'});assert.equal(missing.status,415);
  const nullInput=await post('/api/import-file',null);assert.equal(nullInput.status,400);
  const invalid=await post('/api/import-file',{name:'bad.txt',dataBase64:'not base64!'});assert.equal(invalid.status,400);
});
test('text import retains provenance and stable checksum',async()=>{
  const result=await post('/api/import-file',{name:'Networking.md',text:'# DNS\nDNS maps names to IP addresses.'});
  assert.equal(result.status,200);assert.equal(result.data.source.kind,'text');assert.match(result.data.source.content,/DNS maps/);assert.equal(result.data.source.metadata.sha256.length,64);assert.equal(result.data.source.metadata.filename,'Networking.md');
});
test('HTML import excludes executable and navigation content',async()=>{
  const result=await post('/api/import-file',{name:'source.html',text:'<html><head><title>Rain</title><script>stealSecrets()</script></head><body><nav>Account menu</nav><main><h1>Water</h1><p>Rain is precipitation.</p></main></body></html>'});
  assert.equal(result.status,200);assert.match(result.data.source.content,/Rain is precipitation/);assert.doesNotMatch(result.data.source.content,/stealSecrets|Account menu/);
});
test('captions import removes timing metadata and retains spoken text',async()=>{
  const result=await importFile({name:'lesson.vtt',text:'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<b>A router forwards packets.</b>\n'});
  assert.equal(result.source.content,'A router forwards packets.');
});
test('media is accepted honestly with a transcript requirement',async()=>{
  const result=await post('/api/import-file',{name:'lecture.mp4',dataBase64:Buffer.from('media fixture').toString('base64')});
  assert.equal(result.status,200);assert.equal(result.data.needsTranscript,true);assert.equal(result.data.source.content,'');assert.equal(result.data.source.kind,'media');
});
test('JSON validation, empty sources and unsupported types fail actionably',async()=>{
  assert.equal((await post('/api/import-file',{name:'bad.json',text:'{oops'})).status,422);
  assert.equal((await post('/api/import-file',{name:'empty.txt',text:''})).status,400);
  assert.equal((await post('/api/import-file',{name:'program.exe',text:'abc'})).status,415);
});
test('NotebookLM, YouTube and Drive URLs use explicit assisted import paths',async()=>{
  for(const [url,kind] of [['https://notebooklm.google.com/notebook/example','notebooklm'],['https://youtu.be/example','youtube'],['https://docs.google.com/document/example','google-drive']]) {
    const result=await post('/api/import-url',{url});assert.equal(result.status,200);assert.equal(result.data.needsAssistance,true);assert.equal(result.data.kind,kind);assert.equal(result.data.source,undefined);
  }
});
test('URL importer rejects file, private and metadata URLs before requesting them',async()=>{
  for(const url of ['file:///etc/passwd','http://127.0.0.1:4319/api/health','http://169.254.169.254/','http://[::1]/','http://localhost/']) {
    const result=await post('/api/import-url',{url});assert.equal(result.status,400,url);
  }
});
test('provider validation rejects unsupported providers and empty keys without making requests',async()=>{
  assert.equal((await post('/api/generate',{provider:'not-supported'})).status,400);
  assert.equal((await post('/api/generate',{provider:'openai',model:'test',prompt:'hello'})).status,400);
});
test('rooms isolate tokens, validate mission limits, deduplicate retries and rank mission bests',async()=>{
  const creator=await post('/api/rooms',{notebookId:'pack1',notebookTitle:'Networks',packHash:'revision-one',playerName:'Ari',missions:[{id:'dns',maxScore:100},{id:'routing',maxScore:100}]});
  assert.equal(creator.status,201);assert.ok(creator.data.inviteCode);assert.equal(creator.data.trust,'friendly-self-reported');
  const room=creator.data;assert.equal((await post('/api/rooms/join',{inviteCode:room.inviteCode,playerName:'Bo',packHash:'revision-two'})).status,409);
  const joiner=await post('/api/rooms/join',{inviteCode:room.inviteCode,playerName:'Bo',packHash:'revision-one'});assert.equal(joiner.status,201);
  assert.equal((await get(`/api/rooms/${room.roomId}`)).status,401);
  assert.equal((await get(`/api/rooms/${room.roomId}`,'bad-token')).status,403);
  assert.equal((await post('/api/rooms/join',{inviteCode:room.inviteCode+'bad',playerName:'Eve'})).status,404);
  const route=`/api/rooms/${room.roomId}/results`;
  const event={eventId:'one',missionId:'dns',score:80,maxScore:100,correct:4,total:5,durationMs:1000};
  assert.equal((await post(route,event,room.playerToken)).status,201);
  const retry=await post(route,event,room.playerToken);assert.equal(retry.status,200);assert.equal(retry.data.deduplicated,true);
  await post(route,{...event,eventId:'two',score:60},room.playerToken);
  await post(route,{...event,eventId:'three',score:90},room.playerToken);
  await post(route,{...event,eventId:'four',score:100},joiner.data.playerToken);
  const standings=(await get(`/api/rooms/${room.roomId}`,room.playerToken)).data;
  assert.equal(standings.standings[0].playerName,'Bo');assert.equal(standings.standings[0].score,100);assert.equal(standings.standings[1].score,90);assert.equal(standings.standings[1].missionsCompleted,1);
  assert.equal((await post(route,{...event,eventId:'over',score:101},room.playerToken)).status,400);
  assert.equal((await post(route,{...event,eventId:'wrong',missionId:'fake'},room.playerToken)).status,400);
  assert.equal((await post(route,{...event,eventId:'bound',maxScore:1000},room.playerToken)).status,400);
  const stored=await fs.readFile(path.join(directory,'rooms.json'),'utf8');assert.ok(!stored.includes(room.playerToken));assert.ok(!stored.includes(room.inviteCode.split('.')[1]));assert.ok(!JSON.stringify(standings).includes('tokenHash'));
});
test('authenticated SSE delivers a revision update after another player joins',async()=>{
  const created=await post('/api/rooms',{notebookId:'events-pack',playerName:'Host'});const room=created.data;
  const controller=new AbortController();
  const response=await fetch(`${base}/api/rooms/${room.roomId}/events`,{headers:{Authorization:`Bearer ${room.playerToken}`},signal:controller.signal});
  const reader=response.body.getReader();
  try{
    const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/"revision":1/);
    await post('/api/rooms/join',{inviteCode:room.inviteCode,playerName:'Friend'});
    const timer=setTimeout(()=>controller.abort(),2000);
    try{const update=await reader.read();assert.match(new TextDecoder().decode(update.value),/"revision":2/);}finally{clearTimeout(timer);}
  }finally{await reader.cancel();controller.abort();}
});
test('room state and player authorization survive server restart',async()=>{
  const first=await post('/api/rooms',{notebookId:'restart-pack',playerName:'June'});const room=first.data;
  await post(`/api/rooms/${room.roomId}/results`,{eventId:'saved',missionId:'one',score:42,maxScore:100},room.playerToken);
  await service.close();service=await createService({port:0,dataDir:directory,distDir:path.join(directory,'dist')});base=`http://127.0.0.1:${service.port}`;
  const restored=await get(`/api/rooms/${room.roomId}`,room.playerToken);assert.equal(restored.status,200);assert.equal(restored.data.standings[0].score,42);
});
test('production static serving supports app routes and prevents traversal',async()=>{
  const dist=path.join(directory,'dist');await fs.mkdir(dist);await fs.writeFile(path.join(dist,'index.html'),'<html><body>Asterloom</body></html>');
  const index=await fetch(base+'/library');assert.equal(index.status,200);assert.match(await index.text(),/Asterloom/);
  const traversal=await fetch(base+'/%2e%2e%2frooms.json');assert.equal(traversal.status,403);
  const missing=await fetch(base+'/missing.js');assert.equal(missing.status,404);
});
test('DOCX and PPTX imports extract real Office XML into usable source text',async()=>{
  const word=zipSync({
    '[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml':strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>A router forwards packets between networks.</w:t></w:r></w:p></w:body></w:document>'),
  });
  const docx=await post('/api/import-file',{name:'network.docx',dataBase64:Buffer.from(word).toString('base64')});
  assert.equal(docx.status,200,JSON.stringify(docx.data));assert.match(docx.data.source.content,/router forwards packets/);
  const presentation=zipSync({'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:t>DNS resolves domain names.</a:t></p:sld>'),'ppt/slides/slide2.xml':strToU8('<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:t>Routers forward packets.</a:t></p:sld>')});
  const pptx=await post('/api/import-file',{name:'network.pptx',dataBase64:Buffer.from(presentation).toString('base64')});
  assert.equal(pptx.status,200,JSON.stringify(pptx.data));assert.match(pptx.data.source.content,/DNS resolves/);assert.match(pptx.data.source.content,/Slide 2/);
});
test('XLSX import retains cell values and sheet provenance',async()=>{
  const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Network glossary');sheet.addRow(['Term','Definition']);sheet.addRow(['DNS','Resolves names to addresses']);
  const buffer=await workbook.xlsx.writeBuffer();
  const result=await post('/api/import-file',{name:'glossary.xlsx',dataBase64:Buffer.from(buffer).toString('base64')});
  assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.data.source.content,/Sheet: Network glossary/);assert.match(result.data.source.content,/Resolves names/);
});
test('text PDF extraction reads an actual PDF fixture',async()=>{
  const stream='BT /F1 12 Tf 50 750 Td (DNS resolves names to addresses.) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n `).join('\n')}\ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`;
  const result=await post('/api/import-file',{name:'network.pdf',dataBase64:Buffer.from(text).toString('base64')});
  assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.data.source.content,/DNS resolves names/);assert.equal(result.data.source.metadata.pages,1);
});
test('Office archive checks reject traversal names and excessive expansion declarations',async()=>{
  const bad=zipSync({'../private.txt':strToU8('no')});
  const result=await post('/api/import-file',{name:'unsafe.pptx',dataBase64:Buffer.from(bad).toString('base64')});assert.equal(result.status,400);
  const bomb=Buffer.from(zipSync({'ppt/slides/slide1.xml':strToU8('<p/>')}));
  for(let i=0;i+46<bomb.length;i++)if(bomb.readUInt32LE(i) === 0x02014b50){bomb.writeUInt32LE(200*1024*1024,i+24);break;}
  const expanded=await post('/api/import-file',{name:'large.pptx',dataBase64:bomb.toString('base64')});assert.equal(expanded.status,413);
});
test('EPUB import follows the reading spine and strips embedded scripts',async()=>{
  const epub=zipSync({
    'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'),
    'OEBPS/book.opf':strToU8('<package><manifest><item id="second" href="second.xhtml"/><item id="first" href="first.xhtml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>'),
    'OEBPS/second.xhtml':strToU8('<html><body><p>Routers forward packets.</p></body></html>'),
    'OEBPS/first.xhtml':strToU8('<html><body><p>DNS resolves names.</p><script>unsafe()</script></body></html>'),
  });
  const result=await post('/api/import-file',{name:'network.epub',dataBase64:Buffer.from(epub).toString('base64')});
  assert.equal(result.status,200,JSON.stringify(result.data));assert.ok(result.data.source.content.indexOf('DNS')<result.data.source.content.indexOf('Routers'));assert.doesNotMatch(result.data.source.content,/unsafe/);assert.equal(result.data.source.metadata.chapters,2);
});
test('compatible provider proxy performs an actual HTTP request without persisting credentials',async()=>{
  let received;
  const model=http.createServer(async(request,response)=>{const chunks=[];for await(const chunk of request)chunks.push(chunk);received={url:request.url,authorization:request.headers.authorization,body:JSON.parse(Buffer.concat(chunks).toString())};response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({choices:[{message:{content:'{"cards":[{"question":"What does DNS resolve?","answer":"Names"}]}'}}],usage:{total_tokens:30}}));});
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${model.address().port}`;const previous=process.env.LEARN_AI_ORIGINS;process.env.LEARN_AI_ORIGINS=origin;
  try {
    const result=await post('/api/generate',{provider:'compatible',baseUrl:origin+'/v1',apiKey:'ephemeral-secret',model:'local-test',prompt:'Create a question from: DNS resolves names.',jsonMode:true});
    assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.data.text,/DNS/);assert.equal(received.authorization,'Bearer ephemeral-secret');assert.equal(received.url,'/v1/chat/completions');assert.equal(received.body.response_format.type,'json_object');assert.equal(result.data.usage.total_tokens,30);
    const saved=await fs.readFile(path.join(directory,'rooms.json'),'utf8');assert.ok(!saved.includes('ephemeral-secret'));
  } finally {if(previous===undefined)delete process.env.LEARN_AI_ORIGINS;else process.env.LEARN_AI_ORIGINS=previous;model.closeAllConnections();await new Promise(resolve=>model.close(resolve));}
});

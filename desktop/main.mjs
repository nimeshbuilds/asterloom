import {app,BrowserWindow,dialog,ipcMain,Menu,protocol,shell,safeStorage,session as electronSession} from 'electron';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createService} from '../server/index.mjs';
import {createGameBundle,findTemplate,loadEmbeddedGame,readGame,normalizeTarget} from './bundles.mjs';
import {isUniversalMacApp} from './architectures.mjs';
import {exportNotebookArchive,importNotebookArchive} from './media-archive.mjs';
import {createCredentialStore} from './credential-store.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const APP_URL='asterloom://app';
protocol.registerSchemesAsPrivileged([{scheme:'asterloom',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);

let service,window,quitting=false,exporting=false,proxyPort=null,proxyConfigured=false;
const resources=app.isPackaged?process.resourcesPath:path.join(ROOT,'desktop','dev-resources');
let embedded,bootstrapError;
try{embedded=await loadEmbeddedGame(resources);}catch(error){bootstrapError=error;}
const scope=embedded?path.join('games',embedded.identity):'studio';
// A stable custom browser origin plus a per-package userData directory preserves
// IndexedDB/localStorage across launches while keeping separate game exports isolated.
const storageBase=process.env.ASTERLOOM_DATA_DIR?path.resolve(process.env.ASTERLOOM_DATA_DIR):path.join(app.getPath('appData'),'Asterloom');
app.setPath('userData',path.join(storageBase,scope));
// Electron incorporates app.name into User-Agent when building protocol
// Requests. Non-ASCII notebook titles (or a decorative middle dot) can produce
// invalid ByteString headers and break every fetch in an exported game.
// Keep the process identity stable; BrowserWindow still displays the title.
app.setName('Asterloom');
if(!app.requestSingleInstanceLock()){app.exit(0);}
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});

function ownFrame(event){
  if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return false;
  try{const url=new URL(event.senderFrame.url);return url.protocol==='asterloom:'&&url.hostname==='app';}catch{return false;}
}
function currentBundle(){
  if(!app.isPackaged)return null;
  return process.platform==='darwin'?path.resolve(path.dirname(app.getPath('exe')),'../..'):path.dirname(app.getPath('exe'));
}
function templateRoots(){
  const current=currentBundle();
  return [process.env.ASTERLOOM_TEMPLATE_DIR,path.join(ROOT,'release','desktop'),path.join(process.resourcesPath,'desktop-templates'),current?(process.platform==='darwin'?path.dirname(path.dirname(current)):path.dirname(current)):null];
}
async function templateFor(target){
  target=normalizeTarget(target);
  if(app.isPackaged&&target==='mac'&&process.platform==='darwin'&&await isUniversalMacApp(currentBundle()))return currentBundle();
  if(app.isPackaged&&target==='windows'&&process.platform==='win32')return currentBundle();
  return findTemplate(target,templateRoots());
}
function trustedExternal(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}}
async function bundledTor(){
  const filename=process.platform==='win32'?'tor.exe':'tor';
  for(const target of ['runtime',`${process.platform}-${process.arch}`]){const candidate=path.join(HERE,'vendor','tor',target,'tor',filename);try{await fs.access(candidate);return candidate;}catch{}}
  return undefined;
}
async function configureTorProxy(state){
  if(proxyPort===state.socksPort&&proxyConfigured)return;
  proxyPort=state.socksPort;proxyConfigured=false;
  const route=state.socksPort?`SOCKS5 127.0.0.1:${state.socksPort}`:'PROXY 127.0.0.1:9';
  const script=`function FindProxyForURL(url, host) { if (dnsDomainIs(host, '.onion')) return ${JSON.stringify(route)}; return 'DIRECT'; }`;
  await electronSession.defaultSession.setProxy({mode:'pac_script',pacScript:`data:application/x-ns-proxy-autoconfig,${encodeURIComponent(script)}`});
  await electronSession.defaultSession.closeAllConnections();
  proxyConfigured=!!state.socksPort;
}

app.whenReady().then(async()=>{try{
  if(bootstrapError)throw bootstrapError;
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  let savedTor=false;try{savedTor=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'tor-settings.json'),'utf8')).enabled===true;}catch{}
  // Native requests to a friend's onion relay originate from this fixed app origin.
  process.env.LEARN_ALLOWED_ORIGINS=[...(process.env.LEARN_ALLOWED_ORIGINS||'').split(',').filter(Boolean),APP_URL].join(',');
  service=await createService({port:0,dataDir:path.join(app.getPath('userData'),'service'),distDir:path.join(ROOT,'dist'),mediaAssetDir:path.join(resources,'media-assets'),mediaModelDir:process.env.ASTERLOOM_MEDIA_MODELS||path.join(storageBase,'speech-models'),credentialStore:createCredentialStore({filename:path.join(app.getPath('userData'),'ai-account.enc'),safeStorage}),enableTor:process.argv.includes('--tor')||savedTor,torBinary:await bundledTor(),onTorChange:state=>{void configureTorProxy(state).catch(()=>{proxyConfigured=false;});}});
  await configureTorProxy(service.torStatus());
  ipcMain.handle('asterloom:tor-status',event=>ownFrame(event)?{...service.torStatus(),proxyConfigured}:{error:'This action is unavailable.'});
  ipcMain.handle('asterloom:set-tor',async(event,enabled)=>{
    if(!ownFrame(event)||typeof enabled!=='boolean')return {error:'This action is unavailable.'};
    try{const state=enabled?await service.startTor():await service.stopTor();await configureTorProxy(state);await fs.writeFile(path.join(app.getPath('userData'),'tor-settings.json'),JSON.stringify({enabled}),{mode:0o600});return {...state,proxyConfigured};}
    catch{return {error:'Tor could not be started. Check the bundled runtime and network access.'};}
  });
  const availableExports=[];for(const target of ['mac','windows'])if(await templateFor(target))availableExports.push(target);
  ipcMain.on('asterloom:bootstrap',event=>{event.returnValue=ownFrame(event)?{notebook:embedded?.notebook||null,platform:process.platform==='darwin'?'mac':process.platform==='win32'?'windows':process.platform,availableExports}:null;});
  ipcMain.handle('asterloom:export-game',async(event,packageText,target)=>{
    if(!ownFrame(event))return {error:'Only this application can export a notebook.'};
    if(exporting)return {error:'An export is already in progress.'};
    exporting=true;
    try{
      readGame(packageText); // Validate before opening a native dialog or copying files.
      target=normalizeTarget(target);
      const template=await templateFor(target);
      if(!template)throw new Error(`The ${target==='mac'?'universal Mac':'Windows'} runtime template is not installed. Install its Asterloom release beside this studio to enable this export.`);
      const chosen=await dialog.showOpenDialog(window,{title:'Choose where to save your learning game',buttonLabel:'Export game here',properties:['openDirectory','createDirectory']});
      if(chosen.canceled||!chosen.filePaths[0])return {canceled:true};
      const result=await createGameBundle({packageText,target,template,destination:chosen.filePaths[0],resolveAsset:service.media.resolveAsset});
      return result;
    }catch(error){return {error:error.message||'This game could not be exported.'};}
    finally{exporting=false;}
  });
  ipcMain.handle('asterloom:export-notebook-archive',async(event,packageText)=>{
    if(!ownFrame(event)||exporting)return {error:'Another export is in progress or this action is unavailable.'};
    exporting=true;
    try{const game=readGame(packageText);const chosen=await dialog.showSaveDialog(window,{title:'Save notebook with original recordings',defaultPath:game.notebook.title.replace(/[\\/:*?"<>|]/g,'-')+'.learnzip',filters:[{name:'Asterloom recording archive',extensions:['learnzip']}]});if(chosen.canceled||!chosen.filePath)return {canceled:true};return await exportNotebookArchive({packageText,destination:chosen.filePath,resolveAsset:service.media.resolveAsset});}
    catch(error){return {error:error.message||'The recording archive could not be saved.'};}finally{exporting=false;}
  });
  ipcMain.handle('asterloom:import-notebook-archive',async event=>{
    if(!ownFrame(event)||exporting)return {error:'Another import or export is in progress.'};
    exporting=true;
    try{const chosen=await dialog.showOpenDialog(window,{title:'Restore a notebook and its recordings',properties:['openFile'],filters:[{name:'Asterloom recording archive',extensions:['learnzip']}]});if(chosen.canceled||!chosen.filePaths[0])return {canceled:true};return await importNotebookArchive({filename:chosen.filePaths[0],store:service.media.store});}
    catch(error){return {error:error.message||'The recording archive could not be restored.'};}finally{exporting=false;}
  });
  // A fixed, privileged app origin proxies the private ephemeral HTTP service.
  // Hostile web origins never gain a route to this service through the protocol.
  protocol.handle('asterloom',async request=>{
    try{
      const url=new URL(request.url);const origin=request.headers.get('origin');
      if(url.hostname!=='app'||(origin&&origin!==APP_URL))return new Response('Forbidden',{status:403});
      const headers=new Headers(request.headers);headers.delete('origin');headers.delete('host');headers.delete('referer');headers.delete('connection');
      const upstream=await fetch(`http://127.0.0.1:${service.port}${url.pathname}${url.search}`,{method:request.method,headers,...['GET','HEAD'].includes(request.method)?{}:{body:request.body,duplex:'half'},signal:request.signal,redirect:'manual'});
      const responseHeaders=new Headers(upstream.headers);responseHeaders.delete('connection');responseHeaders.delete('transfer-encoding');
      if(responseHeaders.get('content-type')?.includes('text/html')){
        const html=await upstream.text();
        const hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(match=>!(/\bsrc\s*=/i.test(match[1]))).map(match=>`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
        responseHeaders.set('Content-Security-Policy',`default-src 'self' data: blob:; script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')}; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://*.onion; object-src 'none'; base-uri 'self'; frame-src 'none'`);
        responseHeaders.delete('content-length');
        return new Response(html,{status:upstream.status,headers:responseHeaders});
      }
      return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
    }catch{return new Response('The local application service is unavailable.',{status:503});}
  });
  function createWindow(){
    window=new BrowserWindow({width:1440,height:980,minWidth:900,minHeight:660,backgroundColor:'#faf8f3',title:embedded?.notebook.title||'Asterloom',show:false,webPreferences:{preload:path.join(HERE,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
    window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permission==='clipboard-sanitized-write'&&contents===window?.webContents&&(details.requestingUrl||contents.getURL()).startsWith(APP_URL+'/')));
    window.webContents.session.setPermissionCheckHandler((contents,permission,origin)=>permission==='clipboard-sanitized-write'&&contents===window?.webContents&&origin===APP_URL);
    window.webContents.setWindowOpenHandler(({url})=>{if(trustedExternal(url))void shell.openExternal(url);return {action:'deny'};});
    window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(APP_URL+'/')){event.preventDefault();if(trustedExternal(url))void shell.openExternal(url);}});
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    window.once('ready-to-show',()=>window.show());
    window.on('closed',()=>{window=null;});
    void window.loadURL(APP_URL+'/');
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
    {label:'File',submenu:[{label:'Export from the current notebook',click:()=>dialog.showMessageBox(window,{type:'info',message:'Open a notebook, choose Export, then select Mac or Windows.',detail:'Every native game export includes one notebook and the complete editing studio.'})},{type:'separator'},{role:process.platform==='darwin'?'close':'quit'}]},
    {role:'editMenu'},
    {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]},
    {role:'windowMenu'},
  ]));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
}catch(error){dialog.showErrorBox('Asterloom could not start',error.message);app.quit();}});

app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',event=>{
  if(quitting||!service)return;
  event.preventDefault();quitting=true;void service.close().finally(()=>app.quit());
});

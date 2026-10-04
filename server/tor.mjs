import {promises as fs} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';

async function freePort(){const listener=net.createServer();await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));return port;}
export function createTorController({binary,dataDir,servicePort,onChange=()=>{}}){
  const state={installed:!!binary,status:'disabled',bootstrap:0,socksPort:null,hostname:null,reachabilityVerified:false};
  let child,timer,startPromise,stopping=false;
  const emit=()=>{onChange({...state});};
  const progress=()=>{if(state.bootstrap===100&&state.hostname)state.status='ready';emit();};
  async function start(){
    if(child)return {...state};if(startPromise)return startPromise;
    startPromise=(async()=>{
      if(!binary){state.status='unavailable';emit();return {...state};}
      stopping=false;const directory=path.join(dataDir,'tor');const onion=path.join(directory,'onion');
      await fs.mkdir(onion,{recursive:true,mode:0o700});await fs.chmod(onion,0o700);
      const socksPort=await freePort();Object.assign(state,{status:'starting',bootstrap:0,socksPort,hostname:null,reachabilityVerified:false});emit();
      const args=['--DataDirectory',directory,'--HiddenServiceDir',onion,'--HiddenServicePort',`80 127.0.0.1:${servicePort}`,'--SocksPort',`127.0.0.1:${socksPort}`,'--ClientOnly','1','--SafeLogging','1','--Log','notice stdout'];
      const bundleData=path.resolve(path.dirname(binary),'../data');
      for(const [option,name] of [['--GeoIPFile','geoip'],['--GeoIPv6File','geoip6']])try{await fs.access(path.join(bundleData,name));args.push(option,path.join(bundleData,name));}catch{}
      child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],windowsHide:true,cwd:path.dirname(binary)});
      let remaining='';
      child.stdout.on('data',chunk=>{
        remaining=(remaining+chunk.toString()).slice(-20000);const lines=remaining.split(/\r?\n/);remaining=lines.pop()||'';
        for(const line of lines){const matched=line.match(/Bootstrapped (\d+)%/);if(matched){state.bootstrap=Math.min(100,Number(matched[1]));state.status=state.bootstrap===100?'connected':'connecting';progress();}}
      });
      child.stderr.resume(); // Do not surface addresses, local paths or arbitrary native logs.
      child.on('error',()=>{state.status='error';state.socksPort=null;child=null;clearInterval(timer);emit();});
      child.on('exit',()=>{child=null;clearInterval(timer);Object.assign(state,{status:stopping?'disabled':'stopped',socksPort:null,bootstrap:0,reachabilityVerified:false});emit();});
      timer=setInterval(async()=>{try{const hostname=(await fs.readFile(path.join(onion,'hostname'),'utf8')).trim();if(/^[a-z2-7]{56}\.onion$/.test(hostname)){state.hostname=hostname;progress();if(state.bootstrap===100)clearInterval(timer);}}catch{}},500);timer.unref();
      return {...state};
    })().finally(()=>{startPromise=null;});
    return startPromise;
  }
  async function stop(){
    stopping=true;clearInterval(timer);const process=child;
    if(process){await new Promise(resolve=>{const timeout=setTimeout(()=>{process.kill('SIGKILL');resolve();},3000);process.once('exit',()=>{clearTimeout(timeout);resolve();});process.kill('SIGTERM');});}
    child=null;Object.assign(state,{status:'disabled',socksPort:null,bootstrap:0,reachabilityVerified:false});emit();return {...state};
  }
  return {start,stop,status:()=>({...state}),markReachable:()=>{state.reachabilityVerified=true;emit();}};
}

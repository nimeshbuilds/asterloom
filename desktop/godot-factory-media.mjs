import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256File} from '../server/media-assets.mjs';

/** Media paths come only from the desktop's verified asset resolver, never notebook fields. */
export async function writeNativeMediaManifest(notebook,{directory,resolveAsset}={}) {
  const sources=notebook.sources.filter(source=>source.asset);
  if(!sources.length)return undefined;
  if(typeof resolveAsset!=='function')throw Error('The original recording is unavailable. Restore its recording archive or open the complete exported game.');
  const assets=[];
  for(const source of sources){
    const item=await resolveAsset(source.asset),stat=await fs.stat(item.path);
    if(!path.isAbsolute(item.path)||!stat.isFile()||stat.size!==source.asset.size||await sha256File(item.path)!==source.asset.sha256)throw Error(`The original recording “${source.title}” failed its integrity check.`);
    assets.push({sourceId:source.id,sha256:source.asset.sha256,size:source.asset.size,mime:source.asset.mime,path:item.path});
  }
  await fs.mkdir(directory,{recursive:true});
  const output=path.join(directory,randomUUID()+'.json');
  await fs.writeFile(output,JSON.stringify({version:1,notebookId:notebook.id,assets}),{mode:0o600,flag:'wx'});
  return output;
}

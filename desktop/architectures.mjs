import {promises as fs} from 'node:fs';
import path from 'node:path';

const names=new Map([[0x01000007,'x64'],[0x0100000c,'arm64']]);
/** Inspect Mach-O headers without executing the application or requiring Xcode. */
export function machArchitectures(bytes){
  if(bytes.length<8)return [];
  const magic=bytes.readUInt32BE(0);
  if(magic===0xcffaedfe||magic===0xcefaedfe)return [names.get(bytes.readUInt32LE(4))].filter(Boolean);
  if(magic===0xfeedfacf||magic===0xfeedface)return [names.get(bytes.readUInt32BE(4))].filter(Boolean);
  const little=magic===0xbebafeca||magic===0xbfbafeca;
  if(![0xcafebabe,0xbebafeca,0xcafebabf,0xbfbafeca].includes(magic))return [];
  const read=offset=>little?bytes.readUInt32LE(offset):bytes.readUInt32BE(offset);
  const count=read(4),stride=[0xcafebabf,0xbfbafeca].includes(magic)?32:20;
  if(count<1||count>16||bytes.length<8+count*stride)return [];
  return [...new Set(Array.from({length:count},(_,index)=>names.get(read(8+index*stride))).filter(Boolean))].sort();
}
export async function executableArchitectures(filename){
  const handle=await fs.open(filename,'r');
  try{const buffer=Buffer.alloc(520);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);return machArchitectures(buffer.subarray(0,bytesRead));}
  finally{await handle.close();}
}
export async function isUniversalMacApp(bundle){
  try{return (await executableArchitectures(path.join(bundle,'Contents','MacOS','Asterloom'))).join(',')==='arm64,x64';}catch{return false;}
}

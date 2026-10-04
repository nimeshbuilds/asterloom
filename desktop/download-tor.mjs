import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as openpgp from 'openpgp';
import {prepareTorRuntime} from './prepare-tor.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const version='15.0.24';
const fingerprint='EF6E286DDA85EA2A4BA7DE684E2C6E8793298290';
const base=`https://dist.torproject.org/torbrowser/${version}/`;
const allTargets=[['darwin-arm64','macos-aarch64'],['darwin-x64','macos-x86_64'],['win32-x64','windows-x86_64']];
const selected=process.argv.find(value=>value.startsWith('--platform='))?.split('=')[1];
const requested=process.argv.includes('--host')?`${process.platform}-${process.arch}`:({windows:'win32-x64','mac-arm64':'darwin-arm64','mac-intel':'darwin-x64'}[selected]);
if(selected&&!requested&&selected!=='mac')throw new Error('Choose --platform=mac or windows.');
const sourcesOnly=process.argv.includes('--sources-only');
const targets=sourcesOnly?[]:selected==='mac'?allTargets.filter(([platform])=>platform.startsWith('darwin-')):requested?allTargets.filter(([platform])=>platform===requested):allTargets;
if(!targets.length&&!sourcesOnly)throw new Error('No bundled Tor runtime is supported for this platform.');
const root=path.join(ROOT,'vendor','tor');const downloads=path.join(root,'downloads');await fs.mkdir(downloads,{recursive:true});
const run=promisify(execFile);
async function download(url){const response=await fetch(url);if(!response.ok)throw new Error(`Download failed: ${response.status} ${url}`);const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>80*1024*1024)throw new Error('Tor download exceeds the expected size.');return bytes;}
const keyBytes=await download(`https://keys.openpgp.org/vks/v1/by-fingerprint/${fingerprint}`);
const key=await openpgp.readKey({armoredKey:new TextDecoder().decode(keyBytes)});
if(key.getFingerprint().toUpperCase()!==fingerprint)throw new Error('Tor signing-key fingerprint does not match the published Tor Browser key.');
const checksumsBytes=await download(base+'sha256sums-signed-build.txt');
const checksumsSignature=await download(base+'sha256sums-signed-build.txt.asc');
async function verify(data,signature,verificationKey=key){const result=await openpgp.verify({message:await openpgp.createMessage({binary:data}),signature:await openpgp.readSignature({armoredSignature:new TextDecoder().decode(signature)}),verificationKeys:verificationKey});if(!result.signatures.length)throw new Error('No detached signature was found.');await result.signatures[0].verified;}
await verify(checksumsBytes,checksumsSignature);
const checksums=new TextDecoder().decode(checksumsBytes);
let records=[];try{records=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')).records||[];}catch{}
for(const [platform,target] of targets){
  const filename=`tor-expert-bundle-${target}-${version}.tar.gz`;
  console.log(`Downloading and verifying ${filename}…`);
  const [archive,signature]=await Promise.all([download(base+filename),download(base+filename+'.asc')]);
  const digest=createHash('sha256').update(archive).digest('hex');
  const expected=checksums.split(/\r?\n/).find(line=>line.endsWith(filename))?.split(/\s+/)[0];
  if(expected!==digest)throw new Error(`Checksum mismatch for ${filename}.`);
  await verify(archive,signature);
  const file=path.join(downloads,filename);await fs.writeFile(file,archive);await fs.writeFile(file+'.asc',signature);
  const {stdout}=await run('tar',['-tzf',file]);
  if(stdout.split(/\r?\n/).some(entry=>entry.startsWith('/')||entry.split('/').includes('..')))throw new Error('Archive contains an unsafe entry path.');
  const destination=path.join(root,platform);await fs.mkdir(destination,{recursive:true});await run('tar',['-xzf',file,'-C',destination]);
  const adHocSigned=await prepareTorRuntime(destination,platform.split('-')[0]);
  const executable=path.join(destination,'tor',platform.startsWith('win32')?'tor.exe':'tor');await fs.access(executable);
  records=records.filter(record=>record.platform!==platform);records.push({platform,adHocSigned,bundleVersion:version,torVersion:'0.4.9.13',source:base+filename,sha256:digest,pgpFingerprint:fingerprint,signatureVerified:true});
}
// Preserve the exact Tor core source release alongside the executable. This
// core archive does not by itself certify complete source/notice compliance
// for every third-party library or transport in an expert bundle.
const sourceFingerprint='B74417EDDF22AC9F9E90F49142E86A2A11F48D36';
const sourceName='tor-0.4.9.13.tar.gz',sourceUrl=`https://dist.torproject.org/${sourceName}`;
console.log(`Downloading and verifying source ${sourceName}…`);
const sourceKey=await openpgp.readKey({armoredKey:new TextDecoder().decode(await download(`https://keys.openpgp.org/vks/v1/by-fingerprint/${sourceFingerprint}`))});
if(sourceKey.getFingerprint().toUpperCase()!==sourceFingerprint)throw new Error('The Tor source signing-key fingerprint does not match the official release key.');
const [sourceArchive,sourceSum,sourceSignature]=await Promise.all([download(sourceUrl),download(sourceUrl+'.sha256sum'),download(sourceUrl+'.sha256sum.asc')]);
await verify(sourceSum,sourceSignature,sourceKey);
const sourceDigest=createHash('sha256').update(sourceArchive).digest('hex');
if(new TextDecoder().decode(sourceSum).trim().split(/\s+/)[0]!==sourceDigest)throw new Error('The Tor source archive checksum does not match its signed checksum.');
const sourceDirectory=path.join(root,'sources');await fs.mkdir(sourceDirectory,{recursive:true});
await fs.writeFile(path.join(sourceDirectory,sourceName),sourceArchive);await fs.writeFile(path.join(sourceDirectory,sourceName+'.sha256sum'),sourceSum);await fs.writeFile(path.join(sourceDirectory,sourceName+'.sha256sum.asc'),sourceSignature);
const sourceRecord={version:'0.4.9.13',url:sourceUrl,sha256:sourceDigest,pgpFingerprint:sourceFingerprint,signatureVerified:true,keyDocumentation:'https://support.torproject.org/little-t-tor/getting-started/verifying/',scope:'Tor core source archive; additional expert-bundle dependency source and release compliance review remain required.'};
await fs.writeFile(path.join(sourceDirectory,'SOURCE-PROVENANCE.json'),JSON.stringify(sourceRecord,null,2));
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({downloadedAt:new Date().toISOString(),sources:'https://download.torproject.org/tor/',keyDocumentation:'https://support.torproject.org/tor-browser/getting-started/verifying-tor-browser/',records,sourceRecord},null,2));
console.log(`${targets.length} Tor runtime archive(s) passed SHA-256 and OpenPGP signature verification.`);

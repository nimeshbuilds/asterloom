import {describe,it,expect} from 'vitest';
import {validateOriginalFile} from '../src/lib/originalFiles';
import {bytesDigest} from '../src/lib/evidence';
import {parsePackage,serializePackage} from '../src/lib/package';
import {demoNotebooks} from '../src/data/demo';
describe('portable original source vault',()=>{
 const bytes=new TextEncoder().encode('The exact original material.\n'),original={name:'notes.md',mime:'text/markdown',dataUrl:`data:text/markdown;base64,${btoa(String.fromCharCode(...bytes))}`,size:bytes.length,sha256:bytesDigest(bytes)};
 it('retains exact originals through package validation without provider credentials',()=>{const n=demoNotebooks()[0];n.sources[0].originalFile=original;const pack=serializePackage({...n,apiKey:'never-export'} as typeof n);expect(parsePackage(pack).sources[0].originalFile).toEqual(original);expect(pack).not.toContain('never-export');});
 it('detects tampering, path names and unsupported executable attachments',()=>{expect(()=>validateOriginalFile({...original,sha256:'0'.repeat(64)})).toThrow(/checksum/);expect(()=>validateOriginalFile({...original,name:'../notes.md'})).toThrow(/filenames/);expect(()=>validateOriginalFile({...original,name:'run.exe'})).toThrow(/format/);expect(()=>validateOriginalFile({...original,size:1})).toThrow(/checksum/);});
 it('allows archived HTML only as a validated download attachment',()=>{expect(validateOriginalFile({...original,name:'saved.html',mime:'text/html',dataUrl:original.dataUrl.replace('text/markdown','text/html')})).toMatchObject({name:'saved.html'});});
});

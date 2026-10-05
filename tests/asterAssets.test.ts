import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ASTER_EMOTIONS} from '../src/lib/asterEmotions';
describe('bundled Aster portrait completeness',()=>{
 it('supplies one distinct RGBA PNG for every curated expression with usable portrait dimensions',async()=>{
  const hashes=new Set<string>();
  for(const expression of ASTER_EMOTIONS){
   const bytes=await readFile(`public${expression.assetPath}`);
   expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
   expect(bytes.subarray(12,16).toString()).toBe('IHDR');
   expect(bytes[25]).toBe(6); // PNG RGBA color type; pixel-level alpha is checked in asset QA.
   expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(512);
   expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(512);
   hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  expect(ASTER_EMOTIONS).toHaveLength(50);expect(hashes.size).toBe(50);
 });
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {machArchitectures} from './architectures.mjs';

test('Mach-O inspection distinguishes universal and thin executable slices',()=>{
  for(const [magic,stride,little] of [[0xcafebabe,20,false],[0xcafebabf,32,false],[0xbebafeca,20,true],[0xbfbafeca,32,true]]){
    const b=Buffer.alloc(8+stride*2);b.writeUInt32BE(magic,0);const write=(value,offset)=>little?b.writeUInt32LE(value,offset):b.writeUInt32BE(value,offset);write(2,4);write(0x01000007,8);write(0x0100000c,8+stride);assert.deepEqual(machArchitectures(b),['arm64','x64']);assert.deepEqual(machArchitectures(b.subarray(0,10)),[]);
  }
  const thin=Buffer.alloc(32);thin.writeUInt32LE(0xfeedfacf,0);thin.writeUInt32LE(0x01000007,4);assert.deepEqual(machArchitectures(thin),['x64']);
  assert.deepEqual(machArchitectures(Buffer.from('MZwindows')),[]);assert.deepEqual(machArchitectures(Buffer.alloc(4)),[]);
});
test('untrusted architecture counts and unknown CPU types are rejected',()=>{
  const b=Buffer.alloc(48);b.writeUInt32BE(0xcafebabe,0);b.writeUInt32BE(0xffffffff,4);assert.deepEqual(machArchitectures(b),[]);b.writeUInt32BE(2,4);assert.deepEqual(machArchitectures(b),[]);
});

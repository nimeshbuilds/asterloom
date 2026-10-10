import {describe,expect,it} from 'vitest';
import {parseGameDirectorReply} from '../src/lib/gameDirectorReply';

describe('bounded game creation reply decoding',()=>{
 it('keeps exact quotes, braces and real line breaks in JSON strings, including an enclosing JSON fence',()=>{
  const value={missions:[],study:[{reason:'A quote: "x" and {braces}\nwith a new line.'}]},json=JSON.stringify(value);
  expect(parseGameDirectorReply(json)).toEqual(value);
  expect(parseGameDirectorReply(`\n\`\`\`JSON\n${json}\n\`\`\`\n`)).toEqual(value);
 });
 it.each(['{}\n{}','{"claim":"} escaped \\\" quote"}\n{"second":1}','{}\nDone.'])('rejects extra output instead of guessing which response to keep',text=>{
  expect(()=>parseGameDirectorReply(text)).toThrow(/additional content/);
 });
 it.each(['{"missions":[','{"private":"secret source text','{"x":"escaped \\'])('reports incomplete JSON without exposing its contents',text=>{
  let message='';try{parseGameDirectorReply(text);}catch(error){message=(error as Error).message;}
  expect(message).toContain('unfinished JSON');expect(message).not.toContain('secret source text');
 });
 it.each(['null','[]','"hello"','1'])('rejects complete but non-object replies',text=>{
  expect(()=>parseGameDirectorReply(text)).toThrow(/JSON value/);
 });
 it('does not repair invalid syntax, extract objects from prose or accept oversized replies',()=>{
  expect(()=>parseGameDirectorReply('{"private":"secret" "other":1}')).toThrow(/invalid JSON syntax/);
  expect(()=>parseGameDirectorReply('Here is the result: {}')).toThrow(/prose or Markdown/);
  expect(()=>parseGameDirectorReply(' \n ')).toThrow(/empty/);
  expect(()=>parseGameDirectorReply(JSON.stringify({text:'é'.repeat(200000)}))).toThrow(/bounded/);
 });
});

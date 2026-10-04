import {describe,it,expect} from 'vitest';
import {subscriptionLoginUrl,subscriptionStatuses,providerModelCatalog} from '../src/lib/providerConnections';
import {canRequest} from '../src/lib/providerSession';
describe('official subscription connections',()=>{
 it('accepts both documented Codex login hosts and Grok account login',()=>{
  expect(subscriptionLoginUrl('codex','https://chatgpt.com/auth/login?state=example')).toContain('chatgpt.com');
  expect(subscriptionLoginUrl('codex','https://auth.openai.com/codex/device')).toContain('/codex/device');
  expect(subscriptionLoginUrl('grok','https://accounts.x.ai/login')).toContain('accounts.x.ai');
  expect(subscriptionLoginUrl('claude','https://claude.com/cai/oauth/authorize')).toContain('claude.com');
  expect(subscriptionLoginUrl('claude','https://console.anthropic.com/oauth/authorize')).toContain('console.anthropic.com');
  expect(()=>subscriptionLoginUrl('claude','https://claude.com.attacker.invalid/login')).toThrow();
 });
 it.each(['http://auth.openai.com/login','https://auth.openai.com.attacker.invalid/login','https://person:secret@auth.openai.com/login','https://auth.openai.com:8443/login','javascript:alert(1)','https://accounts.x.ai/login'])('rejects an unexpected Codex login target: %s',url=>expect(()=>subscriptionLoginUrl('codex',url)).toThrow());
 it('allows selected managed models without demanding an API key',()=>{
  expect(canRequest({provider:'grok',model:'available-model',apiKey:''})).toBe(true);
  expect(canRequest({provider:'claude-code',model:'sonnet',apiKey:''})).toBe(true);
  expect(canRequest({provider:'chatgpt',model:'available-model',apiKey:''})).toBe(true);
  expect(canRequest({provider:'grok',model:'',apiKey:''})).toBe(false);
  expect(canRequest({provider:'xai',model:'available-model',apiKey:''})).toBe(false);
 });
});

describe('local provider response boundaries',()=>{
 it('accepts delayed device-login status and both progress shapes without inventing verification',()=>{
  const base={id:'grok',enabled:true,installed:true,installing:false,pending:true,connected:false};
  expect(subscriptionStatuses({engines:[{...base,progress:{downloadedBytes:128,totalBytes:1024},verificationUrl:'https://accounts.x.ai/device',userCode:'ABC-123'}]})[0]).toMatchObject({progress:{downloadedBytes:128,totalBytes:1024},userCode:'ABC-123'});
  expect(subscriptionStatuses({engines:[{...base,pending:false,connected:true,connectionState:'saved',reason:'Saved sign-in; usage not yet verified.'}]})[0].connectionState).toBe('saved');
 });
 it.each([{}, {engines:{}}, {engines:[{id:'codex',connected:'true'}]}, {engines:[{id:'other',enabled:true,installed:true,installing:false,pending:false,connected:true}]}])('rejects malformed connection state: %j',value=>expect(()=>subscriptionStatuses(value)).toThrow('unreadable connection status'));
 it('deduplicates model identifiers, retains the provider notice and uses the ID when a name is absent',()=>{
  expect(providerModelCatalog({models:[{id:'a'},{id:'a',name:'Duplicate'},{id:'b',name:'Second'}],notice:'Your account may not have access.'})).toEqual({models:[{id:'a',name:'a'},{id:'b',name:'Second'}],notice:'Your account may not have access.'});
 });
 it.each([{}, {models:null}, {models:[{id:''}]}, {models:[{id:'a',name:{unexpected:true}}]}])('rejects malformed model catalogs without storing them: %j',value=>expect(()=>providerModelCatalog(value)).toThrow('unreadable model catalog'));
});

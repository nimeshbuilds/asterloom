import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import noticeSources from '../scripts/licenses/notice-sources.json';
import notices from '../src/data/thirdPartyNotices.generated.json';
import {verifyBrowserNotices} from '../scripts/generate-browser-notices.mjs';

describe('portable third-party notices',()=>{
 it('matches the complete installed browser dependency graph and exact upstream texts',async()=>{expect(await verifyBrowserNotices()).toEqual(notices);},30000);
 it('preserves exact font licenses, Lucide and Feather terms, and public-domain music notices',()=>{const fontNames=['@fontsource-variable/dm-sans','@fontsource-variable/fraunces'];for(const name of fontNames){const item=notices.packages.find(p=>p.name===name)!;expect(item.notices[0].text).toContain('SIL OPEN FONT LICENSE Version 1.1');expect(item.notices[0].text).toContain('Copyright');}const lucide=notices.packages.find(p=>p.name==='lucide-react')!.notices.map(n=>n.text).join('\n');expect(lucide).toContain('ISC License');expect(lucide).toContain('Cole Bemis');expect(lucide).toContain('The MIT License');const music=notices.assets.map(a=>a.text).join('\n');expect(music).toContain('hernandack');expect(music).toContain('Juhani Junkala');expect(music).toContain('CC0 1.0 Universal');});
 it('retains original copyright and complete license bytes for every entry',()=>{for(const item of [...notices.packages.flatMap(p=>p.notices),...notices.assets])expect(createHash('sha256').update(item.text).digest('hex')).toBe(item.sha256);expect(notices.packages.length).toBeGreaterThan(0);});
 it('pins the missing npm notice to the exact release commit instead of substituting a generic MIT template',()=>{const pin=noticeSources.fallbacks['@pixi/colord@2.9.6'],bytes=readFileSync(pin.path);expect(pin.url).toContain('5344fbf77b736f81cd33c21050021bc09bc9dd1d');expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);expect(bytes.toString('utf8')).toContain('Copyright (c) 2020 Vlad Shilov');});
});

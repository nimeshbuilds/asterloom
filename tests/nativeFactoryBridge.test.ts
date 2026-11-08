import {describe,it,expect} from 'vitest';
import {factoryPackFromNotebook,factoryRequest} from '../scripts/godot-factory/bridge/engine';
import {nativeFactoryFixtures} from './fixtures/nativeFactoryBenchmark';
import {referenceResponses} from '../scripts/factory-benchmark/responses';

describe('native factory evidence and assessment boundary',()=>{
  const fixtures=nativeFactoryFixtures();
  it.each(fixtures.map(f=>[f.scaffoldId,f] as const))('%s preserves its source, model and review state',(_id,f)=>{
    const notebook={...f.positiveInput,activities:[f.activity]};
    const pack=factoryPackFromNotebook(notebook);
    expect(pack.missions[0].scaffoldId).toBe(f.scaffoldId);
    expect(pack.notebook.activities![0].reviewStatus).toBe(f.activity.reviewStatus);
    const init=factoryRequest({op:'initial',activity:f.activity,sources:f.sources});
    expect(init.ok).toBe(true);
    const answer=referenceResponses({...structuredClone(f.activity),reviewStatus:'reviewed'}).correctResponse;
    const result=factoryRequest({op:'evaluate',activity:f.activity,sources:f.sources,response:answer});
    expect(result.ok).toBe(true);
    if(f.activity.reviewStatus==='needs-review'){
      expect(result.evaluation).toMatchObject({outcome:'draft-preview',score:0,correct:null});
      expect(result.practice).toMatchObject({credit:'practice-only',reviewStatus:'needs-review'});
    }
    expect(factoryRequest({op:'evaluate',activity:f.activity,sources:f.sources.map(source=>({...source,text:'A replacement source.'})),response:answer}).ok).toBe(false);
  });
  it('opens exact legacy source cards without approving AI drafts or inventing alternatives',()=>{
    const f=fixtures.find(f=>f.scaffoldId==='recall-escape-mission')!;
    const source=f.sources[0];
    const card={id:'old-card',sourceId:source.id,evidence:source.text,answer:'Router',prompt:'Which device forwards packets between networks?',options:['Router','Switch'],correctIndex:0,explanation:'Router forwards packets between separate networks.',concept:'Router',tags:[],reviewStatus:'extractive' as const};
    const notebook={...f.positiveInput,cards:[card],activities:[]};
    const pack=factoryPackFromNotebook(notebook);
    expect(pack.notebook.activities![0]).toMatchObject({kind:'recall',reviewStatus:'needs-review'});
    expect(notebook.activities).toEqual([]);
    expect(()=>factoryPackFromNotebook({...notebook,cards:[{...card,reviewStatus:'needs-review'}]})).toThrow();
  });
  it('rejects executable pack fields, missing attachments and an incompatible bound recipe',()=>{
    const f=fixtures[0],pack=factoryPackFromNotebook({...f.positiveInput,activities:[f.activity]});
    expect(factoryRequest({op:'validate-pack',pack:{...pack,script:'run'}}).ok).toBe(false);
    expect(factoryRequest({op:'initial',activity:f.activity,sources:[]}).ok).toBe(false);
    expect(factoryRequest({op:'validate-pack',pack:{...pack,missions:[{scaffoldId:'not-a-template',activityId:f.activity.id}]}}).ok).toBe(false);
  });
});

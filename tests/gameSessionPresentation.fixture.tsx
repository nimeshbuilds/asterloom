import React from 'react';
import {createRoot} from 'react-dom/client';
// Match the application order: the session shell precedes component and base CSS.
import '../src/game-session.css';
import StructuredBoard from '../src/components/StructuredBoard';
import '../src/styles.css';
import {nativeFactoryFixtures} from './fixtures/nativeFactoryBenchmark';
import {createNotebook} from '../src/lib/utils';
import {scaffoldById} from '../src/data/scaffolds';
import {initialActivityResponse} from '../src/lib/activityResponse';
import {buildLearningBriefing,initialLessonState,lessonReady} from '../src/lib/learningBriefing';

const kind=new URLSearchParams(location.search).get('kind')||'budget';
const entry=nativeFactoryFixtures().find(f=>f.activity.kind===kind)!;
const activity=entry.activity;
const notebook=createNotebook({id:'presentation-'+activity.id,title:'Source learning mission',sources:entry.sources,cards:[],activities:[activity],ageGroup:entry.ageGroup,theme:'observatory',scaffoldIds:[entry.scaffoldId]});
const plan=buildLearningBriefing({notebook,scaffold:scaffoldById(entry.scaffoldId),activity});
const initial=initialLessonState(plan);
// This isolated fixture deliberately starts after teaching to exercise every
// workbench surface. Full-app tests in the spec separately follow the actual
// visible teaching flow; this state is never used as evidence of learning.
const lesson={...initial,stage:'ready' as const,missionAccepted:true,viewedPassageIds:plan.passages.map(p=>p.id),walkthroughStep:plan.walkthrough.steps.length,practice:{...initial.practice,focusId:plan.practice.focusOptions[0]?.id||'',explanation:'The source explains this relationship clearly.',connection:'I can follow the source conditions.',mode:'written' as const,compared:true,order:plan.practice.orderIds,guidedStart:true},completedAt:new Date().toISOString()};
delete lesson.rehearsal;
if(!lessonReady(plan,lesson))throw Error('Invalid presentation-only ready-state fixture');
const savedResponse={...initialActivityResponse(activity),_draft:{lesson}};
createRoot(document.getElementById('root')!).render(<div className="app-shell playing"><div className="main-shell"><main className="content mission-content"><h1>Source learning mission</h1><StructuredBoard activity={activity} notebook={notebook} sources={notebook.sources} ageGroup={notebook.ageGroup} theme={notebook.theme} scaffoldId={entry.scaffoldId} savedResponse={savedResponse} onSave={()=>true} onComplete={()=>true}/></main></div></div>);

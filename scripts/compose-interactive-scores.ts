/** Original declarative music, prepared at build time. No sampled/copied melodies,
 * model calls, third-party samples, network or runtime random generation. These
 * 90 arrangements share instrument palettes and compositional grammar. */
import {readFile,writeFile} from 'node:fs/promises';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {worldForScaffold} from '../src/data/worlds';
import type {InteractiveScore,ScoreInstrument,ScoreNote} from '../src/lib/scoreTypes';
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
function random(seed:number){let n=seed;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
const modes={major:[0,2,4,5,7,9,11],dorian:[0,2,3,5,7,9,10],lydian:[0,2,4,6,7,9,11],pentatonic:[0,2,4,7,9]};
const harmonicPlans=[[0,3,5,4,0,5,3,4],[0,5,3,4,2,5,3,0],[0,2,3,4,5,3,4,0],[0,3,0,4,5,2,3,0],[0,4,5,3,0,2,3,4],[0,5,2,3,4,2,5,0],[0,2,5,4,3,5,4,0],[0,3,4,0,5,4,3,0],[0,5,0,3,2,4,5,0],[0,4,3,5,2,3,4,0],[0,3,2,5,4,5,3,0],[0,2,4,3,5,4,2,0]];
const rhythms=[[0,1,2.5],[0,.75,2,3],[.5,1.5,2.5],[0,1.5,3],[0,1,2,3],[.5,2,3.25],[0,.75,1.75,3],[0,1.5,2.5,3.5],[0,2],[.5,1.5,3],[0,1,2.75],[0,1.25,2.5],[.25,1.25,2.75],[0,2,3],[.5,2.5],[0,.5,2,3.25]];
const palettes:Record<string,[ScoreInstrument,ScoreInstrument,ScoreInstrument,ScoreInstrument]>={
 islands:['air','glass','plucked','round'],observatory:['air','glass','felt','round'],forest:['felt','marimba','plucked','round'],workshop:['round','plucked','marimba','felt'],ocean:['air','felt','glass','round'],library:['felt','felt','glass','round']};
const extras=[
 ['quiet-orbit','Quiet Orbit','observatory','Space to read'],['river-notes','River Notes','ocean','Flowing focus'],['open-window','Open Window','islands','Fresh beginnings'],['cedar-room','Cedar Room','forest','Warm concentration'],['ink-and-lantern','Ink and Lantern','library','Reflective reading'],
 ['copper-lines','Copper Lines','workshop','Steady making'],['cloud-ledger','Cloud Ledger','observatory','Order and clarity'],['walking-home','Walking Home','forest','Restful return'],['saffron-sky','Saffron Sky','islands','Gentle discovery'],['small-constellation','Small Constellation','observatory','Bright imagination'],
 ['tide-and-time','Tide and Time','ocean','Patient practice'],['blueprint-nocturne','Blueprint Nocturne','workshop','Thoughtful building'],['pressed-leaves','Pressed Leaves','library','Quiet reflection'],['dawn-workshop','Dawn Workshop','workshop','Playful planning'],['lantern-festival','Lantern Festival','islands','Warm achievement'],
];
const entries=[...SCAFFOLDS.map(s=>({id:s.id,name:worldForScaffold(s.id).name.replace(/^The /,''),scene:s.visual.scene,mood:s.family==='explain'?'Reflective · spacious':s.family==='sequence'?'Flowing · steady':s.ages[0]==='3-5'?'Warm · playful':'Curious · layered',family:s.family,young:s.ages.length===1&&['3-5','6-8'].includes(s.ages[0]),scaffoldId:s.id})),...extras.map(([id,name,scene,mood])=>({id,name,scene,mood,family:'recall',young:false,scaffoldId:undefined}))];
const scores:InteractiveScore[]=entries.map((entry,index)=>{
 const seed=hash(entry.id),rand=random(seed),scaleName=(entry.young?'pentatonic':['major','dorian','lydian'][seed%3]) as keyof typeof modes,scale=modes[scaleName];
 const tonic=48+[0,2,4,5,7,9][(seed>>>4)%6],bpm=entry.young?66+(seed%6)*2:58+(seed%19)*2;
 const harmony=harmonicPlans[(seed>>>9)%harmonicPlans.length].map(n=>n%scale.length);
 const motif=Array.from({length:12},(_,i)=>i===0?0:Math.floor(rand()*5)-2);
 const pitch=(degree:number,octave=0)=>tonic+Math.floor(degree/scale.length)*12+scale[((degree%scale.length)+scale.length)%scale.length]+octave*12;
 const layers:InteractiveScore['layers']={foundation:[],melody:[],detail:[],pulse:[]};
 const palette=palettes[entry.scene]??palettes.islands;
 for(let bar=0;bar<8;bar++){
  const chord=harmony[bar],at=bar*4;
  for(const interval of [0,2,4])layers.foundation.push([at,3.8,pitch(chord+interval,interval===0?-1:0),interval===0?.42:.2]);
  const rhythm=rhythms[((seed>>>13)+bar*3+index)%rhythms.length];
  rhythm.forEach((offset,i)=>{const degree=i===0?chord:chord+[0,2,4][Math.abs(motif[(bar*3+i)%12]+bar)%3]+(i%2?motif[(bar+i)%12]:0);const next=rhythm[i+1]??4;layers.melody.push([at+offset,Math.min(entry.young?1.05:1.5,Math.max(.28,next-offset-.08)),pitch(degree,1),.32+rand()*.14]);});
  if(bar%2===1){const offset=entry.young?2.5:1.5;layers.detail.push([at+offset,.55,pitch(chord+4,1),.23],[at+offset+.75,.7,pitch(chord+2,1),.2]);}
  for(const offset of (index%3===0?[0,2]:index%3===1?[0,1.5,3]:[0,2.5]))layers.pulse.push([at+offset,.22,pitch(chord,-1),.22]);
 }
 const instruments={foundation:palette[0],melody:palette[1],detail:palette[2],pulse:palette[3]};
 return{id:`score-${entry.id}`,name:entry.name,mood:entry.mood,collection:entry.scaffoldId?'World scores':'Focus collection',description:`An original eight-bar modular score for ${entry.name.toLowerCase()}. Foundation, melody, detail and pulse respond to the learning phase; shared synthesized instruments, no recording or external samples.`,...(entry.scaffoldId?{scaffoldId:entry.scaffoldId}:{}),bpm,beats:32,tonic,mode:scaleName,harmony,motif,instruments,layers,license:'LicenseRef-Asterloom-Personal-Learning',composer:'Asterloom original score'};
});
if(scores.length!==90||new Set(scores.map(s=>s.id)).size!==90)throw new Error('Expected exactly 90 original score arrangements.');
// Transposition or a renamed copy does not count as a new prepared arrangement.
const identities=scores.map(s=>JSON.stringify([s.harmony,s.layers.melody.map(([t,d,p])=>[t,d,p-s.tonic])]));
if(new Set(identities).size!==90)throw new Error('Duplicate rhythmic/harmonic arrangement.');
const target=new URL('../src/data/interactiveScores.generated.json',import.meta.url),text=JSON.stringify({version:1,provenance:'90 original prepared modular arrangements. Shared compositional grammar and synthesized instrument palettes; not 90 independently recorded songs.',scores})+'\n';
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==text)throw new Error('Prepared music catalog is stale. Regenerate and review it.');}
else await writeFile(target,text);
console.log(`Prepared ${scores.length} distinct original interactive score arrangements; 75 recipe assignments, 15 additional moods.`);

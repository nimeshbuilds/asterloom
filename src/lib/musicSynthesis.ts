import type {InteractiveScore,MusicPhase,ScoreInstrument,ScoreLayer,ScoreNote} from './scoreTypes';
import {PHASE_MIX} from './scoreTypes';
export const SCORE_LAYERS:ScoreLayer[]=['foundation','melody','detail','pulse'];
export interface PreparedEvent {layer:ScoreLayer;note:ScoreNote}
export const scoreEvents=(score:InteractiveScore):PreparedEvent[]=>SCORE_LAYERS.flatMap(layer=>score.layers[layer].map(note=>({layer,note}))).sort((a,b)=>a.note[0]-b.note[0]||SCORE_LAYERS.indexOf(a.layer)-SCORE_LAYERS.indexOf(b.layer));
/** Eight phrase sections develop the supplied harmony: opening, response,
 * contrast, space, development, return, release, reprise. These are procedural
 * arrangements of the existing score, not extra recorded tracks. */
export function arrangedScoreEvents(score:InteractiveScore,variation=0,cycle=0):PreparedEvent[]{
 const opening=((Math.max(0,Math.floor(variation))%4)*8)%score.beats;
 const section=(Math.max(0,Math.floor(cycle))+Math.floor(Math.max(0,variation)/4))%8;
 const harmonicShift=[0,0,2,0,4,0,6,0][section];
 const scale:readonly number[]=({major:[0,2,4,5,7,9,11],dorian:[0,2,3,5,7,9,10],lydian:[0,2,4,6,7,9,11],pentatonic:[0,2,4,7,9]} as Record<string,number[]>)[score.mode]??[0,2,4,5,7,9,11];
 const shiftDegree=(midi:number,steps:number)=>{const relative=midi-score.tonic,octave=Math.floor(relative/12),pitch=((relative%12)+12)%12;let index=0;for(let i=1;i<scale.length;i++)if(Math.abs(scale[i]-pitch)<Math.abs(scale[index]-pitch))index=i;const degree=index+steps;return score.tonic+(octave+Math.floor(degree/scale.length))*12+scale[((degree%scale.length)+scale.length)%scale.length];};
 return scoreEvents(score).flatMap(event=>{
  const [position,duration,midi,velocity]=event.note,at=(position-opening+score.beats)%score.beats,bar=Math.floor(at/4),originalBar=Math.floor(position/4);
  if(event.layer==='detail'&&([0,3,5,7].includes(section)||bar%2===0))return[];
  if(event.layer==='melody'&&((section===1&&bar%2===1&&at%4>=2)||(section===3&&bar>=6)||(section===7&&bar===7&&at%4>=1)))return[];
  if(event.layer==='pulse'&&((section===3&&bar>=4)||(section===7&&bar>=6)))return[];
  const originalChord=score.harmony[originalBar%score.harmony.length],nextChord=score.harmony[(originalBar+harmonicShift)%score.harmony.length];
  let pitch=shiftDegree(midi,nextChord-originalChord);
  // Contrasting melodic registers sit above the same changed chord; final
  // phrases return home. Foundation and pulse remain out of the speech range.
  if(event.layer==='melody'&&(section===4||section===6))pitch-=12;
  if(event.layer==='melody'&&pitch>83)pitch-=12;
  const dynamics=(bar<4?1:.88)*(section===1?.86:section===3?.7:section===7?.78:1);
  return[{layer:event.layer,note:[at,Math.min(duration,score.beats-at),Math.max(28,Math.min(96,pitch)),velocity*dynamics] as ScoreNote}];
 }).sort((a,b)=>a.note[0]-b.note[0]||SCORE_LAYERS.indexOf(a.layer)-SCORE_LAYERS.indexOf(b.layer));
}
/** Keep a cue's rhythm/intervals but place its tonal centre near the active prepared score. */
export function cuePitchOffset(anchor:number,tonic?:number):number {
 if(tonic===undefined||!Number.isFinite(tonic)||!Number.isFinite(anchor))return 0;
 return((Math.round(tonic)-Math.round(anchor)+6)%12+12)%12-6;
}
/** A small filtered stereo room, shared by music voices only. No downloaded impulse or samples. */
export function createScoreSpace(context:BaseAudioContext,destination:AudioNode){
 const input=context.createGain(),dry=context.createGain(),delay=context.createDelay(.5),tone=context.createBiquadFilter(),wet=context.createGain(),feedback=context.createGain();
 dry.gain.value=.92;delay.delayTime.value=.173;tone.type='lowpass';tone.frequency.value=1500;tone.Q.value=.2;wet.gain.value=.12;feedback.gain.value=.16;
 input.connect(dry);dry.connect(destination);input.connect(delay);delay.connect(tone);tone.connect(wet);wet.connect(destination);tone.connect(feedback);feedback.connect(delay);
 return{input,dispose:()=>{for(const node of [input,dry,delay,tone,wet,feedback])node.disconnect();}};
}
const spectra:Record<ScoreInstrument,number[]>={felt:[0,1,.18,.045,.012],glass:[0,1,.28,.04,.09],marimba:[0,1,.055,.16,.018],plucked:[0,1,.22,.09,.045],air:[0,1,.08,.025],round:[0,1,.03]};
const waves=new WeakMap<BaseAudioContext,Map<ScoreInstrument,PeriodicWave>>();
function wave(context:BaseAudioContext,instrument:ScoreInstrument){let cache=waves.get(context);if(!cache){cache=new Map();waves.set(context,cache);}let value=cache.get(instrument);if(!value){const imag=new Float32Array(spectra[instrument]);value=context.createPeriodicWave(new Float32Array(imag.length),imag);cache.set(instrument,value);}return value;}
/** One original synthesized instrument voice; safe for realtime or OfflineAudioContext. */
export function scheduleVoice(context:BaseAudioContext,destination:AudioNode,{at,duration,midi,velocity,instrument,pan=0,musical=false}:{at:number;duration:number;midi:number;velocity:number;instrument:ScoreInstrument;pan?:number;musical?:boolean}):OscillatorNode{
 const start=Math.max(0,at),length=Math.max(.08,Math.min(8,duration)),osc=context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter();
 osc.setPeriodicWave(wave(context,instrument));osc.frequency.value=440*2**((Math.max(28,Math.min(96,midi))-69)/12);
 filter.type='lowpass';filter.frequency.value=musical?(instrument==='glass'?2400:instrument==='air'?1200:2100):(instrument==='glass'?4300:instrument==='air'?1400:2600);filter.Q.value=.3;
 if(musical){filter.frequency.setValueAtTime(filter.frequency.value,start);filter.frequency.exponentialRampToValueAtTime(instrument==='air'?900:1100,start+length);}
 const attack=Math.min(length*.24,instrument==='air'?.16:instrument==='felt'?(musical?.035:.025):(musical?.024:.012)),peak=Math.max(.0001,Math.min(1,velocity))*.18,release=instrument==='air'?.45:.22;
 gain.gain.setValueAtTime(.00001,start);gain.gain.exponentialRampToValueAtTime(peak,start+attack);gain.gain.exponentialRampToValueAtTime(Math.max(.00001,peak*(instrument==='air'?.65:.1)),start+length);gain.gain.exponentialRampToValueAtTime(.00001,start+length+release);
 osc.connect(filter);filter.connect(gain);let panner:StereoPannerNode|undefined;
 if(typeof context.createStereoPanner==='function'){panner=context.createStereoPanner();panner.pan.value=Math.max(-.65,Math.min(.65,pan));gain.connect(panner);panner.connect(destination);}else gain.connect(destination);
 osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect();};osc.start(start);osc.stop(start+length+release+.02);return osc;
}
export function createLayerMixer(context:BaseAudioContext,destination:AudioNode,phase:MusicPhase){return Object.fromEntries(SCORE_LAYERS.map(layer=>{const gain=context.createGain();gain.gain.value=PHASE_MIX[phase][layer];gain.connect(destination);return[layer,gain];})) as Record<ScoreLayer,GainNode>;}
/** Shared offline rendering path used to inspect actual sample peaks and phase dynamics. */
export function schedulePreparedScore(context:BaseAudioContext,destination:AudioNode,score:InteractiveScore,{seconds,phase='practice',volume=.3,start=0,variation=0}:{seconds:number;phase?:MusicPhase;volume?:number;start?:number;variation?:number}){
 const master=context.createGain();master.gain.value=Math.max(0,Math.min(1,volume));master.connect(destination);const space=createScoreSpace(context,master),mixer=createLayerMixer(context,space.input,phase),beat=60/score.bpm,loop=score.beats*beat;
 for(let offset=0,cycle=0;offset<Math.min(600,seconds);offset+=loop,cycle++)for(const {layer,note:[at,duration,midi,velocity]}of arrangedScoreEvents(score,variation,cycle)){const time=offset+at*beat;if(time>=seconds)continue;scheduleVoice(context,mixer[layer],{at:start+time,duration:duration*beat,midi,velocity,instrument:score.instruments[layer],pan:layer==='detail'?.32:layer==='melody'?-.12:0,musical:true});}
 return master;
}

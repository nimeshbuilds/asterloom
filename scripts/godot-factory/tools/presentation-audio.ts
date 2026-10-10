import {arrangedScoreEvents} from '../../../src/lib/musicSynthesis';
import {PHASE_MIX,type InteractiveScore,type ScoreInstrument} from '../../../src/lib/scoreTypes';
import {actionCuePlan,type GameActionCue} from '../../../src/lib/actionFeedback';
import {feedbackCuePlan,type ReactionOutcome} from '../../../src/data/reactionProfiles';
export interface NativeNote {at:number;duration:number;midi:number;velocity:number;instrument:ScoreInstrument}
export const NATIVE_SAMPLE_RATE=22050;
const spectra:Record<ScoreInstrument,number[]>={felt:[1,.18,.045,.012],glass:[1,.28,.04,.09],marimba:[1,.055,.16,.018],plucked:[1,.22,.09,.045],air:[1,.08,.025],round:[1,.03]};
/** Offline, bounded PCM rendition of the shipped note plans. Same pitches,
 * rhythms, timbres and envelope policy as musicSynthesis; no browser required. */
export function renderNativePcm(notes:NativeNote[],seconds:number,loop=false):{wav:Buffer;peak:number;nonzero:number;frames:number} {
 if(!Number.isFinite(seconds)||seconds<=0||seconds>180||notes.length>10000)throw new Error('Native audio exceeds its bounded render budget.');
 const frames=Math.ceil(seconds*NATIVE_SAMPLE_RATE),samples=new Float32Array(frames);
 for(const note of notes){
  if(![note.at,note.duration,note.midi,note.velocity].every(Number.isFinite)||note.at<0||note.duration<=0||!spectra[note.instrument])throw new Error('Invalid authored note.');
  const start=Math.round(note.at*NATIVE_SAMPLE_RATE),duration=Math.min(8,Math.max(.08,note.duration)),release=note.instrument==='air'?.45:.22;
  const attack=Math.min(duration*.24,note.instrument==='air'?.16:note.instrument==='felt'?.035:.024);
  const peak=Math.min(1,Math.max(.0001,note.velocity))*.18,end=Math.max(.00001,peak*(note.instrument==='air'?.65:.1));
  const frequency=440*2**((Math.max(28,Math.min(96,note.midi))-69)/12),harmonics=spectra[note.instrument],sum=harmonics.reduce((a,b)=>a+b,0);
  const cutoff=note.instrument==='air'?1200:note.instrument==='glass'?2400:2100,alpha=1-Math.exp(-2*Math.PI*cutoff/NATIVE_SAMPLE_RATE);
  let previous=0;
  for(let i=0;i<Math.ceil((duration+release)*NATIVE_SAMPLE_RATE);i++){
   const target=start+i;if(!loop&&target>=frames)break;
   const t=i/NATIVE_SAMPLE_RATE;
   const env=t<attack?.00001*(peak/.00001)**(t/attack):t<duration?peak*(end/peak)**((t-attack)/(duration-attack)):end*(.00001/end)**((t-duration)/release);
   const phase=2*Math.PI*frequency*t;
   let wave=0;for(let h=0;h<harmonics.length;h++)if(frequency*(h+1)<NATIVE_SAMPLE_RATE/2)wave+=harmonics[h]*Math.sin(phase*(h+1))/sum;
   previous+=alpha*(wave-previous);samples[target%frames]+=previous*env;
  }
 }
 let peak=0,nonzero=0;for(const sample of samples){peak=Math.max(peak,Math.abs(sample));if(Math.abs(sample)>.00003)nonzero++;}
 if(peak>.9)throw new Error(`Authored native mix clips (${peak}).`);
 const wav=Buffer.alloc(44+frames*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(NATIVE_SAMPLE_RATE,24);wav.writeUInt32LE(NATIVE_SAMPLE_RATE*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)wav.writeInt16LE(Math.round(samples[i]*32767),44+i*2);
 return{wav,peak,nonzero,frames};
}
export function nativeScorePlan(score:InteractiveScore){
 const beat=60/score.bpm;
 return{seconds:score.beats*beat,notes:arrangedScoreEvents(score,0,0).map(({layer,note:[at,duration,midi,velocity]})=>({at:at*beat,duration:duration*beat,midi,velocity:velocity*PHASE_MIX.practice[layer],instrument:score.instruments[layer]}))};
}
export const NATIVE_CUES=['select','place','move','connect','remove','inspect','reveal','commit','success','retry','complete'] as const;
export function nativeCuePlan(cue:typeof NATIVE_CUES[number],profile:string,age:string){
 if(['success','retry','complete'].includes(cue)){
  const plan=feedbackCuePlan(cue as ReactionOutcome,profile,age);
  return{seconds:plan.maxDuration,notes:[...plan.notes.map(note=>({...note,instrument:plan.instrument})),...plan.support]};
 }
 const plan=actionCuePlan(cue as GameActionCue,profile,age);
 return{seconds:Math.max(...plan.notes.map(note=>note.at+note.duration))+.47,notes:plan.notes.map(note=>({...note,instrument:plan.instrument}))};
}

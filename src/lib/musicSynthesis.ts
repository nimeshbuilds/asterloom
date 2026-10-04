import type {InteractiveScore,MusicPhase,ScoreInstrument,ScoreLayer,ScoreNote} from './scoreTypes';
import {PHASE_MIX} from './scoreTypes';
export const SCORE_LAYERS:ScoreLayer[]=['foundation','melody','detail','pulse'];
export interface PreparedEvent {layer:ScoreLayer;note:ScoreNote}
export const scoreEvents=(score:InteractiveScore):PreparedEvent[]=>SCORE_LAYERS.flatMap(layer=>score.layers[layer].map(note=>({layer,note}))).sort((a,b)=>a.note[0]-b.note[0]||SCORE_LAYERS.indexOf(a.layer)-SCORE_LAYERS.indexOf(b.layer));
const spectra:Record<ScoreInstrument,number[]>={felt:[0,1,.18,.045,.012],glass:[0,1,.28,.04,.09],marimba:[0,1,.055,.16,.018],plucked:[0,1,.22,.09,.045],air:[0,1,.08,.025],round:[0,1,.03]};
const waves=new WeakMap<BaseAudioContext,Map<ScoreInstrument,PeriodicWave>>();
function wave(context:BaseAudioContext,instrument:ScoreInstrument){let cache=waves.get(context);if(!cache){cache=new Map();waves.set(context,cache);}let value=cache.get(instrument);if(!value){const imag=new Float32Array(spectra[instrument]);value=context.createPeriodicWave(new Float32Array(imag.length),imag);cache.set(instrument,value);}return value;}
/** One original synthesized instrument voice; safe for realtime or OfflineAudioContext. */
export function scheduleVoice(context:BaseAudioContext,destination:AudioNode,{at,duration,midi,velocity,instrument,pan=0}:{at:number;duration:number;midi:number;velocity:number;instrument:ScoreInstrument;pan?:number}):OscillatorNode{
 const start=Math.max(0,at),length=Math.max(.08,Math.min(8,duration)),osc=context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter();
 osc.setPeriodicWave(wave(context,instrument));osc.frequency.value=440*2**((Math.max(28,Math.min(96,midi))-69)/12);
 filter.type='lowpass';filter.frequency.value=instrument==='glass'?4300:instrument==='air'?1400:2600;filter.Q.value=.3;
 const attack=Math.min(length*.24,instrument==='air'?.16:instrument==='felt'?.025:.012),peak=Math.max(.0001,Math.min(1,velocity))*.18,release=instrument==='air'?.45:.22;
 gain.gain.setValueAtTime(.00001,start);gain.gain.exponentialRampToValueAtTime(peak,start+attack);gain.gain.exponentialRampToValueAtTime(Math.max(.00001,peak*(instrument==='air'?.65:.1)),start+length);gain.gain.exponentialRampToValueAtTime(.00001,start+length+release);
 osc.connect(filter);filter.connect(gain);let panner:StereoPannerNode|undefined;
 if(typeof context.createStereoPanner==='function'){panner=context.createStereoPanner();panner.pan.value=Math.max(-.65,Math.min(.65,pan));gain.connect(panner);panner.connect(destination);}else gain.connect(destination);
 osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect();};osc.start(start);osc.stop(start+length+release+.02);return osc;
}
export function createLayerMixer(context:BaseAudioContext,destination:AudioNode,phase:MusicPhase){return Object.fromEntries(SCORE_LAYERS.map(layer=>{const gain=context.createGain();gain.gain.value=PHASE_MIX[phase][layer];gain.connect(destination);return[layer,gain];})) as Record<ScoreLayer,GainNode>;}
/** Shared offline rendering path used to inspect actual sample peaks and phase dynamics. */
export function schedulePreparedScore(context:BaseAudioContext,destination:AudioNode,score:InteractiveScore,{seconds,phase='practice',volume=.3,start=0}:{seconds:number;phase?:MusicPhase;volume?:number;start?:number}){
 const master=context.createGain();master.gain.value=Math.max(0,Math.min(1,volume));master.connect(destination);const mixer=createLayerMixer(context,master,phase),beat=60/score.bpm,loop=score.beats*beat,events=scoreEvents(score);
 for(let offset=0;offset<Math.min(600,seconds);offset+=loop)for(const {layer,note:[at,duration,midi,velocity]}of events){const time=offset+at*beat;if(time>=seconds)continue;scheduleVoice(context,mixer[layer],{at:start+time,duration:duration*beat,midi,velocity,instrument:score.instruments[layer],pan:layer==='detail'?.32:layer==='melody'?-.12:0});}
 return master;
}

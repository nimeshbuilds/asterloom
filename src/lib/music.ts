import {RECORDINGS} from './musicRecordings';
export const MUSIC_TRACKS = [
 {id:'first-light',name:'A Place I Call Home',mood:'Warm · piano',bpm:68,notes:[60,64,67,72,67,64,62,67],bass:[48,45,41,43]},
 {id:'paper-stars',name:'Childhood Friends',mood:'Light · bells',bpm:76,notes:[72,76,79,76,74,77,81,77],bass:[48,53,45,43]},
 {id:'moss-and-morning',name:'Peaceful Days',mood:'Gentle · woodland',bpm:62,notes:[62,65,69,74,69,65,67,64],bass:[50,46,43,45]},
 {id:'tidepool',name:'Sand Castles',mood:'Flowing · marimba',bpm:74,notes:[65,69,72,77,72,69,67,72],bass:[41,46,48,43]},
 {id:'little-machines',name:'Swinging Sweet',mood:'Playful · plucked',bpm:90,notes:[60,67,64,72,62,69,65,74],bass:[48,50,45,43]},
 {id:'the-quiet-atlas',name:'Winter Dust',mood:'Spacious · ambient',bpm:54,notes:[57,64,69,71,64,60,67,64],bass:[45,41,48,43]},
 {id:'golden-hour',name:'Summer Memories',mood:'Bright · keys',bpm:78,notes:[67,71,74,79,74,71,69,72],bass:[43,48,40,45]},
 {id:'moon-library',name:'A Brand New Wisdom',mood:'Reflective · soft bells',bpm:58,notes:[64,67,71,76,71,67,69,66],bass:[40,45,43,47]},
 {id:'pocket-adventure',name:'Just Saying Tho',mood:'Curious · pizzicato',bpm:84,notes:[62,69,66,74,64,71,67,76],bass:[50,47,43,45]},
 {id:'homeward',name:'Innocence',mood:'Comforting · piano',bpm:66,notes:[60,65,69,72,69,65,64,67],bass:[41,48,45,46]},
];
let recording:HTMLAudioElement|undefined;
let currentVolume=.15;
let context:AudioContext|undefined,timer:ReturnType<typeof setInterval>|undefined,master:GainNode|undefined,step=0;
export function stopMusic(){if(recording){recording.pause();recording.src='';recording=undefined;}if(timer)clearInterval(timer);timer=undefined;context?.close().catch(()=>{});context=undefined;}
export function playMusic(id:string,volume=.15){stopMusic();const t=MUSIC_TRACKS.find(x=>x.id===id)||MUSIC_TRACKS[0];currentVolume=volume;context=new AudioContext();void context.resume().catch(()=>{});master=context.createGain();master.gain.value=volume*.32;master.connect(context.destination);if(RECORDINGS[id]&&new Audio().canPlayType('audio/ogg; codecs=vorbis')){recording=new Audio(RECORDINGS[id]);recording.loop=true;recording.volume=volume;void recording.play().catch(()=>{});return;}step=0;const play=(midi:number,duration:number,gain=.5)=>{if(!context||!master)return;const o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(0,context.currentTime);g.gain.linearRampToValueAtTime(gain,context.currentTime+.02);g.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);o.connect(g);g.connect(master);o.start();o.stop(context.currentTime+duration);};const tick=()=>{play(t.notes[step%8],2.2);if(step%4===0)play(t.bass[Math.floor(step/4)%4],3.5,.35);step++;};tick();timer=setInterval(tick,60000/t.bpm);}
export function setMusicVolume(volume:number){currentVolume=volume;if(recording)recording.volume=volume;if(master)master.gain.value=volume*.32;}

/** Prepared scene/family assignments, not a runtime model call. */
export function soundtrackForScaffold(scaffold:{id:string;family:string;visual?:{scene:string};ages?:string[]}):{trackId:string;reason:string}{
 const scene=scaffold.visual?.scene||'islands';
 if(scaffold.ages?.length===1&&scaffold.ages[0]==='3-5')return{trackId:'paper-stars',reason:'Gentle, predictable notes for exploring together.'};
 if(scaffold.family==='explain')return{trackId:'the-quiet-atlas',reason:'A sparse arrangement leaves room for reading and reflection.'};
 if(scaffold.family==='sequence')return{trackId:'little-machines',reason:'A steady, unhurried pulse for putting steps together.'};
 if(scaffold.family==='scenario')return{trackId:'pocket-adventure',reason:'A curious melody for making decisions and following clues.'};
 const tracks:Record<string,string>={islands:'first-light',observatory:'paper-stars',forest:'moss-and-morning',workshop:'little-machines',ocean:'tidepool',library:'moon-library'};
 return{trackId:tracks[scene]||'golden-hour',reason:'A prepared ambient score matched to this learning world.'};
}
export function musicFeedback(kind:'success'|'try-again'|'complete'){
 if(!context||!master||context.state!=='running')return;
 const notes=kind==='complete'?[60,64,67,72]:kind==='success'?[72,76]:[67,64];
 notes.forEach((midi,i)=>{if(!context||!master)return;const t=context.currentTime+i*.11,o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.15,t+.025);g.gain.exponentialRampToValueAtTime(.001,t+.55);o.connect(g);g.connect(master);o.start(t);o.stop(t+.6);});
}
export function duckMusic(duck:boolean){if(recording)recording.volume=duck?currentVolume*.15:currentVolume;if(context&&master)master.gain.setTargetAtTime(duck?.009:currentVolume*.32,context.currentTime,.15);}

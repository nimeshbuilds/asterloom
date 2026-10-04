/** Prepared note events use beats, duration in beats, MIDI pitch and velocity. */
export type ScoreNote = [number, number, number, number];
export type ScoreLayer = 'foundation'|'melody'|'detail'|'pulse';
export type MusicPhase = 'intro'|'study'|'practice'|'quest'|'success'|'retry';
export type ScoreInstrument = 'felt'|'glass'|'marimba'|'plucked'|'air'|'round';
export interface InteractiveScore {
 id:string; name:string; mood:string; collection:string; description:string; scaffoldId?:string;
 bpm:number; beats:number; tonic:number; mode:string; harmony:number[]; motif:number[];
 instruments:Record<ScoreLayer,ScoreInstrument>;
 layers:Record<ScoreLayer,ScoreNote[]>;
 license:'LicenseRef-Asterloom-Personal-Learning'; composer:'Asterloom original score';
}
export const PHASE_MIX:Record<MusicPhase,Record<ScoreLayer,number>>={
 intro:{foundation:.7,melody:.45,detail:0,pulse:0},
 study:{foundation:.52,melody:.2,detail:0,pulse:0},
 practice:{foundation:.72,melody:.6,detail:.26,pulse:.24},
 quest:{foundation:.75,melody:.7,detail:.4,pulse:.43},
 success:{foundation:.75,melody:.72,detail:.5,pulse:.3},
 retry:{foundation:.55,melody:.32,detail:.08,pulse:0},
};

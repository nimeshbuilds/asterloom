import type { ActivityBase, Evaluation } from './structuredEngine';
import { isPictureNarration, isPictureRaster } from './pictureEngine';
import type { PictureSource } from './pictureEngine';
export interface ChildPlayFigure { sourceId: string; x: number; y: number; width: number; height: number; alt: string }
export interface ChildPlayCharacter { id: string; name: string; role: string; puppet: 'round' | 'pointed' | 'long-ears'; color: 'sage' | 'coral' | 'blue' | 'gold'; figure?: ChildPlayFigure; evidenceRefs: number[] }
export interface ChildPlayProp { id: string; name: string; symbol: 'apple' | 'cup' | 'book' | 'parcel' | 'seed' | 'basket' | 'token'; figure?: ChildPlayFigure; evidenceRefs: number[] }
export interface ChildPlayStation { id: string; name: string; evidenceRefs: number[] }
export interface ChildPlayScene {
  id: string; title: string; narrative: string; speakerId: string;
  propLocations: Record<string, string>; mood: 'ready' | 'thinking' | 'celebrating';
  ending?: 'goal' | 'reflect'; narrationSourceId?: string; evidenceRefs: number[];
}
export interface ChildPlayAction { id: string; fromSceneId: string; toSceneId: string; actorId: string; kind: 'say' | 'use-prop'; label: string; propId?: string; stationId?: string; evidenceRefs: number[] }
export type ChildPlayObjective = { id: string; label: string; evidenceRefs: number[] } & ({ kind: 'perform'; actionIds: string[] } | { kind: 'place'; propId: string; stationId: string });
export interface ChildPlayActivity extends ActivityBase {
  kind: 'child-play'; mode: 'puppet-story' | 'pretend-play';
  characters: ChildPlayCharacter[]; props: ChildPlayProp[]; stations: ChildPlayStation[];
  scenes: ChildPlayScene[]; actions: ChildPlayAction[]; objectives: ChildPlayObjective[];
  startSceneId: string; maxTurns: number; caregiverNote: string;
}
export interface ChildPlayResponse {
  kind: 'child-play-response'; fingerprint: string; actionIds: string[];
  selectedActorId: string; selectedPropId: string; listenedSceneIds: string[];
  caregiverSupport: boolean; notice?: string;
}
export interface ChildPlaySnapshot {
  phase: 'active' | 'goal' | 'reflect' | 'pause' | 'invalid'; scene: ChildPlayScene;
  history: { action: ChildPlayAction; scene: ChildPlayScene }[];
  completedObjectiveIds: string[]; error?: string;
}
const BASE = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'kind', 'scaffoldIds', 'extractedFrom'];
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
const fields = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(key => allowed.includes(key));
function rows(value: unknown, min: number, max: number, name: string, errors: string[]): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) { errors.push(`${name}: expected ${min}–${max} entries`); return []; }
  const seen = new Set<string>();
  return value.filter((v, index) => {
    if (!plain(v) || !id(v.id) || seen.has(v.id)) { errors.push(`${name}[${index}]: invalid or duplicate identifier`); return false; }
    seen.add(v.id); return true;
  });
}
function validFigure(value: unknown): value is ChildPlayFigure {
  if (!plain(value) || !fields(value, ['sourceId', 'x', 'y', 'width', 'height', 'alt']) || !id(value.sourceId) || !text(value.alt, 500)) return false;
  return [value.x, value.y, value.width, value.height].every(v => typeof v === 'number' && Number.isFinite(v)) && (value.x as number) >= 0 && (value.y as number) >= 0 && (value.width as number) >= 2 && (value.height as number) >= 2 && (value.x as number) + (value.width as number) <= 100 && (value.y as number) + (value.height as number) <= 100;
}
function completeObjectives(activity: ChildPlayActivity, scene: ChildPlayScene, actions: string[]): string[] {
  return activity.objectives.filter(goal => goal.kind === 'perform' ? goal.actionIds.some(id => actions.includes(id)) : scene.propLocations[goal.propId] === goal.stationId).map(goal => goal.id);
}
function graphProblems(activity: ChildPlayActivity): string[] {
  const errors = new Set<string>(), seen = new Set<string>(), reached = new Set<string>();
  const perform = activity.objectives.filter((goal): goal is ChildPlayObjective & { kind: 'perform' } => goal.kind === 'perform');
  const queue: { sceneId: string; mask: number; turns: number }[] = [{ sceneId: activity.startSceneId, mask: 0, turns: 0 }];
  let solvable = false;
  while (queue.length) {
    const state = queue.shift()!, key = `${state.sceneId}:${state.mask}`;
    if (seen.has(key)) continue; seen.add(key); reached.add(state.sceneId);
    const scene = activity.scenes.find(scene => scene.id === state.sceneId)!;
    if (scene.ending === 'goal') {
      const goalsMet = perform.every((_, i) => (state.mask & 1 << i) !== 0) && activity.objectives.every(goal => goal.kind !== 'place' || scene.propLocations[goal.propId] === goal.stationId);
      if (goalsMet) solvable = true; else errors.add('child-play: a goal ending can be reached without fulfilling its reviewed objectives');
    }
    if (scene.ending || state.turns >= activity.maxTurns) continue;
    for (const action of activity.actions.filter(action => action.fromSceneId === scene.id)) {
      let mask = state.mask; perform.forEach((goal, index) => { if (goal.actionIds.includes(action.id)) mask |= 1 << index; });
      queue.push({ sceneId: action.toSceneId, mask, turns: state.turns + 1 });
    }
  }
  if (!solvable) errors.add('child-play: the reviewed objectives must be achievable within the turn limit');
  if (activity.scenes.some(scene => !reached.has(scene.id))) errors.add('child-play: every prepared scene must be reachable within the turn limit');
  return [...errors];
}
export function validateChildPlayFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [], refs: unknown[] = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  const validRefs = (value: unknown): value is number[] => Array.isArray(value) && value.length > 0 && value.length <= 12 && new Set(value).size === value.length && value.every(i => Number.isInteger(i) && i >= 0 && i < refs.length);
  const quotes = (indexes: unknown) => validRefs(indexes) ? indexes.map(index => refs[index]).filter(plain).map(ref => typeof ref.evidence === 'string' ? ref.evidence : '').join('\n') : '';
  const cited = (item: Record<string, unknown>, label: string, name: string) => { if (!validRefs(item.evidenceRefs) || !quotes(item.evidenceRefs).includes(label)) errors.push(`${name}: cite source text containing its exact name or line`); };
  const figure = (item: Record<string, unknown>, name: string) => { if (item.figure !== undefined && (!validFigure(item.figure) || !validRefs(item.evidenceRefs) || !item.evidenceRefs.some(i => plain(refs[i]) && refs[i].sourceId === (item.figure as ChildPlayFigure).sourceId))) errors.push(`${name}: an image crop must refer to a cited source image`); };
  if (input.kind !== 'child-play' || !fields(input, [...BASE, 'mode', 'characters', 'props', 'stations', 'scenes', 'actions', 'objectives', 'startSceneId', 'maxTurns', 'caregiverNote'])) errors.push('child-play: unsupported or unknown field');
  if (!['puppet-story', 'pretend-play'].includes(String(input.mode)) || !text(input.caregiverNote)) errors.push('child-play: choose a supported mode and provide caregiver guidance');
  if (typeof input.maxTurns !== 'number' || !Number.isInteger(input.maxTurns) || input.maxTurns < 2 || input.maxTurns > 24) errors.push('child-play.maxTurns: expected 2–24 turns');
  const characters = rows(input.characters, 2, 4, 'child-play.characters', errors), props = rows(input.props, 1, 6, 'child-play.props', errors), stations = rows(input.stations, 2, 4, 'child-play.stations', errors), scenes = rows(input.scenes, 3, 12, 'child-play.scenes', errors), actions = rows(input.actions, 2, 32, 'child-play.actions', errors), goals = rows(input.objectives, 1, 6, 'child-play.objectives', errors);
  const characterIds = new Set(characters.map(v => v.id)), propIds = new Set(props.map(v => v.id)), stationIds = new Set(stations.map(v => v.id)), sceneIds = new Set(scenes.map(v => v.id)), actionIds = new Set(actions.map(v => v.id));
  characters.forEach((character, index) => {
    if (!fields(character, ['id', 'name', 'role', 'puppet', 'color', 'figure', 'evidenceRefs']) || !text(character.name, 100) || !text(character.role, 200) || !['round', 'pointed', 'long-ears'].includes(String(character.puppet)) || !['sage', 'coral', 'blue', 'gold'].includes(String(character.color))) errors.push(`child-play.characters[${index}]: invalid character`);
    cited(character, String(character.name), `child-play.characters[${index}]`); if (!quotes(character.evidenceRefs).includes(String(character.role))) errors.push(`child-play.characters[${index}]: the role must be present in its cited source`); figure(character, `child-play.characters[${index}]`);
  });
  props.forEach((prop, index) => {
    if (!fields(prop, ['id', 'name', 'symbol', 'figure', 'evidenceRefs']) || !text(prop.name, 100) || !['apple', 'cup', 'book', 'parcel', 'seed', 'basket', 'token'].includes(String(prop.symbol))) errors.push(`child-play.props[${index}]: invalid prop`);
    cited(prop, String(prop.name), `child-play.props[${index}]`); figure(prop, `child-play.props[${index}]`);
  });
  stations.forEach((station, index) => { if (!fields(station, ['id', 'name', 'evidenceRefs']) || !text(station.name, 100)) errors.push(`child-play.stations[${index}]: invalid station`); cited(station, String(station.name), `child-play.stations[${index}]`); });
  if (!sceneIds.has(input.startSceneId)) errors.push('child-play.startSceneId: choose a prepared scene');
  scenes.forEach((scene, index) => {
    if (!fields(scene, ['id', 'title', 'narrative', 'speakerId', 'propLocations', 'mood', 'ending', 'narrationSourceId', 'evidenceRefs']) || !text(scene.title, 150) || !text(scene.narrative) || !characterIds.has(scene.speakerId) || !['ready', 'thinking', 'celebrating'].includes(String(scene.mood)) || scene.ending !== undefined && !['goal', 'reflect'].includes(String(scene.ending))) errors.push(`child-play.scenes[${index}]: invalid scene`);
    cited(scene, String(scene.narrative), `child-play.scenes[${index}]`);
    if (!plain(scene.propLocations) || Object.keys(scene.propLocations).length !== props.length || [...propIds].some(prop => typeof prop !== 'string' || !plain(scene.propLocations) || !stationIds.has(scene.propLocations[prop]))) errors.push(`child-play.scenes[${index}]: place every prepared prop in a known station`);
    if (scene.narrationSourceId !== undefined && (!id(scene.narrationSourceId) || !validRefs(scene.evidenceRefs) || !scene.evidenceRefs.some(i => plain(refs[i]) && refs[i].sourceId === scene.narrationSourceId && typeof refs[i].evidence === 'string' && refs[i].evidence.includes(String(scene.narrative))))) errors.push(`child-play.scenes[${index}]: recorded narration requires a cited transcript of the exact scene line`);
    const outgoing = actions.filter(action => action.fromSceneId === scene.id);
    if (scene.ending ? outgoing.length > 0 : outgoing.length < 1) errors.push(`child-play.scenes[${index}]: active scenes need actions; endings must stop the story`);
  });
  actions.forEach((action, index) => {
    if (!fields(action, ['id', 'fromSceneId', 'toSceneId', 'actorId', 'kind', 'label', 'propId', 'stationId', 'evidenceRefs']) || !sceneIds.has(action.fromSceneId) || !sceneIds.has(action.toSceneId) || !characterIds.has(action.actorId) || !text(action.label, 250) || !['say', 'use-prop'].includes(String(action.kind)) || !validRefs(action.evidenceRefs)) errors.push(`child-play.actions[${index}]: invalid action or evidence`);
    if (action.fromSceneId === action.toSceneId) errors.push(`child-play.actions[${index}]: an action must produce a new scene and consequence`);
    if (!quotes(action.evidenceRefs).includes(String(action.label))) errors.push(`child-play.actions[${index}]: the exact action line must occur in its cited source`);
    const actor = characters.find(c => c.id === action.actorId); if (actor && !quotes(action.evidenceRefs).includes(String(actor.name))) errors.push(`child-play.actions[${index}]: cite the acting character`);
    if (action.kind === 'use-prop') {
      if (!propIds.has(action.propId) || !stationIds.has(action.stationId)) errors.push(`child-play.actions[${index}]: choose a known prop and destination station`);
      const prop = props.find(p => p.id === action.propId), station = stations.find(s => s.id === action.stationId);
      if (prop && station && (!quotes(action.evidenceRefs).includes(String(prop.name)) || !quotes(action.evidenceRefs).includes(String(station.name)))) errors.push(`child-play.actions[${index}]: cite the prop and station used by this action`);
          const before = scenes.find(s => s.id === action.fromSceneId), after = scenes.find(s => s.id === action.toSceneId);
      if (typeof action.propId === 'string' && before && after && plain(before.propLocations) && plain(after.propLocations) && (after.propLocations[action.propId] !== action.stationId || before.propLocations[action.propId] === action.stationId || [...propIds].some(id => typeof id === 'string' && id !== action.propId && plain(before.propLocations) && plain(after.propLocations) && before.propLocations[id] !== after.propLocations[id]))) errors.push(`child-play.actions[${index}]: a prop action must move that prop to its chosen station and leave other props in place`);
    } else if (action.propId !== undefined || action.stationId !== undefined) errors.push(`child-play.actions[${index}]: dialogue cannot contain a prop placement`);
  });
  const gestures = actions.map(action => JSON.stringify([action.fromSceneId, action.actorId, action.kind, action.kind === 'use-prop' ? action.propId : action.label, action.stationId]));
  if (new Set(gestures).size !== gestures.length) errors.push('child-play.actions: each character gesture must have one unambiguous consequence in its scene');
  goals.forEach((goal, index) => {
    if (!fields(goal, ['id', 'label', 'kind', 'actionIds', 'propId', 'stationId', 'evidenceRefs']) || !text(goal.label) || !validRefs(goal.evidenceRefs)) errors.push(`child-play.objectives[${index}]: invalid reviewed objective`);
    if (goal.kind === 'perform') { if (!Array.isArray(goal.actionIds) || !goal.actionIds.length || goal.actionIds.length > 8 || new Set(goal.actionIds).size !== goal.actionIds.length || goal.actionIds.some(value => !actionIds.has(value)) || goal.propId !== undefined || goal.stationId !== undefined) errors.push(`child-play.objectives[${index}]: choose known action alternatives`); }
    else if (goal.kind === 'place') { if (!propIds.has(goal.propId) || !stationIds.has(goal.stationId) || goal.actionIds !== undefined) errors.push(`child-play.objectives[${index}]: choose a known prop and goal station`); }
    else errors.push(`child-play.objectives[${index}]: unsupported objective`);
  });
  if (input.mode === 'puppet-story' && (new Set(actions.filter(a => a.kind === 'say').map(a => a.actorId)).size < 2 || !scenes.some(scene => actions.filter(a => a.fromSceneId === scene.id).length >= 2))) errors.push('child-play: puppet stories require turn-taking by two characters and a meaningful branch');
  if (input.mode === 'pretend-play') {
    const propActions = actions.filter(a => a.kind === 'use-prop');
    if (props.length < 2 || propActions.length < 2 || !propActions.some(action => { const before = scenes.find(s => s.id === action.fromSceneId), after = scenes.find(s => s.id === action.toSceneId); return before && after && plain(before.propLocations) && plain(after.propLocations) && typeof action.propId === 'string' && before.propLocations[action.propId] !== after.propLocations[action.propId]; })) errors.push('child-play: pretend-play requires distinct props and real changes in where a prop is placed');
  }
  if (!errors.length) errors.push(...graphProblems(input as unknown as ChildPlayActivity));
  return errors;
}
export function validateChildPlaySources(activity: ChildPlayActivity, sources: PictureSource[]): string[] {
  const errors: string[] = [];
  for (const [i, ref] of activity.sourceRefs.entries()) if (!sources.some(source => source.id === ref.sourceId && source.text.includes(ref.evidence))) errors.push(`child-play.sourceRefs[${i}]: evidence must occur exactly in its named source`);
  for (const entity of [...activity.characters, ...activity.props]) if (entity.figure && !isPictureRaster(sources.find(s => s.id === entity.figure?.sourceId)?.dataUrl)) errors.push(`child-play.${entity.id}: attach the cited PNG, JPEG or WebP crop source`);
  for (const scene of activity.scenes) if (scene.narrationSourceId && !isPictureNarration(sources.find(s => s.id === scene.narrationSourceId)?.dataUrl)) errors.push(`child-play.${scene.id}: attach the cited recorded narration for offline playback`);
  return errors;
}
export function childPlayFingerprint(activity: ChildPlayActivity): string { let hash = 2166136261; const data = JSON.stringify(activity); for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619); return (hash >>> 0).toString(16).padStart(8, '0'); }
export function replayChildPlay(activity: ChildPlayActivity, response: Pick<ChildPlayResponse, 'actionIds' | 'fingerprint'>): ChildPlaySnapshot {
  let scene = activity.scenes.find(scene => scene.id === activity.startSceneId)!;
  const history: ChildPlaySnapshot['history'] = [];
  const invalid = (error: string): ChildPlaySnapshot => ({ phase: 'invalid', scene, history: [], completedObjectiveIds: [], error });
  if (validateChildPlayFields(activity as unknown as Record<string, unknown>).length || !scene) return invalid('This story needs an author’s review.');
  if (response.fingerprint !== childPlayFingerprint(activity) || !Array.isArray(response.actionIds) || response.actionIds.length > activity.maxTurns) return invalid('Saved choices do not match this prepared story.');
  for (const actionId of response.actionIds) {
    const action = activity.actions.find(action => action.id === actionId && action.fromSceneId === scene.id);
    if (scene.ending || !action) return invalid('The saved action sequence is not a valid path through the story.');
    scene = activity.scenes.find(scene => scene.id === action.toSceneId)!; history.push({ action, scene });
  }
  return { phase: scene.ending ?? (history.length >= activity.maxTurns ? 'pause' : 'active'), scene, history, completedObjectiveIds: completeObjectives(activity, scene, response.actionIds) };
}
export function initialChildPlayResponse(activity: ChildPlayActivity, saved?: unknown): ChildPlayResponse {
  const value = plain(saved) ? saved : {}, fingerprint = childPlayFingerprint(activity);
  const savedActions = Array.isArray(value.actionIds) && value.actionIds.length <= activity.maxTurns && value.actionIds.every((v): v is string => typeof v === 'string') ? value.actionIds : [];
  const response: ChildPlayResponse = { kind: 'child-play-response', fingerprint, actionIds: savedActions, selectedActorId: activity.characters.some(c => c.id === value.selectedActorId) ? value.selectedActorId as string : activity.characters[0].id, selectedPropId: activity.props.some(p => p.id === value.selectedPropId) ? value.selectedPropId as string : '', listenedSceneIds: Array.isArray(value.listenedSceneIds) ? [...new Set(value.listenedSceneIds.filter((v): v is string => typeof v === 'string' && activity.scenes.some(s => s.id === v && !!s.narrationSourceId)))] : [], caregiverSupport: value.caregiverSupport === true };
  if (value.fingerprint !== fingerprint || replayChildPlay(activity, response).phase === 'invalid') { response.actionIds = []; response.listenedSceneIds = []; if (value.fingerprint) response.notice = 'A fresh story is ready. Your earlier choices could not be restored.'; }
  return response;
}
export function advanceChildPlay(activity: ChildPlayActivity, response: ChildPlayResponse, actionId: string): { success: true; response: ChildPlayResponse } | { success: false; error: string } {
  const snapshot = replayChildPlay(activity, response);
  if (snapshot.phase !== 'active') return { success: false, error: 'This story is paused or finished. Start again to explore another path.' };
  const action = activity.actions.find(action => action.id === actionId && action.fromSceneId === snapshot.scene.id);
  if (!action) return { success: false, error: 'That action is not part of the current scene.' };
  const next = { ...response, actionIds: [...response.actionIds, action.id], selectedPropId: '' };
  // IndexedDB preserves undefined properties; portable progress accepts JSON only.
  // Remove the old notice rather than retaining an own key with an undefined value.
  delete next.notice;
  return { success: true, response: next };
}
export function evaluateChildPlay(activity: ChildPlayActivity, response: unknown): Evaluation {
  const invalid = (feedback: string): Evaluation => ({ valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: activity.objectives.length, feedback, details: [] });
  if (!plain(response) || !fields(response, ['kind', 'fingerprint', 'actionIds', 'selectedActorId', 'selectedPropId', 'listenedSceneIds', 'caregiverSupport', 'notice']) || response.kind !== 'child-play-response' || typeof response.fingerprint !== 'string' || !Array.isArray(response.actionIds) || response.actionIds.some(v => typeof v !== 'string') || typeof response.caregiverSupport !== 'boolean' || !activity.characters.some(c => c.id === response.selectedActorId) || response.selectedPropId !== '' && !activity.props.some(p => p.id === response.selectedPropId) || !Array.isArray(response.listenedSceneIds) || response.listenedSceneIds.length > activity.scenes.length || response.listenedSceneIds.some(v => !activity.scenes.some(s => s.id === v && !!s.narrationSourceId)) || response.notice !== undefined && !text(response.notice, 500)) return invalid('Restore the story choices before checking this activity.');
  const snapshot = replayChildPlay(activity, response as unknown as ChildPlayResponse);
  if (snapshot.phase === 'invalid') return invalid(snapshot.error!);
  if (snapshot.phase === 'active') return invalid('Keep playing until the story reaches an ending or a pause. There is no timer.');
  const details = activity.objectives.map(goal => ({ id: goal.id, correct: snapshot.completedObjectiveIds.includes(goal.id), message: goal.label }));
  const score = details.filter(detail => detail.correct).length, correct = snapshot.phase === 'goal' && score === details.length;
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length, hintUsed: response.caregiverSupport, feedback: `${correct ? 'Your choices reached the story’s prepared goal.' : 'The story gives you another path to explore. You can talk about what happened and try again.'} ${activity.explanation}`, details };
}

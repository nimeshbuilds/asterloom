import type { Notebook } from '../types';
import { stableHash } from './utils';
import { recordingDigest } from './mediaAssets';

export interface RoomResult { missionId: string; score: number; maxScore: number; correct?: number; total?: number; durationMs?: number; completedAt?: string }
export interface QueuedResult extends RoomResult { eventId: string; roomId: string; playerId?: string; packHash?: string }
export interface RoomSession { roomId: string; playerId: string; playerToken: string; inviteCode?: string; relay: string; packHash: string }
export interface TorState { installed: boolean; status: string; bootstrap?: number; hostname?: string; proxyConfigured?: boolean; reachabilityVerified?: boolean; error?: string }
export interface TorTransport { getTorStatus: () => Promise<TorState>; setTorEnabled: (enabled: boolean) => Promise<TorState> }
export const roomStorageKey = (notebook: Pick<Notebook, 'id'>) => `asterloom:rooms:${notebook.id}`;
const fingerprints = new WeakMap<Notebook, string>();
/** Bind playable content, including source text and raw media bytes. Immutable notebooks cache once. */
export function roomFingerprint(notebook: Notebook): string {
  const cached = fingerprints.get(notebook); if (cached) return cached;
  const value = `r2-${stableHash(JSON.stringify({sources: notebook.sources.map(source => [source.id, source.kind, source.text, source.asset || source.dataUrl ? recordingDigest(source) : null]), cards: notebook.cards.map(card => [card.id, card.prompt, card.answer, card.options, card.questionType, card.sourceId, card.evidence]), activities: notebook.activities || [], scaffolds: notebook.scaffoldIds})).toString(36)}`;
  fingerprints.set(notebook, value); return value;
}
export const missionIdsFor = (notebook: Notebook) => [...new Set([...(notebook.scaffoldIds.length ? notebook.scaffoldIds : ['practice']), ...(notebook.activities || []).map(activity => activity.id)])];
export const sessionIdentity = (session: RoomSession) => JSON.stringify([session.roomId, session.playerId, session.relay]);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function normalizeRelay(value: string): string {
  if (!value.trim()) return '';
  let url: URL; try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete service address, such as https://your-service.example.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol) || !['', '/'].includes(url.pathname)) throw new Error('Use the service origin only, without a path, credentials, query, or fragment.');
  if (url.protocol === 'http:' && !local && !isOnionRelay(url.origin)) throw new Error('Remote services need HTTPS. Localhost and Tor onion addresses may use HTTP.');
  return url.origin;
}
export function isOnionRelay(relay: string): boolean { try { return /^[a-z2-7]{56}\.onion$/.test(new URL(relay).hostname); } catch { return false; } }
export function invitationText(code: string, relay: string): string { return relay ? `AL1.${btoa(JSON.stringify({code, relay: normalizeRelay(relay)})).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}` : code; }
export function parseInvitation(value: string): {code: string; relay?: string} {
  const trimmed = value.trim(); if (!trimmed.startsWith('AL1.')) { if (!trimmed || trimmed.length > 200) throw new Error('Paste the complete invitation from your host.'); return {code: trimmed}; }
  try {
    if (trimmed.length > 4096) throw new Error();
    const data = JSON.parse(atob(trimmed.slice(4).replace(/-/g, '+').replace(/_/g, '/')));
    if (!isObject(data) || typeof data.code !== 'string' || !data.code || data.code.length > 200 || typeof data.relay !== 'string') throw new Error();
    return {code: data.code, relay: normalizeRelay(data.relay)};
  } catch { throw new Error('This invitation could not be read. Ask the host to copy it again.'); }
}
export function readRoomSession(storage: Storage, key: string): RoomSession | null {
  const raw = storage.getItem(key); if (!raw) return null;
  const data: unknown = JSON.parse(raw);
  if (!isObject(data) || !['roomId', 'playerId', 'playerToken', 'relay', 'packHash'].every(field => typeof data[field] === 'string') || !data.roomId || !data.playerId || !data.playerToken) throw new Error('The saved room connection is incomplete. Keep your storage intact and reconnect with the host.');
  return {...data, relay: normalizeRelay(data.relay as string)} as unknown as RoomSession;
}
function validResult(item: unknown): item is QueuedResult {
  return isObject(item) && typeof item.eventId === 'string' && !!item.eventId && item.eventId.length <= 100 && typeof item.roomId === 'string' && !!item.roomId && typeof item.missionId === 'string' && !!item.missionId && Number.isInteger(item.score) && Number.isInteger(item.maxScore) && (item.maxScore as number) > 0 && (item.score as number) >= 0 && (item.score as number) <= (item.maxScore as number) && (item.durationMs === undefined || typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) && item.durationMs >= 0 && item.durationMs <= 604800000);
}
const eventKey = (key: string, item: QueuedResult) => `${key}:result:${encodeURIComponent(item.roomId)}:${encodeURIComponent(item.eventId)}`;
/** Separate event keys prevent one tab's acknowledgment from overwriting another tab's new result. */
export function readRoomOutbox(storage: Storage, key: string): QueuedResult[] {
  const legacy = JSON.parse(storage.getItem(`${key}:outbox`) || '[]');
  if (!Array.isArray(legacy)) throw new Error('The saved result queue needs recovery. No queued results were removed.');
  const items: unknown[] = [...legacy];
  for (let index = 0; index < storage.length; index++) { const name = storage.key(index); if (name?.startsWith(`${key}:result:`)) items.push(JSON.parse(storage.getItem(name) || 'null')); }
  if (!items.every(validResult)) throw new Error('A saved result could not be read. No queued results were removed.');
  return [...new Map(items.map(item => [`${item.roomId}:${item.eventId}`, item])).values()];
}
export function acknowledgeRoomResult(storage: Storage, key: string, item: QueuedResult): void {
  const legacy = JSON.parse(storage.getItem(`${key}:outbox`) || '[]');
  if (!Array.isArray(legacy)) throw new Error('The saved result queue needs recovery.');
  // Write legacy changes first. If storage fails, the idempotent event stays queued.
  if (legacy.some(entry => entry.roomId === item.roomId && entry.eventId === item.eventId)) storage.setItem(`${key}:outbox`, JSON.stringify(legacy.filter(entry => entry.roomId !== item.roomId || entry.eventId !== item.eventId)));
  storage.removeItem(eventKey(key, item));
}
export function queueRoomResult(notebook: Notebook, result: RoomResult, storage: Storage): {queued: boolean; reason?: string} {
  try {
    const key = roomStorageKey(notebook), current = readRoomSession(storage, key); if (!current) return {queued: false};
    if (current.packHash !== roomFingerprint(notebook)) return {queued: false, reason: 'This notebook has changed. Create a new room or use the shared revision to sync this mission.'};
    if (!missionIdsFor(notebook).includes(result.missionId)) return {queued: false, reason: 'This mission does not belong to the shared notebook.'};
    if (!Number.isFinite(result.score) || !Number.isFinite(result.maxScore) || result.maxScore <= 0 || result.score < 0 || result.score > result.maxScore) return {queued: false, reason: 'This mission score is invalid.'};
    if (result.durationMs !== undefined && (!Number.isFinite(result.durationMs) || result.durationMs < 0 || result.durationMs > 604800000)) return {queued: false, reason: 'This mission duration is invalid.'};
    if ((result.correct !== undefined || result.total !== undefined) && (!Number.isInteger(result.correct) || !Number.isInteger(result.total) || result.correct! < 0 || result.total! <= 0 || result.correct! > result.total!)) return {queued: false, reason: 'This mission answer count is invalid.'};
    const completedAt = result.completedAt || new Date().toISOString(); if (!Number.isFinite(Date.parse(completedAt))) return {queued: false, reason: 'This mission completion time is invalid.'};
    const eventId = `result-${stableHash(JSON.stringify([current.playerId, result.missionId, result.score, result.maxScore, completedAt])).toString(36)}`;
    const item: QueuedResult = {...result, eventId, roomId: current.roomId, playerId: current.playerId, packHash: current.packHash, score: Math.round(result.score / result.maxScore * 1000), maxScore: 1000, completedAt};
    const existing = readRoomOutbox(storage, key);
    if (!existing.some(entry => entry.roomId === item.roomId && entry.eventId === item.eventId)) {
      if (existing.length >= 5000) return {queued: false, reason: 'Your room has 5,000 pending results. Open the room and sync before adding more.'};
      storage.setItem(eventKey(key, item), JSON.stringify(item));
    }
    return {queued: true};
  } catch { return {queued: false, reason: 'Your multiplayer result could not be saved. Keep this game open and export a progress backup before clearing storage.'}; }
}
export class RoomRequestError extends Error {
  constructor(message: string, public status = 0, public retryable = true, public retryAfterMs = 0) { super(message); this.name = 'RoomRequestError'; }
}
export function retryDelay(attempt: number, error?: unknown): number { return Math.max(error instanceof RoomRequestError ? error.retryAfterMs : 0, Math.min(60000, 8000 * 2 ** Math.min(3, Math.max(0, attempt - 1)))); }
export function isCanceled(error: unknown): boolean { return error instanceof Error && error.name === 'AbortError'; }
function canceled(): Error { const error = new Error('Connection attempt canceled.'); error.name = 'AbortError'; return error; }
export async function roomRequest<T>(route: string, relay: string, body?: unknown, token?: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw canceled();
  const controller = new AbortController(), abort = () => controller.abort(); signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, isOnionRelay(relay) ? 60000 : 12000);
  try {
    const response = await fetch(`${relay}${route}`, {method: body === undefined ? 'GET' : 'POST', headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(token ? {Authorization: `Bearer ${token}`} : {})}, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error'});
    let data; try { data = await response.json(); } catch { throw new RoomRequestError('The multiplayer service is not available at this address. Check the service address or start the native app.', response.status, response.status >= 500); }
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      const retryAfter = response.headers.get('Retry-After'); const seconds = retryAfter ? Number(retryAfter) : NaN;
      const delay = Math.min(120000, Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0)) || 0;
      throw new RoomRequestError(typeof data?.error === 'string' ? data.error.slice(0, 500) : 'The room request failed.', response.status, retryable, delay);
    }
    return data as T;
  } catch (error) {
    if (signal?.aborted) throw canceled();
    if (error instanceof TypeError || isCanceled(error)) throw new RoomRequestError('The room service is unreachable. Your saved results are waiting on this device.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export function torCanConnect(state: TorState): boolean { return state.installed && state.bootstrap === 100 && state.proxyConfigured === true && ['ready', 'connected'].includes(state.status); }
export function torStatusMessage(state: TorState | null): string {
  if (!state) return 'Checking the Tor transport…';
  if (!state.installed) return 'This build does not include the Tor transport.';
  if (state.error) return state.error;
  if (torCanConnect(state)) return state.reachabilityVerified ? 'Tor transport ready. This host address has been reached through Tor.' : 'Tor transport ready. The host address is still unverified; the host must stay open and the address may need time to publish.';
  if (['starting', 'connecting', 'connected', 'ready'].includes(state.status)) return `Connecting through Tor · ${state.bootstrap || 0}%. Your queued results stay saved while it connects.`;
  if (state.status === 'error' || state.status === 'stopped') return 'Tor stopped before connecting. Retry the connection; your results stay saved.';
  return 'Tor is off. Enable it to host or join a private onion room.';
}
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => { if (signal?.aborted) { reject(canceled()); return; } const onAbort = () => { clearTimeout(timer); reject(canceled()); }; const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms); signal?.addEventListener('abort', onAbort, {once: true}); });
}
export async function ensureTorTransport(desktop: TorTransport, options: {signal?: AbortSignal; onStatus?: (state: TorState) => void; timeoutMs?: number; pollMs?: number; allowEnable?: boolean} = {}): Promise<TorState> {
  const {signal, onStatus, timeoutMs = 120000, pollMs = 1000, allowEnable = true} = options;
  if (signal?.aborted) throw canceled();
  let state = await desktop.getTorStatus();
  if (!state.installed) throw new RoomRequestError('This application build does not include Tor. Use a compatible HTTPS room service.', 0, false);
  if (state.status === 'disabled' && !allowEnable) throw new RoomRequestError('Tor is turned off. Enable private connectivity or refresh this room when you want to reconnect. Your results remain saved.', 0, false);
  if (!['starting', 'connecting', 'connected', 'ready'].includes(state.status)) state = await desktop.setTorEnabled(true);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw canceled(); onStatus?.(state);
    if (torCanConnect(state)) return state;
    if (state.error || ['error', 'unavailable', 'stopped', 'disabled'].includes(state.status)) throw new RoomRequestError(state.error || 'Tor could not connect. Check your network and retry.');
    if (Date.now() >= deadline) throw new RoomRequestError('Tor is taking longer to connect. Your results are saved; keep the app open or retry when your network is available.');
    await wait(Math.min(pollMs, Math.max(1, deadline - Date.now())), signal); state = await desktop.getTorStatus();
  }
}

import type { Notebook, Source } from '../types';
import { bytesDigest } from './evidence';

export const MAX_MEDIA_ASSET_BYTES = 2 * 1024 ** 3;
export const COMPACT_FILE_BYTES = 20 * 1024 ** 2;
export const COMPACT_MEDIA_BYTES = 48 * 1024 ** 2;
const MEDIA_MIME = /^(?:audio\/(?:mpeg|mp3|wav|x-wav|ogg|webm|mp4|x-m4a|m4a)|video\/(?:mp4|webm|ogg|quicktime))$/;
export type MediaAsset = NonNullable<Source['asset']>;

export function validateMediaAsset(input: unknown): MediaAsset {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The recording attachment is invalid.');
  const v = input as Record<string, unknown>;
  if (typeof v.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sha256) || v.id !== v.sha256) throw new Error('Recording identity must match its SHA-256 checksum.');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 500 || /[\x00-\x1f/\\]/.test(v.name)) throw new Error('The recording filename is invalid.');
  if (typeof v.mime !== 'string' || !MEDIA_MIME.test(v.mime)) throw new Error('The recording format is unsupported.');
  if (typeof v.size !== 'number' || !Number.isSafeInteger(v.size) || v.size < 1 || v.size > MAX_MEDIA_ASSET_BYTES) throw new Error('A recording must be no larger than 2 GB.');
  if (v.duration !== undefined && (typeof v.duration !== 'number' || !Number.isFinite(v.duration) || v.duration <= 0 || v.duration > 43200)) throw new Error('Recording duration is out of range.');
  return { id:v.sha256, sha256:v.sha256, name:v.name, mime:v.mime, size:v.size, ...(v.duration === undefined ? {} : {duration:v.duration as number}) };
}

export function mediaPlaybackUrl(source: Source | undefined): string | undefined {
  if (!source) return undefined;
  if (source.dataUrl && /^data:(?:audio|video)\/[a-z0-9.+-]+;base64,/i.test(source.dataUrl)) return source.dataUrl;
  if (source.asset) return `/api/media/assets/${validateMediaAsset(source.asset).id}`;
  return undefined;
}

export function decodedMediaBytes(dataUrl: string): number {
  const content = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor(content.length * 3 / 4) - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0);
}

export function compactMediaIssue(notebook: Notebook): string | null {
  let total = (notebook.artwork ?? []).reduce((sum, a) => sum + decodedMediaBytes(a.dataUrl), 0);
  for (const source of notebook.sources) {
    const size = source.asset?.size ?? (source.dataUrl ? decodedMediaBytes(source.dataUrl) : 0);
    if (size > COMPACT_FILE_BYTES) return 'This world has a recording larger than 20 MB. Choose a Mac app, Windows app or recording archive to include the complete file.';
    total += size;
  }
  return total > COMPACT_MEDIA_BYTES ? 'This world has more than 48 MB of media. Choose a native app or recording archive to include everything.' : null;
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not prepare the recording.')); reader.readAsDataURL(blob); });
}

/** Compact exports must contain bytes, never a reference to the creator's local asset store. */
export async function materializeNotebookMedia(notebook: Notebook, signal?: AbortSignal): Promise<Notebook> {
  const issue = compactMediaIssue(notebook); if (issue) throw new Error(issue);
  const sources: Source[] = [];
  for (const source of notebook.sources) {
    if (!source.asset) { sources.push(source); continue; }
    const asset = validateMediaAsset(source.asset);
    const response = await fetch(`/api/media/assets/${asset.id}`, {signal});
    if (!response.ok) throw new Error(`The recording “${source.title}” is unavailable. Restore its archive before exporting.`);
    const blob = await response.blob();
    if (blob.size !== asset.size || bytesDigest(new Uint8Array(await blob.arrayBuffer())) !== asset.sha256) throw new Error(`The recording “${source.title}” failed its integrity check.`);
    const {asset: _asset, ...rest} = source;
    sources.push({...rest, dataUrl: await asDataUrl(new Blob([blob], {type:asset.mime})), mime:asset.mime});
  }
  return {...notebook, sources};
}

/** A JSON manifest by itself is not a portable recording archive. */
export async function ensureNotebookMediaAvailable(notebook: Notebook, signal?: AbortSignal): Promise<void> {
  for (const source of notebook.sources) {
    if (!source.asset) continue;
    const asset = validateMediaAsset(source.asset);
    let response: Response;
    try { response = await fetch(`/api/media/assets/${asset.id}`, {method:'HEAD', signal}); }
    catch { throw new Error(`“${source.title}” is stored separately from this notebook. Import its .learnzip recording archive or open the exported game app.`); }
    if (!response.ok || Number(response.headers.get('content-length')) !== asset.size) throw new Error(`“${source.title}” is missing its recording file. Import its .learnzip recording archive or ask the creator for a complete game export.`);
  }
}

export function recordingDigest(source: Source): string {
  if (source.asset) return validateMediaAsset(source.asset).sha256;
  if (!source.dataUrl) throw new Error('Attach the recording first.');
  return bytesDigest(Uint8Array.from(atob(source.dataUrl.slice(source.dataUrl.indexOf(',') + 1)), c => c.charCodeAt(0)));
}

const identityCache = new WeakMap<Source,{encoded:string;identity:string}>();
/** Canonical across native asset files and compact inline exports; memoized without trusting mutable fields. */
export function sourceMediaIdentity(source: Source | undefined): string | null {
  if (!source) return null;
  if (source.asset) return `bytes:${validateMediaAsset(source.asset).sha256}`;
  if (!source.dataUrl) return null;
  const cached=identityCache.get(source);if(cached?.encoded===source.dataUrl)return cached.identity;
  const encoded=source.dataUrl.slice(source.dataUrl.indexOf(',')+1);
  const identity=`bytes:${bytesDigest(Uint8Array.from(atob(encoded),character=>character.charCodeAt(0)))}`;
  identityCache.set(source,{encoded:source.dataUrl,identity});return identity;
}

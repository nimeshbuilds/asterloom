export const MAX_INLINE_SOURCE_BYTES:number;
export const MAX_SOURCE_MEDIA_BYTES:number;
export const SOURCE_FILE_EXTENSIONS:Record<string,string[]>;
export function sourceDownloadFilename(value:string,fallback?:string):string;
export function filenameForMime(value:string,mime:string):string;
export type SourceDownloadRequest={kind:'inline';filename:string;mime:string;dataUrl:string;size:number;sha256:string}|{kind:'asset';filename:string;asset:{id:string;name:string;mime:string;size:number;sha256:string;duration?:number}};
export type SourceDownloadNativeResult={status:'saved'|'canceled';filename:string}|{error:string};

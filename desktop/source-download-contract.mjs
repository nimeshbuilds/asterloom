// Browser-safe names and limits shared by the renderer and the native save boundary.
export const MAX_INLINE_SOURCE_BYTES=20*1024**2;
export const MAX_SOURCE_MEDIA_BYTES=2*1024**3;
export const SOURCE_FILE_EXTENSIONS={
 'text/plain':['txt','log','tsv'], 'text/markdown':['md','markdown'], 'text/csv':['csv'],
 'application/json':['json'], 'application/x-subrip':['srt'], 'text/vtt':['vtt'],
 'text/html':['html','htm'], 'application/xml':['xml'], 'application/yaml':['yaml','yml'],
 'text/yaml':['yaml','yml'], 'text/tab-separated-values':['tsv'], 'application/rtf':['rtf'],
 'application/pdf':['pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx'],
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':['pptx'],
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['xlsx'], 'application/epub+zip':['epub'],
 'image/png':['png'], 'image/jpeg':['jpg','jpeg'], 'image/webp':['webp'], 'image/gif':['gif'],
 'audio/mpeg':['mp3'], 'audio/mp3':['mp3'], 'audio/wav':['wav'], 'audio/x-wav':['wav'],
 'audio/ogg':['ogg','opus'], 'audio/webm':['webm'], 'audio/mp4':['m4a','mp4'], 'audio/x-m4a':['m4a'], 'audio/m4a':['m4a'],
 'video/mp4':['mp4'], 'video/webm':['webm'], 'video/ogg':['ogg'], 'video/quicktime':['mov'],
};
const encoder=new TextEncoder();
function fitBytes(value,limit){let result='';for(const character of value){if(encoder.encode(result+character).length>limit)break;result+=character;}return result;}
/** A portable basename, including Windows device names and Unicode display controls. */
export function sourceDownloadFilename(value,fallback='source.txt'){
 let name=typeof value==='string'?value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'-').replace(/^[. ]+|[. ]+$/g,'').trim():'';
 if(!name)name=fallback;
 if(/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:[ .]|$)/i.test(name))name='_'+name;
 const dot=name.lastIndexOf('.'),extension=dot>0&&name.length-dot<=24?name.slice(dot):'';
 return fitBytes(extension?name.slice(0,dot):name,180-encoder.encode(extension).length).replace(/[. ]+$/g,'')+extension;
}
export function filenameForMime(value,mime){
 const extensions=SOURCE_FILE_EXTENSIONS[mime];if(!extensions)throw new Error('This source file format cannot be downloaded.');
 const name=sourceDownloadFilename(value,'source.'+extensions[0]),extension=name.split('.').at(-1).toLowerCase();
 if(mime==='text/plain'&&!name.includes('.'))return name;
 return extensions.includes(extension)?name:sourceDownloadFilename(name+'.'+extensions[0]);
}

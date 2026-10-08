import type {SourceDownloadOption} from './sourceDownloads';

export type AsterDownloadFormat='original'|'text'|'transcript'|'pdf'|'audio'|'video'|'image';
export interface AsterDownloadIntent {target:string;format?:AsterDownloadFormat}
export interface AsterDownloadChoice {sourceId:string;sourceTitle:string;sourceKind:string;option:SourceDownloadOption}

const normalized=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g,' ');
const unquote=(value:string)=>value.replace(/^["“'](.+)["”']$/u,'$1');
const generic=/^(?:(?:all|my|the|this|these|a)\s+)?(?:sources?|source materials?|materials?|files?|attachments?)$/i;
const formats:Record<string,AsterDownloadFormat>={original:'original','original file':'original','original attachment':'original',text:'text','plain text':'text','readable text':'text','readable source text':'text','source text':'text',txt:'text',transcript:'transcript','timed transcript':'transcript',captions:'transcript',pdf:'pdf',audio:'audio','audio file':'audio',recording:'audio',video:'video','video file':'video',image:'image',picture:'image'};

/** Only the learner's submitted command is parsed. Source text and tips are never
 * inputs. Deliberately avoid intent inference from questions, quotes or prose. */
export function parseAsterDownloadIntent(input:string):AsterDownloadIntent|null{
 const value=input.trim();
 if(!value||value.length>500||/[\r\n`<>]/.test(value))return null;
 const match=value.match(/^(?:(?:hey\s+)?aster[,!:]?\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:download|save)(?:\s+me)?\s+(.+?)\s*[.!?]*$/i);
 if(!match)return null;
 let object=match[1].replace(/\s+(?:for me|please)$/i,'').trim();
 // These belong to app/game controls, never the source downloader.
 if(/^(?:my |the |this )?(?:game|notebook|progress|score|points|answer|mission|changes|game progress)$/i.test(object))return null;
 object=object.replace(/^(?:the|my|this)\s+/i,'');
 if(generic.test(object))return {target:''};
 const format= formats[normalized(object)];
 if(format)return {target:'',format};
 const of=object.match(/^(.+?)\s+(?:of|for|from)\s+(.+)$/i);
 if(of&&formats[normalized(of[1])])return {target:unquote(of[2].replace(/^(?:the|my)\s+/i,'')),format:formats[normalized(of[1])]};
 const as=object.match(/^(.+?)\s+as\s+(?:a\s+)?(.+)$/i);
 if(as&&formats[normalized(as[2])])return {target:unquote(as[1]),format:formats[normalized(as[2])]};
 if(/^original\s+(?:pdf|audio|video|image)$/i.test(object))return {target:'',format:normalized(object).slice(9) as AsterDownloadFormat};
 return {target:unquote(object)};
}

export function resolveAsterDownloadChoices(intent:AsterDownloadIntent,choices:readonly AsterDownloadChoice[]):AsterDownloadChoice[]{
 const target=normalized(intent.target);
 const formatted=choices.filter(choice=>{
  const {option}=choice;
  if(!intent.format)return true;
  if(['original','text','transcript'].includes(intent.format))return option.id===intent.format;
  if(option.id!=='original')return false;
  if(intent.format==='pdf')return /\.pdf$/i.test(option.filename);
  if(intent.format==='audio')return choice.sourceKind==='audio'||/\.(?:mp3|m4a|wav|ogg|flac|aac)$/i.test(option.filename);
  if(intent.format==='video')return choice.sourceKind==='video'||/\.(?:mp4|webm|mov|m4v)$/i.test(option.filename);
  return choice.sourceKind==='image'||/\.(?:png|jpe?g|webp|gif|bmp|tiff?)$/i.test(option.filename);
 });
 if(!target)return formatted;
 // An explicit filename is more precise than the source title, which may also
 // name its readable version. Missing original files must not silently become
 // a different format merely because their source retains the upload title.
 const files=formatted.filter(choice=>normalized(choice.option.filename)===target);
 if(files.length)return files;
 if(!intent.format&&/\.[a-z0-9]{1,12}$/i.test(target))return [];
 return formatted.filter(choice=>normalized(choice.sourceTitle)===target||normalized(choice.sourceTitle).replace(/^(?:the|my|this)\s+/,'')===target);
}

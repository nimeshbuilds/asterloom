import {isDeepStrictEqual} from 'node:util';
import {generationError} from './generation-control.mjs';

// The closed JSON Schema vocabulary emitted by the creation director. Unknown
// assertion keywords fail before dispatch; they are never silently ignored.
const keywords=new Set(['$schema','$defs','$ref','title','description','type','enum','const','properties','required','additionalProperties','items','anyOf','allOf','oneOf','not','minItems','maxItems','uniqueItems','minLength','maxLength','pattern','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minProperties','maxProperties']);
const types=new Set(['object','array','string','number','integer','boolean','null']);
const identifierPattern='^[A-Za-z][A-Za-z0-9_-]*$';
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const invalid=()=>Object.assign(new Error('Provide a supported JSON output schema of at most 64 KiB, with bounded nesting and local references only.'),{status:400,code:'INVALID_REQUEST',publicMessage:true});
const pointer=(root,ref)=>{if(typeof ref!=='string'||!ref.startsWith('#/'))throw invalid();let value=root;for(const token of ref.slice(2).split('/')){const key=token.replace(/~1/g,'/').replace(/~0/g,'~');if(!plain(value)||!Object.hasOwn(value,key))throw invalid();value=value[key];}if(!plain(value)&&typeof value!=='boolean')throw invalid();return value;};

export function boundedOutputSchema(value){
 if(value===undefined)return undefined;
 if(!plain(value))throw invalid();
 let nodes=0,bytes=0;const visit=(item,depth)=>{if(++nodes>4096||depth>32)throw invalid();if(typeof item==='string'){bytes+=Buffer.byteLength(item);if(bytes>65536)throw invalid();return;}if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return;if(Array.isArray(item)){for(const child of item)visit(child,depth+1);return;}if(!plain(item))throw invalid();for(const [key,child]of Object.entries(item)){bytes+=Buffer.byteLength(key);if(bytes>65536)throw invalid();visit(child,depth+1);}};
 visit(value,0);const encoded=JSON.stringify(value);if(Buffer.byteLength(encoded)>65536)throw invalid();
 const root=JSON.parse(encoded),refs=[];
 const schema=(node)=>{
  if(typeof node==='boolean')return;if(!plain(node)||Object.keys(node).some(key=>!keywords.has(key)))throw invalid();
  for(const [key,item]of Object.entries(node)){
   if(['title','description','$schema'].includes(key)){if(typeof item!=='string')throw invalid();}
   else if(key==='$ref'){refs.push(item);}
   else if(key==='type'){if(typeof item==='string'?!types.has(item):!Array.isArray(item)||!item.length||item.some(type=>!types.has(type)))throw invalid();}
   else if(key==='enum'){if(!Array.isArray(item)||!item.length)throw invalid();}
   else if(key==='properties'||key==='$defs'){if(!plain(item))throw invalid();for(const sub of Object.values(item))schema(sub);}
   else if(key==='required'){if(!Array.isArray(item)||item.some(k=>typeof k!=='string')||new Set(item).size!==item.length)throw invalid();}
   else if(['additionalProperties','items','not'].includes(key))schema(item);
   else if(['anyOf','allOf','oneOf'].includes(key)){if(!Array.isArray(item)||!item.length)throw invalid();item.forEach(schema);}
   else if(['minItems','maxItems','minLength','maxLength','minProperties','maxProperties'].includes(key)){if(!Number.isSafeInteger(item)||item<0)throw invalid();}
   else if(['minimum','maximum','exclusiveMinimum','exclusiveMaximum'].includes(key)){if(typeof item!=='number'||!Number.isFinite(item))throw invalid();}
   else if(key==='uniqueItems'){if(typeof item!=='boolean')throw invalid();}
   // Avoid executing arbitrary client-provided regular expressions. This is the
   // sole pattern used by director schemas; new patterns need an explicit review.
   else if(key==='pattern'&&item!==identifierPattern)throw invalid();
  }
 };
 schema(root);for(const ref of refs)pointer(root,ref);return root;
}

export function assertStructuredOutput(value,schema){
 let steps=0;
 const match=(value,node,depth=0)=>{
  if(++steps>200000||depth>64)return false;if(typeof node==='boolean')return node;
  if(node.$ref&&!match(value,pointer(schema,node.$ref),depth+1))return false;
  if(node.anyOf&&!node.anyOf.some(sub=>match(value,sub,depth+1)))return false;
  if(node.allOf&&!node.allOf.every(sub=>match(value,sub,depth+1)))return false;
  if(node.oneOf&&node.oneOf.filter(sub=>match(value,sub,depth+1)).length!==1)return false;
  if(node.not&&match(value,node.not,depth+1))return false;
  if(node.enum&&!node.enum.some(item=>isDeepStrictEqual(value,item)))return false;
  if(Object.hasOwn(node,'const')&&!isDeepStrictEqual(value,node.const))return false;
  const isType=type=>type==='null'?value===null:type==='object'?plain(value):type==='array'?Array.isArray(value):type==='integer'?Number.isInteger(value):type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===type;
  if(node.type&&!(Array.isArray(node.type)?node.type:[node.type]).some(isType))return false;
  if(plain(value)){
   const keys=Object.keys(value);if(node.required?.some(key=>!Object.hasOwn(value,key))||keys.length<(node.minProperties??0)||keys.length>(node.maxProperties??Infinity))return false;
   for(const key of keys){const rule=Object.hasOwn(node.properties??{},key)?node.properties[key]:node.additionalProperties;if(rule===false||rule!==undefined&&!match(value[key],rule,depth+1))return false;}
  }
  if(Array.isArray(value)){
   if(value.length<(node.minItems??0)||value.length>(node.maxItems??Infinity))return false;
   if(node.items!==undefined&&!value.every(item=>match(item,node.items,depth+1)))return false;
   if(node.uniqueItems&&value.some((item,i)=>value.slice(0,i).some(other=>isDeepStrictEqual(item,other))))return false;
  }
  if(typeof value==='string'){const length=[...value].length;if(length<(node.minLength??0)||length>(node.maxLength??Infinity)||node.pattern&&!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value))return false;}
  if(typeof value==='number'&&(value<(node.minimum??-Infinity)||value>(node.maximum??Infinity)||value<=(node.exclusiveMinimum??-Infinity)||value>=(node.exclusiveMaximum??Infinity)))return false;
  return true;
 };
 if(!plain(value)||!match(value,schema))throw generationError('PROVIDER_INVALID_RESPONSE');
}

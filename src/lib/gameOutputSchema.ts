type Schema=Record<string,unknown>;
const plain=(value:unknown):value is Schema=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const bytes=(text:string)=>new TextEncoder().encode(text).length;
const encodedBytes=(value:unknown)=>bytes(JSON.stringify(value));

/** Match the desktop adapter's transport bounds before producing a snapshot. */
function snapshot(value:Schema):Schema {
 let nodes=0,scalarBytes=0;
 const active=new Set<object>();
 const invalid=()=>{throw Error('The game output schema must be bounded JSON with local references only.');};
 const text=(value:string)=>{scalarBytes+=bytes(value);if(scalarBytes>65536)invalid();};
 const visit=(item:unknown,depth:number)=>{
  if(++nodes>4096||depth>32)invalid();
  if(typeof item==='string'){text(item);return;}
  if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return;
  if(!Array.isArray(item)&&!plain(item))invalid();
  const object=item as object;if(active.has(object))invalid();active.add(object);
  if(Array.isArray(item))for(const child of item)visit(child,depth+1);
  else for(const [key,child]of Object.entries(item as Schema)){text(key);if((key==='$ref'||key==='$dynamicRef')&&(typeof child!=='string'||!child.startsWith('#')))invalid();visit(child,depth+1);}
  active.delete(object);
 };
 if(!plain(value)||value.type!=='object')invalid();
 visit(value,0);const encoded=JSON.stringify(value);if(bytes(encoded)>65536)invalid();return JSON.parse(encoded);
}

/** Visit schema positions only. Enum/const/default values and property-name maps
 * are data, not schemas that can be replaced by a reference. */
function mapSchema(node:Schema,change:(node:Schema)=>Schema|undefined,root=false):Schema {
 if(!root){const changed=change(node);if(changed)return changed;}
 const result={...node};
 for(const key of ['properties','patternProperties','dependentSchemas'])if(plain(node[key]))result[key]=Object.fromEntries(Object.entries(node[key]).map(([name,child])=>[name,plain(child)?mapSchema(child,change):child]));
 for(const key of ['items','additionalProperties','contains','not','if','then','else','propertyNames','unevaluatedProperties','unevaluatedItems'])if(plain(node[key]))result[key]=mapSchema(node[key],change);
 for(const key of ['anyOf','allOf','oneOf','prefixItems'])if(Array.isArray(node[key]))result[key]=node[key].map(child=>plain(child)?mapSchema(child,change):child);
 return result;
}

/** Lossless request-only factoring. Local validation still uses the original
 * schema and source validators; no saved source or checkpoint data is changed. */
export function compactGameOutputSchema(schema:Schema):Schema {
 let root=snapshot(schema),definitions:Record<string,Schema>={};
 // Existing references, base IDs and anchors can carry their own resolution
 // scope. Leave that format alone instead of relocating its schema nodes.
 const hasScope=(value:unknown):boolean=>Array.isArray(value)?value.some(hasScope):plain(value)?Object.entries(value).some(([key,child])=>['$defs','definitions','$ref','$dynamicRef','$id','$anchor','$dynamicAnchor'].includes(key)||hasScope(child)):false;
 if(hasScope(root))return root;
 let currentBytes=encodedBytes(root);
 for(let index=0;index<64;index++){
  const candidates=new Map<string,{node:Schema;count:number;length:number}>();
  const collect=(node:Schema)=>{const key=JSON.stringify(node),prior=candidates.get(key);if(prior)prior.count++;else candidates.set(key,{node,count:1,length:bytes(key)});return undefined;};
  mapSchema(root,collect,true);for(const node of Object.values(definitions))mapSchema(node,collect);
  const id=`s${index}`,reference={$ref:`#/$defs/${id}`},referenceBytes=encodedBytes(reference);
  const definitionOverhead=bytes(JSON.stringify(id))+1+(index?1:bytes(',"$defs":{')+1);
  let best:{key:string;node:Schema;saving:number}|undefined;
  for(const [key,{node,count,length}]of candidates){
   const saving=count*(length-referenceBytes)-length-definitionOverhead;
   if(count>1&&saving>0&&(!best||saving>best.saving))best={key,node,saving};
  }
  if(!best)break;
  const replace=(node:Schema)=>JSON.stringify(node)===best.key?{...reference}:undefined;
  const nextRoot=mapSchema(root,replace,true),nextDefinitions=Object.fromEntries(Object.entries(definitions).map(([name,node])=>[name,mapSchema(node,replace)]));nextDefinitions[id]=best.node;
  let compact:Schema;
  try{compact=snapshot({...nextRoot,$defs:nextDefinitions});}catch{break;}
  const nextBytes=encodedBytes(compact);if(nextBytes>=currentBytes)break;
  root=nextRoot;definitions=nextDefinitions;currentBytes=nextBytes;
 }
 return Object.keys(definitions).length?{...root,$defs:definitions}:root;
}

/** Decode one complete reply without guessing missing content or combining messages.
 * Diagnostics contain only shape/size information, never private source prose. */
export function parseGameDirectorReply(text:string):Record<string,unknown> {
 const bytes=new TextEncoder().encode(text).byteLength;
 if(bytes>400000)throw new Error('The model reply exceeds the bounded JSON limit.');
 const trimmed=text.trim(),fenced=trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
 const body=(fenced?fenced[1]:trimmed).trim();
 if(!body)throw new Error('The model returned an empty reply. Return one complete JSON object.');
 let parsed:unknown;
 try{parsed=JSON.parse(body);}
 catch{
  // Find the first complete outer value, respecting escaped quotes and brackets
  // inside strings. This diagnoses concatenation; it never salvages one value.
  const stack:string[]=[];let quoted=false,escaped=false,closed=-1,mismatched=false;
  if(body[0]==='{')for(let i=0;i<body.length;i++){
   const char=body[i];
   if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
   if(char==='"'){quoted=true;continue;}
   if(char==='{'||char==='[')stack.push(char);
   else if(char==='}'||char===']'){
    if(stack.pop()!==(char==='}'?'{':'[')){mismatched=true;break;}
    if(!stack.length){closed=i;break;}
   }
  }
  const tail=closed<0?'':body.slice(closed+1).trim();
  const issue=tail?'The model reply contains additional content after its JSON object.':body[0]!=='{'?'The model reply includes prose or Markdown instead of one JSON object.':!mismatched&&closed<0&&(stack.length||quoted)?'The model reply contains an unfinished JSON object.':'The model reply contains invalid JSON syntax.';
  throw new Error(`${issue} Received ${bytes} bytes. Return one complete JSON object without commentary; do not omit required evidence.`);
 }
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('The model returned a JSON value instead of the required object. Return the requested object with its named fields.');
 return parsed as Record<string,unknown>;
}

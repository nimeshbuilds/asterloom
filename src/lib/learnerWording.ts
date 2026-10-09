/** Presentation of game controls, never source quotations or subject claims.
 * Older generated instructions sometimes called the app's own feedback
 * “reviewed” even though no author had reviewed that activity. */
export function learnerControlWording(text:string,authorReviewed:boolean):string {
  if(authorReviewed)return text;
  // These are the legacy app-control phrases, not a general rewrite of
  // subject matter. Quoted source language is always left verbatim.
  const quoted=/("[^"]*"|“[^”]*”|‘[^’]*’|`[^`]*`|'[^']*')/g;
  return text.split(quoted).map((part,index)=>index%2?part:part.replace(/\b(inspect the |attach (?:the |a |the matching |matching ))reviewed (membership feedback|relation label)(?=[.,;:]|\s+(?:with|and|that|to|for)\b|$)/gi,(_match,lead:string,control:string)=>{
    if(/^inspect/i.test(lead)&&control.toLowerCase()!=='membership feedback')return _match;
    if(/^attach/i.test(lead)&&control.toLowerCase()!=='relation label')return _match;
    return `${lead}prepared ${control}`;
  }).replace(/\bCompare each reviewed pairing with the condition still visible on its item\b/g,'Compare each prepared pairing with the condition still visible on its item')).join('');
}

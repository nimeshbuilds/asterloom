type Data=Record<string,unknown>;
const pairs=[['playTrackIds','playTrackGroupId'],['studyTrackIds','studyTrackGroupId'],['effectProfileIds','effectProfileGroupId']] as const;
/** Keep the preferred ID readable. Repeated compatible sets are disclosed once,
 * with no missing alternatives and no permission to cross into another group. */
export function compactCreativeAudioChoices<T extends Data>(choices:T[]) {
  const groups:Record<string,string[]>={},byValue=new Map<string,string>();
  const encoded=choices.map(choice=>{
    const original=choice.audioChoices as Record<string,string[]>;
    const audioChoices:Data={};
    for(const [key,groupKey] of pairs){
      const values=original[key];
      if(!values?.length)throw Error('A creative audio choice needs a nonempty compatible catalog.');
      const sorted=[...new Set(values)].sort(),serialized=JSON.stringify(sorted);
      let groupId=byValue.get(serialized);
      if(!groupId){groupId=`audio-${byValue.size+1}`;byValue.set(serialized,groupId);groups[groupId]=sorted;}
      audioChoices[key]=[values[0]];audioChoices[groupKey]=groupId;
    }
    return {...choice,audioChoices};
  });
  return {choices:encoded,audioChoiceGroups:groups};
}
export function resolveCreativeAudioChoices(input:Data,choice:Data):Record<'playTrackIds'|'studyTrackIds'|'effectProfileIds',string[]> {
  const audio=choice.audioChoices as Data|undefined,groups=input.audioChoiceGroups as Data|undefined;
  const result={} as Record<'playTrackIds'|'studyTrackIds'|'effectProfileIds',string[]>;
  for(const [key,groupKey] of pairs){
    const primary=audio?.[key],ref=audio?.[groupKey];
    if(!Array.isArray(primary)||!primary.length||primary.some(id=>typeof id!=='string'||!id))throw Error('Story and sound selection requires a nonempty disclosed catalog.');
    const rest=ref===undefined?[]:typeof ref==='string'?groups?.[ref]:undefined;
    if(!Array.isArray(rest)||rest.some(id=>typeof id!=='string'||!id)||ref!==undefined&&primary.some(id=>!rest.includes(id)))throw Error('Creative audio group is missing or incompatible.');
    result[key]=[...new Set([...primary,...rest])];
  }
  return result;
}
export const CREATIVE_AUDIO_GROUP_INSTRUCTION=' Each choice.audioChoices keeps the preferred ID first. Its playTrackGroupId, studyTrackGroupId and effectProfileGroupId refer to complete allowed ID lists in audioChoiceGroups. Resolve ONLY that choice’s named groups; groups belonging to other choices do not expand its permissions. Return the actual selected ID, never a group ID. All descriptors are in audioLibrary.';

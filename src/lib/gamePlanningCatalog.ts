import type {gameRecipeChoices} from './gameDraftAdapters';
import type {asterEmotionCatalog} from './asterEmotions';

type Choice=ReturnType<typeof gameRecipeChoices>[number];
type Expression=Pick<ReturnType<typeof asterEmotionCatalog>[number],'id'|'moments'|'purpose'>;
type ExpressionRow=[Expression['id'],Expression['moments'],Expression['purpose']];
const EXPRESSION_FIELDS=['id','moments','purpose'] as const;

export const PLANNING_CATALOG_INSTRUCTION=' Catalog encoding: choices keep named fields; an omitted limitations field means choiceDefaults.limitations (the empty list). Every asterExpressions row has exactly three columns in asterExpressionFields order: [id, moments, purpose]. All expression IDs, compatible moments and purpose descriptions are supplied in full. Use the row’s ID, never its position.';

/** Request-only encoding. Keep the source/scaffold descriptions readable and all
 * choices in order; only repeated empty defaults and three repeated keys go away.
 * No saved plan, source inventory, receipt or generation fingerprint is changed. */
export function compactPlanningCatalog(choices:Choice[],expressions:Expression[]){
 return{
  choiceDefaults:{limitations:[] as string[]},
  choices:choices.map(({limitations,...choice})=>({...choice,...(limitations.length?{limitations:[...limitations]}:{})})),
  asterExpressionFields:[...EXPRESSION_FIELDS],
  asterExpressions:expressions.map(({id,moments,purpose}):ExpressionRow=>[id,[...moments],purpose]),
 };
}

/** Read the exact compact catalog disclosed in a new planning request, or the
 * previous named-object representation. Schema constraints use these same IDs
 * and compatible moments, so compact prompts do not broaden allowed responses. */
export function planningExpressions(input:Record<string,unknown>):Record<string,unknown>[] {
 const expressions=input.asterExpressions;
 if(input.asterExpressionFields===undefined)return Array.isArray(expressions)?expressions.filter((value):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)):[];
 if(JSON.stringify(input.asterExpressionFields)!==JSON.stringify(EXPRESSION_FIELDS)||!Array.isArray(expressions)||!expressions.length)throw Error('The planning expression catalog has invalid columns.');
 const seen=new Set<string>();
 return expressions.map(row=>{
  if(!Array.isArray(row)||row.length!==3||typeof row[0]!=='string'||!row[0]||seen.has(row[0])||!Array.isArray(row[1])||!row[1].length||row[1].some(moment=>typeof moment!=='string'||!moment)||typeof row[2]!=='string'||!row[2])throw Error('The planning expression catalog has an invalid row.');
  seen.add(row[0]);return{id:row[0],moments:[...row[1]],purpose:row[2]};
 });
}

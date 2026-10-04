import {describe, expect, it} from 'vitest';
import {evaluateComposition, getCompositionCapabilities, initialCompositionResponse, validateCompositionFields} from '../src/lib/compositionEngine';
import type {ExplanationActivity, ExplanationResponse} from '../src/lib/compositionEngine';
import {acknowledgePartnerTurn, advancePartnerTurn, codeSpanLineRange, partnerTurnReady, restartPartnerRound} from '../src/lib/compositionModes';
import {COMPOSITION_MODE_EXAMPLES, COMPOSITION_MODE_EXAMPLE_SOURCE, DOM_CODE_REVIEW, PARTNER_PLANTS, SQL_CODE_REVIEW} from '../src/lib/compositionModeExamples';
import {explanationSolution, PLANT_EXPLANATION} from '../src/lib/compositionExamples';
import {attachExplanationMode, defaultExplanationMode, restoreExplanationModeDraft} from '../src/components/CompositionModeAuthor';
const clone = <T>(value: T): T => structuredClone(value);
const validate = (value: unknown) => validateCompositionFields(value as Record<string,unknown>);
function finishedPartner(activity = PARTNER_PLANTS) {
  let response = initialCompositionResponse(activity) as ExplanationResponse;
  response.arguments = explanationSolution(activity).arguments;
  response = acknowledgePartnerTurn(activity,response); response = advancePartnerTurn(activity,response);
  response = acknowledgePartnerTurn(activity,response); response.partner = {...response.partner!, decision:'ready',checkedEvidence:true};
  return advancePartnerTurn(activity,response);
}
function annotated(activity: ExplanationActivity, alternativeIndex = 0) {
  const response = initialCompositionResponse(activity) as ExplanationResponse;
  response.arguments = explanationSolution(activity,alternativeIndex).arguments;
  for (const finding of activity.codeReview!.findings) {const alternative = finding.alternatives[alternativeIndex] ?? finding.alternatives[0]; response.codeReview!.annotations[finding.id] = {spanIds:[...alternative.spanIds],repairId:alternative.repairId,note:''};}
  return response;
}
describe('specific composition capabilities',()=>{
  it('keeps the old explanation format compatible without granting new recipe capabilities',()=>{
    expect(validate(PLANT_EXPLANATION)).toEqual([]);
    expect(getCompositionCapabilities(PLANT_EXPLANATION)).toMatchObject({valid:true,explanation:true,partnerHelper:false,secureCodeReview:false});
  });
  it('provides two source-backed partner and two source-code fixtures',()=>{
    expect(COMPOSITION_MODE_EXAMPLES.filter(activity=>activity.partner)).toHaveLength(2);expect(COMPOSITION_MODE_EXAMPLES.filter(activity=>activity.codeReview)).toHaveLength(2);
    for(const activity of COMPOSITION_MODE_EXAMPLES){expect(validate(activity),activity.id).toEqual([]);for(const reference of activity.sourceRefs)expect(COMPOSITION_MODE_EXAMPLE_SOURCE.text.includes(reference.evidence)).toBe(true);}
    expect(getCompositionCapabilities(PARTNER_PLANTS).partnerHelper).toBe(true);expect(getCompositionCapabilities(SQL_CODE_REVIEW).secureCodeReview).toBe(true);
  });
  it('rejects mixed presenters, ungrounded source code and unsupported fields',()=>{
    expect(validate({...PARTNER_PLANTS,codeReview:SQL_CODE_REVIEW.codeReview})).not.toEqual([]);
    expect(validate({...SQL_CODE_REVIEW,codeReview:{...SQL_CODE_REVIEW.codeReview,code:'invented code'}})).not.toEqual([]);
    expect(validate({...PARTNER_PLANTS,partner:{...PARTNER_PLANTS.partner,execute:'anything'}}).join(' ')).toContain('unknown field');
  });
  it('requires alternating roles and review of the exact preceding argument set',()=>{
    const activity=clone(PARTNER_PLANTS);activity.partner!.turns[1].roleId='builder';expect(validate(activity)).not.toEqual([]);
    const missing=clone(PARTNER_PLANTS);missing.partner!.turns[1].argumentIds=[];expect(validate(missing)).not.toEqual([]);
    expect(getCompositionCapabilities(missing).partnerHelper).toBe(false);
  });
});
describe('saved partner handoff and coauthored results',()=>{
  it('requires acknowledged handoff and complete prepared construction before a turn advances',()=>{
    let response=initialCompositionResponse(PARTNER_PLANTS) as ExplanationResponse;
    expect(partnerTurnReady(PARTNER_PLANTS,response)).toBe(false);expect(advancePartnerTurn(PARTNER_PLANTS,response)).toBe(response);
    response=acknowledgePartnerTurn(PARTNER_PLANTS,response);expect(partnerTurnReady(PARTNER_PLANTS,response)).toBe(false);
    response.arguments=explanationSolution(PARTNER_PLANTS).arguments;expect(partnerTurnReady(PARTNER_PLANTS,response)).toBe(true);
    const next=advancePartnerTurn(PARTNER_PLANTS,response);expect(next.partner?.activeTurn).toBe(1);expect(next.partner?.acknowledged).toBe(false);expect(next.partner?.completedTurns[0].arguments).toEqual(response.arguments);
  });
  it('does not grade incomplete partner work as an independent success',()=>{
    const response=initialCompositionResponse(PARTNER_PLANTS) as ExplanationResponse;response.arguments=explanationSolution(PARTNER_PLANTS).arguments;
    const result=evaluateComposition(PARTNER_PLANTS,response);expect(result.correct).toBe(false);expect(result.hintUsed).toBe(true);expect(result.score).toBe(0);
  });
  it('requires the helper evidence check and review decision',()=>{
    let response=initialCompositionResponse(PARTNER_PLANTS) as ExplanationResponse;response.arguments=explanationSolution(PARTNER_PLANTS).arguments;
    response=advancePartnerTurn(PARTNER_PLANTS,acknowledgePartnerTurn(PARTNER_PLANTS,response));response=acknowledgePartnerTurn(PARTNER_PLANTS,response);
    response.partner!.decision='ready';expect(partnerTurnReady(PARTNER_PLANTS,response)).toBe(false);response.partner!.checkedEvidence=true;expect(partnerTurnReady(PARTNER_PLANTS,response)).toBe(true);
  });
  it('returns an assisted collaboration result and does not score reflections or participant names',()=>{
    const response=finishedPartner(),result=evaluateComposition(PARTNER_PLANTS,response);expect(result.correct).toBe(true);expect(result.hintUsed).toBe(true);
    response.partner!.participants={builder:'Alex',helper:'Sam'};response.partner!.completedTurns.forEach(record=>record.reflection='This open reflection is not an automatically graded answer.');
    const changed=evaluateComposition(PARTNER_PLANTS,response);expect(changed.correct).toBe(true);expect(changed.score).toBe(result.score);expect(changed.hintUsed).toBe(true);
  });
  it('starts a saved revision round when the helper requests revision',()=>{
    let response=finishedPartner();response.partner!.completedTurns.pop();response.partner!.activeTurn=1;response.partner!.acknowledged=true;response.partner!.decision='revise';response.partner!.checkedEvidence=true;response.partner!.reflection='Check whether the observation supports the scope of this claim.';
    response=advancePartnerTurn(PARTNER_PLANTS,response);expect(response.partner?.round).toBe(2);expect(response.partner?.activeTurn).toBe(0);expect(response.partner?.previousRounds[0][1].reflection).toContain('scope');expect(response.arguments).toEqual(explanationSolution(PARTNER_PLANTS).arguments);
  });
  it('persists pending handoffs, participant roles, open reflection and reviewed snapshots',()=>{
    const response=finishedPartner();response.partner!.participants={builder:'Learner one',helper:'Learner two'};
    const restored=initialCompositionResponse(PARTNER_PLANTS,JSON.parse(JSON.stringify(response)));expect(restored).toEqual(response);
    const round=restartPartnerRound(PARTNER_PLANTS,response);round.partner!.reflection='My question before handoff.';expect(initialCompositionResponse(PARTNER_PLANTS,JSON.parse(JSON.stringify(round)))).toEqual(round);
  });
  it('rejects out-of-order turns, edits made during review and unreviewed final explanations',()=>{
    const wrongOrder=finishedPartner();wrongOrder.partner!.completedTurns.reverse();expect(evaluateComposition(PARTNER_PLANTS,wrongOrder).valid).toBe(false);
    const reviewEdit=finishedPartner();reviewEdit.partner!.completedTurns[1].arguments=explanationSolution(PARTNER_PLANTS,1).arguments;expect(evaluateComposition(PARTNER_PLANTS,reviewEdit).valid).toBe(false);
    const finalEdit=finishedPartner();finalEdit.arguments=explanationSolution(PARTNER_PLANTS,1).arguments;expect(evaluateComposition(PARTNER_PLANTS,finalEdit).valid).toBe(false);
  });
  it('accepts reordered JSON keys without treating them as content edits',()=>{
    const response=finishedPartner();const chain=response.partner!.completedTurns[1].arguments.investigation;response.partner!.completedTurns[1].arguments.investigation={rebuttalId:chain.rebuttalId,counterpointId:chain.counterpointId,warrantId:chain.warrantId,evidenceIds:[...chain.evidenceIds],claimId:chain.claimId};
    expect(evaluateComposition(PARTNER_PLANTS,response).correct).toBe(true);
  });
});
describe('annotated source-code review',()=>{
  it('accepts independently reviewed span/explanation/repair alternatives',()=>{
    for(const activity of [SQL_CODE_REVIEW,DOM_CODE_REVIEW])for(let i=0;i<activity.codeReview!.findings[0].alternatives.length;i++)expect(evaluateComposition(activity,annotated(activity,i)).correct).toBe(true);
  });
  it('rejects a correct explanation with wrong locations or an unrelated repair',()=>{
    const response=annotated(SQL_CODE_REVIEW);response.codeReview!.annotations['query-annotation'].spanIds=['print-line'];expect(evaluateComposition(SQL_CODE_REVIEW,response).correct).toBe(false);
    const repair=annotated(SQL_CODE_REVIEW);repair.codeReview!.annotations['query-annotation'].repairId='print-change';expect(evaluateComposition(SQL_CODE_REVIEW,repair).correct).toBe(false);
  });
  it('does not mix the span set of one explanation alternative with another',()=>{
    const response=annotated(SQL_CODE_REVIEW);response.codeReview!.annotations['query-annotation'].spanIds=['name-line','query-line','execute-line'];expect(evaluateComposition(SQL_CODE_REVIEW,response).correct).toBe(false);
  });
  it('treats free review notes as ungraded and round trips all partial annotations',()=>{
    const response=annotated(DOM_CODE_REVIEW),result=evaluateComposition(DOM_CODE_REVIEW,response);response.codeReview!.annotations['message-annotation'].note='I have a separate concern to discuss; this text is not graded.';expect(evaluateComposition(DOM_CODE_REVIEW,response).score).toBe(result.score);
    response.arguments['message-finding'].warrantId='';expect(initialCompositionResponse(DOM_CODE_REVIEW,JSON.parse(JSON.stringify(response)))).toEqual(response);
  });
  it('rejects fabricated ranges, duplicate annotations and unsupported repairs',()=>{
    const activity=clone(SQL_CODE_REVIEW);activity.codeReview!.spans[0].end=activity.codeReview!.code.length+1;expect(validate(activity)).not.toEqual([]);
    const response=annotated(SQL_CODE_REVIEW);response.codeReview!.annotations['query-annotation'].spanIds=['query-line','query-line'];expect(evaluateComposition(SQL_CODE_REVIEW,response).valid).toBe(false);
    const repair=annotated(SQL_CODE_REVIEW);repair.codeReview!.annotations['query-annotation'].repairId='made-up';expect(evaluateComposition(SQL_CODE_REVIEW,repair).valid).toBe(false);
  });
  it('requires the source range, repair and explanation IDs to exist in the contract',()=>{
    for(const field of ['spanIds','repairId','explanationAlternativeId'] as const){const activity=clone(SQL_CODE_REVIEW);const alternative=activity.codeReview!.findings[0].alternatives[0];if(field==='spanIds')alternative.spanIds=['fake'];else alternative[field]='fake';expect(validate(activity),field).not.toEqual([]);}
  });
  it('uses stable 1-based line labels for exact UTF-16 ranges and rejects split Unicode characters',()=>{
    expect(codeSpanLineRange('first\nsecond\nthird',6,12)).toEqual({startLine:2,endLine:2});
    const activity=clone(DOM_CODE_REVIEW);const previous=activity.codeReview!.code;activity.codeReview!.code='😀'+previous;activity.sourceRefs[0].evidence='😀'+activity.sourceRefs[0].evidence.replace(previous,'😀'+previous);activity.codeReview!.spans.forEach(span=>{span.start+=2;span.end+=2;});activity.codeReview!.spans[0].start=1;expect(validate(activity).join(' ')).toContain('Unicode');
  });
});
describe('guided mode authoring contracts',()=>{
  it('creates a real two-role protocol from the guided partner author',()=>{
    const mode=defaultExplanationMode();mode.mode='partner';const activity=attachExplanationMode(clone(PLANT_EXPLANATION),mode);expect(validate(activity)).toEqual([]);expect(getCompositionCapabilities(activity).partnerHelper).toBe(true);
  });
  it('keeps the plain author backward compatible and restores bounded mode drafts',()=>{
    expect(attachExplanationMode(clone(PLANT_EXPLANATION),defaultExplanationMode())).toEqual(PLANT_EXPLANATION);expect(restoreExplanationModeDraft({mode:'invalid',spans:'bad'})).toEqual(defaultExplanationMode());
    const draft=defaultExplanationMode();draft.mode='code-review';draft.code=SQL_CODE_REVIEW.codeReview!.code;draft.bindings={example:{spanIds:['span-a'],repairId:'repair-a',explanation:'Prepared link.'}};expect(restoreExplanationModeDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
});

// Importing another learner's bounded saved state must fail closed, without throwing.
it('rejects malformed history snapshots without crashing validation or restoration',()=>{
 const response=finishedPartner();(response.partner!.completedTurns[0] as unknown as {arguments:unknown}).arguments=null;
 expect(()=>evaluateComposition(PARTNER_PLANTS,response)).not.toThrow();expect(evaluateComposition(PARTNER_PLANTS,response).valid).toBe(false);
 expect(()=>initialCompositionResponse(PARTNER_PLANTS,response)).not.toThrow();
});

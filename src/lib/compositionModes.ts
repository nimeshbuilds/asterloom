import type { Evaluation } from './structuredEngine';
import type { EvidenceAssociation, ExplanationActivity, ExplanationAlternative, ExplanationChain, ExplanationResponse } from './compositionEngine';

export interface PartnerRole extends EvidenceAssociation {id: string; label: string; instruction: string}
export interface PartnerTurn extends EvidenceAssociation {id: string; roleId: string; task: 'construct'|'review'; argumentIds: string[]; instruction: string}
export interface PartnerContract {roles: PartnerRole[]; turns: PartnerTurn[]}
export interface PartnerTurnRecord {turnId: string; roleId: string; acknowledged: true; arguments: Record<string, ExplanationChain>; decision: ''|'revise'|'ready'; checkedEvidence: boolean; reflection: string}
export interface PartnerState {
  participants: Record<string, string>; activeTurn: number; acknowledged: boolean; completedTurns: PartnerTurnRecord[];
  decision: ''|'revise'|'ready'; checkedEvidence: boolean; reflection: string;
  round: number; previousRounds: PartnerTurnRecord[][];
}
export interface CodeReviewSpan extends EvidenceAssociation {id: string; label: string; start: number; end: number}
export interface CodeReviewRepair extends EvidenceAssociation {id: string; label: string; text: string}
export interface CodeReviewAlternative extends EvidenceAssociation {id: string; explanationAlternativeId: string; spanIds: string[]; repairId: string; explanation: string}
export interface CodeReviewFinding extends EvidenceAssociation {id: string; label: string; argumentId: string; alternatives: CodeReviewAlternative[]}
export interface CodeReviewContract {sourceRefIndex: number; language: string; code: string; spans: CodeReviewSpan[]; repairs: CodeReviewRepair[]; findings: CodeReviewFinding[]}
export interface CodeReviewAnnotation {spanIds: string[]; repairId: string; note: string}
export interface CodeReviewState {activeFindingId: string; annotations: Record<string, CodeReviewAnnotation>}
const BAD = new Set(['constructor', 'prototype', '__proto__']);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value) && !BAD.has(value);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = (value: unknown, max = 4000): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
function keys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown field`);}
function records(value: unknown, path: string, errors: string[], min: number, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {errors.push(`${path}: expected ${min}–${max} entries`); return [];}
  const result: Record<string, unknown>[] = [], seen = new Set<string>();
  value.forEach(item => {if (!plain(item)) {errors.push(`${path}: expected objects`); return;} result.push(item); if (!isId(item.id) || seen.has(item.id)) errors.push(`${path}: IDs must be valid and unique`); else seen.add(item.id);}); return result;
}
function refs(value: unknown, count: number, path: string, errors: string[]) {if (!Array.isArray(value) || !value.length || value.length > 20 || value.some(index => !integer(index, 0, count - 1)) || new Set(value).size !== value.length) errors.push(`${path}: use distinct evidenceRefs indexing the activity's source excerpts`);}
function ids(value: unknown, known: Set<unknown>, path: string, errors: string[], min = 1, max = 12) {if (!Array.isArray(value) || value.length < min || value.length > max || value.some(item => !isId(item) || !known.has(item)) || new Set(value).size !== value.length) errors.push(`${path}: expected ${min}–${max} distinct known IDs`);}
function safeBoundary(code: string, offset: number) {return offset <= 0 || offset >= code.length || !(code.charCodeAt(offset - 1) >= 0xd800 && code.charCodeAt(offset - 1) <= 0xdbff && code.charCodeAt(offset) >= 0xdc00 && code.charCodeAt(offset) <= 0xdfff);}
/** Called after the generic explanation fields have passed their validator. */
export function validateExplanationModes(input: Record<string, unknown>): string[] {
  const errors: string[] = [], sourceRefs = input.sourceRefs as {evidence: string}[], argumentsList = input.arguments as {id: string; alternatives: ExplanationAlternative[]}[];
  if (input.partner !== undefined && input.codeReview !== undefined) return ['An explanation activity can use partner or codeReview, but not both presenters.'];
  if (input.partner !== undefined) {
    if (!plain(input.partner)) return ['partner: expected a role-and-turn contract'];
    const partner = input.partner; keys(partner, ['roles', 'turns'], 'partner', errors);
    const roles = records(partner.roles, 'partner.roles', errors, 2, 2), roleIds = new Set(roles.map(role => role.id));
    roles.forEach(role => {keys(role, ['id', 'label', 'instruction', 'evidenceRefs'], 'role', errors); if (!text(role.label, 100) || !text(role.instruction, 2000)) errors.push('Each partner role needs a label and an explicit instruction.'); refs(role.evidenceRefs, sourceRefs.length, 'role.evidenceRefs', errors);});
    const turns = records(partner.turns, 'partner.turns', errors, 2, 12), argumentIds = new Set(argumentsList.map(argument => argument.id));
    turns.forEach((turn, index) => {
      keys(turn, ['id', 'roleId', 'task', 'argumentIds', 'instruction', 'evidenceRefs'], 'turn', errors);
      if (!roleIds.has(turn.roleId) || !['construct', 'review'].includes(String(turn.task)) || !text(turn.instruction, 2000)) errors.push('Each partner turn needs a known role, a construct/review task, and an instruction.');
      ids(turn.argumentIds, argumentIds, 'turn.argumentIds', errors, 1, 8); refs(turn.evidenceRefs, sourceRefs.length, 'turn.evidenceRefs', errors);
      if (index === 0 && turn.task !== 'construct' || index === turns.length - 1 && turn.task !== 'review') errors.push('The partner protocol must start with construction and finish with review.');
      if (index && (turns[index - 1].roleId === turn.roleId || turns[index - 1].task === turn.task)) errors.push('Partner turns must alternate roles and construction/review tasks.');
      if (turn.task === 'review' && index && Array.isArray(turn.argumentIds) && Array.isArray(turns[index - 1].argumentIds) && !sameSet(turn.argumentIds as string[], turns[index - 1].argumentIds as string[])) errors.push('A review turn must review the same arguments as the preceding construction turn.');
    });
    for (const id of argumentIds) if (!turns.some(turn => turn.task === 'construct' && Array.isArray(turn.argumentIds) && turn.argumentIds.includes(id))) errors.push(`Partner protocol never constructs argument ${id}.`);
  }
  if (input.codeReview !== undefined) {
    if (!plain(input.codeReview)) return ['codeReview: expected a source-span review contract'];
    const review = input.codeReview; keys(review, ['sourceRefIndex', 'language', 'code', 'spans', 'repairs', 'findings'], 'codeReview', errors);
    if (!integer(review.sourceRefIndex, 0, sourceRefs.length - 1) || !text(review.language, 50) || !text(review.code, 20_000) || typeof review.code !== 'string' || !integer(review.sourceRefIndex, 0, sourceRefs.length - 1) || !sourceRefs[review.sourceRefIndex].evidence.includes(review.code)) errors.push('codeReview.code must occur exactly in the indexed source excerpt (up to 20,000 characters).');
    const code = typeof review.code === 'string' ? review.code : '';
    const spans = records(review.spans, 'codeReview.spans', errors, 2, 48), spanIds = new Set(spans.map(span => span.id));
    const ranges = new Set<string>();
    spans.forEach(span => {
      keys(span, ['id', 'label', 'start', 'end', 'evidenceRefs'], 'span', errors);
      if (!text(span.label, 200) || !integer(span.start, 0, code.length - 1) || !integer(span.end, 1, code.length) || Number(span.start) >= Number(span.end) || !safeBoundary(code, Number(span.start)) || !safeBoundary(code, Number(span.end))) errors.push('Code spans need labels and nonempty character ranges inside the exact code, without splitting Unicode characters.');
      refs(span.evidenceRefs, sourceRefs.length, 'span.evidenceRefs', errors);
      if (integer(span.start, 0, code.length - 1) && integer(span.end, 1, code.length) && Array.isArray(span.evidenceRefs)) {
        const quote = code.slice(span.start, span.end);
        if (!span.evidenceRefs.some(index => integer(index, 0, sourceRefs.length - 1) && sourceRefs[index].evidence.includes(quote))) errors.push('Every selectable code span must quote an associated source excerpt exactly.');
      }
      const key = `${span.start}:${span.end}`; if (ranges.has(key)) errors.push('Code span ranges must be distinct.'); ranges.add(key);
    });
    const repairs = records(review.repairs, 'codeReview.repairs', errors, 2, 24), repairIds = new Set(repairs.map(repair => repair.id));
    repairs.forEach(repair => {keys(repair, ['id', 'label', 'text', 'evidenceRefs'], 'repair', errors); if (!text(repair.label, 200) || !text(repair.text, 5000)) errors.push('Every prepared repair needs a label and text.'); refs(repair.evidenceRefs, sourceRefs.length, 'repair.evidenceRefs', errors);});
    const findings = records(review.findings, 'codeReview.findings', errors, 1, 8), seenArguments = new Set<unknown>();
    findings.forEach(finding => {
      keys(finding, ['id', 'label', 'argumentId', 'alternatives', 'evidenceRefs'], 'finding', errors);
      const argument = argumentsList.find(argument => argument.id === finding.argumentId);
      if (!text(finding.label, 300) || !argument || seenArguments.has(finding.argumentId)) errors.push('Each finding must have a label and its own known explanation argument.');
      seenArguments.add(finding.argumentId); refs(finding.evidenceRefs, sourceRefs.length, 'finding.evidenceRefs', errors);
      const signatures = new Set<string>();
      for (const alternative of records(finding.alternatives, 'finding.alternatives', errors, 1, 12)) {
        keys(alternative, ['id', 'explanationAlternativeId', 'spanIds', 'repairId', 'explanation', 'evidenceRefs'], 'finding alternative', errors);
        if (!argument?.alternatives.some(item => item.id === alternative.explanationAlternativeId) || !repairIds.has(alternative.repairId) || !text(alternative.explanation, 3000)) errors.push('A finding alternative must bind a prepared explanation alternative, repair, and source-backed feedback.');
        ids(alternative.spanIds, spanIds, 'finding alternative.spanIds', errors, 1, 16); refs(alternative.evidenceRefs, sourceRefs.length, 'finding alternative.evidenceRefs', errors);
        if (Array.isArray(alternative.spanIds)) {const signature = JSON.stringify([alternative.explanationAlternativeId, [...alternative.spanIds].sort(), alternative.repairId]); if (signatures.has(signature)) errors.push('Duplicate code review alternatives are not allowed.'); signatures.add(signature);}
      }
    });
    if (argumentsList.some(argument => !seenArguments.has(argument.id))) errors.push('Every explanation argument in a code review needs a corresponding finding.');
  }
  return errors;
}
export function sameSet(a: string[], b: string[]) {return a.length === b.length && a.every(item => b.includes(item));}
export function matchesExplanationAlternative(chain: ExplanationChain, alternative: ExplanationAlternative) {return chain.claimId === alternative.claimId && sameSet(chain.evidenceIds, alternative.evidenceIds) && chain.warrantId === alternative.warrantId && chain.counterpointId === (alternative.counterpointId ?? '') && chain.rebuttalId === (alternative.rebuttalId ?? '');}
const emptyReview = () => ({decision: '' as const, checkedEvidence: false, reflection: ''});
export function initialPartnerState(activity: ExplanationActivity): PartnerState {
  return {participants: Object.fromEntries(activity.partner!.roles.map(role => [role.id, role.label])), activeTurn: 0, acknowledged: false, completedTurns: [], ...emptyReview(), round: 1, previousRounds: []};
}
export function initialCodeReviewState(activity: ExplanationActivity): CodeReviewState {return {activeFindingId: activity.codeReview!.findings[0]?.id ?? '', annotations: Object.fromEntries(activity.codeReview!.findings.map(finding => [finding.id, {spanIds: [], repairId: '', note: ''}]))};}
function validChain(value: unknown, activity: ExplanationActivity): value is ExplanationChain {
  if (!plain(value) || Object.keys(value).some(key => !['claimId', 'evidenceIds', 'warrantId', 'counterpointId', 'rebuttalId'].includes(key))) return false;
  for (const role of ['claim', 'warrant', 'counterpoint', 'rebuttal'] as const) if (value[`${role}Id`] !== '' && !activity.pieces.some(piece => piece.id === value[`${role}Id`] && piece.role === role)) return false;
  return Array.isArray(value.evidenceIds) && value.evidenceIds.length <= 8 && new Set(value.evidenceIds).size === value.evidenceIds.length && value.evidenceIds.every(id => activity.pieces.some(piece => piece.id === id && piece.role === 'evidence'));
}
function validSnapshot(value: unknown, turn: PartnerTurn, activity: ExplanationActivity) {return plain(value) && sameSet(Object.keys(value), turn.argumentIds) && Object.values(value).every(chain => validChain(chain, activity));}
function sameChain(a: ExplanationChain | undefined, b: ExplanationChain | undefined) {return !!a && !!b && Array.isArray(a.evidenceIds) && Array.isArray(b.evidenceIds) && a.claimId === b.claimId && sameSet(a.evidenceIds, b.evidenceIds) && a.warrantId === b.warrantId && a.counterpointId === b.counterpointId && a.rebuttalId === b.rebuttalId;}
function sameSnapshot(a: unknown, b: unknown) {return plain(a) && plain(b) && sameSet(Object.keys(a), Object.keys(b)) && Object.keys(a).every(id => sameChain(a[id] as ExplanationChain, b[id] as ExplanationChain));}
function completeChain(chain: ExplanationChain) {return !!chain.claimId && !!chain.warrantId && chain.evidenceIds.length > 0;}
function validatePartnerState(activity: ExplanationActivity, value: unknown): string[] {
  const errors: string[] = [], contract = activity.partner!;
  if (!plain(value)) return ['Partner session state is missing.'];
  keys(value, ['participants', 'activeTurn', 'acknowledged', 'completedTurns', 'decision', 'checkedEvidence', 'reflection', 'round', 'previousRounds'], 'partner state', errors);
  if (!plain(value.participants) || !sameSet(Object.keys(value.participants), contract.roles.map(role => role.id)) || Object.values(value.participants).some(name => typeof name !== 'string' || name.length > 80)) errors.push('Partner roles need bounded participant labels.');
  if (!integer(value.activeTurn, 0, contract.turns.length) || typeof value.acknowledged !== 'boolean' || !['', 'revise', 'ready'].includes(String(value.decision)) || typeof value.checkedEvidence !== 'boolean' || typeof value.reflection !== 'string' || value.reflection.length > 3000 || !integer(value.round, 1, 1e6)) errors.push('Partner turn or reflection state is invalid.');
  const checkHistory = (entries: unknown, complete: boolean) => {
    if (!Array.isArray(entries) || entries.length > contract.turns.length || complete && entries.length !== contract.turns.length) {errors.push('Partner history must follow the prepared turn sequence.'); return;}
    entries.forEach((record, index) => {
      const turn = contract.turns[index];
      if (!plain(record)) {errors.push('Partner history needs turn records.'); return;}
      keys(record, ['turnId', 'roleId', 'acknowledged', 'arguments', 'decision', 'checkedEvidence', 'reflection'], 'partner turn record', errors);
      if (record.turnId !== turn.id || record.roleId !== turn.roleId || record.acknowledged !== true || !validSnapshot(record.arguments, turn, activity) || typeof record.reflection !== 'string' || record.reflection.length > 3000 || typeof record.checkedEvidence !== 'boolean' || !['', 'revise', 'ready'].includes(String(record.decision))) errors.push('A completed partner turn must preserve its role, acknowledged handoff, argument snapshot and bounded reflection.');
      if (turn.task === 'construct' && plain(record.arguments) && Object.values(record.arguments).some(chain => !validChain(chain, activity) || !completeChain(chain))) errors.push('A construction turn needs a claim, evidence and reasoning before handoff.');
      if (turn.task === 'review' && (!['revise', 'ready'].includes(String(record.decision)) || record.checkedEvidence !== true)) errors.push('A review turn needs an evidence check and a prepared review decision.');
      if (turn.task === 'review' && index && plain(record.arguments) && plain(entries[index - 1]) && !sameSnapshot(record.arguments as unknown as Record<string, ExplanationChain>, entries[index - 1].arguments as Record<string, ExplanationChain>)) errors.push('Review turns inspect the preceding construction snapshot without changing it.');
    });
  };
  checkHistory(value.completedTurns, false);
  if (Array.isArray(value.completedTurns) && value.completedTurns.length !== value.activeTurn) errors.push('Active partner turn must follow the recorded completed turns.');
  if (!Array.isArray(value.previousRounds) || value.previousRounds.length > 8) errors.push('At most eight previous partner rounds can be retained.'); else value.previousRounds.forEach(round => checkHistory(round, true));
  if (integer(value.activeTurn, 0, contract.turns.length) && value.activeTurn === contract.turns.length && value.acknowledged !== false) errors.push('Finished partner sessions have no pending acknowledged turn.');
  return errors;
}
function validateCodeReviewState(activity: ExplanationActivity, value: unknown): string[] {
  const errors: string[] = [], contract = activity.codeReview!;
  if (!plain(value) || !plain(value.annotations)) return ['Code review annotations are missing.'];
  keys(value, ['activeFindingId', 'annotations'], 'code review state', errors);
  if (!contract.findings.some(finding => finding.id === value.activeFindingId) || !sameSet(Object.keys(value.annotations), contract.findings.map(finding => finding.id))) errors.push('Annotations must correspond to the prepared findings.');
  for (const annotation of Object.values(value.annotations)) {
    if (!plain(annotation)) {errors.push('Expected a source-span annotation.'); continue;}
    keys(annotation, ['spanIds', 'repairId', 'note'], 'annotation', errors);
    ids(annotation.spanIds, new Set(contract.spans.map(span => span.id)), 'annotation.spanIds', errors, 0, 16);
    if (annotation.repairId !== '' && !contract.repairs.some(repair => repair.id === annotation.repairId) || typeof annotation.note !== 'string' || annotation.note.length > 3000) errors.push('Annotations need a known repair and a bounded, ungraded note.');
  }
  return errors;
}
export function restoreExplanationMode(activity: ExplanationActivity, saved: unknown, base: ExplanationResponse): ExplanationResponse {
  const value = plain(saved) ? saved : {};
  if (activity.partner) return {...base, partner: validatePartnerState(activity, value.partner).length ? initialPartnerState(activity) : structuredClone(value.partner as unknown as PartnerState)};
  if (activity.codeReview) return {...base, codeReview: validateCodeReviewState(activity, value.codeReview).length ? initialCodeReviewState(activity) : structuredClone(value.codeReview as unknown as CodeReviewState)};
  return base;
}
export function partnerTurnReady(activity: ExplanationActivity, response: ExplanationResponse): boolean {
  const state = response.partner, turn = state && activity.partner?.turns[state.activeTurn];
  if (!state || !turn || !state.acknowledged) return false;
  return turn.task === 'construct' ? turn.argumentIds.every(id => response.arguments[id] && completeChain(response.arguments[id])) : !!state.decision && state.checkedEvidence;
}
/** Acknowledgement is a local handoff, not an identity or online multiplayer verification. */
export function acknowledgePartnerTurn(activity: ExplanationActivity, response: ExplanationResponse): ExplanationResponse {
  if (!activity.partner || !response.partner || response.partner.activeTurn >= activity.partner.turns.length) return response;
  return {...response, partner: {...response.partner, acknowledged: true}};
}
export function advancePartnerTurn(activity: ExplanationActivity, response: ExplanationResponse): ExplanationResponse {
  if (!activity.partner || !response.partner || !partnerTurnReady(activity, response)) return response;
  const state = response.partner, turn = activity.partner.turns[state.activeTurn];
  const record: PartnerTurnRecord = {turnId: turn.id, roleId: turn.roleId, acknowledged: true, arguments: structuredClone(Object.fromEntries(turn.argumentIds.map(id => [id, response.arguments[id]]))), decision: state.decision, checkedEvidence: state.checkedEvidence, reflection: state.reflection};
  const completedTurns = [...state.completedTurns, record], nextTurn = state.activeTurn + 1;
  const next = {...response, partner: {...state, activeTurn: nextTurn, acknowledged: false, completedTurns, ...emptyReview()}, draft: {...response.draft, activeArgumentId: activity.partner.turns[nextTurn]?.argumentIds[0] ?? response.draft.activeArgumentId, selectedPieceId: '', role: 'claim' as const, message: nextTurn < activity.partner.turns.length ? 'Turn saved. Pass the device to the next partner.' : 'Partner round saved. Use Check my work to evaluate the prepared explanation.'}};
  return nextTurn === activity.partner.turns.length && state.decision === 'revise' ? restartPartnerRound(activity, next) : next;
}
export function restartPartnerRound(activity: ExplanationActivity, response: ExplanationResponse): ExplanationResponse {
  if (!activity.partner || !response.partner || response.partner.activeTurn !== activity.partner.turns.length) return response;
  const previous = response.partner;
  return {...response, partner: {...initialPartnerState(activity), participants: {...previous.participants}, round: Math.min(1e6, previous.round + 1), previousRounds: [...previous.previousRounds, previous.completedTurns].slice(-8)}, draft: {...response.draft, activeArgumentId: activity.partner.turns[0].argumentIds[0], selectedPieceId: '', role: 'claim', message: 'A revision round is ready. The existing explanation and previous round are saved.'}};
}
export function evaluateExplanationMode(activity: ExplanationActivity, response: unknown, core: Evaluation): Evaluation {
  if (!plain(response) || !core.valid) return core;
  if (activity.partner) {
    const errors = validatePartnerState(activity, response.partner);
    if (errors.length) return {valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: 0, feedback: errors.slice(0, 3).join(' '), details: []};
    const state = response.partner as unknown as PartnerState, complete = state.activeTurn === activity.partner.turns.length && state.completedTurns.at(-1)?.decision === 'ready';
    if (!complete) return {hintUsed: true, valid: true, correct: false, outcome: 'retry', score: 0, maxScore: activity.arguments.length, feedback: 'Complete the prepared construction, handoff and evidence-review turns before checking the final explanation. Spoken discussion and written reflections are saved without a correctness grade.', details: [{id: 'partner-process', correct: false, message: `Round ${state.round}: ${state.completedTurns.length} of ${activity.partner.turns.length} turns completed.`}]};
    const lastByArgument = new Map<string, ExplanationChain>();
    for (const turn of state.completedTurns) for (const [id, chain] of Object.entries(turn.arguments)) lastByArgument.set(id, chain);
    if (activity.arguments.some(argument => !lastByArgument.has(argument.id) || !sameChain((response.arguments as Record<string, ExplanationChain>)[argument.id], lastByArgument.get(argument.id)!))) return {valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: 0, feedback: 'The explanation changed after its review. Start a revision round so the partner can review the new work.', details: []};
    return {...core, hintUsed: true, details: [...core.details, {id: 'partner-process', correct: true, message: 'The prepared handoff and review sequence is complete. Partner identities, speech and reflection quality were not automatically graded.'}]};
  }
  if (activity.codeReview) {
    const errors = validateCodeReviewState(activity, response.codeReview);
    if (errors.length) return {valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: 0, feedback: errors.slice(0, 3).join(' '), details: []};
    const state = response.codeReview as unknown as CodeReviewState, annotations: Evaluation['details'] = [];
    for (const finding of activity.codeReview.findings) {
      const argument = activity.arguments.find(argument => argument.id === finding.argumentId)!, chain = (response.arguments as Record<string, ExplanationChain>)[finding.argumentId], annotation = state.annotations[finding.id];
      const match = finding.alternatives.find(alternative => matchesExplanationAlternative(chain, argument.alternatives.find(item => item.id === alternative.explanationAlternativeId)!) && sameSet(annotation.spanIds, alternative.spanIds) && annotation.repairId === alternative.repairId);
      annotations.push({id: `annotation-${finding.id}`, correct: !!match, message: match ? `${finding.label}: ${match.explanation} Source ${match.evidenceRefs.map(index => index + 1).join(', ')}.` : `${finding.label}: the selected code spans, prepared repair and explanation must form one reviewed alternative. The free-text note is not graded.`});
    }
    const correct = core.correct === true && annotations.every(detail => detail.correct === true);
    return {...core, correct, outcome: correct ? 'correct' : 'retry', score: core.score + annotations.filter(detail => detail.correct).length, maxScore: core.maxScore + annotations.length, feedback: correct ? activity.explanation : 'Review the highlighted source code, its associated explanation and the repair together. Prepared alternatives are checked locally; code is never executed and annotation notes are not graded.', details: [...core.details, ...annotations]};
  }
  return core;
}
export function codeSpanLineRange(code: string, start: number, end: number): {startLine: number; endLine: number} {return {startLine: code.slice(0, start).split('\n').length, endLine: code.slice(0, Math.max(start, end - 1)).split('\n').length};}

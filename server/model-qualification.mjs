/** Product acceptance policy, not a published claim about a model family. */
export const MODEL_QUALIFICATION_VERSION = '1.0.0';
export const MODEL_QUALITY_GATES = Object.freeze({
  'aster-chat': { minimumCases:100, minimumSources:10, minimumHumanReviews:30, minimumCategories:6, maximumP95Ms:30_000 },
  'game-creation': { minimumCases:150, minimumSources:10, minimumHumanReviews:30, minimumCategories:5, maximumP95Ms:600_000 },
});
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const identityKeys = ['modelDigest','workflowVersion','runtimeVersion','settingsDigest','hardwareId'];
const chatCategories = ['answerable','unanswerable','follow-up','cross-source','live-context','source-injection'];
const rate = (passed,total) => count(passed) && count(total) && total > 0 && passed <= total ? passed / total : 0;

/** Only trusted, checked-in evaluation evidence belongs here, never model output.
 * Runtime readiness is deliberately separate from this quality decision.
 * A changed quantization, prompt/runtime, generation settings or machine must
 * not inherit another evaluation's quality or speed claim.
 */
export function qualifyModel({identity,useCase,evidence,expectedTemplateIds} = {}) {
  const gate = MODEL_QUALITY_GATES[useCase];
  if (!gate) throw new TypeError('Unknown model use case.');
  if (!evidence) return {status:'untested',label:'Not yet quality-tested',reasons:['No complete Asterloom evaluation is available for this use.']};
  const result = (status,label,reasons) => ({status,label,reasons,...(text(evidence.reportId) ? {reportId:evidence.reportId} : {})});
  if (!record(evidence) || !record(identity) || !record(evidence.identity)
    || identityKeys.some(key => !text(identity[key]) || evidence.identity[key] !== identity[key])
    || evidence.policyVersion !== MODEL_QUALIFICATION_VERSION || evidence.useCase !== useCase) {
    return result('outdated','Needs a matching benchmark',['The evaluation does not match this model, workflow, runtime, settings, machine and quality policy.']);
  }
  const reasons = [];
  if (!text(evidence.reportId) || !text(evidence.inputSetDigest) || !text(evidence.completedAt)
    || !Number.isFinite(Date.parse(evidence.completedAt)) || evidence.scope !== 'full-pipeline'
    || evidence.finished !== true || evidence.includesAllAttempts !== true) {
    reasons.push('A complete, traceable end-to-end report including failed attempts is required.');
  }
  if (!count(evidence.totalCases) || evidence.totalCases < gate.minimumCases) reasons.push(`At least ${gate.minimumCases} end-to-end cases are required.`);
  if (!count(evidence.distinctSources) || evidence.distinctSources < gate.minimumSources) reasons.push(`At least ${gate.minimumSources} held-out source sets are required.`);
  if (rate(evidence.successfulCases,evidence.totalCases) < .95) reasons.push('Fewer than 95% of all attempted cases succeeded within the bounded retry budget.');
  if (rate(evidence.firstAttemptSuccessfulCases,evidence.totalCases) < .90) reasons.push('Fewer than 90% of cases succeeded on their first attempt.');
  if (evidence.firstAttemptSuccessfulCases > evidence.successfulCases) reasons.push('First-attempt successes cannot exceed total successful cases.');
  if (!count(evidence.maximumRepairs) || evidence.maximumRepairs > 1) reasons.push('The report must use at most one repair per case.');
  if (evidence.criticalSourceErrors !== 0) reasons.push('Critical source-grounding errors must be independently checked and absent.');
  if (evidence.independentReview !== true || !count(evidence.humanReviewedCases) || evidence.humanReviewedCases < gate.minimumHumanReviews
    || evidence.humanReviewedCases > evidence.totalCases || rate(evidence.humanApprovedCases,evidence.humanReviewedCases) < .95) {
    reasons.push(`Independent human review must cover at least ${gate.minimumHumanReviews} cases and approve at least 95% for clarity, source fidelity and task usefulness.`);
  }
  if (evidence.latencySampleCount !== evidence.totalCases || !Number.isFinite(evidence.p95Ms) || evidence.p95Ms <= 0 || evidence.p95Ms > gate.maximumP95Ms) {
    reasons.push(`Measured end-to-end p95 time must cover every attempt and be at most ${gate.maximumP95Ms/1000} seconds on the stated hardware.`);
  }
  if (useCase === 'game-creation') {
    const templates = record(evidence.templateCaseCounts) ? Object.values(evidence.templateCaseCounts) : [];
    // The expected identities come from the trusted application catalog, never
    // from the report being evaluated. Counting aliases cannot prove coverage.
    const catalogValid = Array.isArray(expectedTemplateIds) && expectedTemplateIds.length === 75
      && expectedTemplateIds.every(text) && new Set(expectedTemplateIds).size === 75;
    if (!catalogValid || templates.length !== 75 || expectedTemplateIds.some(id=>!Object.hasOwn(evidence.templateCaseCounts??{},id)) || templates.some(value => !count(value) || value < 2) || templates.reduce((sum,value) => sum + value,0) !== evidence.totalCases) {
      reasons.push('All 75 templates need at least two end-to-end attempts, with every attempted case accounted for.');
    }
    if (evidence.nativePlayableCases !== evidence.successfulCases || !count(evidence.nativePlayableCases) || evidence.nativePlayableCases === 0) reasons.push('Every accepted game must pass native gameplay, scoring, save/resume and source-invalidation checks.');
    if (!count(evidence.sourceFormatCategories) || evidence.sourceFormatCategories < gate.minimumCategories || !count(evidence.ageGroups) || evidence.ageGroups < 2) reasons.push('Coverage needs at least five source-format categories and both adult and child learning groups.');
  } else {
    if (!record(evidence.categoryCaseCounts) || chatCategories.some(key => !count(evidence.categoryCaseCounts[key]) || evidence.categoryCaseCounts[key] < 10)
      || Object.values(evidence.categoryCaseCounts).some(value=>!count(value))
      || Object.values(evidence.categoryCaseCounts).reduce((sum,value)=>sum+value,0) !== evidence.totalCases) reasons.push('Chat coverage needs answerable, unanswerable, follow-up, cross-source, live-context and source-injection cases, with every case accounted for.');
    if (rate(evidence.groundedAnswers,evidence.answerableCases) < .95 || rate(evidence.correctAbstentions,evidence.unanswerableCases) < .95) reasons.push('Supported answers and appropriate abstentions must each reach 95%.');
    if (!count(evidence.answerableCases) || !count(evidence.unanswerableCases) || evidence.answerableCases + evidence.unanswerableCases !== evidence.totalCases) reasons.push('Every chat case must declare whether the sources support an answer.');
  }
  return reasons.length ? result('needs-work','Not qualified yet',reasons) : result('qualified',useCase === 'aster-chat' ? 'Verified for Aster chat' : 'Verified for game creation',[]);
}

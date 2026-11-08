import type { ActivityBase, Evaluation } from './structuredEngine';

/** Bounded free recall, with explicit source-written acceptable terms. It never
 * guesses semantic equivalence or quietly treats a revealed answer as mastery. */
export interface RecallActivity extends ActivityBase {
  kind: 'recall';
  questions: { id: string; prompt: string; answer: string; acceptedAnswers: string[]; reason: string; evidenceRefs: number[] }[];
}
export interface RecallResponse { answers: Record<string, string>; revealedIds: string[]; selectedQuestionId: string }
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const id = (value: unknown): value is string => text(value, 80) && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value) && !['__proto__','prototype','constructor'].includes(value);
const fields = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export function validateRecallFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (input.kind !== 'recall' || !fields(input, ['version','id','title','instruction','sourceRefs','reviewStatus','explanation','hint','kind','scaffoldIds','extractedFrom','questions'])) errors.push('recall: unsupported or unknown field');
  const refs = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 8) return [...errors, 'recall.questions: provide 1–8 source-backed questions'];
  const ids = new Set<string>();
  input.questions.forEach((question, index) => {
    const prefix = `recall.questions[${index}]`;
    if (!plain(question) || !fields(question, ['id','prompt','answer','acceptedAnswers','reason','evidenceRefs']) || !id(question.id) || ids.has(question.id) || !text(question.prompt, 1000) || !text(question.answer, 500) || !text(question.reason, 2000)) { errors.push(`${prefix}: invalid or duplicate question`); return; }
    ids.add(question.id);
    const evidence = question.evidenceRefs;
    if (!Array.isArray(evidence) || !evidence.length || evidence.length > refs.length || new Set(evidence).size !== evidence.length || evidence.some(n => !Number.isInteger(n) || n < 0 || n >= refs.length)) { errors.push(`${prefix}: cite the answer's exact source evidence`); return; }
    const excerpts = evidence.map(n => refs[n]).filter(plain).map(ref => typeof ref.evidence === 'string' ? ref.evidence : '');
    const alternatives = question.acceptedAnswers;
    if (!Array.isArray(alternatives) || alternatives.length > 8 || alternatives.some(value => !text(value, 500)) || new Set(alternatives.filter(value => typeof value === 'string').map(normalize)).size !== alternatives.length) { errors.push(`${prefix}: provide at most eight distinct source-written alternatives`); return; }
    if ([question.answer, ...alternatives].some(answer => !excerpts.some(excerpt => excerpt.includes(answer)))) errors.push(`${prefix}: every accepted answer must occur verbatim in its cited evidence`);
  });
  return errors;
}
export function initialRecallResponse(activity: RecallActivity, saved?: unknown): RecallResponse {
  const value = plain(saved) ? saved : {}, answers = plain(value.answers) ? value.answers : {};
  return {
    answers: Object.fromEntries(activity.questions.map(question => [question.id, typeof answers[question.id] === 'string' ? (answers[question.id] as string).slice(0, 2000) : ''])),
    revealedIds: Array.isArray(value.revealedIds) ? [...new Set(value.revealedIds.filter((entry): entry is string => typeof entry === 'string' && activity.questions.some(q => q.id === entry)))] : [],
    selectedQuestionId: activity.questions.some(question => question.id === value.selectedQuestionId) ? value.selectedQuestionId as string : activity.questions[0].id,
  };
}
export function evaluateRecall(activity: RecallActivity, response: unknown): Evaluation {
  const invalid = (feedback: string): Evaluation => ({valid:false,correct:null,outcome:'invalid',score:0,maxScore:activity.questions.length,feedback,details:[]});
  if (validateRecallFields(activity as unknown as Record<string, unknown>).length) return invalid('The prepared recall questions need review.');
  if (!plain(response) || !fields(response, ['answers','revealedIds','selectedQuestionId']) || !plain(response.answers) || Object.keys(response.answers).length !== activity.questions.length || activity.questions.some(q => !text((response.answers as Record<string, unknown>)[q.id], 2000)) || !Array.isArray(response.revealedIds) || new Set(response.revealedIds).size !== response.revealedIds.length || response.revealedIds.some(value => !activity.questions.some(q => q.id === value)) || !activity.questions.some(q => q.id === response.selectedQuestionId)) return invalid('Write an answer for each lock, or use a reveal to practise with support.');
  const answers = response.answers;
  const details = activity.questions.map(question => ({id:question.id, correct:[question.answer,...question.acceptedAnswers].some(answer => normalize(answer) === normalize(answers[question.id] as string)), message:question.reason}));
  const score = details.filter(detail => detail.correct).length, correct = score === details.length;
  return {valid:true,correct,outcome:correct?'correct':'retry',score,maxScore:details.length,hintUsed:response.revealedIds.length > 0,feedback:correct ? `The locks are open. ${activity.explanation}` : `Use the source's term or a prepared alternative for each lock. A different valid wording may need author review. ${activity.explanation}`,details};
}

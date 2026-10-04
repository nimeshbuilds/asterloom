import type { ActivityBase, Evaluation } from './structuredEngine';
export type DataCell = string | number | null;
export interface DataFilter { columnId: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: string | number }
export interface DataActivity extends ActivityBase {
  kind: 'data';
  datasetTitle: string;
  limitations: string;
  columns: { id: string; label: string; type: 'number' | 'text'; unit: string }[];
  rows: { id: string; label: string; values: Record<string, DataCell>; evidenceRefs: number[] }[];
  chartColumnId: string;
  questions: { id: string; prompt: string; operation: 'count' | 'sum' | 'mean' | 'min' | 'max'; columnId?: string; filters: DataFilter[]; tolerance: number; requireEvidenceRows: boolean; reason: string; evidenceRefs: number[] }[];
}
export interface DataResponse { answers: Record<string, string>; evidenceRows: Record<string, string[]>; view: { columnId: string; value: string; chartColumnId: string } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const text = (v: unknown, empty = false) => typeof v === 'string' && (empty || v.trim().length > 0) && v.length <= 4000;
const fields = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const BASE = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'kind', 'scaffoldIds', 'extractedFrom'];
function evidence(value: unknown, n: number) { return Array.isArray(value) && value.length > 0 && value.length <= 120 && value.every(v => Number.isInteger(v) && v >= 0 && v < n); }
export function validateDataFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [], refs = Array.isArray(input.sourceRefs) ? input.sourceRefs.length : 0;
  if (!fields(input, [...BASE, 'datasetTitle', 'limitations', 'columns', 'rows', 'chartColumnId', 'questions'])) errors.push('data: unknown field');
  if (!text(input.datasetTitle) || !text(input.limitations)) errors.push('data: a dataset title and interpretation limits are required');
  const columns = Array.isArray(input.columns) && input.columns.length >= 1 && input.columns.length <= 12 ? input.columns : [];
  const ids = new Map<string, string>();
  if (!columns.length) errors.push('data.columns: expected 1–12 columns');
  columns.forEach(c => { if (!object(c) || !fields(c, ['id', 'label', 'type', 'unit']) || !id(c.id) || ids.has(c.id) || !text(c.label) || !['number', 'text'].includes(String(c.type)) || !text(c.unit, true)) errors.push('data.columns: invalid or repeated column'); else ids.set(c.id, String(c.type)); });
  if (typeof input.chartColumnId !== 'string' || ids.get(input.chartColumnId) !== 'number') errors.push('data.chartColumnId: choose a numeric column');
  const rows = Array.isArray(input.rows) && input.rows.length >= 2 && input.rows.length <= 200 ? input.rows : [];
  const rowIds = new Set<string>();
  if (!rows.length) errors.push('data.rows: expected 2–200 records');
  rows.forEach(r => {
    if (!object(r) || !fields(r, ['id', 'label', 'values', 'evidenceRefs']) || !id(r.id) || rowIds.has(r.id) || !text(r.label)) { errors.push('data.rows: invalid or repeated record'); return; }
    rowIds.add(r.id);
    if (!object(r.values) || Object.keys(r.values).length !== ids.size || [...ids].some(([key, type]) => !Object.hasOwn(r.values as object, key) || ((r.values as Record<string, unknown>)[key] !== null && (type === 'number' ? typeof (r.values as Record<string, unknown>)[key] !== 'number' || !Number.isFinite((r.values as Record<string, number>)[key]) || Math.abs((r.values as Record<string, number>)[key]) > 1e12 : !text((r.values as Record<string, unknown>)[key], true))))) errors.push('data.rows: each record needs typed values for every column; null means missing');
    if (!evidence(r.evidenceRefs, refs)) errors.push('data.rows: every record needs source evidence');
  });
  const questions = Array.isArray(input.questions) && input.questions.length >= 1 && input.questions.length <= 20 ? input.questions : [];
  const questionIds = new Set<string>();
  if (!questions.length) errors.push('data.questions: expected 1–20 investigations');
  questions.forEach(q => {
    if (!object(q) || !fields(q, ['id', 'prompt', 'operation', 'columnId', 'filters', 'tolerance', 'requireEvidenceRows', 'reason', 'evidenceRefs']) || !id(q.id) || questionIds.has(q.id)) { errors.push('data.questions: invalid question'); return; }
    questionIds.add(q.id);
    if (!text(q.prompt) || !text(q.reason) || !evidence(q.evidenceRefs, refs)) errors.push('data.questions: provide a prompt, explanation and source evidence');
    if (!['count', 'sum', 'mean', 'min', 'max'].includes(String(q.operation)) || (q.operation !== 'count' && (typeof q.columnId !== 'string' || ids.get(q.columnId) !== 'number')) || (q.operation === 'count' && q.columnId !== undefined)) errors.push('data.questions: aggregate must reference a numeric column; record count has no column');
    if (typeof q.tolerance !== 'number' || !Number.isFinite(q.tolerance) || q.tolerance < 0 || q.tolerance > 1e6 || typeof q.requireEvidenceRows !== 'boolean') errors.push('data.questions: define a nonnegative numeric tolerance and evidence requirement');
    if (!Array.isArray(q.filters) || q.filters.length > 8) errors.push('data.questions: at most eight filter conditions');
    else q.filters.forEach(f => { if (!object(f) || !fields(f, ['columnId', 'op', 'value']) || typeof f.columnId !== 'string' || !ids.has(f.columnId) || !['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(String(f.op)) || (ids.get(f.columnId) === 'text' ? !['eq', 'neq'].includes(String(f.op)) || !text(f.value, true) : typeof f.value !== 'number' || !Number.isFinite(f.value))) errors.push('data.questions: filter value and operator must match the column type'); });
  });
  if (!errors.length) {
    const a = input as unknown as DataActivity;
    for (const q of a.questions) { const n = computeDataAnswer(a, q); if (!Number.isFinite(n.value)) errors.push(`data.questions.${q.id}: the selected records contain no usable numeric observations`); }
  }
  return errors;
}
export function matchesDataFilters(row: DataActivity['rows'][number], filters: DataFilter[]): boolean {
  return filters.every(f => { const v = row.values[f.columnId]; if (v === null || v === undefined) return false; switch (f.op) { case 'eq': return v === f.value; case 'neq': return v !== f.value; case 'gt': return typeof v === 'number' && typeof f.value === 'number' && v > f.value; case 'gte': return typeof v === 'number' && typeof f.value === 'number' && v >= f.value; case 'lt': return typeof v === 'number' && typeof f.value === 'number' && v < f.value; case 'lte': return typeof v === 'number' && typeof f.value === 'number' && v <= f.value; } });
}
export function computeDataAnswer(activity: DataActivity, q: DataActivity['questions'][number]) {
  const filtered = activity.rows.filter(r => matchesDataFilters(r, q.filters));
  const rows = q.operation === 'count' ? filtered : filtered.filter(r => typeof r.values[q.columnId!] === 'number');
  const values = rows.map(r => r.values[q.columnId!] as number), sum = values.reduce((a, b) => a + b, 0);
  const value = q.operation === 'count' ? rows.length : !values.length ? NaN : q.operation === 'sum' ? sum : q.operation === 'mean' ? sum / values.length : q.operation === 'min' ? Math.min(...values) : Math.max(...values);
  return { value, rowIds: rows.map(r => r.id) };
}
export function initialDataResponse(activity: DataActivity, saved?: unknown): DataResponse {
  const v = object(saved) ? saved : {}, a = object(v.answers) ? v.answers : {}, e = object(v.evidenceRows) ? v.evidenceRows : {}, view = object(v.view) ? v.view : {};
  return { answers: Object.fromEntries(activity.questions.map(q => [q.id, typeof a[q.id] === 'string' ? (a[q.id] as string).slice(0, 100) : ''])), evidenceRows: Object.fromEntries(activity.questions.map(q => [q.id, Array.isArray(e[q.id]) ? [...new Set((e[q.id] as unknown[]).filter((id): id is string => typeof id === 'string' && activity.rows.some(r => r.id === id)))] : []])), view: { columnId: typeof view.columnId === 'string' && activity.columns.some(c => c.id === view.columnId) ? view.columnId : '', value: typeof view.value === 'string' ? view.value.slice(0, 1000) : '', chartColumnId: typeof view.chartColumnId === 'string' && activity.columns.some(c => c.id === view.chartColumnId && c.type === 'number') ? view.chartColumnId : activity.chartColumnId } };
}
export function evaluateData(activity: DataActivity, response: unknown): Evaluation {
  const invalid = (feedback: string): Evaluation => ({ valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: activity.questions.length, feedback, details: [] });
  if (validateDataFields(activity as unknown as Record<string, unknown>).length) return invalid('The dataset requires author review.');
  if (!object(response) || !object(response.answers) || !object(response.evidenceRows) || Object.keys(response.answers).length !== activity.questions.length) return invalid('Record a result for every investigation.');
  const answers = response.answers, evidence = response.evidenceRows, details: Evaluation['details'] = [];
  for (const q of activity.questions) {
    const answer = answers[q.id], rows = evidence[q.id];
    if (typeof answer !== 'string' || answer.length > 100 || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(answer.trim()) || !Number.isFinite(Number(answer))) return invalid('Enter a finite numerical result for each investigation.');
    if (!Array.isArray(rows) || rows.length > activity.rows.length || rows.some(id => !activity.rows.some(r => r.id === id)) || new Set(rows).size !== rows.length) return invalid('Select distinct dataset records as evidence.');
    const expected = computeDataAnswer(activity, q), correct = Math.abs(Number(answer) - expected.value) <= q.tolerance + 1e-10 && (!q.requireEvidenceRows || rows.length === expected.rowIds.length && expected.rowIds.every(id => rows.includes(id)));
    details.push({ id: q.id, correct, message: `${q.reason} Reviewed ${q.operation}: ${Number(expected.value.toPrecision(10))}. ${q.requireEvidenceRows ? `Supporting records: ${expected.rowIds.map(id => activity.rows.find(r => r.id === id)!.label).join(', ')}.` : ''}` });
  }
  const score = details.filter(d => d.correct).length, correct = score === details.length;
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length, feedback: `${correct ? 'Your findings match the supplied observations.' : 'Check the population, missing values and calculation.'} ${activity.explanation}`, details };
}

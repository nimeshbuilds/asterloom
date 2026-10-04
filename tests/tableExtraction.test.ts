import { describe, expect, it } from 'vitest';
import { extractStructuredActivities, validateActivity, evaluateActivity, evaluateActivityForAuthoring } from '../src/lib/structuredEngine';
import { extractTableActivities } from '../src/lib/tableExtraction';
import { initialDataResponse } from '../src/lib/dataEngine';
const source = (text: string) => ({ id: 'original-log', title: 'Observations', text, status: 'ready' as const });
describe('deterministic table compilation', () => {
  it.each([
    'Name,Reading\n"Plot, north",-2\nPlot south,4\nEmpty plot,',
    'Name\tReading\r\nPlot north\t-2\r\nPlot south\t4\r\nEmpty plot\t',
    '| Name | Reading |\n| --- | ---: |\n| Plot north | -2 |\n| Plot south | 4 |\n| Empty plot | |',
  ])('extracts exact evidence and descriptive results from %s', text => {
    const s = source(text), { activities } = extractStructuredActivities([s]);
    const a = activities.find(a => a.kind === 'data'); expect(a?.kind).toBe('data'); if (!a || a.kind !== 'data') throw new Error('Missing data model');
    expect(validateActivity(a, [s]).success).toBe(true); expect(a.reviewStatus).toBe('needs-review');
    expect(a.rows[2].values['column-2']).toBeNull(); expect(a.sourceRefs.every(ref => text.includes(ref.evidence))).toBe(true);
    const response = initialDataResponse(a); response.answers = { 'count-records': '3', 'largest-value': '4' };
    expect(evaluateActivityForAuthoring(a, response).correct).toBe(true);
    expect(evaluateActivity(a, response)).toMatchObject({ valid: false, correct: null, outcome: 'draft-preview', score: 0 });
    expect(evaluateActivity({ ...a, reviewStatus: 'reviewed' }, response).correct).toBe(true);
    expect(validateActivity(a, [source(text.replace('4', '5'))]).success).toBe(false);
  });
  it('keeps identifiers, formulas and mixed numeric formatting as literal text', () => {
    const [a] = extractTableActivities(source('ID,Formula,Reading\n001,=SUM(A1:A2),2\n002,<script>bad()</script>,3'));
    expect(a.columns.map(c => c.type)).toEqual(['text', 'text', 'number']); expect(a.rows[0].values['column-2']).toBe('=SUM(A1:A2)');
    expect(extractTableActivities(source('Name,Reading\nA,12 kg\nB,14 kg'))).toEqual([]);
  });
  it.each([
    'Name,Reading\nA,2\nB,3,extra\nC,4',
    'Name,Reading\nA,2\nB,3\n4',
    'Name,Reading\n"bad,2\nB,3',
    'Name,Name\nA,2\nB,3',
    'Name,Reading\nA,2',
    'Name,Reading\n' + Array.from({ length: 101 }, (_, i) => `row${i},${i}`).join('\n'),
  ])('refuses incomplete or ambiguous blocks instead of silently dropping records', text => {
    expect(extractTableActivities(source(text))).toEqual([]);
  });
  it('keeps stable IDs and extracts two independent tables without connecting their meaning', () => {
    const s = source('Site,Value\nA,2\nB,3\n\nOther table\n\nGroup,Count\nC,5\nD,6');
    const first = extractTableActivities(s); expect(first).toHaveLength(2); expect(first).toEqual(extractTableActivities(s)); expect(new Set(first.map(a => a.id)).size).toBe(2);
  });
});


describe('table scan boundary provenance', () => {
  it('never turns a partially scanned number into a different supported measurement', () => {
    const table = 'Name,Reading\nA,2\nB,1234567890';
    const text = 'x'.repeat(500000 - table.indexOf('123') - 3 - 1) + '\n' + table;
    expect(text.length).toBeGreaterThan(500000);
    expect(extractTableActivities(source(text))).toEqual([]);
  });
  it('rejects a candidate continuing beyond the cap even when its scanned rows are complete', () => {
    const table = 'Name,Reading\nA,2\nB,3\n';
    const text = 'x'.repeat(500000 - table.length - 1) + '\n' + table + 'C,4\nD,5';
    expect(extractTableActivities(source(text))).toEqual([]);
  });
  it('retains an earlier table only when its full ending was observed', () => {
    const finished = 'Name,Reading\nA,2\nB,3\n\n';
    const text = finished + 'x'.repeat(500010);
    const activities = extractTableActivities(source(text));
    expect(activities).toHaveLength(1);
    expect(activities[0].rows.map(row => row.values['column-2'])).toEqual([2,3]);
  });
});

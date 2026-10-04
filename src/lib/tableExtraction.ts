import type { Source } from '../types';
import type { DataActivity } from './dataEngine';

/** Deliberately bounded: single-line CSV/TSV and explicit Markdown tables. No formula execution,
 * locale guessing, multiline quoted fields, missing-value imputation or causal interpretation. */
function cells(line: string, delimiter: ',' | '\t' | '|'): string[] | null {
  let value = '', quoted = false, closed = false;
  const result: string[] = [];
  const input = delimiter === '|' ? line.trim().replace(/^\|/, '').replace(/\|$/, '') : line;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') { if (input[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } }
      else value += c;
    } else if (c === delimiter) { result.push(value.trim()); value = ''; closed = false; }
    else if (c === '"') { if (value.trim() || closed || delimiter === '|') return null; quoted = true; value = ''; }
    else if (closed && c.trim()) return null;
    else value += c;
  }
  if (quoted) return null;
  result.push(value.trim()); return result;
}
const number = (value: string) => /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e12;
function hash(value: string) { let n = 2166136261; for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619); return (n >>> 0).toString(36); }
export function extractTableActivities(source: Pick<Source, 'id' | 'title' | 'text'>): DataActivity[] {
  const scanLimit = 500_000, truncated = source.text.length > scanLimit;
  const lines = source.text.slice(0, scanLimit).split(/\r?\n/), result: DataActivity[] = [];
  // The final scanned line may be only a prefix of an original record. Even if
  // it looks numeric, it is not evidence of the complete value.
  if (truncated) lines.pop();
  for (let start = 0; start < lines.length && result.length < 10; start++) {
    const line = lines[start];
    const delimiter = line.includes('\t') ? '\t' : line.includes('|') ? '|' : line.includes(',') ? ',' : null;
    if (!delimiter) continue;
    const header = cells(line, delimiter);
    if (!header || header.length < 2 || header.length > 12 || header.some(c => !c || c.length > 150 || number(c)) || new Set(header).size !== header.length) continue;
    const markdown = delimiter === '|';
    if (markdown) {
      const separator = cells(lines[start + 1] ?? '', '|');
      if (!separator || separator.length !== header.length || !separator.every(c => /^:?-{3,}:?$/.test(c))) continue;
    }
    const rows: { line: string; cells: string[] }[] = [];
    let end = start + (markdown ? 2 : 1), malformed = false;
    for (; end < lines.length; end++) {
      if (!lines[end].trim()) break;
      if (!lines[end].includes(delimiter)) { if (!markdown && !/^\s*```/.test(lines[end])) malformed = true; break; }
      const row = cells(lines[end], delimiter);
      if (!row || row.length !== header.length || row.some(c => c.length > 1000) || rows.length >= 100) { malformed = true; break; }
      rows.push({ line: lines[end], cells: row });
    }
    // A table without a visible terminator may continue beyond the scan cap.
    // Reject the whole candidate instead of presenting an incomplete population.
    if (truncated && end >= lines.length) malformed = true;
    // Consume the entire candidate block, even when malformed. Never silently reinterpret a suffix.
    if (malformed) { while (end < lines.length && lines[end].trim() && lines[end].includes(delimiter)) end++; start = end - 1; continue; }
    if (rows.length < 2) continue;
    start = end - 1;
    const columns: DataActivity['columns'] = header.map((label, i) => {
      const present = rows.map(r => r.cells[i]).filter(Boolean);
      return { id: `column-${i + 1}`, label, type: present.length && present.every(number) ? 'number' : 'text', unit: '' };
    });
    const measure = columns.find(c => c.type === 'number');
    if (!measure) continue;
    const sourceRefs = [line, ...rows.map(r => r.line)].map(evidence => ({ sourceId: source.id, evidence }));
    const labelColumn = columns.findIndex(c => c.type === 'text');
    result.push({ version: 1, kind: 'data', id: `activity-${hash(source.id + JSON.stringify(sourceRefs))}`, extractedFrom: source.id,
      title: `${source.title.slice(0, 120)}: investigate the table`, datasetTitle: source.title.slice(0, 150),
      instruction: `Explore the supplied records. Count the records and find the largest recorded ${measure.label}.`,
      sourceRefs, reviewStatus: 'needs-review', scaffoldIds: ['chart-and-data-investigation'],
      hint: 'Use the table beside the chart. A blank cell is missing, not zero.',
      explanation: 'These findings describe only the supplied table. Empty measurements are excluded from numeric calculations.',
      limitations: 'Extracted automatically from an explicit table. Review column meanings, units and records before publishing. No causal claims, missing-value estimates or generalization beyond these records are supported.',
      columns, chartColumnId: measure.id,
      rows: rows.map((r, i) => ({ id: `record-${i + 1}`, label: labelColumn >= 0 && r.cells[labelColumn] ? r.cells[labelColumn] : `Record ${i + 1}`, values: Object.fromEntries(columns.map((c, j) => [c.id, r.cells[j] === '' ? null : c.type === 'number' ? Number(r.cells[j]) : r.cells[j]])), evidenceRefs: [0, i + 1] })),
      questions: [
        { id: 'count-records', prompt: 'How many records are in the full table, including records with a missing measurement?', operation: 'count', filters: [], tolerance: 0, requireEvidenceRows: false, reason: 'Count each data row once; the header is not a record.', evidenceRefs: sourceRefs.map((_, i) => i) },
        { id: 'largest-value', prompt: `What is the largest recorded value in “${measure.label}”?`, operation: 'max', columnId: measure.id, filters: [], tolerance: 0, requireEvidenceRows: false, reason: 'Compare all supplied numeric values in this column; blank cells contribute no measurement.', evidenceRefs: sourceRefs.map((_, i) => i) },
      ],
    });
  }
  return result;
}

import type { Scaffold } from './scaffolds';

/** Safe declarative schema. Recipes may configure known engines, never supply executable code. */
export interface ScaffoldContentContract {
  version: 1;
  evidence: 'source-backed';
  assessment: 'answer-key' | 'dependency-graph' | 'category-membership' | 'relation-map' | 'state-machine' | 'rubric' | 'diagram-map' | 'media-cues';
  requiredData: string[];
  grading: 'deterministic-bounded' | 'self-or-human';
  acceptsOpenEnded: boolean;
  limitations: string[];
}
export type ScaffoldDefinition = Scaffold;
export type ValidationResult<T> = { success: true; value: T } | { success: false; errors: string[] };
export const SCAFFOLD_SCHEMA_VERSION = '1.0.0' as const;
export const SCAFFOLD_FAMILIES = ['recall', 'match', 'sequence', 'sort', 'cloze', 'scenario', 'diagram', 'explain', 'connect', 'timed'] as const;
export const SCAFFOLD_SCENES = ['islands', 'observatory', 'forest', 'workshop', 'ocean', 'library'] as const;
const AGES = ['3-5', '6-8', '9-11', '12-14', '15-17', 'adult'];
const ASSESSMENTS = ['answer-key', 'dependency-graph', 'category-membership', 'relation-map', 'state-machine', 'rubric', 'diagram-map', 'media-cues'];
const FIELDS = ['version', 'id', 'name', 'tagline', 'description', 'icon', 'family', 'ages', 'skills', 'mechanic', 'learningPrinciple', 'missionTemplate', 'feedbackRules', 'prerequisites', 'difficulty', 'duration', 'color', 'visual', 'dialogue', 'domain', 'contentContract'];
function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function keys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown fields are not allowed`);
}
function textField(value: unknown, path: string, errors: string[], max = 1500): value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    errors.push(`${path}: expected non-empty text of at most ${max} characters`);
    return false;
  }
  return true;
}
function list(value: unknown, path: string, errors: string[], max = 16, textMax = 600): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    errors.push(`${path}: expected 1–${max} text entries`);
    return false;
  }
  value.forEach((item, index) => textField(item, `${path}[${index}]`, errors, textMax));
  return value.every((item) => typeof item === 'string');
}
function enumeration(value: unknown, choices: readonly string[], path: string, errors: string[]) {
  if (typeof value !== 'string' || !choices.includes(value)) errors.push(`${path}: expected one of ${choices.join(', ')}`);
}
function hex(value: unknown, path: string, errors: string[]) {
  if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) errors.push(`${path}: expected a six-digit hex color`);
}

/**
 * Shape validation is not educational, domain or security certification.
 * Returns a detached plain-data definition. Render strings as text; never eval recipe fields.
 */
export function validateScaffoldDefinition(input: unknown): ValidationResult<ScaffoldDefinition> {
  const errors: string[] = [];
  if (!record(input)) return { success: false, errors: ['scaffold: expected a plain object'] };
  keys(input, FIELDS, 'scaffold', errors);
  if (input.version !== SCAFFOLD_SCHEMA_VERSION) errors.push('version: unsupported scaffold schema version');
  if (typeof input.id !== 'string' || !/^[a-z][a-z\d-]{2,79}$/.test(input.id)) errors.push('id: expected a lowercase identifier, 3–80 characters');
  for (const field of ['name', 'tagline', 'icon', 'domain']) textField(input[field], field, errors, field === 'icon' ? 64 : 150);
  for (const field of ['description', 'mechanic', 'learningPrinciple', 'missionTemplate']) textField(input[field], field, errors);
  enumeration(input.family, SCAFFOLD_FAMILIES, 'family', errors);
  if (list(input.ages, 'ages', errors, 6, 20)) {
    input.ages.forEach((age) => enumeration(age, AGES, 'ages', errors));
    if (new Set(input.ages).size !== input.ages.length) errors.push('ages: duplicate age groups are not allowed');
  }
  list(input.skills, 'skills', errors, 12, 80);
  list(input.feedbackRules, 'feedbackRules', errors);
  list(input.prerequisites, 'prerequisites', errors);
  if (![1, 2, 3].includes(input.difficulty as number)) errors.push('difficulty: expected 1, 2 or 3');
  if (typeof input.duration !== 'number' || !Number.isInteger(input.duration) || input.duration < 1 || input.duration > 180) errors.push('duration: expected whole minutes from 1 to 180');
  hex(input.color, 'color', errors);
  if (!record(input.visual)) errors.push('visual: expected scene, accent and motif');
  else {
    keys(input.visual, ['scene', 'accent', 'motif'], 'visual', errors);
    enumeration(input.visual.scene, SCAFFOLD_SCENES, 'visual.scene', errors);
    hex(input.visual.accent, 'visual.accent', errors);
    if (typeof input.visual.motif !== 'string' || !/^[a-z][a-z\d-]{2,79}$/.test(input.visual.motif)) errors.push('visual.motif: expected a bounded motif identifier');
  }
  if (!record(input.dialogue)) errors.push('dialogue: expected prepared intro, success, tryAgain and hint text');
  else {
    keys(input.dialogue, ['intro', 'success', 'tryAgain', 'hint'], 'dialogue', errors);
    for (const field of ['intro', 'success', 'tryAgain', 'hint']) textField(input.dialogue[field], `dialogue.${field}`, errors);
  }
  if (!record(input.contentContract)) errors.push('contentContract: expected a versioned content contract');
  else {
    const contract = input.contentContract;
    keys(contract, ['version', 'evidence', 'assessment', 'requiredData', 'grading', 'acceptsOpenEnded', 'limitations'], 'contentContract', errors);
    if (contract.version !== 1) errors.push('contentContract.version: expected 1');
    if (contract.evidence !== 'source-backed') errors.push('contentContract.evidence: source-backed evidence is required');
    enumeration(contract.assessment, ASSESSMENTS, 'contentContract.assessment', errors);
    enumeration(contract.grading, ['deterministic-bounded', 'self-or-human'], 'contentContract.grading', errors);
    list(contract.requiredData, 'contentContract.requiredData', errors);
    list(contract.limitations, 'contentContract.limitations', errors);
    if (typeof contract.acceptsOpenEnded !== 'boolean') errors.push('contentContract.acceptsOpenEnded: expected boolean');
    if (contract.acceptsOpenEnded && contract.grading !== 'self-or-human') errors.push('contentContract: open-ended work requires self or human assessment');
  }
  if (errors.length > 0) return { success: false, errors };
  return { success: true, value: JSON.parse(JSON.stringify(input)) as ScaffoldDefinition };
}

/** Import is bounded to avoid unreasonably large catalogs and duplicated recipe identities. */
export function validateScaffoldCatalog(input: unknown): ValidationResult<ScaffoldDefinition[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > 500) return { success: false, errors: ['catalog: expected between 1 and 500 definitions'] };
  const errors: string[] = [];
  const values: ScaffoldDefinition[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const result = validateScaffoldDefinition(item);
    if (!result.success) errors.push(...result.errors.map((error) => `catalog[${index}].${error}`));
    else if (seen.has(result.value.id)) errors.push(`catalog[${index}].id: duplicate identifier ${result.value.id}`);
    else { seen.add(result.value.id); values.push(result.value); }
  });
  return errors.length ? { success: false, errors } : { success: true, value: values };
}

/** JSON text is data only; a size limit is checked before parsing. */
export function parseScaffoldCatalog(json: string): ValidationResult<ScaffoldDefinition[]> {
  if (typeof json !== 'string' || json.length > 2_000_000) return { success: false, errors: ['catalog: expected JSON text of at most 2 MB'] };
  try { return validateScaffoldCatalog(JSON.parse(json)); }
  catch { return { success: false, errors: ['catalog: invalid JSON'] }; }
}

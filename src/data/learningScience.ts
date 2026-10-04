/** Evidence-informed rules. Product defaults are hypotheses to test, not clinical or learning diagnoses. */
export interface LearningSource {
  id: string;
  title: string;
  authors: string;
  year: number;
  url: string;
  kind: 'research' | 'research-review' | 'practice-guide' | 'consensus';
}
export const LEARNING_SOURCES: LearningSource[] = [
  { id: 'styles', title: 'Learning Styles: Concepts and Evidence', authors: 'Pashler, McDaniel, Rohrer & Bjork', year: 2008, url: 'https://www.psychologicalscience.org/journals/pspi/j.1539-6053.2009.01038.x/', kind: 'research-review' },
  { id: 'wwc', title: 'Organizing Instruction and Study to Improve Student Learning', authors: 'Institute of Education Sciences / What Works Clearinghouse', year: 2007, url: 'https://ies.ed.gov/ncee/wwc/practiceguide/1', kind: 'practice-guide' },
  { id: 'retrieval', title: 'Retrieval Practice Produces More Learning than Elaborative Studying with Concept Mapping', authors: 'Karpicke & Blunt', year: 2011, url: 'https://doi.org/10.1126/science.1199327', kind: 'research' },
  { id: 'spacing', title: 'Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis', authors: 'Cepeda, Pashler, Vul, Wixted & Rohrer', year: 2006, url: 'https://digitalcommons.usf.edu/psy_facpub/1771/', kind: 'research-review' },
  { id: 'interleaving', title: 'The Shuffling of Mathematics Problems Improves Learning', authors: 'Rohrer & Taylor', year: 2007, url: 'https://link.springer.com/article/10.1007/s11251-007-9015-8', kind: 'research' },
  { id: 'sdt', title: 'The Motivational Pull of Video Games: A Self-Determination Theory Approach', authors: 'Ryan, Rigby & Przybylski', year: 2006, url: 'https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf', kind: 'research' },
  { id: 'early-childhood', title: 'Principles of Child Development and Learning and Implications That Inform Practice', authors: 'National Association for the Education of Young Children', year: 2020, url: 'https://www.naeyc.org/resources/position-statements/dap/principles', kind: 'consensus' },
  { id: 'adolescence', title: 'The Promise of Adolescence: Realizing Opportunity for All Youth', authors: 'National Academies of Sciences, Engineering, and Medicine', year: 2019, url: 'https://nap.nationalacademies.org/resource/25388/interactive/', kind: 'consensus' },
  { id: 'accessibility', title: 'Web Content Accessibility Guidelines 2.2', authors: 'W3C', year: 2023, url: 'https://www.w3.org/TR/WCAG22/', kind: 'consensus' },
];

export interface LearningPrinciple {
  id: string;
  name: string;
  summary: string;
  implementation: string[];
  avoid: string;
  sources: string[];
}
export const LEARNING_PRINCIPLES: LearningPrinciple[] = [
  { id: 'retrieval', name: 'Remember by bringing it to mind', summary: 'Include an attempt to retrieve an idea before revealing the answer.', implementation: ['Provide a low-stakes independent attempt.', 'After feedback, revisit a changed instance.', 'Store hint use separately from independent success.'], avoid: 'Treating recognition, rereading and independent recall as equivalent mastery evidence.', sources: ['retrieval', 'wwc'] },
  { id: 'spacing', name: 'Return after a useful pause', summary: 'Revisit important ideas across sessions rather than only repeating them immediately.', implementation: ['Keep a per-objective review queue.', 'Give missed ideas another supported attempt and an early later review.', 'Expand review intervals after independent retrieval.'], avoid: 'Claiming any fixed schedule is optimal for every learner and topic.', sources: ['spacing', 'wwc'] },
  { id: 'worked-examples', name: 'See it, finish it, then try it', summary: 'Offer a worked example before asking for an unfamiliar multi-step performance.', implementation: ['Present an accurate example with a clear explanation.', 'Fade support through completion problems.', 'Let the learner restore support without punishment.'], avoid: 'Starting novices with an unscaffolded complex puzzle.', sources: ['wwc'] },
  { id: 'interleave', name: 'Practice choosing the right approach', summary: 'Mix related, confusable problem types once their basic methods are understood.', implementation: ['Interleave related objectives, not arbitrary unrelated topics.', 'Avoid switching the interaction controls unnecessarily.', 'Explain the feature that signals the correct strategy.'], avoid: 'Random variety that overwhelms beginners or hides the learning objective.', sources: ['interleaving', 'wwc'] },
  { id: 'representations', name: 'Make representations agree', summary: 'Use relevant visual and verbal explanations together when the content benefits from them.', implementation: ['Label important visual relationships.', 'Provide a usable text equivalent.', 'Keep decorative animation away from reading and decision moments.'], avoid: 'Classifying people as visual, auditory or kinesthetic learners and claiming matching improves outcomes.', sources: ['styles', 'wwc', 'accessibility'] },
  { id: 'explanation', name: 'Connect an answer to a reason', summary: 'Invite learners to explain a process, comparison or conclusion using explicit criteria.', implementation: ['Offer prepared explanation components for deterministic assessment.', 'Use visible rubrics for self or human review.', 'Keep unrestricted prose and speech outside automatic correctness claims.'], avoid: 'Grading an essay from keyword overlap or presenting confident AI judgment as proof.', sources: ['wwc'] },
  { id: 'autonomy', name: 'Give meaningful control', summary: 'Support choice of goals, route, pacing and help while keeping the learning path understandable.', implementation: ['Offer a small number of relevant mission choices.', 'Make pause, retry and support readily available.', 'Use natural stopping points and optional reminders.'], avoid: 'Loss-framed streaks, coercive countdowns, loot boxes or pressure to keep playing.', sources: ['sdt'] },
  { id: 'competence', name: 'Make progress understandable', summary: 'Show the learner what improved and what to try next.', implementation: ['Give specific task feedback.', 'Adjust support before raising difficulty.', 'Report evidence by objective, with a clear distinction between completion and mastery.'], avoid: 'A global intelligence score or permanent learner labels.', sources: ['sdt'] },
  { id: 'relatedness', name: 'Learn alongside someone', summary: 'Offer supportive private cooperation and optional friendly competition.', implementation: ['Use invitation-only challenges.', 'Provide solo equivalents of partner activities.', 'Compare compatible challenge versions and keep sensitive learning details private.'], avoid: 'Public child rankings, shaming and claiming signatures prove honest offline play.', sources: ['sdt', 'early-childhood'] },
  { id: 'development', name: 'Adapt to the learner and context', summary: 'Use age as a starting point, then allow language, reading, access and prior-knowledge adjustments.', implementation: ['For young children, use caregiver-supported concrete play.', 'For adolescents, offer meaningful roles, agency and supportive feedback.', 'Keep all pacing and modality defaults editable.'], avoid: 'Treating five age bands as five fixed developmental stages or learning styles.', sources: ['early-childhood', 'adolescence', 'styles'] },
];

export interface LearningMode {
  id: string;
  name: string;
  description: string;
  icon: string;
  skills: string[];
  preferredFamilies: string[];
}
export const LEARNING_MODES: LearningMode[] = [
  { id: 'explore', name: 'Explore & understand', description: 'Build a mental model with examples, connections and gentle practice.', icon: '🧭', skills: ['understanding', 'relationships', 'comparison'], preferredFamilies: ['connect', 'match', 'diagram'] },
  { id: 'remember', name: 'Remember & recall', description: 'Bring important ideas to mind and revisit them over time.', icon: '🗝️', skills: ['recall', 'vocabulary', 'precision'], preferredFamilies: ['recall', 'cloze', 'match'] },
  { id: 'practice', name: 'Practice a skill', description: 'Move from worked examples to independent application.', icon: '🛠️', skills: ['procedure', 'application', 'troubleshooting'], preferredFamilies: ['sequence', 'scenario', 'cloze'] },
  { id: 'investigate', name: 'Investigate & reason', description: 'Compare evidence, test explanations and make a supported judgment.', icon: '🔎', skills: ['evidence', 'analysis', 'hypothesis'], preferredFamilies: ['connect', 'scenario', 'sort'] },
  { id: 'create', name: 'Build & design', description: 'Construct, test and revise a solution against clear requirements.', icon: '🏗️', skills: ['construction', 'constraints', 'iteration'], preferredFamilies: ['diagram', 'sequence', 'sort'] },
  { id: 'teach', name: 'Explain & teach', description: 'Connect an idea to its reasons, examples and limits.', icon: '💬', skills: ['explanation', 'metacognition', 'argument'], preferredFamilies: ['explain', 'connect', 'match'] },
  { id: 'prepare', name: 'Prepare for an exam', description: 'Practice supported exam objectives, identify gaps and schedule review.', icon: '🎯', skills: ['exam-prep', 'recall', 'application'], preferredFamilies: ['recall', 'cloze', 'scenario'] },
];

export interface ReviewState {
  objectiveId: string;
  intervalDays: number;
  level: number;
  independentSuccesses: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt?: string;
}
export interface ReviewAttempt {
  correct: boolean;
  hintUsed: boolean;
  /** Self-assessed/open-ended answers do not establish independent mastery. */
  assessment?: 'validated' | 'self-assessed' | 'human-reviewed';
}
const DAY_MS = 86_400_000;
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60] as const;
function validTime(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('A valid review time is required.');
  return parsed;
}
export function createReviewState(objectiveId: string, now: string | number): ReviewState {
  return { objectiveId, intervalDays: 0, level: 0, independentSuccesses: 0, lapses: 0, dueAt: new Date(validTime(now)).toISOString() };
}
/** Simple transparent scheduling policy, not a validated personalization model. */
export function scheduleReview(previous: ReviewState, attempt: ReviewAttempt, now: string | number): ReviewState {
  const at = validTime(now);
  const independent = attempt.correct && !attempt.hintUsed && attempt.assessment !== 'self-assessed';
  const oldLevel = Math.max(0, Math.min(REVIEW_INTERVALS_DAYS.length - 1, Math.floor(previous.level || 0)));
  // Early repetitions may aid practice, but cannot advance the spaced-review ladder.
  const laterSession = !previous.lastReviewedAt || at >= validTime(previous.dueAt);
  const level = independent ? Math.min(oldLevel + (laterSession && previous.independentSuccesses > 0 ? 1 : 0), REVIEW_INTERVALS_DAYS.length - 1) : Math.max(0, oldLevel - 1);
  const intervalDays = independent ? REVIEW_INTERVALS_DAYS[level] : 1;
  return { ...previous, level, intervalDays, independentSuccesses: previous.independentSuccesses + (independent && laterSession ? 1 : 0), lapses: previous.lapses + (attempt.correct ? 0 : 1), lastReviewedAt: new Date(at).toISOString(), dueAt: independent && !laterSession ? previous.dueAt : new Date(at + intervalDays * DAY_MS).toISOString() };
}
export function isReviewDue(state: ReviewState, now: string | number): boolean {
  return validTime(state.dueAt) <= validTime(now);
}
export interface AdaptiveAttempt { correct: boolean; hintUsed: boolean; }
export interface SupportRecommendation { support: 'worked-example' | 'guided' | 'independent'; message: string; }
/** Keep control changes separate from content difficulty; players can always override support. */
export function recommendSupport(attempts: AdaptiveAttempt[]): SupportRecommendation {
  const recent = attempts.slice(-4);
  if (recent.length === 0) return { support: 'guided', message: 'Start with a short example and choose how much help you want.' };
  if (recent.filter((attempt) => !attempt.correct).length >= 2) return { support: 'worked-example', message: 'Try one worked example, then a smaller step.' };
  if (recent.length >= 3 && recent.every((attempt) => attempt.correct && !attempt.hintUsed)) return { support: 'independent', message: 'You are solving these independently. Try a new case when you are ready.' };
  return { support: 'guided', message: 'Keep the same challenge level with hints available.' };
}
export const AUTHORING_RULES = [
  'Manual source entry, question editing, scaffold selection and export must work without an AI provider.',
  'Filter recipes using explicit content prerequisites before deterministic ranking; optional AI can refine eligible choices.',
  'Every automatically scored answer requires a reviewed key, accepted alternatives, explanation and source provenance.',
  'Never fabricate a simulator, procedure, scientific observation, image label or causal link from insufficient material.',
  'Use images, narration and diagrams for the task and accessibility need, not a diagnosed learning style.',
  'Every recipe needs keyboard operation, accessible text, saved state and a solo path.',
  'Open-ended work needs a visible self/human rubric; deterministic components may be automatically assessed.',
  'Hints preserve access to the game while remaining distinguishable from independent learning evidence.',
  'Completion, enjoyment, retention and transfer are different outcomes; measure them separately.',
] as const;

import type { StructuredActivity } from './lib/structuredEngine';
import type { ReviewState } from './data/learningScience';
import type { MediaTranscript } from './lib/mediaTranscript';
import type { VisualEvidence } from './lib/visualEvidence';
import type { LessonState } from './lib/learningBriefing';

export type SourceKind = 'text' | 'document' | 'website' | 'youtube' | 'notebooklm' | 'audio' | 'video' | 'image' | 'transcript';
export type SourceStatus = 'ready' | 'needs-transcript' | 'error';

export interface Source {
  id: string;
  title: string;
  kind: SourceKind;
  text: string;
  url?: string;
  mime?: string;
  dataUrl?: string;
  /** Content-addressed local file, copied with a native game or asset archive. */
  asset?: { id: string; name: string; mime: string; size: number; sha256: string; duration?: number };
  transcript?: MediaTranscript;
  visualEvidence?: VisualEvidence;
  status: SourceStatus;
  addedAt: string;
  error?: string;
  originalFile?: { name: string; mime: string; dataUrl: string; size: number; sha256: string };
  /** Describes the imported web snapshot, not later edits to readable source text. */
  webImport?: { requestedUrl: string; retrievedAt: string; extractor: string; contentStatus: 'extracted' | 'partial' | 'needs-assistance'; warnings: string[] };
}

export interface EvidenceLocator { kind: 'text' | 'page' | 'slide' | 'sheet' | 'timestamp'; label: string; lineStart: number; lineEnd: number }
/** Offsets are UTF-16 code units in the exact readable source text, end exclusive. */
export interface EvidenceReference { sourceId: string; sourceRevision: string; start: number; end: number; quote: string; locator: EvidenceLocator }
export interface EvidenceBlock extends EvidenceReference { id: string; sourceTitle: string }
export interface LearningObjective { id: string; title: string; operation: 'recall' | 'sequence' | 'classification' | 'explanation'; reviewStatus: 'needs-review' | 'reviewed'; evidence: EvidenceReference[] }


export interface LearningCard {
  id: string;
  prompt: string;
  answer: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceId: string;
  evidence: string;
  concept: string;
  tags: string[];
  questionType?: 'definition' | 'cloze' | 'sequence' | 'manual';
  reviewStatus?: 'extractive' | 'needs-review' | 'reviewed';
}

/** Presentation assets stay separate from source evidence and never feed the compiler. */
export interface NotebookArtwork {
  id: string;
  title: string;
  dataUrl: string;
  sourceId: string;
  evidence: string;
  purpose: 'decorative' | 'instructional';
  reviewStatus: 'draft' | 'reviewed';
  createdAt: string;
}

export interface Notebook {
  /** Version of deterministic preparation; older authored notebooks remain untouched. */
  generationVersion?: number;
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  ageGroup: string;
  goal: string;
  theme: string;
  scaffoldIds: string[];
  sources: Source[];
  cards: LearningCard[];
  activities?: StructuredActivity[];
  artwork?: NotebookArtwork[];
  learningObjectives?: LearningObjective[];
  revision: number;
}

export type Confidence = 'guessing' | 'unsure' | 'confident';
export interface Attempt {
  id: string;
  cardId: string;
  correct: boolean;
  at: string;
  confidence: Confidence;
  xp: number;
}
export interface CardProgress {
  cardId: string;
  attempts: number;
  correct: number;
  successfulReviews: number;
  intervalDays: number;
  dueAt: string;
  lastAttemptAt: string;
  lastCorrect: boolean;
}
export interface JournalEntry { id: string; text: string; at: string; cardId?: string }
/** Source-bound field notes record participation, never assessed mastery. */
export interface SourceStudyState {
  unitId: string; sourceId: string; quote: string; note: string; question: string;
  completed: boolean; updatedAt: string;
}
export interface Progress {
  studies?: Record<string, SourceStudyState>;
  /** Content-bound lesson checkpoints, separate from assessed recall. */
  lessons?: Record<string, LessonState>;
  notebookId: string;
  completedCardIds: string[];
  attempts: Attempt[];
  cards: Record<string, CardProgress>;
  xp: number;
  mastery: number;
  streak: number;
  bestStreak: number;
  sessions: number;
  journal: JournalEntry[];
  updatedAt: string;
  revision: number;
  structured?: Record<string, { response: unknown; completed: boolean; score: number; maxScore: number; attempts: number; updatedAt: string; review?: ReviewState; reviewStartedAt?: string }>;
  /** Persist the current play position without assuming a particular scaffold. */
  activeSession?: { scaffoldId: string; chapterId?: string; cardIds: string[]; index: number; seed: number; startedAt: string; state?: Record<string, unknown> };
}

export interface LearnPackage {
  format: 'learnpack';
  version: 1;
  exportedAt: string;
  notebook: Notebook;
}

export interface CompileOptions { maxCards?: number; title?: string; ageGroup?: string; goal?: string }
export interface CompileResult { cards: LearningCard[]; warnings: string[]; usedSourceIds: string[] }

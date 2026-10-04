import type { StructuredActivity } from './lib/structuredEngine';

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
  status: SourceStatus;
  addedAt: string;
  error?: string;
}

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

export interface Notebook {
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
export interface Progress {
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
  structured?: Record<string, { response: unknown; completed: boolean; score: number; maxScore: number; attempts: number; updatedAt: string }>;
  /** Persist the current play position without assuming a particular scaffold. */
  activeSession?: { scaffoldId: string; cardIds: string[]; index: number; seed: number; startedAt: string; state?: Record<string, unknown> };
}

export interface LearnPackage {
  format: 'learnpack';
  version: 1;
  exportedAt: string;
  notebook: Notebook;
}

export interface CompileOptions { maxCards?: number; title?: string; ageGroup?: string; goal?: string }
export interface CompileResult { cards: LearningCard[]; warnings: string[]; usedSourceIds: string[] }

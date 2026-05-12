export const ANNOTATION_TAGS = [
  'wrong-answer',
  'hallucination',
  'incomplete',
  'wrong-source-cited',
  'tone-issue',
  'correct',
] as const;
export type AnnotationTag = (typeof ANNOTATION_TAGS)[number];

export const TAG_LABELS: Record<AnnotationTag, string> = {
  'wrong-answer': 'Wrong Answer',
  hallucination: 'Hallucination',
  incomplete: 'Incomplete',
  'wrong-source-cited': 'Wrong Source',
  'tone-issue': 'Tone Issue',
  correct: 'Correct',
};

export const SEVERITY_LEVELS = ['minor', 'major', 'critical'] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export const ISSUE_TAGS = ANNOTATION_TAGS.filter((t): t is Exclude<AnnotationTag, 'correct'> => t !== 'correct');

export const SEVERITY_VARIANT_MAP: Record<Severity, 'info' | 'warning' | 'error'> = {
  minor: 'info',
  major: 'warning',
  critical: 'error',
};

export type { ScorerCategory } from '@typhoon/evals/scorer-categories';
export { computeCategoryAverages, normalizeScoreForAvg, SCORER_CATEGORIES } from '@typhoon/evals/scorer-categories';

export const SCORE_THRESHOLDS: Record<string, { pass: number; label: string }> = {
  answerRelevancy: { pass: 0.6, label: 'Answer Relevancy' },
  faithfulness: { pass: 0.7, label: 'Faithfulness' },
  hallucination: { pass: 0.3, label: 'Hallucination' },
  contextRelevance: { pass: 0.5, label: 'Context Relevance' },
  contextPrecision: { pass: 0.5, label: 'Context Precision' },
};

export type { ChatMessage } from '@typhoon/chat';

export interface ReviewScore {
  id: string;
  scorer_id: string;
  score: number | null;
  reason: string;
  metadata: Record<string, unknown> | null;
  resource_id: string | null;
  created_at: string;
}

export interface FeedbackEntry {
  rating: 'positive' | 'negative';
  comment: string | null;
  userName: string;
  createdAt: string;
}

export interface ReviewDetailResponse {
  id: string;
  resourceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Record<string, unknown>[];
  scoresByMessage: Record<string, ReviewScore[]>;
  feedbackByMessage: Record<string, FeedbackEntry[]>;
}

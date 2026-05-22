/** Annotation tag types. */
export type AnnotationTag =
  | 'wrong-answer'
  | 'hallucination'
  | 'incomplete'
  | 'wrong-source-cited'
  | 'tone-issue'
  | 'correct';

/** Annotation severity levels. */
export type AnnotationSeverity = 'minor' | 'major' | 'critical';

/** A thread summary in the review list. */
export interface ReviewThread {
  threadId: string;
  title: string;
  messageCount: number;
  avgScore: number | null;
  annotationStatus: string;
  createdAt: string;
  updatedAt: string;
}

/** A message with its scores and annotations in the review detail. */
export interface ReviewMessage {
  id: string;
  role: string;
  content: unknown;
  scores: Record<string, unknown>[];
  annotation: ReviewAnnotation | null;
  createdAt: string;
}

/** A human annotation on a message. */
export interface ReviewAnnotation {
  id: string;
  messageId: string;
  userId: string;
  tags: AnnotationTag[];
  severity?: AnnotationSeverity;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

/** Review detail response with thread info and annotated messages. */
export interface ReviewDetail {
  thread: {
    id: string;
    title: string;
    createdAt: string;
  };
  messages: ReviewMessage[];
}

/** Payload for POST/PATCH annotation. */
export interface AnnotationInput {
  tags: AnnotationTag[];
  severity?: AnnotationSeverity;
  comment?: string;
}

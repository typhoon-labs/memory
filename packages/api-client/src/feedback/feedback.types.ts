/** A single feedback entry returned by the GET /v1/feedback endpoint. */
export interface FeedbackEntry {
  id: string;
  messageId: string;
  rating: 'positive' | 'negative';
  comment: string | null;
  createdAt: string;
}

/** Payload for POST /v1/feedback (upsert or delete). */
export interface UpsertFeedbackInput {
  messageId: string;
  rating: 'positive' | 'negative' | null;
  comment?: string | null;
}

/** Response from POST /v1/feedback. Shape varies based on upsert vs delete. */
export interface UpsertFeedbackResponse {
  id?: string;
  messageId?: string;
  rating?: string;
  comment?: string | null;
  deleted?: true;
}

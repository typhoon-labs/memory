/** A thread returned by the API. */
export interface Thread {
  id: string;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** A message within a thread. */
export interface ThreadMessage {
  id: string;
  role: string;
  content: unknown;
  createdAt: string;
}

/** Thread detail with messages. */
export interface ThreadDetail {
  thread: Thread;
  messages: ThreadMessage[];
}

/** Paginated thread list response. */
export interface ThreadListResponse {
  threads: Thread[];
  total: number;
  page: number;
  perPage: number;
}

/** Payload for POST /v1/threads. */
export interface CreateThreadInput {
  title?: string;
  metadata?: Record<string, unknown>;
}

/** Payload for PATCH /v1/threads/:threadId. */
export interface UpdateThreadInput {
  title?: string;
  metadata?: Record<string, unknown>;
}

export const queryKeys = {
  documents: {
    all: ['documents'] as const,
    list: (filters?: { syncTargetId?: string }) => [...queryKeys.documents.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.documents.all, 'detail', id] as const,
    chunks: (id: string) => [...queryKeys.documents.all, 'chunks', id] as const,
    parsedContent: (id: string) => [...queryKeys.documents.all, 'parsed-content', id] as const,
    metadataFields: (syncTargetId?: string) => [...queryKeys.documents.all, 'metadata-fields', syncTargetId] as const,
  },
  syncTargets: {
    all: ['sync-targets'] as const,
    list: () => [...queryKeys.syncTargets.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.syncTargets.all, 'detail', id] as const,
    jobs: (id: string) => [...queryKeys.syncTargets.all, 'jobs', id] as const,
    browse: (id: string, path?: string) => [...queryKeys.syncTargets.all, 'browse', id, path] as const,
  },
  threads: {
    all: ['threads'] as const,
    list: () => [...queryKeys.threads.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.threads.all, 'detail', id] as const,
  },
  feedback: {
    all: ['feedback'] as const,
    byThread: (threadId: string) => [...queryKeys.feedback.all, 'thread', threadId] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    list: (filters?: { sortBy?: string; annotationStatus?: string }) =>
      [...queryKeys.reviews.all, 'list', filters] as const,
    detail: (threadId: string) => [...queryKeys.reviews.all, 'detail', threadId] as const,
  },
  scorers: {
    all: ['scorers'] as const,
    list: () => [...queryKeys.scorers.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.scorers.all, 'detail', id] as const,
    categories: () => [...queryKeys.scorers.all, 'categories'] as const,
  },
  experiments: {
    all: ['experiments'] as const,
    list: () => [...queryKeys.experiments.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.experiments.all, 'detail', id] as const,
    results: (id: string) => [...queryKeys.experiments.all, 'results', id] as const,
    compare: (ids: string[]) => [...queryKeys.experiments.all, 'compare', ...ids] as const,
  },
  datasets: {
    all: ['datasets'] as const,
    list: () => [...queryKeys.datasets.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.datasets.all, 'detail', id] as const,
    items: (id: string, version?: number) => [...queryKeys.datasets.all, 'items', id, version] as const,
  },
  search: {
    all: ['search'] as const,
    results: (query: string, filters?: Record<string, unknown>) =>
      [...queryKeys.search.all, 'results', query, filters] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    scores: (params?: { dateFrom?: string; dateTo?: string; range?: string }) =>
      [...queryKeys.dashboard.all, 'scores', params] as const,
    conversations: (params?: { dateFrom?: string; dateTo?: string; range?: string }) =>
      [...queryKeys.dashboard.all, 'conversations', params] as const,
    overview: (params?: { dateFrom?: string; dateTo?: string; range?: string }) =>
      [...queryKeys.dashboard.all, 'overview', params] as const,
  },
  traces: {
    all: ['traces'] as const,
    list: (filters?: object) => [...queryKeys.traces.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.traces.all, 'detail', id] as const,
  },
  queues: {
    all: ['queues'] as const,
    list: () => [...queryKeys.queues.all, 'list'] as const,
    detail: (name: string) => [...queryKeys.queues.all, 'detail', name] as const,
    jobs: (name: string, status?: string) => [...queryKeys.queues.all, 'jobs', name, status] as const,
    failedJobs: () => [...queryKeys.queues.all, 'failed'] as const,
  },
  metadata: {
    all: ['metadata'] as const,
    fieldGroups: () => [...queryKeys.metadata.all, 'field-groups'] as const,
    fieldGroup: (id: string) => [...queryKeys.metadata.all, 'field-group', id] as const,
    templates: () => [...queryKeys.metadata.all, 'templates'] as const,
    template: (id: string) => [...queryKeys.metadata.all, 'template', id] as const,
  },
} as const;

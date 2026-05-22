import { describe, expect, it } from 'vitest';

import { queryKeys } from './query-keys';

describe('queryKeys', () => {
  describe('documents', () => {
    it('has correct base key', () => {
      expect(queryKeys.documents.all).toEqual(['documents']);
    });

    it('list key includes filters', () => {
      expect(queryKeys.documents.list({ syncTargetId: 'abc' })).toEqual(['documents', 'list', { syncTargetId: 'abc' }]);
    });

    it('list key without filters', () => {
      expect(queryKeys.documents.list()).toEqual(['documents', 'list', undefined]);
    });

    it('detail key includes id', () => {
      expect(queryKeys.documents.detail('123')).toEqual(['documents', 'detail', '123']);
    });

    it('chunks key includes id', () => {
      expect(queryKeys.documents.chunks('doc-1')).toEqual(['documents', 'chunks', 'doc-1']);
    });

    it('parsedContent key includes id', () => {
      expect(queryKeys.documents.parsedContent('doc-1')).toEqual(['documents', 'parsed-content', 'doc-1']);
    });

    it('metadataFields key includes syncTargetId', () => {
      expect(queryKeys.documents.metadataFields('st-1')).toEqual(['documents', 'metadata-fields', 'st-1']);
    });
  });

  describe('syncTargets', () => {
    it('has correct base key', () => {
      expect(queryKeys.syncTargets.all).toEqual(['sync-targets']);
    });

    it('list key', () => {
      expect(queryKeys.syncTargets.list()).toEqual(['sync-targets', 'list']);
    });

    it('detail key includes id', () => {
      expect(queryKeys.syncTargets.detail('st-1')).toEqual(['sync-targets', 'detail', 'st-1']);
    });

    it('jobs key includes id', () => {
      expect(queryKeys.syncTargets.jobs('st-1')).toEqual(['sync-targets', 'jobs', 'st-1']);
    });

    it('browse key includes id and path', () => {
      expect(queryKeys.syncTargets.browse('st-1', '/docs')).toEqual(['sync-targets', 'browse', 'st-1', '/docs']);
    });

    it('browse key without path', () => {
      expect(queryKeys.syncTargets.browse('st-1')).toEqual(['sync-targets', 'browse', 'st-1', undefined]);
    });
  });

  describe('threads', () => {
    it('has correct base key', () => {
      expect(queryKeys.threads.all).toEqual(['threads']);
    });

    it('list key', () => {
      expect(queryKeys.threads.list()).toEqual(['threads', 'list']);
    });

    it('detail key includes id', () => {
      expect(queryKeys.threads.detail('t-1')).toEqual(['threads', 'detail', 't-1']);
    });
  });

  describe('feedback', () => {
    it('has correct base key', () => {
      expect(queryKeys.feedback.all).toEqual(['feedback']);
    });

    it('byThread key includes threadId', () => {
      expect(queryKeys.feedback.byThread('t-1')).toEqual(['feedback', 'thread', 't-1']);
    });
  });

  describe('reviews', () => {
    it('has correct base key', () => {
      expect(queryKeys.reviews.all).toEqual(['reviews']);
    });

    it('list key includes filters', () => {
      expect(queryKeys.reviews.list({ sortBy: 'score', annotationStatus: 'pending' })).toEqual([
        'reviews',
        'list',
        { sortBy: 'score', annotationStatus: 'pending' },
      ]);
    });

    it('list key without filters', () => {
      expect(queryKeys.reviews.list()).toEqual(['reviews', 'list', undefined]);
    });

    it('detail key includes threadId', () => {
      expect(queryKeys.reviews.detail('t-1')).toEqual(['reviews', 'detail', 't-1']);
    });
  });

  describe('scorers', () => {
    it('has correct base key', () => {
      expect(queryKeys.scorers.all).toEqual(['scorers']);
    });

    it('list key', () => {
      expect(queryKeys.scorers.list()).toEqual(['scorers', 'list']);
    });

    it('detail key includes id', () => {
      expect(queryKeys.scorers.detail('s-1')).toEqual(['scorers', 'detail', 's-1']);
    });

    it('categories key', () => {
      expect(queryKeys.scorers.categories()).toEqual(['scorers', 'categories']);
    });
  });

  describe('experiments', () => {
    it('has correct base key', () => {
      expect(queryKeys.experiments.all).toEqual(['experiments']);
    });

    it('list key', () => {
      expect(queryKeys.experiments.list()).toEqual(['experiments', 'list']);
    });

    it('detail key includes id', () => {
      expect(queryKeys.experiments.detail('e-1')).toEqual(['experiments', 'detail', 'e-1']);
    });

    it('results key includes id', () => {
      expect(queryKeys.experiments.results('e-1')).toEqual(['experiments', 'results', 'e-1']);
    });

    it('compare key spreads ids', () => {
      expect(queryKeys.experiments.compare(['e-1', 'e-2'])).toEqual(['experiments', 'compare', 'e-1', 'e-2']);
    });
  });

  describe('datasets', () => {
    it('has correct base key', () => {
      expect(queryKeys.datasets.all).toEqual(['datasets']);
    });

    it('list key', () => {
      expect(queryKeys.datasets.list()).toEqual(['datasets', 'list']);
    });

    it('detail key includes id', () => {
      expect(queryKeys.datasets.detail('d-1')).toEqual(['datasets', 'detail', 'd-1']);
    });

    it('items key includes id and version', () => {
      expect(queryKeys.datasets.items('d-1', 2)).toEqual(['datasets', 'items', 'd-1', 2]);
    });

    it('items key without version', () => {
      expect(queryKeys.datasets.items('d-1')).toEqual(['datasets', 'items', 'd-1', undefined]);
    });
  });

  describe('search', () => {
    it('has correct base key', () => {
      expect(queryKeys.search.all).toEqual(['search']);
    });

    it('results key includes query and filters', () => {
      const filters = { syncTargetId: 'st-1' };
      expect(queryKeys.search.results('hello', filters)).toEqual(['search', 'results', 'hello', filters]);
    });

    it('results key without filters', () => {
      expect(queryKeys.search.results('hello')).toEqual(['search', 'results', 'hello', undefined]);
    });
  });

  describe('dashboard', () => {
    it('has correct base key', () => {
      expect(queryKeys.dashboard.all).toEqual(['dashboard']);
    });

    it('scores key includes params', () => {
      const params = { dateFrom: '2024-01-01', dateTo: '2024-01-31' };
      expect(queryKeys.dashboard.scores(params)).toEqual(['dashboard', 'scores', params]);
    });

    it('conversations key includes params', () => {
      const params = { range: '7d' };
      expect(queryKeys.dashboard.conversations(params)).toEqual(['dashboard', 'conversations', params]);
    });

    it('overview key without params', () => {
      expect(queryKeys.dashboard.overview()).toEqual(['dashboard', 'overview', undefined]);
    });
  });

  describe('traces', () => {
    it('has correct base key', () => {
      expect(queryKeys.traces.all).toEqual(['traces']);
    });

    it('list key includes filters', () => {
      expect(queryKeys.traces.list({ agentId: 'a-1', status: 'error' })).toEqual([
        'traces',
        'list',
        { agentId: 'a-1', status: 'error' },
      ]);
    });

    it('detail key includes id', () => {
      expect(queryKeys.traces.detail('trace-1')).toEqual(['traces', 'detail', 'trace-1']);
    });
  });

  describe('queues', () => {
    it('has correct base key', () => {
      expect(queryKeys.queues.all).toEqual(['queues']);
    });

    it('list key', () => {
      expect(queryKeys.queues.list()).toEqual(['queues', 'list']);
    });

    it('detail key includes name', () => {
      expect(queryKeys.queues.detail('sync')).toEqual(['queues', 'detail', 'sync']);
    });

    it('jobs key includes name and status', () => {
      expect(queryKeys.queues.jobs('sync', 'failed')).toEqual(['queues', 'jobs', 'sync', 'failed']);
    });

    it('failedJobs key', () => {
      expect(queryKeys.queues.failedJobs()).toEqual(['queues', 'failed']);
    });
  });

  describe('metadata', () => {
    it('has correct base key', () => {
      expect(queryKeys.metadata.all).toEqual(['metadata']);
    });

    it('fieldGroups key', () => {
      expect(queryKeys.metadata.fieldGroups()).toEqual(['metadata', 'field-groups']);
    });

    it('fieldGroup key includes id', () => {
      expect(queryKeys.metadata.fieldGroup('fg-1')).toEqual(['metadata', 'field-group', 'fg-1']);
    });

    it('templates key', () => {
      expect(queryKeys.metadata.templates()).toEqual(['metadata', 'templates']);
    });

    it('template key includes id', () => {
      expect(queryKeys.metadata.template('t-1')).toEqual(['metadata', 'template', 't-1']);
    });
  });

  describe('hierarchical invalidation', () => {
    it('all keys start with their domain base key', () => {
      // documents
      expect(queryKeys.documents.list()[0]).toBe('documents');
      expect(queryKeys.documents.detail('x')[0]).toBe('documents');
      expect(queryKeys.documents.chunks('x')[0]).toBe('documents');

      // syncTargets
      expect(queryKeys.syncTargets.list()[0]).toBe('sync-targets');
      expect(queryKeys.syncTargets.detail('x')[0]).toBe('sync-targets');

      // threads
      expect(queryKeys.threads.list()[0]).toBe('threads');
      expect(queryKeys.threads.detail('x')[0]).toBe('threads');

      // feedback
      expect(queryKeys.feedback.byThread('x')[0]).toBe('feedback');

      // reviews
      expect(queryKeys.reviews.list()[0]).toBe('reviews');
      expect(queryKeys.reviews.detail('x')[0]).toBe('reviews');

      // scorers
      expect(queryKeys.scorers.list()[0]).toBe('scorers');
      expect(queryKeys.scorers.detail('x')[0]).toBe('scorers');

      // experiments
      expect(queryKeys.experiments.list()[0]).toBe('experiments');
      expect(queryKeys.experiments.detail('x')[0]).toBe('experiments');

      // datasets
      expect(queryKeys.datasets.list()[0]).toBe('datasets');
      expect(queryKeys.datasets.detail('x')[0]).toBe('datasets');

      // search
      expect(queryKeys.search.results('q')[0]).toBe('search');

      // dashboard
      expect(queryKeys.dashboard.scores()[0]).toBe('dashboard');

      // traces
      expect(queryKeys.traces.list()[0]).toBe('traces');
      expect(queryKeys.traces.detail('x')[0]).toBe('traces');

      // queues
      expect(queryKeys.queues.list()[0]).toBe('queues');
      expect(queryKeys.queues.detail('x')[0]).toBe('queues');

      // metadata
      expect(queryKeys.metadata.fieldGroups()[0]).toBe('metadata');
      expect(queryKeys.metadata.template('x')[0]).toBe('metadata');
    });
  });
});

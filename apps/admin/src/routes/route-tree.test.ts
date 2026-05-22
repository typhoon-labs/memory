import { describe, expect, it } from 'vitest';

import {
  routeTree,
  validateSearchExperimentCompare,
  validateSearchReviews,
  validateSearchTraceDetail,
} from './route-tree';

describe('validateSearchReviews', () => {
  it('returns defaults for empty input', () => {
    const result = validateSearchReviews({});
    expect(result).toEqual({
      sortBy: 'newest',
      annotationStatus: 'all',
      feedbackStatus: 'all',
      search: undefined,
    });
  });

  it('parses valid sortBy values', () => {
    expect(validateSearchReviews({ sortBy: 'newest' }).sortBy).toBe('newest');
    expect(validateSearchReviews({ sortBy: 'unscored' }).sortBy).toBe('unscored');
  });

  it('rejects invalid sortBy', () => {
    expect(validateSearchReviews({ sortBy: 'invalid' }).sortBy).toBe('newest');
  });

  it('parses valid annotationStatus', () => {
    expect(validateSearchReviews({ annotationStatus: 'annotated' }).annotationStatus).toBe('annotated');
    expect(validateSearchReviews({ annotationStatus: 'unannotated' }).annotationStatus).toBe('unannotated');
  });

  it('rejects invalid annotationStatus', () => {
    expect(validateSearchReviews({ annotationStatus: 'bogus' }).annotationStatus).toBe('all');
  });

  it('parses valid feedbackStatus', () => {
    expect(validateSearchReviews({ feedbackStatus: 'has-feedback' }).feedbackStatus).toBe('has-feedback');
    expect(validateSearchReviews({ feedbackStatus: 'has-negative' }).feedbackStatus).toBe('has-negative');
    expect(validateSearchReviews({ feedbackStatus: 'no-feedback' }).feedbackStatus).toBe('no-feedback');
  });

  it('rejects invalid feedbackStatus', () => {
    expect(validateSearchReviews({ feedbackStatus: 'nope' }).feedbackStatus).toBe('all');
  });

  it('parses search string', () => {
    expect(validateSearchReviews({ search: 'hello' }).search).toBe('hello');
  });

  it('rejects non-string search', () => {
    expect(validateSearchReviews({ search: 123 }).search).toBeUndefined();
  });
});

describe('validateSearchExperimentCompare', () => {
  it('returns defaults for empty input', () => {
    expect(validateSearchExperimentCompare({})).toEqual({ a: '', b: '', item: undefined });
  });

  it('parses experiment IDs', () => {
    const result = validateSearchExperimentCompare({ a: 'exp-1', b: 'exp-2' });
    expect(result.a).toBe('exp-1');
    expect(result.b).toBe('exp-2');
  });

  it('defaults to empty string for non-string IDs', () => {
    expect(validateSearchExperimentCompare({ a: 123, b: null }).a).toBe('');
    expect(validateSearchExperimentCompare({ a: 123, b: null }).b).toBe('');
  });

  it('parses numeric item from string', () => {
    expect(validateSearchExperimentCompare({ item: '7' }).item).toBe(7);
  });

  it('parses item "0"', () => {
    expect(validateSearchExperimentCompare({ item: '0' }).item).toBe(0);
  });

  it('accepts item as actual number (from programmatic navigate)', () => {
    expect(validateSearchExperimentCompare({ item: 3 }).item).toBe(3);
  });

  it('rejects non-numeric item', () => {
    expect(validateSearchExperimentCompare({ item: 'abc' }).item).toBeUndefined();
  });
});

describe('validateSearchTraceDetail', () => {
  it('returns undefined span for empty input', () => {
    expect(validateSearchTraceDetail({})).toEqual({ span: undefined });
  });

  it('parses string span ID', () => {
    expect(validateSearchTraceDetail({ span: 'span-abc' }).span).toBe('span-abc');
  });

  it('rejects non-string span', () => {
    expect(validateSearchTraceDetail({ span: 123 }).span).toBeUndefined();
  });
});

describe('validateSearchReviews — combination scenarios', () => {
  it('parses all valid params together', () => {
    const result = validateSearchReviews({
      sortBy: 'responseScore',
      annotationStatus: 'annotated',
      feedbackStatus: 'has-negative',
      search: 'test query',
    });
    expect(result).toEqual({
      sortBy: 'responseScore',
      annotationStatus: 'annotated',
      feedbackStatus: 'has-negative',
      search: 'test query',
    });
  });

  it('defaults invalid values but keeps valid ones', () => {
    const result = validateSearchReviews({
      sortBy: 'bogus',
      annotationStatus: 'unannotated',
      feedbackStatus: 999,
      search: 'hello',
    });
    expect(result).toEqual({
      sortBy: 'newest',
      annotationStatus: 'unannotated',
      feedbackStatus: 'all',
      search: 'hello',
    });
  });

  it('handles retrievalScore sortBy', () => {
    expect(validateSearchReviews({ sortBy: 'retrievalScore' }).sortBy).toBe('retrievalScore');
  });
});

describe('validateSearchReviews — sortBy edge cases', () => {
  it('handles responseScore sortBy value', () => {
    expect(validateSearchReviews({ sortBy: 'responseScore' }).sortBy).toBe('responseScore');
  });

  it('parses has-negative feedbackStatus', () => {
    expect(validateSearchReviews({ feedbackStatus: 'has-negative' }).feedbackStatus).toBe('has-negative');
  });

  it('parses no-feedback feedbackStatus', () => {
    expect(validateSearchReviews({ feedbackStatus: 'no-feedback' }).feedbackStatus).toBe('no-feedback');
  });

  it('rejects boolean feedbackStatus', () => {
    expect(validateSearchReviews({ feedbackStatus: true }).feedbackStatus).toBe('all');
  });

  it('rejects boolean sortBy', () => {
    expect(validateSearchReviews({ sortBy: true }).sortBy).toBe('newest');
  });

  it('rejects array annotationStatus', () => {
    expect(validateSearchReviews({ annotationStatus: ['annotated'] }).annotationStatus).toBe('all');
  });
});

// ── Inline validateSearch functions (accessed via route tree) ──

function findRouteByPath(
  route: { children?: Array<{ options?: { path?: string }; children?: unknown[] }> },
  path: string,
): { options?: { validateSearch?: (s: Record<string, unknown>) => unknown } } | undefined {
  const stack: Array<{ options?: { path?: string; validateSearch?: unknown }; children?: unknown[] }> = [
    route as { options?: { path?: string }; children?: unknown[] },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if ((current as { options?: { path?: string } }).options?.path === path)
      return current as { options?: { validateSearch?: (s: Record<string, unknown>) => unknown } };
    const children = (current as { children?: unknown[] }).children;
    if (Array.isArray(children)) {
      for (const child of children) stack.push(child as typeof current);
    }
  }
  return undefined;
}

describe('inline validateSearch — sourceDetailRoute', () => {
  const route = findRouteByPath(routeTree as never, '/sources/$sourceId');

  it('defaults tab to overview', () => {
    const result = route?.options?.validateSearch?.({}) as { tab: string; path: string };
    expect(result.tab).toBe('overview');
    expect(result.path).toBe('');
  });

  it('parses valid tab value', () => {
    const result = route?.options?.validateSearch?.({ tab: 'documents' }) as { tab: string };
    expect(result.tab).toBe('documents');
  });

  it('rejects invalid tab value', () => {
    const result = route?.options?.validateSearch?.({ tab: 'invalid' }) as { tab: string };
    expect(result.tab).toBe('overview');
  });

  it('parses path string', () => {
    const result = route?.options?.validateSearch?.({ path: 'docs/' }) as { path: string };
    expect(result.path).toBe('docs/');
  });
});

describe('inline validateSearch — documentsRoute', () => {
  const route = findRouteByPath(routeTree as never, '/documents');

  it('defaults status to all', () => {
    const result = route?.options?.validateSearch?.({}) as { status: string; syncTargetId?: string };
    expect(result.status).toBe('all');
    expect(result.syncTargetId).toBeUndefined();
  });

  it('parses valid status', () => {
    const result = route?.options?.validateSearch?.({ status: 'ready' }) as { status: string };
    expect(result.status).toBe('ready');
  });

  it('parses syncTargetId', () => {
    const result = route?.options?.validateSearch?.({ syncTargetId: 'st-1' }) as { syncTargetId: string };
    expect(result.syncTargetId).toBe('st-1');
  });

  it('rejects invalid status', () => {
    const result = route?.options?.validateSearch?.({ status: 'bogus' }) as { status: string };
    expect(result.status).toBe('all');
  });
});

describe('inline validateSearch — experimentsRoute', () => {
  const route = findRouteByPath(routeTree as never, '/experiments');

  it('defaults status to all', () => {
    const result = route?.options?.validateSearch?.({}) as { status: string };
    expect(result.status).toBe('all');
  });

  it('parses valid status', () => {
    const result = route?.options?.validateSearch?.({ status: 'running' }) as { status: string };
    expect(result.status).toBe('running');
  });

  it('rejects invalid status', () => {
    const result = route?.options?.validateSearch?.({ status: 'nope' }) as { status: string };
    expect(result.status).toBe('all');
  });
});

describe('inline validateSearch — experimentDetailRoute', () => {
  const route = findRouteByPath(routeTree as never, '/experiments/$experimentId');

  it('defaults result to undefined', () => {
    const result = route?.options?.validateSearch?.({}) as { result?: string };
    expect(result.result).toBeUndefined();
  });

  it('parses result string', () => {
    const result = route?.options?.validateSearch?.({ result: 'r-123' }) as { result: string };
    expect(result.result).toBe('r-123');
  });
});

describe('inline validateSearch — scorersRoute', () => {
  const route = findRouteByPath(routeTree as never, '/scorers');

  it('defaults status to all', () => {
    const result = route?.options?.validateSearch?.({}) as { status: string };
    expect(result.status).toBe('all');
  });

  it('parses valid status', () => {
    const result = route?.options?.validateSearch?.({ status: 'active' }) as { status: string };
    expect(result.status).toBe('active');
  });

  it('rejects invalid status', () => {
    const result = route?.options?.validateSearch?.({ status: 'invalid' }) as { status: string };
    expect(result.status).toBe('all');
  });
});

describe('inline validateSearch — scorerDetailRoute', () => {
  const route = findRouteByPath(routeTree as never, '/scorers/$scorerId');

  it('defaults tab to configuration', () => {
    const result = route?.options?.validateSearch?.({}) as { tab: string };
    expect(result.tab).toBe('configuration');
  });

  it('parses valid tab', () => {
    const result = route?.options?.validateSearch?.({ tab: 'versions' }) as { tab: string };
    expect(result.tab).toBe('versions');
  });

  it('rejects invalid tab', () => {
    const result = route?.options?.validateSearch?.({ tab: 'bogus' }) as { tab: string };
    expect(result.tab).toBe('configuration');
  });
});

describe('inline validateSearch — tracesRoute', () => {
  const route = findRouteByPath(routeTree as never, '/traces');

  it('defaults status to all', () => {
    const result = route?.options?.validateSearch?.({}) as { status: string };
    expect(result.status).toBe('all');
  });

  it('parses valid trace status', () => {
    const result = route?.options?.validateSearch?.({ status: 'error' }) as { status: string };
    expect(result.status).toBe('error');
  });

  it('parses search and threadId params', () => {
    const result = route?.options?.validateSearch?.({
      search: 'test',
      threadId: 'th-1',
      entityType: 'agent',
    }) as { search: string; threadId: string; entityType: string };
    expect(result.search).toBe('test');
    expect(result.threadId).toBe('th-1');
    expect(result.entityType).toBe('agent');
  });
});

describe('inline validateSearch — queueDetailRoute', () => {
  const route = findRouteByPath(routeTree as never, '/queues/$queueName');

  it('defaults tab to overview and jobState to all', () => {
    const result = route?.options?.validateSearch?.({}) as { tab: string; jobState: string };
    expect(result.tab).toBe('overview');
    expect(result.jobState).toBe('all');
  });

  it('parses jobs tab', () => {
    const result = route?.options?.validateSearch?.({ tab: 'jobs' }) as { tab: string };
    expect(result.tab).toBe('jobs');
  });

  it('parses failed-archive tab', () => {
    const result = route?.options?.validateSearch?.({ tab: 'failed-archive' }) as { tab: string };
    expect(result.tab).toBe('failed-archive');
  });

  it('defaults invalid tab to overview', () => {
    const result = route?.options?.validateSearch?.({ tab: 'invalid' }) as { tab: string };
    expect(result.tab).toBe('overview');
  });

  it('parses valid jobState', () => {
    const result = route?.options?.validateSearch?.({ jobState: 'failed' }) as { jobState: string };
    expect(result.jobState).toBe('failed');
  });

  it('rejects invalid jobState', () => {
    const result = route?.options?.validateSearch?.({ jobState: 'bogus' }) as { jobState: string };
    expect(result.jobState).toBe('all');
  });
});

describe('validateSearchExperimentCompare — edge cases', () => {
  it('handles NaN string item', () => {
    expect(validateSearchExperimentCompare({ item: 'NaN' }).item).toBeUndefined();
  });

  it('coerces empty string item to 0', () => {
    // Number('') === 0, which is not NaN, so it gets parsed as 0
    expect(validateSearchExperimentCompare({ item: '' }).item).toBe(0);
  });

  it('handles null values gracefully', () => {
    const result = validateSearchExperimentCompare({ a: null, b: undefined, item: null });
    expect(result.a).toBe('');
    expect(result.b).toBe('');
    expect(result.item).toBeUndefined();
  });
});

describe('routeTree — getParentRoute callbacks', () => {
  function collectRoutes(
    route: { options?: { path?: string }; children?: unknown[] },
    acc: Array<{ options?: { path?: string; getParentRoute?: () => unknown } }> = [],
  ) {
    acc.push(route as { options?: { path?: string; getParentRoute?: () => unknown } });
    const children = (route as { children?: unknown[] }).children;
    if (Array.isArray(children)) {
      for (const child of children) collectRoutes(child as typeof route, acc);
    }
    return acc;
  }

  it('all getParentRoute callbacks return a truthy parent', () => {
    const allRoutes = collectRoutes(routeTree as never);
    const routesWithParent = allRoutes.filter((route) => typeof route.options?.getParentRoute === 'function');
    // We expect at least 20 routes with getParentRoute
    expect(routesWithParent.length).toBeGreaterThanOrEqual(20);
    for (const route of routesWithParent) {
      const parent = route.options!.getParentRoute!();
      expect(parent).toBeTruthy();
    }
  });
});

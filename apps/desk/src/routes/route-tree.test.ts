import { describe, expect, it } from 'vitest';

import { routeTree, validateSearchDocuments, validateSearchSearch } from './route-tree';

describe('validateSearchSearch', () => {
  it('returns all undefined for empty input', () => {
    expect(validateSearchSearch({})).toEqual({
      q: undefined,
      expanded: undefined,
      doc: undefined,
      chunk: undefined,
    });
  });

  it('parses string q param', () => {
    expect(validateSearchSearch({ q: 'hello world' }).q).toBe('hello world');
  });

  it('rejects non-string q', () => {
    expect(validateSearchSearch({ q: 123 }).q).toBeUndefined();
  });

  it('parses expanded as boolean true', () => {
    expect(validateSearchSearch({ expanded: true }).expanded).toBe(true);
  });

  it('parses expanded as string "true"', () => {
    expect(validateSearchSearch({ expanded: 'true' }).expanded).toBe(true);
  });

  it('rejects expanded as false', () => {
    expect(validateSearchSearch({ expanded: false }).expanded).toBeUndefined();
  });

  it('rejects expanded as arbitrary string', () => {
    expect(validateSearchSearch({ expanded: 'yes' }).expanded).toBeUndefined();
  });

  it('parses string doc param', () => {
    expect(validateSearchSearch({ doc: 'doc-123' }).doc).toBe('doc-123');
  });

  it('parses numeric chunk from string', () => {
    expect(validateSearchSearch({ chunk: '5' }).chunk).toBe(5);
  });

  it('parses chunk "0"', () => {
    expect(validateSearchSearch({ chunk: '0' }).chunk).toBe(0);
  });

  it('rejects non-numeric chunk string', () => {
    expect(validateSearchSearch({ chunk: 'abc' }).chunk).toBeUndefined();
  });

  it('accepts chunk as actual number (from programmatic navigate)', () => {
    expect(validateSearchSearch({ chunk: 5 }).chunk).toBe(5);
  });

  it('parses all params together', () => {
    const result = validateSearchSearch({ q: 'test', expanded: 'true', doc: 'doc-1', chunk: '3' });
    expect(result).toEqual({ q: 'test', expanded: true, doc: 'doc-1', chunk: 3 });
  });
});

describe('validateSearchDocuments', () => {
  it('returns all undefined for empty input', () => {
    expect(validateSearchDocuments({})).toEqual({
      source: undefined,
      type: undefined,
      filter: undefined,
      doc: undefined,
    });
  });

  it('parses string source param', () => {
    expect(validateSearchDocuments({ source: 'src-123' }).source).toBe('src-123');
  });

  it('parses string type param', () => {
    expect(validateSearchDocuments({ type: 'PDF' }).type).toBe('PDF');
  });

  it('parses string filter param', () => {
    expect(validateSearchDocuments({ filter: 'invoice' }).filter).toBe('invoice');
  });

  it('parses string doc param', () => {
    expect(validateSearchDocuments({ doc: 'doc-456' }).doc).toBe('doc-456');
  });

  it('rejects non-string values', () => {
    const result = validateSearchDocuments({ source: 42, type: null, filter: undefined, doc: true });
    expect(result).toEqual({ source: undefined, type: undefined, filter: undefined, doc: undefined });
  });

  it('parses all params together', () => {
    const result = validateSearchDocuments({ source: 'src-1', type: 'Word', filter: 'readme', doc: 'doc-1' });
    expect(result).toEqual({ source: 'src-1', type: 'Word', filter: 'readme', doc: 'doc-1' });
  });
});

describe('validateSearchSearch — edge cases', () => {
  it('rejects null q value', () => {
    expect(validateSearchSearch({ q: null }).q).toBeUndefined();
  });

  it('rejects expanded as number', () => {
    expect(validateSearchSearch({ expanded: 1 }).expanded).toBeUndefined();
  });

  it('rejects doc as number', () => {
    expect(validateSearchSearch({ doc: 42 }).doc).toBeUndefined();
  });

  it('handles negative numeric chunk', () => {
    expect(validateSearchSearch({ chunk: '-1' }).chunk).toBe(-1);
  });

  it('rejects chunk as boolean', () => {
    expect(validateSearchSearch({ chunk: true }).chunk).toBeUndefined();
  });
});

describe('validateSearchDocuments — edge cases', () => {
  it('handles empty string values', () => {
    const result = validateSearchDocuments({ source: '', type: '', filter: '', doc: '' });
    expect(result).toEqual({ source: '', type: '', filter: '', doc: '' });
  });

  it('rejects array values', () => {
    const result = validateSearchDocuments({ source: ['a'], type: ['b'] });
    expect(result.source).toBeUndefined();
    expect(result.type).toBeUndefined();
  });
});

describe('routeTree', () => {
  it('exports a valid route tree', () => {
    expect(routeTree).toBeTruthy();
    // The route tree should have children (login + authenticated)
    expect((routeTree as { children?: unknown[] }).children).toBeTruthy();
  });

  it('all getParentRoute callbacks return a truthy parent', () => {
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

    const allRoutes = collectRoutes(routeTree as unknown as Parameters<typeof collectRoutes>[0]);
    const routesWithParent = allRoutes.filter((route) => typeof route.options?.getParentRoute === 'function');
    // We expect at least 5 routes with getParentRoute in desk
    expect(routesWithParent.length).toBeGreaterThanOrEqual(5);
    for (const route of routesWithParent) {
      const parent = route.options?.getParentRoute?.();
      expect(parent).toBeTruthy();
    }
  });
});

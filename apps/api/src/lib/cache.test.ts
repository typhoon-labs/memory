import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardCache } from './cache';

describe('MemoryCache', () => {
  beforeEach(() => {
    dashboardCache.invalidate('');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined on cache miss', () => {
    expect(dashboardCache.get('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    dashboardCache.set('key1', { hello: 'world' });
    expect(dashboardCache.get('key1')).toEqual({ hello: 'world' });
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();
    dashboardCache.set('key2', 'value', 1000);

    expect(dashboardCache.get('key2')).toBe('value');

    vi.advanceTimersByTime(1001);
    expect(dashboardCache.get('key2')).toBeUndefined();
  });

  it('invalidates by prefix', () => {
    dashboardCache.set('dashboard:scores:a', 1);
    dashboardCache.set('dashboard:scores:b', 2);
    dashboardCache.set('dashboard:threads:c', 3);

    dashboardCache.invalidate('dashboard:scores');

    expect(dashboardCache.get('dashboard:scores:a')).toBeUndefined();
    expect(dashboardCache.get('dashboard:scores:b')).toBeUndefined();
    expect(dashboardCache.get('dashboard:threads:c')).toBe(3);
  });

  it('tracks size', () => {
    expect(dashboardCache.size).toBe(0);
    dashboardCache.set('a', 1);
    dashboardCache.set('b', 2);
    expect(dashboardCache.size).toBe(2);
  });

  it('overwrites existing key', () => {
    dashboardCache.set('key', 'old');
    dashboardCache.set('key', 'new');
    expect(dashboardCache.get('key')).toBe('new');
    expect(dashboardCache.size).toBe(1);
  });
});

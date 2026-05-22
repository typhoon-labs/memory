import { afterEach, describe, expect, it } from 'vitest';

import { clearSourceRegistry, getSource, listSources, registerSource } from './source-registry';

afterEach(() => {
  clearSourceRegistry();
});

describe('registerSource', () => {
  it('registers and retrieves a source', () => {
    registerSource({ name: 'my-s3', sourceType: 's3', credentials: { accessKey: 'ak' }, config: { bucket: 'test' } });
    const source = getSource('my-s3');
    expect(source).toBeDefined();
    expect(source?.name).toBe('my-s3');
    expect(source?.sourceType).toBe('s3');
    expect(source?.credentials).toEqual({ accessKey: 'ak' });
    expect(source?.config).toEqual({ bucket: 'test' });
  });

  it('defaults config to empty object when omitted', () => {
    registerSource({ name: 'no-config', sourceType: 's3', credentials: {} });
    const source = getSource('no-config');
    expect(source?.config).toEqual({});
  });

  it('throws on empty name', () => {
    expect(() => registerSource({ name: '', sourceType: 's3', credentials: {} })).toThrow('Source name is required');
  });

  it('throws on whitespace-only name', () => {
    expect(() => registerSource({ name: '   ', sourceType: 's3', credentials: {} })).toThrow('Source name is required');
  });

  it('throws on empty sourceType', () => {
    expect(() => registerSource({ name: 'test', sourceType: '', credentials: {} })).toThrow(
      'Source sourceType is required',
    );
  });

  it('throws on duplicate name', () => {
    registerSource({ name: 'dup', sourceType: 's3', credentials: {} });
    expect(() => registerSource({ name: 'dup', sourceType: 's3', credentials: {} })).toThrow(
      'Source "dup" is already registered',
    );
  });

  it('trims whitespace from name', () => {
    registerSource({ name: '  padded  ', sourceType: 's3', credentials: {} });
    expect(getSource('padded')).toBeDefined();
    expect(getSource('padded')?.name).toBe('padded');
  });
});

describe('listSources', () => {
  it('returns all registered sources', () => {
    registerSource({ name: 'a', sourceType: 's3', credentials: {} });
    registerSource({ name: 'b', sourceType: 'confluence', credentials: {} });
    const sources = listSources();
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.name)).toContain('a');
    expect(sources.map((s) => s.name)).toContain('b');
  });

  it('returns empty array when no sources registered', () => {
    expect(listSources()).toEqual([]);
  });
});

describe('clearSourceRegistry', () => {
  it('clears all sources', () => {
    registerSource({ name: 'test', sourceType: 's3', credentials: {} });
    expect(listSources()).toHaveLength(1);
    clearSourceRegistry();
    expect(listSources()).toHaveLength(0);
    expect(getSource('test')).toBeUndefined();
  });
});

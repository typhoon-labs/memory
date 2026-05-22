import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearSourceRegistry, registerSource } from './source-registry';
import { clearSyncTargetRegistry, listRegisteredSyncTargets, registerSyncTarget } from './sync-target-registry';

beforeEach(() => {
  registerSource({ name: 'test-s3', sourceType: 's3', credentials: { accessKey: 'key', secretKey: 'secret' } });
});

afterEach(() => {
  clearSyncTargetRegistry();
  clearSourceRegistry();
});

describe('registerSyncTarget', () => {
  it('registers a valid s3 sync target', () => {
    registerSyncTarget({
      name: 'my-target',
      source: 'test-s3',
      sourceType: 's3',
      config: {},
    });
    const targets = listRegisteredSyncTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my-target');
  });

  it('applies config defaults (s3 prefix defaults to empty string)', () => {
    registerSyncTarget({
      name: 'my-target',
      source: 'test-s3',
      sourceType: 's3',
      config: {},
    });
    const targets = listRegisteredSyncTargets();
    expect((targets[0].config as Record<string, unknown>).prefix).toBe('');
  });

  it('applies cronSchedule default', () => {
    registerSyncTarget({
      name: 'my-target',
      source: 'test-s3',
      sourceType: 's3',
      config: {},
    });
    const targets = listRegisteredSyncTargets();
    expect(targets[0].cronSchedule).toBe('0 */6 * * *');
  });

  it('throws on invalid config (missing name)', () => {
    expect(() =>
      registerSyncTarget({
        name: '',
        source: 'test-s3',
        sourceType: 's3',
        config: {},
      }),
    ).toThrow('invalid config');
  });

  it('throws on duplicate name', () => {
    registerSyncTarget({ name: 'dup', source: 'test-s3', sourceType: 's3', config: {} });
    expect(() => registerSyncTarget({ name: 'dup', source: 'test-s3', sourceType: 's3', config: {} })).toThrow(
      'already registered',
    );
  });

  it('throws on unknown source reference', () => {
    expect(() => registerSyncTarget({ name: 'bad-ref', source: 'nonexistent', sourceType: 's3', config: {} })).toThrow(
      'references unknown source',
    );
  });

  it('throws on unknown sourceType', () => {
    expect(() => registerSyncTarget({ name: 'bad-type', source: 'test-s3', sourceType: 'ftp', config: {} })).toThrow(
      'unknown sourceType',
    );
  });

  it('rejects unknown keys in s3 config (strict schema)', () => {
    expect(() =>
      registerSyncTarget({ name: 'bad-key', source: 'test-s3', sourceType: 's3', config: { unknown: 'x' } }),
    ).toThrow('invalid s3 config');
  });
});

describe('listRegisteredSyncTargets', () => {
  it('returns empty when nothing registered', () => {
    expect(listRegisteredSyncTargets()).toEqual([]);
  });
});

describe('clearSyncTargetRegistry', () => {
  it('clears all registered targets', () => {
    registerSyncTarget({ name: 't1', source: 'test-s3', sourceType: 's3', config: {} });
    expect(listRegisteredSyncTargets()).toHaveLength(1);
    clearSyncTargetRegistry();
    expect(listRegisteredSyncTargets()).toHaveLength(0);
  });
});

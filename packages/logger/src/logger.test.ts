import { LogLevel } from '@mastra/core/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppLogger, TyphoonLogger } from './logger';

describe('TyphoonLogger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('level filtering', () => {
    it('debug level logs all levels', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.DEBUG });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('info level suppresses debug', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.INFO });
      logger.debug('d');
      logger.info('i');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledTimes(1);
    });

    it('warn level suppresses debug and info', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.WARN });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('error level suppresses debug, info, and warn', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.ERROR });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('output formatting', () => {
    it('includes logger name in output', () => {
      const logger = new TyphoonLogger({ name: 'my-service', level: LogLevel.INFO });
      logger.info('hello');
      const output = infoSpy.mock.calls[0][0] as string;
      expect(output).toContain('my-service');
    });

    it('includes message in output', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.INFO });
      logger.info('test message');
      const output = infoSpy.mock.calls[0][0] as string;
      expect(output).toContain('test message');
    });

    it('includes context when provided as object', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.INFO });
      logger.info('msg', { key: 'value' });
      const output = infoSpy.mock.calls[0][0] as string;
      expect(output).toContain('key');
      expect(output).toContain('value');
    });

    it('omits context when no args provided', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.INFO });
      logger.info('simple message');
      const output = infoSpy.mock.calls[0][0] as string;
      expect(output).toContain('simple message');
    });
  });

  describe('circular references', () => {
    it('does not throw when context contains circular references', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.DEBUG });
      const a: Record<string, unknown> = { name: 'a' };
      const b: Record<string, unknown> = { name: 'b', parent: a };
      a.child = b;

      expect(() => logger.debug('cyclic', a)).not.toThrow();
      const output = debugSpy.mock.calls[0][0] as string;
      expect(output).toContain('[Circular]');
    });
  });

  describe('context parsing', () => {
    it('wraps multiple args in { args }', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.DEBUG });
      logger.debug('msg', 'a', 'b');
      const output = debugSpy.mock.calls[0][0] as string;
      expect(output).toContain('args');
    });

    it('wraps non-object single arg in { args }', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.DEBUG });
      logger.debug('msg', 'string-arg');
      const output = debugSpy.mock.calls[0][0] as string;
      expect(output).toContain('args');
    });

    it('wraps null arg in { args }', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.DEBUG });
      logger.debug('msg', null);
      const output = debugSpy.mock.calls[0][0] as string;
      expect(output).toContain('args');
    });

    it('wraps array arg in { args }', () => {
      const logger = new TyphoonLogger({ name: 'test', level: LogLevel.DEBUG });
      logger.debug('msg', [1, 2, 3]);
      const output = debugSpy.mock.calls[0][0] as string;
      expect(output).toContain('args');
    });
  });
});

describe('createAppLogger', () => {
  it('returns a TyphoonLogger instance', () => {
    const logger = createAppLogger('test-app');
    expect(logger).toBeInstanceOf(TyphoonLogger);
  });
});

describe('production JSON format', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OTEL_SERVICE_NAME', 'typhoon-api');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('includes service field from OTEL_SERVICE_NAME in JSON output', async () => {
    // Re-import to pick up env stubs (module-level const reads at import time)
    vi.resetModules();
    const { TyphoonLogger: FreshLogger } = await import('./logger');
    const logger = new FreshLogger({ name: 'test', level: LogLevel.INFO });
    logger.info('hello');
    const output = infoSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.service).toBe('typhoon-api');
    expect(parsed.name).toBe('test');
    expect(parsed.msg).toBe('hello');
  });

  it('omits service field when OTEL_SERVICE_NAME is unset', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { TyphoonLogger: FreshLogger } = await import('./logger');
    const logger = new FreshLogger({ name: 'test', level: LogLevel.INFO });
    logger.info('hello');
    const output = infoSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.service).toBeUndefined();
    expect(parsed.msg).toBe('hello');
  });

  it('merges context fields into production JSON output', async () => {
    vi.resetModules();
    const { TyphoonLogger: FreshLogger } = await import('./logger');
    const logger = new FreshLogger({ name: 'test', level: LogLevel.INFO });
    logger.info('msg', { userId: 'u-1', action: 'login' });
    const output = infoSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.userId).toBe('u-1');
    expect(parsed.action).toBe('login');
  });
});

describe('resolveLevel via LOG_LEVEL env', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('respects LOG_LEVEL=debug', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();
    const { createAppLogger: freshCreate } = await import('./logger');
    const logger = freshCreate('test');
    logger.debug('test debug msg');
    expect(debugSpy).toHaveBeenCalled();
  });
});

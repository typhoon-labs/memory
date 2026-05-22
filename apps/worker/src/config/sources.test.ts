import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRegisterSource = vi.hoisted(() => vi.fn());

vi.mock('@typhoon/ingestion', () => ({
  registerSource: mockRegisterSource,
}));

import { registerAllSources } from './sources';

describe('registerAllSources', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockRegisterSource.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('registers the s3-default source', () => {
    registerAllSources();
    expect(mockRegisterSource).toHaveBeenCalledTimes(1);
    expect(mockRegisterSource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 's3-default',
        sourceType: 's3',
      }),
    );
  });

  it('uses env vars for credentials when set', () => {
    process.env.S3_ENDPOINT = 'https://s3.us-west-2.amazonaws.com';
    process.env.S3_REGION = 'us-west-2';
    process.env.S3_ACCESS_KEY = 'my-key';
    process.env.S3_SECRET_KEY = 'my-secret';
    process.env.S3_FORCE_PATH_STYLE = 'false';

    registerAllSources();

    const creds = mockRegisterSource.mock.calls[0][0].credentials;
    expect(creds.endpoint).toBe('https://s3.us-west-2.amazonaws.com');
    expect(creds.region).toBe('us-west-2');
    expect(creds.accessKey).toBe('my-key');
    expect(creds.secretKey).toBe('my-secret');
    expect(creds.forcePathStyle).toBe(false);
  });

  it('passes undefined credentials for direct Bedrock/IRSA mode', () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.S3_FORCE_PATH_STYLE;

    registerAllSources();

    const creds = mockRegisterSource.mock.calls[0][0].credentials;
    expect(creds.endpoint).toBeUndefined();
    expect(creds.accessKey).toBeUndefined();
    expect(creds.secretKey).toBeUndefined();
    expect(creds.forcePathStyle).toBe(true);
  });

  it('defaults region to us-east-1', () => {
    delete process.env.S3_REGION;

    registerAllSources();

    const creds = mockRegisterSource.mock.calls[0][0].credentials;
    expect(creds.region).toBe('us-east-1');
  });

  it('includes bucket in config from S3_BUCKET env var', () => {
    process.env.S3_BUCKET = 'custom-bucket';

    registerAllSources();

    const config = mockRegisterSource.mock.calls[0][0].config;
    expect(config.bucket).toBe('custom-bucket');
  });

  it('defaults bucket to typhoon-documents', () => {
    delete process.env.S3_BUCKET;

    registerAllSources();

    const config = mockRegisterSource.mock.calls[0][0].config;
    expect(config.bucket).toBe('typhoon-documents');
  });

  it('treats empty string S3_ACCESS_KEY as undefined', () => {
    process.env.S3_ACCESS_KEY = '';
    process.env.S3_SECRET_KEY = '';

    registerAllSources();

    const creds = mockRegisterSource.mock.calls[0][0].credentials;
    expect(creds.accessKey).toBeUndefined();
    expect(creds.secretKey).toBeUndefined();
  });
});

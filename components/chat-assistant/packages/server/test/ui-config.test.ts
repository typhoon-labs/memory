/**
 * What the UI is told in /config.json, and the variables it comes from.
 * UI_FORCE_SIGN_IN decides whether the UI asks the issuer for its sign-in
 * form every time (prompt=login, the demo) or reuses a session (production).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';
import { startTestServer, type TestServer } from './support/server.js';

const base = { OIDC_ISSUER: 'http://issuer.invalid', OIDC_JWKS_URL: 'http://issuer.invalid/certs', STUB_DOWNSTREAMS: '1' };

describe('UI_FORCE_SIGN_IN', () => {
  test('on unless set: the demo signs in afresh in every tab', () => {
    expect(loadConfig(base).ui.forceSignIn).toBe(true);
    expect(loadConfig({ ...base, UI_FORCE_SIGN_IN: '' }).ui.forceSignIn).toBe(true);
  });

  test('1 or true turns it on, 0 or false off, in any case', () => {
    for (const on of ['1', 'true', 'TRUE', 'True']) expect(loadConfig({ ...base, UI_FORCE_SIGN_IN: on }).ui.forceSignIn).toBe(true);
    for (const off of ['0', 'false', 'FALSE', 'False']) expect(loadConfig({ ...base, UI_FORCE_SIGN_IN: off }).ui.forceSignIn).toBe(false);
  });

  test('any other value stops the start, rather than be read as one or the other', () => {
    for (const value of ['off', 'no', 'yes', ' 1']) {
      expect(() => loadConfig({ ...base, UI_FORCE_SIGN_IN: value })).toThrow(/UI_FORCE_SIGN_IN is 1, true, 0 or false/);
    }
  });
});

describe('/config.json', () => {
  let byDefault: TestServer;
  let reuse: TestServer;
  beforeAll(async () => {
    [byDefault, reuse] = await Promise.all([startTestServer(), startTestServer({ env: { UI_FORCE_SIGN_IN: 'false' } })]);
  });
  afterAll(async () => {
    await Promise.all([byDefault?.close(), reuse?.close()]);
  });

  const read = async (s: TestServer) => {
    const res = await fetch(`${s.url}/config.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return (await res.json()) as Record<string, unknown>;
  };

  test('carries the sign-in settings, forceSignIn among them, without a token', async () => {
    expect(await read(byDefault)).toEqual({
      oidcIssuer: 'http://test-issuer.invalid/realms/demo',
      oidcClientId: 'chat-ui',
      oidcScope: 'openid profile',
      a2aUrl: '',
      a2aProtocolVersion: '1.0',
      pollIntervalMs: 2000,
      forceSignIn: true,
      appVersion: 'test',
    });
  });

  test('UI_FORCE_SIGN_IN=false: forceSignIn is false, so a session at the issuer is reused', async () => {
    expect(await read(reuse)).toMatchObject({ forceSignIn: false });
  });
});

/**
 * A test issuer for local work when Keycloak is not running. LOCAL TESTING ONLY.
 *
 * - The signing key is generated in memory when the process starts. Nothing is
 *   written to disk and no key or password exists in the repository.
 * - It asks for no password: anyone who can reach it can sign in as any demo
 *   user. It therefore refuses to start in a cluster or with NODE_ENV=production,
 *   and is mounted only when DEV_TEST_ISSUER=1.
 *
 * It implements just enough OpenID Connect for the same client code paths as
 * Keycloak: discovery, JWKS, authorization code with PKCE (S256) for the
 * browser, and the password and client-credentials grants for scripts.
 * The users mirror the realm in docs/contracts.md.
 */
import { createHash, randomBytes } from 'node:crypto';
import express, { Router } from 'express';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type JWTVerifyGetKey } from 'jose';

export const TEST_USERS: Record<string, { roles: string[]; team: string; note?: string }> = {
  developer: { roles: ['developer'], team: 'search' },
  'developer-other-team': { roles: ['developer'], team: 'registration' },
  'incident-manager': { roles: ['incident-manager'], team: 'incident' },
  'platform-engineer': { roles: ['platform-engineer'], team: 'platform' },
  // Not in the realm: exists only to exercise the "approver is not the proposer" rule.
  'two-hats': { roles: ['developer', 'incident-manager'], team: 'search', note: 'test only, not in the realm' },
};
const MACHINE_CLIENTS: Record<string, { roles: string[] }> = { 'alert-automation': { roles: ['alert-automation'] } };
const TOKEN_TTL_SECONDS = 3600;

export interface TestIssuer {
  router: Router;
  keys: JWTVerifyGetKey;
  /** Mints an access token directly (used by tests). */
  accessToken(subject: string, clientId?: string): Promise<string>;
}

function localRedirect(uri: string | undefined): URL | undefined {
  try {
    const u = new URL(uri ?? '');
    return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname) ? u : undefined;
  } catch {
    return undefined;
  }
}

export async function createTestIssuer(options: { issuer: string; audience: string }): Promise<TestIssuer> {
  if (process.env.NODE_ENV === 'production' || process.env.KUBERNETES_SERVICE_HOST) {
    throw new Error('DEV_TEST_ISSUER is for local testing only and will not start in a cluster or in production.');
  }
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const kid = randomBytes(8).toString('hex');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const jwks = { keys: [jwk] };
  const codes = new Map<string, { user: string; clientId: string; redirectUri: string; challenge: string; nonce?: string; at: number }>();

  const sign = (claims: Record<string, unknown>, audience: string) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setIssuer(options.issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
      .setJti(randomBytes(8).toString('hex'))
      .sign(privateKey);

  async function accessToken(subject: string, clientId = 'chat-ui'): Promise<string> {
    const machine = MACHINE_CLIENTS[subject];
    if (machine) {
      const name = `service-account-${subject}`;
      return sign({ sub: name, preferred_username: name, roles: machine.roles, azp: subject }, options.audience);
    }
    const user = TEST_USERS[subject];
    if (!user) throw new Error(`unknown test user ${subject}`);
    return sign({ sub: subject, preferred_username: subject, roles: user.roles, team: user.team, azp: clientId }, options.audience);
  }

  const router = Router();
  router.use(express.urlencoded({ extended: false }));

  router.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer: options.issuer,
      authorization_endpoint: `${options.issuer}/authorize`,
      token_endpoint: `${options.issuer}/token`,
      jwks_uri: `${options.issuer}/jwks`,
      end_session_endpoint: `${options.issuer}/logout`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'password', 'client_credentials'],
      code_challenge_methods_supported: ['S256'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });

  router.get('/jwks', (_req, res) => res.json(jwks));

  router.get('/authorize', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const redirect = localRedirect(q.redirect_uri);
    if (!redirect || q.response_type !== 'code' || q.code_challenge_method !== 'S256' || !q.code_challenge || !q.client_id) {
      res.status(400).type('text/plain').send('The test issuer needs response_type=code, PKCE S256 and a localhost redirect_uri.');
      return;
    }
    if (q.user && TEST_USERS[q.user]) {
      const code = randomBytes(24).toString('base64url');
      codes.set(code, {
        user: q.user,
        clientId: q.client_id,
        redirectUri: q.redirect_uri!,
        challenge: q.code_challenge,
        nonce: q.nonce,
        at: Date.now(),
      });
      redirect.searchParams.set('code', code);
      if (q.state) redirect.searchParams.set('state', q.state);
      res.redirect(302, redirect.toString());
      return;
    }
    const base = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === 'string'));
    const links = Object.entries(TEST_USERS)
      .map(([name, u]) => {
        const params = new URLSearchParams(base);
        params.set('user', name);
        const label = `${name} - ${u.roles.join(', ')} - team ${u.team}${u.note ? ` (${u.note})` : ''}`;
        return `<li><a href="authorize?${params.toString().replace(/&/g, '&amp;')}" data-user="${name}">${label}</a></li>`;
      })
      .join('');
    res
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Test issuer</title>` +
          `<body style="font-family:system-ui;max-width:40rem;margin:3rem auto;line-height:1.6">` +
          `<h1>Test issuer</h1><p><strong>Local testing only.</strong> This stands in for Keycloak. ` +
          `It asks for no password; pick who to sign in as.</p><ul>${links}</ul></body>`,
      );
  });

  router.post('/token', async (req, res) => {
    const b = req.body as Record<string, string | undefined>;
    const fail = (description: string) => res.status(400).json({ error: 'invalid_grant', error_description: description });
    try {
      if (b.grant_type === 'authorization_code') {
        const entry = codes.get(b.code ?? '');
        codes.delete(b.code ?? '');
        const challenge = createHash('sha256').update(b.code_verifier ?? '').digest('base64url');
        if (!entry || Date.now() - entry.at > 60_000) return fail('unknown or expired code');
        if (challenge !== entry.challenge) return fail('PKCE verification failed');
        if (b.redirect_uri !== entry.redirectUri || b.client_id !== entry.clientId) return fail('client or redirect mismatch');
        const idToken = await sign(
          { sub: entry.user, preferred_username: entry.user, ...(entry.nonce ? { nonce: entry.nonce } : {}) },
          entry.clientId,
        );
        return res.json({
          access_token: await accessToken(entry.user, entry.clientId),
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: TOKEN_TTL_SECONDS,
          scope: 'openid profile',
        });
      }
      if (b.grant_type === 'password' && b.username && TEST_USERS[b.username]) {
        return res.json({ access_token: await accessToken(b.username, b.client_id), token_type: 'Bearer', expires_in: TOKEN_TTL_SECONDS });
      }
      if (b.grant_type === 'client_credentials' && b.client_id && MACHINE_CLIENTS[b.client_id]) {
        return res.json({ access_token: await accessToken(b.client_id), token_type: 'Bearer', expires_in: TOKEN_TTL_SECONDS });
      }
      return fail('unsupported grant, user or client');
    } catch (err) {
      return res.status(500).json({ error: 'server_error', error_description: err instanceof Error ? err.message : 'error' });
    }
  });

  router.get('/logout', (req, res) => {
    const redirect = localRedirect(req.query.post_logout_redirect_uri as string | undefined);
    if (redirect) res.redirect(302, redirect.toString());
    else res.type('text/plain').send('Signed out.');
  });

  return { router, keys: createLocalJWKSet(jwks), accessToken };
}

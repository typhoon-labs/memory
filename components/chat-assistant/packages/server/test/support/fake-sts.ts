/**
 * A stand-in for chain-sts: its RFC 8414 metadata and `POST /token`, answering
 * as components/chain-sts does. It records every exchange it is asked for.
 *
 * Issued tokens are unsigned JWTs with the subject's claims, `act` and a new
 * `jti` each time, so the stub downstreams, which read the caller from the
 * token, still know who it is. A subject that is not a JWT gets none of its claims.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { UnsecuredJWT, decodeJwt } from 'jose';

export interface RecordedExchange {
  headers: http.IncomingHttpHeaders;
  form: Record<string, string>;
}

export type StsAnswer =
  /** Issue a token for this long. `expiresIn: false` leaves `expires_in` out, so only the token's `exp` says. */
  | { issue: { lifetimeSeconds?: number; expiresIn?: false } }
  /** An RFC 6749 error answer. */
  | { refuse: { error: string; description: string; status?: number } };

export interface FakeSts {
  metadataUrl: string;
  exchanges: RecordedExchange[];
  /** How often the metadata was read. */
  metadataReads: number;
  /** Every access_token issued, in order. */
  issued: string[];
  answer(next: StsAnswer): void;
  /** What the metadata names as `token_endpoint`; by default this server's `/token`. */
  tokenEndpoint(url?: string): void;
  close(): Promise<void>;
}

export async function startFakeSts(): Promise<FakeSts> {
  let answer: StsAnswer = { issue: {} };
  let endpoint: string | undefined;
  const sts = {
    exchanges: [] as RecordedExchange[],
    metadataReads: 0,
    issued: [] as string[],
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const json = (status: number, body: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
      if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
        sts.metadataReads++;
        return json(200, {
          issuer: base,
          token_endpoint: endpoint ?? `${base}/token`,
          jwks_uri: `${base}/jwks`,
          grant_types_supported: ['urn:ietf:params:oauth:grant-type:token-exchange'],
          token_endpoint_auth_methods_supported: ['none'],
        });
      }
      if (req.method !== 'POST' || req.url !== '/token') return json(404, { error: 'not_found' });

      const form = Object.fromEntries(new URLSearchParams(raw));
      sts.exchanges.push({ headers: req.headers, form });
      if ('refuse' in answer) {
        const { error, description, status } = answer.refuse;
        return json(status ?? 400, { error, error_description: description });
      }
      let subject: Record<string, unknown> = {};
      try {
        subject = decodeJwt(form.subject_token ?? '');
      } catch {
        /* not a JWT: no claims to carry */
      }
      const lifetime = answer.issue.lifetimeSeconds ?? 300;
      const now = Math.floor(Date.now() / 1000);
      const token = new UnsecuredJWT({
        preferred_username: subject.preferred_username,
        roles: subject.roles,
        team: subject.team,
        client_id: 'chat-assistant',
        act: { sub: 'system:serviceaccount:agents:chat-assistant', client_id: 'chat-assistant' },
        jti: `issued-${sts.issued.length + 1}`,
      })
        .setIssuer(base)
        .setSubject(String(subject.sub ?? 'someone'))
        .setAudience(form.audience ?? 'agentgateway')
        .setIssuedAt(now)
        .setExpirationTime(now + lifetime)
        .encode();
      sts.issued.push(token);
      return json(200, {
        access_token: token,
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'Bearer',
        ...(answer.issue.expiresIn === false ? {} : { expires_in: lifetime }),
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return Object.assign(sts, {
    metadataUrl: `${base}/.well-known/oauth-authorization-server`,
    answer(next: StsAnswer) {
      answer = next;
    },
    tokenEndpoint(url?: string) {
      endpoint = url;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
}

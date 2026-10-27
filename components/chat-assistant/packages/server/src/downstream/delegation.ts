/**
 * Delegation: the caller's token is exchanged at chain-sts (RFC 8693, as
 * kagent's STS clients ask) and only the issued token goes downstream. That
 * token stands for the same user, and its `act` claim names chat-assistant,
 * which proves itself with this pod's projected service-account token
 * (audience chain-sts).
 *
 * - The request is a form POST to the metadata's `token_endpoint`, used as
 *   given, with no client authentication: the actor token is the credential.
 * - The actor token file is read again for every exchange, since the kubelet
 *   replaces it before it expires.
 * - Issued tokens are kept per caller token (by its SHA-256) until shortly
 *   before they expire, so the 2-second card poll does not exchange every time
 *   and delivery-mcp's sessions, kept per token, last. Concurrent exchanges
 *   for one caller token are one request.
 * - Nothing falls back to the caller's token. chain-sts's RFC 6749 answer is a
 *   Refusal naming its `error` code; anything else that goes wrong is a
 *   DownstreamError. Either way no downstream request is made.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { decodeJwt } from 'jose';
import { AGENT_CALL_MS } from './a2a-agents.js';
import { DownstreamError, Refusal, type Downstreams } from './types.js';

const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const JWT_TYPE = 'urn:ietf:params:oauth:token-type:jwt';
const TIMEOUT_MS = 10_000;
/** A cached token is reused while it stays valid this long; less, and it is exchanged anew. */
const MARGIN_MS = 30_000;
const MAX_TOKENS = 200;

/**
 * The token to send downstream for the caller: one that stays valid for at
 * least `validForMs` (default: 30 seconds), if chain-sts issues one that long.
 */
export type DownstreamToken = (callerToken: string, validForMs?: number) => Promise<string>;

const target = 'chain-sts';
/** fetch says only "fetch failed"; the cause says why. */
const reason = (err: unknown) =>
  err instanceof Error ? (err.cause instanceof Error ? `${err.message} (${err.cause.message})` : err.message) : String(err);

export function createTokenExchange(options: {
  metadataUrl: string;
  actorTokenFile: string;
  /** The audience asked for: the gateway's, which every downstream route checks. */
  audience: string;
}): DownstreamToken {
  let endpoint: Promise<string> | undefined;
  const issued = new Map<string, { token: string; expiresAt: number }>();
  const pending = new Map<string, Promise<{ token: string; expiresAt: number }>>();

  async function readEndpoint(): Promise<string> {
    let res: Response;
    try {
      res = await fetch(options.metadataUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new DownstreamError(target, `its metadata could not be read: ${reason(err)}`);
    }
    const metadata = (await res.json().catch(() => undefined)) as { token_endpoint?: unknown } | undefined;
    if (!res.ok || typeof metadata?.token_endpoint !== 'string' || !metadata.token_endpoint) {
      throw new DownstreamError(target, `its metadata names no token_endpoint (HTTP ${res.status})`);
    }
    return metadata.token_endpoint;
  }

  function tokenEndpoint(): Promise<string> {
    endpoint ??= readEndpoint().catch((err) => {
      endpoint = undefined;
      throw err;
    });
    return endpoint;
  }

  async function actorToken(): Promise<string> {
    let token: string;
    try {
      token = (await readFile(options.actorTokenFile, 'utf8')).trim();
    } catch (err) {
      const why = (err as NodeJS.ErrnoException).code ?? reason(err);
      throw new DownstreamError(target, `the actor token file ${options.actorTokenFile} could not be read: ${why}`);
    }
    if (!token) throw new DownstreamError(target, `the actor token file ${options.actorTokenFile} is empty`);
    return token;
  }

  async function exchange(subjectToken: string): Promise<{ token: string; expiresAt: number }> {
    const actor = await actorToken();
    const url = await tokenEndpoint();
    const body = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE,
      subject_token: subjectToken,
      subject_token_type: JWT_TYPE,
      actor_token: actor,
      actor_token_type: JWT_TYPE,
      audience: options.audience,
    });
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { accept: 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      // chain-sts may have moved: its metadata is read again for the next exchange.
      endpoint = undefined;
      throw new DownstreamError(target, `the token exchange failed: ${reason(err)}`);
    }
    const answer = (await res.json().catch(() => undefined)) as
      | { access_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown }
      | undefined;
    if (!res.ok) {
      const error = typeof answer?.error === 'string' && answer.error ? answer.error : undefined;
      const description = typeof answer?.error_description === 'string' && answer.error_description ? answer.error_description : 'no reason given';
      // A 5xx (temporarily_unavailable, server_error) says the token could not be checked now: a failure, not a no.
      if (error && res.status < 500) throw new Refusal({ layer: 'gateway', status: res.status, oauthError: error, detail: description });
      throw new DownstreamError(target, `the token exchange failed with HTTP ${res.status}${error ? ` (${error}): ${description}` : ''}`);
    }
    if (typeof answer?.access_token !== 'string' || !answer.access_token) {
      throw new DownstreamError(target, 'the token exchange answered without an access_token');
    }
    return { token: answer.access_token, expiresAt: expiryOf(answer.access_token, answer.expires_in) };
  }

  function remember(key: string, entry: { token: string; expiresAt: number }) {
    const now = Date.now();
    issued.delete(key);
    for (const [k, e] of issued) if (e.expiresAt - MARGIN_MS <= now) issued.delete(k);
    if (issued.size >= MAX_TOKENS) issued.delete(issued.keys().next().value!);
    if (entry.expiresAt - MARGIN_MS > now) issued.set(key, entry);
  }

  return async (callerToken, validForMs = MARGIN_MS) => {
    const key = createHash('sha256').update(callerToken).digest('hex');
    const cached = issued.get(key);
    if (cached && cached.expiresAt - Date.now() >= validForMs) return cached.token;
    let running = pending.get(key);
    if (!running) {
      running = exchange(callerToken)
        .then((entry) => (remember(key, entry), entry))
        .finally(() => pending.delete(key));
      pending.set(key, running);
    }
    // A new token is used even if it does not last `validForMs`: chain-sts issues none that outlives the caller's own.
    return (await running).token;
  };
}

/** When an issued token expires: `expires_in` if chain-sts gave it, else the token's `exp`; unknown counts as now. */
function expiryOf(token: string, expiresIn: unknown): number {
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) return Date.now() + expiresIn * 1000;
  try {
    const { exp } = decodeJwt(token);
    if (typeof exp === 'number') return exp * 1000;
  } catch {
    /* not a JWT: kept for no time at all */
  }
  return Date.now();
}

/**
 * The downstreams, each called with the token chain-sts issues for the caller
 * instead of the caller's own. The one place delegation is wired for
 * delivery-mcp and the agents; the model call takes it in ../chat/agent.ts.
 *
 * An agent goes on using the token it was called with, for its own exchanges
 * and tool calls, until it answers, and chain-sts never issues a token that
 * outlives the one it is given. So an agent is sent a token that lasts as
 * long as an A2A call may.
 */
export function delegated(d: Downstreams, tokenFor: DownstreamToken): Downstreams {
  return {
    delivery: { callTool: async (token, name, args) => d.delivery.callTool(await tokenFor(token), name, args) },
    remediation: { applyAndVerify: async (token, changeId) => d.remediation.applyAndVerify(await tokenFor(token, AGENT_CALL_MS), changeId) },
    comms: { draftStatusUpdate: async (token, incidentId) => d.comms.draftStatusUpdate(await tokenFor(token, AGENT_CALL_MS), incidentId) },
    diagnosis: {
      configured: d.diagnosis.configured,
      diagnose: async (token, question) => d.diagnosis.diagnose(await tokenFor(token, AGENT_CALL_MS), question),
    },
  };
}

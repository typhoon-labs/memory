/**
 * The caller's identity comes from the verified bearer token and from nowhere
 * else: no header, query parameter or body field can name a user, role or team.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface Identity {
  /** `preferred_username`, falling back to `sub` (machine clients). */
  user: string;
  roles: string[];
  team: string | undefined;
  /**
   * The verified token itself, forwarded unchanged on every outbound call, or
   * with delegation exchanged first (downstream/delegation.ts).
   */
  token: string;
}

export type TokenVerifier = (token: string) => Promise<Identity>;

export class AuthError extends Error {}

/**
 * A token that verified and names an agent acting for the caller (claim
 * `act`). Nobody calls this agent on a person's behalf: people sign in to it
 * and the alert calls it, each with their own token. Answered 403.
 */
export class DelegatedTokenError extends AuthError {}

export function identityFromClaims(claims: JWTPayload, token: string): Identity {
  const roles = Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === 'string') : [];
  const user =
    typeof claims.preferred_username === 'string' && claims.preferred_username
      ? claims.preferred_username
      : typeof claims.azp === 'string' && claims.azp
        ? claims.azp
        : String(claims.sub ?? 'unknown');
  return { user, roles, team: typeof claims.team === 'string' ? claims.team : undefined, token };
}

export function createTokenVerifier(options: {
  issuer: string;
  /** The token's `aud` must contain one of these. */
  audiences: string[];
  jwksUrl?: string;
  /** Supplied instead of `jwksUrl` by the in-process test issuer. */
  keys?: JWTVerifyGetKey;
}): TokenVerifier {
  if (!options.audiences.length) throw new Error('createTokenVerifier: name at least one audience');
  const keys = options.keys ?? createRemoteJWKSet(new URL(options.jwksUrl!));
  return async (token) => {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, keys, { issuer: options.issuer, audience: options.audiences }));
    } catch (err) {
      throw new AuthError(err instanceof Error ? err.message : 'token verification failed');
    }
    // Checked after the signature: what an unverified token claims decides nothing.
    if (payload.act !== undefined) {
      throw new DelegatedTokenError('the token names an agent acting for the caller (claim act); chat-assistant takes the caller\'s own token only');
    }
    return identityFromClaims(payload, token);
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    identity?: Identity;
  }
}

/**
 * Rejects any request without a valid bearer token for the configured issuer
 * and one of its audiences (401), and a valid one that carries `act` (403).
 */
export function requireAuth(verify: TokenVerifier): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'unauthorized', layer: 'chat-assistant', message: 'A bearer token is required.' });
      return;
    }
    try {
      req.identity = await verify(token);
      next();
    } catch (err) {
      if (err instanceof DelegatedTokenError) {
        res.status(403).json({ error: 'forbidden', layer: 'chat-assistant', message: `The bearer token was refused: ${err.message}` });
        return;
      }
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      res.status(401).json({
        error: 'unauthorized',
        layer: 'chat-assistant',
        message: `The bearer token was rejected: ${err instanceof Error ? err.message : 'invalid'}`,
      });
    }
  };
}

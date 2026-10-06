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
  /** The verified token itself, forwarded unchanged on every outbound call. */
  token: string;
}

export type TokenVerifier = (token: string) => Promise<Identity>;

export class AuthError extends Error {}

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
  audience: string;
  jwksUrl?: string;
  /** Supplied instead of `jwksUrl` by the in-process test issuer. */
  keys?: JWTVerifyGetKey;
}): TokenVerifier {
  const keys = options.keys ?? createRemoteJWKSet(new URL(options.jwksUrl!));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, { issuer: options.issuer, audience: options.audience });
      return identityFromClaims(payload, token);
    } catch (err) {
      throw new AuthError(err instanceof Error ? err.message : 'token verification failed');
    }
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    identity?: Identity;
  }
}

/** Rejects any request without a valid bearer token for the configured issuer and audience. */
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
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      res.status(401).json({
        error: 'unauthorized',
        layer: 'chat-assistant',
        message: `The bearer token was rejected: ${err instanceof Error ? err.message : 'invalid'}`,
      });
    }
  };
}

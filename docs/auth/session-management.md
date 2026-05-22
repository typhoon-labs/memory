# Session Management

## Overview

Typhoon uses database-backed sessions with a Redis cache layer for fast cookie validation. Sessions are created after a successful OIDC callback and stored as cookies in the browser.

## Session Storage

### Primary: PostgreSQL

Sessions are stored in the `session` table via Drizzle ORM. Better Auth is configured with `storeSessionInDatabase: true`, ensuring that every session has a durable record:

```typescript
session: {
  storeSessionInDatabase: true,
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60, // 5-minute TTL
  },
},
```

### Secondary: Redis Cache

Better Auth's `secondaryStorage` is backed by Redis (via `@better-auth/redis-storage`). This provides a fast cache for session lookups:

- **Purpose:** Avoid hitting PostgreSQL on every request to validate the session cookie.
- **TTL:** 5 minutes (`cookieCache.maxAge`). After expiry, the next request falls through to the database for validation and re-caches the result.
- **Consistency:** If a session is revoked in the database, the Redis cache will serve the stale session for up to 5 minutes. This is an acceptable tradeoff for performance.

```typescript
import { redisStorage } from '@better-auth/redis-storage';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

export const auth = betterAuth({
  secondaryStorage: redisStorage({ client: redis }),
  // ...
});
```

## Session Cookie

After a successful OIDC callback:

1. Better Auth creates a session record in PostgreSQL.
2. A session cookie is set on the response.
3. The cookie contains a signed session token (signed with `AUTH_SECRET`).
4. On subsequent requests, `requireAuth` middleware calls `auth.api.getSession()` which checks the cookie, looks up the session in Redis (then PostgreSQL if cache miss), and returns the user and session data.

## Session ID Generation

Session and user IDs are generated as UUIDs using `crypto.randomUUID()`:

```typescript
advanced: {
  database: {
    generateId: () => crypto.randomUUID(),
  },
},
```

## Environment Variables

| Variable          | Required | Description                                                                                              |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`     | Yes      | Secret key for signing session cookies. Must be a strong random string.                                  |
| `AUTH_URL`        | No       | Base URL for auth endpoints. Default: `http://localhost:5172`                                            |
| `TRUSTED_ORIGINS` | No       | Comma-separated list of allowed origins for CORS. Default: `http://localhost:5173,http://localhost:5174` |
| `REDIS_URL`       | No       | Redis connection URL for session cache. Default: `redis://localhost:6379`                                |

## CORS and Trusted Origins

The `TRUSTED_ORIGINS` environment variable controls which origins can make authenticated requests. This is critical for the desk and admin apps, which run on different ports from the API:

```typescript
trustedOrigins: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim()),
```

In production, set this to the actual domains of the desk and admin apps.

## Key Files

- `apps/api/src/infra/auth.ts` -- session configuration, Redis storage, trusted origins
- `packages/db/src/schema/` -- `session` table schema

# Role-Based Access Control (RBAC)

## Roles

Typhoon defines two roles, declared as constants in `@typhoon/config`:

| Role    | Constant          | Description                                                                   |
| ------- | ----------------- | ----------------------------------------------------------------------------- |
| `admin` | `APP_ROLES.ADMIN` | Full access to all endpoints, including admin-only management operations      |
| `rep`   | `APP_ROLES.REP`   | Default role. Access limited to non-admin endpoints (chat, search, documents) |

New users authenticated via OIDC are assigned a role based on their IdP group membership (see [OIDC Flow](./oidc-flow.md)). The `rep` role is the default when the `admin()` Better Auth plugin is configured with `defaultRole: APP_ROLES.REP`.

## Auth Middleware

### `requireAuth`

Validates the session (cookie or API key) and extracts the user to the Hono request context:

1. Calls `auth.api.getSession()` with the request headers.
2. If no valid session, returns `401 Unauthorized`.
3. On success, sets `user` and `session` on the Hono context via `c.set()`.

Applied to all authenticated routes.

```typescript
export const requireAuth = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('user', session.user);
  c.set('session', session.session);
  await next();
});
```

### `requireAdmin`

Checks that the authenticated user has the `admin` role. Must be applied **after** `requireAuth` (it expects `user` on the context):

1. Reads the user from `c.get('user')`.
2. If user is missing, returns `401 Unauthorized`.
3. If `user.role !== APP_ROLES.ADMIN`, returns `403 Forbidden`.

```typescript
export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get('user');
  if (user.role !== APP_ROLES.ADMIN) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
});
```

## Route-Level Authorization

Auth middleware is applied per-route via the `middleware` array in route registration:

```typescript
registerApiRoute('/v1/admin/reviews', {
  method: 'GET',
  middleware: [requireAuth, requireAdmin],
  handler: async (c) => {
    /* ... */
  },
});
```

### Admin-Only Endpoints

All routes under `/v1/admin/*` require both `requireAuth` and `requireAdmin`:

- `/v1/admin/reviews` -- review management
- `/v1/admin/reviews/:threadId` -- review detail
- `/v1/admin/reviews/:threadId/messages/:messageId/annotate` -- annotations
- `/v1/admin/scorers` -- scorer management
- `/v1/admin/experiments` -- experiment management
- `/v1/admin/datasets` -- dataset management
- `/v1/admin/queues` -- queue monitoring
- `/v1/admin/traces` -- trace browsing
- `/v1/admin/dashboard` -- dashboard statistics

### Auth-Only Endpoints (rep + admin)

Routes that require authentication but not admin role use `requireAuth` alone:

- `/v1/sync-targets` -- sync target management
- `/v1/documents` -- document browsing
- `/v1/search` -- search endpoints
- `/v1/threads` -- chat thread access
- `/v1/feedback` -- feedback submission
- `/v1/metadata/*` -- metadata template/field group endpoints

### Public / API Key Endpoints

- `/v1/chat/widget` -- widget chat (authenticated via API key)
- `/v1/auth/*` -- auth endpoints (sign-in, callback, session)

## Key Files

- `packages/config/src/index.ts` -- `APP_ROLES` constants
- `apps/api/src/middleware/require-auth.ts` -- session validation middleware
- `apps/api/src/middleware/require-admin.ts` -- admin role check middleware
- `apps/api/src/infra/auth.ts` -- Better Auth setup with admin plugin

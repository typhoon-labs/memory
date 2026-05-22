# API Keys

## Overview

API keys provide stateless authentication for the customer-facing widget and external integrations. They are managed through Better Auth's `apiKey` plugin and transmitted via the `X-API-Key` HTTP header.

## Widget Authentication Model

The widget uses API key authentication rather than session cookies:

- **One key per widget deployment** -- each deployed instance of the widget has its own API key.
- The API key is embedded in the widget's configuration at deployment time.
- All widget requests include the key in the `X-API-Key` header.
- No browser-based login flow is required for end customers.

## Key Management

### Creation

API keys are created by authenticated administrators through:

- The admin UI (key management page)
- The Better Auth API endpoints

Only users with the `admin` role can create, list, or revoke API keys.

### Usage

Include the API key in the `X-API-Key` header on each request:

```bash
curl -H "X-API-Key: typhoon_key_abc123..." \
  http://localhost:5172/api/v1/chat/widget
```

The `requireAuth` middleware in Better Auth handles API key validation transparently -- it checks both session cookies and API keys when resolving the session.

### Permissions

API keys can be configured with specific permissions that control which endpoints and operations the key can access. This allows creating keys with minimal required permissions for each widget deployment.

### Rate Limiting

Rate limiting can be configured per API key to prevent abuse. This is managed through the Better Auth `apiKey` plugin configuration.

## Better Auth Integration

The API key plugin is registered alongside the other auth plugins:

```typescript
export const auth = betterAuth({
  plugins: [
    apiKey(),
    admin({ defaultRole: APP_ROLES.REP, adminRoles: [APP_ROLES.ADMIN] }),
    genericOAuth({ config: oidcProviders }),
  ],
});
```

API keys are stored in the `apikey` table (Drizzle schema) and validated on each request through Better Auth's session resolution.

## Key Files

- `apps/api/src/infra/auth.ts` -- `apiKey()` plugin registration
- `packages/db/src/schema/` -- `apikey` table schema

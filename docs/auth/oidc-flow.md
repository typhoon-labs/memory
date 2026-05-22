# OIDC Flow

## Overview

Typhoon uses OpenID Connect (OIDC) for all human user authentication. In development, [Dex](https://dexidp.io/) provides a local OIDC identity provider with static users. In production, any OIDC-compliant provider (Okta, Auth0, Azure AD) can be used.

## Provider Configuration

The OIDC provider is configured via environment variables:

| Variable               | Required | Description                                                                       |
| ---------------------- | -------- | --------------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`      | Yes      | Front-channel URL (browser to IdP). E.g., `http://localhost:5556/dex`             |
| `OIDC_CLIENT_ID`       | Yes      | OAuth client ID registered with the IdP                                           |
| `OIDC_CLIENT_SECRET`   | Yes      | OAuth client secret                                                               |
| `OIDC_BACKCHANNEL_URL` | No       | Server-to-IdP URL for token and userinfo endpoints. Defaults to `OIDC_ISSUER_URL` |

### Back-Channel URL

In development, the API server and Dex run in separate Docker containers. The browser accesses Dex via `localhost:5556` (front-channel), but the API server must reach Dex via the Docker network hostname (back-channel). `OIDC_BACKCHANNEL_URL` allows these to differ:

- **Front-channel** (`OIDC_ISSUER_URL`): Used for browser redirects (`/auth` endpoint)
- **Back-channel** (`OIDC_BACKCHANNEL_URL`): Used for server-side token exchange (`/token`) and user info (`/userinfo`)

In production, both URLs are typically the same public domain.

## Scopes

The OIDC configuration requests the following scopes:

- `openid` -- required for OIDC
- `email` -- user's email address
- `profile` -- user's display name
- `groups` -- IdP group memberships (used for role mapping)

## Group-to-Role Mapping

IdP groups are mapped to Typhoon roles via the `mapProfileToUser` callback in the genericOAuth plugin:

| Environment Variable | Default | Description                                          |
| -------------------- | ------- | ---------------------------------------------------- |
| `ADMIN_ROLES`        | `admin` | Comma-separated IdP groups that grant the admin role |
| `REP_ROLES`          | `rep`   | Comma-separated IdP groups that grant the rep role   |

The mapping is evaluated in priority order: admin groups are checked first. If a user belongs to both an admin and rep group, they receive the admin role. Users not matching any group receive no explicit role (and may be denied access depending on middleware configuration).

## Better Auth Setup

The OIDC flow is implemented using Better Auth's `genericOAuth` plugin:

```typescript
genericOAuth({
  config: [
    {
      providerId: 'oidc',
      clientId,
      clientSecret,
      authorizationUrl: `${issuer}/auth`,
      tokenUrl: `${backchannel}/token`,
      userInfoUrl: `${backchannel}/userinfo`,
      issuer,
      scopes: ['openid', 'email', 'profile', 'groups'],
      mapProfileToUser: (profile) => {
        // Group-to-role mapping logic
      },
    },
  ],
});
```

If `OIDC_ISSUER_URL` is not set, the genericOAuth plugin is not loaded and OIDC endpoints are unavailable.

## Dev Environment (Dex)

Dex is configured via `infra/docker/dex/config.yml` with static users:

| User  | Email              | Password   | Groups  | Typhoon Role |
| ----- | ------------------ | ---------- | ------- | --------- |
| Admin | `admin@typhoon.local` | `password` | `admin` | admin     |
| Rep   | `rep@typhoon.local`   | `password` | `rep`   | rep       |

## Programmatic Authentication (curl)

To authenticate programmatically (e.g., for testing or scripts), follow the full OIDC redirect chain with a cookie jar:

```bash
# 1. Start the OIDC flow, capture state cookie
RESP=$(curl -s -c /tmp/typhoon-cookies -H "Content-Type: application/json" \
  -d '{"provider":"oidc","callbackURL":"http://localhost:5174"}' \
  http://localhost:5172/api/v1/auth/sign-in/social)

# 2. Follow Dex authorization URL
curl -s -L -c /tmp/typhoon-cookies -b /tmp/typhoon-cookies \
  "$(echo "$RESP" | jq -r '.url')" -o /tmp/dex-form.html

# 3. Extract form action, submit credentials
ACTION=$(grep -o 'action="[^"]*"' /tmp/dex-form.html \
  | sed 's/action="//;s/"//;s/&amp;/\&/g' | head -1)
CALLBACK=$(curl -s -b /tmp/typhoon-cookies -c /tmp/typhoon-cookies -X POST \
  "http://localhost:5556${ACTION}" \
  -d "login=admin%40typhoon.local&password=password" \
  -o /dev/null -w "%{redirect_url}")

# 4. Complete callback, get session cookie
curl -s -b /tmp/typhoon-cookies -c /tmp/typhoon-cookies -L "$CALLBACK" -o /dev/null
```

The session cookie is now in `/tmp/typhoon-cookies`. Use `-b /tmp/typhoon-cookies` on subsequent requests.

## Key Files

- `apps/api/src/infra/auth.ts` -- OIDC provider configuration and genericOAuth setup
- `infra/docker/dex/config.yml` -- Dex static user configuration

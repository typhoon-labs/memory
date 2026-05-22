# Dev Credentials

All credentials for the local development environment. These are pre-configured in `.env.example` and the Dex/MinIO Docker containers.

## OIDC Users (Dex)

Typhoon uses SSO-only authentication. In development, the local Dex OIDC provider serves two pre-configured users:

| Email              | Password   | Role  | Access                            |
| ------------------ | ---------- | ----- | --------------------------------- |
| `admin@typhoon.local` | `password` | Admin | Full access: admin dashboard, API |
| `rep@typhoon.local`   | `password` | Rep   | Rep desk, chat, limited API       |

Role mapping is controlled by the `ADMIN_ROLES` and `REP_ROLES` environment variables in `.env`.

## MinIO (S3-Compatible Object Storage)

| Setting        | Value                 |
| -------------- | --------------------- |
| Console URL    | http://localhost:9001 |
| S3 API URL     | http://localhost:9000 |
| Access Key     | `minioadmin`          |
| Secret Key     | `minioadmin`          |
| Default Bucket | `typhoon-documents`      |

Open the MinIO console to browse buckets, upload files, or inspect stored documents.

## Grafana (Observability)

| Setting | Value                 |
| ------- | --------------------- |
| URL     | http://localhost:3000 |
| Login   | Not required          |

The local Grafana LGTM stack is configured for anonymous access. No login is needed to view dashboards, traces, and logs.

## PostgreSQL

| Setting  | Value                                        |
| -------- | -------------------------------------------- |
| Host     | `localhost:5432`                             |
| Database | `typhoon`                                       |
| User     | `typhoon`                                       |
| Password | `typhoon`                                       |
| URL      | `postgresql://typhoon:typhoon@localhost:5432/typhoon` |

## Redis

| Setting | Value                    |
| ------- | ------------------------ |
| URL     | `redis://localhost:6379` |

No authentication is configured for the local Redis instance.

## Bifrost (LLM Gateway)

| Setting | Value                    |
| ------- | ------------------------ |
| URL     | http://localhost:8787/v1 |
| API Key | `changeme`               |

## Browser Login (Admin Dashboard / Rep Desk)

1. Open http://localhost:5174 (admin) or http://localhost:5173 (rep desk)
2. Click **"Sign in with SSO"**
3. Enter `admin@typhoon.local` / `password` (or `rep@typhoon.local` / `password`)
4. Click **Login**
5. You are redirected back, authenticated

## API Key Authentication

API keys are used by the customer widget and external integrations. To create one:

1. Log in to the admin dashboard at http://localhost:5174 as `admin@typhoon.local`
2. Navigate to **Settings > API Keys**
3. Click **Create API Key**
4. Copy the generated key

Use the key in requests via the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key-here" \
  http://localhost:5172/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "how do I reset my password?"}'
```

## Programmatic Authentication (curl)

For scripting and testing, follow the full OIDC redirect chain with a cookie jar:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Start OIDC flow, capture state cookie
RESP=$(curl -s -c /tmp/typhoon-cookies -H "Content-Type: application/json" \
  -d '{"provider":"oidc","callbackURL":"http://localhost:5174"}' \
  http://localhost:5172/api/v1/auth/sign-in/social)

# 2. Follow Dex auth URL
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

echo "Session cookie saved to /tmp/typhoon-cookies"
```

After running this script, use `-b /tmp/typhoon-cookies` on subsequent requests:

```bash
# Example: list sync targets
curl -s -b /tmp/typhoon-cookies http://localhost:5172/api/v1/sync-targets | jq

# Example: search documents
curl -s -b /tmp/typhoon-cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "return policy"}' \
  http://localhost:5172/api/v1/search | jq
```

**Prerequisites for the curl script:**

- `jq` installed (`brew install jq` on macOS, `apt install jq` on Linux)
- API server running at http://localhost:5172
- Dex running at http://localhost:5556

## Summary Table

| Service    | URL / Host            | Username / Key     | Password / Secret |
| ---------- | --------------------- | ------------------ | ----------------- |
| Admin UI   | http://localhost:5174 | `admin@typhoon.local` | `password`        |
| Rep Desk   | http://localhost:5173 | `rep@typhoon.local`   | `password`        |
| MinIO      | http://localhost:9001 | `minioadmin`       | `minioadmin`      |
| Grafana    | http://localhost:3000 | (anonymous)        | (none)            |
| PostgreSQL | `localhost:5432`      | `typhoon`             | `typhoon`            |
| Redis      | `localhost:6379`      | (none)             | (none)            |
| Bifrost    | http://localhost:8787 | (API key)          | `changeme`        |

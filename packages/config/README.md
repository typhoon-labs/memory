# @typhoon/config

Centralized environment validation using Zod schemas. Every package reads configuration through this module to ensure type-safe, validated environment variables.

## Exports

| Export | Description |
|--------|-------------|
| `validateEnv()` | Parse and validate all environment variables |
| `envSchema` | Combined Zod schema for the full environment |
| `databaseSchema` | `DATABASE_URL` validation |
| `redisSchema` | `REDIS_URL` validation |
| `s3Schema` | S3/MinIO endpoint, credentials, bucket config |
| `llmSchema` | LLM gateway URL, API key, model names |
| `embeddingSchema` | Embedding endpoint, model, dimension |
| `logSchema` | `LOG_LEVEL` validation |
| `serverSchema` | `PORT`, `HOST` validation |
| `authSchema` | `AUTH_URL`, `AUTH_SECRET`, `TRUSTED_ORIGINS` |
| `oidcSchema` | OIDC issuer, client ID/secret, backchannel URL |

Type exports: `Env`, `DatabaseEnv`, `RedisEnv`, `S3Env`, `LlmEnv`, `EmbeddingEnv`, `LogEnv`, `ServerEnv`, `AuthEnv`, `OidcEnv`

Also exports shared TypeScript configs: `tsconfig.base.json`, `tsconfig.lib.json`, `tsconfig.app.json`, `biome.json`

## Dependencies

`zod`

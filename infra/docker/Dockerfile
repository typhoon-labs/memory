# =============================================================================
# Typhoon — Multi-target Dockerfile
# Targets: dev, server, frontend (via frontend-build)
# =============================================================================

# ---------------------------------------------------------------------------
# deps: shared dependency installation (layer cache)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

# Copy only files needed for dependency resolution (maximises layer cache)
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/scheduler/package.json apps/scheduler/
COPY apps/desk/package.json apps/desk/
COPY apps/admin/package.json apps/admin/
COPY apps/widget/package.json apps/widget/
COPY packages/agents/package.json packages/agents/
COPY packages/ai/package.json packages/ai/
COPY packages/chat/package.json packages/chat/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/evals/package.json packages/evals/
COPY packages/ingestion/package.json packages/ingestion/
COPY packages/logger/package.json packages/logger/
COPY packages/queue/package.json packages/queue/
COPY packages/storage/package.json packages/storage/
COPY packages/telemetry/package.json packages/telemetry/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY scripts/postinstall.sh scripts/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# dev: hot-reload target (source mounted via volumes at runtime)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.11-alpine AS dev

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Entrypoint syncs dependencies when package.json changes, then runs the CMD
COPY infra/docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint
RUN chmod +x /usr/local/bin/dev-entrypoint
ENTRYPOINT ["dev-entrypoint"]

# ---------------------------------------------------------------------------
# api: production API server
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.11-alpine AS api

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/api/ apps/api/
COPY packages/ packages/

EXPOSE 5172

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO/dev/null http://127.0.0.1:5172/api/v1/auth/ok || exit 1

CMD ["bun", "run", "apps/api/src/index.ts"]

# ---------------------------------------------------------------------------
# worker: BullMQ job consumer
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.11-alpine AS worker

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/worker/ apps/worker/
COPY packages/ packages/

EXPOSE 5170

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO/dev/null http://127.0.0.1:5170/healthz || exit 1

CMD ["bun", "run", "apps/worker/src/index.ts"]

# ---------------------------------------------------------------------------
# scheduler: cron job producer
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.11-alpine AS scheduler

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/scheduler/ apps/scheduler/
COPY packages/ packages/

EXPOSE 5171

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO/dev/null http://127.0.0.1:5171/healthz || exit 1

CMD ["bun", "run", "apps/scheduler/src/index.ts"]

# ---------------------------------------------------------------------------
# frontend-build: compile frontend app with Vite
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.11-alpine AS frontend-build

ARG APP_NAME
RUN test -n "$APP_NAME" || (echo "ERROR: APP_NAME build arg is required" && exit 1)

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock turbo.json tsconfig.json biome.json ./
COPY apps/${APP_NAME}/ apps/${APP_NAME}/
COPY apps/api/ apps/api/
COPY packages/ packages/

WORKDIR /app/apps/${APP_NAME}
RUN bunx vite build

# ---------------------------------------------------------------------------
# frontend: serve built SPA via nginx
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS frontend

ARG APP_NAME

RUN rm /etc/nginx/conf.d/default.conf

COPY infra/docker/nginx/${APP_NAME}.conf /etc/nginx/conf.d/app.conf
COPY --from=frontend-build /app/apps/${APP_NAME}/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO/dev/null http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

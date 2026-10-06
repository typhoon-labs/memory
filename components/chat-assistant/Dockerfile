# chat-assistant: the Mastra chat agent, its A2A endpoint (A2UI v0.9.1) and the
# built Chat UI, in one image. The server serves the UI.

# -- build: UI (Vite) and server (tsc), from the lockfile ---------------------
FROM node:24.10.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/
RUN npm ci --no-audit --no-fund
COPY packages/server/tsconfig.json packages/server/
COPY packages/server/src packages/server/src
COPY packages/ui packages/ui
RUN npm run build -w @chat-assistant/ui && npm run build -w @chat-assistant/server

# -- runtime dependencies only -------------------------------------------------
FROM node:24.10.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/
RUN npm ci --omit=dev --workspace @chat-assistant/server --no-audit --no-fund

# -- runtime -------------------------------------------------------------------
FROM node:24.10.0-bookworm-slim
ARG VERSION=0.1.0
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/package.json package.json
COPY --from=build /app/packages/server/package.json packages/server/package.json
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/ui/dist packages/ui/dist

ENV NODE_ENV=production \
    APP_VERSION=${VERSION} \
    HOST=0.0.0.0 \
    PORT=8080 \
    HOME=/tmp \
    MASTRA_TELEMETRY_DISABLED=1

# Numeric, so Kubernetes can check runAsNonRoot.
USER 10001:10001
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

WORKDIR /app/packages/server
# telemetry.js is loaded first so that HTTP is instrumented before the app starts.
CMD ["node", "--import", "./dist/telemetry.js", "dist/main.js"]

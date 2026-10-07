# Build from components/sample-app:
#   docker build -f web/Dockerfile --build-arg VERSION=1.2.1 -t localhost:5002/web:1.2.1 .

# -- the pages: React, built by Vite from the lockfile -------------------------
FROM node:22-alpine AS ui
WORKDIR /ui
COPY web/ui/package.json web/ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ui/ ./
RUN npm run build

# -- runtime: the server and the built pages; nothing is installed -------------
FROM node:22-alpine

ARG VERSION=1.2.1
ENV NODE_ENV=production APP_VERSION=${VERSION} PORT=8080

WORKDIR /app
COPY package.json ./
COPY lib/ lib/
COPY seed/ seed/
COPY web/src/ web/src/
COPY --from=ui /ui/dist/ web/ui/dist/

USER 1000:1000
EXPOSE 8080
CMD ["node", "web/src/server.js"]

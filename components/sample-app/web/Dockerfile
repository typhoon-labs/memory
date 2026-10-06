# Build from components/sample-app:
#   docker build -f web/Dockerfile --build-arg VERSION=1.0.0 -t localhost:5002/web:1.0.0 .
FROM node:22-alpine

ARG VERSION=1.0.0
ENV NODE_ENV=production APP_VERSION=${VERSION} PORT=8080

WORKDIR /app
COPY package.json ./
COPY lib/ lib/
COPY seed/ seed/
COPY web/src/ web/src/
COPY web/pages/ web/pages/
COPY web/public/ web/public/

USER 1000:1000
EXPOSE 8080
CMD ["node", "web/src/server.js"]

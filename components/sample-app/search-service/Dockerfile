# Build from components/sample-app:
#   docker build -f search-service/Dockerfile --build-arg VERSION=2.1.0 -t localhost:5002/search-service:2.1.0 .
FROM node:22-alpine

# One source tree, two releases. src/ is 2.0.0. The files a later release
# changed are in releases/<VERSION>/ and are copied over src/ here, so the
# behavior of a version is fixed in its image and no setting can change it.
ARG VERSION=2.0.0
ENV NODE_ENV=production APP_VERSION=${VERSION} PORT=8080

WORKDIR /app
COPY package.json ./
COPY lib/ lib/
COPY seed/ seed/
COPY search-service/src/ search-service/src/
COPY search-service/releases/${VERSION}/ search-service/src/

USER 1000:1000
EXPOSE 8080
CMD ["node", "search-service/src/server.js"]

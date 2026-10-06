# Build from components/sample-app:
#   docker build -f registration-service/Dockerfile --build-arg VERSION=1.0.0 -t localhost:5002/registration-service:1.0.0 .
FROM node:22-alpine

ARG VERSION=1.0.0
ENV NODE_ENV=production APP_VERSION=${VERSION} PORT=8080

WORKDIR /app
COPY package.json ./
COPY lib/ lib/
COPY registration-service/src/ registration-service/src/

USER 1000:1000
EXPOSE 8080
CMD ["node", "registration-service/src/server.js"]

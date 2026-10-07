# Build from local/traffic:
#   docker build -t localhost:5002/traffic:1.0.1 .
FROM node:22-alpine
WORKDIR /app
COPY traffic.mjs ./
USER 1000:1000
CMD ["node", "traffic.mjs"]

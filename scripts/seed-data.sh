#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SAMPLES_DIR="$PROJECT_ROOT/fixtures/docs/samples"

S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
S3_BUCKET="${S3_BUCKET:-typhoon-documents}"

echo "=== Seeding Typhoon Dev Environment ==="

# ── Preflight checks ────────────────────────────────────────────────

for ctr in typhoon-api typhoon-postgres typhoon-minio; do
  if ! docker inspect "$ctr" --format '{{.State.Status}}' 2>/dev/null | grep -q running; then
    echo "Error: $ctr is not running. Start infrastructure first: bun run docker:up"
    exit 1
  fi
done

# ── Database seeds (run inside API container where deps resolve) ──
# Symlink node_modules so Bun resolves workspace packages from fixtures/
docker exec typhoon-api ln -sf /app/apps/api/node_modules /app/fixtures/node_modules

echo "Seeding sync targets, documents..."
docker exec typhoon-api bun run /app/fixtures/seed/sync-targets.ts

echo "Seeding metadata field groups, templates..."
docker exec typhoon-api bun run /app/fixtures/seed/metadata.ts

# TODO: threads need real user IDs (created on first OIDC login)
# echo "Seeding threads, messages..."
# docker exec typhoon-api bun run /app/fixtures/seed/threads.ts

echo "Seeding scorer definitions..."
docker exec typhoon-api bun run /app/fixtures/seed/scorers.ts

echo "Seeding datasets, experiments, scores..."
docker exec typhoon-api bun run /app/fixtures/seed/evals.ts

# ── Document seeds ──────────────────────────────────────────────────

GENERATE_SCRIPT="$PROJECT_ROOT/fixtures/docs/generate-samples.ts"

echo "Generating binary fixtures..."
ln -sf "$PROJECT_ROOT/node_modules" "$PROJECT_ROOT/fixtures/docs/node_modules"
bun run "$GENERATE_SCRIPT"
rm -f "$PROJECT_ROOT/fixtures/docs/node_modules"

if [ ! -d "$SAMPLES_DIR" ] || [ -z "$(ls -A "$SAMPLES_DIR")" ]; then
  echo "Error: No sample documents found in $SAMPLES_DIR"
  exit 1
fi

NETWORK="$(docker inspect typhoon-minio --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"

echo "Uploading documents to MinIO (bucket: $S3_BUCKET)..."
docker run --rm \
  --entrypoint /bin/sh \
  --network "$NETWORK" \
  -v "$SAMPLES_DIR:/data:ro" \
  minio/mc:latest \
  -c "
    mc alias set minio http://typhoon-minio:9000 ${S3_ACCESS_KEY} ${S3_SECRET_KEY} --api S3v4 &&
    mc mb --ignore-existing minio/${S3_BUCKET} &&
    mc cp --recursive /data/ minio/${S3_BUCKET}/ &&
    echo '' &&
    echo 'Bucket contents:' &&
    mc ls minio/${S3_BUCKET}/
  "

FILE_COUNT="$(find "$SAMPLES_DIR" -type f | wc -l | tr -d ' ')"

echo ""
echo "=== Seeding complete ==="
echo "  Documents: ${FILE_COUNT} files uploaded to ${S3_BUCKET}"

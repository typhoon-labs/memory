#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$PROJECT_ROOT/fixtures/sample-docs"

S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
S3_BUCKET="${S3_BUCKET:-typhoon-documents}"

echo "=== Seeding Sample Documents ==="

# Generate binary fixtures (DOCX, XLSX, PDF)
echo "Generating binary fixtures..."
bun run "$PROJECT_ROOT/fixtures/generate.ts"

# Verify fixtures directory has files
if [ ! -d "$FIXTURES_DIR" ] || [ -z "$(ls -A "$FIXTURES_DIR")" ]; then
  echo "Error: No sample documents found in $FIXTURES_DIR"
  exit 1
fi

# Verify MinIO container is running
if ! docker inspect typhoon-minio --format '{{.State.Status}}' 2>/dev/null | grep -q running; then
  echo "Error: typhoon-minio container is not running."
  echo "Start infrastructure first: bun run setup"
  exit 1
fi

# Discover the Docker network for MinIO
NETWORK="$(docker inspect typhoon-minio --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"

echo "  Using Docker network: $NETWORK"
echo "  Target bucket: $S3_BUCKET"

# Upload all sample documents in a single container invocation
docker run --rm \
  --entrypoint /bin/sh \
  --network "$NETWORK" \
  -v "$FIXTURES_DIR:/data:ro" \
  minio/mc:latest \
  -c "
    mc alias set minio http://typhoon-minio:9000 ${S3_ACCESS_KEY} ${S3_SECRET_KEY} --api S3v4 &&
    mc mb --ignore-existing minio/${S3_BUCKET} &&
    mc cp --recursive /data/ minio/${S3_BUCKET}/ &&
    echo '' &&
    echo 'Bucket contents:' &&
    mc ls minio/${S3_BUCKET}/
  "

FILE_COUNT="$(find "$FIXTURES_DIR" -type f | wc -l | tr -d ' ')"
echo "=== Done. ${FILE_COUNT} documents seeded to ${S3_BUCKET} ==="
